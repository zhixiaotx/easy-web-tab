<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()
function cardFields(row: any) {
  return [
    { label: '日期', value: row.date },
    { label: '餐别', value: row.mealType },
    { label: '食物', value: row.content },
    { label: '热量', value: row.calories != null ? `${row.calories} kcal` : '—' },
    { label: '备注', value: row.note || '—' }  ]
}
import Icon from '../Icon.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { injectHealthStore, type HealthStoreLike } from '@/composables/healthStoreContext'
import { calcDailyAttainment } from '@/composables/healthCore'
import { localToday } from '@/composables/todoCore'
import { MEAL_TYPES, type MealType } from '@/types'
import WorkbenchHealthReminders from './WorkbenchHealthReminders.vue'

// store 来源可注入：默认成人端 store，学生端容器 provide 自己的 store 后自动改为学生数据（见 healthStoreContext）
const store = (injectHealthStore() ?? useWorkbenchHealthStore()) as HealthStoreLike

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

// ===== 记录列表弹框（Element Plus Table，每页 10 条）=====
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
  listPage.value = 1
  cancelRecordForm()
}

async function handleDeleteRecord(id: string): Promise<void> {
  if (confirm('确定要删除这条饮食记录吗？')) {
    await store.deleteRecord('diet', id)
    listPage.value = 1
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
  <div class="wb-diet">
    <!-- 顶部目标卡（复用 stat-card 结构） -->
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-icon">🍽️</span>
        <span class="stat-label">每日热量目标</span>
        <div class="stat-panel-actions">
          <el-button class="btn-add" data-testid="dt-add" @click="startAddRecord">＋ 新增</el-button>
          <el-button
            v-if="store.records.diet.length > 0"
            class="btn-manage"
            data-testid="dt-toggle-list"
            @click="openListDialog"
          >
            查看（{{ store.records.diet.length }}）
          </el-button>
        </div>
        <el-button v-if="targetView" class="nav-btn" data-testid="dt-edit-target" @click="openTargetDialog">
          调整目标
        </el-button>
        <el-button v-else class="nav-btn" data-testid="dt-target" @click="openTargetDialog">设定目标</el-button>
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


    <!-- 空态 -->
    <div
      v-if="store.records.diet.length === 0"
      class="empty-state empty-invite"
      data-testid="dt-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条饮食记录
    </div>

    <!-- 记录列表弹框（Element Plus Table：日期/餐别/食物/热量/备注/操作，每页 10 条） -->
    <Transition name="dialog">
      <div v-if="showListDialog" class="dialog-overlay list-dialog-overlay" @click.self="closeListDialog">
        <div class="dialog list-dialog" data-testid="dt-list-dialog">
          <div class="dialog-header">
            <h3>饮食记录</h3>
            <ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" />
            <el-button class="close-btn" text @click="closeListDialog"><Icon name="close" /></el-button>
          </div>
          <div class="dt-list">
            <el-table v-if="vm.mode === 'list'" class="ewt-table" :data="listPageItems" stripe border size="default" style="width: 100%" height="100%" empty-text="暂无饮食记录">
              <el-table-column label="日期" width="130" align="center">
                <template #default="{ row }">{{ row.date }}</template>
              </el-table-column>
              <el-table-column label="餐别" width="110" align="center">
                <template #default="{ row }"><span class="dt-meal-badge" :class="MEAL_BADGE_CLASS[row.mealType as MealType]">{{ row.mealType }}</span></template>
              </el-table-column>
              <el-table-column label="食物" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">{{ row.content }}</template>
              </el-table-column>
              <el-table-column label="热量(kcal)" width="130" align="right">
                <template #default="{ row }"><span style="font-weight:700;color:var(--color-success,#16a34a);font-variant-numeric: tabular-nums;">{{ row.calories }} kcal</span></template>
              </el-table-column>
              <el-table-column label="备注" min-width="200" show-overflow-tooltip>
                <template #default="{ row }"><span v-if="row.note">{{ row.note }}</span><span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span></template>
              </el-table-column>
              <el-table-column label="操作" width="150" align="center" fixed="right" class-name="ewt-op-col">
                <template #default="{ row }"><el-button class="btn-edit" :data-testid="`dt-edit-${row.id}`" @click="startEditRecord(row.id)" style="margin-right:6px;">编辑</el-button><el-button class="btn-delete" :data-testid="`dt-delete-${row.id}`" @click="handleDeleteRecord(row.id)">删除</el-button></template>
              </el-table-column>
            </el-table>
            <div v-else class="ewt-card-grid">
              <RecordsCard
                @edit="startEditRecord(item.id)"
                v-for="item in listPageItems"
                :key="item.id"
                :fields="cardFields(item)"
              >
              </RecordsCard>
            </div>
          </div>
          <div class="dt-list-pager">
            <el-pagination v-model:current-page="listPage" :page-size="LIST_PAGE_SIZE" :page-sizes="[LIST_PAGE_SIZE]" layout="total, prev, pager, next, jumper" :total="sortedRecords.length" background small prev-text="上一页" next-text="下一页" />
          </div>
        </div>
      </div>
    </Transition>
    <!-- 目标弹框 -->
    <Transition name="dialog">
      <div v-if="showTargetDialog" class="dialog-overlay" @click.self="closeTargetDialog">
        <div class="dialog" data-testid="dt-dialog">
          <div class="dialog-header">
            <h3>{{ targetView ? '调整目标' : '设定目标' }}</h3>
            <el-button class="close-btn" text @click="closeTargetDialog"><Icon name="close" /></el-button>
          </div>
          <form class="dialog-body" @submit.prevent="handleSaveTarget">
            <div class="form-group">
              <label>每日热量目标（千卡）*</label>
              <el-input-number
                :model-value="formTarget === '' ? undefined : Number(formTarget)"
                :min="1"
                :step="1"
                class="form-input"
                placeholder="例如：2000"
                data-testid="dt-target-input"
                :controls="false"
                @update:model-value="formTarget = $event == null ? '' : String($event)"
              />
            </div>

            <div class="form-actions">
              <el-button
                v-if="targetView"
                native-type="button"
                class="btn-clear"
                data-testid="dt-clear-target"
                @click="handleClearTarget"
              >
                清除目标
              </el-button>
              <span class="form-actions-spacer"></span>
              <el-button native-type="button" class="btn-cancel" data-testid="dt-cancel" @click="closeTargetDialog">取消</el-button>
              <el-button native-type="submit" class="btn-save" :disabled="!isTargetValid" data-testid="dt-save">保存</el-button>
            </div>
          </form>
        </div>
      </div>
    </Transition>

    <!-- 新增/编辑记录弹框 -->
    <div v-if="showRecordDialog" class="dialog-overlay record-dialog-overlay" @click.self="cancelRecordForm">
      <div class="dialog" data-testid="dt-dialog">
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
                data-testid="dt-form-date"
              />
            </div>
            <div class="field">
              <label class="field-label">餐次 *</label>
              <el-select v-model="formMeal" class="form-input field-meal" data-testid="dt-form-meal">
                <el-option v-for="m in MEAL_TYPES" :key="m" :value="m" :label="m" />
              </el-select>
            </div>
          </div>

          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">内容 *</label>
              <el-input
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
              <el-input-number
                :model-value="Number(formCalories)"
                :min="0"
                :step="1"
                class="form-input field-calories"
                placeholder="例如：500"
                data-testid="dt-form-calories"
                :controls="false"
                @update:model-value="formCalories = $event == null ? '0' : String($event)"
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
              data-testid="dt-form-note"
            />
          </div>

          <div class="form-actions ewt-dialog-footer">
            <el-button native-type="button" class="btn-cancel" data-testid="dt-cancel-record" @click="cancelRecordForm">
              取消
            </el-button>
            <el-button native-type="submit" class="btn-save" :disabled="!isFormValid" data-testid="dt-save-record">
              {{ editingId ? '保存' : '添加' }}
            </el-button>
            <el-button v-if="editingId" type="danger" native-type="button" data-testid="dt-record-delete" @click="handleDeleteRecord(editingId)">删除</el-button>
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

/* 今日达标行 + 进度条（--color-primary） */
.dt-attainment {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.dt-progress {
  height: 8px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  overflow: hidden;
}

.dt-progress-fill {
  height: 100%;
  border-radius: var(--radius-full, 999px);
  background: var(--color-primary, var(--color-primary));
  transition: width var(--transition-fast, 0.15s ease);
}

/* ===== 操作栏（废弃：stat-panel-actions 代替） ===== */

/* ===== stat-card 右上角按钮组（与 Exercise/Sleep/Weight 一致） ===== */
.stat-panel-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.stat-panel-actions .btn-add { padding: 8px 14px; font-size: 13px; }
.stat-panel-actions .btn-manage {
  padding: 8px 14px;
  font-size: 13px;
  background: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e5e7eb);
  color: var(--color-text-secondary, #6b7280);
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  white-space: nowrap;
}
.stat-panel-actions .btn-manage:hover {
  color: var(--color-primary, #10b981);
  border-color: var(--color-primary, #10b981);
}
:global(html.dark) .stat-panel-actions .btn-manage {
  background: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .stat-panel-actions .btn-manage:hover {
  color: var(--color-primary, #10b981);
  border-color: var(--color-primary, #10b981);
}

.btn-toggle-list {
  padding: 10px 16px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-toggle-list:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
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

/* ===== 记录列表（弹框内 5 列卡片网格：5 卡/行 × maxRows 3 = 15 卡/页）===== */
.dt-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
}

.dt-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 12px;
  background: var(--color-bg-card, var(--color-bg-card));
  background-image: linear-gradient(
    135deg,
    color-mix(in srgb, var(--color-primary, #3b82f6) 7%, transparent),
    transparent 55%
  );
  border: 1px solid var(--color-border, var(--color-border));
  border-left: 4px solid var(--color-primary, var(--color-primary));
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
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

/* 餐次徽章（复用范本 ex-type-badge 体系），四类餐次不同色 */
.dt-meal-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

/* 午餐：蓝（默认同徽章基色） */
.dt-meal-lunch {
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border-color: color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
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
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.dt-note {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
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

html.dark .dt-item {
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

html.dark .dt-date {
  color: var(--color-text, #f9fafb);
}

html.dark .dt-meta,
html.dark .dt-note {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .dt-meal-lunch {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .dt-meal-breakfast {
  color: #fbbf24;
  background: rgba(217, 119, 6, 0.2);
  border-color: rgba(217, 119, 6, 0.45);
}

html.dark .dt-meal-dinner {
  color: #c4b5fd;
  background: rgba(124, 58, 237, 0.2);
  border-color: rgba(124, 58, 237, 0.45);
}

html.dark .dt-meal-snack {
  color: #6ee7b7;
  background: rgba(5, 150, 105, 0.2);
  border-color: rgba(5, 150, 105, 0.45);
}

html.dark .dt-progress {
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

html.dark .btn-toggle-list,
html.dark .btn-cancel,
html.dark .btn-edit,
html.dark .btn-delete {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

@media (max-width: 640px) {
  .field-date,
  .field-meal,
  .field-content,
  .field-calories {
    width: 100%;
  }
}

/* 旧 5 列卡片网格废弃：现在 Diet 列表用 ElTable；.dt-list 重定义为 ElTable 容器（与 Exercise/Sleep/Weight 一致） */
.dt-list {
  padding: 16px 20px 0 20px;
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.dt-list > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 0;
  width: 100% !important;
  --el-table-border-color: var(--color-border, #e5e7eb);
  --el-table-header-bg-color: var(--color-bg-hover, #f3f4f6);
  --el-table-tr-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(16, 185, 129, 0.06);
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.dt-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.dt-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .dt-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .dt-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .dt-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
/* 强制每个非 fixed 列 cell 最小内容宽，防止只剩日期+操作 */
.dt-list > :global(.el-table .el-table__body-wrapper .cell),
.dt-list > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
  white-space: nowrap;
}

.dt-list-pager {
  flex: 0 0 auto;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .dt-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.dt-list-pager :global(.el-pagination) {
  --el-pagination-bg-color: transparent;
}
.dt-list-pager :global(.el-pagination button),
.dt-list-pager :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.dt-list-pager :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #10b981) !important;
  color: #fff !important;
  border-color: var(--color-primary, #10b981) !important;
}
:global(html.dark) .dt-list-pager :global(.el-pagination button),
:global(html.dark) .dt-list-pager :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .dt-list-pager :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #10b981) !important;
  color: #fff !important;
  border-color: var(--color-primary, #10b981) !important;
}
.dt-list-pager :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

@media (max-width: 768px) {
  .stat-panel-actions { margin-left: 0; width: 100%; }
  .stat-panel-actions .btn-add, .stat-panel-actions .btn-manage { flex: 1; text-align: center; }
}

/* ===== 记录列表弹框：Element Plus Table + 分页（85vw×85vh，与 Exercise 完全一致）—— 放在 .dialog 基础类之后覆盖 ===== */
.list-dialog-overlay { z-index: 310; }
.record-dialog-overlay { z-index: 320; }

.dialog.list-dialog {
  width: 85vw !important;
  height: 85vh !important;
  max-width: 1200px !important;
  min-width: 560px;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  overflow-y: visible !important;
}

@media (max-width: 640px) {
  .dialog.list-dialog { width: 94vw !important; min-width: 0 !important; height: 88vh !important; }
}

/* ===== 桌面端 ≥769px：面板根钉满 tab 内容区 ===== */
@media (min-width: 769px) {
  :global(.wb-health) {
    display: flex;
    flex-direction: column;
  }

  .wb-diet {
    flex: 1;
    min-height: 0;
  }

  .dt-list-scroll {
    overflow-y: auto;
  }
}
</style>