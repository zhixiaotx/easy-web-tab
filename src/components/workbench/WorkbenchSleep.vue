<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '日期', value: row.date },
    { label: '入睡', value: row.sleepTime || '—' },
    { label: '起床', value: row.wakeTime || '—' },
    { label: '时长', value: row.durationHours != null ? Number(row.durationHours).toFixed(1) + ' h' : '—' },
    { label: '质量', value: row.quality >= 4 ? '优' : row.quality === 3 ? '良' : row.quality === 2 ? '中' : '差' },
    { label: '备注', value: row.note || '—' }
  ]
}

import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import WorkbenchHealthReminders from './WorkbenchHealthReminders.vue'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { injectHealthStore, type HealthStoreLike } from '@/composables/healthStoreContext'
import { calcDailyAttainment, sleepDurationHours } from '@/composables/healthCore'
import { localToday } from '@/composables/todoCore'
import type { SleepRecord } from '@/types'
import { usePageSize } from '@/composables/usePageSize'

// store 来源可注入：默认成人端 store，学生端容器 provide 自己的 store 后自动改为学生数据（见 healthStoreContext）
const store = (injectHealthStore() ?? useWorkbenchHealthStore()) as HealthStoreLike

// ===== 顶部目标卡 =====
const todayStr = localToday()

const targetView = computed<{ label: string; current: number; target: number; percent: number } | null>(() => {
  const plan = store.plans.sleep
  if (!plan) return null
  const a = calcDailyAttainment(store.records.sleep, store.plans.sleep, todayStr)
  return {
    label: `每日睡眠目标 ${plan.target} 小时`,
    current: a?.current ?? 0,
    target: a?.target ?? plan.target,
    percent: Math.floor(Math.min(a?.percent ?? 0, 1) * 100)
  }
})

// 今日记录 & 最近一条（空态辅助文字用）
const todayRecords = computed<SleepRecord[]>(() => store.records.sleep.filter(r => r.date === todayStr))
const latestRecord = computed<SleepRecord | null>(() => {
  const recs = store.records.sleep.slice().sort((a, b) => (a.date < b.date ? 1 : -1))
  return recs[0] ?? null
})

function fmtHours(h: number): string {
  if (!isFinite(h)) return '—'
  const rounded = Math.round(h * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

// ===== 目标弹框（sleep metric=duration，period=daily，不暴露选择器）=====
const showTargetDialog = ref(false)
const formTarget = ref('')

const isTargetValid = computed(() => {
  const t = Number(formTarget.value)
  return Number.isFinite(t) && t > 0
})

function openTargetDialog(): void {
  const plan = store.plans.sleep
  formTarget.value = plan ? String(plan.target) : '8'
  showTargetDialog.value = true
}

function closeTargetDialog(): void {
  showTargetDialog.value = false
}

async function handleSaveTarget(): Promise<void> {
  if (!isTargetValid.value) return
  await store.setPlan('sleep', { metric: 'duration', period: 'daily', target: Number(formTarget.value) })
  closeTargetDialog()
}

async function handleClearTarget(): Promise<void> {
  if (confirm('确定要清除每日睡眠目标吗？')) {
    await store.setPlan('sleep', null)
    closeTargetDialog()
  }
}

// ===== 列表排序（date 倒序 → 入睡倒序 → id 稳定）=====
const sortedRecords = computed<SleepRecord[]>(() => {
  return store.records.sleep.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.sleepTime !== b.sleepTime) return (a.sleepTime ?? '') < (b.sleepTime ?? '') ? 1 : -1
    return (a.id ?? '').localeCompare(b.id ?? '')
  })
})

// ===== 新增/编辑记录表单 =====
const showRecordDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localToday())
const formSleepTime = ref('')
const formWakeTime = ref('')
const formQuality = ref('3')
const formNote = ref('')

// ===== 列表弹框 + 分页（每页 10 条）=====
const LIST_PAGE_SIZE = 10
const { pageSize, PAGE_SIZES } = usePageSize('ex-list-pager', LIST_PAGE_SIZE)
const showListDialog = ref(false)
const listPage = ref(1)
const listPageItems = computed<SleepRecord[]>(() => {
  const arr = sortedRecords.value
  const start = (listPage.value - 1) * pageSize.value
  return arr.slice(start, start + pageSize.value)
})
function openListDialog(): void { listPage.value = 1; showListDialog.value = true }
function closeListDialog(): void { showListDialog.value = false }

// date 必填 + 入睡/起床时间 必填，否则保存按钮 disabled
const isFormValid = computed(() => {
  return formDate.value !== '' && formSleepTime.value !== '' && formWakeTime.value !== ''
})

// 时长只读预览：实时用 healthCore sleepDurationHours 计算（同刻 = 24h 规则）
const previewDurationText = computed(() => {
  if (formSleepTime.value === '' || formWakeTime.value === '') return '—'
  return `约 ${fmtHours(sleepDurationHours(formSleepTime.value, formWakeTime.value))} 小时`
})

// 入睡=起床 → healthCore 记为 24h，提示但允许保存
const isSameTime = computed(() => {
  return formSleepTime.value !== '' && formWakeTime.value !== '' && formSleepTime.value === formWakeTime.value
})

function startAddRecord(): void {
  editingId.value = null
  formDate.value = localToday()
  formSleepTime.value = ''
  formWakeTime.value = ''
  formQuality.value = '3'
  formNote.value = ''
  showRecordDialog.value = true
}

function startEditRecord(id: string): void {
  const rec = store.records.sleep.find(r => r.id === id)
  if (!rec) return
  editingId.value = id
  formDate.value = rec.date
  formSleepTime.value = rec.sleepTime
  formWakeTime.value = rec.wakeTime
  formQuality.value = String(rec.quality)
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
    sleepTime: formSleepTime.value,
    wakeTime: formWakeTime.value,
    durationHours: sleepDurationHours(formSleepTime.value, formWakeTime.value),
    quality: Number(formQuality.value)
  }
  if (note) payload.note = note
  if (editingId.value) {
    await store.updateRecord('sleep', editingId.value, payload)
  } else {
    await store.addRecord('sleep', payload)
  }
  listPage.value = 1
  cancelRecordForm()
}

async function handleDeleteRecord(id: string): Promise<void> {
  if (confirm('确定要删除这条睡眠记录吗？')) {
    await store.deleteRecord('sleep', id)
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
  <div class="wb-exercise">
    <!-- 顶部目标卡（复用 stat-card 结构） -->
    <div class="stat-card">
      <div class="stat-header">
        <Icon name="sleep" :size="16" class="stat-icon" />
        <span class="stat-label">睡眠目标</span>
        <div class="stat-panel-actions">
          <el-button class="btn-add" data-testid="sl-add" @click="startAddRecord">＋ 新增</el-button>
          <el-button
            v-if="store.records.sleep.length > 0"
            class="btn-manage"
            data-testid="sl-toggle-list"
            @click="openListDialog"
          >
            查看（{{ store.records.sleep.length }}）
          </el-button>
        </div>
        <el-button v-if="targetView" class="nav-btn" data-testid="sl-edit-target" @click="openTargetDialog">
          调整目标
        </el-button>
        <el-button v-else class="nav-btn" data-testid="sl-target" @click="openTargetDialog">设定目标</el-button>
      </div>
      <template v-if="targetView">
        <div class="stat-value" data-testid="sl-plan-label">{{ targetView.label }}</div>
        <div v-if="todayRecords.length > 0" class="ex-attainment" data-testid="sl-attainment">
          今日 {{ fmtHours(targetView.current) }}/{{ fmtHours(targetView.target) }} 小时
        </div>
        <div v-else class="ex-attainment" data-testid="sl-attainment">
          今日暂无睡眠记录<span v-if="latestRecord"> · 最近一次 {{ fmtHours(latestRecord.durationHours) }} 小时</span>
        </div>
        <div class="ex-progress" data-testid="sl-progress">
          <div class="ex-progress-fill" :style="{ width: targetView.percent + '%' }"></div>
        </div>
      </template>
      <div v-else class="stat-sub">尚未设定每日睡眠目标</div>
    </div>

    <!-- 定时提醒（只读小模块） -->
    <WorkbenchHealthReminders module="sleep" />

    <!-- 操作栏（已移除：右上角 stat-panel-actions 代替） -->

    <!-- 空态 -->
    <div
      v-if="store.records.sleep.length === 0"
      class="empty-state empty-invite"
      data-testid="sl-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条睡眠记录
    </div>

    <!-- 记录列表弹框（Element Plus Table：日期/入睡/起床/时长/质量/备注/操作，每页 10 条） -->
    <Transition name="dialog">
      <div v-if="showListDialog" class="dialog-overlay list-dialog-overlay" @click.self="closeListDialog">
        <div class="dialog list-dialog" data-testid="sl-list-dialog">
          <div class="dialog-header">
            <h3>睡眠记录</h3>
            <ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" />
            <el-button class="close-btn" text @click="closeListDialog"><Icon name="close" /></el-button>
          </div>
          <div class="ex-list">
            <el-table v-if="vm.mode === 'list'" class="ewt-table"
              :data="listPageItems"
              stripe
              border
              size="default"
              style="width: 100%"
              height="100%"
              empty-text="暂无睡眠记录"
            >
              <el-table-column label="日期" width="130" align="center">
                <template #default="{ row }">{{ row.date }}</template>
              </el-table-column>
              <el-table-column label="入睡 🌙" width="120" align="center">
                <template #default="{ row }">{{ row.sleepTime || '—' }}</template>
              </el-table-column>
              <el-table-column label="起床 ☀️" width="120" align="center">
                <template #default="{ row }">{{ row.wakeTime || '—' }}</template>
              </el-table-column>
              <el-table-column label="时长(h)" width="110" align="right">
                <template #default="{ row }">
                  <span style="font-weight:700;color:var(--color-success,#16a34a);font-variant-numeric: tabular-nums;">
                    {{ fmtHours(row.durationHours) }} h
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="质量" width="110" align="center">
                <template #default="{ row }">
                  <span :title="'★'.repeat(row.quality)" :class="`sl-quality-${row.quality}`">
                    {{ row.quality >= 4 ? '优' : row.quality === 3 ? '良' : row.quality === 2 ? '中' : '差' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="备注" min-width="200" align="center" show-overflow-tooltip>
                <template #default="{ row }">
                  <span v-if="row.note">{{ row.note }}</span>
                  <span v-else style="color: var(--color-text-secondary,#9ca3af);">—</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" class-name="ewt-op-col" width="150" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button class="btn-edit" :data-testid="`sl-edit-${row.id}`" @click="startEditRecord(row.id)" style="margin-right:6px;">编辑</el-button>
                  <el-button class="btn-delete" :data-testid="`sl-delete-${row.id}`" @click="handleDeleteRecord(row.id)">删除</el-button>
                </template>
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
          <div class="ex-list-pager ewt-pager">
            <el-pagination
              v-model:current-page="listPage"
              @size-change="listPage = 1"
              v-model:page-size="pageSize"
              :page-sizes="PAGE_SIZES"
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
      <div class="dialog" data-testid="sl-dialog">
        <div class="dialog-header">
          <h3>{{ targetView ? '调整目标' : '设定目标' }}</h3>
          <el-button class="close-btn" text @click="closeTargetDialog"><Icon name="close" /></el-button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSaveTarget">
          <div class="form-group">
            <label>每日目标（小时）*</label>
            <el-input-number
              :model-value="formTarget === '' ? undefined : Number(formTarget)"
              :min="0.1"
              :step="0.1"
             
              placeholder="例如：8"
              data-testid="sl-target-input"
              :controls="false"
              :precision="1"
              @update:model-value="formTarget = $event == null ? '' : String($event)"
            />
          </div>

          <div class="form-actions">
            <el-button
              v-if="targetView"
              native-type="button"
              class="btn-clear"
              data-testid="sl-clear-target"
              @click="handleClearTarget"
            >
              清除目标
            </el-button>
            <span class="form-actions-spacer"></span>
            <el-button native-type="button" class="btn-cancel" data-testid="sl-cancel-target" @click="closeTargetDialog">
              取消
            </el-button>
            <el-button native-type="submit" class="btn-save" :disabled="!isTargetValid" data-testid="sl-save-target">保存</el-button>
          </div>
        </form>
      </div>
    </div>
    </Transition>

    <!-- 新增/编辑记录弹框 -->
    <Transition name="dialog">
    <div v-if="showRecordDialog" class="dialog-overlay record-dialog-overlay" @click.self="cancelRecordForm">
      <div class="dialog" data-testid="sl-dialog">
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
                class="field-date"
                data-testid="sl-form-date"
              />
            </div>
            <div class="field">
              <label class="field-label">睡眠质量 *</label>
              <el-select v-model="formQuality" class="field-type" data-testid="sl-form-quality">
                <el-option v-for="n in 5" :key="n" :value="String(n)" :label="`${n} 星`" />
              </el-select>
            </div>
          </div>

          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">入睡时间 *</label>
              <el-time-picker
                v-model="formSleepTime"
                format="HH:mm"
                value-format="HH:mm"
                class="field-time"
                data-testid="sl-form-sleep-time"
              />
            </div>
            <div class="field">
              <label class="field-label">起床时间 *</label>
              <el-time-picker
                v-model="formWakeTime"
                format="HH:mm"
                value-format="HH:mm"
                class="field-time"
                data-testid="sl-form-wake-time"
              />
            </div>
          </div>

          <div class="form-group">
            <label>睡眠时长（只读预览）</label>
            <div class="form-input" data-testid="sl-form-duration-preview">{{ previewDurationText }}</div>
          </div>

          <div v-if="isSameTime" class="form-hint" data-testid="sl-same-time-hint">
            入睡与起床时间相同将记为 24 小时
          </div>

          <div class="form-group">
            <label>备注（可选）</label>
            <el-input
              v-model="formNote"
              type="textarea"
              :rows="2"
              class="desc-input"
              placeholder="补充说明…"
              data-testid="sl-form-note"
            />
          </div>

          <div class="form-actions ewt-dialog-footer">
            <el-button native-type="button" class="btn-cancel" data-testid="sl-cancel-record" @click="cancelRecordForm">
              取消
            </el-button>
            <el-button native-type="submit" class="btn-save" :disabled="!isFormValid" data-testid="sl-save-record">
              {{ editingId ? '保存' : '添加' }}
            </el-button>
            <el-button v-if="editingId" type="danger" native-type="button" data-testid="sl-record-delete" @click="handleDeleteRecord(editingId)">删除</el-button>
          </div>
        </form>
      </div>
    </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 面板容器（样式体系与 WorkbenchExercise.vue 完全一致，仅业务字段不同） */
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

/* ===== 操作栏（已废弃：stat-panel-actions 代替） ===== */

/* ===== stat-card 右上角按钮组（与 Exercise/Diet/Weight 一致） ===== */
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
.ex-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
}

.ex-item {
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

.ex-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ex-date {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.ex-type-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

.ex-meta {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.ex-note {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 0;
}

.ex-actions {
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

.field-type {
  width: 140px;
}

.field-time {
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

/* 入睡=起床（24h 规则）提示 */
.form-hint {
  font-size: 12px;
  color: var(--color-error, var(--color-error));
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
  .field-type,
  .field-time {
    width: 100%;
  }
}

/* 旧的 .ex-list（5 列卡片网格）废弃：现在 Sleep 列表用 ElTable，.ex-list 重定义为 ElTable 容器（与 Weight 一致） */
.ex-list {
  padding: 16px 20px 0 20px;
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.ex-list > :global(.el-table) {
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
.ex-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.ex-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .ex-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .ex-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .ex-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
/* 强制：每个非 fixed 列 cell 都有最小内容宽，避免整体缩成只剩日期+操作 */
.ex-list > :global(.el-table .el-table__body-wrapper .cell),
.ex-list > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
  white-space: nowrap;
}

.ex-list-pager {
  flex: 0 0 auto;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .ex-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

/* 睡眠质量文字色（sl-quality-1..5） */
.sl-quality-1 { color:#ef4444; font-weight:600; }
.sl-quality-2 { color:#f97316; font-weight:600; }
.sl-quality-3 { color:#3b82f6; font-weight:600; }
.sl-quality-4 { color:#10b981; font-weight:700; }
.sl-quality-5 { color:#059669; font-weight:700; }

/* 移动端 ≤768px：表单字段全宽 */
@media (max-width: 768px) {
  .stat-panel-actions { margin-left: 0; width: 100%; }
  .stat-panel-actions .btn-add, .stat-panel-actions .btn-manage { flex: 1; text-align: center; }
}

/* ===== 记录列表弹框：Element Plus Table + 分页（85vw×85vh，与 Exercise 完全一致）—— 必须放在 .dialog 基础类之后覆盖 ===== */
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

  .wb-exercise {
    flex: 1;
    min-height: 0;
  }

  .ex-list-scroll {
    overflow-y: auto;
  }
}
</style>