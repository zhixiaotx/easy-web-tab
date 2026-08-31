<script setup lang="ts">
// 学生工作台错题本面板（M3 批次1）
// 布局：工具条 + 学科/状态 tabs + 搜索 + 统计卡 + 错题卡片列表 + 分页 + 编辑弹框
// 数据：useStudentMistakesStore（独立 IDB store 'student_mistakes'，严格隔离成人数据）
// 行高 156px（M3 估值，待 row-heights.json 实测后校准）
// M3 决策：纯文字录入，不支持图片上传（imageIds 恒为 []）

import { computed, onMounted, ref } from 'vue'
import { useStudentMistakesStore } from '@/stores/studentMistakes'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import type { StudentMistake, StudentMistakeStatus } from '@/types'
import { usePanelPaging } from '@/composables/usePanelPaging'
import PanelPager from '@/components/workbench/PanelPager.vue'
import Icon from '@/components/Icon.vue'

const store = useStudentMistakesStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()

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

// 自适应分页（4 列卡片网格，行高 152px，参考学习计划 150 + 2）
const mainEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const paging = usePanelPaging({
  items: () => viewEntries.value,
  rowHeight: 152,
  containerRef: mainEl,
  gridRef: listEl
})
const { pageItems, currentPage, totalPages, fitsOnePage, next, prev } = paging

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
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定删除该错题？')) return
  await store.deleteMistake(id)
  toast.success('错题已删除')
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
    <div class="sm-toolbar">
      <h2 class="sm-title">错题本</h2>
      <button class="btn-primary sm-add-btn" data-testid="sm-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增错题
      </button>
    </div>

    <div class="sm-tabs">
      <button
        v-for="tab in subjectTabs"
        :key="tab.key"
        class="sm-tab"
        :class="{ active: activeSubject === tab.key }"
        :data-testid="`sm-subject-${tab.key}`"
        @click="activeSubject = tab.key"
      >{{ tab.label }}</button>
      <span class="sm-count">{{ viewEntries.length }} 条</span>
    </div>

    <div class="sm-filter-bar">
      <div class="sm-status-tabs">
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.key"
          class="sm-status-tab"
          :class="{ active: activeStatusTab === tab.key }"
          :data-testid="`sm-status-${tab.key}`"
          @click="activeStatusTab = tab.key"
        >{{ tab.label }}</button>
      </div>
      <input
        v-model="keyword"
        type="text"
        class="sm-search"
        placeholder="搜索题干/答案/解析/标签..."
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

    <div ref="mainEl" class="sm-main">
      <div v-if="viewEntries.length === 0" class="empty-state" data-testid="sm-empty">
        <p>还没有错题，点上方「新增错题」开始吧</p>
      </div>

      <div v-else ref="listEl" class="sm-list" :class="{ 'sm-list-scroll': !fitsOnePage }">
        <div
          v-for="item in pageItems"
          :key="item.id"
          class="sm-card"
          :data-testid="`sm-card-${item.id}`"
        >
          <div class="sm-card-head">
            <span class="sm-subject-badge">{{ item.subject }}</span>
            <span v-if="item.title" class="sm-card-title" :title="item.title">{{ item.title }}</span>
            <span class="sm-status-badge" :class="statusClass(item.status)">{{ store.statusText(item.status) }}</span>
            <button
              class="sm-del-btn"
              :data-testid="`sm-del-${item.id}`"
              title="删除"
              @click.stop="handleDelete(item.id)"
            >
              <Icon name="close" :size="14" />
            </button>
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
            <button
              v-if="item.status !== 'mastered'"
              class="sm-action-btn sm-advance-btn"
              :data-testid="`sm-advance-${item.id}`"
              @click="handleAdvance(item.id)"
            >{{ item.status === 'new' ? '标记复习中' : '标记已掌握' }}</button>
            <button
              v-if="item.status !== 'new'"
              class="sm-action-btn sm-reset-btn"
              :data-testid="`sm-reset-${item.id}`"
              @click="handleReset(item.id)"
            >重置未复习</button>
            <button
              class="sm-edit-btn"
              :data-testid="`sm-edit-${item.id}`"
              @click="openEditDialog(item.id)"
            >编辑</button>
          </div>
        </div>
      </div>
    </div>

    <PanelPager
      v-if="totalPages > 1"
      :page="currentPage"
      :total="totalPages"
      @prev="prev"
      @next="next"
    />

    <!-- 编辑弹框 -->
    <div v-if="showEditDialog" class="sm-dialog-overlay" @click.self="closeEditDialog">
      <div class="sm-dialog" data-testid="sm-dialog">
        <div class="sm-dialog-head">
          <h3>{{ editingId !== null ? '编辑错题' : '新增错题' }}</h3>
          <button class="sm-dialog-close" @click="closeEditDialog" title="关闭">
            <Icon name="close" :size="18" />
          </button>
        </div>
        <div class="sm-dialog-body">
          <div class="sm-form-row">
            <label class="sm-form-label">学科 <span class="sm-required">*</span></label>
            <select v-model="dialogSubject" class="sm-form-select" data-testid="sm-form-subject">
              <option v-for="s in settingsStore.subjects" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="sm-form-row">
            <label class="sm-form-label">题目标题</label>
            <input
              v-model="dialogTitle"
              type="text"
              class="sm-form-input"
              maxlength="100"
              placeholder="选填，简短描述题目标题"
              data-testid="sm-form-title"
            />
          </div>
          <div class="sm-form-row">
            <label class="sm-form-label">题干 <span class="sm-required">*</span></label>
            <textarea
              v-model="dialogQuestion"
              class="sm-form-textarea"
              rows="4"
              placeholder="题目内容（纯文字，最多 5000 字符）"
              data-testid="sm-form-question"
            ></textarea>
          </div>
          <div class="sm-form-row">
            <label class="sm-form-label">答案 <span class="sm-required">*</span></label>
            <textarea
              v-model="dialogAnswer"
              class="sm-form-textarea"
              rows="3"
              placeholder="正确答案（纯文字，最多 5000 字符）"
              data-testid="sm-form-answer"
            ></textarea>
          </div>
          <div class="sm-form-row">
            <label class="sm-form-label">解析</label>
            <textarea
              v-model="dialogAnalysis"
              class="sm-form-textarea"
              rows="3"
              placeholder="选填，解题思路/易错点（最多 5000 字符）"
              data-testid="sm-form-analysis"
            ></textarea>
          </div>
          <div class="sm-form-row">
            <label class="sm-form-label">标签</label>
            <input
              v-model="dialogTagsInput"
              type="text"
              class="sm-form-input"
              placeholder="逗号分隔，最多 10 个，每个 1-20 字符"
              data-testid="sm-form-tags"
            />
          </div>
        </div>
        <div class="sm-dialog-foot">
          <button class="sm-btn-cancel" @click="closeEditDialog">取消</button>
          <button class="btn-primary" data-testid="sm-form-save" @click="saveEditDialog">保存</button>
        </div>
      </div>
    </div>
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

.sm-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.sm-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.sm-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
}

.sm-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.sm-tab {
  padding: 4px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}
.sm-tab.active {
  background: var(--color-primary, #3b82f6);
  color: #fff;
  border-color: var(--color-primary, #3b82f6);
}
.sm-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
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
.sm-status-tab {
  padding: 3px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.sm-status-tab.active {
  background: var(--color-primary-soft, rgba(59, 130, 246, 0.12));
  border-color: var(--color-primary, #3b82f6);
}
.sm-search {
  flex: 1;
  min-width: 120px;
  padding: 5px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 13px;
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
.sm-list-scroll {
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--color-text-soft, #6b7280);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
}
.sm-del-btn:hover {
  background: rgba(239, 68, 68, 0.12);
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
.sm-action-btn, .sm-edit-btn {
  padding: 3px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}
.sm-action-btn:hover, .sm-edit-btn:hover {
  background: var(--color-hover, #f3f4f6);
}
.sm-advance-btn {
  border-color: #10b981;
  color: #10b981;
}
.sm-advance-btn:hover {
  background: rgba(16, 185, 129, 0.12);
}
.sm-reset-btn {
  border-color: #f59e0b;
  color: #f59e0b;
}
.sm-reset-btn:hover {
  background: rgba(245, 158, 11, 0.12);
}

.sm-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.sm-dialog {
  background: var(--color-surface, #fff);
  border-radius: 8px;
  width: 90%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.sm-dialog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.sm-dialog-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.sm-dialog-close {
  border: none;
  background: transparent;
  color: var(--color-text-soft, #6b7280);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.sm-dialog-close:hover {
  background: var(--color-hover, #f3f4f6);
}
.sm-dialog-body {
  padding: 16px;
  overflow-y: auto;
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
.sm-form-select, .sm-form-input {
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 13px;
}
.sm-form-textarea {
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 4px;
  background: var(--color-surface, #fff);
  color: inherit;
  font-size: 13px;
  resize: vertical;
  font-family: inherit;
}
.sm-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
.sm-btn-cancel {
  padding: 6px 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}
.sm-btn-cancel:hover {
  background: var(--color-hover, #f3f4f6);
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
}
</style>
