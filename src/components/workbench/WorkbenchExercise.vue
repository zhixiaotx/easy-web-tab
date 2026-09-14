<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { injectHealthStore, type HealthStoreLike } from '@/composables/healthStoreContext'
import { calcExerciseAttainment, calcYearDistanceTotals } from '@/composables/healthCore'
import { localToday } from '@/composables/todoCore'
import { EXERCISE_TYPES, type HealthPlanMetric } from '@/types'
import WorkbenchHealthReminders from './WorkbenchHealthReminders.vue'
import Icon from '@/components/Icon.vue'

// store 来源可注入：默认成人端 store，学生端容器 provide 自己的 store 后自动改为学生数据（见 healthStoreContext）
const store = (injectHealthStore() ?? useWorkbenchHealthStore()) as HealthStoreLike

// ===== 顶部目标卡 =====
const todayStr = localToday()

// 达标率/周计算禁止在组件内重算，必须调 healthCore 纯函数
const targetView = computed<{ label: string; current: number; target: number; percent: number } | null>(() => {
  const plan = store.plans.exercise
  if (!plan) return null
  const a = calcExerciseAttainment(store.records.exercise, store.plans.exercise, todayStr)
  return {
    label: `每周 ${plan.target} ${METRIC_LABELS[plan.metric]}`,
    current: a?.current ?? 0,
    target: a?.target ?? plan.target,
    // 进度条宽度 = min(percent,1)*100%（取整显示，超量钳到 100%）
    percent: Math.floor(Math.min(a?.percent ?? 0, 1) * 100)
  }
})

// 年度跑步/骑行距离总数（公里，1 位小数）——纯展示，无交互；禁止组件内重算
const yearTotals = computed(() => calcYearDistanceTotals(store.records.exercise, todayStr.slice(0, 4)))

const METRIC_LABELS: Record<HealthPlanMetric, string> = {
  times: '次',
  minutes: '分钟',
  calories: '千卡',
  duration: '小时'
}

// ===== 目标弹框 =====
const showTargetDialog = ref(false)
const formMetric = ref<HealthPlanMetric>('times')
const formTarget = ref('')

const METRIC_OPTIONS: { value: HealthPlanMetric; label: string }[] = [
  { value: 'times', label: '次数' },
  { value: 'minutes', label: '时长（分钟）' },
  { value: 'calories', label: '热量（千卡）' }
]

// 目标必须 > 0，否则保存按钮 disabled
const isTargetValid = computed(() => {
  const t = Number(formTarget.value)
  return Number.isFinite(t) && t > 0
})

function openTargetDialog(): void {
  const plan = store.plans.exercise
  formMetric.value =
    plan && METRIC_OPTIONS.some(o => o.value === plan.metric) ? plan.metric : 'times'
  formTarget.value = plan ? String(plan.target) : ''
  showTargetDialog.value = true
}

function closeTargetDialog(): void {
  showTargetDialog.value = false
}

async function handleSaveTarget(): Promise<void> {
  if (!isTargetValid.value) return
  await store.setPlan('exercise', { metric: formMetric.value, period: 'weekly', target: Number(formTarget.value) })
  closeTargetDialog()
}

async function handleClearTarget(): Promise<void> {
  if (confirm('确定要清除运动目标吗？')) {
    await store.setPlan('exercise', null)
    closeTargetDialog()
  }
}

// ===== 记录列表（date 降序，同日按 createdAt 降序）=====
const sortedRecords = computed(() => {
  return [...store.records.exercise].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
  )
})

// ===== 记录表单（新增/编辑共用弹框）=====
const showRecordDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localToday())
const formType = ref<string>(EXERCISE_TYPES[0])
const formDuration = ref('')
const formCalories = ref('0')
const formDistance = ref('')
const formNote = ref('')

// 距离（公里）仅对 跑步/游泳/骑行 可选展示
const DISTANCE_TYPES = new Set(['跑步', '游泳', '骑行'])
const showDistanceField = computed(() => DISTANCE_TYPES.has(formType.value))

// ===== 记录列表弹框（点击「查看」弹出 Element Plus Table，每页 10 条）=====
const showListDialog = ref(false)
const listPage = ref(1)
const LIST_PAGE_SIZE = 10

const listPageItems = computed(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return sortedRecords.value.slice(start, start + LIST_PAGE_SIZE)
})

function openListDialog(): void {
  listPage.value = 1
  showListDialog.value = true
}

function closeListDialog(): void {
  showListDialog.value = false
}

// date 必填 + duration > 0 + calories ≥ 0 + （距离可选，填写则须 ≥ 0），否则保存按钮 disabled
const isFormValid = computed(() => {
  const dur = Number(formDuration.value)
  const cal = Number(formCalories.value)
  const dist = Number(formDistance.value)
  const distOk = !showDistanceField.value || formDistance.value === '' || (Number.isFinite(dist) && dist >= 0)
  return formDate.value !== '' && Number.isFinite(dur) && dur > 0 && Number.isFinite(cal) && cal >= 0 && distOk
})

function startAddRecord(): void {
  editingId.value = null
  formDate.value = localToday()
  formType.value = EXERCISE_TYPES[0]
  formDuration.value = ''
  formCalories.value = '0'
  formDistance.value = ''
  formNote.value = ''
  showRecordDialog.value = true
}

function startEditRecord(id: string): void {
  const rec = store.records.exercise.find(r => r.id === id)
  if (!rec) return
  editingId.value = id
  formDate.value = rec.date
  formType.value = rec.exerciseType
  formDuration.value = String(rec.duration)
  formCalories.value = String(rec.calories)
  formDistance.value = String(rec.distanceKm ?? '')
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
    exerciseType: formType.value,
    duration: Number(formDuration.value),
    calories: Number(formCalories.value)
  }
  if (note) payload.note = note
  if (showDistanceField.value) {
    payload.distanceKm = formDistance.value === '' ? undefined : Number(formDistance.value)
  }
  if (editingId.value) {
    await store.updateRecord('exercise', editingId.value, payload)
  } else {
    await store.addRecord('exercise', payload)
  }
  listPage.value = 1 // 新增/编辑后回到第 1 页
  cancelRecordForm()
}

async function handleDeleteRecord(id: string): Promise<void> {
  if (confirm('确定要删除这条运动记录吗？')) {
    await store.deleteRecord('exercise', id)
    listPage.value = 1 // 删除后回到第 1 页
  }
}

// ESC 关闭弹框（先关记录弹框，再关目标弹框）
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (showRecordDialog.value) {
    event.preventDefault()
    cancelRecordForm()
  } else if (showListDialog.value) {
    event.preventDefault()
    closeListDialog()
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
  <div class="wb-exercise">
    <!-- 顶部目标卡（复用 stat-card 结构）——右上角按钮顺序：【＋ 新增】在前，【查看】在后 -->
    <div class="stat-card">
      <div class="stat-header">
        <Icon name="exercise" :size="16" class="stat-icon" />
        <span class="stat-label">运动目标</span>
        <span class="stat-pill" data-testid="ex-year-run">跑步 {{ yearTotals['跑步'] ?? 0 }} 公里</span>
        <span class="stat-pill" data-testid="ex-year-ride">骑行 {{ yearTotals['骑行'] ?? 0 }} 公里</span>
        <div class="stat-panel-actions">
          <el-button class="btn-add" data-testid="ex-add" @click="startAddRecord">＋ 新增</el-button>
          <el-button
            v-if="store.records.exercise.length > 0"
            class="btn-manage"
            data-testid="ex-toggle-list"
            @click="openListDialog"
          >
            查看（{{ store.records.exercise.length }}）
          </el-button>
        </div>
        <el-button v-if="targetView" class="nav-btn" data-testid="ex-edit-target" @click="openTargetDialog">
          调整目标
        </el-button>
        <el-button v-else class="nav-btn" data-testid="ex-target" @click="openTargetDialog">设定目标</el-button>
      </div>
      <template v-if="targetView">
        <div class="stat-value" data-testid="ex-plan-label">{{ targetView.label }}</div>
        <div class="ex-attainment" data-testid="ex-attainment">本周 {{ targetView.current }}/{{ targetView.target }}</div>
        <div class="ex-progress" data-testid="ex-progress">
          <div class="ex-progress-fill" :style="{ width: targetView.percent + '%' }"></div>
        </div>
      </template>
      <div v-else class="stat-sub">尚未设定周目标</div>
    </div>

    <!-- 定时提醒（只读小模块） -->
    <WorkbenchHealthReminders module="exercise" />

    <!-- 空态 -->
    <div
      v-if="store.records.exercise.length === 0"
      class="empty-state empty-invite"
      data-testid="ex-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条运动记录
    </div>

    <!-- 记录列表弹框（Element Plus Table：日期/类型/时长/强度/距离/消耗/备注/操作，每页 10 条） -->
    <Transition name="dialog">
      <div v-if="showListDialog" class="dialog-overlay list-dialog-overlay" @click.self="closeListDialog">
        <div class="dialog list-dialog" data-testid="ex-list-dialog">
          <div class="dialog-header">
            <h3>运动记录</h3>
            <el-button class="close-btn" text @click="closeListDialog"><Icon name="close" /></el-button>
          </div>
          <div class="ex-list">
            <el-table
              :data="listPageItems"
              stripe
              border
              size="default"
              style="width: 100%"
              height="100%"
              empty-text="暂无运动记录"
            >
              <el-table-column label="日期" width="130" align="center">
                <template #default="{ row }">{{ row.date }}</template>
              </el-table-column>
              <el-table-column label="类型" width="120" align="center">
                <template #default="{ row }">
                  <span class="ld-cat-type-badge">{{ row.exerciseType }}</span>
                </template>
              </el-table-column>
              <el-table-column label="时长" width="110" align="right">
                <template #default="{ row }">{{ row.duration }} 分钟</template>
              </el-table-column>
              <el-table-column label="距离" width="110" align="right">
                <template #default="{ row }">
                  <template v-if="DISTANCE_TYPES.has(row.exerciseType) && row.distanceKm !== undefined">
                    {{ Number(row.distanceKm).toFixed(1) }} km
                  </template>
                  <template v-else style="color: var(--color-text-secondary, #9ca3af);">—</template>
                </template>
              </el-table-column>
              <el-table-column label="消耗" width="110" align="right">
                <template #default="{ row }">
                  <span style="font-weight: 700; color: var(--color-success, #16a34a); font-variant-numeric: tabular-nums;">
                    {{ row.calories }} kcal
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="备注" min-width="200" show-overflow-tooltip>
                <template #default="{ row }">
                  <span v-if="row.note">{{ row.note }}</span>
                  <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="150" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button class="btn-edit" :data-testid="`ex-edit-${row.id}`" @click="startEditRecord(row.id)" style="margin-right: 6px;">编辑</el-button>
                  <el-button class="btn-delete" :data-testid="`ex-delete-${row.id}`" @click="handleDeleteRecord(row.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="ex-list-pager">
            <el-pagination
              v-model:current-page="listPage"
              :page-size="LIST_PAGE_SIZE"
              :page-sizes="[LIST_PAGE_SIZE]"
              layout="total, prev, pager, next, jumper"
              :total="sortedRecords.length"
              background
              small
              prev-text="上一页"
              next-text="下一页"
            />
          </div>
        </div>
      </div>
    </Transition>

    <!-- 目标弹框 -->
    <Transition name="dialog">
      <div v-if="showTargetDialog" class="dialog-overlay" @click.self="closeTargetDialog">
        <div class="dialog" data-testid="ex-dialog">
          <div class="dialog-header">
            <h3>{{ targetView ? '调整目标' : '设定目标' }}</h3>
            <el-button class="close-btn" text @click="closeTargetDialog"><Icon name="close" /></el-button>
          </div>
          <form class="dialog-body" @submit.prevent="handleSaveTarget">
            <div class="form-group">
              <label>目标指标</label>
              <el-select v-model="formMetric" class="form-input" data-testid="ex-metric" size="default">
                <el-option v-for="opt in METRIC_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
              </el-select>
            </div>

            <div class="form-group">
              <label>每周目标 *</label>
              <el-input-number
                :model-value="Number(formTarget) || undefined"
                :min="1"
                :step="1"
                class="form-input"
                placeholder="例如：3"
                data-testid="ex-target-input"
                :controls="false"
                @update:model-value="formTarget = $event == null ? '' : String($event)"
              />
            </div>

            <div class="form-actions">
              <el-button
                v-if="targetView"
                native-type="button"
                class="btn-clear"
                data-testid="ex-clear-target"
                @click="handleClearTarget"
              >
                清除目标
              </el-button>
              <span class="form-actions-spacer"></span>
              <el-button native-type="button" class="btn-cancel" data-testid="ex-cancel" @click="closeTargetDialog">取消</el-button>
              <el-button native-type="submit" class="btn-save" :disabled="!isTargetValid" data-testid="ex-save">保存</el-button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <!-- 新增/编辑记录弹框 -->
    <Transition name="dialog">
      <div v-if="showRecordDialog" class="dialog-overlay record-dialog-overlay" @click.self="cancelRecordForm">
        <div class="dialog" data-testid="ex-dialog">
          <div class="dialog-header">
            <h3>{{ editingId ? '编辑记录' : '新增记录' }}</h3>
            <el-button class="close-btn" text @click="cancelRecordForm"><Icon name="close" /></el-button>
          </div>
          <form class="dialog-body" @submit.prevent="handleSaveRecord">
            <div class="form-row-fields">
              <div class="field">
                <label class="field-label">日期 *</label>
                <el-date-picker
                  v-model="formDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  class="form-input field-date"
                  data-testid="ex-form-date"
                />
              </div>
              <div class="field">
                <label class="field-label">运动类型 *</label>
                <el-select v-model="formType" class="form-input field-type" data-testid="ex-form-type">
                  <el-option v-for="t in EXERCISE_TYPES" :key="t" :value="t" :label="t" />
                </el-select>
              </div>
            </div>

            <div class="form-row-fields">
              <div class="field">
                <label class="field-label">时长（分钟）*</label>
                <el-input-number
                  :model-value="formDuration === '' ? undefined : Number(formDuration)"
                  :min="1"
                  :step="1"
                  class="form-input field-duration"
                  placeholder="例如：30"
                  data-testid="ex-form-duration"
                  :controls="false"
                  @update:model-value="formDuration = $event == null ? '' : String($event)"
                />
              </div>
              <div class="field">
                <label class="field-label">热量（千卡）</label>
                <el-input-number
                  :model-value="Number(formCalories)"
                  :min="0"
                  :step="1"
                  class="form-input field-calories"
                  placeholder="例如：200"
                  data-testid="ex-form-calories"
                  :controls="false"
                  @update:model-value="formCalories = $event == null ? '0' : String($event)"
                />
              </div>
            </div>

            <div v-if="showDistanceField" class="form-row-fields">
              <div class="field">
                <label class="field-label">距离（公里）</label>
                <el-input-number
                  :model-value="formDistance === '' ? undefined : Number(formDistance)"
                  :min="0"
                  :step="0.1"
                  class="form-input field-distance"
                  placeholder="例如：5.2"
                  data-testid="ex-form-distance"
                  :controls="false"
                  :precision="1"
                  @update:model-value="formDistance = $event == null ? '' : String($event)"
                />
              </div>
            </div>

            <div class="form-group">
              <label>备注（可选）</label>
              <el-input
                v-model="formNote"
                type="textarea"
                :rows="2"
                class="form-input desc-input"
                placeholder="补充说明…"
                data-testid="ex-form-note"
              />
            </div>

            <div class="form-actions">
              <el-button native-type="button" class="btn-cancel" data-testid="ex-cancel-record" @click="cancelRecordForm">
                取消
              </el-button>
              <el-button native-type="submit" class="btn-save" :disabled="!isFormValid" data-testid="ex-save-record">
                {{ editingId ? '保存' : '添加' }}
              </el-button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-exercise {
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
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.stat-card:hover {
  border-color: var(--color-primary, var(--color-primary));
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
  color: var(--color-text-secondary, var(--color-text-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-primary, var(--color-primary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.nav-btn:hover {
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
}

.stat-pill {
  flex-shrink: 0;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-text-muted, var(--color-text-secondary));
  white-space: nowrap;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat-sub {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

/* 达标行 + 进度条（--color-primary） */
.ex-attainment {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.ex-progress {
  height: 8px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  overflow: hidden;
}

.ex-progress-fill {
  height: 100%;
  border-radius: var(--radius-full, 999px);
  background: var(--color-primary, var(--color-primary));
  transition: width var(--transition-fast, 0.15s ease);
}

/* ===== 顶部 stat-header 右上角新增/查看 按钮容器 ===== */
.stat-panel-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.stat-panel-actions .btn-add { padding: 8px 14px; font-size: 13px; }
.stat-panel-actions .btn-manage {
  padding: 8px 14px;
  font-size: 13px;
  background: var(--color-bg-card, #fff);
  color: var(--color-text, #111827);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: all 0.15s ease;
}
.stat-panel-actions .btn-manage:hover {
  color: var(--color-primary, #10b981);
  border-color: var(--color-primary, #10b981);
}

/* ===== 操作栏（已弃用，占位保留样式兼容）===== */
.ex-headbar { display: none; }
.btn-toggle-list { display: none; }

/* ===== 记录列表弹框：Element Plus Table + 分页（85vw×85vh）===== */
.list-dialog-overlay { z-index: 310; }
.record-dialog-overlay { z-index: 320; }

.dialog.list-dialog {
  width: 85vw;
  height: 85vh;
  max-width: 1200px;
  min-width: 560px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 移动端：取消 560px 最小宽度，避免对话框宽于视口、关闭按钮落到屏幕外无法关闭 */
@media (max-width: 768px) {
  .dialog-overlay.list-dialog-overlay {
    padding: 8px;
  }
  .dialog.list-dialog {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: 90vh !important;
  }
}

.ex-list {
  padding: 16px 20px 0 20px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ex-list-pager {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  background: var(--color-surface-2, #fafafa);
  border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
}

/* 暗色适配：.ld-cat-type-badge 已在 WorkbenchLedger 全局引入样式类在 AppSettingsDialog 内定义，
   但这里 scoped + 同名样式会被覆盖，重新定义一次保证运动/饮食/睡眠/体重等面板也生效 */
.ld-cat-type-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}
:global(html.dark) .ld-cat-type-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

@media (max-width: 640px) {
  .stat-header {
    flex-wrap: wrap;
  }
  .stat-panel-actions { margin-left: 0; width: 100%; }
  .stat-panel-actions .btn-add, .stat-panel-actions .btn-manage { flex: 1; text-align: center; }
  .field-date,
  .field-type,
  .field-duration,
  .field-calories,
  .field-distance { width: 100%; }
}

/* ===== 桌面端 ≥769px：面板钉满健康 tab 容器 ===== */
@media (min-width: 769px) {
  :global(.wb-health) {
    display: flex;
    flex-direction: column;
  }
  .wb-exercise {
    flex: 1;
    min-height: 0;
  }
}

.btn-add {
  padding: 10px 16px;
  background-color: var(--color-primary, var(--color-primary));
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-add:hover {
  background-color: var(--color-primary-hover, var(--color-primary-hover));
}

/* ===== 旧卡片网格样式（已弃用：改为 ElTable，保留仅避免样式声明冗余报错）===== */
.ex-list { /* 空规则：ElTable 容器样式在更下方用 .dialog.list-dialog .ex-list 覆盖 */ }
.ex-item, .ex-item-head, .ex-date, .ex-type-badge, .ex-meta, .ex-note, .ex-actions { display: none; }

/* ===== 按钮（复用 WorkbenchTodo 体系）===== */
.btn-edit,
.btn-delete {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-edit:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.btn-delete:hover {
  color: var(--color-error, var(--color-error));
  border-color: var(--color-error, var(--color-error));
}

.btn-clear {
  padding: 9px 16px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--color-error, var(--color-error));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-clear:hover {
  background: var(--color-error, var(--color-error));
  border-color: var(--color-error, var(--color-error));
  color: #fff;
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

.empty-invite {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: color var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.empty-invite:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
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
  background-color: var(--color-bg-card, var(--color-bg-card));
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
  border-bottom: 1px solid var(--color-border, var(--color-border));
  position: sticky;
  top: 0;
  background: var(--color-bg-card, var(--color-bg-card));
  border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
}

.dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  transition: color var(--transition-fast, 0.15s ease);
}

.close-btn:hover {
  color: var(--color-text, var(--color-text));
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
  color: var(--color-text-secondary, var(--color-text-secondary));
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
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.field-date {
  width: 170px;
}

.field-type {
  width: 140px;
}

.field-duration {
  width: 140px;
}

.field-calories {
  width: 140px;
}

.field-distance {
  width: 140px;
}

.form-input {
  padding: 9px 12px;
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
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
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-save:hover:not(:disabled) {
  background: var(--color-primary-hover, var(--color-primary-hover));
}

.btn-save:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-cancel {
  padding: 9px 16px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--color-bg-hover, var(--color-bg-active));
}

/* ===== 暗色模式覆盖 ===== */
html.dark .stat-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .ex-item {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .empty-state {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .dialog {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .dialog-header {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .ex-date {
  color: var(--color-text, #f9fafb);
}

html.dark .ex-meta,
html.dark .ex-note {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .ex-type-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .ex-progress {
  background-color: var(--color-bg-input, #374151);
}

html.dark .btn-clear {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

/* 禁用态保存按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
html.dark .btn-save:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

html.dark .form-input,
html.dark select.form-input,
html.dark input.form-input {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

/* 暗色适配：ld-cat-type-badge 暗色（:global 穿透 scoped）*/
:global(html.dark) .ld-cat-type-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

:global(html.dark) .btn-cancel,
:global(html.dark) .btn-edit,
:global(html.dark) .btn-delete,
:global(html.dark) .stat-panel-actions .btn-manage {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

@media (max-width: 640px) {
  .stat-header { flex-wrap: wrap; }
  .stat-panel-actions { margin-left: 0; width: 100%; }
  .stat-panel-actions .btn-add, .stat-panel-actions .btn-manage { flex: 1; text-align: center; }
  .field-date,
  .field-type,
  .field-duration,
  .field-calories,
  .field-distance { width: 100%; }
}

/* ===== 记录列表弹框：Element Plus Table + 分页（85vw×85vh）===== */
.list-dialog-overlay { z-index: 310; }
.record-dialog-overlay { z-index: 320; }

.dialog.list-dialog {
  width: 85vw;
  height: 85vh;
  max-width: 1200px;
  min-width: 560px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 移动端：取消 560px 最小宽度，避免对话框宽于视口、关闭按钮落到屏幕外无法关闭 */
@media (max-width: 768px) {
  .dialog-overlay.list-dialog-overlay {
    padding: 8px;
  }
  .dialog.list-dialog {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: 90vh !important;
  }
}

.ex-list {
  padding: 16px 20px 0 20px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ex-list-pager {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  background: var(--color-surface-2, #fafafa);
  border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
}

/* ===== 桌面端 ≥769px：面板钉满健康 tab 容器 ===== */
@media (min-width: 769px) {
  :global(.wb-health) {
    display: flex;
    flex-direction: column;
  }
  .wb-exercise {
    flex: 1;
    min-height: 0;
  }
}
</style>
