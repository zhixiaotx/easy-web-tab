<script setup lang="ts">
// 学生工作台课程表面板（M2）
// 布局：顶部工具条（周数/节数配置）+ 7 列网格表格 + cell 编辑弹框
// 数据：useStudentTimetableStore（独立 IDB store 'student_timetable'，严格隔离成人数据）
// 学科下拉来自 studentSettings.subjects
// K 段菜单默认关闭此面板；P/J 段空表，用户自填

import { computed, onMounted, ref, watch } from 'vue'
import { useStudentTimetableStore } from '@/stores/studentTimetable'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import { weekdayLabel } from '@/composables/studentTimetableCore'
import type { StudentTimetableCell } from '@/types'
import Icon from '@/components/Icon.vue'

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


// ===== 导出 Excel =====
function exportToExcel() {
  const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const ps = periods.value
  const rows: string[][] = []

  // Header row
  rows.push(['节次', ...dayLabels])

  // Data rows
  for (const p of ps) {
    const row: string[] = [String(p)]
    for (const d of DAYS) {
      const cell = getCell(d, p)
      if (cell) {
        const parts = [cell.subject]
        if (cell.startHHMM && cell.endHHMM) parts.push(cell.startHHMM + '-' + cell.endHHMM)
        if (cell.teacher) parts.push(cell.teacher)
        row.push(parts.join(' / '))
      } else {
        row.push('')
      }
    }
    rows.push(row)
  }

  // Build HTML table for Excel
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>课程表</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>td,th{border:1px solid #999;padding:6px 8px;font-size:14px;}th{background:#3b82f6;color:#fff;font-weight:bold;text-align:center;}.period{background:#f0f9ff;font-weight:bold;text-align:center;}</style>
</head><body><table><thead><tr><th class="period">节次</th>${dayLabels.map(d => '<th>' + d + '</th>').join('')}</tr></thead><tbody>
${rows.slice(1).map((r, i) => '<tr><td class="period">' + r[0] + '</td>' + r.slice(1).map(c => '<td>' + (c || '&nbsp;') + '</td>').join('') + '</tr>').join('\n')}
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

onMounted(async () => {
  await store.loadTimetable()
})
</script>

<template>
  <div class="stt-shell">
    <div class="stt-toolbar">
      <div class="stt-title-row">
        <h2 class="stt-title">课程表</h2>
        <span class="stt-meta">共 {{ store.data.weeks }} 周 · 每日 {{ store.data.periodsPerDay }} 节</span>
      </div>
      <div class="stt-actions">
        <button class="btn-ghost" @click="exportToExcel">
          <Icon name="download" :size="14" /> 导出Excel
        </button>
        <button class="btn-ghost" @click="openConfigDialog">
          <Icon name="countdowns" :size="14" /> 配置
        </button>
        <button class="btn-danger-ghost" @click="clearAllCells">
          <Icon name="close" :size="14" /> 清空
        </button>
      </div>
    </div>

    <div class="stt-grid-wrap">
      <div class="stt-grid" :style="{ gridTemplateColumns: `48px repeat(7, minmax(0, 1fr))` }">
        <!-- 表头：空 + 周一~周日 -->
        <div class="stt-cell stt-head-cell"></div>
        <div
          v-for="d in DAYS"
          :key="`head-${d}`"
          class="stt-cell stt-head-cell"
        >{{ weekdayLabel(d) }}</div>

        <!-- 每行：节次 + 7 天 -->
        <template v-for="p in periods" :key="`row-${p}`">
          <div class="stt-cell stt-period-cell">{{ p }}</div>
          <div
            v-for="d in DAYS"
            :key="`cell-${d}-${p}`"
            class="stt-cell stt-body-cell"
            :class="{ 'has-lesson': !!getCell(d, p) }"
            @click="openCellDialog(d, p)"
          >
            <template v-if="getCell(d, p)">
              <div class="stt-subject">{{ getCell(d, p)!.subject }}</div>
              <div class="stt-time">{{ getCell(d, p)!.startHHMM }}-{{ getCell(d, p)!.endHHMM }}</div>
              <div class="stt-info" v-if="getCell(d, p)!.teacher">
                <strong class="stt-teacher">{{ getCell(d, p)!.teacher }}</strong>
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
    <Teleport to="body">
      <div v-if="showConfigDialog" class="dialog-overlay" @click.self="showConfigDialog = false">
        <div class="dialog st-dialog">
          <div class="dialog-header">
            <h3>课程表配置</h3>
            <button class="dialog-close" @click="showConfigDialog = false"><Icon name="close" :size="18" /></button>
          </div>
          <div class="dialog-body">
            <div class="form-field">
              <label>学周数（1-52）</label>
              <input v-model.number="configWeeks" type="number" min="1" max="52" class="form-input" />
            </div>
            <div class="form-field">
              <label>每日节数（1-12）</label>
              <input v-model.number="configPeriods" type="number" min="1" max="12" class="form-input" />
            </div>
            <div class="form-field">
              <label>教室/班级（可选）</label>
              <input v-model="configClassroom" type="text" class="form-input" maxlength="30" placeholder="如：三年二班 / 301" />
            </div>
            <p class="stt-tip">提示：节数减少后，超出范围的课程会保留但不在表格中显示。</p>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-right">
              <button class="btn-ghost" @click="showConfigDialog = false">取消</button>
              <button class="btn-primary" @click="saveConfig">保存</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- cell 编辑弹框 -->
    <Teleport to="body">
      <div v-if="showCellDialog" class="dialog-overlay" @click.self="closeCellDialog">
        <div class="dialog st-dialog">
          <div class="dialog-header">
            <h3>{{ getCell(editingDay, editingPeriod) ? '编辑课程' : '新增课程' }}</h3>
            <button class="dialog-close" @click="closeCellDialog"><Icon name="close" :size="18" /></button>
          </div>
          <div class="dialog-body">
            <div class="stt-dialog-meta">
              {{ weekdayLabel(editingDay) }} · 第 {{ editingPeriod }} 节
            </div>
            <div class="form-field">
              <label>学科</label>
              <select v-if="!dialogSubjectCustom" v-model="dialogSubject" class="form-input">
                <option v-for="s in settingsStore.subjects" :key="s" :value="s">{{ s }}</option>
              </select>
              <input
                v-else
                v-model="dialogSubject"
                type="text"
                class="form-input"
                placeholder="输入学科名称"
                maxlength="10"
              />
              <label class="stt-custom-toggle">
                <input type="checkbox" v-model="dialogSubjectCustom" /> 自定义学科
              </label>
            </div>
            <div class="form-row">
              <div class="form-field">
                <label>开始时间</label>
                <input v-model="dialogStart" type="time" class="form-input" />
              </div>
              <div class="form-field">
                <label>结束时间</label>
                <input v-model="dialogEnd" type="time" class="form-input" />
              </div>
            </div>
            <div class="form-field">
              <label>老师（可选）</label>
              <input v-model="dialogTeacher" type="text" class="form-input" maxlength="20" placeholder="如：王老师" />
            </div>
          </div>
          <div class="dialog-footer">
            <button v-if="getCell(editingDay, editingPeriod)" class="btn-danger" @click="removeCell">
              删除
            </button>
            <div class="dialog-footer-right">
              <button class="btn-ghost" @click="closeCellDialog">取消</button>
              <button class="btn-primary" @click="saveCell">保存</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
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

.stt-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.stt-title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.stt-title {
   font-size: 20px; 
  font-weight: 600;
  margin: 0;
}
.stt-meta {
   font-size: 14px; 
  color: var(--color-text-muted, #6b7280);
}
.stt-actions {
  display: flex;
  gap: 8px;
}

.stt-grid-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.stt-grid {
  display: grid;
  gap: 4px;
  min-width: 600px;
  height: 100%;
}
.stt-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
   font-size: 16px; 
  background: var(--color-surface, #fff);
  overflow: hidden;
}
.stt-head-cell {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
   font-size: 15px; 
  min-height: 32px;
}
.stt-period-cell {
  background: var(--color-hover, #f3f4f6);
  font-weight: 600;
  color: var(--color-text-muted, #6b7280);
  min-height: 64px;
}
.stt-body-cell {
  flex-direction: column;
  padding: 4px;
  cursor: pointer;
  min-height: 64px;
  transition: background 0.15s, border-color 0.15s;
}
.stt-body-cell:hover {
  background: var(--color-hover, #f3f4f6);
  border-color: var(--color-primary, #3b82f6);
}
.stt-body-cell.has-lesson {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.06));
  border-left: 3px solid var(--color-primary, #3b82f6);
}
.stt-teacher {
  font-weight: 700;
}
.stt-subject {
   font-size: 15px; 
  font-weight: 600;
  color: var(--color-text, #1f2937);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.stt-time {
   font-size: 14px; 
  color: var(--color-primary, #3b82f6);
  font-weight: 500;
}
.stt-info {
   font-size: 14px; 
  color: var(--color-text-muted, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.stt-add-mark {
   font-size: 22px; 
  color: var(--color-text-muted, #d1d5db);
  font-weight: 300;
}

.stt-tip {
  margin: 0;
   font-size: 14px; 
  color: var(--color-text-muted, #6b7280);
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.st-dialog {
  width: 460px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.dialog-header h3 { margin: 0;  font-size: 18px;  }
.dialog-close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: inherit;
  padding: 4px;
}
.dialog-body {
  padding: 20px;
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
.form-input {
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  color: inherit;
   font-size: 16px; 
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
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
.dialog-footer-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.btn-primary {
  padding: 8px 14px;
  border: none;
  border-radius: 6px;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  cursor: pointer;
   font-size: 15px; 
}
.btn-primary:hover { filter: brightness(0.95); }
.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
   font-size: 15px; 
}
.btn-danger {
  padding: 8px 14px;
  border: none;
  border-radius: 6px;
  background: #ef4444;
  color: #fff;
  cursor: pointer;
   font-size: 15px; 
}
.btn-danger-ghost {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
   font-size: 15px; 
}
.btn-danger-ghost:hover { background: rgba(239, 68, 68, 0.08); }

@media (max-width: 768px) {
  .stt-shell { padding: 12px; }
  .stt-grid { min-width: 500px; }
  .stt-body-cell { min-height: 56px; }
}
</style>
