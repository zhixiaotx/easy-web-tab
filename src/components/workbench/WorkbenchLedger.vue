<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  return [
    { label: '日期', value: row.entry.date },
    { label: '分类', value: row.cat?.name ?? '未知' },
    { label: '金额', value: (row.cat?.type === 'income' ? '+' : '-') + formatYuan(row.entry.amount) },
    { label: '备注', value: row.entry.note || '—' }
  ]
}

import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useWorkbenchLedgerStore } from '@/stores/workbenchLedger'
import Icon from '@/components/Icon.vue'
import {
  calcDepositTotal,
  calcMonthlyStats,
  calcTrendSeries,
  findCategory,
  formatYuan,
  LEDGER_CATEGORY_COLORS,
  localDateStr,
  maskOrReveal,
  monthKeyOf,
  trendChartScale
} from '@/composables/ledgerCore'
import type { TrendChartScale, TrendMonth } from '@/composables/ledgerCore'
import type { LedgerCategory, LedgerEntry } from '@/types'
import { buildCsv, csvFileName, downloadCsv } from '@/composables/csvExport'
import { usePanelPaging } from '@/composables/usePanelPaging'

const store = useWorkbenchLedgerStore()

// ===== 月份选择（顶部条，驱动全部统计/列表/占比重算）=====
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const selectedMonth = ref(currentMonth())

function shiftMonth(delta: number): void {
  const [y, m] = selectedMonth.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  selectedMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  paging.goto(1) // 月份切换 → 列表回第 1 页
}

function goToCurrentMonth(): void {
  selectedMonth.value = currentMonth()
  paging.goto(1) // 本月 → 列表回第 1 页
}

// ===== 月度统计（必须走 ledgerCore 纯函数，禁组件内重算公式）=====
const monthStats = computed(() => calcMonthlyStats(store.entries, selectedMonth.value, store.categories))

// 存款 = 从最早记账月到当前选中月的每月结余累计（纯函数，禁组件内重算）
const depositTotal = computed(() => calcDepositTotal(store.entries, selectedMonth.value, store.categories))
/** 存款统计累计结余，0 也有意义（无记账也显示 0.00，不像结余卡空月显示 '—'） */
const depositText = computed(() => (depositTotal.value === 0 ? formatYuan(0) : formatYuan(depositTotal.value)))

/** percent（0-1 小数）→ 1 位小数的百分比数值：先放大量级再四舍五入，规避浮点漂移（如 0.3055×100=30.5499…→30.5） */
function percentOf(percent: number): number {
  return Math.round((percent * 100 + 1e-9) * 10) / 10
}

function percentLabel(percent: number): string {
  return `${percentOf(percent)}%`
}

// 空月（收入=0 且支出=0）→ 结余/支出比 '—'；收入=0 → 支出比 '—'（expenseRatio 为 null）
const balanceText = computed(() =>
  monthStats.value.income === 0 && monthStats.value.expense === 0 ? '—' : formatYuan(monthStats.value.balance)
)
const ratioText = computed(() => (monthStats.value.expenseRatio === null ? '—' : percentLabel(monthStats.value.expenseRatio)))

// 敏感金额/统计显示：隐藏态统一 ****；空月 '—' 无数据不掩码（maskOrReveal 保持通用，例外在此处理）
function masked(t: string): string {
  return t === '—' ? t : maskOrReveal(t, !store.showAmount)
}

// ===== 近 12 月收支趋势（数据/坐标必须走 ledgerCore calcTrendSeries + trendChartScale，禁组件内重算）=====
// endMonthKey：store 无「当前展示月」状态 → 取当月（today），series 默认 12 个月
const TREND_W = 600
const TREND_H = 220

const trendSeries = computed<TrendMonth[]>(() => calcTrendSeries(store.entries, currentMonth(), store.categories, 12))
const trendTotalIncome = computed(() => trendSeries.value.reduce((s, m) => s + m.income, 0))
const trendTotalExpense = computed(() => trendSeries.value.reduce((s, m) => s + m.expense, 0))
const trendScale = computed<TrendChartScale | null>(() => trendChartScale(trendSeries.value, TREND_W, TREND_H))

// 网格线/柱/柱宽派生态（全 0 序列 trendChartScale → null → 空数组，走 ld-trend-empty 空态）
const trendGridlines = computed(() => trendScale.value?.gridlines ?? [])
const trendBars = computed(() => trendScale.value?.bars ?? [])
const trendBarWidth = computed(() => trendScale.value?.barWidth ?? 0)

// 月标签短格式（'2026-08' → '8月'），x 坐标来自 scale.monthLabels（几何唯一来源）
const trendMonthLabels = computed(() =>
  (trendScale.value?.monthLabels ?? []).map(l => ({
    x: l.x,
    monthKey: l.monthKey,
    label: `${Number(l.monthKey.slice(5, 7))}月`
  }))
)

// ===== 支出分类占比环形图（总面积 SVG 220×220 不变，增粗彩色环 stroke-width 增大色彩面积）=====
const RING_R = 80
const RING_C = 2 * Math.PI * RING_R

interface DonutSegment {
  categoryId: string
  name: string
  total: number
  percent: number
  color: string
  dashLen: number
  dashOffset: number
  linecap: 'round' | 'butt'
}

const donutSegments = computed<DonutSegment[]>(() => {
  const byCategory = monthStats.value.byCategory
  const total = monthStats.value.expense
  if (byCategory.length === 0 || total <= 0) return []
  let acc = 0
  return byCategory.map((item, idx) => {
    const dashLen = (item.total / total) * RING_C
    const seg: DonutSegment = {
      categoryId: item.categoryId,
      name: item.categoryId === 'unknown' ? '未知' : catNameOf(item.categoryId),
      total: item.total,
      percent: item.percent,
      color:
        idx === 0 ? 'var(--color-primary, var(--color-primary))' : LEDGER_CATEGORY_COLORS[idx % LEDGER_CATEGORY_COLORS.length],
      dashLen,
      dashOffset: -acc,
      linecap: byCategory.length <= 3 ? 'round' : 'butt'
    }
    acc += dashLen
    return seg
  })
})

// ===== 月内记录列表（date 降序，同日 createdAt 降序）=====
const monthEntries = computed(() =>
  [...store.entries]
    .filter(e => monthKeyOf(e.date) === selectedMonth.value)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
)

// ===== 一键导出 CSV（当前选中月记录）=====
function exportLedgerCsv(): void {
  const headers = ['日期', '分类', '类型', '金额', '备注']
  const rows: (string | number)[][] = monthEntries.value.map(e => {
    const cat = findCategory(store.categories, e.categoryId)
    return [e.date, cat?.name ?? '未知', cat?.type === 'income' ? '收入' : '支出', e.amount.toFixed(2), e.note ?? '']
  })
  downloadCsv(csvFileName(`记账_${selectedMonth.value}`), buildCsv(headers, rows))
}

// ===== 记录弹框（点击「查看」弹出弹框，Element Plus Table + ElPagination，每页 10 条）=====
const showRecordsModal = ref(false)
const recordsPage = ref(1)
const RECORDS_PAGE_SIZE = 10

// ===== 图表区展开/折叠（默认展开）=====
const chartsExpanded = ref(true)

function openRecordsModal(): void {
  recordsPage.value = 1
  showRecordsModal.value = true
}

function closeRecordsModal(): void {
  showRecordsModal.value = false
}

const recordsPageItems = computed<EntryView[]>(() => {
  const start = (recordsPage.value - 1) * RECORDS_PAGE_SIZE
  return viewEntries.value.slice(start, start + RECORDS_PAGE_SIZE)
})

interface EntryView {
  entry: LedgerEntry
  cat: LedgerCategory | undefined
}

const viewEntries = computed<EntryView[]>(() =>
  monthEntries.value.map(entry => ({ entry, cat: findCategory(store.categories, entry.categoryId) }))
)

// ===== 自适应分页（Wave-2 T11）：≥769px 分页；≤768px 惰性（全量渲染、pager 隐藏，R2）=====
const listEl = ref<HTMLElement | null>(null)
// reactive() 解包嵌套 ref：模板中 paging.pageItems/currentPage/totalPages/fitsOnePage 直接取值
// （Vue 模板只对顶层 ref 自动解包，嵌套 ref 需 reactive 包装，vue-tsc 实证；与 Todo/Diary 面板同构）
const paging = reactive(usePanelPaging({
  items: () => viewEntries.value,
  rowHeight: 49,
  maxRows: 6,
  containerRef: listEl,
  gridRef: listEl
}))

function catNameOf(categoryId: string): string {
  return findCategory(store.categories, categoryId)?.name ?? '未知'
}

// ===== 记录表单（新增/编辑共用弹框）=====
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formDate = ref(localDateStr())
const formCategoryId = ref('')
const formAmount = ref('')
const formNote = ref('')

// 金额：>0 且最多 2 位小数，否则保存按钮 disabled
// 注意：<input type="number"> 的 v-model 在 Vue 3 下会把值转成 number（如 10000），故入参不限定 string
function isValidAmount(raw: string | number): boolean {
  const trimmed = String(raw).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return false
  const n = Number(trimmed)
  return Number.isFinite(n) && n > 0
}

const isFormValid = computed(
  () => formDate.value !== '' && formCategoryId.value !== '' && isValidAmount(formAmount.value)
)

function startAdd(): void {
  editingId.value = null
  formDate.value = localDateStr()
  formCategoryId.value = store.incomeCategories[0]?.id ?? store.expenseCategories[0]?.id ?? ''
  formAmount.value = ''
  formNote.value = ''
  showDialog.value = true
}

function startEdit(view: EntryView): void {
  editingId.value = view.entry.id
  formDate.value = view.entry.date
  formCategoryId.value = view.entry.categoryId
  formAmount.value = String(view.entry.amount)
  formNote.value = view.entry.note ?? ''
  showDialog.value = true
}

function cancelForm(): void {
  showDialog.value = false
  editingId.value = null
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const note = formNote.value.trim() || undefined
  const payload = { date: formDate.value, categoryId: formCategoryId.value, amount: Number(formAmount.value) }
  if (editingId.value) {
    await store.updateEntry(editingId.value, note ? { ...payload, note } : payload)
  } else {
    await store.addEntry(note ? { ...payload, note } : payload)
  }
  paging.goto(1) // 新增/编辑后列表回第 1 页（新记录在 date 降序列表顶部）
  cancelForm()
}

async function handleDelete(id: string): Promise<void> {
  if (confirm('确定要删除这笔记账吗？')) {
    await store.deleteEntry(id)
    paging.goto(1) // 删除后列表回第 1 页
  }
}

// ESC 关闭弹框
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (showDialog.value) {
    event.preventDefault()
    cancelForm()
  }
}

// 面板自管理数据加载（WorkbenchView 后续集成统一加载，这里防御性幂等重载）
onMounted(async () => {
  await store.loadLedger()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="wb-ledger">
    <!-- 月份选择条（stat 卡上方） -->
    <div class="ld-month-bar">
      <el-button class="month-btn" data-testid="ld-prev" @click="shiftMonth(-1)">‹ 上月</el-button>
      <el-button class="month-btn" data-testid="ld-next" @click="shiftMonth(1)">› 下月</el-button>
      <!-- ld-month 契约：EP el-date-picker 不透传 data-* 属性，testid 放包裹 div（同 business bizday-form-date 约定）；宽度由 wrapper .month-input 控 150px，picker 经 :deep 填满 wrapper（直接给 picker 加 class 不透传 data-v 且被 EP --el-date-editor-width 220px 覆盖） -->
      <div class="month-input" data-testid="ld-month">
        <el-date-picker
          v-model="selectedMonth"
          type="month"
          value-format="YYYY-MM"
          class="form-input"
        />
      </div>
      <el-button class="month-btn today-btn" data-testid="ld-today" @click="goToCurrentMonth">本月</el-button>
      <div class="ld-month-actions">
        <el-button class="btn-manage" data-testid="ld-toggle-amounts" @click="store.toggleAmountVisibility()">
          <Icon :name="store.showAmount ? 'eye-off' : 'eye'" :size="15" />
          {{ store.showAmount ? '隐藏金额' : '显示金额' }}
        </el-button>
        <el-button class="btn-add" data-testid="ld-add" @click="startAdd">＋ 新增</el-button>
        <el-button class="btn-manage" data-testid="ld-toggle-list" @click="openRecordsModal">
          查看（{{ monthEntries.length }}）
        </el-button>
        <el-button class="btn-manage" data-testid="ld-export" :disabled="monthEntries.length === 0" @click="exportLedgerCsv">导出 CSV</el-button>
      </div>
    </div>

    <!-- 统计卡 6 张（一行 stat-card） -->
    <div class="ld-stats">
      <div class="stat-card" data-testid="ld-stat-income">
        <div class="stat-header">
          <span class="stat-icon"><Icon name="revenue" :size="18" /></span>
          <span class="stat-label">收入</span>
        </div>
        <div class="stat-value is-income">{{ masked(formatYuan(monthStats.income)) }}</div>
      </div>
      <div class="stat-card" data-testid="ld-stat-expense">
        <div class="stat-header">
          <span class="stat-icon"><Icon name="expenses" :size="18" /></span>
          <span class="stat-label">支出</span>
        </div>
        <div class="stat-value is-expense">{{ masked(formatYuan(monthStats.expense)) }}</div>
      </div>
      <div class="stat-card" data-testid="ld-stat-balance">
        <div class="stat-header">
          <span class="stat-icon"><Icon name="scale" :size="18" /></span>
          <span class="stat-label">结余</span>
        </div>
        <div class="stat-value" :class="{ 'is-negative': monthStats.balance < 0 }">{{ masked(balanceText) }}</div>
      </div>
      <div class="stat-card" data-testid="ld-stat-deposit">
        <div class="stat-header">
          <span class="stat-icon"><Icon name="bank" :size="18" /></span>
          <span class="stat-label">存款</span>
        </div>
        <div class="stat-value" :class="{ 'is-negative': depositTotal < 0 }">{{ masked(depositText) }}</div>
      </div>
      <div class="stat-card" data-testid="ld-stat-count">
        <div class="stat-header">
          <span class="stat-icon"><Icon name="ledger" :size="18" /></span>
          <span class="stat-label">消费笔数</span>
        </div>
        <div class="stat-value">{{ monthStats.expenseCount }}</div>
      </div>
      <div class="stat-card" data-testid="ld-stat-ratio">
        <div class="stat-header">
          <span class="stat-icon"><Icon name="stats" :size="18" /></span>
          <span class="stat-label">支出比</span>
        </div>
        <div class="stat-value">{{ masked(ratioText) }}</div>
      </div>
    </div>

    <!-- 图表区（可折叠，默认展开）：趋势图 + 环形图。桌面中低宽度（769-1599px）并排压缩纵向占用（一屏契约 R1），
         ≥1600px 上下堆叠；展开记录时自动收起图表，为记录列表腾出空间 -->
    <div class="ld-charts-section">
      <el-button
        type="button"
        class="ld-charts-toggle"
        data-testid="ld-charts-toggle"
        :aria-expanded="chartsExpanded"
        @click="chartsExpanded = !chartsExpanded"
      >
        <span><Icon name="profit" :size="15" /> 图表</span>
        <span class="ld-charts-chevron" :class="{ open: chartsExpanded }">▾</span>
      </el-button>
      <div v-show="chartsExpanded" class="ld-charts-row">
      <!-- 近 12 月收支趋势（内联 SVG 分组柱状图：income/expense 各一根柱，坐标走 ledgerCore trendChartScale） -->
      <section class="ld-card" data-testid="ld-trend">
        <div class="ld-trend-header">
          <h3 class="ld-card-title">近 12 月收支趋势</h3>
          <div class="ld-trend-totals">
            <span class="ld-trend-total ld-trend-total-inc">
              收入合计 <b>¥{{ masked(formatYuan(trendTotalIncome)) }}</b>
            </span>
            <span class="ld-trend-total ld-trend-total-exp">
              支出合计 <b>¥{{ masked(formatYuan(trendTotalExpense)) }}</b>
            </span>
          </div>
        </div>
        <svg
          v-if="trendScale"
          viewBox="0 0 600 220"
          width="100%"
          height="220"
          preserveAspectRatio="xMidYMid meet"
          class="ld-trend-svg"
        >
          <!-- 5 条水平网格线 + 数值标签（顶部为 maxY，data-testid=ld-trend-max） -->
          <g>
            <line
              v-for="(g, gi) in trendGridlines"
              :key="'grid-' + gi"
              class="ld-trend-gridline"
              x1="0"
              x2="600"
              :y1="g.y"
              :y2="g.y"
            />
            <text
              v-for="(g, gi) in trendGridlines"
              :key="'val-' + gi"
              class="ld-trend-axis-label"
              x="6"
              :y="g.y + 4"
              font-size="11"
              text-anchor="start"
              :data-testid="gi === trendGridlines.length - 1 ? 'ld-trend-max' : undefined"
            >
              {{ g.label }}
            </text>
          </g>

          <!-- 每根柱：data-testid=ld-trend-bar-<月索引>-<income|expense>（同月两柱并排，income 先于 expense） -->
          <rect
            v-for="(b, idx) in trendBars"
            :key="b.monthKey + '-' + b.kind"
            :data-testid="`ld-trend-bar-${Math.floor(idx / 2)}-${b.kind}`"
            class="ld-trend-bar"
            :class="b.kind === 'income' ? 'is-income' : 'is-expense'"
            :x="b.x"
            :y="b.y"
            :width="trendBarWidth"
            :height="b.height"
            rx="2"
          />

          <!-- 月标签：data-testid=ld-trend-month-<月索引> -->
          <text
            v-for="(l, li) in trendMonthLabels"
            :key="l.monthKey"
            :data-testid="`ld-trend-month-${li}`"
            class="ld-trend-axis-label"
            :x="l.x"
            y="214"
            font-size="11"
            text-anchor="middle"
          >
            {{ l.label }}
          </text>
        </svg>
        <div v-else class="ld-trend-empty" data-testid="ld-trend-empty">暂无收支数据</div>
      </section>

      <!-- 支出分类占比环形图（当月 expense>0 才显示整块；ring 常量同 WorkbenchPomodoro） -->
      <div v-if="monthStats.expense > 0" class="ld-ratio-block" data-testid="ld-ratio-block">
        <div class="ld-ratio-title">支出分类占比</div>
        <div class="ld-donut-layout">
          <div class="ld-donut-wrap">
            <svg class="ld-donut-svg" viewBox="0 0 220 220" width="220" height="220" data-testid="ld-donut">
              <circle class="ld-donut-track" cx="110" cy="110" :r="RING_R" />
              <circle
                v-for="(seg, idx) in donutSegments"
                :key="seg.categoryId"
                class="ld-donut-seg"
                :class="{ 'is-accent': idx === 0 }"
                cx="110"
                cy="110"
                :r="RING_R"
                :stroke="idx === 0 ? undefined : seg.color"
                :stroke-dasharray="`${seg.dashLen} ${RING_C - seg.dashLen}`"
                :stroke-dashoffset="seg.dashOffset"
                :stroke-linecap="seg.linecap"
                :data-testid="`ld-donut-seg-${idx}`"
                transform="rotate(-90 110 110)"
              />
            </svg>
            <div class="ld-donut-center" data-testid="ld-donut-center">
              {{ maskOrReveal(formatYuan(monthStats.expense), !store.showAmount) }}
            </div>
          </div>
          <div class="ld-donut-legend">
            <div
              v-for="(seg, idx) in donutSegments"
              :key="seg.categoryId"
              class="ld-donut-legend-row"
              :data-testid="`ld-donut-legend-${seg.categoryId}`"
            >
              <span
                class="ld-donut-dot"
                :class="{ 'is-accent': idx === 0 }"
                :style="idx === 0 ? undefined : { background: seg.color }"
              ></span>
              <div class="ld-ratio-head">
                <span class="ld-ratio-name">{{ seg.name }}</span>
                <span class="ld-ratio-val">
                  {{ masked(formatYuan(seg.total)) }} · {{ masked(percentLabel(seg.percent)) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>

    <!-- 空月态 -->
    <div v-if="monthEntries.length === 0" class="empty-state empty-invite" data-testid="ld-empty" @click="startAdd">
      <div class="ld-empty-title">本月暂无记账记录</div>
      <div class="ld-empty-sub">＋ 新增第一笔记录</div>
    </div>

    <!-- 新增/编辑记录弹框 -->
    <Transition name="dialog">
      <div v-if="showDialog" class="dialog-overlay" @click.self="cancelForm">
      <div class="dialog" data-testid="ld-dialog">
        <div class="dialog-header">
          <h3>{{ editingId ? '编辑记录' : '新增记录' }}</h3>
          <el-button class="close-btn" text @click="cancelForm"><Icon name="close" /></el-button>
        </div>
        <form class="dialog-body" @submit.prevent="handleSave">
          <div class="form-row-fields">
            <div class="field">
              <label class="field-label">日期 *</label>
              <el-date-picker
                v-model="formDate"
                type="date"
                value-format="YYYY-MM-DD"
                class="form-input field-date"
                data-testid="ld-form-date"
              />
            </div>
            <div class="field field-category">
              <label class="field-label">分组 *</label>
              <el-select v-model="formCategoryId" class="form-input" data-testid="ld-form-category">
                <el-option-group label="收入分组">
                  <el-option v-for="c in store.incomeCategories" :key="c.id" :value="c.id" :label="c.name" />
                </el-option-group>
                <el-option-group label="支出分组">
                  <el-option v-for="c in store.expenseCategories" :key="c.id" :value="c.id" :label="c.name" />
                </el-option-group>
              </el-select>
            </div>
          </div>

          <div class="form-group">
            <label>金额 *</label>
            <el-input-number
              :model-value="formAmount === '' ? undefined : Number(formAmount)"
              :min="0.01"
              :step="0.01"
              class="form-input"
              placeholder="例如：100.00"
              data-testid="ld-form-amount"
              :controls="false"
              :precision="2"
              @update:model-value="formAmount = $event == null ? '' : String($event)"
            />
          </div>

          <div class="form-group">
            <label>备注（可选）</label>
            <el-input
              v-model="formNote"
              type="textarea"
              :rows="2"
              class="form-input desc-input"
              placeholder="补充说明…"
              data-testid="ld-form-note"
            />
          </div>

          <div class="form-actions ewt-dialog-footer">
            <el-button type="button" class="btn-cancel" data-testid="ld-cancel" @click="cancelForm">取消</el-button>
            <el-button type="submit" class="btn-save" :disabled="!isFormValid" data-testid="ld-save">
              {{ editingId ? '保存' : '添加' }}
            </el-button>
            <el-button v-if="editingId" type="danger" native-type="button" data-testid="ld-record-delete" @click="handleDelete(editingId)">删除</el-button>
          </div>
        </form>
      </div>
      </div>
    </Transition>

    <!-- 记录弹框（Element Plus Table，列顺序：日期/分类/金额/备注/操作，每页 10 条） -->
    <Transition name="dialog">
      <div v-if="showRecordsModal" class="dialog-overlay" @click.self="closeRecordsModal">
        <div class="dialog ld-records-dialog" data-testid="ld-records-dialog">
          <div class="dialog-header">
            <h3>本月记录（{{ monthEntries.length }} 条）</h3>
            <ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" />
            <el-button class="close-btn" text @click="closeRecordsModal"><Icon name="close" /></el-button>
          </div>
          <div class="ld-records-body">
            <el-table v-if="vm.mode === 'list'" class="ewt-table"
              :data="recordsPageItems"
              stripe
              border
              size="default"
              style="width: 100%"
              height="100%"
              empty-text="本月暂无记录"
            >
              <el-table-column prop="entry.date" label="日期" width="130" align="center">
                <template #default="{ row }: { row: EntryView }">
                  {{ row.entry.date }}
                </template>
              </el-table-column>
              <el-table-column label="分类" width="160" align="center">
                <template #default="{ row }: { row: EntryView }">
                  <span
                    class="ld-cat-type-badge"
                    :class="{ 'is-income': row.cat?.type === 'income' }"
                    :data-testid="`ld-cat-${row.entry.categoryId}`"
                  >
                    {{ row.cat?.name ?? '未知' }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="金额" width="150" align="right">
                <template #default="{ row }: { row: EntryView }">
                  <span class="ld-record-amount" :class="{ 'is-income': row.cat?.type === 'income' }">
                    {{ masked((row.cat?.type === 'income' ? '+' : '-') + formatYuan(row.entry.amount)) }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="备注" min-width="200" show-overflow-tooltip>
                <template #default="{ row }: { row: EntryView }">
                  <span v-if="row.entry.note">{{ row.entry.note }}</span>
                  <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" class-name="ewt-op-col" width="150" align="center" fixed="right">
                <template #default="{ row }: { row: EntryView }">
                  <el-button class="btn-edit" :data-testid="`ld-edit-${row.entry.id}`" @click="startEdit(row)" style="margin-right: 6px;">编辑</el-button>
                  <el-button class="btn-delete" :data-testid="`ld-delete-${row.entry.id}`" @click="handleDelete(row.entry.id)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-else class="ewt-card-grid">
              <RecordsCard
                @edit="startEdit(item)"
                v-for="item in recordsPageItems"
                :key="item.entry.id"
                :fields="cardFields(item)"
              >
              </RecordsCard>
            </div>

          </div>
          <div class="ld-records-pager">
            <el-pagination
              v-model:current-page="recordsPage"
              :page-size="RECORDS_PAGE_SIZE"
              :page-sizes="[RECORDS_PAGE_SIZE]"
              layout="total, prev, pager, next, jumper"
              :total="viewEntries.length"
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
.wb-ledger {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 月份选择条 ===== */
.ld-month-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 14px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.month-btn {
  padding: 8px 14px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-primary, var(--color-primary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.month-btn:hover {
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
}

.today-btn {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.today-btn:hover {
  background: var(--color-primary-hover, var(--color-primary-hover));
  border-color: var(--color-primary-hover, var(--color-primary-hover));
}

.month-input {
  width: 150px;
  flex-shrink: 0;
}

/* EP el-date-picker 根是子组件不透传父 scoped data-v；:deep 强制 picker 填满 150px wrapper（否则 EP --el-date-editor-width=220px 溢出盖住 本月 按钮） */
.month-input :deep(.el-date-editor) {
  width: 100%;
}

/* ===== 统计卡 6 张 ===== */
.ld-stats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

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

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat-value.is-income {
  color: var(--color-success, var(--color-success));
}

.stat-value.is-expense {
  color: var(--color-error, var(--color-error));
}

.stat-value.is-negative {
  color: var(--color-error, var(--color-error));
}

/* ===== 支出分类占比条 ===== */
.ld-ratio-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.ld-ratio-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.ld-ratio-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ld-ratio-name {
  font-size: 13px;
  color: var(--color-text, var(--color-text));
}

.ld-ratio-val {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

/* ===== 近 12 月收支趋势（内联 SVG 分组柱状图）===== */
.ld-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.ld-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.ld-trend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ld-trend-totals {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 13px;
}

.ld-trend-total {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-secondary, #666);
}

.ld-trend-total b {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #1f2937);
  font-variant-numeric: tabular-nums;
}

.ld-trend-total-inc b { color: #10b981; }
.ld-trend-total-exp b { color: #ef4444; }
html.dark .ld-trend-total-inc b { color: #34d399; }
html.dark .ld-trend-total-exp b { color: #f87171; }

.ld-trend-svg {
  display: block;
  width: 100%;
  height: 220px;
}

.ld-trend-gridline {
  stroke: var(--color-border, #e2e8f0);
  stroke-dasharray: 4 4;
}

.ld-trend-axis-label {
  fill: var(--color-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

/* 收入柱 = 应用主色；支出柱 = LEDGER_CATEGORY_COLORS[1] */
.ld-trend-bar.is-income {
  fill: var(--color-primary, var(--color-primary));
}

.ld-trend-bar.is-expense {
  fill: #8b5cf6;
}

.ld-trend-empty {
  padding: 36px 16px;
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
}

/* ===== 支出分类占比环形图（总面积 SVG 220×220 不变，stroke-width: 32 增大色彩环面积）===== */
.ld-donut-layout {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.ld-donut-wrap {
  position: relative;
  width: 220px;
  height: 220px;
  flex-shrink: 0;
}

.ld-donut-svg {
  display: block;
  width: 220px;
  height: 220px;
}

.ld-donut-track {
  fill: none;
  stroke: var(--color-bg-card, var(--color-bg-hover));
  stroke-width: 32;
}

.ld-donut-seg {
  fill: none;
  stroke-width: 32;
}

.ld-donut-seg.is-accent {
  stroke: var(--color-primary, var(--color-primary));
}

.ld-donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  padding: 0 20px;
  text-align: center;
}

.ld-donut-legend {
  flex: 1;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ld-donut-legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ld-donut-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full, 999px);
}

.ld-donut-dot.is-accent {
  background: var(--color-primary, var(--color-primary));
}

/* ===== 图表区折叠开关 ===== */
.ld-charts-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ld-charts-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text-secondary));
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.ld-charts-toggle:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.ld-charts-chevron {
  transition: transform 0.15s ease;
}

.ld-charts-chevron.open {
  transform: rotate(180deg);
}

/* ===== 操作栏 ===== */
.ld-headbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ld-month-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
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

.btn-add:hover:not(:disabled) {
  background-color: var(--color-primary-hover, var(--color-primary-hover));
}

.btn-add:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-manage {
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

.btn-manage:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* ===== 空月态 ===== */
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  transition: color var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.empty-invite:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

.ld-empty-title {
  font-size: 14px;
}

.ld-empty-sub {
  font-size: 14px;
  font-weight: 600;
}

/* ===== 记录列表（表格行式：日期 | 分组 | 金额 | 备注 | 操作）===== */
.ld-list {
  overflow-x: auto;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.ld-item {
  display: grid;
  grid-template-columns: 100px 90px 110px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border, var(--color-border));
  transition: background-color var(--transition-fast, 0.15s ease);
}

.ld-item:last-child {
  border-bottom: none;
}

.ld-item:hover {
  background-color: var(--color-bg-hover, var(--color-bg-hover));
}

.ld-date {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ld-cat-badge {
  justify-self: start;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

.ld-cat-badge.is-income {
  color: #15803d;
  background: #dcfce7;
  border-color: #86efac;
}

.ld-note {
  min-width: 0;
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ld-amount {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.ld-amount.is-income {
  color: var(--color-success, var(--color-success));
}

.ld-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
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
  max-width: var(--dlg-w-wb-ledger, 480px);
  max-height: var(--dlg-h-wb-ledger, 85vh);
  overflow-y: auto;
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

/* 查看记录弹框（合适的宽高：宽 85vw / 高 85vh，flex 纵向布局给 table + pagination） */
.dialog[data-testid="ld-records-dialog"] {
  width: 85vw;
  height: 85vh;
  max-width: 1200px;
  min-width: 560px;
  display: flex;
  flex-direction: column;
}

/* 移动端：取消 560px 最小宽度，避免对话框宽于视口、关闭按钮落到屏幕外无法关闭 */
@media (max-width: 768px) {
  .dialog[data-testid="ld-records-dialog"] {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: 90vh !important;
  }
}

/* el-table 容器：填满剩余空间，overflow 交给 el-table internal */
.ld-records-body {
  padding: 16px 20px 0 20px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* el-pagination 位置：底部分页条 */
.ld-records-pager {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  background: var(--color-surface-2, #fafafa);
  border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
}

/* 表格内金额样式：沿用旧.ld-record-amount，确保 + 绿 / - 蓝 主题色 */
.ld-record-amount {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text, var(--color-text));
  font-variant-numeric: tabular-nums;
}
.ld-record-amount.is-income {
  color: var(--color-success, var(--color-success));
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

.field-category {
  flex: 1;
  min-width: 180px;
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

/* ===== 分组管理 ===== */
.ld-cat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ld-cat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
}

.ld-cat-name {
  flex: 1;
  min-width: 80px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.ld-cat-type-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: var(--radius-full, 999px);
  color: var(--color-primary, var(--color-primary));
  background: var(--color-primary-light, #eff6ff);
  border: 1px solid color-mix(in srgb, var(--color-primary, #3b82f6) 30%, transparent);
}

.ld-cat-type-badge.is-income {
  color: #15803d;
  background: #dcfce7;
  border-color: #86efac;
}

.ld-builtin-tag {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-full, 999px);
  padding: 2px 10px;
}

.ld-cat-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ld-cat-add-form {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px;
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
}

.ld-cat-add-form .form-input {
  flex: 1;
  min-width: 140px;
}

/* ===== 暗色模式覆盖 ===== */
html.dark .ld-month-bar {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .stat-card,
html.dark .ld-ratio-block,
html.dark .ld-card {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .ld-list {
  background-color: var(--color-bg-card, #1f2937);
  box-shadow: none;
}

html.dark .ld-item:hover {
  background-color: var(--color-bg-hover, #374151);
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

html.dark .ld-date {
  color: var(--color-text, #f9fafb);
}

html.dark .ld-note,
html.dark .ld-ratio-val {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .ld-amount {
  color: var(--color-text, #f9fafb);
}

html.dark .ld-amount.is-income {
  color: #4ade80;
}

html.dark .stat-value.is-income {
  color: #4ade80;
}

html.dark .stat-value.is-expense,
html.dark .stat-value.is-negative {
  color: #f87171;
}

html.dark .ld-cat-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .ld-cat-badge.is-income,
html.dark .ld-cat-type-badge.is-income {
  color: #4ade80;
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.45);
}

html.dark .ld-cat-type-badge {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}

html.dark .ld-donut-track {
  stroke: var(--color-bg-input, #374151);
}

html.dark .ld-cat-row {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .ld-cat-name {
  color: var(--color-text, #f9fafb);
}

html.dark .btn-manage,
html.dark .btn-cancel,
html.dark .btn-edit,
html.dark .btn-delete,
html.dark .month-btn,
html.dark .ld-charts-toggle {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .month-btn:hover {
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
  color: #fff;
}

html.dark .today-btn {
  color: #fff;
  background: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* 禁用态保存按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
html.dark .btn-save:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}

html.dark .btn-add:disabled {
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

@media (max-width: 1100px) {
  .ld-stats {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
}

@media (max-width: 640px) {
  .field-date,
  .field-category,
  .month-input {
    width: 100%;
  }

  /* 窄屏：行保持 5 列不塌，列表横向滚动（.ld-list 已开 overflow-x: auto） */
  .ld-item {
    min-width: 640px;
  }

  /* 窄屏：环形图与图例纵向堆叠 */
  .ld-donut-layout {
    flex-direction: column;
    align-items: center;
  }

  .ld-donut-legend {
    width: 100%;
  }

  /* 窄屏：月操作区（本月/显示金额/＋新增/查看/导出CSV）换行，按钮不被压扁 */
  .ld-month-actions {
    flex-wrap: wrap;
    margin-left: 0;
    width: 100%;
    justify-content: flex-start;
  }
}

/* ===== 桌面端 ≥769px：自适应分页契约（Wave-2 T11，R1/R2/R7）===== */
@media (min-width: 769px) {
  /* flex 列内可收缩占满剩余高度（T3 shell 契约 .wb-content > * flex:1 min-height:0 已在视图层就位） */
  .ld-list {
    flex: 1;
    min-height: 0;
  }

  /* 列表区滚动兜底：仅 !fitsOnePage（一屏放不下）时由模板类绑定启用（R7） */
  .ld-list-scroll {
    overflow-y: auto;
  }
}

/* ===== 桌面中低宽度（769-1599px）：图表区并排压缩纵向占用（R1 一屏契约，1366×768 ledger 头部溢出修复；≥1600px 保持上下堆叠）===== */
@media (min-width: 769px) and (max-width: 1599px),
  (min-width: 1600px) and (max-height: 900px) {
  /* M-3：≥1600px 且视口较矮时图表堆叠会压塌 .ld-list（列表区高度趋近 0），
     此带宽下保持并排以保住列表区可用高度（QA 仅覆盖 1366×768 与 1920×1080） */
  .ld-charts-row {
    display: flex;
    gap: 16px;
    align-items: stretch;
  }

  .ld-charts-row > .ld-card,
  .ld-charts-row > .ld-ratio-block {
    flex: 1;
    min-width: 0;
  }
}
</style>
