<script setup lang="ts">
// 学生工作台课程表面板（M2 重构版）
// 布局：顶部工具条（周次/导出/配置/清空） + 今日速览条 + 学科图例 + 7列网格（首列&表头 sticky）
// 易用增强：今日列高亮、当前节次高亮、学科配色、教室徽标、语义化 grid + 键盘导航、空状态引导
// 数据：useStudentTimetableStore（独立 IDB store 'student_timetable'，严格隔离成人数据）
// 学科下拉来自 studentSettings.subjects；色板来自 studentTimetableCore（稳定映射）
// K 段菜单默认关闭此面板；P/J 段空表，用户自填

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStudentTimetableStore } from '@/stores/studentTimetable'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import {
  weekdayLabel,
  subjectColor,
  subjectStyleVars
} from '@/composables/studentTimetableCore'
import type { StudentTimetableCell } from '@/types'
import Icon from '@/components/Icon.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'

const store = useStudentTimetableStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()

const DAYS = [1, 2, 3, 4, 5, 6, 7] // 周一~周日

const periods = computed(() => {
  const n = store.data.periodsPerDay
  const arr: number[] = []
  for (let i = 1; i <= n; i++) arr.push(i)
  return arr
})

function getCell(day: number, period: number): StudentTimetableCell | undefined {
  return store.getCell(day, period)
}

// ===== 主题态（用于学科文字色提亮，暗色下保证对比度）=====
function isDarkNow(): boolean {
  if (typeof document === 'undefined') return true
  return document.documentElement.classList.contains('dark')
}
const themeTick = ref(0)
let themeObserver: MutationObserver | null = null

// ===== 实时「今天 / 当前节次」=====
const now = ref(new Date())
let nowTimer: number | undefined
function nowMinutes(): number {
  const d = now.value
  return d.getHours() * 60 + d.getMinutes()
}
// 1=周一 ... 7=周日
const todayIdx = computed(() => {
  const d = now.value.getDay()
  return d === 0 ? 7 : d
})
function isCurrent(day: number, period: number): boolean {
  const cell = getCell(day, period)
  if (!cell || day !== todayIdx.value) return false
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  const s = toMin(cell.startHHMM)
  const e = toMin(cell.endHHMM)
  const cur = nowMinutes()
  return cur >= s && cur < e
}

// ===== 学科配色 =====
const legendSubjects = computed(() => settingsStore.subjects)
function cellVars(subject: string): Record<string, string> {
  return subjectStyleVars(subject, isDarkNow())
}

// ===== 今日速览 =====
const todayLessons = computed(() => {
  const d = todayIdx.value
  const cells = Object.keys(store.data.schedule)
    .filter((k) => k.startsWith(d + '_'))
    .map((k) => {
      const period = Number(k.split('_')[1])
      return { period, ...(store.getCell(d, period) as StudentTimetableCell) }
    })
    .sort((a, b) => a.startHHMM.localeCompare(b.startHHMM))
  return cells
})
function lessonState(cell: StudentTimetableCell): 'now' | 'upcoming' | 'done' {
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
  }
  const s = toMin(cell.startHHMM)
  const e = toMin(cell.endHHMM)
  const cur = nowMinutes()
  if (cur >= s && cur < e) return 'now'
  if (cur < s) return 'upcoming'
  return 'done'
}

// ===== 空状态 =====
const hasAnyCell = computed(() => Object.keys(store.data.schedule).length > 0)

// ===== 周次展示切换（仅展示，不改 schedule）=====
const currentWeek = ref(1)
watch(
  () => store.data.weeks,
  (w) => {
    if (currentWeek.value > w) currentWeek.value = w
  }
)
function prevWeek(): void {
  if (currentWeek.value > 1) currentWeek.value--
}
function nextWeek(): void {
  if (currentWeek.value < store.data.weeks) currentWeek.value++
}

// ===== 导出 Excel =====
function exportToExcel() {
  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const ps = periods.value
  const rows: string[][] = []

  rows.push(['节次', ...dayLabels])

  for (const p of ps) {
    const row: string[] = [String(p)]
    for (const d of DAYS) {
      const cell = getCell(d, p)
      if (cell) {
        const parts = [cell.subject]
        if (cell.startHHMM && cell.endHHMM) parts.push(cell.startHHMM + '-' + cell.endHHMM)
        if (cell.teacher) parts.push(cell.teacher)
        if (cell.room) parts.push(cell.room)
        row.push(parts.join(' / '))
      } else {
        row.push('')
      }
    }
    rows.push(row)
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>课程表</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>td,th{border:1px solid #999;padding:6px 8px;font-size:14px;}th{background:#3b82f6;color:#fff;font-weight:bold;text-align:center;}.period{background:#f0f9ff;font-weight:bold;text-align:center;}</style>
</head><body><table><thead><tr><th class="period">节次</th>${dayLabels.map((d) => '<th>' + d + '</th>').join('')}</tr></thead><tbody>
${rows.slice(1).map((r) => '<tr><td class="period">' + r[0] + '</td>' + r.slice(1).map((c) => '<td>' + (c || '&nbsp;') + '</td>').join('') + '</tr>').join('\n')}
</tbody></table></body></html>`

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '课程表.xls'
  a.click()
  URL.revokeObjectURL(url)
  toast.success('课程表已导出')
}

// ===== 配置弹框（周数/节数）=====
const showConfigDialog = ref(false)
const configWeeks = ref(store.data.weeks)
const configPeriods = ref(store.data.periodsPerDay)
const configClassroom = ref(store.data.classroom || '')

function openConfigDialog(): void {
  configWeeks.value = store.data.weeks
  configPeriods.value = store.data.periodsPerDay
  configClassroom.value = store.data.classroom || ''
  showConfigDialog.value = true
}

async function saveConfig(): Promise<void> {
  await store.updateConfig(configWeeks.value, configPeriods.value, configClassroom.value)
  showConfigDialog.value = false
  toast.success('课程表配置已更新')
}

// ===== cell 编辑弹框 =====
const showCellDialog = ref(false)
const editingDay = ref(0)
const editingPeriod = ref(0)
const dialogSubject = ref('')
const dialogTeacher = ref('')
const dialogRoom = ref('')
const dialogStart = ref('08:00')
watch(dialogStart, (val) => {
  if (!val || !/^\d{2}:\d{2}$/.test(val)) return
  const [h, m] = val.split(':').map(Number)
  const total = h * 60 + m + 45
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  dialogEnd.value = String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0')
}, { flush: 'sync' })

const dialogEnd = ref('08:45')
const dialogSubjectCustom = ref(false)

function openCellDialog(day: number, period: number): void {
  editingDay.value = day
  editingPeriod.value = period
  const existing = getCell(day, period)
  dialogSubject.value = existing?.subject ?? settingsStore.subjects[0] ?? ''
  dialogTeacher.value = existing?.teacher ?? ''
  dialogRoom.value = existing?.room ?? ''
  dialogStart.value = existing?.startHHMM ?? '08:00'
  dialogEnd.value = existing?.endHHMM ?? '08:45'
  dialogSubjectCustom.value = existing
    ? !settingsStore.subjects.includes(existing.subject)
    : false
  showCellDialog.value = true
}

function closeCellDialog(): void {
  showCellDialog.value = false
}

const TIMETABLE_ERROR_MESSAGES: Record<string, string> = {
  empty: '学科不能为空',
  'invalid-time': '时间格式错误或结束时间需晚于开始时间',
  'not-found': '课程不存在'
}
function timetableErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(TIMETABLE_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

async function saveCell(): Promise<void> {
  const subject = dialogSubject.value.trim()
  if (!subject) {
    toast.error('学科不能为空')
    return
  }
  const cell: StudentTimetableCell = {
    subject,
    startHHMM: dialogStart.value,
    endHHMM: dialogEnd.value,
    teacher: dialogTeacher.value.trim() || undefined,
    room: dialogRoom.value.trim() || undefined
  }
  const result = await store.setCell(editingDay.value, editingPeriod.value, cell)
  if (result.ok) closeCellDialog()
  timetableErrorToast(result)
}

async function removeCell(): Promise<void> {
  const result = await store.clearCell(editingDay.value, editingPeriod.value)
  if (result.ok) closeCellDialog()
  timetableErrorToast(result)
}

async function clearAllCells(): Promise<void> {
  if (!confirm('确定要清空全部课程吗？此操作不可撤销。')) return
  await store.clearAll()
  toast.success('已清空全部课程')
}

// ===== 键盘导航（gridcell 方向键移动焦点）=====
function onCellKey(e: KeyboardEvent, day: number, period: number): void {
  const map: Record<string, [number, number]> = {
    ArrowRight: [day + 1, period],
    ArrowLeft: [day - 1, period],
    ArrowDown: [day, period + 1],
    ArrowUp: [day, period - 1]
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    openCellDialog(day, period)
    return
  }
  const target = map[e.key]
  if (!target) return
  e.preventDefault()
  const [nd, np] = target
  if (nd < 1 || nd > 7 || np < 1 || np > store.data.periodsPerDay) return
  const el = document.getElementById(`tt-cell-${nd}-${np}`)
  el?.focus()
}

onMounted(async () => {
  await store.loadTimetable()
  nowTimer = window.setInterval(() => {
    now.value = new Date()
  }, 30_000)
  // 主题切换时重算学科文字色
  themeObserver = new MutationObserver(() => {
    themeTick.value++
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  if (nowTimer) window.clearInterval(nowTimer)
  themeObserver?.disconnect()
})
</script>

<template>
  <div class="stt-shell">
    <StudentToolbar title="课程表">
      <div class="stt-week-switch">
        <button class="stt-week-btn" :disabled="currentWeek <= 1" title="上一周" @click="prevWeek">‹</button>
        <span class="stt-week-label">第 {{ currentWeek }} 周</span>
        <button class="stt-week-btn" :disabled="currentWeek >= store.data.weeks" title="下一周" @click="nextWeek">›</button>
      </div>
      <span class="stt-meta">{{ store.data.classroom || '未设班级' }} · 每日 {{ store.data.periodsPerDay }} 节</span>
      <el-button size="small" @click="exportToExcel">
        <Icon name="download" :size="14" /> 导出Excel
      </el-button>
      <el-button size="small" @click="openConfigDialog">
        <Icon name="countdowns" :size="14" /> 配置
      </el-button>
      <el-button size="small" type="danger" plain @click="clearAllCells">
        <Icon name="close" :size="14" /> 清空
      </el-button>
    </StudentToolbar>

    <!-- 今日速览条 -->
    <div class="stt-today" :key="themeTick">
      <div class="stt-today-head">
        <h3>今日课程 · {{ weekdayLabel(todayIdx) }}</h3>
        <span class="stt-today-tag">今天</span>
      </div>
      <div v-if="todayLessons.length" class="stt-chips">
        <div
          v-for="c in todayLessons"
          :key="c.period"
          class="stt-chip"
          :class="{ 'is-now': lessonState(c) === 'now' }"
          :style="cellVars(c.subject)"
        >
          <span class="stt-chip-subject">{{ c.subject }}</span>
          <span class="stt-chip-meta">第{{ c.period }}节 · {{ c.startHHMM }}-{{ c.endHHMM }}{{ c.room ? ' · ' + c.room : '' }}</span>
          <span class="stt-chip-state">
            {{ lessonState(c) === 'now' ? '● 正在进行' : lessonState(c) === 'upcoming' ? '○ 待上' : '— 已结束' }}
          </span>
        </div>
      </div>
      <div v-else class="stt-chips">
        <div class="stt-chip stt-chip-empty">
          <span class="stt-chip-subject">今天没有排课</span>
          <span class="stt-chip-meta">好好休息</span>
        </div>
      </div>
    </div>

    <!-- 学科图例 -->
    <div class="stt-legend">
      <span
        v-for="s in legendSubjects"
        :key="s"
        class="stt-legend-item"
        :style="{ '--c': subjectColor(s) }"
      >
        <span class="stt-legend-dot" />{{ s }}
      </span>
    </div>

    <!-- 网格 -->
    <div class="stt-grid-wrap">
      <div v-if="!hasAnyCell" class="stt-empty">
        <p>还没有排课。点击任意格子添加第一节课～</p>
        <p class="stt-empty-hint">提示：可先在「设置 → 学科」里预设常用学科。</p>
      </div>
      <div
        v-else
        class="stt-grid"
        :style="{ gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))` }"
        role="grid"
        aria-label="课程表"
      >
        <!-- 表头：角落 + 周一~周日 -->
        <div class="stt-cell stt-corner" role="columnheader">节</div>
        <div
          v-for="d in DAYS"
          :key="`head-${d}`"
          class="stt-cell stt-head-cell"
          :class="{ today: d === todayIdx }"
          role="columnheader"
        >{{ weekdayLabel(d) }}</div>

        <!-- 每行：节次 + 7 天 -->
        <template v-for="p in periods" :key="`row-${p}`">
          <div class="stt-cell stt-period-cell" role="rowheader">{{ p }}</div>
          <div
            v-for="d in DAYS"
            :key="`cell-${d}-${p}`"
            :id="`tt-cell-${d}-${p}`"
            class="stt-cell stt-body-cell"
            :class="{ 'has-lesson': !!getCell(d, p), 'empty': !getCell(d, p), 'col-today': d === todayIdx, 'current': isCurrent(d, p) }"
            :style="getCell(d, p) ? cellVars(getCell(d, p)!.subject) : undefined"
            role="gridcell"
            tabindex="0"
            :aria-label="getCell(d, p) ? `${weekdayLabel(d)} 第${p}节 ${getCell(d, p)!.subject} ${getCell(d, p)!.startHHMM}-${getCell(d, p)!.endHHMM}` : `${weekdayLabel(d)} 第${p}节 空`"
            @click="openCellDialog(d, p)"
            @keydown="onCellKey($event, d, p)"
          >
            <template v-if="getCell(d, p)">
              <div class="stt-subject">
                {{ getCell(d, p)!.subject }}<span v-if="getCell(d, p)!.teacher" class="stt-teacher">（{{ getCell(d, p)!.teacher }}）</span>
              </div>
              <div class="stt-time">{{ getCell(d, p)!.startHHMM }}-{{ getCell(d, p)!.endHHMM }}</div>
              <div class="stt-badges">
                <span v-if="getCell(d, p)!.room" class="stt-badge">室 {{ getCell(d, p)!.room }}</span>
              </div>
            </template>
            <template v-else>
              <span class="stt-add-mark">+</span>
            </template>
          </div>
        </template>
      </div>
    </div>

    <!-- 配置弹框 -->
    <el-dialog v-model="showConfigDialog" title="课程表配置" width="460px" class="stt-config-dialog" append-to-body>
      <div class="dialog-body">
        <div class="form-field">
          <label>学周数（1-52）</label>
          <el-input v-model.number="configWeeks" type="number" min="1" max="52" />
        </div>
        <div class="form-field">
          <label>每日节数（1-12）</label>
          <el-input v-model.number="configPeriods" type="number" min="1" max="12" />
        </div>
        <div class="form-field">
          <label>教室/班级（可选）</label>
          <el-input v-model="configClassroom" type="text" maxlength="30" placeholder="如：三年二班 / 301" />
        </div>
        <p class="stt-tip">提示：节数减少后，超出范围的课程会保留但不在表格中显示。</p>
      </div>
      <template #footer>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>

    <!-- cell 编辑弹框 -->
    <el-dialog v-model="showCellDialog" :title="getCell(editingDay, editingPeriod) ? '编辑课程' : '新增课程'" width="460px" class="stt-cell-dialog" append-to-body>
      <div class="dialog-body">
        <div class="stt-dialog-meta">
          {{ weekdayLabel(editingDay) }} · 第 {{ editingPeriod }} 节
        </div>
        <div class="form-field">
          <label>学科</label>
          <el-select v-if="!dialogSubjectCustom" v-model="dialogSubject" class="stt-subject-select">
            <el-option v-for="s in settingsStore.subjects" :key="s" :value="s" :label="s" />
          </el-select>
          <el-input
            v-else
            v-model="dialogSubject"
            type="text"
            placeholder="输入学科名称"
            maxlength="10"
          />
          <el-checkbox class="stt-custom-toggle" v-model="dialogSubjectCustom">自定义学科</el-checkbox>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>开始时间</label>
            <el-input v-model="dialogStart" type="time" />
          </div>
          <div class="form-field">
            <label>结束时间</label>
            <el-input v-model="dialogEnd" type="time" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>老师（可选）</label>
            <el-input v-model="dialogTeacher" type="text" maxlength="20" placeholder="如：王老师" />
          </div>
          <div class="form-field">
            <label>教室（可选）</label>
            <el-input v-model="dialogRoom" type="text" maxlength="20" placeholder="如：301" />
          </div>
        </div>
      </div>
      <template #footer>
        <div class="stt-dialog-footer">
          <el-button v-if="getCell(editingDay, editingPeriod)" type="danger" @click="removeCell">
            删除
          </el-button>
          <div class="dialog-footer-right">
            <el-button @click="closeCellDialog">取消</el-button>
            <el-button type="primary" @click="saveCell">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.stt-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
  padding: 16px;
}

.stt-meta {
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
}

.stt-week-switch {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  padding: 2px;
}
.stt-week-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #4b5563);
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.stt-week-btn:hover:not(:disabled) {
  background: var(--color-hover, #f3f4f6);
  color: var(--color-primary, #3b82f6);
}
.stt-week-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.stt-week-label {
  min-width: 64px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
}

/* 今日速览条 */
.stt-today {
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 12px;
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}
.stt-today-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.stt-today-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.stt-today-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}
.stt-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.stt-chip {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 104px;
  padding: 8px 12px;
  border-radius: 8px;
  border-left: 3px solid var(--c, #64748b);
  background: var(--c-soft, var(--color-hover, #f3f4f6));
}
.stt-chip.is-now {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 1px;
}
.stt-chip-subject {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-strong, var(--color-text, #1f2937));
}
.stt-chip-meta {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}
.stt-chip-state {
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
}
.stt-chip-empty .stt-chip-subject {
  color: var(--color-text-muted, #6b7280);
}

/* 图例 */
.stt-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.stt-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary, #4b5563);
}
.stt-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--c, #64748b);
}

/* 网格滚动容器：占满父容器（100% 高度），内容超出时内部滚动。
   PC 端课程信息在 100% 高度内完整展示；移动端内容超出则启用竖向滚动，
   仅表格内部滚动，工具栏/今日速览/图例保持固定。 */
.stt-grid-wrap {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: var(--color-bg-card, #fff);
}
.stt-grid {
  display: grid;
  gap: 4px;
  min-width: 640px;
  padding: 4px;
}
.stt-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  font-size: 14px;
  overflow: hidden;
}
.stt-corner {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 5;
  background: var(--color-surface, #fff);
  font-weight: 600;
  color: var(--color-text-muted, #6b7280);
  min-height: 38px;
  min-width: 48px;
}
.stt-head-cell {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
  font-size: 14px;
  min-height: 38px;
}
.stt-head-cell.today {
  background: var(--color-primary, #3b82f6);
  color: #fff;
}
.stt-head-cell.today::after {
  content: '今天';
  display: block;
  font-size: 10px;
  font-weight: 500;
  opacity: 0.9;
  margin-top: 1px;
}
.stt-period-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--color-hover, #f3f4f6);
  font-weight: 600;
  color: var(--color-text-muted, #6b7280);
  min-height: 62px;
  min-width: 48px;
}
.stt-body-cell {
  flex-direction: column;
  align-items: stretch;
  padding: 6px;
  cursor: pointer;
  min-height: 62px;
  text-align: left;
  transition: background 0.15s, border-color 0.15s, transform 0.15s var(--ease-out, ease);
}
.stt-body-cell:hover {
  background: var(--color-hover, #f3f4f6);
  border-color: var(--color-primary, #3b82f6);
}
.stt-body-cell:active {
  transform: scale(0.98);
}
.stt-body-cell:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 1px;
}
.stt-body-cell.has-lesson {
  background: var(--c-soft, rgba(59, 130, 246, 0.06));
  border-left: 3px solid var(--c, var(--color-primary, #3b82f6));
}
.stt-body-cell.col-today {
  background: rgba(59, 130, 246, 0.06);
}
.stt-body-cell.current {
  box-shadow: 0 0 0 2px var(--color-primary, #3b82f6), 0 0 14px rgba(59, 130, 246, 0.45);
  z-index: 1;
}
.stt-body-cell.empty {
  border-style: dashed;
  align-items: center;
  justify-content: center;
}
.stt-body-cell.empty:hover {
  border-style: solid;
}
.stt-subject {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-strong, var(--color-text, #1f2937));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.stt-teacher {
  font-weight: 500;
  font-size: 13px;
  color: var(--color-text-muted, #9ca3af);
}
.stt-time {
  font-size: 13px;
  color: var(--c, var(--color-primary, #3b82f6));
  font-weight: 500;
  margin-top: 2px;
}
.stt-badges {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.stt-badge {
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  padding: 1px 5px;
}
.stt-add-mark {
  font-size: 22px;
  color: var(--color-text-muted, #d1d5db);
  font-weight: 300;
}

/* 空状态 */
.stt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 240px;
  text-align: center;
  color: var(--color-text-muted, #6b7280);
}
.stt-empty p {
  margin: 4px 0;
  font-size: 15px;
}
.stt-empty-hint {
  font-size: 13px;
}

.stt-tip {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
}

.dialog-body {
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-field label {
  font-size: 15px;
  font-weight: 500;
}
.form-row {
  display: flex;
  gap: 12px;
}
.form-row .form-field { flex: 1; }
.stt-dialog-meta {
  font-size: 15px;
  color: var(--color-text-muted, #6b7280);
  padding: 6px 10px;
  background: var(--color-hover, #f3f4f6);
  border-radius: 6px;
}
.stt-custom-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 15px;
  font-weight: 400;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
}
.dialog-footer-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.stt-dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.stt-subject-select {
  width: 100%;
}

@media (max-width: 768px) {
  .stt-shell { padding: 12px; }
  .stt-grid { min-width: 560px; }
  .stt-body-cell { min-height: 56px; }
  .form-row { flex-direction: column; }
}

@media (max-width: 480px) {
  .stt-config-dialog :deep(.el-dialog),
  .stt-cell-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
</style>
