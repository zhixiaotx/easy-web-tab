<script setup lang="ts">
// 学生工作台教育经历面板
// 布局：顶部工具条（+ 新增）+ 表格列表 + 分页
// 数据：useStudentEducationStore（IDB store 'student_education'）

import { computed, onMounted, ref, watch } from 'vue'
import { useStudentEducationStore } from '@/stores/studentEducation'
import { useToast } from '@/composables/useToast'
import { DEGREE_OPTIONS } from '@/types'
import type { EducationEntry, EducationDegree } from '@/types'
import { validateEducationEntry } from '@/composables/studentEducationCore'
import type { NewEducationInput } from '@/stores/studentEducation'

const store = useStudentEducationStore()
const toast = useToast()

// ===== 分页：Element Plus el-pagination，固定 10 条/页 =====
const LIST_PAGE_SIZE = 10
const listPage = ref(1)
const listPageItems = computed<EducationEntry[]>(() => {
  const arr = store.sortedEntries
  const start = (listPage.value - 1) * LIST_PAGE_SIZE
  return arr.slice(start, start + LIST_PAGE_SIZE)
})

// 学位到彩色徽章样式类（9 级）
const DEGREE_BADGE_CLASS: Record<EducationDegree, string> = {
  '幼儿园': 'edu-degree-kindergarten',
  '小学': 'edu-degree-primary',
  '初中': 'edu-degree-junior',
  '高中': 'edu-degree-high',
  '中职': 'edu-degree-vocational',
  '专科': 'edu-degree-college',
  '本科': 'edu-degree-bachelor',
  '硕士': 'edu-degree-master',
  '博士': 'edu-degree-doctor'
}

// ===== 弹框状态 =====
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const formErrors = ref<string[]>([])

const form = ref<NewEducationInput>({
  schoolName: '',
  degree: '小学',
  major: '',
  startDate: '',
  endDate: '',
  isActive: true,
  classTeacher: '',
  courseTeacher: '',
  phone: '',
  note: ''
})

function resetForm() {
  form.value = {
    schoolName: '', degree: '小学', major: '', startDate: '', endDate: '',
    isActive: true, classTeacher: '', courseTeacher: '', phone: '', note: ''
  }
  formErrors.value = []
}

function openAdd() {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(entry: EducationEntry) {
  editingId.value = entry.id
  form.value = {
    schoolName: entry.schoolName,
    degree: entry.degree,
    major: entry.major ?? '',
    startDate: entry.startDate,
    endDate: entry.endDate ?? '',
    isActive: entry.isActive,
    classTeacher: entry.classTeacher ?? '',
    courseTeacher: entry.courseTeacher ?? '',
    phone: entry.phone ?? '',
    note: entry.note ?? ''
  }
  formErrors.value = []
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
  editingId.value = null
}

async function submitForm() {
  const validation = validateEducationEntry(form.value)
  if (!validation.ok) {
    formErrors.value = validation.errors
    return
  }
  formErrors.value = []

  if (editingId.value) {
    const result = await store.updateEducation(editingId.value, form.value)
    if (!result.ok) {
      toast.error(result.errors?.join('；') || '更新失败')
      return
    }
    toast.success('教育经历已更新')
  } else {
    const result = await store.addEducation(form.value)
    if (!result.ok) {
      toast.error(result.errors?.join('；') || '新增失败')
      return
    }
    toast.success('教育经历已添加')
  }
  closeDialog()
  listPage.value = 1
}

// ===== 删除确认 =====
const deleteConfirmVisible = ref(false)
const deleteTargetId = ref<string | null>(null)

function askDelete(entry: EducationEntry) {
  deleteTargetId.value = entry.id
  deleteConfirmVisible.value = true
}

async function confirmDelete() {
  if (!deleteTargetId.value) return
  const result = await store.deleteEducation(deleteTargetId.value)
  if (result.ok) {
    toast.success('教育经历已删除')
  } else {
    toast.error('删除失败')
  }
  deleteConfirmVisible.value = false
  deleteTargetId.value = null
  listPage.value = 1
}

// ===== 在读切换时清除毕业日期 =====
watch(() => form.value.isActive, (active) => {
  if (active) form.value.endDate = ''
})

onMounted(() => {
  store.loadEducation()
})

const degreeOptions = DEGREE_OPTIONS
</script>

<template>
  <section class="edu-panel">
    <!-- 顶部工具条 -->
    <div class="edu-toolbar">
      <button class="btn-add" data-testid="edu-add" @click="openAdd">
        <span>＋ 新增</span>
      </button>
      <div class="edu-count">共 {{ store.totalCount }} 条记录</div>
    </div>

    <!-- 表格区（Element Plus Table） -->
    <div class="edu-list">
      <el-table
        :data="listPageItems"
        stripe
        border
        size="default"
        style="width: 100%"
        height="100%"
        empty-text="暂无教育经历记录，点击「＋ 新增」添加"
      >
        <el-table-column label="学校名称" min-width="220" align="left" show-overflow-tooltip>
          <template #default="{ row }"><span style="font-weight:600;">{{ row.schoolName }}</span></template>
        </el-table-column>
        <el-table-column label="学段" width="110" align="center">
          <template #default="{ row }">
            <span class="edu-degree-badge" :class="DEGREE_BADGE_CLASS[row.degree as EducationDegree]">{{ row.degree }}</span>
          </template>
        </el-table-column>
        <el-table-column label="专业" width="110" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.major">{{ row.major }}</span>
            <span v-else style="color: var(--color-text-secondary,#9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="入学时间" width="120" align="center">
          <template #default="{ row }">{{ row.startDate }}</template>
        </el-table-column>
        <el-table-column label="毕业时间" width="120" align="center">
          <template #default="{ row }">
            <span v-if="row.endDate">{{ row.endDate }}</span>
            <span v-else-if="row.isActive" class="edu-enddate-today">至今</span>
            <span v-else style="color: var(--color-text-secondary,#9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="班主任" width="110" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.classTeacher">{{ row.classTeacher }}</span>
            <span v-else style="color: var(--color-text-secondary,#9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="课老师" width="110" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.courseTeacher">{{ row.courseTeacher }}</span>
            <span v-else style="color: var(--color-text-secondary,#9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="电话号码" width="140" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.phone" style="font-variant-numeric: tabular-nums;">{{ row.phone }}</span>
            <span v-else style="color: var(--color-text-secondary,#9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="200" align="left" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.note">{{ row.note }}</span>
            <span v-else style="color: var(--color-text-secondary,#9ca3af);">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <span class="edu-badge" :class="row.isActive ? 'edu-badge-active' : 'edu-badge-done'">
              {{ row.isActive ? '在读' : '已毕' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <button class="btn-edit" :data-testid="`edu-edit-${row.id}`" @click="openEdit(row)" style="margin-right:6px;">编辑</button>
            <button class="btn-delete" :data-testid="`edu-delete-${row.id}`" @click="askDelete(row)">删除</button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页条（Element Plus Pagination） -->
    <div class="edu-list-pager">
      <el-pagination
        v-model:current-page="listPage"
        :page-size="LIST_PAGE_SIZE"
        :page-sizes="[LIST_PAGE_SIZE]"
        layout="total, prev, pager, next, jumper"
        :total="store.totalCount"
        background
        small
        prev-text="上一页"
        next-text="下一页"
      />
    </div>

    <!-- 新增/编辑弹框 -->
    <div v-if="dialogVisible" class="edu-dialog-overlay" @click.self="closeDialog">
      <div class="edu-dialog">
        <div class="edu-dialog-header">
          <span>{{ editingId ? '编辑教育经历' : '新增教育经历' }}</span>
          <button class="edu-dialog-close" @click="closeDialog">✕</button>
        </div>
        <div class="edu-dialog-body">
          <div class="edu-form-row">
            <label class="edu-label"><span class="edu-req">*</span>学校名称</label>
            <input v-model="form.schoolName" class="edu-input" placeholder="请输入学校名称" maxlength="50" />
          </div>
          <div class="edu-form-row">
            <label class="edu-label"><span class="edu-req">*</span>学段/学历</label>
            <select v-model="form.degree" class="edu-select">
              <option v-for="d in degreeOptions" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
          <div class="edu-form-row">
            <label class="edu-label">专业</label>
            <input v-model="form.major" class="edu-input" placeholder="选填" />
          </div>
          <div class="edu-form-row edu-form-row-2col">
            <div>
              <label class="edu-label"><span class="edu-req">*</span>入学日期</label>
              <input v-model="form.startDate" type="date" class="edu-input" />
            </div>
            <div>
              <label class="edu-label">毕业日期</label>
              <input v-model="form.endDate" type="date" class="edu-input" :disabled="form.isActive" />
            </div>
          </div>
          <div class="edu-form-row">
            <label class="edu-label">是否在读</label>
            <label class="edu-switch">
              <input type="checkbox" v-model="form.isActive" />
              <span class="edu-switch-slider"></span>
            </label>
          </div>
          <div class="edu-form-row edu-form-row-2col">
            <div>
              <label class="edu-label">班主任</label>
              <input v-model="form.classTeacher" class="edu-input" placeholder="选填" />
            </div>
            <div>
              <label class="edu-label">课老师</label>
              <input v-model="form.courseTeacher" class="edu-input" placeholder="选填" />
            </div>
          </div>
          <div class="edu-form-row">
            <label class="edu-label">电话号码</label>
            <input v-model="form.phone" class="edu-input" placeholder="选填" />
          </div>
          <div class="edu-form-row">
            <label class="edu-label">备注</label>
            <textarea v-model="form.note" class="edu-textarea" placeholder="选填" rows="2"></textarea>
          </div>
          <div v-if="formErrors.length > 0" class="edu-form-errors">
            <div v-for="err in formErrors" :key="err" class="edu-form-error">{{ err }}</div>
          </div>
        </div>
        <div class="edu-dialog-footer">
          <button class="edu-btn edu-btn-cancel" @click="closeDialog">取消</button>
          <button class="edu-btn edu-btn-ok" @click="submitForm">确定</button>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <div v-if="deleteConfirmVisible" class="edu-dialog-overlay" @click.self="deleteConfirmVisible = false">
      <div class="edu-dialog edu-dialog-sm">
        <div class="edu-dialog-header">
          <span>确认删除</span>
          <button class="edu-dialog-close" @click="deleteConfirmVisible = false">✕</button>
        </div>
        <div class="edu-dialog-body">
          <p class="edu-confirm-text">确定要删除这条教育经历吗？此操作不可撤销。</p>
        </div>
        <div class="edu-dialog-footer">
          <button class="edu-btn edu-btn-cancel" @click="deleteConfirmVisible = false">取消</button>
          <button class="edu-btn edu-btn-del" @click="confirmDelete">删除</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.edu-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.edu-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 8px;
  flex-shrink: 0;
}
/* ===== 新增按钮（与健康面板同款 .btn-add） ===== */
.btn-add {
  padding: 8px 16px;
  background: var(--color-primary, #10b981);
  color: #fff;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.18);
  white-space: nowrap;
}
.btn-add:hover { opacity: 0.92; transform: translateY(-1px); }

/* ===== 列表容器（学生工作台无强制一屏：直接 flex 列撑满即可） ===== */
.edu-list {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  padding: 0 16px 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.edu-list > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  --el-table-border-color: var(--color-border, #e5e7eb);
  --el-table-header-bg-color: var(--color-bg-hover, #f3f4f6);
  --el-table-tr-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(16, 185, 129, 0.06);
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.edu-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.edu-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .edu-list > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .edu-list > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .edu-list > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
/* 每个 cell 最小内容宽兜底：避免 11 列时只剩学校+操作 */
.edu-list > :global(.el-table .el-table__body-wrapper .cell),
.edu-list > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条 ===== */
.edu-list-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 16px 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .edu-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.edu-list-pager > :global(.el-pagination) {
  --el-pagination-bg-color: transparent;
}
.edu-list-pager > :global(.el-pagination button),
.edu-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.edu-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #10b981) !important;
  color: #fff !important;
  border-color: var(--color-primary, #10b981) !important;
}
:global(html.dark) .edu-list-pager > :global(.el-pagination button),
:global(html.dark) .edu-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .edu-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #10b981) !important;
  color: #fff !important;
  border-color: var(--color-primary, #10b981) !important;
}
.edu-list-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

/* ===== 按钮：编辑 / 删除（与健康面板同款 .btn-edit / .btn-delete） ===== */
.btn-edit, .btn-delete {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all var(--transition-fast, 0.15s ease);
  line-height: 1.5;
  white-space: nowrap;
}
.btn-edit {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: var(--color-link, #3b82f6);
}
.btn-edit:hover {
  background: rgba(59, 130, 246, 0.18);
  transform: translateY(-1px);
}
.btn-delete {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
.btn-delete:hover {
  background: rgba(239, 68, 68, 0.18);
  transform: translateY(-1px);
}

/* ===== 状态徽章：在读（蓝）/ 已毕（绿） ===== */
.edu-badge {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.edu-badge-active { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
.edu-badge-done   { background: rgba(16, 185, 129, 0.15); color: #10b981; }

/* ===== 毕业时间「至今」绿色文字 ===== */
.edu-enddate-today {
  color: var(--color-primary, #10b981);
  font-weight: 600;
}

/* ===== 学段彩色徽章（9 级，幼儿园→博士渐深）===== */
.edu-degree-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.6;
}
.edu-degree-kindergarten { background: #fdf2f8; color: #db2777; } /* 幼儿园 - 粉红 */
.edu-degree-primary      { background: #ecfdf5; color: #059669; } /* 小学   - 浅绿 */
.edu-degree-junior       { background: #dbeafe; color: #2563eb; } /* 初中   - 蓝 */
.edu-degree-high         { background: #ede9fe; color: #7c3aed; } /* 高中   - 紫 */
.edu-degree-vocational   { background: #ffedd5; color: #ea580c; } /* 中职   - 橙 */
.edu-degree-college      { background: #fef9c3; color: #ca8a04; } /* 专科   - 琥珀黄 */
.edu-degree-bachelor     { background: #dcfce7; color: #15803d; } /* 本科   - 深绿 */
.edu-degree-master       { background: #cffafe; color: #0891b2; } /* 硕士   - 青 */
.edu-degree-doctor       { background: #fee2e2; color: #b91c1c; } /* 博士   - 深红 */
:global(html.dark) .edu-degree-kindergarten { background: rgba(219, 39, 119, 0.22); }
:global(html.dark) .edu-degree-primary      { background: rgba(5, 150, 105, 0.2); }
:global(html.dark) .edu-degree-junior       { background: rgba(37, 99, 235, 0.22); }
:global(html.dark) .edu-degree-high         { background: rgba(124, 58, 237, 0.25); }
:global(html.dark) .edu-degree-vocational   { background: rgba(234, 88, 12, 0.2); }
:global(html.dark) .edu-degree-college      { background: rgba(202, 138, 4, 0.2); }
:global(html.dark) .edu-degree-bachelor     { background: rgba(21, 128, 61, 0.22); }
:global(html.dark) .edu-degree-master       { background: rgba(8, 145, 178, 0.22); }
:global(html.dark) .edu-degree-doctor       { background: rgba(185, 28, 28, 0.28); }

/* ===== 弹框（白色背景，与习惯打卡一致） ===== */
.edu-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.edu-dialog {
  background: var(--color-surface, #fff);
  border-radius: 8px;
  width: 480px;
  max-width: 92vw;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}
.edu-dialog-sm { width: 340px; }
.edu-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #ebeef5);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #303133);
}
.edu-dialog-close {
  background: none;
  border: none;
  color: var(--color-text-secondary, #909399);
  cursor: pointer;
  font-size: 16px;
}
.edu-dialog-close:hover { color: var(--color-text, #303133); }
.edu-dialog-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}
.edu-form-row {
  margin-bottom: 12px;
}
.edu-form-row-2col {
  display: flex;
  gap: 12px;
}
.edu-form-row-2col > div { flex: 1; }
.edu-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #606266);
}
.edu-req { color: #f56c6c; margin-right: 2px; }
.edu-input, .edu-select, .edu-textarea {
  width: 100%;
  padding: 6px 8px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #dcdfe6);
  border-radius: 4px;
  color: var(--color-text, #303133);
  font-size: 13px;
  box-sizing: border-box;
}
.edu-textarea { resize: vertical; }
.edu-input:focus, .edu-select:focus, .edu-textarea:focus {
  outline: none;
  border-color: #409eff;
}
.edu-input:disabled {
  background: #f5f7fa;
  color: #c0c4cc;
  cursor: not-allowed;
}
.edu-input::placeholder, .edu-textarea::placeholder {
  color: #c0c4cc;
}
.edu-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  cursor: pointer;
}
.edu-switch input { opacity: 0; width: 0; height: 0; }
.edu-switch-slider {
  position: absolute;
  inset: 0;
  background: #dcdfe6;
  border-radius: 11px;
  transition: 0.2s;
}
.edu-switch-slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
}
.edu-switch input:checked + .edu-switch-slider {
  background: #409eff;
}
.edu-switch input:checked + .edu-switch-slider::before {
  transform: translateX(18px);
}
.edu-form-errors {
  margin-top: 4px;
  padding: 8px;
  background: rgba(245, 108, 108, 0.1);
  border-radius: 4px;
}
.edu-form-error {
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.6;
}
.edu-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #ebeef5);
}
.edu-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.edu-btn-cancel {
  background: #fff;
  border: 1px solid #dcdfe6;
  color: #606266;
}
.edu-btn-cancel:hover { color: #409eff; border-color: #c6e2ff; background: #ecf5ff; }
.edu-btn-ok {
  background: #409eff;
  color: #fff;
}
.edu-btn-ok:hover { background: #66b1ff; }
.edu-btn-del {
  background: #f56c6c;
  color: #fff;
}
.edu-btn-del:hover { background: #f78989; }
.edu-confirm-text {
  font-size: 13px;
  color: var(--color-text, #606266);
  text-align: center;
  margin: 0;
}
</style>
