<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { calcBmi, classifyBmi, dietCalories, weightChartScale, weightTarget } from '@/composables/healthCore'
import type { WeightChartPoint } from '@/composables/healthCore'
import { localToday } from '@/composables/todoCore'

const store = useWorkbenchHealthStore()

// ===== BMI 状态徽章（四色，分类必须调 healthCore classifyBmi）=====
type BmiClass = ReturnType<typeof classifyBmi>

const BMI_META: Record<BmiClass, { label: string; className: string }> = {
  under: { label: '偏瘦', className: 'bmi-under' },
  normal: { label: '正常', className: 'bmi-normal' },
  overweight: { label: '超重', className: 'bmi-overweight' },
  obese: { label: '肥胖', className: 'bmi-obese' }
}

// ===== 最近体重 + BMI（date 降序，同日 createdAt 降序取第一条）=====
const sortedWeightRecords = computed(() => {
  return [...store.records.weight].sort((a, b) =>
    a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
  )
})

const recentWeight = computed(() => sortedWeightRecords.value[0] ?? null)

// BMI 必须调 healthCore 纯函数（组件禁止重算）；身高或体重缺失 → null → 显示「—」防 NaN
const bmi = computed<number | null>(() => calcBmi(recentWeight.value?.weightKg, store.height))

const bmiStatus = computed<BmiClass | null>(() => (bmi.value === null ? null : classifyBmi(bmi.value)))

// ===== 减肥建议卡（仅 overweight/obese 且身高已设置）=====
const adviceTarget = computed<number | null>(() => {
  if (store.height === undefined) return null
  if (bmi.value === null) return null
  const status = classifyBmi(bmi.value)
  if (status !== 'overweight' && status !== 'obese') return null
  return weightTarget(store.height)
})

const adviceCalories = computed<number>(() => (adviceTarget.value === null ? 0 : dietCalories(adviceTarget.value)))

// ===== SVG 折线图（零依赖，坐标必须调 healthCore weightChartScale）=====
const CHART_W = 600
const CHART_H = 220
const CHART_PAD = 24 // 与 weightChartScale 默认 pad 一致
const GRID_COUNT = 4

const chartScale = computed(() => weightChartScale(store.records.weight, CHART_W, CHART_H))

const chartPoints = computed<WeightChartPoint[]>(() => chartScale.value?.points ?? [])

// Y 轴 4 条水平网格线（minY/maxY 之间均分）+ 数值标签（像素公式与 weightChartScale 一致）
const gridLines = computed<{ y: number; label: string }[]>(() => {
  const s = chartScale.value
  if (!s) return []
  const { minY, maxY } = s
  const span = maxY - minY
  const inner = CHART_H - 2 * CHART_PAD
  const lines: { y: number; label: string }[] = []
  for (let i = 0; i < GRID_COUNT; i++) {
    const v = minY + (span * i) / (GRID_COUNT - 1)
    const y = CHART_PAD + (1 - (v - minY) / span) * inner
    lines.push({ y: Math.round(y * 100) / 100, label: fmtAxis(v) })
  }
  return lines
})

// X 轴首尾日期标签（首点与末点 date）
const chartXLabels = computed<{ x: number; date: string; anchor: 'start' | 'end' }[]>(() => {
  const pts = chartPoints.value
  if (pts.length === 0) return []
  if (pts.length === 1) return [{ x: pts[0].x, date: pts[0].date, anchor: 'start' }]
  return [
    { x: pts[0].x, date: pts[0].date, anchor: 'start' },
    { x: pts[pts.length - 1].x, date: pts[pts.length - 1].date, anchor: 'end' }
  ]
})

function fmtAxis(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

// ===== 身高弹框 =====
const showHeightDialog = ref(false)
const formHeight = ref('')

function openHeightDialog(): void {
  formHeight.value = store.height === undefined ? '' : String(store.height)
  showHeightDialog.value = true
}

function closeHeightDialog(): void {
  showHeightDialog.value = false
}

// 100-250 整数必填，越界/小数 → 保存按钮 disabled
const isHeightValid = computed(() => {
  const h = Number(formHeight.value)
  return formHeight.value !== '' && Number.isInteger(h) && h >= 100 && h <= 250
})

async function handleSaveHeight(): Promise<void> {
  if (!isHeightValid.value) return
  await store.setHeight(Number(formHeight.value))
  closeHeightDialog()
}

// ===== 记录表单（新增/编辑共用弹框）=====
const showRecordDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localToday())
const formWeightKg = ref('')
const formNote = ref('')

// ===== 记录列表展开/折叠（默认收起；折叠仅隐藏列表，计数/图表不受影响）=====
const listExpanded = ref(false)

// date 必填 + weightKg > 0（允许 1 位小数），否则保存按钮 disabled
const isRecordValid = computed(() => {
  const w = Number(formWeightKg.value)
  return formDate.value !== '' && formWeightKg.value !== '' && Number.isFinite(w) && w > 0
})

function startAddRecord(): void {
  editingId.value = null
  formDate.value = localToday()
  formWeightKg.value = ''
  formNote.value = ''
  showRecordDialog.value = true
}

function startEditRecord(id: string): void {
  const rec = store.records.weight.find(r => r.id === id)
  if (!rec) return
  editingId.value = id
  formDate.value = rec.date
  formWeightKg.value = String(rec.weightKg)
  formNote.value = rec.note ?? ''
  showRecordDialog.value = true
}

function cancelRecordForm(): void {
  showRecordDialog.value = false
  editingId.value = null
}

async function handleSaveRecord(): Promise<void> {
  if (!isRecordValid.value) return
  const note = formNote.value.trim()
  const payload: Record<string, unknown> = {
    date: formDate.value,
    weightKg: Number(formWeightKg.value)
  }
  if (note) payload.note = note
  if (editingId.value) {
    await store.updateRecord('weight', editingId.value, payload)
  } else {
    await store.addRecord('weight', payload)
  }
  cancelRecordForm()
}

async function handleDeleteRecord(id: string): Promise<void> {
  if (confirm('确定要删除这条体重记录吗？')) {
    await store.deleteRecord('weight', id)
  }
}

// ESC 关闭弹框（先关记录弹框，再关身高弹框）
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (showRecordDialog.value) {
    event.preventDefault()
    cancelRecordForm()
  } else if (showHeightDialog.value) {
    event.preventDefault()
    closeHeightDialog()
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
  <div class="wb-weight">
    <!-- 顶部信息区（一排两卡） -->
    <div class="wt-top-cards">
      <!-- 身高卡 -->
      <div class="stat-card" data-testid="wt-height-card">
        <div class="stat-header">
          <span class="stat-icon">📏</span>
          <span class="stat-label">身高</span>
          <button class="nav-btn" data-testid="wt-set-height" @click="openHeightDialog">
            {{ store.height !== undefined ? '修改' : '设置' }}
          </button>
        </div>
        <div v-if="store.height !== undefined" class="stat-value" data-testid="wt-height-value">
          身高 {{ store.height }} cm
        </div>
        <div v-else class="stat-sub" data-testid="wt-height-empty">未设置身高</div>
      </div>

      <!-- 最近体重 + BMI 卡 -->
      <div class="stat-card" data-testid="wt-bmi-card">
        <div class="stat-header">
          <span class="stat-icon">⚖️</span>
          <span class="stat-label">最近体重 · BMI</span>
        </div>
        <div class="wt-bmi-row">
          <span v-if="recentWeight" class="stat-value wt-recent-weight" data-testid="wt-recent-weight">
            {{ recentWeight.weightKg }} kg
          </span>
          <span v-else class="wt-bmi-dash" data-testid="wt-recent-weight">—</span>
          <span v-if="bmi !== null" class="wt-bmi-value" data-testid="wt-bmi">BMI {{ bmi.toFixed(1) }}</span>
          <span v-else class="wt-bmi-dash" data-testid="wt-bmi">—</span>
          <span v-if="bmiStatus" class="wt-status-badge" :class="BMI_META[bmiStatus].className" data-testid="wt-status">
            {{ BMI_META[bmiStatus].label }}
          </span>
        </div>
      </div>
    </div>

    <!-- 减肥建议卡（仅 overweight/obese 且身高已设置） -->
    <div v-if="adviceTarget !== null" class="stat-card wt-advice" data-testid="wt-advice">
      <div class="stat-header">
        <span class="stat-icon">🎯</span>
        <span class="stat-label">减肥建议</span>
      </div>
      <div class="wt-advice-row">
        <span class="wt-advice-item" data-testid="wt-advice-target">减肥体重 {{ adviceTarget }} kg</span>
        <span class="wt-advice-item" data-testid="wt-advice-calories">
          建议每日摄入约 {{ adviceCalories }} 千卡（估算值）
        </span>
      </div>
    </div>

    <!-- 体重趋势折线图（内联 SVG，零依赖） -->
    <div class="stat-card wt-chart-card" data-testid="wt-chart-card">
      <div class="stat-header">
        <span class="stat-icon">📈</span>
        <span class="stat-label">体重趋势</span>
      </div>
      <svg
        v-if="chartScale"
        viewBox="0 0 600 220"
        width="100%"
        height="220"
        preserveAspectRatio="xMidYMid meet"
        class="wt-chart-svg"
        data-testid="wt-chart"
      >
        <!-- Y 轴 4 条水平网格线 + 数值标签 -->
        <g>
          <line
            v-for="g in gridLines"
            :key="'grid-' + g.y"
            class="wt-chart-gridline"
            x1="0"
            x2="600"
            :y1="g.y"
            :y2="g.y"
          />
          <text
            v-for="g in gridLines"
            :key="'val-' + g.y"
            class="wt-chart-value-label"
            x="6"
            :y="g.y + 4"
            font-size="11"
            text-anchor="start"
          >
            {{ g.label }}
          </text>
        </g>

        <!-- X 轴首尾日期标签 -->
        <g>
          <text
            v-for="l in chartXLabels"
            :key="'date-' + l.x + '-' + l.date"
            class="wt-chart-date-label"
            :x="l.x"
            y="214"
            font-size="11"
            :text-anchor="l.anchor"
          >
            {{ l.date }}
          </text>
        </g>

        <!-- 折线（≥2 点）+ 每点圆点（含 title 悬停提示） -->
        <polyline
          v-if="chartPoints.length >= 2"
          class="wt-chart-line"
          :points="chartPoints.map(p => p.x + ',' + p.y).join(' ')"
          fill="none"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle v-for="p in chartPoints" :key="p.date + '-' + p.weightKg" class="wt-chart-dot" :cx="p.x" :cy="p.y" r="4">
          <title>{{ p.date }} · {{ p.weightKg }} kg</title>
        </circle>
      </svg>
      <div v-else class="wt-chart-empty" data-testid="wt-chart-empty">暂无体重记录</div>
    </div>

    <!-- 操作栏：展开记录 + 新增 -->
    <div class="wt-headbar">
      <button
        v-if="store.records.weight.length > 0"
        class="btn-toggle-list"
        data-testid="wt-toggle-list"
        @click="listExpanded = !listExpanded"
      >
        {{ listExpanded ? '收起记录' : '展开记录' }}（{{ store.records.weight.length }}）
      </button>
      <button class="btn-add" data-testid="wt-add" @click="startAddRecord">＋ 新增体重</button>
    </div>

    <!-- 空态 -->
    <div
      v-if="store.records.weight.length === 0"
      class="empty-state empty-invite"
      data-testid="wt-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条体重记录
    </div>

    <!-- 记录列表（date 降序，同日 createdAt 降序） -->
    <div v-else-if="listExpanded" class="wt-list">
      <div v-for="rec in sortedWeightRecords" :key="rec.id" class="wt-item" data-testid="wt-item">
        <div class="wt-item-head">
          <span class="wt-date">{{ rec.date }}</span>
          <span class="wt-weight">{{ rec.weightKg }} kg</span>
        </div>
        <div v-if="rec.note" class="wt-note">{{ rec.note }}</div>
        <div class="wt-actions">
          <button class="btn-edit" :data-testid="`wt-edit-${rec.id}`" @click="startEditRecord(rec.id)">编辑</button>
          <button class="btn-delete" :data-testid="`wt-delete-${rec.id}`" @click="handleDeleteRecord(rec.id)">
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 身高设置弹框 -->
    <div v-if="showHeightDialog" class="dialog-overlay" @click.self="closeHeightDialog">
      <div class="dialog" data-testid="wt-height-dialog">
        <div class="dialog-header">
          <h3>设置身高</h3>
          <button class="close-btn" @click="closeHeightDialog">✕</button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSaveHeight">
          <div class="form-group">
            <label>身高（cm）*</label>
            <input
              v-model="formHeight"
              type="number"
              min="100"
              max="250"
              step="1"
              class="form-input"
              placeholder="例如：170"
              data-testid="wt-height-input"
            />
            <div class="field-hint">请输入 100-250 之间的整数</div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-cancel" data-testid="wt-height-cancel" @click="closeHeightDialog">
              取消
            </button>
            <button type="submit" class="btn-save" :disabled="!isHeightValid" data-testid="wt-height-save">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 新增/编辑记录弹框 -->
    <div v-if="showRecordDialog" class="dialog-overlay" @click.self="cancelRecordForm">
      <div class="dialog" data-testid="wt-dialog">
        <div class="dialog-header">
          <h3>{{ editingId ? '编辑记录' : '新增记录' }}</h3>
          <button class="close-btn" @click="cancelRecordForm">✕</button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSaveRecord">
          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">日期 *</label>
              <input v-model="formDate" type="date" class="form-input field-date" data-testid="wt-form-date" />
            </div>
            <div class="field">
              <label class="field-label">体重（kg）*</label>
              <input
                v-model="formWeightKg"
                type="number"
                min="0.1"
                step="0.1"
                class="form-input field-weight"
                placeholder="例如：75"
                data-testid="wt-form-weight"
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
              data-testid="wt-form-note"
            ></textarea>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-cancel" data-testid="wt-cancel-record" @click="cancelRecordForm">
              取消
            </button>
            <button type="submit" class="btn-save" :disabled="!isRecordValid" data-testid="wt-save-record">
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
.wb-weight {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 顶部信息区（一排两卡）===== */
.wt-top-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

/* ===== stat-card（复用 WorkbenchHome/Exercise 结构）===== */
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

/* ===== 最近体重 + BMI 行 ===== */
.wt-bmi-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.wt-bmi-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.wt-bmi-dash {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-muted, var(--color-text-muted));
}

/* BMI 状态徽章（四色，参照 prio-badge 体系） */
.wt-status-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  border: 1px solid transparent;
}

.bmi-under {
  color: #1d4ed8;
  background: #dbeafe;
  border-color: #93c5fd;
}

.bmi-normal {
  color: #15803d;
  background: #dcfce7;
  border-color: #86efac;
}

.bmi-overweight {
  color: #c2410c;
  background: #ffedd5;
  border-color: #fdba74;
}

.bmi-obese {
  color: #b91c1c;
  background: #fee2e2;
  border-color: #fca5a5;
}

/* ===== 减肥建议卡 ===== */
.wt-advice-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.wt-advice-item {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

/* ===== 折线图卡 ===== */
.wt-chart-svg {
  display: block;
  width: 100%;
  height: 220px;
}

.wt-chart-gridline {
  stroke: var(--border-color, #e2e8f0);
  stroke-dasharray: 4 4;
}

.wt-chart-value-label,
.wt-chart-date-label {
  fill: var(--text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.wt-chart-line {
  stroke: var(--accent-color, var(--color-primary));
}

.wt-chart-dot {
  fill: var(--accent-color, var(--color-primary));
}

.wt-chart-empty {
  padding: 36px 16px;
  text-align: center;
  color: var(--text-muted, var(--color-text-muted));
  font-size: 14px;
}

/* ===== 操作栏 ===== */
.wt-headbar {
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

/* ===== 记录列表 ===== */
.wt-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wt-item {
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

.wt-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wt-date {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.wt-weight {
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--accent-color, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.wt-note {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 0;
}

.wt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}

/* ===== 按钮（复用 WorkbenchTodo/Exercise 体系）===== */
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

/* ===== 弹框（复用 WorkbenchTodo/Exercise 体系）===== */
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

.field-hint {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
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

.field-weight {
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

:root.dark .wt-item {
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

:root.dark .wt-date {
  color: var(--text-primary, #f9fafb);
}

:root.dark .wt-note {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .wt-weight {
  color: #93c5fd;
}

:root.dark .bmi-under {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

:root.dark .bmi-normal {
  color: #86efac;
  background: rgba(22, 163, 74, 0.2);
  border-color: rgba(34, 197, 94, 0.45);
}

:root.dark .bmi-overweight {
  color: #fdba74;
  background: rgba(249, 115, 22, 0.2);
  border-color: rgba(249, 115, 22, 0.45);
}

:root.dark .bmi-obese {
  color: #fca5a5;
  background: rgba(185, 28, 28, 0.35);
  border-color: #991b1b;
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
  .wt-top-cards {
    grid-template-columns: 1fr;
  }

  .field-date,
  .field-weight {
    width: 100%;
  }
}
</style>
