<script setup lang="ts">
import { useViewMode } from '@/composables/useViewMode'
import RecordsCard from '@/components/common/RecordsCard.vue'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'

const vm = useViewMode()

function cardFields(row: any) {
  const d = deltaOf(row.id)
  return [
    { label: '日期', value: row.date },
    { label: '身高', value: row.heightCm.toFixed(1) + ' cm' },
    { label: '较上次', value: d != null ? (d >= 0 ? '+' : '') + d.toFixed(1) + ' cm' : '—' },
    { label: '备注', value: row.note || '—' }
  ]
}

// 学生健康管理 —— 身高成长记录标签页
// 数据：useStudentHealthStore（IDB store 'student_health'，严格隔离成人 'health'）
// 形态对齐 WorkbenchHealth 的 el-radio-button tab + 学生端 StudentToolbar / el-table / ECharts 风格：
//   录入卡（日期 + 身高 + 备注）→ 统计三卡（最新/累计增长/记录数）→ 成长曲线（echarts 折线）→ 记录列表
// 同日期重复录入走 updateRecord 覆盖（一天只保留一条最新测量值）。

import { computed, ref } from 'vue'
import { useStudentHealthStore } from '@/stores/studentHealth'
import { useThemeStore } from '@/stores/theme'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import StudentToolbar from '@/components/student/StudentToolbar.vue'
import Icon from '@/components/Icon.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const store = useStudentHealthStore()
const themeStore = useThemeStore()

const formOpen = ref(false)
const date = ref<string>(localToday())
const heightCm = ref<number | undefined>(undefined)
const note = ref('')
const editingHeightId = ref<string | null>(null)

/** 按日期升序（图表与列表统一口径）；列表展示时再倒序 */
const sorted = computed(() =>
  [...(store.records.height ?? [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
)

const listDesc = computed(() => [...sorted.value].reverse())

const latest = computed(() => sorted.value[sorted.value.length - 1])

/** 累计增长：首末差值（不足 2 条则 null） */
const totalGrowth = computed(() => {
  const list = sorted.value
  if (list.length < 2) return null
  return list[list.length - 1].heightCm - list[0].heightCm
})

/** 每条记录相对上一条的增长（列表「较上次」列用；首条显示 —） */
function deltaOf(id: string): number | null {
  const list = sorted.value
  const i = list.findIndex(r => r.id === id)
  if (i <= 0) return null
  return list[i].heightCm - list[i - 1].heightCm
}

function resetForm(): void {
  date.value = localToday()
  heightCm.value = undefined
  note.value = ''
  editingHeightId.value = null
}

async function submit(): Promise<void> {
  const cm = Number(heightCm.value)
  if (!Number.isFinite(cm) || cm < 20 || cm > 250) {
    useToast().error('请输入 20-250 之间的身高（cm）')
    return
  }
  const payload = {
    date: date.value || localToday(),
    heightCm: Math.round(cm * 10) / 10,
    ...(note.value.trim() ? { note: note.value.trim() } : {})
  }
  // 同日期已存在 → 覆盖（一天一条）
  const exists = store.records.height.find(r => r.date === payload.date)
  if (exists) {
    await store.updateRecord('height', exists.id, payload)
    useToast().success('已更新该日期的身高记录')
  } else {
    await store.addRecord('height', payload)
    useToast().success('已记录身高')
  }
  resetForm()
  formOpen.value = false
}

async function remove(id: string): Promise<void> {
  await store.deleteRecord('height', id)
  useToast().success('已删除该条记录')
}

// 卡片点击 → 预填表单进入编辑（提交按日期覆盖同日期记录）
function editItem(item: { id: string; date: string; heightCm: number; note?: string }): void {
  date.value = item.date
  heightCm.value = item.heightCm
  note.value = item.note ?? ''
  editingHeightId.value = item.id
  formOpen.value = true
}

// 点击「记录身高」展开新增表单（重置编辑态，确保不显示删除）
function openAddForm(): void {
  if (formOpen.value) {
    formOpen.value = false
    return
  }
  editingHeightId.value = null
  resetForm()
  formOpen.value = true
}

// ===== 成长曲线（ECharts 折线） =====
// canvas 渲染不支持 CSS 变量颜色 → 用 getComputedStyle 解析真实 token 值，
// 并依赖 themeStore.theme 在亮暗切换时重算（与 StudentParent 的趋势图同一手法）
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const chartOption = computed(() => {
  const points = sorted.value
  const isDark = themeStore.theme === 'dark'
  const text = cssVar('--color-text-secondary', isDark ? '#9ca3af' : '#64748b')
  const border = cssVar('--color-border', isDark ? '#374151' : '#e2e8f0')
  const primary = cssVar('--color-primary', '#3b82f6')
  const areaTop = isDark ? 'rgba(96,165,250,0.35)' : 'rgba(59,130,246,0.28)'
  const areaBottom = isDark ? 'rgba(96,165,250,0.02)' : 'rgba(59,130,246,0.02)'
  return {
    animationDuration: 800,
    animationEasing: 'cubicOut' as const,
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
      borderColor: border,
      textStyle: { color: text },
      valueFormatter: (v: unknown) => `${Number(v).toFixed(1)} cm`
    },
    xAxis: {
      type: 'category' as const,
      data: points.map(p => p.date),
      boundaryGap: false,
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
      axisLabel: { color: text, fontSize: 11 }
    },
    yAxis: {
      type: 'value' as const,
      // 身高变化区间窄 → 不强制从 0 起，配合 scale 让趋势可见
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: border, type: 'dashed' as const } },
      axisLabel: { color: text, fontSize: 11, formatter: '{value} cm' }
    },
    series: [
      {
        name: '身高',
        type: 'line' as const,
        data: points.map(p => p.heightCm),
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 3, color: primary },
        itemStyle: { color: primary, borderColor: isDark ? '#1f2937' : '#ffffff', borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: areaTop },
              { offset: 1, color: areaBottom }
            ]
          }
        }
      }
    ]
  }
})
</script>

<template>
  <div class="sth-height">
    <StudentToolbar title="身高成长记录">
      <button class="btn-primary sth-add-btn" data-testid="sth-height-add" @click="openAddForm">
        <Icon name="plus" :size="14" /> {{ formOpen ? '收起' : '记录身高' }}
      </button>
    </StudentToolbar>

    <!-- 录入卡 -->
    <div v-if="formOpen" class="sth-form" data-testid="sth-height-form">
      <label class="sth-field">
        <span class="sth-field-label">测量日期</span>
        <el-date-picker
          v-model="date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          size="default"
          class="sth-date"
        />
      </label>
      <label class="sth-field">
        <span class="sth-field-label">身高（cm）</span>
        <el-input-number
          v-model="heightCm"
          :min="20"
          :max="250"
          :step="0.5"
          :precision="1"
          placeholder="如 128.5"
          controls-position="right"
        />
      </label>
      <label class="sth-field sth-field-flex">
        <span class="sth-field-label">备注</span>
        <el-input v-model="note" placeholder="选填，如：早上起床测量" clearable />
      </label>
      <div class="sth-form-actions">
        <el-button type="primary" data-testid="sth-height-submit" @click="submit">保存</el-button>
        <el-button @click="formOpen = false; resetForm()">取消</el-button>
      </div>
    </div>

    <!-- 统计三卡 -->
    <div class="sth-summary">
      <div class="sth-summary-card sth-summary-primary">
        <div class="sth-summary-label">最新身高</div>
        <div class="sth-summary-value">
          {{ latest ? `${latest.heightCm.toFixed(1)} cm` : '—' }}
        </div>
        <div class="sth-summary-sub">{{ latest ? `测量于 ${latest.date}` : '还没有记录' }}</div>
      </div>
      <div class="sth-summary-card sth-summary-soft">
        <div class="sth-summary-label">累计增长</div>
        <div class="sth-summary-value">
          <template v-if="totalGrowth !== null">
            <span :class="totalGrowth >= 0 ? 'sth-up' : 'sth-down'">
              {{ totalGrowth >= 0 ? '+' : '' }}{{ totalGrowth.toFixed(1) }} cm
            </span>
          </template>
          <template v-else>—</template>
        </div>
        <div class="sth-summary-sub">
          {{ sorted.length >= 2 ? `${sorted[0].date} 起` : '至少 2 条记录才能计算' }}
        </div>
      </div>
      <div class="sth-summary-card sth-summary-soft">
        <div class="sth-summary-label">记录条数</div>
        <div class="sth-summary-value">{{ sorted.length }}</div>
        <div class="sth-summary-sub">同日期重复录入会覆盖</div>
      </div>
    </div>

    <!-- 成长曲线 -->
    <div v-if="sorted.length >= 2" class="sth-chart-block">
      <h4 class="sth-block-title">📈 身高成长曲线</h4>
      <div class="sth-chart-wrap">
        <v-chart class="sth-chart" :option="chartOption" autoresize aria-label="身高成长曲线" />
      </div>
    </div>
    <div v-else-if="sorted.length === 1" class="sth-empty sth-empty-small">
      再记录一次就能看到成长曲线啦
    </div>

    <!-- 记录列表 -->
    <div class="ewt-table-toolbar"><ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" /></div>
    <div class="sth-list-block">
      <h4 class="sth-block-title">🗂 全部记录</h4>
      <el-table v-if="vm.mode === 'list'" class="ewt-table"
        :data="listDesc"
        stripe
        border
        size="default"
        style="width: 100%"
        empty-text="还没有身高记录，点右上角「记录身高」开始吧"
      >
        <el-table-column label="日期" width="130" align="center">
          <template #default="{ row }">{{ row.date }}</template>
        </el-table-column>
        <el-table-column label="身高" min-width="110" align="right">
          <template #default="{ row }">
            <span class="sth-num">{{ row.heightCm.toFixed(1) }} cm</span>
          </template>
        </el-table-column>
        <el-table-column label="较上次" width="110" align="center">
          <template #default="{ row }">
            <template v-if="deltaOf(row.id) !== null && deltaOf(row.id) !== undefined">
              <span :class="(deltaOf(row.id) as number) >= 0 ? 'sth-up' : 'sth-down'">
                {{ (deltaOf(row.id) as number) >= 0 ? '+' : '' }}{{ (deltaOf(row.id) as number).toFixed(1) }} cm
              </span>
            </template>
            <span v-else class="sth-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="160" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="sth-muted">{{ row.note || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" class-name="ewt-op-col" fixed="right" width="90" align="center">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="remove(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="ewt-card-grid">
        <RecordsCard
          @edit="editItem(item)"
          v-for="item in listDesc"
          :key="item.id"
          :fields="cardFields(item)"
        >
        </RecordsCard>
      </div>

    </div>
  </div>
</template>

<style scoped>
.sth-height {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sth-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ===== 录入卡 ===== */
.sth-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  background-color: var(--color-bg-card, #ffffff);
}

.sth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 150px;
}

.sth-field-flex {
  flex: 1 1 220px;
}

.sth-field-label {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

.sth-date {
  width: 170px;
}

.sth-form-actions {
  display: flex;
  gap: 8px;
}

/* ===== 统计卡 ===== */
.sth-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.sth-summary-card {
  padding: 12px 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  background-color: var(--color-bg-card, #ffffff);
}

.sth-summary-primary {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, #eff6ff);
}

.sth-summary-soft {
  background-color: var(--color-bg-hover, #f8fafc);
}

.sth-summary-label {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.sth-summary-value {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text, #0f172a);
  font-variant-numeric: tabular-nums;
}

.sth-summary-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

.sth-up {
  color: var(--color-success, #10b981);
  font-weight: 600;
}

.sth-down {
  color: var(--color-error, #ef4444);
  font-weight: 600;
}

.sth-muted {
  color: var(--color-text-secondary, #64748b);
}

.sth-num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* ===== 图表 ===== */
.sth-chart-block,
.sth-list-block {
  padding: 14px 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  background-color: var(--color-bg-card, #ffffff);
}

.sth-block-title {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #0f172a);
}

.sth-chart-wrap {
  width: 100%;
  height: 260px;
}

.sth-chart {
  width: 100%;
  height: 100%;
}

.sth-empty {
  padding: 20px;
  text-align: center;
  color: var(--color-text-secondary, #64748b);
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 12px;
  background-color: var(--color-bg-card, #ffffff);
}

.sth-empty-small {
  padding: 12px;
  font-size: 13px;
}

/* 暗色：el-table 与学生端其他表格一致，透过 element 变量跟随主题 */
html.dark .sth-summary-primary {
  background-color: rgba(59, 130, 246, 0.12);
}

html.dark .sth-summary-soft {
  background-color: var(--color-bg-hover, #1f2937);
}

@media (max-width: 768px) {
  .sth-form {
    flex-direction: column;
    align-items: stretch;
  }

  .sth-date {
    width: 100%;
  }

  .sth-chart-wrap {
    height: 220px;
  }
}
</style>
