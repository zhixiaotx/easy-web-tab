<script setup lang="ts">
// 学生工作台复习计划面板（艾宾浩斯间隔复习，M3 批次1）
// 布局：工具条 + 学科 tabs + 统计卡 + 表格/卡片双视图（与学习计划一致）+ el-pagination + 编辑弹框
// 数据：useStudentReviewStore（独立 IDB store 'student_review'）
// 间隔序列：1/2/4/7/15/30 天，6 阶段，末阶段自动标记掌握

import { computed, onMounted, ref, watch } from 'vue'
import { useStudentReviewStore } from '@/stores/studentReview'
import { useStudentSettingsStore } from '@/stores/studentSettings'
import { useToast } from '@/composables/useToast'
import { localToday } from '@/composables/todoCore'
import type { StudentReviewItem } from '@/types'
import { useViewMode } from '@/composables/useViewMode'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import StudentToolbar from '@/components/student/StudentToolbar.vue'
import Icon from '@/components/Icon.vue'

const store = useStudentReviewStore()
const settingsStore = useStudentSettingsStore()
const toast = useToast()
const vm = useViewMode()

const today = localToday()

// 学科 tabs（来自 student_settings.subjects；K 段为空数组 → 仅显示「全部」）
const subjectTabs = computed<{ key: 'all' | string; label: string }[]>(() => [
  { key: 'all', label: '全部' },
  ...settingsStore.subjects.map(s => ({ key: s, label: s }))
])
const activeSubject = ref<'all' | string>('all')

// 视图数据（按学科筛选后由 store 排序保证）
const viewEntries = computed<StudentReviewItem[]>(() => store.filterBySubject(activeSubject.value))

// 固定每页分页（与学习计划一致：el-pagination）
const LIST_PAGE_SIZE = 10
const currentPage = ref(1)
const pageItems = computed<StudentReviewItem[]>(() => {
  const start = (currentPage.value - 1) * LIST_PAGE_SIZE
  return viewEntries.value.slice(start, start + LIST_PAGE_SIZE)
})
watch(activeSubject, () => { currentPage.value = 1 })

// 统计卡数据（薄委托 core）
const stats = computed(() => store.stats())

// 错误 toast
const REVIEW_ERROR_MESSAGES: Record<string, string> = {
  empty: '学科、知识点、初学日期均不能为空',
  'not-found': '复习条目不存在'
}
function reviewErrorToast(result: { ok: boolean; reason?: string }): void {
  if (result.ok) return
  toast.error(REVIEW_ERROR_MESSAGES[result.reason ?? ''] ?? '操作失败')
}

// 新增/编辑弹框
const showEditDialog = ref(false)
const editingId = ref<string | null>(null)
const dialogSubject = ref('')
const dialogKnowledge = ref('')
const dialogSource = ref('')
const dialogLearnDate = ref(today)

function openAddDialog(): void {
  editingId.value = null
  dialogSubject.value = settingsStore.subjects[0] ?? ''
  dialogKnowledge.value = ''
  dialogSource.value = ''
  dialogLearnDate.value = today
  showEditDialog.value = true
}

function openEditDialog(id: string): void {
  const r = store.entries.find(x => x.id === id)
  if (!r) return
  editingId.value = r.id
  dialogSubject.value = r.subject
  dialogKnowledge.value = r.knowledge
  dialogSource.value = r.source ?? ''
  dialogLearnDate.value = r.learnDate
  showEditDialog.value = true
}

function closeEditDialog(): void {
  showEditDialog.value = false
  editingId.value = null
}

async function saveEditDialog(): Promise<void> {
  const subject = dialogSubject.value.trim()
  const knowledge = dialogKnowledge.value.trim()
  if (!subject || !knowledge || !dialogLearnDate.value) {
    toast.error('学科、知识点、初学日期均不能为空')
    return
  }
  if (editingId.value !== null) {
    const result = await store.updateReview(editingId.value, {
      subject,
      knowledge,
      source: dialogSource.value,
      learnDate: dialogLearnDate.value
    })
    reviewErrorToast(result)
    if (!result.ok) return
  } else {
    const result = await store.addReview({
      subject,
      knowledge,
      source: dialogSource.value,
      learnDate: dialogLearnDate.value
    })
    reviewErrorToast(result)
    if (!result.ok) return
  }
  toast.success(editingId.value !== null ? '复习条目已更新' : '复习条目已新增')
  closeEditDialog()
  currentPage.value = 1
}

async function handleDelete(id: string): Promise<void> {
  if (!confirm('确定删除该复习条目？')) return
  await store.deleteReview(id)
  toast.success('已删除')
  currentPage.value = 1
}

async function handleAdvance(id: string): Promise<void> {
  const result = await store.advance(id)
  reviewErrorToast(result)
  if (result.ok) toast.success('已掌握，进入下一阶段')
}

async function handleReset(id: string): Promise<void> {
  if (!confirm('确定重置到阶段 1？该条目的复习进度将回退。')) return
  const result = await store.reset(id)
  reviewErrorToast(result)
  if (result.ok) toast.success('已重置到阶段 1')
}

onMounted(() => {
  store.loadReview()
})

// 剩余天数显示（负数=逾期，0=今日到期，正数=未来）
function daysLabel(days: number): string {
  if (days < 0) return `逾期 ${Math.abs(days)} 天`
  if (days === 0) return '今日到期'
  return `${days} 天后`
}

function daysClass(days: number): string {
  if (days < 0) return 'overdue'
  if (days === 0) return 'due-today'
  return 'upcoming'
}
</script>

<template>
  <div class="sr-shell">
    <StudentToolbar title="复习计划">
      <el-button type="primary" size="small" class="sr-add-btn" data-testid="sr-add-btn" @click="openAddDialog">
        <Icon name="plus" :size="16" /> 新增复习
      </el-button>
    </StudentToolbar>

    <div class="sr-tabs">
      <el-radio-group v-model="activeSubject" size="small">
        <el-radio-button
          v-for="tab in subjectTabs"
          :key="tab.key"
          :value="tab.key"
          :data-testid="`sr-tab-${tab.key}`"
        >{{ tab.label }}</el-radio-button>
      </el-radio-group>
    </div>

    <div class="sr-stats">
      <div class="sr-stat-card">
        <div class="sr-stat-label">总条目</div>
        <div class="sr-stat-value">{{ stats.total }}</div>
      </div>
      <div class="sr-stat-card">
        <div class="sr-stat-label">今日到期</div>
        <div class="sr-stat-value due">{{ stats.dueToday }}</div>
      </div>
      <div class="sr-stat-card">
        <div class="sr-stat-label">逾期</div>
        <div class="sr-stat-value overdue">{{ stats.overdue }}</div>
      </div>
      <div class="sr-stat-card">
        <div class="sr-stat-label">已掌握</div>
        <div class="sr-stat-value mastered">{{ stats.mastered }}</div>
      </div>
      <div class="sr-stat-card">
        <div class="sr-stat-label">掌握率</div>
        <div class="sr-stat-value">{{ stats.masteryRate }}%</div>
      </div>
      <div class="sr-stat-card">
        <div class="sr-stat-label">本周新增</div>
        <div class="sr-stat-value">{{ stats.thisWeekCreated }}</div>
      </div>
    </div>

    <div class="sr-main">
      <div v-if="viewEntries.length === 0" class="empty-state" data-testid="sr-empty">
        <p>还没有复习条目，点上方「新增复习」开始吧</p>
      </div>

      <template v-else>
        <div class="ewt-table-toolbar">
          <ViewModeToggle :mode="vm.mode" @toggle="vm.toggle" />
        </div>

        <div class="sr-list-area">
          <el-table v-if="vm.mode === 'list'" class="ewt-table"
            :data="pageItems"
            stripe
            border
            size="default"
            style="width: 100%"
            height="100%"
            empty-text="还没有复习条目，点上方「新增复习」开始吧"
          >
            <el-table-column label="学科" width="90" align="center">
              <template #default="{ row }">
                <span class="sr-subject-badge">{{ row.subject }}</span>
              </template>
            </el-table-column>
            <el-table-column label="知识点" min-width="200" align="left" show-overflow-tooltip>
              <template #default="{ row }">
                <span style="font-weight: 600;">{{ row.knowledge }}</span>
              </template>
            </el-table-column>
            <el-table-column label="来源" min-width="120" align="left" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.source">{{ row.source }}</span>
                <span v-else style="color: var(--color-text-secondary, #9ca3af);">—</span>
              </template>
            </el-table-column>
            <el-table-column label="阶段" width="110" align="center">
              <template #default="{ row }">{{ store.stageText(row.stage) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="120" align="center">
              <template #default="{ row }">
                <span v-if="row.mastered" class="sr-mastered-tag">已掌握</span>
                <span
                  v-else
                  class="sr-next-date"
                  :class="daysClass(store.daysToReview(row.nextReviewDate))"
                >{{ daysLabel(store.daysToReview(row.nextReviewDate)) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="初学日期" width="120" align="center">
              <template #default="{ row }">{{ row.learnDate }}</template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="240" align="center" fixed="right">
              <template #default="{ row }">
                <button class="btn-edit" :data-testid="`sr-edit-${row.id}`" @click="openEditDialog(row.id)" style="margin-right:4px;">编辑</button>
                <button class="btn-delete" :data-testid="`sr-del-${row.id}`" @click="handleDelete(row.id)" style="margin-right:4px;">删除</button>
                <el-button v-if="!row.mastered" size="small" class="sr-advance-btn" :data-testid="`sr-advance-${row.id}`" @click="handleAdvance(row.id)">进阶</el-button>
                <el-button v-if="row.stage > 1 || row.mastered" size="small" class="sr-reset-btn" :data-testid="`sr-reset-${row.id}`" @click="handleReset(row.id)">重置</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div v-else class="sr-list">
            <div
              v-for="item in pageItems"
              :key="item.id"
              class="sr-card"
              :class="{ mastered: item.mastered }"
              :data-testid="`sr-card-${item.id}`"
            >
              <div class="sr-card-head">
                <span class="sr-subject-badge">{{ item.subject }}</span>
                <span class="sr-knowledge" :title="item.knowledge">{{ item.knowledge }}</span>
                <span v-if="item.source" class="sr-source" :title="item.source">{{ item.source }}</span>
                <el-button
                  class="sr-del-btn"
                  :data-testid="`sr-del-${item.id}`"
                  title="删除"
                  text
                  size="small"
                  @click.stop="handleDelete(item.id)"
                >
                  <Icon name="close" :size="14" />
                </el-button>
              </div>
              <div class="sr-card-meta">
                <span class="sr-stage">{{ store.stageText(item.stage) }}</span>
                <span
                  v-if="!item.mastered"
                  class="sr-next-date"
                  :class="daysClass(store.daysToReview(item.nextReviewDate))"
                >{{ daysLabel(store.daysToReview(item.nextReviewDate)) }}</span>
                <span v-else class="sr-mastered-tag">已掌握</span>
                <span class="sr-learn-date">初学 {{ item.learnDate }}</span>
              </div>
              <div class="sr-card-foot">
                <el-button
                  v-if="!item.mastered"
                  size="small"
                  class="sr-advance-btn"
                  :data-testid="`sr-advance-${item.id}`"
                  @click="handleAdvance(item.id)"
                >已掌握，下一阶段</el-button>
                <el-button
                  v-if="item.stage > 1 || item.mastered"
                  size="small"
                  class="sr-reset-btn"
                  :data-testid="`sr-reset-${item.id}`"
                  @click="handleReset(item.id)"
                >未掌握，重置</el-button>
                <el-button
                  size="small"
                  class="sr-edit-btn"
                  :data-testid="`sr-edit-${item.id}`"
                  @click="openEditDialog(item.id)"
                >编辑</el-button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="viewEntries.length > 0" class="sr-list-pager">
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

    <!-- 新增/编辑弹框 -->
    <el-dialog
      v-model="showEditDialog"
      :title="editingId !== null ? '编辑复习条目' : '新增复习条目'"
      width="480px"
      @close="closeEditDialog"
    >
      <div class="sr-dialog-body">
        <div class="sr-field">
          <label>学科</label>
          <el-select
            v-model="dialogSubject"
            filterable
            allow-create
            placeholder="例：数学"
            data-testid="sr-form-subject"
          >
            <el-option v-for="s in settingsStore.subjects" :key="s" :value="s" :label="s" />
          </el-select>
        </div>
        <div class="sr-field">
          <label>知识点（最长 200 字符）</label>
          <el-input
            v-model="dialogKnowledge"
            type="textarea"
            :maxlength="200"
            :rows="3"
            placeholder="例：一元二次方程的求根公式"
            data-testid="sr-form-knowledge"
          />
        </div>
        <div class="sr-field">
          <label>来源（可选）</label>
          <el-input
            v-model="dialogSource"
            :maxlength="50"
            placeholder="例：教材 P45 / 错题本"
            data-testid="sr-form-source"
          />
        </div>
        <div class="sr-field">
          <label>初学日期</label>
          <el-input
            v-model="dialogLearnDate"
            type="date"
            data-testid="sr-form-learn-date"
          />
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeEditDialog">取消</el-button>
          <el-button type="primary" data-testid="sr-form-save" @click="saveEditDialog">
            {{ editingId !== null ? '保存' : '新增' }}
          </el-button>
          <el-button v-if="editingId" type="danger" data-testid="sr-form-delete" @click="handleDelete(editingId)">删除</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sr-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
}

.sr-tabs {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 4px;
}


.sr-stats {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  padding: 0 4px;
}

.sr-stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: center;
}

.sr-stat-label {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.sr-stat-value {
  font-size: 18px;
  font-weight: 600;
  margin-top: 2px;
}
.sr-stat-value.due { color: #f59e0b; }
.sr-stat-value.overdue { color: #ef4444; }
.sr-stat-value.mastered { color: #10b981; }

.sr-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 双视图容器 ===== */
.sr-list-area {
  flex: 1 1 auto;
  min-height: 240px;
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.sr-list-area > :global(.el-table) {
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
.sr-list-area > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.sr-list-area > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .sr-list-area > :global(.el-table) {
  --el-table-border-color: var(--color-border, #374151);
  --el-table-header-bg-color: var(--color-bg-hover, #111827);
  --el-table-tr-bg-color: transparent;
}
:global(html.dark) .sr-list-area > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .sr-list-area > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}
.sr-list-area > :global(.el-table .el-table__body-wrapper .cell),
.sr-list-area > :global(.el-table .el-table__header-wrapper .cell) {
  min-width: 60px;
}

/* ===== 分页条 ===== */
.sr-list-pager {
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
:global(html.dark) .sr-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}
.sr-list-pager > :global(.el-pagination) {
  --el-pagination-bg-color: transparent;
}
.sr-list-pager > :global(.el-pagination button),
.sr-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #ffffff) !important;
  border: 1px solid var(--color-border, #e5e7eb) !important;
  color: var(--color-text-secondary, #6b7280) !important;
}
.sr-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
:global(html.dark) .sr-list-pager > :global(.el-pagination button),
:global(html.dark) .sr-list-pager > :global(.el-pagination .el-pager li) {
  background-color: var(--color-bg-card, #1f2937) !important;
  border-color: var(--color-border, #374151) !important;
  color: var(--color-text-secondary, #d1d5db) !important;
}
:global(html.dark) .sr-list-pager > :global(.el-pagination .el-pager li.is-active) {
  background-color: var(--color-primary, #3b82f6) !important;
  color: #fff !important;
  border-color: var(--color-primary, #3b82f6) !important;
}
.sr-list-pager > :global(.el-pagination__total) {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}

.sr-list {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
}
.sr-list-scroll {
  overflow-y: auto;
}

.sr-card {
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
.sr-card.mastered {
  background: rgba(16, 185, 129, 0.06);
  border-color: rgba(16, 185, 129, 0.4);
}

.sr-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sr-subject-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #3b82f6;
  flex-shrink: 0;
}

.sr-knowledge {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sr-source {
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
  flex-shrink: 0;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sr-del-btn {
  flex-shrink: 0;
  color: var(--color-text-secondary, #6b7280);
}
.sr-del-btn:hover {
  color: #ef4444;
}

.sr-card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--color-text-secondary, #6b7280);
}

.sr-stage {
  font-weight: 500;
  color: var(--color-text, #1f2937);
}

.sr-next-date {
  font-weight: 600;
}
.sr-next-date.overdue { color: #ef4444; }
.sr-next-date.due-today { color: #f59e0b; }
.sr-next-date.upcoming { color: var(--color-text-secondary, #6b7280); }

.sr-mastered-tag {
  font-weight: 600;
  color: #10b981;
}

.sr-learn-date {
  margin-left: auto;
}

.sr-card-foot {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.sr-advance-btn {
  color: #10b981;
  border-color: #10b981;
}
.sr-advance-btn:hover {
  background: rgba(16, 185, 129, 0.12);
}

.sr-reset-btn {
  color: #f59e0b;
  border-color: #f59e0b;
}
.sr-reset-btn:hover {
  background: rgba(245, 158, 11, 0.12);
}

.sr-edit-btn {
  color: var(--color-text-secondary, #6b7280);
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

.sr-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sr-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sr-field label {
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  color: var(--color-text-secondary, #6b7280);
  font-size: 14px;
}

/* ===== 移动端：统计卡与复习卡片降列、按钮换行 ===== */
@media (max-width: 768px) {
  .sr-stats {
    grid-template-columns: repeat(3, 1fr);
  }
  .sr-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .sr-card {
    height: 140px;
    min-height: 140px;
  }
  .sr-tabs {
    flex-wrap: wrap;
  }
  .sr-card-foot {
    flex-wrap: wrap;
  }
}
</style>
