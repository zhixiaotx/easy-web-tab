<script setup lang="ts">
// 学生工作台教育经历面板
// 布局：顶部工具条（+ 新增）+ 表格列表 + 分页
// 数据：useStudentEducationStore（IDB store 'student_education'）

import { computed, onMounted, ref, watch } from 'vue'
import { useStudentEducationStore } from '@/stores/studentEducation'
import { useToast } from '@/composables/useToast'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import { DEGREE_OPTIONS } from '@/types'
import type { EducationEntry } from '@/types'
import { validateEducationEntry } from '@/composables/studentEducationCore'
import type { NewEducationInput } from '@/stores/studentEducation'

const store = useStudentEducationStore()
const toast = useToast()

const mainEl = ref<HTMLElement | null>(null)

const paging = usePanelPaging({
  items: () => store.sortedEntries,
  rowHeight: 52,
  containerRef: mainEl
})
const { currentPage, totalPages, fitsOnePage, next, prev, goto } = paging
const pageEntries = computed<EducationEntry[]>(() => paging.pageItems.value as EducationEntry[])

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
  goto(1)
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
  goto(1)
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
  <section class="edu-panel" ref="mainEl">
    <!-- 顶部工具条 -->
    <div class="edu-toolbar">
      <button class="edu-add-btn" @click="openAdd">
        <span>+ 新增</span>
      </button>
      <div class="edu-count">共 {{ store.totalCount }} 条记录</div>
    </div>

    <!-- 表格区 -->
    <div class="edu-table-wrap" :class="{ 'edu-scroll': !fitsOnePage }">
      <div class="edu-table">
        <!-- 表头 -->
        <div class="edu-row edu-row-header">
          <span class="edu-col edu-col-school">学校名称</span>
          <span class="edu-col edu-col-degree">学段</span>
          <span class="edu-col edu-col-major">专业</span>
          <span class="edu-col edu-col-start">入学时间</span>
          <span class="edu-col edu-col-end">毕业时间</span>
          <span class="edu-col edu-col-teacher">班主任</span>
          <span class="edu-col edu-col-teacher">课老师</span>
          <span class="edu-col edu-col-phone">电话号码</span>
          <span class="edu-col edu-col-note">备注</span>
          <span class="edu-col edu-col-status">状态</span>
          <span class="edu-col edu-col-ops">操作</span>
        </div>
        <!-- 数据行 -->
        <div
          v-for="entry in pageEntries"
          :key="entry.id"
          class="edu-row edu-row-data"
        >
          <span class="edu-col edu-col-school" :title="entry.schoolName">{{ entry.schoolName }}</span>
          <span class="edu-col edu-col-degree">{{ entry.degree }}</span>
          <span class="edu-col edu-col-major" :title="entry.major || ''">{{ entry.major || '—' }}</span>
          <span class="edu-col edu-col-start">{{ entry.startDate }}</span>
          <span class="edu-col edu-col-end">{{ entry.endDate || '至今' }}</span>
          <span class="edu-col edu-col-teacher" :title="entry.classTeacher || ''">{{ entry.classTeacher || '—' }}</span>
          <span class="edu-col edu-col-teacher" :title="entry.courseTeacher || ''">{{ entry.courseTeacher || '—' }}</span>
          <span class="edu-col edu-col-phone" :title="entry.phone || ''">{{ entry.phone || '—' }}</span>
          <span class="edu-col edu-col-note" :title="entry.note || ''">{{ entry.note || '—' }}</span>
          <span class="edu-col edu-col-status">
            <span class="edu-badge" :class="entry.isActive ? 'edu-badge-active' : 'edu-badge-done'">
              {{ entry.isActive ? '在读' : '已毕' }}
            </span>
          </span>
          <span class="edu-col edu-col-ops">
            <button class="edu-text-btn edu-text-edit" @click="openEdit(entry)">编辑</button>
            <button class="edu-text-btn edu-text-del" @click="askDelete(entry)">删除</button>
          </span>
        </div>
        <!-- 空状态 -->
        <div v-if="pageEntries.length === 0" class="edu-empty">
          暂无教育经历记录，点击「新增」添加
        </div>
      </div>
    </div>

    <!-- 分页条 -->
    <PanelPager
      :page="currentPage"
      :total="totalPages"
      @prev="prev"
      @next="next"
    />

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
.edu-add-btn {
  padding: 6px 14px;
  background: var(--color-primary, #3b82f6);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}
.edu-add-btn:hover { opacity: 0.88; }
.edu-count {
  font-size: 12px;
  color: var(--color-text-secondary, #909399);
}
.edu-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.edu-table-wrap.edu-scroll { overflow-y: auto; }
.edu-table {
  display: flex;
  flex-direction: column;
  min-width: 900px;
}
.edu-row {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--color-border, #ebeef5);
}
.edu-row-header {
  background: var(--color-bg-secondary, #f5f7fa);
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-secondary, #909399);
}
.edu-row-data {
  font-size: 13px;
  min-height: 52px;
  color: var(--color-text, #303133);
}
.edu-row-data:hover { background: var(--color-hover, #f5f7fa); }
.edu-col {
  padding: 6px 8px;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.edu-col-school { flex: 1.5 1 0; min-width: 0; }
.edu-col-degree { width: 56px; flex-shrink: 0; justify-content: center; }
.edu-col-major { flex: 1 1 0; min-width: 0; }
.edu-col-start { width: 88px; flex-shrink: 0; justify-content: center; font-size: 12px; }
.edu-col-end { width: 88px; flex-shrink: 0; justify-content: center; font-size: 12px; }
.edu-col-teacher { width: 72px; flex-shrink: 0; min-width: 0; }
.edu-col-phone { width: 100px; flex-shrink: 0; min-width: 0; font-size: 12px; }
.edu-col-note { flex: 1.5 1 0; min-width: 0; }
.edu-col-status { width: 50px; flex-shrink: 0; justify-content: center; }
.edu-col-ops { width: 80px; flex-shrink: 0; gap: 8px; justify-content: center; }
.edu-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}
.edu-badge-active {
  background: rgba(64, 158, 255, 0.15);
  color: #409eff;
}
.edu-badge-done {
  background: rgba(103, 194, 58, 0.15);
  color: #67c23a;
}

/* Element-UI 风格文字按钮 */
.edu-text-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  cursor: pointer;
}
.edu-text-edit {
  color: #409eff;
}
.edu-text-edit:hover { color: #66b1ff; }
.edu-text-del {
  color: #f56c6c;
}
.edu-text-del:hover { color: #f78989; }

.edu-empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--color-text-secondary, #909399);
  font-size: 13px;
}

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
