<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWorkbenchHealthStore } from '@/stores/workbenchHealth'
import { calcBmi, classifyBmi, dietCalories, weightChartScale, weightTarget } from '@/composables/healthCore'
import type { WeightChartPoint } from '@/composables/healthCore'
import { localToday } from '@/composables/todoCore'
import Icon from '@/components/Icon.vue'

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

// ===== 体重记录弹框（Element Plus Table，每页 10 条）=====
const showRecordsDialog = ref(false)
const listPage = ref(1)
const LIST_PAGE_SIZE = 10

// 与其他面板统一命名
const sortedRecords = computed(() => sortedWeightRecords.value)

const listPageItems = computed(() => {
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return sortedRecords.value.slice(start, start + LIST_PAGE_SIZE)
})

function toggleList(): void {
  listPage.value = 1
  showRecordsDialog.value = true
}

function closeRecordsDialog(): void {
  showRecordsDialog.value = false
}

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

// ESC 关闭弹框（先关记录列表弹框，再关记录表单弹框，最后关身高弹框）
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (showRecordsDialog.value) {
    event.preventDefault()
    closeRecordsDialog()
  } else if (showRecordDialog.value) {
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

      <!-- 最近体重 + BMI 卡（右上角挂：新增/查看） -->
      <div class="stat-card" data-testid="wt-bmi-card">
        <div class="stat-header">
          <Icon name="weight" :size="16" class="stat-icon" />
          <span class="stat-label">最近体重 · BMI</span>
          <div class="stat-panel-actions">
            <button class="btn-add" data-testid="wt-add" @click="startAddRecord">＋ 新增</button>
            <button
              v-if="store.records.weight.length > 0"
              class="btn-manage"
              data-testid="wt-toggle-list"
              @click="toggleList"
            >
              查看（{{ store.records.weight.length }}）
            </button>
          </div>
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
        <Icon name="target" :size="16" class="stat-icon" />
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
        <Icon name="profit" :size="16" class="stat-icon" />
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

    <!-- 操作栏（已移除：右上角 stat-panel-actions 代替） -->

    <!-- 空态 -->
    <div
      v-if="store.records.weight.length === 0"
      class="empty-state empty-invite"
      data-testid="wt-empty"
      @click="startAddRecord"
    >
      ＋ 新增第一条体重记录
    </div>

    <!-- 身高设置弹框 -->
    <Transition name="dialog">
    <div v-if="showHeightDialog" class="dialog-overlay" @click.self="closeHeightDialog">
      <div class="dialog" data-testid="wt-height-dialog">
        <div class="dialog-header">
          <h3>设置身高</h3>
          <button class="close-btn" @click="closeHeightDialog"><Icon name="close" /></button>
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
    </Transition>

    <!-- 新增/编辑记录弹框 -->
    <Transition name="dialog">
    <div v-if="showRecordDialog" class="dialog-overlay record-dialog-overlay" @click.self="cancelRecordForm">
      <div class="dialog" data-testid="wt-dialog">
        <div class="dialog-header">
          <h3>{{ editingId ? '编辑记录' : '新增记录' }}</h3>
          <button class="close-btn" @click="cancelRecordForm"><Icon name="close" /></button>
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
    </Transition>

    <!-- 体重记录弹框（Element Plus Table：日期/体重/BMI/目标进度/备注/操作，每页 10 条） -->
    <Transition name="dialog">
    <div v-if="showRecordsDialog" class="dialog-overlay list-dialog-overlay" @click.self="closeRecordsDialog">
      <div class="dialog list-dialog" data-testid="wt-records-dialog">
        <div class="dialog-header">
          <h3>体重记录（{{ store.records.weight.length }} 条）</h3>
          <button class="close-btn" data-testid="wt-records-close" @click="closeRecordsDialog"><Icon name="close" /></button>
        </div>
        <div class="wt-list">
          <el-table
            :data="listPageItems"
            stripe
            border
            size="default"
            style="width: 100%"
            height="100%"
            empty-text="暂无体重记录"
          >
            <el-table-column label="日期" width="130" align="center">
              <template #default="{ row }">{{ row.date }}</template>
            </el-table-column>
            <el-table-column label="体重(kg)" width="130" align="right">
              <template #default="{ row }">
                <span style="font-weight:700;font-variant-numeric: tabular-nums;">{{ row.weightKg }} kg</span>
              </template>
            </el-table-column>
            <el-table-column label="BMI" width="130" align="right">
              <template #default="{ row }">
                <span v-if="store.height !== undefined && bmi !== null" :class="BMI_META[classifyBmi(calcBmi(row.weightKg, store.height) ?? 20)].className">
                  {{ calcBmi(row.weightKg, store.height)?.toFixed(1) ?? '—' }}
                </span>
                <span v-else style="color: var(--color-text-secondary,#9ca3af);">未设身高</span>
              </template>
            </el-table-column>
            <el-table-column label="目标进度" width="160" align="right">
              <template #default="{ row }">
                <template v-if="adviceTarget !== null">
                  <span style="font-variant-numeric: tabular-nums;">
                    {{ row.weightKg > adviceTarget
                        ? `距目标 -${(row.weightKg - adviceTarget).toFixed(1)} kg`
                        : row.weightKg < adviceTarget
                        ? `距目标 +${(adviceTarget - row.weightKg).toFixed(1)} kg`
                        : '已达标 ✓' }}
                  </span>
                </template>
                <span v-else style="color: var(--color-text-secondary,#9ca3af);">未设身高</span>
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.note">{{ row.note }}</span>
                <span v-else style="color: var(--color-text-secondary,#9ca3af);">—</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" align="center" fixed="right">
              <template #default="{ row }">
                <button class="btn-edit" :data-testid="`wt-edit-${row.id}`" @click="showRecordsDialog = false; startEditRecord(row.id)" style="margin-right:6px;">编辑</button>
                <button class="btn-delete" :data-testid="`wt-delete-${row.id}`" @click="handleDeleteRecord(row.id)">删除</button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div class="wt-list-pager">
          <el-pagination
            v-model:current-page="listPage"
            :page-size="LIST_PAGE_SIZE"
            :page-sizes="[LIST_PAGE_SIZE]"
            layout="total, prev, pager, next, jumper"
            :total="sortedWeightRecords.length"
            background
            small
            prev-text="上一页"
            next-text="下一页"
          />
        </div>
      </div>
    </div>
    </Transition>
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
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.wt-bmi-dash {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-muted, var(--color-text-muted));
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
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}

/* ===== 折线图卡 ===== */
.wt-chart-svg {
  display: block;
  width: 100%;
  height: 220px;
}

.wt-chart-gridline {
  stroke: var(--color-border, #e2e8f0);
  stroke-dasharray: 4 4;
}

.wt-chart-value-label,
.wt-chart-date-label {
  fill: var(--color-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.wt-chart-line {
  stroke: var(--color-primary, var(--color-primary));
}

.wt-chart-dot {
  fill: var(--color-primary, var(--color-primary));
}

.wt-chart-empty {
  padding: 36px 16px;
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
}

/* ===== 操作栏（wt-headbar 已废弃：stat-panel-actions 替代） ===== */

/* ===== stat-card 右上角按钮组（与 Exercise 一致） ===== */
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

/* ===== 按钮（复用 WorkbenchTodo/Exercise 体系）===== */
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

/* 编辑/新增记录弹框需压在体重记录弹框（z-index:300，关闭时有过渡重叠）之上，否则从记录中编辑时看不见 */
.record-dialog-overlay { z-index: 320; }
.list-dialog-overlay { z-index: 310; }

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

/* 放在 .dialog 基础类之后，用 !important 覆盖 max-width: 480px / overflow-y:auto（否则列表只有 480px 宽） */
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

/* 旧 wt-records-dialog / wt-records-body / wt-records-grid 废弃：改用 list-dialog 全局样式 + wt-list 容器 */
.wt-list {
  padding: 16px 20px 0 20px;
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.wt-list > :global(.el-table) {
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
.wt-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.wt-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .wt-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .wt-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .wt-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
/* 强制：每个非 fixed 列 cell 最小内容宽，防止只剩日期+操作 */
.wt-list > :global(.el-table .el-table__body-wrapper .cell),
.wt-list > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
  white-space: nowrap;
}

.wt-list-pager {
  flex: 0 0 auto;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .wt-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.wt-list-pager :global(.el-pagination) {
  --el-pagination-bg-color: transparent;
}
.wt-list-pager :global(.el-pagination button),
.wt-list-pager :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.wt-list-pager :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #10b981) !important;
  color: #fff !important;
  border-color: var(--color-primary, #10b981) !important;
}
:global(html.dark) .wt-list-pager :global(.el-pagination button),
:global(html.dark) .wt-list-pager :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .wt-list-pager :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #10b981) !important;
  color: #fff !important;
  border-color: var(--color-primary, #10b981) !important;
}
.wt-list-pager :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

/* BMI 颜色分级（与 classifyBmi 返回值映射：underweight/normal/overweight/obese） */
.bmi-underweight { color: var(--color-link, #3b82f6); font-weight:600; }
.bmi-normal { color: var(--color-success, #16a34a); font-weight:700; }
.bmi-overweight { color: #f59e0b; font-weight:600; }
.bmi-obese { color: #ef4444; font-weight:700; }

.wt-record-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 13px;
}

.wt-record-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.wt-record-date {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.wt-record-weight {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary, var(--color-primary));
  font-variant-numeric: tabular-nums;
}

.wt-record-bmi {
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.wt-record-note {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.wt-record-actions {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.wt-records-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.btn-add-inline {
  margin-top: 12px;
  padding: 6px 14px;
  background: var(--color-primary, var(--color-primary));
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  font-size: 13px;
}

.btn-add-inline:hover {
  opacity: 0.9;
}

/* ===== 体重记录弹框分页 ===== */
.wt-records-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 0 4px;
  border-top: 1px solid var(--color-border, var(--color-border));
}

.wt-pager-btn {
  padding: 5px 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-sm, 6px);
  font-size: 12px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: all var(--transition-fast, 0.15s ease);
}

.wt-pager-btn:hover:not(:disabled) {
  background: var(--color-bg-hover, var(--color-bg-active));
}

.wt-pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wt-pager-info {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  font-variant-numeric: tabular-nums;
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

.field-hint {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
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

.field-weight {
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

html.dark .wt-item {
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

html.dark .wt-record-item {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .bmi-under {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .bmi-normal {
  color: #86efac;
  background: rgba(22, 163, 74, 0.2);
  border-color: rgba(34, 197, 94, 0.45);
}

html.dark .bmi-overweight {
  color: #fdba74;
  background: rgba(249, 115, 22, 0.2);
  border-color: rgba(249, 115, 22, 0.45);
}

html.dark .bmi-obese {
  color: #fca5a5;
  background: rgba(185, 28, 28, 0.35);
  border-color: #991b1b;
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

html.dark .wt-pager-btn {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

@media (max-width: 640px) {
  .wt-top-cards {
    grid-template-columns: 1fr;
  }

  .field-date,
  .field-weight {
    width: 100%;
  }

  .wt-records-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
