<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useCountdownsStore, calcRemaining } from '@/stores/countdowns'
import type { CountdownItem, CountdownRemaining, CountdownSortMode } from '@/stores/countdowns'
import { repeatLabel, categoryLabel, filterCountdowns } from '@/composables/countdownCore'
import type { CountdownFilterCriteria, CountdownRepeatType } from '@/composables/countdownCore'
import { useToast } from '@/composables/useToast'
import type { CountdownRepeat, CountdownCategory } from '@/types'
import { COUNTDOWN_CATEGORIES, COUNTDOWN_COLOR_PRESETS, DEFAULT_COUNTDOWN_COLOR } from '@/types'

const store = useCountdownsStore()

// ===== 查询/筛选（查询按钮生效，重置恢复全量）=====
const searchName = ref('')
const searchRepeat = ref<'' | CountdownRepeatType>('')
// 分类筛选走标签页（即时生效）；'' = 全部
const activeCategoryTab = ref('')
const appliedFilters = ref<CountdownFilterCriteria>({})

const hasActiveFilter = computed(() =>
  (appliedFilters.value.name ?? '').trim() !== '' ||
  Boolean(appliedFilters.value.category) ||
  Boolean(appliedFilters.value.repeat)
)

function applySearch(): void {
  appliedFilters.value = {
    name: searchName.value,
    category: activeCategoryTab.value || undefined,
    repeat: searchRepeat.value
  }
}

function selectCategoryTab(category: string): void {
  activeCategoryTab.value = category
  appliedFilters.value = { ...appliedFilters.value, category: category || undefined }
}

function resetSearch(): void {
  searchName.value = ''
  searchRepeat.value = ''
  activeCategoryTab.value = ''
  appliedFilters.value = {}
}

// 列表渲染用筛选后的数据；排序/手动移动基于 filteredItems 的位置
const filteredItems = computed(() => filterCountdowns(store.itemsWithRemaining, appliedFilters.value))

// ===== 分类管理（标签页显示 + 自定义分类 CRUD，偏好存 localStorage）=====
const toast = useToast()

const showCatDialog = ref(false)
const newCatName = ref('')
const renameDrafts = ref<Record<string, string>>({})

function openCatManager(): void {
  renameDrafts.value = Object.fromEntries(store.customCategories.map(c => [c, c]))
  newCatName.value = ''
  showCatDialog.value = true
}

function closeCatManager(): void {
  showCatDialog.value = false
}

function catErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  const messages: Record<string, string> = {
    empty: '分类名称不能为空',
    builtin: '内置分类不可修改',
    duplicate: '分类名称已存在',
    'not-found': '分类不存在',
    'in-use': '该分类下还有倒计时，无法删除'
  }
  toast.warning(messages[result.reason ?? ''] ?? '操作失败')
}

function handleAddCategory(): void {
  const name = newCatName.value.trim()
  if (!name) return
  const result = store.addCustomCategory(name)
  if (result.ok) newCatName.value = ''
  catErrorToast(result)
}

function handleRenameCategory(oldName: string): void {
  const newName = (renameDrafts.value[oldName] ?? '').trim()
  if (!newName || newName === oldName) return
  const result = store.renameCustomCategory(oldName, newName)
  if (result.ok) {
    const next = { ...renameDrafts.value }
    delete next[oldName]
    next[newName] = newName
    renameDrafts.value = next
    // 重命名的正是当前激活的筛选 tab → 同步 activeCategoryTab，避免筛选悬空为空态
    if (activeCategoryTab.value === oldName) {
      selectCategoryTab(newName)
    }
  } else {
    // 改名失败（重名等）→ 还原草稿为原名称（与便签面板 commitCatName 一致）
    renameDrafts.value[oldName] = oldName
  }
  catErrorToast(result)
}

function handleDeleteCategory(category: string): void {
  if (!confirm(`确定要删除分类「${category}」吗？`)) return
  const result = store.deleteCustomCategory(category)
  if (result.ok) {
    const next = { ...renameDrafts.value }
    delete next[category]
    renameDrafts.value = next
    // 删除的正是当前激活的筛选 tab → 回退到「全部」
    if (activeCategoryTab.value === category) {
      selectCategoryTab('')
    }
  }
  catErrorToast(result)
}

// Esc 还原改名草稿为原名称（未保存的修改直接丢弃）
function discardRenameDraft(category: string): void {
  renameDrafts.value[category] = category
}

// 上移/下移：store 移动自定义分类；边界提示（与便签面板 moveCategory 边界处理一致），not-found 走 catErrorToast
function handleMoveCategory(category: string, dir: 'up' | 'down'): void {
  const result = store.moveCustomCategory(category, dir)
  if (result.ok) return
  if (result.reason === 'boundary') {
    toast.warning('已到边界，无法移动')
    return
  }
  catErrorToast(result)
}

// 徽标 class：内置分类用既有配色，自定义分类统一默认灰
function categoryBadgeClass(category: string | null | undefined): string {
  const c = category?.trim() || 'work'
  return (COUNTDOWN_CATEGORIES as readonly string[]).includes(c) ? `cat-${c}` : 'cat-default'
}

// ===== 表单状态机（新增/编辑共用，弹框承载）=====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formDate = ref('')
const formTime = ref('')
const formCategory = ref<CountdownCategory>('work')
const formColor = ref(DEFAULT_COUNTDOWN_COLOR)
const formRepeatType = ref<'once' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'interval'>('once')
const formWeekDays = ref<number[]>([])
const formDayOfMonth = ref(1)
const formIntervalMinutes = ref(45)

const repeatTypeOptions: {
  value: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'interval'
  label: string
}[] = [
  { value: 'once', label: '一次性' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
  { value: 'interval', label: '每隔 N 分钟' }
]

const weekDayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 根据当前规则类型构造 CountdownRepeat；'once' 规范存 null
function buildRepeat(): CountdownRepeat | null {
  switch (formRepeatType.value) {
    case 'once':
      return null
    case 'daily':
      return { type: 'daily' }
    case 'weekly':
      return { type: 'weekly', daysOfWeek: [...formWeekDays.value].sort((a, b) => a - b) }
    case 'monthly':
      return { type: 'monthly', dayOfMonth: formDayOfMonth.value }
    case 'yearly':
      return { type: 'yearly' }
    case 'interval':
      return { type: 'interval', intervalMinutes: formIntervalMinutes.value }
  }
}

function resetRepeatForm(): void {
  formRepeatType.value = 'once'
  formWeekDays.value = []
  formDayOfMonth.value = 1
  formIntervalMinutes.value = 45
}

// 名称必填（trim 非空）+ 日期必填 + 时间必填，叠加规则面板约束 —— 否则保存按钮 disabled
const isFormValid = computed(() => {
  if (!formName.value.trim() || !formDate.value || !formTime.value) return false
  switch (formRepeatType.value) {
    case 'weekly':
      return formWeekDays.value.length > 0
    case 'monthly':
      return formDayOfMonth.value >= 1 && formDayOfMonth.value <= 31
    case 'interval':
      return formIntervalMinutes.value >= 1
    default:
      return true
  }
})

function startAdd(): void {
  editingId.value = null
  formName.value = ''
  formDate.value = ''
  formTime.value = ''
  formCategory.value = 'work'
  formColor.value = DEFAULT_COUNTDOWN_COLOR
  resetRepeatForm()
  showDialog.value = true
}

function startEdit(item: CountdownItem): void {
  editingId.value = item.id
  formName.value = item.name
  // endDateTime 格式 'YYYY-MM-DDTHH:mm'（本地时间无时区后缀），拆分回 date + time
  const [date, time] = item.endDateTime.split('T')
  formDate.value = date ?? ''
  formTime.value = time ?? ''
  formCategory.value = item.category ?? 'work'
  formColor.value = item.color ?? DEFAULT_COUNTDOWN_COLOR

  // 反向映射重复规则：null/absent/'once' → once；旧字符串 'yearly' → yearly；对象 → 类型 + 参数
  resetRepeatForm()
  const rep = item.repeat as CountdownRepeat | string | null | undefined
  if (rep === null || rep === undefined || rep === 'once') {
    formRepeatType.value = 'once'
  } else if (typeof rep === 'string') {
    formRepeatType.value = 'yearly'
  } else {
    switch (rep.type) {
      case 'once':
        formRepeatType.value = 'once'
        break
      case 'daily':
        formRepeatType.value = 'daily'
        break
      case 'weekly':
        formRepeatType.value = 'weekly'
        formWeekDays.value = [...rep.daysOfWeek]
        break
      case 'monthly':
        formRepeatType.value = 'monthly'
        formDayOfMonth.value = rep.dayOfMonth
        break
      case 'yearly':
        formRepeatType.value = 'yearly'
        break
      case 'interval':
        formRepeatType.value = 'interval'
        formIntervalMinutes.value = rep.intervalMinutes
        break
    }
  }
  showDialog.value = true
}

function cancelForm(): void {
  showDialog.value = false
  editingId.value = null
}

async function handleSave(): Promise<void> {
  const name = formName.value.trim()
  if (!name || !formDate.value || !formTime.value) return
  const endDateTime = `${formDate.value}T${formTime.value}`
  const repeat = buildRepeat()
  const category = formCategory.value
  const color = formColor.value
  if (editingId.value) {
    await store.updateCountdown(editingId.value, { name, endDateTime, repeat, category, color })
  } else {
    await store.addCountdown({ name, endDateTime, repeat, category, color })
  }
  cancelForm()
}

async function handleDelete(id: string): Promise<void> {
  if (confirm('确定要删除这个倒计时吗？')) {
    await store.deleteCountdown(id)
  }
}

// 表单实时预览（日期未填时不显示）
const previewRemaining = computed(() => {
  if (!formDate.value) return null
  return calcRemaining(
    `${formDate.value}T${formTime.value || '00:00'}`,
    buildRepeat()
  )
})

// ===== 排序控件 =====
const SORT_MODES: { value: CountdownSortMode; label: string }[] = [
  { value: 'remaining', label: '剩余时间' },
  { value: 'name', label: '名称' },
  { value: 'created', label: '创建时间' },
  { value: 'endTime', label: '结束时间' },
  { value: 'manual', label: '自定义' }
]

const isManual = computed(() => store.sortMode === 'manual')

function onSortChange(event: Event): void {
  store.setSort((event.target as HTMLSelectElement).value as CountdownSortMode)
}

// manual 模式边界：按 filteredItems 位置判断，首行 ▲ 禁用、末行 ▼ 禁用
function canMoveUp(id: string): boolean {
  return filteredItems.value.findIndex(i => i.id === id) > 0
}

function canMoveDown(id: string): boolean {
  const idx = filteredItems.value.findIndex(i => i.id === id)
  return idx >= 0 && idx < filteredItems.value.length - 1
}

// 剩余时间状态 → 样式类（normal/urgent/critical/expired）
function statusClass(status: CountdownRemaining['status']): string {
  return `status-${status}`
}

// ESC 关闭分类管理 / 编辑弹框
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  if (showCatDialog.value) {
    closeCatManager()
  } else if (showDialog.value) {
    cancelForm()
  }
}

// 面板自管理数据加载（WorkbenchView 已加载，这里防御性重载，数据与 IDB 同步）
onMounted(async () => {
  await store.loadCountdowns()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="wb-countdown">
    <!-- 查询卡片（第一行：名称/重复；第二行：查询/重置 靠右） -->
    <div class="cd-search-card">
      <div class="cd-search-fields">
        <input
          v-model="searchName"
          type="text"
          class="form-input search-name"
          placeholder="按名称查询…"
          data-testid="cd-search-name"
          @keyup.enter="applySearch"
        />
        <select v-model="searchRepeat" class="form-input search-select" data-testid="cd-search-repeat">
          <option value="">全部重复</option>
          <option v-for="opt in repeatTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="cd-search-actions">
        <button class="search-btn" data-testid="cd-search-btn" @click="applySearch">查询</button>
        <button class="search-reset-btn" data-testid="cd-search-reset" @click="resetSearch">重置</button>
      </div>
    </div>

    <!-- 操作行：新增提醒 + 分类管理 靠左 -->
    <div class="cd-actionbar">
      <button class="btn-add" data-testid="cd-add-button" @click="startAdd">＋ 新增提醒</button>
      <button class="btn-cat-manage" data-testid="cd-cat-manage" title="分类管理" @click="openCatManager">⚙️ 分类管理</button>
      <span class="toolbar-count" data-testid="cd-toolbar-count">
        <template v-if="hasActiveFilter">筛选出 {{ filteredItems.length }} / {{ store.itemsWithRemaining.length }} 个</template>
        <template v-else>共 {{ store.itemsWithRemaining.length }} 个倒计时</template>
      </span>
    </div>

    <!-- 分类标签页（即时过滤） -->
    <div class="cd-cat-tabs">
      <button
        class="cd-cat-tab"
        :class="{ active: activeCategoryTab === '' }"
        data-testid="cd-cat-all"
        @click="selectCategoryTab('')"
      >全部</button>
      <button
        v-for="c in store.tabCategories"
        :key="c"
        class="cd-cat-tab"
        :class="{ active: activeCategoryTab === c }"
        :data-testid="'cd-cat-' + c"
        @click="selectCategoryTab(c)"
      >{{ categoryLabel(c) }}</button>
    </div>

    <!-- 排序控件 -->
    <div class="cd-sortbar">
      <select
        class="form-input sort-select"
        data-testid="cd-sort-select"
        :value="store.sortMode"
        @change="onSortChange"
      >
        <option v-for="m in SORT_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
      <button
        v-if="!isManual"
        class="sort-dir-btn"
        data-testid="cd-sort-dir"
        @click="store.toggleDirection()"
      >
        {{ store.sortDirection === 'asc' ? '↑ 升序' : '↓ 降序' }}
      </button>
      <span v-if="isManual" class="sort-hint">点击 ▲▼ 箭头调整顺序</span>
    </div>

    <!-- 空态 / 卡片墙 -->
    <div v-if="store.itemsWithRemaining.length === 0" class="empty-state empty-invite" data-testid="cd-empty" @click="startAdd">
      ＋ 新增第一个提醒
    </div>

    <div v-else-if="filteredItems.length === 0" class="empty-state filter-empty" data-testid="cd-filter-empty">
      <span>没有符合查询条件的提醒</span>
      <button class="btn-cancel" @click="resetSearch">重置查询</button>
    </div>

    <div v-else class="cd-grid">
      <div
        v-for="item in filteredItems"
        :key="item.id"
        class="cd-card"
        data-testid="cd-item"
        :style="{ '--cd-color': item.color ?? DEFAULT_COUNTDOWN_COLOR }"
        role="button"
        tabindex="0"
        @click="startEdit(item)"
        @keyup.enter="startEdit(item)"
      >
        <div class="cd-card-head">
          <div class="cd-title">
            <span class="cd-name">{{ item.name }}</span>
            <span v-if="repeatLabel(item.repeat) !== '一次性'" class="repeat-badge">{{ repeatLabel(item.repeat) }}</span>
          </div>
          <span class="cat-badge" :class="categoryBadgeClass(item.category)">{{ categoryLabel(item.category) }}</span>
        </div>

        <div class="cd-remaining" :class="statusClass(item.remaining.status)">
          <span class="cd-remaining-label">{{ item.remaining.isExpired ? '已过期' : '剩余' }}</span>
          <span class="cd-remaining-value">{{ item.remaining.label }}</span>
        </div>

        <div class="cd-meta">
          <span class="cd-time">{{ item.remaining.nextTime }}</span>
          <label class="front-toggle" :title="item.showOnDisplay === false ? '前台隐藏' : '前台显示'" @click.stop>
            <input
              type="checkbox"
              :checked="item.showOnDisplay !== false"
              @change="store.setShowOnDisplay(item.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>前台显示</span>
          </label>
        </div>

        <div class="cd-actions" @click.stop>
          <div v-if="isManual" class="move-btns">
            <button
              class="btn-move"
              :disabled="!canMoveUp(item.id)"
              title="上移"
              @click="store.moveCountdown(item.id, 'up')"
            >▲</button>
            <button
              class="btn-move"
              :disabled="!canMoveDown(item.id)"
              title="下移"
              @click="store.moveCountdown(item.id, 'down')"
            >▼</button>
          </div>
          <button class="btn-edit" @click="startEdit(item)">编辑</button>
          <button class="btn-delete" @click="handleDelete(item.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹框 -->
    <div v-if="showDialog" class="dialog-overlay" @click.self="cancelForm">
      <div class="dialog" data-testid="cd-dialog">
        <div class="dialog-header">
          <h3>{{ editingId ? '编辑倒计时' : '新增倒计时' }}</h3>
          <button class="close-btn" @click="cancelForm">✕</button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSave">
          <div class="form-group">
            <label>名称 *</label>
            <input
              v-model="formName"
              type="text"
              class="form-input"
              placeholder="例如：期末考试"
              data-testid="cd-name-input"
            />
          </div>

          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">日期 *</label>
              <input v-model="formDate" type="date" class="form-input field-date" data-testid="cd-date-input" />
            </div>
            <div class="field">
              <label class="field-label">时间 *</label>
              <input v-model="formTime" type="time" class="form-input field-time" data-testid="cd-time-input" />
            </div>
            <div class="field">
              <label class="field-label">分类</label>
              <select v-model="formCategory" class="form-input field-cat" data-testid="cd-category">
                <option v-for="c in store.allCategories" :key="c" :value="c">{{ categoryLabel(c) }}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>重复</label>
            <select v-model="formRepeatType" class="form-input" data-testid="cd-repeat-type">
              <option v-for="opt in repeatTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <div v-if="formRepeatType === 'weekly'" class="weekday-grid">
              <label
                v-for="(label, i) in weekDayLabels"
                :key="i + 1"
                class="weekday-check"
                :class="{ active: formWeekDays.includes(i + 1) }"
              >
                <input
                  v-model="formWeekDays"
                  type="checkbox"
                  :value="i + 1"
                  :data-testid="'cd-week-' + (i + 1)"
                />
                <span>{{ label }}</span>
              </label>
              <button
                type="button"
                class="workdays-btn"
                data-testid="cd-workdays-btn"
                @click="formWeekDays = [1, 2, 3, 4, 5]"
              >工作日（周一~五）</button>
            </div>
            <div v-if="formRepeatType === 'monthly'" class="rule-panel">
              <label class="panel-label">每月</label>
              <input
                v-model.number="formDayOfMonth"
                type="number"
                min="1"
                max="31"
                class="form-input month-day-input"
                data-testid="cd-month-day"
              />
              <label class="panel-label">日</label>
            </div>
            <div v-if="formRepeatType === 'interval'" class="rule-panel">
              <label class="panel-label">每隔</label>
              <input
                v-model.number="formIntervalMinutes"
                type="number"
                min="1"
                class="form-input interval-min-input"
                data-testid="cd-interval-min"
              />
              <label class="panel-label">分钟</label>
            </div>
          </div>

          <div class="form-group">
            <label>卡片颜色</label>
            <div class="color-picker">
              <button
                v-for="(color, i) in COUNTDOWN_COLOR_PRESETS"
                :key="color"
                type="button"
                class="color-option"
                :class="{ active: formColor.toLowerCase() === color }"
                :style="{ '--swatch': color }"
                :data-testid="'cd-color-preset-' + (i + 1)"
                :title="color"
                @click="formColor = color"
              ></button>
              <label class="color-custom" title="自定义颜色">
                <input v-model="formColor" type="color" class="color-input" data-testid="cd-color-input" />
                <span class="color-custom-value">{{ formColor }}</span>
              </label>
              <button type="button" class="color-reset" @click="formColor = DEFAULT_COUNTDOWN_COLOR">恢复默认</button>
            </div>
          </div>

          <!-- 实时预览 -->
          <div v-if="previewRemaining" class="preview-row">
            <span class="preview-label">实时预览：</span>
            <span class="preview-value" :class="statusClass(previewRemaining.status)">
              {{ previewRemaining.label }}
            </span>
            <span class="preview-time">{{ previewRemaining.nextTime }}</span>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-cancel" data-testid="cd-cancel-button" @click="cancelForm">
              取消
            </button>
            <button type="submit" class="btn-save" :disabled="!isFormValid" data-testid="cd-save-button">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 分类管理弹框（标签页显示 + 自定义分类 CRUD） -->
    <div v-if="showCatDialog" class="dialog-overlay" @click.self="closeCatManager">
      <div class="dialog catmgr-dialog" data-testid="cd-cat-dialog">
        <div class="dialog-header">
          <h3>分类管理</h3>
          <button class="close-btn" @click="closeCatManager">✕</button>
        </div>
        <div class="dialog-body">
          <div class="catmgr-section">
            <div class="catmgr-section-title">标签页显示</div>
            <p class="catmgr-hint">勾选的分类会显示在面板上方的筛选标签页中</p>
            <div class="catmgr-tab-list">
              <label v-for="c in store.allCategories" :key="c" class="catmgr-tab-row">
                <input
                  type="checkbox"
                  :checked="store.tabCategories.includes(c)"
                  @change="store.setTabCategory(c, ($event.target as HTMLInputElement).checked)"
                />
                <span>{{ categoryLabel(c) }}</span>
              </label>
            </div>
          </div>

          <div class="catmgr-section">
            <div class="catmgr-section-title">自定义分类</div>
            <p v-if="store.customCategories.length === 0" class="catmgr-hint">暂无自定义分类，可在下方添加</p>
            <div v-for="c in store.customCategories" :key="c" class="catmgr-custom-row">
              <input
                v-model="renameDrafts[c]"
                class="form-input catmgr-rename-input"
                :data-testid="`cd-cat-rename-input-${c}`"
                placeholder="分类名称"
                @change="handleRenameCategory(c)"
                @keyup.enter="handleRenameCategory(c)"
                @keydown.esc.stop="discardRenameDraft(c)"
              />
              <div class="catmgr-row-actions">
                <button class="catmgr-mini-btn" :data-testid="`cd-cat-up-${c}`" @click="handleMoveCategory(c, 'up')">↑ 上移</button>
                <button class="catmgr-mini-btn" :data-testid="`cd-cat-down-${c}`" @click="handleMoveCategory(c, 'down')">↓ 下移</button>
                <button class="catmgr-mini-btn danger" :data-testid="`cd-cat-del-${c}`" @click="handleDeleteCategory(c)">删除</button>
              </div>
            </div>
            <div class="catmgr-add-row">
              <input
                v-model="newCatName"
                class="form-input catmgr-add-input"
                data-testid="cd-cat-new-input"
                placeholder="新分类名称"
                @keyup.enter="handleAddCategory"
              />
              <button
                class="btn-save catmgr-add-btn"
                :disabled="!newCatName.trim()"
                data-testid="cd-cat-add-btn"
                @click="handleAddCategory"
              >添加</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-countdown {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 查询卡片（第一行字段 + 第二行按钮靠右） ===== */
.cd-search-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.cd-search-fields {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cd-search-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.search-name {
  flex: 1;
  min-width: 140px;
}

.search-select {
  width: 130px;
  flex-shrink: 0;
}

.search-btn {
  padding: 9px 16px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.search-btn:hover {
  background: var(--accent-hover, var(--color-primary-hover));
}

.search-reset-btn {
  padding: 9px 14px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.search-reset-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* ===== 操作行（新增提醒 + 分类管理 靠左，数量靠右） ===== */
.cd-actionbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.cd-actionbar .toolbar-count {
  margin-left: auto;
}

.toolbar-count {
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.btn-add {
  padding: 10px 16px;
  background-color: var(--accent-color, var(--color-primary));
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-add:hover {
  background-color: var(--accent-hover, var(--color-primary-hover));
}

.btn-cat-manage {
  padding: 10px 16px;
  font-size: 14px;
  border-radius: var(--radius-md, 8px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cat-manage:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* ===== 排序栏 ===== */
.cd-sortbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.sort-select {
  width: 150px;
}

.sort-dir-btn {
  padding: 8px 14px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.sort-dir-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.sort-hint {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

/* ===== 卡片墙 ===== */
.cd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.cd-card {
  --cd-color: #3b82f6;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  background-color: var(--bg-card, var(--color-bg-card));
  background-image: linear-gradient(135deg, color-mix(in srgb, var(--cd-color) 8%, transparent), transparent 55%);
  border: 1px solid var(--border-color, var(--color-border));
  border-left: 4px solid var(--cd-color);
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: transform var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease),
    border-color var(--transition-fast, 0.15s ease);
}

.cd-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
  border-color: color-mix(in srgb, var(--cd-color) 45%, var(--border-color, #e2e8f0));
}

.cd-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.cd-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.cd-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repeat-badge {
  flex-shrink: 0;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  color: var(--accent-color, var(--color-primary));
  border: 1px solid var(--accent-color, var(--color-primary));
  opacity: 0.85;
}

/* 分类徽章：工作=蓝 / 生活=绿 / 学习=紫 */
.cat-badge {
  flex-shrink: 0;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
  opacity: 0.85;
}

.cat-work {
  color: #3b82f6;
  border: 1px solid #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.cat-life {
  color: #22c55e;
  border: 1px solid #22c55e;
  background: rgba(34, 197, 94, 0.12);
}

.cat-study {
  color: #a855f7;
  border: 1px solid #a855f7;
  background: rgba(168, 85, 247, 0.12);
}

.cat-exercise {
  color: #f97316;
  border: 1px solid #f97316;
  background: rgba(249, 115, 22, 0.12);
}

.cat-diet {
  color: #f59e0b;
  border: 1px solid #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.cat-sleep {
  color: #06b6d4;
  border: 1px solid #06b6d4;
  background: rgba(6, 182, 212, 0.12);
}

/* 自定义分类徽标：统一默认灰 */
.cat-default {
  color: #6b7280;
  border: 1px solid #6b7280;
  background: rgba(107, 114, 128, 0.12);
}

/* 剩余时间主角（状态色） */
.cd-remaining {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-shrink: 0;
  font-weight: 700;
}

.cd-remaining-label {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.65;
}

.cd-remaining-value {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  line-height: 1.15;
}

/* 剩余时间状态色 */
.status-normal {
  color: var(--success-color, var(--color-success));
}

.status-urgent {
  color: var(--warning-color, var(--color-warning));
}

.status-critical {
  color: var(--error-color, var(--color-error));
}

.status-expired {
  color: var(--text-muted, var(--color-text-muted));
  font-weight: 500;
}

.cd-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.cd-time {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
}

.front-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.front-toggle input[type='checkbox'] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--accent-color, var(--color-primary));
}

/* ===== 卡片操作 ===== */
.cd-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: auto;
}

.move-btns {
  display: flex;
  gap: 4px;
}

.btn-move {
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 11px;
  border-radius: var(--radius-sm, 6px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  line-height: 1;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-move:hover:not(:disabled) {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.btn-move:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-edit,
.btn-delete {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-edit:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.btn-delete:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
}

/* ===== 分类标签页 ===== */
.cd-cat-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cd-cat-tab {
  padding: 5px 14px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.cd-cat-tab:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.cd-cat-tab.active {
  color: #fff;
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* ===== 分类管理弹框 ===== */
.catmgr-dialog {
  max-width: 440px;
}

.catmgr-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.catmgr-section + .catmgr-section {
  padding-top: 14px;
  border-top: 1px solid var(--border-color, var(--color-border));
}

.catmgr-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.catmgr-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.catmgr-tab-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.catmgr-tab-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
}

.catmgr-tab-row input[type='checkbox'] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--accent-color, var(--color-primary));
}

.catmgr-custom-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
}

.catmgr-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.catmgr-rename-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  font-size: 13px;
}

.catmgr-mini-btn {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: var(--radius-md, 8px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.catmgr-mini-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.catmgr-mini-btn.danger:hover {
  color: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
}

.catmgr-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
}

.catmgr-add-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  font-size: 13px;
}

.catmgr-add-btn {
  padding: 7px 16px;
  font-size: 13px;
}

/* ===== 空态 ===== */
.empty-state {
  text-align: center;
  color: var(--text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.empty-invite {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, var(--color-text-secondary));
  transition: color var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.empty-invite:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.filter-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* ===== 表单（新增/编辑弹框）===== */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.dialog {
  background-color: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px);
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--text-primary, var(--color-text));
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group > label {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.form-row-fields {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.field-date {
  width: 160px;
}

.field-time {
  width: 120px;
}

.field-cat {
  width: 110px;
}

.form-input {
  padding: 9px 12px;
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-primary, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

/* 每周重复选项 */
.weekday-grid {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.weekday-check {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.weekday-check.active {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.weekday-check input[type='checkbox'] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--accent-color, var(--color-primary));
}

.workdays-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.workdays-btn:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* 每月 / 间隔 参数面板 */
.rule-panel {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-label {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  white-space: nowrap;
}

.month-day-input {
  width: 70px;
  flex-shrink: 0;
}

.interval-min-input {
  width: 80px;
  flex-shrink: 0;
}

/* 颜色选择器 */
.color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.color-option {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  background: var(--swatch);
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform var(--transition-fast, 0.15s ease), box-shadow var(--transition-fast, 0.15s ease);
}

.color-option:hover {
  transform: scale(1.15);
}

.color-option.active {
  box-shadow: 0 0 0 2px var(--bg-card, #ffffff), 0 0 0 4px var(--swatch);
}

.color-custom {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-input {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  background: none;
  cursor: pointer;
}

.color-custom-value {
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.color-reset {
  padding: 5px 10px;
  font-size: 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-full, 999px);
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.color-reset:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* 实时预览 */
.preview-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border-radius: var(--radius-md, 8px);
  flex-wrap: wrap;
}

.preview-label {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.preview-value {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.preview-time {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-save {
  padding: 9px 18px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-save:hover:not(:disabled) {
  background: var(--accent-hover, var(--color-primary-hover));
}

.btn-save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-cancel {
  padding: 9px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--hover-bg, var(--color-bg-active));
}

/* ===== 暗色模式覆盖 ===== */
:root.dark .cd-search {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .cd-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .empty-state {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .dialog {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .dialog-header {
  background-color: var(--bg-secondary, #1f2937);
}

/* 禁用态按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
:root.dark .btn-save:disabled {
  background-color: var(--input-bg, #374151);
  color: var(--text-muted, #9ca3af);
}

:root.dark .form-input,
:root.dark select.form-input,
:root.dark input.form-input {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .weekday-check,
:root.dark .workdays-btn,
:root.dark .color-reset {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .weekday-check.active {
  color: #60a5fa;
  border-color: #60a5fa;
}

:root.dark .cat-work {
  color: #60a5fa;
  border-color: #3b82f6;
}

:root.dark .cat-life {
  color: #4ade80;
  border-color: #22c55e;
}

:root.dark .cat-study {
  color: #c084fc;
  border-color: #a855f7;
}

:root.dark .cat-exercise {
  color: #fdba74;
  border-color: #fb923c;
  background: rgba(249, 115, 22, 0.18);
}

:root.dark .cat-diet {
  color: #fcd34d;
  border-color: #fbbf24;
  background: rgba(245, 158, 11, 0.18);
}

:root.dark .cat-sleep {
  color: #67e8f9;
  border-color: #22d3ee;
  background: rgba(6, 182, 212, 0.18);
}

:root.dark .sort-dir-btn,
:root.dark .btn-cancel,
:root.dark .btn-edit,
:root.dark .btn-delete,
:root.dark .btn-move {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .status-normal {
  color: #4ade80;
}

:root.dark .status-urgent {
  color: #fbbf24;
}

:root.dark .status-critical {
  color: #f87171;
}

:root.dark .cat-default {
  color: #9ca3af;
  border-color: #6b7280;
  background: rgba(107, 114, 128, 0.15);
}

:root.dark .cd-cat-tab,
:root.dark .btn-cat-manage,
:root.dark .catmgr-tab-row,
:root.dark .catmgr-mini-btn {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}
</style>
