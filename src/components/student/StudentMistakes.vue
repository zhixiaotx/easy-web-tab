<script setup lang="ts">
// 学生工作台错题本面板（M3 批次1）
// 布局：工具条 + 学科/状态 tabs + 搜索 + 统计卡 + 表格/卡片双视图（与学习计划一致）+ el-pagination + 编辑弹框
// 数据：useStudentMistakesStore（独立 IDB store 'student_mistakes'，严格隔离成人数据）
// M3 决策：纯文字录入，不支持图片上传（imageIds 恒为 []）

import { computed, onMounted, ref, watch } from 'vue'
import { useStudentMistakesStore } from '@/stores/studentMistakes'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import type { StudentMistake, StudentMistakeStatus } from '@/types'
import { useViewMode } from '@/composables/useViewMode'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'
import Icon from '@/components/Icon.vue'

const store = useStudentMistakesStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()
const vm = useViewMode()

// 状态 tabs
const STATUS_TABS: { key: 'all' | StudentMistakeStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '未复习' },
  { key: 'reviewing', label: '复习中' },
  { key: 'mastered', label: '已掌握' }
]
const activeStatusTab = ref<'all' | StudentMistakeStatus>('all')
const activeSubject = ref<'all' | string>('all')
const keyword = ref('')

// 学科 tabs（从设置 store 获取）
const subjectTabs = computed(() => {
  const subs = settingsStore.subjects ?? []
  return [{ key: 'all', label: '全部' }, ...subs.map(s => ({ key: s, label: s }))]
})

// 视图数据：先学科 → 状态 → 关键词（store 已排序）
const viewEntries = computed<StudentMistake[]>(() => {
  let list = store.filterBySubject(activeSubject.value)
  if (activeStatusTab.value !== 'all') {
    list = list.filter(e => e.status === activeStatusTab.value)
  }
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(e => {
      const hay = [e.subject, e.title ?? '', e.question, e.answer, e.analysis ?? '', e.tags.join(' ')].join('\n').toLowerCase()
      return hay.includes(kw)
    })
  }
  return list
})

// 固定每页分页（与学习计划一致：el-pagination）
const LIST_PAGE_SIZE = 10
const currentPage = ref(1)
const pageItems = computed<StudentMistake[]>(() => {
  const start = (currentPage.value - 1) * LIST_PAGE_SIZE
  return viewEntries.value.slice(start, start + LIST_PAGE_SIZE)
})
watch(
  () => [activeStatusTab.value, activeSubject.value, keyword.value],
  () => { currentPage.value = 1 }
)

// 统计卡数据（薄委托 core）
const stats = computed(() => store.stats())

// 错误 toast
const MISTAKE_ERROR_MESSAGES: Record<string, string> = {
  empty: '学科、题干、答案均不能为空',
  'not-found': '错题不存在'
}
function mistakeErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(MISTAKE_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

// 新增/编辑弹框
const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogSubject = ref('')
const dialogTitle = ref('')
const dialogQuestion = ref('')
const dialogAnswer = ref('')
const dialogAnalysis = ref('')
const dialogTagsInput = ref('') // 逗号分隔

function openAddDialog(): void {
  editingId.value = null
  dialogSubject.value = settingsStore.subjects[0] ?? ''
  dialogTitle.value = ''
  dialogQuestion.value = ''
  dialogAnswer.value = ''
  dialogAnalysis.value = ''
  dialogTagsInput.value = ''
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const m = store.entries.find(x => x.id === id)
  if (!m) return
  editingId.value = m.id
  dialogSubject.value = m.subject
  dialogTitle.value = m.title ?? ''
  dialogQuestion.value = m.question
  dialogAnswer.value = m.answer
  dialogAnalysis.value = m.analysis ?? ''
  dialogTagsInput.value = m.tags.join(', ')
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

function parseTagsInput(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map(t => t.trim())
    .filter(t => t)
    .slice(0, 10)
}

async function saveEditDialog(): Promise<void> {
  const subject = dialogSubject.value.trim()
  const question = dialogQuestion.value.trim()
  const answer = dialogAnswer.value.trim()
  if (!subject || !question || !answer) {
    toast.error('学科、题干、答案均不能为空')
    return
  }
  const tags = parseTagsInput(dialogTagsInput.value)
  if (editingId.value !== null) {
    const result = await store.updateMistake(editingId.value, {
      subject,
      title: dialogTitle.value,
      question,
      answer,
      analysis: dialogAnalysis.value,
      tags
    })
    mistakeErrorToast(result)
    if (!result.ok) return
  } else {
    const result = await store.addMistake({
      subject,
      title: dialogTitle.value,
      question,
      answer,
      analysis: dialogAnalysis.value,
      tags
    })
    mistakeErrorToast(result)
    if (!result.ok) return
  }
  toast.success(editingId.value !== null ? '错题已更新' : '错题已新增')
  closeEditDialog()
  currentPage.value = 1
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定删除该错题？')) return
  await store.deleteMistake(id)
  toast.success('错题已删除')
  currentPage.value = 1
}

async function handleAdvance(id: string): Promise<void> {
  const result = await store.advance(id)
  mistakeErrorToast(result)
  if (result.ok) toast.success('已推进到下一状态')
}

async function handleReset(id: string): Promise<void> {
  const result = await store.reset(id)
  mistakeErrorToast(result)
  if (result.ok) toast.success('已重置为未复习')
}

// 状态徽标 class
function statusClass(status: StudentMistakeStatus): string {
  return `sm-status-${status}`
}

onMounted(() => {
  store.loadMistakes()
})
</script>

<template>
  <div class="sm-shell">
    <StudentToolbar title="错题本">
      <el-button type="primary" size="small" class="sm-add-btn" data-testid="sm-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增错题
      </el-button>
    </StudentToolbar>

    <div class="sm-tabs">
      <el-radio-group v-model="activeSubject" size="small">
        <el-radio-button
          v-for="tab in subjectTabs"
          :key="tab.key"
          :value="tab.key"
          :data-testid="`sm-subject-${tab.key}`"
        >{{ tab.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="sm-filter-bar">
      <div class="sm-status-tabs">
        <el-radio-group v-model="activeStatusTab" size="small">
          <el-radio-button
            v-for="tab in STATUS_TABS"
            :key="tab.key"
            :value="tab.key"
            :data-testid="`sm-status-${tab.key}`"
          >{{ tab.label }}</el-radio-button>
        </el-radio-group>
      </div>
      <el-input
        v-model="keyword"
        class="sm-search"
        placeholder="搜索题干/答案/解析/标签..."
        clearable
        data-testid="sm-search"
      />
    </div>

    <div class="sm-stats">
      <div class="sm-stat-card">
        <div class="sm-stat-label">总条目</div>
        <div class="sm-stat-value">{{ stats.total }}</div>
      </div>
      <div class="sm-stat-card">
        <div class="sm-stat-label">未复习</div>
        <div class="sm-stat-value fresh">{{ stats.fresh }}</div>
      </div>
      <div class="sm-stat-card">
        <div class="sm-stat-label">复习中</div>
        <div class="sm-stat-value reviewing">{{ stats.reviewing }}</div>
      </div>
      <div class="sm-stat-card">
        <div class="sm-stat-label">已掌握</div>
        <div class="sm-stat-value mastered">{{ stats.mastered }}</div>
      </div>
      <div class="sm-stat-card">
        <div class="sm-stat-label">掌握率</div>
        <div class="sm-stat-value">{{ stats.masteryRate }}%</div>
      </div>
      <div class="sm-stat-card">
        <div class="sm-stat-label">本周新增</div>
        <div class="sm-stat-value">{{ stats.thisWeekCreated }}</div>
      </div>
      <div class="sm-stat-card">
        <div class="sm-stat-label">学科数</div>
        <div class="sm-stat-value">{{ stats.distinctSubjects }}</div>
      </div>
    </div>

    <div class="sm-main">
      <div v-if="viewEntries.length === 0" class="empty-state" data-testid="sm-empty">
        <p>还没有错题，点上方「新增错题」开始吧</p>
      </div>

      <template v-else>
        <div class="ewt-table-toolbar">
          <ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" />
        </div>

        <div class="sm-list-area">
          <el-table v-if="vm.mode === 'list'" class="ewt-table"
            :data="pageItems"
            stripe
            border
            size="default"
            style="width: 100%"
            height="100%"
            empty-text="还没有错题，点上方「新增错题」开始吧"
          >
            <el-table-column label="学科" width="90" align="center">
              <template #default="{ row }">
                <span class="sm-subject-badge">{{ row.subject }}</span>
              </template>
            </el-table-column>
            <el-table-column label="标题" min-width="160" align="left" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.title" style="font-weight: 600;">{{ row.title }}</span>
                <span v-else style="color: var(--color-text-soft, #9ca3af);">—</span>
              </template>
            </el-table-column>
            <el-table-column label="题干" min-width="200" align="left" show-overflow-tooltip>
              <template #default="{ row }">{{ row.question }}</template>
            </el-table-column>
            <el-table-column label="答案" min-width="160" align="left" show-overflow-tooltip>
              <template #default="{ row }">{{ row.answer }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <span class="sm-status-badge" :class="statusClass(row.status)">{{ store.statusText(row.status) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="标签" min-width="120" align="left" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.tags.length">{{ row.tags.join('、') }}</span>
                <span v-else style="color: var(--color-text-soft, #9ca3af);">—</span>
              </template>
            </el-table-column>
            <el-table-column label="状态操作" width="170" align="center">
              <template #default="{ row }">
                <el-button v-if="row.status !== 'mastered'" size="small" class="sm-advance-btn" :data-testid="`sm-advance-${row.id}`" @click="handleAdvance(row.id)">{{ row.status === 'new' ? '标记复习中' : '标记已掌握' }}</el-button>
                <el-button v-if="row.status !== 'new'" size="small" class="sm-reset-btn" :data-testid="`sm-reset-${row.id}`" @click="handleReset(row.id)">重置未复习</el-button>
              </template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="150" align="center" fixed="right">
              <template #default="{ row }">
                <button class="btn-edit" :data-testid="`sm-edit-${row.id}`" @click="openEditDialog(row.id)">编辑</button>
                <button class="btn-delete" :data-testid="`sm-del-${row.id}`" @click="handleDelete(row.id)">删除</button>
              </template>
            </el-table-column>
          </el-table>

          <div v-else class="sm-list">
            <div
              v-for="item in pageItems"
              :key="item.id"
              class="sm-card"
              :data-testid="`sm-card-${item.id}`"
              @click="openEditDialog(item.id)"
            >
              <div class="sm-card-head">
                <span class="sm-subject-badge">{{ item.subject }}</span>
                <span v-if="item.title" class="sm-card-title" :title="item.title">{{ item.title }}</span>
                <span class="sm-status-badge" :class="statusClass(item.status)">{{ store.statusText(item.status) }}</span>
                <el-button
                  class="sm-del-btn"
                  :data-testid="`sm-del-${item.id}`"
                  title="删除"
                  text
                  size="small"
                  @click.stop="handleDelete(item.id)"
                >
                  <Icon name="close" :size="14" />
                </el-button>
              </div>
              <div class="sm-card-body">
                <div class="sm-q-block">
                  <div class="sm-q-label">题干</div>
                  <div class="sm-q-content">{{ item.question }}</div>
                </div>
                <div class="sm-a-block">
                  <div class="sm-a-label">答案</div>
                  <div class="sm-a-content">{{ item.answer }}</div>
                </div>
                <div v-if="item.analysis" class="sm-an-block">
                  <div class="sm-an-label">解析</div>
                  <div class="sm-an-content">{{ item.analysis }}</div>
                </div>
              </div>
              <div v-if="item.tags.length > 0" class="sm-card-tags">
                <span v-for="t in item.tags" :key="t" class="sm-tag">{{ t }}</span>
              </div>
              <div class="sm-card-foot">
                <el-button
                  v-if="item.status !== 'mastered'"
                  size="small"
                  class="sm-advance-btn"
                  :data-testid="`sm-advance-${item.id}`"
                  @click.stop="handleAdvance(item.id)"
                >{{ item.status === 'new' ? '标记复习中' : '标记已掌握' }}</el-button>
                <el-button
                  v-if="item.status !== 'new'"
                  size="small"
                  class="sm-reset-btn"
                  :data-testid="`sm-reset-${item.id}`"
                  @click.stop="handleReset(item.id)"
                >重置未复习</el-button>
                <el-button
                  size="small"
                  class="sm-edit-btn"
                  :data-testid="`sm-edit-${item.id}`"
                  @click.stop="openEditDialog(item.id)"
                >编辑</el-button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="viewEntries.length > 0" class="sm-list-pager">
          <el-pagination
            v-model:current-page="currentPage"
            :page-size="LIST_PAGE_SIZE"
            :page-sizes="[LIST_PAGE_SIZE]"
            layout="total, prev, pager, next, jumper"
            :total="viewEntries.length"
            background
            small
            prev-text="上一页"
            next-text="下一页"
          />
        </div>
      </template>
    </div>

    <!-- 编辑弹框 -->
    <el-dialog
      v-model="showEditDialog"
      :title="editingId !== null ? '编辑错题' : '新增错题'"
      width="560px"
      data-testid="sm-dialog"
      @close="closeEditDialog"
    >
      <div class="sm-dialog-body">
        <div class="sm-form-row">
          <label class="sm-form-label">学科 <span class="sm-required">*</span></label>
          <el-select v-model="dialogSubject" data-testid="sm-form-subject">
            <el-option v-for="s in settingsStore.subjects" :key="s" :value="s" :label="s" />
          </el-select>
        </div>
        <div class="sm-form-row">
          <label class="sm-form-label">题目标题</label>
          <el-input
            v-model="dialogTitle"
            :maxlength="100"
            placeholder="选填，简短描述题目标题"
            data-testid="sm-form-title"
          />
        </div>
        <div class="sm-form-row">
          <label class="sm-form-label">题干 <span class="sm-required">*</span></label>
          <el-input
            v-model="dialogQuestion"
            type="textarea"
            :rows="4"
            placeholder="题目内容（纯文字，最多 5000 字符）"
            data-testid="sm-form-question"
          />
        </div>
        <div class="sm-form-row">
          <label class="sm-form-label">答案 <span class="sm-required">*</span></label>
          <el-input
            v-model="dialogAnswer"
            type="textarea"
            :rows="3"
            placeholder="正确答案（纯文字，最多 5000 字符）"
            data-testid="sm-form-answer"
          />
        </div>
        <div class="sm-form-row">
          <label class="sm-form-label">解析</label>
          <el-input
            v-model="dialogAnalysis"
            type="textarea"
            :rows="3"
            placeholder="选填，解题思路/易错点（最多 5000 字符）"
            data-testid="sm-form-analysis"
          />
        </div>
        <div class="sm-form-row">
          <label class="sm-form-label">标签</label>
          <el-input
            v-model="dialogTagsInput"
            placeholder="逗号分隔，最多 10 个，每个 1-20 字符"
            data-testid="sm-form-tags"
          />
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeEditDialog">取消</el-button>
          <el-button type="primary" data-testid="sm-form-save" @click="saveEditDialog">保存</el-button>
          <el-button v-if="editingId" type="danger" data-testid="sm-form-delete" @click="handleDelete(editingId)">删除</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sm-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 10px;
}

.sm-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.sm-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.sm-status-tabs {
  display: flex;
  gap: 4px;
}
.sm-search {
  flex: 1;
  min-width: 120px;
}

.sm-stats {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  flex-shrink: 0;
}
.sm-stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  padding: 8px 6px;
  text-align: center;
}
.sm-stat-label {
  font-size: 11px;
  color: var(--color-text-soft, #6b7280);
  margin-bottom: 2px;
}
.sm-stat-value {
  font-size: 18px;
  font-weight: 600;
}
.sm-stat-value.fresh { color: #ef4444; }
.sm-stat-value.reviewing { color: #f59e0b; }
.sm-stat-value.mastered { color: #10b981; }

.sm-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 双视图容器 ===== */
.sm-list-area {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.sm-list-area > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  --el-table-border-color: var(--color-border, #e5e7eb);
  --el-table-header-bg-color: var(--color-bg-hover, #f3f4f6);
  --el-table-tr-bg-color: transparent;
  --el-table-row-hover-bg-color: rgba(59, 130, 246, 0.06);
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.sm-list-area > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-soft, #6b7280);
  font-weight: 600;
  user-select: none;
}
.sm-list-area > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .sm-list-area > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .sm-list-area > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-soft, #d1d5db);
}
:global(html.dark) .sm-list-area > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.sm-list-area > :global(.el-table .el-table__body-wrapper .cell),
.sm-list-area > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条 ===== */
.sm-list-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 0 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .sm-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.sm-list-pager > :global(.el-pagination) {
  --el-pagination-bg-color: transparent;
}
.sm-list-pager > :global(.el-pagination button),
.sm-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-soft, #6b7280) !important;
}
.sm-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
:global(html.dark) .sm-list-pager > :global(.el-pagination button),
:global(html.dark) .sm-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-soft, #d1d5db) !important;
}
:global(html.dark) .sm-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
.sm-list-pager > :global(.el-pagination__total) {
  color: var(--color-text-soft, #6b7280);
  font-size: 13px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-soft, #6b7280);
  font-size: 14px;
}

.sm-list {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
}

.sm-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 150px;
  min-height: 150px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
}
.sm-card:hover {
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.12);
  transform: translateY(-2px);
  border-color: rgba(59, 130, 246, 0.35);
}
.sm-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sm-subject-badge {
  padding: 2px 8px;
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  color: var(--color-primary, #3b82f6);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.sm-card-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.sm-status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.sm-status-new {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}
.sm-status-reviewing {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.sm-status-mastered {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.sm-del-btn {
  flex-shrink: 0;
  color: var(--color-text-soft, #6b7280);
}
.sm-del-btn:hover {
  color: #ef4444;
}

.sm-card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sm-q-block, .sm-a-block, .sm-an-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sm-q-label, .sm-a-label, .sm-an-label {
  font-size: 11px;
  color: var(--color-text-soft, #6b7280);
  font-weight: 600;
}
.sm-q-content, .sm-a-content, .sm-an-content {
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.sm-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sm-tag {
  padding: 1px 6px;
  background: var(--color-hover, #f3f4f6);
  border-radius: 3px;
  font-size: 11px;
  color: var(--color-text-soft, #6b7280);
}

.sm-card-foot {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 2px;
}
.sm-advance-btn {
  color: #10b981;
  border-color: #10b981;
}
.sm-advance-btn:hover {
  background: rgba(16, 185, 129, 0.12);
}
.sm-reset-btn {
  color: #f59e0b;
  border-color: #f59e0b;
}
.sm-reset-btn:hover {
  background: rgba(245, 158, 11, 0.12);
}
.sm-edit-btn {
  color: var(--color-text-soft, #6b7280);
}

/* ===== 表格内编辑/删除按钮（与学习计划一致） ===== */
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
}
.btn-delete {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
.btn-delete:hover {
  background: rgba(239, 68, 68, 0.18);
}

.sm-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sm-form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sm-form-label {
  font-size: 13px;
  font-weight: 600;
}
.sm-required {
  color: #ef4444;
}

@media (max-width: 768px) {
  .sm-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .sm-filter-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .sm-status-tabs {
    justify-content: center;
  }
  /* 错题卡改为单列，避免 4 列在小屏挤压 */
  .sm-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .sm-dialog :deep(.el-dialog) {
    width: 92vw !important;
    max-width: 92vw;
  }
}
</style>
