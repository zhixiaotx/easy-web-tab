<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWorkbenchDiaryStore } from '@/stores/workbenchDiary'
import { dateKeyOf, diaryDateLabel, findDiaryByDate } from '@/composables/diaryCore'
import { renderMarkdown } from '@/composables/noteMarkdown'
import { useToast } from '@/composables/useToast'
import type { WorkbenchDiary } from '@/types'

const store = useWorkbenchDiaryStore()
const toast = useToast()

// 历史卡片网格：8 条/页
const PAGE_SIZE = 8
// 今天日期键（dateKeyOf 本地日期，防 UTC 偏移；会话内不变，无需响应式）
const todayKey = dateKeyOf(new Date())

// ===== 编辑器状态 =====
const selectedDate = ref(todayKey)
const draft = ref('')
const previewMode = ref(false)

// 当前选中日期已有条目（删除按钮渲染/可用条件；查找公式走 diaryCore.findDiaryByDate）
const selectedEntry = computed<WorkbenchDiary | undefined>(() => findDiaryByDate(store.entries, selectedDate.value))

// 脏检查：草稿 ≠ 该日期已存内容（未保存修改视为脏）
const isDirty = computed(() => draft.value !== (selectedEntry.value?.content ?? ''))

// 实时字数（textarea 内容长度）
const charCount = computed(() => draft.value.length)

// ===== 历史分页（消费 store.sortedEntries：date 降序 → createdAt 降序，排序公式属 diaryCore）=====
const totalPages = computed(() => Math.max(1, Math.ceil(store.sortedEntries.length / PAGE_SIZE)))
const currentPage = ref(1)
const pageEntries = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return store.sortedEntries.slice(start, start + PAGE_SIZE)
})

// 删除/编辑导致总页数变化时自动钳制 currentPage（页码越界回退）
watch(
  () => store.sortedEntries.length,
  () => {
    if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
  }
)

// ===== 日期切换（统一脏检查入口：日期输入 / 今日按钮 / 卡片点击）=====
function selectDate(dateKey: string): void {
  if (dateKey === selectedDate.value) return
  if (isDirty.value && !confirm('当前内容未保存，确定切换日期？')) return
  selectedDate.value = dateKey
  // 该日期已有条目 → 载入其内容为草稿；无条目 → 空草稿（查找走 diaryCore.findDiaryByDate）
  draft.value = findDiaryByDate(store.entries, dateKey)?.content ?? ''
  previewMode.value = false
}

function handleDateInput(e: Event): void {
  const target = e.target as HTMLInputElement
  selectDate(target.value)
}

function handleToday(): void {
  selectDate(todayKey)
}

function handleCardClick(entry: WorkbenchDiary): void {
  selectDate(entry.date)
}

// 卡片预览内点击：锚点链接不冒泡到卡片 @click（镜像 WorkbenchNotes onContentClick，链接走 target=_blank 正常打开）
function onCardPreviewClick(e: MouseEvent): void {
  const t = e.target as Element | null
  if (t && t.closest('a')) e.stopPropagation()
}

// ===== 保存 / 删除 =====
async function handleSave(): Promise<void> {
  const trimmed = draft.value.trim()
  if (!trimmed) {
    toast.warning('内容为空，未保存')
    return
  }
  const wasNew = !selectedEntry.value
  await store.upsertEntry(selectedDate.value, draft.value)
  // 与持久化内容对齐（store 保存时 trim），避免尾随空格造成永久脏态
  draft.value = trimmed
  // 新增条目 → 回第 1 页（更新已有条目保持当前页）
  if (wasNew) currentPage.value = 1
  toast.success('日记已保存')
}

async function handleDelete(): Promise<void> {
  const entry = selectedEntry.value
  if (!entry) return
  if (!confirm('确定要删除这篇日记吗？')) return
  await store.deleteEntry(entry.id)
  // 选中日期已无条目：清空草稿（与空内容一致，不误判脏态）；页码越界由 watch 自动钳制
  draft.value = ''
  previewMode.value = false
}
</script>

<template>
  <div class="wb-diary">
    <!-- 工具栏：日期输入 + 今日/保存/删除 + 编辑/预览切换 + 字数 -->
    <div class="dj-toolbar">
      <div class="dj-toolbar-left">
        <input
          :value="selectedDate"
          type="date"
          class="form-input dj-date-input"
          data-testid="dj-date-input"
          @change="handleDateInput"
        />
        <button type="button" class="dj-btn-secondary" data-testid="dj-today-btn" @click="handleToday">今日</button>
        <button type="button" class="dj-btn-primary" data-testid="dj-save-btn" @click="handleSave">保存</button>
        <button
          v-if="selectedEntry"
          type="button"
          class="dj-btn-danger"
          data-testid="dj-delete-btn"
          @click="handleDelete"
        >删除</button>
      </div>
      <div class="dj-toolbar-right">
        <button
          type="button"
          class="dj-btn-toggle"
          :class="{ active: previewMode }"
          data-testid="dj-preview-toggle"
          @click="previewMode = !previewMode"
        >{{ previewMode ? '编辑' : '预览' }}</button>
        <span class="dj-char-count" data-testid="dj-char-count">{{ charCount }} 字</span>
      </div>
    </div>

    <!-- 编辑器 / Markdown 预览（切换保留草稿） -->
    <textarea
      v-if="!previewMode"
      v-model="draft"
      class="form-input dj-content-input"
      data-testid="dj-content-input"
      placeholder="写下今天的心情…"
    ></textarea>
    <div
      v-else
      class="dj-preview"
      data-testid="dj-preview"
      v-html="renderMarkdown(draft)"
    ></div>

    <!-- 历史区：卡片网格 + 左右翻页 -->
    <div class="dj-history">
      <h3 class="dj-history-title">历史日记</h3>

      <div v-if="store.sortedEntries.length === 0" class="dj-empty" data-testid="dj-empty">
        还没有日记，写下今天的第一篇吧
      </div>

      <template v-else>
        <div class="dj-grid">
          <div
            v-for="entry in pageEntries"
            :key="entry.id"
            class="dj-card"
            :data-testid="`dj-card-${entry.id}`"
            @click="handleCardClick(entry)"
          >
            <div class="dj-card-head">
              <span class="dj-card-date" :data-testid="`dj-card-date-${entry.id}`">{{ diaryDateLabel(entry.date) }}</span>
              <span v-if="entry.date === todayKey" class="dj-card-today" :data-testid="`dj-card-today-${entry.id}`">今天</span>
            </div>
            <div class="dj-card-preview" :data-testid="`dj-card-preview-${entry.id}`" v-html="renderMarkdown(entry.content)" @click="onCardPreviewClick"></div>
            <div class="dj-card-words">{{ entry.content.length }} 字</div>
          </div>
        </div>

        <div class="dj-pagination">
          <button
            type="button"
            class="page-btn"
            :disabled="currentPage <= 1"
            data-testid="dj-page-prev"
            @click="currentPage--"
          >‹ 上一页</button>
          <span class="dj-page-info" data-testid="dj-page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
          <button
            type="button"
            class="page-btn"
            :disabled="currentPage >= totalPages"
            data-testid="dj-page-next"
            @click="currentPage++"
          >下一页 ›</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器（与 WorkbenchNotes .wb-notes 同构） */
.wb-diary {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 工具栏 ===== */
.dj-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.dj-toolbar-left,
.dj-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.dj-date-input {
  width: 150px;
  flex-shrink: 0;
}

/* 表单输入（本组件自包含，与其它面板 .form-input 同构） */
.form-input {
  padding: 9px 12px;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 14px;
  color: var(--text-primary, var(--color-text));
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

/* 保存（实心主色，仿 .nt-btn-query） */
.dj-btn-primary {
  padding: 9px 16px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.dj-btn-primary:hover {
  background: var(--accent-hover, var(--color-primary-hover));
}

/* 今日 / 预览切换（次级描边，仿 .nt-btn-reset） */
.dj-btn-secondary,
.dj-btn-toggle {
  padding: 9px 14px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.dj-btn-secondary:hover,
.dj-btn-toggle:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

.dj-btn-toggle.active {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* 删除（危险描边，仿 .btn-delete） */
.dj-btn-danger {
  padding: 9px 16px;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--error-color, var(--color-error));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--error-color, var(--color-error));
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 0.15s ease);
}

.dj-btn-danger:hover {
  background: var(--error-color, var(--color-error));
  color: #fff;
}

.dj-char-count {
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
  white-space: nowrap;
}

/* ===== 编辑器 / 预览 ===== */
.dj-content-input {
  min-height: 260px;
  resize: vertical;
  line-height: 1.6;
}

.dj-preview {
  min-height: 260px;
  max-height: 480px;
  overflow-y: auto;
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  color: var(--text-primary, var(--color-text));
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

.dj-preview > :first-child {
  margin-top: 0;
}

.dj-preview > :last-child {
  margin-bottom: 0;
}

/* ===== 历史区 ===== */
.dj-history {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dj-history-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

/* 卡片网格：auto-fill minmax(240px, 1fr) + gap 12px（用户指定） */
.dj-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.dj-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  min-height: 190px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: box-shadow var(--transition-fast, 0.15s ease), border-color var(--transition-fast, 0.15s ease);
}

.dj-card:hover {
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
  border-color: var(--accent-color, var(--color-primary));
}

.dj-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dj-card-date {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 今天徽标（仿 .nt-cat-tab.active 药丸） */
.dj-card-today {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
  color: #fff;
  background: var(--accent-color, var(--color-primary));
}

/* 卡片预览：line-clamp 6 行 */
.dj-card-preview {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
}

.dj-card-preview > :first-child {
  margin-top: 0;
}

.dj-card-preview > :last-child {
  margin-bottom: 0;
}

.dj-card-words {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
}

/* ===== 空态 ===== */
.dj-empty {
  text-align: center;
  color: var(--text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== 分页（左右翻页，样式仿 Pagination.vue .page-btn，但用 CSS 变量适配暗色） ===== */
.dj-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 12px 0 4px;
  flex-wrap: wrap;
}

.page-btn {
  padding: 8px 14px;
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  background-color: var(--bg-card, var(--color-bg-card));
  color: var(--text-secondary, var(--color-text-secondary));
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s);
}

.page-btn:hover:not(:disabled) {
  border-color: var(--accent-color, var(--color-primary));
  color: var(--accent-color, var(--color-primary));
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dj-page-info {
  color: var(--text-secondary, var(--color-text-secondary));
  font-size: 14px;
  padding: 8px 12px;
}

/* ===== Markdown 排版（v-html 注入子节点不带 data-v-*，必须 :deep() 匹配；镜像 WorkbenchNotes） ===== */
.dj-preview :deep(h1),
.dj-card-preview :deep(h1) {
  font-size: 15px;
  font-weight: 700;
  margin: 0.35em 0;
}

.dj-preview :deep(h2),
.dj-card-preview :deep(h2) {
  font-size: 14px;
  font-weight: 700;
  margin: 0.35em 0;
}

.dj-preview :deep(h3),
.dj-card-preview :deep(h3) {
  font-size: 14px;
  font-weight: 600;
  margin: 0.35em 0;
}

.dj-preview :deep(p),
.dj-card-preview :deep(p) {
  margin: 0.35em 0;
}

.dj-preview :deep(ul),
.dj-card-preview :deep(ul),
.dj-preview :deep(ol),
.dj-card-preview :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.4em;
}

.dj-preview :deep(li),
.dj-card-preview :deep(li) {
  margin: 0.15em 0;
}

.dj-preview :deep(a),
.dj-card-preview :deep(a) {
  color: var(--accent-color, var(--color-primary));
  text-decoration: underline;
  word-break: break-all;
}

.dj-preview :deep(code),
.dj-card-preview :deep(code) {
  background: color-mix(in srgb, currentColor 12%, transparent);
  padding: 1px 4px;
  border-radius: var(--radius-sm, 6px);
  font-size: 0.9em;
}

.dj-preview :deep(pre),
.dj-card-preview :deep(pre) {
  background: color-mix(in srgb, currentColor 12%, transparent);
  margin: 0.4em 0;
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  max-width: 100%;
  font-size: 12px;
  line-height: 1.4;
}

.dj-preview :deep(blockquote),
.dj-card-preview :deep(blockquote) {
  margin: 0.4em 0;
  padding-left: 0.6em;
  border-left: 3px solid color-mix(in srgb, currentColor 35%, transparent);
  opacity: 0.85;
}

.dj-preview :deep(table),
.dj-card-preview :deep(table) {
  border-collapse: collapse;
  margin: 0.4em 0;
  font-size: 12px;
  max-width: 100%;
}

.dj-preview :deep(th),
.dj-card-preview :deep(th),
.dj-preview :deep(td),
.dj-card-preview :deep(td) {
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
}

.dj-preview :deep(th),
.dj-card-preview :deep(th) {
  font-weight: 600;
}

.dj-preview :deep(hr),
.dj-card-preview :deep(hr) {
  border: none;
  border-top: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  margin: 0.5em 0;
}

.dj-preview :deep(img),
.dj-card-preview :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
</style>
