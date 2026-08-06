<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { calcDailyAttainment, sleepDurationHours } from '@/composables/healthCore'
import { localToday } from '@/composables/todoCore'

const store = useWorkbenchHealthStore()

// ===== 顶部目标卡 =====
const todayStr = localToday()

// 小时数展示：整数去尾 0，小数保留 1 位（如 7 / 7.5）
function fmtHours(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// 今日进度禁止在组件内重算，必须调 healthCore 纯函数（sleep 分支 ΣdurationHours）
const targetView = computed<{ label: string; current: number; target: number; percent: number } | null>(() => {
  const plan = store.plans.sleep
  if (!plan) return null
  const a = calcDailyAttainment(store.records.sleep, store.plans.sleep, todayStr)
  return {
    label: `每日睡眠目标 ${fmtHours(plan.target)} 小时`,
    current: a?.current ?? 0,
    target: a?.target ?? plan.target,
    // 进度条宽度 = min(percent,1)*100%（取整显示，超量钳到 100%）
    percent: Math.floor(Math.min(a?.percent ?? 0, 1) * 100)
  }
})

// ===== 目标弹框（睡眠目标固定 duration/daily）=====
const showTargetDialog = ref(false)
const formTarget = ref('')

// 目标必须 > 0（允许 1 位小数），否则保存按钮 disabled
const isTargetValid = computed(() => {
  const t = Number(formTarget.value)
  return Number.isFinite(t) && t > 0
})

function openTargetDialog(): void {
  const plan = store.plans.sleep
  formTarget.value = plan ? String(plan.target) : ''
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
  if (confirm('确定要清除睡眠目标吗？')) {
    await store.setPlan('sleep', null)
    closeTargetDialog()
  }
}

// ===== 记录列表（date 降序，同日按 createdAt 降序）=====
const sortedRecords = computed(() => {
  return [...store.records.sleep].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
  )
})

const todayRecords = computed(() => store.records.sleep.filter(r => r.date === todayStr))
// 最近一次记录（列表第一条）
const latestRecord = computed(() => sortedRecords.value[0] ?? null)

// ===== 记录表单（新增/编辑共用弹框）=====
const showRecordDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localToday())
const formSleepTime = ref('')
const formWakeTime = ref('')
const formQuality = ref('3')
const formNote = ref('')

// date + 入睡/起床时间 必填，否则保存按钮 disabled
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
  cancelRecordForm()
}

async function handleDeleteRecord(id: string): Promise<void> {
  if (confirm('确定要删除这条睡眠记录吗？')) {
    await store.deleteRecord('sleep', id)
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
  <div class="wb-exercise">
    <!-- 顶部目标卡（复用 stat-card 结构） -->
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-icon">😴</span>
        <span class="stat-label">睡眠目标</span>
        <button v-if="targetView" class="nav-btn" data-testid="sl-edit-target" @click="openTargetDialog">
          调整目标
        </button>
        <button v-else class="nav-btn" data-testid="sl-target" @click="openTargetDialog">设定目标</button>
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

    <!-- 操作栏：数量 + 新增 -->
    <div class="ex-headbar">
      <span class="toolbar-count" data-testid="sl-toolbar-count">共 {{ store.records.sleep.length }} 条</span>
      <button class="btn-add" data-testid="sl-add" @click="startAddRecord">＋ 新增记录</button>
    </div>

    <!-- 空态 -->
    <div
      v-if="store.records.sleep.length === 0"
      class="empty-state empty-invite"
      data-testid="sl-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条睡眠记录
    </div>

    <!-- 记录列表 -->
    <div v-else class="ex-list">
      <div v-for="rec in sortedRecords" :key="rec.id" class="ex-item" data-testid="sl-item">
        <div class="ex-item-head">
          <span class="ex-date">{{ rec.date }}</span>
          <span class="ex-type-badge">{{ rec.sleepTime }} → {{ rec.wakeTime }}</span>
        </div>
        <div class="ex-meta">{{ fmtHours(rec.durationHours) }} 小时 · {{ '★'.repeat(rec.quality) }}</div>
        <div v-if="rec.note" class="ex-note">{{ rec.note }}</div>
        <div class="ex-actions">
          <button class="btn-edit" :data-testid="`sl-edit-${rec.id}`" @click="startEditRecord(rec.id)">编辑</button>
          <button class="btn-delete" :data-testid="`sl-delete-${rec.id}`" @click="handleDeleteRecord(rec.id)">
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 目标弹框 -->
    <div v-if="showTargetDialog" class="dialog-overlay" @click.self="closeTargetDialog">
      <div class="dialog" data-testid="sl-dialog">
        <div class="dialog-header">
          <h3>{{ targetView ? '调整目标' : '设定目标' }}</h3>
          <button class="close-btn" @click="closeTargetDialog">✕</button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSaveTarget">
          <div class="form-group">
            <label>每日目标（小时）*</label>
            <input
              v-model="formTarget"
              type="number"
              min="0.1"
              step="0.1"
              class="form-input"
              placeholder="例如：8"
              data-testid="sl-target-input"
            />
          </div>

          <div class="form-actions">
            <button
              v-if="targetView"
              type="button"
              class="btn-clear"
              data-testid="sl-clear-target"
              @click="handleClearTarget"
            >
              清除目标
            </button>
            <span class="form-actions-spacer"></span>
            <button type="button" class="btn-cancel" data-testid="sl-cancel-target" @click="closeTargetDialog">
              取消
            </button>
            <button type="submit" class="btn-save" :disabled="!isTargetValid" data-testid="sl-save-target">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 新增/编辑记录弹框 -->
    <div v-if="showRecordDialog" class="dialog-overlay" @click.self="cancelRecordForm">
      <div class="dialog" data-testid="sl-dialog">
        <div class="dialog-header">
          <h3>{{ editingId ? '编辑记录' : '新增记录' }}</h3>
          <button class="close-btn" @click="cancelRecordForm">✕</button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSaveRecord">
          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">日期 *</label>
              <input v-model="formDate" type="date" class="form-input field-date" data-testid="sl-form-date" />
            </div>
            <div class="field">
              <label class="field-label">睡眠质量 *</label>
              <select v-model="formQuality" class="form-input field-type" data-testid="sl-form-quality">
                <option v-for="n in 5" :key="n" :value="String(n)">{{ n }} 星</option>
              </select>
            </div>
          </div>

          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">入睡时间 *</label>
              <input
                v-model="formSleepTime"
                type="time"
                class="form-input field-time"
                data-testid="sl-form-sleep-time"
              />
            </div>
            <div class="field">
              <label class="field-label">起床时间 *</label>
              <input v-model="formWakeTime" type="time" class="form-input field-time" data-testid="sl-form-wake-time" />
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
            <textarea
              v-model="formNote"
              class="form-input desc-input"
              rows="2"
              placeholder="补充说明…"
              data-testid="sl-form-note"
            ></textarea>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-cancel" data-testid="sl-cancel-record" @click="cancelRecordForm">
              取消
            </button>
            <button type="submit" class="btn-save" :disabled="!isFormValid" data-testid="sl-save-record">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </div>
        </form>
      </div>
    </div>
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

/* 达标行 + 进度条（--accent-color） */
.ex-attainment {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.ex-progress {
  height: 8px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-secondary, var(--color-bg-hover));
  overflow: hidden;
}

.ex-progress-fill {
  height: 100%;
  border-radius: var(--radius-full, 999px);
  background: var(--accent-color, var(--color-primary));
  transition: width var(--transition-fast, 0.15s ease);
}

/* ===== 操作栏 ===== */
.ex-headbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
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

/* ===== 记录列表 ===== */
.ex-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ex-item {
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
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.ex-type-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--accent-color, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--accent-color, #3b82f6) 30%, transparent);
}

.ex-meta {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.ex-note {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
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

.field-type {
  width: 140px;
}

.field-time {
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

/* 入睡=起床（24h 规则）提示 */
.form-hint {
  font-size: 12px;
  color: var(--error-color, var(--color-error));
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

:root.dark .ex-item {
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

:root.dark .ex-date {
  color: var(--text-primary, #f9fafb);
}

:root.dark .ex-meta,
:root.dark .ex-note {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .ex-type-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

:root.dark .ex-progress {
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

:root.dark .btn-cancel,
:root.dark .btn-edit,
:root.dark .btn-delete {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

@media (max-width: 640px) {
  .field-date,
  .field-type,
  .field-time {
    width: 100%;
  }
}
</style>
