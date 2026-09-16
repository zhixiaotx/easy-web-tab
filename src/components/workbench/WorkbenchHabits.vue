<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWorkbenchHabitsStore } from '@/stores/workbenchHabits'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import { DEFAULT_HABIT_COLOR } from '@/composables/habitCore'
import type { HabitFrequency } from '@/composables/habitCore'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from './PanelPager.vue'
import Icon from '@/components/Icon.vue'
import HabitCalendarCard from './HabitCalendarCard.vue'

const store = useWorkbenchHabitsStore()
const toast = useToast()

// 今天 = 本地日期 YYYY-MM-DD（localToday 防 UTC 偏移）
const today = localToday()

/** 今日是否已打卡（records 同日记录存在性判断，非公式）。 */
function isChecked(habitId: string): boolean {
  return store.records.some(r => r.habitId === habitId && r.date === today)
}

// 卡片排序：未打卡置顶（「今天要处理」一眼可见），已打卡沉底；同状态内保持录入顺序稳定。
// 仅依赖 records/today 的响应式派生；打卡（今日）后由 <TransitionGroup> 平滑滑动到新位置。
const viewHabits = computed(() =>
  store.habits
    .map((h, i) => ({ h, i, checked: isChecked(h.id) }))
    .sort((a, b) => (a.checked === b.checked ? a.i - b.i : a.checked ? 1 : -1))
    .map(({ h }) => h)
)

// ===== 自适应分页（月历卡片更高，rowHeight 取到 ~330）=====
const listEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => viewHabits.value,
  rowHeight: 330,
  containerRef: listEl,
  gridRef: listEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev, goto } = paging

// 频率选项与 habitCore HabitFrequency（每周目标次数 1-7）对齐：「每天」即 7
const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 7, label: '每天' },
  { value: 5, label: '每周 5 次' },
  { value: 3, label: '每周 3 次' },
  { value: 1, label: '每周 1 次' }
]

// 习惯操作失败 toast：reason 语义 → 中文文案
const HABIT_ERROR_MESSAGES: Record<string, string> = {
  empty: '习惯名称不能为空',
  duplicate: '同名习惯已存在',
  'not-found': '习惯不存在'
}

function habitErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(HABIT_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

// ===== 新增/编辑弹框（顶部「新增习惯」按钮与卡片点击共用同一弹框）=====
const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogName = ref('')
const dialogFrequency = ref<HabitFrequency>(7)
const dialogColor = ref(DEFAULT_HABIT_COLOR)

function openAddDialog(): void {
  editingId.value = null
  dialogName.value = ''
  dialogFrequency.value = 7
  dialogColor.value = DEFAULT_HABIT_COLOR
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const h = store.habits.find(x => x.id === id)
  if (!h) return
  editingId.value = h.id
  dialogName.value = h.name
  dialogFrequency.value = h.frequency
  dialogColor.value = h.color ?? DEFAULT_HABIT_COLOR
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

async function saveEditDialog(): Promise<void> {
  const name = dialogName.value.trim()
  if (!name) return
  if (editingId.value !== null) {
    const result = await store.updateHabit(editingId.value, {
      name,
      frequency: dialogFrequency.value,
      color: dialogColor.value
    })
    if (result.ok) closeEditDialog()
    habitErrorToast(result)
    return
  }
  const result = await store.addHabit(name, dialogFrequency.value, dialogColor.value)
  if (result.ok) {
    closeEditDialog()
    goto(1)
  }
  habitErrorToast(result)
}

async function handleDelete(id: string): Promise<void> {
  const h = store.habits.find(x => x.id === id)
  if (!confirm(`确定要删除习惯「${h?.name ?? ''}」吗？删除后打卡记录一并清除。`)) return
  const result = await store.deleteHabit(id)
  if (result.ok) {
    if (editingId.value === id) closeEditDialog()
    goto(1)
  }
  habitErrorToast(result)
}

function deleteCurrent(): void {
  if (editingId.value) void handleDelete(editingId.value)
}

// 面板自管理数据加载
onMounted(() => {
  void store.loadHabits()
})
</script>

<template>
  <div class="wb-habits">
    <!-- 顶部工具栏：左上角新增习惯按钮 -->
    <div class="hb-toolbar">
      <el-button class="hb-add-btn" type="primary" size="small" data-testid="hb-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增习惯
      </el-button>
    </div>

    <!-- 习惯月历卡片网格（多列并排，分页在网格下方） -->
    <div class="hb-main">
      <div v-if="store.habits.length === 0" class="empty-state" data-testid="hb-empty">
        还没有习惯，点上方「新增习惯」开始吧
      </div>

      <div v-else ref="listEl" class="hb-list" :class="{ 'hb-list-scroll': !fitsOnePage }">
        <TransitionGroup name="grid">
          <HabitCalendarCard
            v-for="h in pageItems"
            :key="h.id"
            :habit="h"
            @edit="openEditDialog"
          />
        </TransitionGroup>
      </div>

      <PanelPager :page="currentPage" :total="totalPages" @prev="prev()" @next="next()" />
    </div>

    <!-- 新增/编辑弹框（顶部按钮与卡片点击共用） -->
    <el-dialog
      :model-value="showEditDialog"
      :title="editingId ? '编辑习惯' : '新增习惯'"
      width="440px"
      :aria-label="editingId ? '编辑习惯' : '新增习惯'"
      @close="closeEditDialog"
      @update:model-value="(v: boolean) => { if (!v) closeEditDialog() }"
    >
      <template #header>
        <div class="dialog-header">
          <span class="dialog-title">{{ editingId ? '编辑习惯' : '新增习惯' }}</span>
        </div>
      </template>
      <div class="dialog-body">
        <div class="field">
          <label class="field-label">名称 *</label>
          <el-input
            v-model="dialogName"
            placeholder="例如：每天喝水 8 杯"
            maxlength="30"
            data-testid="hb-dialog-name"
          />
        </div>
        <div class="field">
          <label class="field-label">频率</label>
          <el-select v-model="dialogFrequency" data-testid="hb-dialog-frequency">
            <el-option
              v-for="opt in FREQUENCY_OPTIONS"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </el-select>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button size="small" data-testid="hb-dialog-cancel" @click="closeEditDialog">取消</el-button>
          <el-button
            type="primary"
            size="small"
            :disabled="!dialogName.trim()"
            data-testid="hb-dialog-save"
            @click="saveEditDialog"
          >
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button
            v-if="editingId"
            size="small"
            class="btn-danger"
            data-testid="hb-dialog-delete"
            @click="deleteCurrent"
          >
            删除
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 面板容器：顶部工具栏 + 下方卡片网格（单栏纵向堆叠） */
.wb-habits {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hb-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.hb-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hb-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

/* ===== 表单/弹框通用字段 ===== */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

/* ===== 习惯卡片网格（多列并排，月历卡片） ===== */
.hb-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  align-content: start;
}

/* ===== 弹框（新增/编辑）===== */
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border, var(--color-border));
}

.btn-danger {
  color: var(--color-error, #ef4444);
  border-color: var(--color-error, #ef4444);
  background: transparent;
}

.btn-danger:hover {
  background: var(--color-error, #ef4444);
  color: #fff;
  border-color: var(--color-error, #ef4444);
}

/* ===== 空态 ===== */
.empty-state {
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== 暗色模式覆盖 ===== */
html.dark .dialog-header,
html.dark .dialog-title {
  color: var(--color-text, #f9fafb);
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .empty-state {
  background-color: var(--color-bg-card, #1f2937);
}

/* ===== 桌面自适应分页（一屏布局：网格 flex:1 钉满，分页在网格下方）===== */
@media (min-width: 769px) {
  .hb-main {
    flex: 1;
    min-height: 0;
  }

  .hb-list {
    flex: 1;
    min-height: 0;
  }

  .hb-list-scroll {
    overflow-y: auto;
  }
}
</style>
