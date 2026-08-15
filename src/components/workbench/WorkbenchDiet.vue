<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { calcDailyAttainment } from '@/composables/healthCore'
import { localToday } from '@/composables/todoCore'
import { MEAL_TYPES, type MealType } from '@/types'
import PanelPager from './PanelPager.vue'
import { usePanelPaging } from '@/composables/usePanelPaging'
import WorkbenchHealthReminders from './WorkbenchHealthReminders.vue'

const store = useWorkbenchHealthStore()

// ===== 顶部目标卡 =====
const todayStr = localToday()

// 达标率/每日计算禁止在组件内重算，必须调 healthCore 纯函数
const targetView = computed<{ label: string; current: number; target: number; percent: number } | null>(() => {
  const plan = store.plans.diet
  if (!plan) return null
  const a = calcDailyAttainment(store.records.diet, store.plans.diet, todayStr)
  return {
    label: `每日热量目标 ${plan.target} 千卡`,
    current: a?.current ?? 0,
    target: a?.target ?? plan.target,
    // 进度条宽度 = min(percent,1)*100%（取整显示，超量钳到 100%）
    percent: Math.floor(Math.min(a?.percent ?? 0, 1) * 100)
  }
})

// ===== 目标弹框（metric/period 固定为 calories/daily，不展示选择器）=====
const showTargetDialog = ref(false)
const formTarget = ref('')

// 目标必须 > 0，否则保存按钮 disabled
const isTargetValid = computed(() => {
  const t = Number(formTarget.value)
  return Number.isFinite(t) && t > 0
})

function openTargetDialog(): void {
  const plan = store.plans.diet
  formTarget.value = plan ? String(plan.target) : ''
  showTargetDialog.value = true
}

function closeTargetDialog(): void {
  showTargetDialog.value = false
}

async function handleSaveTarget(): Promise<void> {
  if (!isTargetValid.value) return
  await store.setPlan('diet', { metric: 'calories', period: 'daily', target: Number(formTarget.value) })
  closeTargetDialog()
}

async function handleClearTarget(): Promise<void> {
  if (confirm('确定要清除每日热量目标吗？')) {
    await store.setPlan('diet', null)
    closeTargetDialog()
  }
}

// ===== 记录列表（date 降序，同日按 createdAt 降序）=====
const sortedRecords = computed(() => {
  return [...store.records.diet].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
  )
})

// 四类餐次徽章配色
const MEAL_BADGE_CLASS: Record<MealType, string> = {
  早餐: 'dt-meal-breakfast',
  午餐: 'dt-meal-lunch',
  晚餐: 'dt-meal-dinner',
  加餐: 'dt-meal-snack'
}

// ===== 记录表单（新增/编辑共用弹框）=====
const showRecordDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localToday())
const formMeal = ref<MealType>(MEAL_TYPES[0])
const formContent = ref('')
const formCalories = ref('0')
const formNote = ref('')

// ===== 记录列表展开/折叠（默认收起；折叠仅隐藏列表，计数/今日达标不受影响）=====
const listExpanded = ref(false)

// ===== 自适应分页（Wave-2 T10）：≥769px 分页；折叠时列表未挂载（listEl null）→ 分页惰性（R8）=====
const listEl = ref<HTMLElement | null>(null)
// reactive() 解包嵌套 ref：模板中 paging.pageItems/currentPage/totalPages/fitsOnePage 直接取值
const paging = reactive(
  usePanelPaging({
    items: () => sortedRecords.value,
    rowHeight: 118, // row-heights.json: diet = 118（MAX 115.98 + 2px，R4）
    maxRows: 1, // 6 列卡片网格契约：每页最多 1 行（6 张卡），行数钳制走 clampMaxRows
    containerRef: listEl,
    gridRef: listEl // 同元素：测高 + 实测 gridTemplateColumns 列数（M-1：独立 if 非 else-if）
  })
)

function toggleList(): void {
  listExpanded.value = !listExpanded.value
  if (listExpanded.value) paging.goto(1) // 展开回第 1 页（T10）
}

// date 必填 + content 非空 ≤200 字 + calories ≥ 0，否则保存按钮 disabled
const isFormValid = computed(() => {
  const cal = Number(formCalories.value)
  const content = formContent.value.trim()
  return formDate.value !== '' && content !== '' && content.length <= 200 && Number.isFinite(cal) && cal >= 0
})

function startAddRecord(): void {
  editingId.value = null
  formDate.value = localToday()
  formMeal.value = MEAL_TYPES[0]
  formContent.value = ''
  formCalories.value = '0'
  formNote.value = ''
  showRecordDialog.value = true
}

function startEditRecord(id: string): void {
  const rec = store.records.diet.find(r => r.id === id)
  if (!rec) return
  editingId.value = id
  formDate.value = rec.date
  formMeal.value = rec.mealType
  formContent.value = rec.content
  formCalories.value = String(rec.calories)
  formNote.value = rec.note ?? ''
  showRecordDialog.value = true
}

function cancelRecordForm(): void {
  showRecordDialog.value = false
  editingId.value = null
}

async function handleSaveRecord(): Promise<void> {
  if (!isFormValid.value) return
  const note = formNote.value.trim()
  const payload: Record<string, unknown> = {
    date: formDate.value,
    mealType: formMeal.value,
    content: formContent.value.trim(),
    calories: Number(formCalories.value)
  }
  if (note) payload.note = note
  if (editingId.value) {
    await store.updateRecord('diet', editingId.value, payload)
  } else {
    await store.addRecord('diet', payload)
  }
  paging.goto(1) // 新增/编辑后回第 1 页（T10）
  cancelRecordForm()
}

async function handleDeleteRecord(id: string): Promise<void> {
  if (confirm('确定要删除这条饮食记录吗？')) {
    await store.deleteRecord('diet', id)
    paging.goto(1) // 删除后回第 1 页（T10）
  }
}

// ESC 关闭弹框（先关记录弹框，再关目标弹框）
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (showRecordDialog.value) {
    event.preventDefault()
    cancelRecordForm()
  } else if (showTargetDialog.value) {
    event.preventDefault()
    closeTargetDialog()
  }
}

// 面板自管理数据加载（WorkbenchView 后续集成后会统一加载，这里防御性幂等重载）
onMounted(async () => {
  const recs = store.records
  const recordsEmpty =
    recs.exercise.length === 0 && recs.diet.length === 0 && recs.sleep.length === 0 && recs.weight.length === 0
  const notLoaded = store.height === undefined && Object.keys(store.plans).length === 0
  if (recordsEmpty && notLoaded) {
    await store.loadHealth()
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="wb-diet">
    <!-- 顶部目标卡（复用 stat-card 结构） -->
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-icon">🍽️</span>
        <span class="stat-label">每日热量目标</span>
        <button v-if="targetView" class="nav-btn" data-testid="dt-edit-target" @click="openTargetDialog">
          调整目标
        </button>
        <button v-else class="nav-btn" data-testid="dt-target" @click="openTargetDialog">设定目标</button>
      </div>
      <template v-if="targetView">
        <div class="stat-value" data-testid="dt-plan-label">{{ targetView.label }}</div>
        <div class="dt-attainment" data-testid="dt-attainment">今日 {{ targetView.current }}/{{ targetView.target }} 千卡</div>
        <div class="dt-progress" data-testid="dt-progress">
          <div class="dt-progress-fill" :style="{ width: targetView.percent + '%' }"></div>
        </div>
      </template>
      <div v-else class="stat-sub">尚未设定每日热量目标</div>
    </div>

    <!-- 定时提醒（只读小模块） -->
    <WorkbenchHealthReminders module="diet" />

    <!-- 操作栏：展开记录 + 新增 -->
    <div class="dt-headbar">
      <button
        v-if="store.records.diet.length > 0"
        class="btn-toggle-list"
        data-testid="dt-toggle-list"
        @click="toggleList"
      >
        {{ listExpanded ? '收起记录' : '展开记录' }}（{{ store.records.diet.length }}）
      </button>
      <button class="btn-add" data-testid="dt-add" @click="startAddRecord">＋ 新增记录</button>
    </div>

    <!-- 空态 -->
    <div
      v-if="store.records.diet.length === 0"
      class="empty-state empty-invite"
      data-testid="dt-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条饮食记录
    </div>

    <!-- 记录列表 -->
    <template v-else-if="listExpanded">
      <div ref="listEl" class="dt-list" :class="{ 'dt-list-scroll': !paging.fitsOnePage }">
        <div v-for="rec in paging.pageItems" :key="rec.id" class="dt-item" data-testid="dt-item">
          <div class="dt-item-head">
            <span class="dt-date">{{ rec.date }}</span>
            <span class="dt-meal-badge" :class="MEAL_BADGE_CLASS[rec.mealType]">{{ rec.mealType }}</span>
          </div>
          <div class="dt-meta">{{ rec.content }} · {{ rec.calories }} 千卡</div>
          <div v-if="rec.note" class="dt-note">{{ rec.note }}</div>
          <div class="dt-actions">
            <button class="btn-edit" :data-testid="`dt-edit-${rec.id}`" @click="startEditRecord(rec.id)">编辑</button>
            <button class="btn-delete" :data-testid="`dt-delete-${rec.id}`" @click="handleDeleteRecord(rec.id)">
              删除
            </button>
          </div>
        </div>
      </div>
      <PanelPager :page="paging.currentPage" :total="paging.totalPages" @prev="paging.prev()" @next="paging.next()" />
    </template>

    <!-- 目标弹框 -->
    <div v-if="showTargetDialog" class="dialog-overlay" @click.self="closeTargetDialog">
      <div class="dialog" data-testid="dt-dialog">
        <div class="dialog-header">
          <h3>{{ targetView ? '调整目标' : '设定目标' }}</h3>
          <button class="close-btn" @click="closeTargetDialog">✕</button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSaveTarget">
          <div class="form-group">
            <label>每日热量目标（千卡）*</label>
            <input
              v-model="formTarget"
              type="number"
              min="1"
              step="1"
              class="form-input"
              placeholder="例如：2000"
              data-testid="dt-target-input"
            />
          </div>

          <div class="form-actions">
            <button
              v-if="targetView"
              type="button"
              class="btn-clear"
              data-testid="dt-clear-target"
              @click="handleClearTarget"
            >
              清除目标
            </button>
            <span class="form-actions-spacer"></span>
            <button type="button" class="btn-cancel" data-testid="dt-cancel" @click="closeTargetDialog">取消</button>
            <button type="submit" class="btn-save" :disabled="!isTargetValid" data-testid="dt-save">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 新增/编辑记录弹框 -->
    <div v-if="showRecordDialog" class="dialog-overlay" @click.self="cancelRecordForm">
      <div class="dialog" data-testid="dt-dialog">
        <div class="dialog-header">
          <h3>{{ editingId ? '编辑记录' : '新增记录' }}</h3>
          <button class="close-btn" @click="cancelRecordForm">✕</button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSaveRecord">
          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">日期 *</label>
              <input v-model="formDate" type="date" class="form-input field-date" data-testid="dt-form-date" />
            </div>
            <div class="field">
              <label class="field-label">餐次 *</label>
              <select v-model="formMeal" class="form-input field-meal" data-testid="dt-form-meal">
                <option v-for="m in MEAL_TYPES" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>

          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">内容 *</label>
              <input
                v-model="formContent"
                type="text"
                maxlength="200"
                class="form-input field-content"
                placeholder="例如：鸡蛋牛奶"
                data-testid="dt-form-content"
              />
            </div>
            <div class="field">
              <label class="field-label">热量（千卡）</label>
              <input
                v-model="formCalories"
                type="number"
                min="0"
                step="1"
                class="form-input field-calories"
                placeholder="例如：500"
                data-testid="dt-form-calories"
              />
            </div>
          </div>

          <div class="form-group">
            <label>备注（可选）</label>
            <textarea
              v-model="formNote"
              class="form-input desc-input"
              rows="2"
              placeholder="补充说明…"
              data-testid="dt-form-note"
            ></textarea>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-cancel" data-testid="dt-cancel-record" @click="cancelRecordForm">
              取消
            </button>
            <button type="submit" class="btn-save" :disabled="!isFormValid" data-testid="dt-save-record">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-diet {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 目标卡（复用 WorkbenchHome stat-card 结构）===== */
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.stat-card:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.stat-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, var(--color-text-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--accent-color, var(--color-primary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nav-btn:hover {
  background: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
  color: #fff;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat-sub {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

/* 今日达标行 + 进度条（--accent-color） */
.dt-attainment {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.dt-progress {
  height: 8px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  overflow: hidden;
}

.dt-progress-fill {
  height: 100%;
  border-radius: var(--radius-full, 999px);
  background: var(--accent-color, var(--color-primary));
  transition: width var(--transition-fast, 0.15s ease);
}

/* ===== 操作栏 ===== */
.dt-headbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-toggle-list {
  padding: 10px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-toggle-list:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
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

/* ===== 记录列表（6 列卡片网格：桌面 6 卡/行 × maxRows 1 = 6 卡/页）===== */
.dt-list {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.dt-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 12px;
  background: var(--bg-card, var(--color-bg-card));
  background-image: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent-color, #3b82f6) 7%, transparent),
    transparent 55%
  );
  border: 1px solid var(--border-color, var(--color-border));
  border-left: 4px solid var(--accent-color, var(--color-primary));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.dt-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dt-date {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

/* 餐次徽章（复用范本 ex-type-badge 体系），四类餐次不同色 */
.dt-meal-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--accent-color, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--accent-color, #3b82f6) 30%, transparent);
}

/* 午餐：蓝（默认同徽章基色） */
.dt-meal-lunch {
  color: var(--accent-color, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border-color: color-mix(in srgb, var(--accent-color, #3b82f6) 30%, transparent);
}

/* 早餐：琥珀 */
.dt-meal-breakfast {
  color: #d97706;
  background: #fef3c7;
  border-color: rgba(217, 119, 6, 0.3);
}

/* 晚餐：紫 */
.dt-meal-dinner {
  color: #7c3aed;
  background: #f3e8ff;
  border-color: rgba(124, 58, 237, 0.3);
}

/* 加餐：绿 */
.dt-meal-snack {
  color: #059669;
  background: #d1fae5;
  border-color: rgba(5, 150, 105, 0.3);
}

.dt-meta {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.dt-note {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 0;
}

.dt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}

/* ===== 按钮（复用 WorkbenchTodo 体系）===== */
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

.btn-clear {
  padding: 9px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--error-color, var(--color-error));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-clear:hover {
  background: var(--error-color, var(--color-error));
  border-color: var(--error-color, var(--color-error));
  color: #fff;
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

/* ===== 弹框（复用 WorkbenchTodo 体系）===== */
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
  width: 170px;
}

.field-meal {
  width: 140px;
}

.field-content {
  flex: 1;
  min-width: 180px;
}

.field-calories {
  width: 140px;
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

.desc-input {
  resize: vertical;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.form-actions-spacer {
  flex: 1;
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
:root.dark .stat-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .dt-item {
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

:root.dark .dt-date {
  color: var(--text-primary, #f9fafb);
}

:root.dark .dt-meta,
:root.dark .dt-note {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .dt-meal-lunch {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

:root.dark .dt-meal-breakfast {
  color: #fbbf24;
  background: rgba(217, 119, 6, 0.2);
  border-color: rgba(217, 119, 6, 0.45);
}

:root.dark .dt-meal-dinner {
  color: #c4b5fd;
  background: rgba(124, 58, 237, 0.2);
  border-color: rgba(124, 58, 237, 0.45);
}

:root.dark .dt-meal-snack {
  color: #6ee7b7;
  background: rgba(5, 150, 105, 0.2);
  border-color: rgba(5, 150, 105, 0.45);
}

:root.dark .dt-progress {
  background-color: var(--input-bg, #374151);
}

:root.dark .btn-clear {
  background-color: var(--bg-card, #1f2937);
  border-color: var(--border-color, #374151);
}

/* 禁用态保存按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
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

:root.dark .btn-toggle-list,
:root.dark .btn-cancel,
:root.dark .btn-edit,
:root.dark .btn-delete {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

@media (max-width: 640px) {
  .field-date,
  .field-meal,
  .field-content,
  .field-calories {
    width: 100%;
  }
}

/* ===== 移动端 ≤768px：分页惰性（全量渲染、无切片、无 pager），网格自适应列数 ===== */
@media (max-width: 768px) {
  .dt-list {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}

/* ===== 桌面端 ≥769px：自适应分页契约（Wave-2 T10，R1/R2/R7/R8）===== */
/* 容器 hop：.wb-health（WorkbenchHealth tabs 容器）块级 → flex 列，
   子面板根才能 stretch（T3 只钉到 .wb-content > *，容器文件禁改 → 从子面板侧补齐） */
@media (min-width: 769px) {
  :global(.wb-health) {
    display: flex;
    flex-direction: column;
  }

  /* 面板根钉满 tab 内容区（R1 flex-stretch） */
  .wb-diet {
    flex: 1;
    min-height: 0;
  }

  /* 列表区可收缩占满剩余高度（PanelPager 下方） */
  .dt-list {
    flex: 1;
    min-height: 0;
  }

  /* 列表区滚动兜底：仅 !fitsOnePage 时由模板类绑定启用（R7） */
  .dt-list-scroll {
    overflow-y: auto;
  }
}
</style>
