<script setup lang="ts">
// 学生工作台成绩记录面板
// 布局：工具条 + 年级标签页(el-tabs) + 统计卡 + 表格(el-table, 每页10条分页) + 录入/编辑弹框 + 按科目 ECharts 趋势折线
// 数据：useStudentGradesStore（独立 IDB store 'student_grades'，严格隔离成人数据）
// 复用 studentGradesCore 的归一化/校验/统计/排序/过滤/分页纯函数；ECharts 走 echarts/core + vue-echarts（仿 StudentHealthHeight）
// 年级维度：每条记录带 grade（STUDENT_GRADE_LEVELS 之一），每个年级一个标签页，全部页保留跨年级总览
// data-testid 前缀：sg-

import { computed, onMounted, ref } from 'vue'
import { useStudentGradesStore, GRADE_PAGE_SIZE } from '@/stores/studentGrades'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useThemeStore } from '@/stores/theme'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import { subjectUniverse } from '@/composables/studentGradesCore'
import { GRADE_EXAM_TYPES, STUDENT_GRADE_LEVELS, GRADE_LEVEL_ALL, GRADE_STAGE_GROUPS } from '@/types'
import type { StudentGradeSubject, StudentGradeRecord } from '@/types'
import StudentToolbar from '@/components/student/StudentToolbar.vue'
import Icon from '@/components/Icon.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const store = useStudentGradesStore()
const settingsStore = useStudentSettingsStore()
const themeStore = useThemeStore()
const toast = useToast()

const subjectOptions = computed<string[]>(() => settingsStore.subjects)
const gradeLevels = computed<string[]>(() => [...STUDENT_GRADE_LEVELS])
/** 学段分组（一级导航），来自 GRADE_STAGE_GROUPS */
const stageGroups = GRADE_STAGE_GROUPS
/** 二级导航「总览」tab 文案：全学段时=全部年级，选定学段时=该学段全部 */
const overviewLabel = computed(() => (store.activeStage ? '该学段全部' : '全部年级'))
/** 当前学段显示名（用于空状态文案） */
const activeStageLabel = computed(() => {
  const g = stageGroups.find(x => x.key === store.activeStage)
  return g ? g.label : ''
})

// ============ 统计（当前年级作用域） ============
const latestExam = computed(() => store.levelStats.latestExam)

// ============ 录入/编辑弹框 ============
const showDialog = ref(false)
const editingId = ref<string | null>(null)
const formGrade = ref<string>('')
const formExamName = ref('')
const formExamType = ref<string>('期中')
const formDate = ref<string>(localToday())
const formSubjects = ref<{ subject: string; score: number | undefined; fullScore: number | undefined }[]>([])

const examTypeOptions = computed<string[]>(() => [...GRADE_EXAM_TYPES])

function openAddDialog(): void {
  editingId.value = null
  // 默认年级：优先取当前学段首年级（与设置所选学段一致），其次当前具体年级标签页
  const stageKey = store.activeStage
  const stageFirstGrade =
    stageKey && stageKey !== GRADE_LEVEL_ALL
      ? (stageGroups.find(g => g.key === stageKey)?.grades[0] ?? '')
      : ''
  formGrade.value =
    stageFirstGrade ||
    (store.activeLevel && store.activeLevel !== GRADE_LEVEL_ALL ? store.activeLevel : '')
  formExamName.value = ''
  formExamType.value = '期中'
  formDate.value = localToday()
  formSubjects.value = [{ subject: subjectOptions.value[0] ?? '', score: undefined, fullScore: undefined }]
  showDialog.value = true
}

function openEditDialog(id: string): void {
  const g = store.grades.find(x => x.id === id)
  if (!g) return
  editingId.value = g.id
  formGrade.value = g.grade
  formExamName.value = g.examName
  formExamType.value = g.examType
  formDate.value = g.date
  formSubjects.value = g.subjects.map(s => ({ subject: s.subject, score: s.score, fullScore: s.fullScore }))
  showDialog.value = true
}

function closeDialog(): void {
  showDialog.value = false
  editingId.value = null
}

function addSubjectRow(): void {
  formSubjects.value.push({ subject: '', score: undefined, fullScore: undefined })
}

function removeSubjectRow(index: number): void {
  formSubjects.value.splice(index, 1)
}

async function saveDialog(): Promise<void> {
  const name = formExamName.value.trim()
  if (!formGrade.value) {
    toast.error('请选择年级')
    return
  }
  if (!name) {
    toast.error('考试名称不能为空')
    return
  }
  if (!formDate.value) {
    toast.error('考试日期不能为空')
    return
  }
  const subjects: StudentGradeSubject[] = []
  for (const row of formSubjects.value) {
    const subj = row.subject.trim()
    if (!subj) continue
    const score = Number(row.score)
    if (!Number.isFinite(score) || score < 0) {
      toast.error(`「${subj}」分数不合法`)
      return
    }
    subjects.push({ subject: subj, score: Math.round(score * 100) / 100, fullScore: row.fullScore ?? undefined })
  }
  if (subjects.length === 0) {
    toast.error('至少录入一科成绩')
    return
  }
  const payload = {
    examName: name,
    examType: formExamType.value.trim() || '期中',
    grade: formGrade.value,
    date: formDate.value,
    subjects
  }
  if (editingId.value !== null) {
    const r = await store.updateGrade(editingId.value, payload)
    if (r.ok) {
      toast.success('已更新成绩')
      closeDialog()
    } else {
      toast.error(gradeErrorMsg(r.reason))
    }
  } else {
    const r = await store.addGrade(payload)
    if (r.ok) {
      toast.success('已记录成绩')
      closeDialog()
    } else {
      toast.error(gradeErrorMsg(r.reason))
    }
  }
}

function gradeErrorMsg(reason?: string): string {
  switch (reason) {
    case 'empty': return '考试名称不能为空'
    case 'invalid-date': return '考试日期格式不正确'
    case 'no-subjects': return '至少录入一科成绩'
    case 'invalid-score': return '存在不合法的分值'
    case 'not-found': return '成绩记录不存在'
    default: return '操作失败'
  }
}

async function handleDelete(id: string): Promise<void> {
  const g = store.grades.find(x => x.id === id)
  if (!g) return
  if (!confirm(`确定删除「${g.examName}」的成绩记录吗？`)) return
  const r = await store.deleteGrade(id)
  if (r.ok) {
    if (editingId.value === id) closeDialog()
    toast.success('已删除')
  } else {
    toast.error(gradeErrorMsg(r.reason))
  }
}

// ============ 排序 ============
function setSortMode(mode: 'date' | 'name'): void {
  store.setSort(mode)
}

// ============ 学段 / 年级标签页切换 ============
function onStageChange(name: string | number | boolean): void {
  store.setActiveStage(String(name))
}

function onTabChange(name: string | number): void {
  store.setActiveLevel(String(name))
}

// ============ 表格行 ============
function onRowClick(row: StudentGradeRecord): void {
  openEditDialog(row.id)
}

/** 单行平均分（各科得分均值） */
function rowAverage(g: StudentGradeRecord): number | null {
  if (!g.subjects.length) return null
  const sum = g.subjects.reduce((s, x) => s + x.score, 0)
  return Math.round((sum / g.subjects.length) * 100) / 100
}

function rowAvgText(g: StudentGradeRecord): string {
  const a = rowAverage(g)
  return a === null ? '—' : a.toFixed(1)
}

// ============ 趋势图（当前年级作用域） ============
const allSubjects = computed<string[]>(() => subjectUniverse(store.levelGrades))
const selectedTrendSubjects = ref<string[]>([])

// 默认全选；当可选科目变化且无选择时回退全选
const trendSubjects = computed<string[]>(() => {
  const sel = selectedTrendSubjects.value.filter(s => allSubjects.value.includes(s))
  return sel.length ? sel : allSubjects.value
})

const chartExams = computed(() =>
  [...store.levelGrades].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
)

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const chartOption = computed(() => {
  const exams = chartExams.value
  const subjects = trendSubjects.value
  const isDark = themeStore.theme === 'dark'
  const text = cssVar('--color-text-secondary', isDark ? '#9ca3af' : '#64748b')
  const border = cssVar('--color-border', isDark ? '#374151' : '#e2e8f0')
  const palette = isDark
    ? ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c', '#4ade80']
    : ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#22c55e']
  return {
    animationDuration: 800,
    animationEasing: 'cubicOut' as const,
    color: palette,
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
      borderColor: border,
      textStyle: { color: text }
    },
    legend: {
      type: 'scroll' as const,
      top: 0,
      textStyle: { color: text, fontSize: 11 },
      data: subjects
    },
    xAxis: {
      type: 'category' as const,
      data: exams.map(e => e.examName),
      boundaryGap: false,
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
      axisLabel: { color: text, fontSize: 10, interval: 0, rotate: exams.length > 4 ? 30 : 0 }
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: border, type: 'dashed' as const } },
      axisLabel: { color: text, fontSize: 11 }
    },
    series: subjects.map(sub => ({
      name: sub,
      type: 'line' as const,
      connectNulls: true,
      data: exams.map(e => {
        const s = e.subjects.find(x => x.subject === sub)
        return s ? s.score : null
      }),
      smooth: true,
      symbol: 'circle',
      symbolSize: 7
    }))
  }
})

onMounted(async () => {
  await store.loadGrades()
})
</script>

<template>
  <div class="sg-shell">
    <StudentToolbar title="成绩记录">
      <el-button type="primary" size="small" class="sg-add-btn" data-testid="sg-add" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增成绩
      </el-button>
    </StudentToolbar>

    <!-- 学段分组（一级导航） -->
    <el-radio-group
      :model-value="store.activeStage"
      class="sg-stage-group"
      size="small"
      data-testid="sg-stage-group"
      @change="onStageChange"
    >
      <el-radio-button label="全部" value="" data-testid="sg-stage-all" />
      <el-radio-button
        v-for="g in stageGroups"
        :key="g.key"
        :label="g.label"
        :value="g.key"
        :data-testid="`sg-stage-${g.key}`"
      />
    </el-radio-group>

    <!-- 年级标签页（二级导航，按学段收敛） -->
    <el-tabs
      :model-value="store.activeLevel"
      class="sg-level-tabs"
      data-testid="sg-level-tabs"
      @tab-change="onTabChange"
    >
      <el-tab-pane name="" :label="overviewLabel" data-testid="sg-tab-overview" />
      <el-tab-pane
        v-for="lv in store.visibleGradeTabs"
        :key="lv"
        :name="lv"
        :label="lv"
        :data-testid="`sg-tab-${lv}`"
      />
    </el-tabs>

    <!-- 统计卡（当前年级作用域） -->
    <div class="sg-summary">
      <div class="sg-summary-card sg-summary-primary">
        <div class="sg-summary-label">考试次数</div>
        <div class="sg-summary-value">{{ store.levelStats.recordCount }}</div>
        <div class="sg-summary-sub">{{ store.levelStats.recordCount ? '累计录入' : '还没有记录' }}</div>
      </div>
      <div class="sg-summary-card sg-summary-soft">
        <div class="sg-summary-label">总均分</div>
        <div class="sg-summary-value">
          {{ store.levelStats.overallAvg !== null ? store.levelStats.overallAvg.toFixed(1) : '—' }}
        </div>
        <div class="sg-summary-sub">各科均分的平均</div>
      </div>
      <div class="sg-summary-card sg-summary-soft">
        <div class="sg-summary-label">最近考试</div>
        <div class="sg-summary-value sg-summary-sm">
          {{ latestExam ? latestExam.examName : '—' }}
        </div>
        <div class="sg-summary-sub">{{ latestExam ? `${latestExam.date} · ${latestExam.examType}` : '待录入' }}</div>
      </div>
    </div>

    <!-- 各科均分（当前年级作用域） -->
    <div v-if="store.levelStats.subjectAverages.length" class="sg-subj-averages" data-testid="sg-subj-averages">
      <span
        v-for="sa in store.levelStats.subjectAverages"
        :key="sa.subject"
        class="sg-subj-chip"
        :title="`${sa.subject}：平均 ${sa.avg.toFixed(1)} / ${sa.fullScore}，共 ${sa.count} 次`"
      >
        {{ sa.subject }} <b>{{ sa.avg.toFixed(1) }}</b>
      </span>
    </div>

    <!-- 排序切换 -->
    <div class="sg-toolbar-row">
      <el-radio-group :model-value="store.sortMode" size="small" @update:model-value="setSortMode($event as 'date' | 'name')" data-testid="sg-sort">
        <el-radio-button value="date">按日期</el-radio-button>
        <el-radio-button value="name">按名称</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 空状态 -->
    <div v-if="store.pagedLevelGrades.total === 0" class="sg-empty" data-testid="sg-empty">
      {{ store.activeStage ? `「${activeStageLabel}」还没有成绩记录` : (store.activeLevel ? `「${store.activeLevel}」还没有成绩记录` : '还没有成绩记录') }}，点右上角「新增成绩」开始吧
    </div>

    <!-- 成绩表格 + 分页 -->
    <template v-else>
      <el-table
        :data="store.pagedLevelGrades.items"
        size="small"
        stripe
        class="sg-table"
        data-testid="sg-table"
        row-key="id"
        @row-click="onRowClick"
      >
        <el-table-column prop="examName" label="考试名称" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="sg-t-name">{{ row.examName }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="examType" label="类型" width="92" />
        <el-table-column prop="date" label="日期" width="112" />
        <el-table-column label="科目数" width="74" align="center">
          <template #default="{ row }">{{ row.subjects.length }}</template>
        </el-table-column>
        <el-table-column label="平均分" width="92" align="center">
          <template #default="{ row }">
            <b class="sg-t-avg">{{ rowAvgText(row) }}</b>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="128" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" :data-testid="`sg-edit-${row.id}`" @click.stop="openEditDialog(row.id)">编辑</el-button>
            <el-button link type="danger" size="small" :data-testid="`sg-del-${row.id}`" @click.stop="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        :current-page="store.pagedLevelGrades.page"
        :page-size="GRADE_PAGE_SIZE"
        :total="store.pagedLevelGrades.total"
        layout="total, prev, pager, next"
        class="sg-pagination"
        data-testid="sg-pagination"
        @current-change="store.setPage"
      />
    </template>

    <!-- 趋势图（当前年级作用域） -->
    <div v-if="allSubjects.length" class="sg-chart-block" data-testid="sg-chart-block">
      <div class="sg-chart-head">
        <h4 class="sg-block-title">📈 成绩趋势</h4>
        <el-select
          v-model="selectedTrendSubjects"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          placeholder="全部科目"
          size="small"
          class="sg-trend-select"
          data-testid="sg-trend-subjects"
          @change="() => {}"
        >
          <el-option v-for="s in allSubjects" :key="s" :value="s" :label="s" />
        </el-select>
      </div>
      <div class="sg-chart-wrap">
        <v-chart class="sg-chart" :option="chartOption" autoresize aria-label="成绩趋势折线图" />
      </div>
    </div>

    <!-- 录入/编辑弹框 -->
    <el-dialog
      v-model="showDialog"
      :title="editingId ? '编辑成绩' : '新增成绩'"
      width="560px"
      class="sg-dialog"
      append-to-body
      @close="closeDialog"
    >
      <div class="sg-form">
        <div class="sg-form-row">
          <div class="sg-form-field">
            <label>年级</label>
            <el-select v-model="formGrade" placeholder="选择年级" data-testid="sg-form-grade">
              <el-option v-for="lv in gradeLevels" :key="lv" :value="lv" :label="lv" />
            </el-select>
          </div>
          <div class="sg-form-field">
            <label>考试类型</label>
            <el-select
              v-model="formExamType"
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入"
              data-testid="sg-form-type"
            >
              <el-option v-for="t in examTypeOptions" :key="t" :value="t" :label="t" />
            </el-select>
          </div>
        </div>
        <div class="sg-form-field">
          <label>考试名称</label>
          <el-input
            v-model="formExamName"
            placeholder="如：2026春季期中考试"
            maxlength="30"
            data-testid="sg-form-name"
            @keyup.enter="saveDialog"
          />
        </div>
        <div class="sg-form-field">
          <label>考试日期</label>
          <el-date-picker v-model="formDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" data-testid="sg-form-date" />
        </div>

        <div class="sg-form-field">
          <label class="sg-subj-label">
            各科成绩
            <el-button link type="primary" size="small" data-testid="sg-form-add-subj" @click="addSubjectRow">+ 添加科目</el-button>
          </label>
          <div class="sg-subj-rows">
            <div v-for="(row, i) in formSubjects" :key="i" class="sg-subj-row" :data-testid="`sg-form-subj-${i}`">
              <el-select
                v-model="row.subject"
                filterable
                allow-create
                default-first-option
                placeholder="科目"
                size="small"
                class="sg-subj-name"
                :data-testid="`sg-form-subj-name-${i}`"
              >
                <el-option v-for="s in subjectOptions" :key="s" :value="s" :label="s" />
              </el-select>
              <el-input-number
                v-model="row.score"
                :min="0"
                :max="200"
                :step="1"
                :precision="1"
                controls-position="right"
                size="small"
                placeholder="分"
                class="sg-subj-score"
                :data-testid="`sg-form-subj-score-${i}`"
              />
              <el-input-number
                v-model="row.fullScore"
                :min="1"
                :max="200"
                :step="10"
                :precision="0"
                controls-position="right"
                size="small"
                placeholder="满分"
                class="sg-subj-full"
                :data-testid="`sg-form-subj-full-${i}`"
              />
              <button
                class="sg-subj-remove"
                :data-testid="`sg-form-subj-del-${i}`"
                title="移除"
                :disabled="formSubjects.length === 1"
                @click="removeSubjectRow(i)"
              >
                <Icon name="close" :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button v-if="editingId" type="danger" data-testid="sg-form-delete" @click="handleDelete(editingId)">删除</el-button>
          <div class="dialog-footer-right">
            <el-button @click="closeDialog">取消</el-button>
            <el-button type="primary" data-testid="sg-form-save" @click="saveDialog">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sg-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px;
}

.sg-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ===== 学段分组（一级导航） ===== */
.sg-stage-group {
  flex-wrap: wrap;
  row-gap: 6px;
}

/* ===== 年级标签页 ===== */
.sg-level-tabs {
  --el-tabs-header-height: auto;
}
.sg-level-tabs :deep(.el-tabs__header) {
  margin: 0;
}
.sg-level-tabs :deep(.el-tabs__nav-wrap) {
  padding-bottom: 2px;
}

/* ===== 统计卡 ===== */
.sg-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.sg-summary-card {
  padding: 12px 14px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  background-color: var(--color-bg-card, #fff);
}
.sg-summary-primary {
  border-color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-soft, #eff6ff);
}
.sg-summary-soft {
  background-color: var(--color-bg-hover, #f8fafc);
}
.sg-summary-label {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.sg-summary-value {
  margin-top: 4px;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text, #0f172a);
  font-variant-numeric: tabular-nums;
}
.sg-summary-sm {
  font-size: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sg-summary-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}

/* 各科均分 chips */
.sg-subj-averages {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sg-subj-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-bg-hover, #f1f5f9);
  border: 1px solid var(--color-border, #e2e8f0);
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
}
.sg-subj-chip b {
  color: var(--color-text, #0f172a);
  font-variant-numeric: tabular-nums;
}

.sg-toolbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ===== 表格 ===== */
.sg-table {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
}
.sg-table :deep(.el-table__row) {
  cursor: pointer;
}
.sg-t-name {
  font-weight: 500;
  color: var(--color-text, #0f172a);
}
.sg-t-avg {
  color: var(--color-text, #0f172a);
  font-variant-numeric: tabular-nums;
}

.sg-pagination {
  display: flex;
  justify-content: flex-end;
}

.sg-empty {
  padding: 28px;
  text-align: center;
  color: var(--color-text-secondary, #64748b);
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 12px;
  background: var(--color-bg-card, #fff);
}

/* ===== 趋势图 ===== */
.sg-chart-block {
  padding: 14px 16px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  background: var(--color-bg-card, #fff);
}
.sg-chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.sg-block-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #0f172a);
}
.sg-trend-select {
  width: 200px;
}
.sg-chart-wrap {
  width: 100%;
  height: 280px;
}
.sg-chart {
  width: 100%;
  height: 100%;
}

/* ===== 录入弹框 ===== */
.sg-dialog :deep(.el-dialog__body) {
  padding: 18px 20px;
  overflow-y: auto;
}
.sg-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sg-form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sg-form-field label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, #0f172a);
}
.sg-form-row {
  display: flex;
  gap: 12px;
}
.sg-form-row .sg-form-field { flex: 1; }
.sg-subj-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sg-subj-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sg-subj-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sg-subj-name { flex: 1 1 auto; min-width: 0; }
.sg-subj-score { width: 92px; }
.sg-subj-full { width: 92px; }
.sg-subj-remove {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted, #9ca3af);
  cursor: pointer;
}
.sg-subj-remove:hover:not(:disabled) { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.sg-subj-remove:disabled { opacity: 0.4; cursor: not-allowed; }

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.dialog-footer-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

html.dark .sg-summary-primary {
  background-color: rgba(59, 130, 246, 0.12);
}
html.dark .sg-summary-soft {
  background-color: var(--color-bg-hover, #1f2937);
}

@media (max-width: 768px) {
  .sg-form-row { flex-direction: column; }
  .sg-chart-wrap { height: 240px; }
  .sg-trend-select { width: 140px; }
  /* 科目行允许换行，避免窄屏挤压 */
  .sg-subj-row { flex-wrap: wrap; }
  /* 分页居中，避免小屏贴右溢出 */
  .sg-pagination { justify-content: center; }
}

@media (max-width: 480px) {
  .sg-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
</style>
