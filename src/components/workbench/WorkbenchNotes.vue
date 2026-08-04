<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWorkbenchNotesStore } from '@/stores/workbenchNotes'
import { NOTE_COLORS } from '@/types'
import type { NoteColor, WorkbenchNote } from '@/types'

const store = useWorkbenchNotesStore()

// ===== 表单状态机（新增/编辑共用编辑浮层）=====
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const formTitle = ref('')
const formContent = ref('')
const formColor = ref<NoteColor>('yellow')

// content 必填：trim 后非空，否则保存按钮 disabled
const isFormValid = computed(() => formContent.value.trim().length > 0)

const COLOR_LABELS: Record<NoteColor, string> = {
  yellow: '黄色',
  blue: '蓝色',
  green: '绿色',
  pink: '粉色'
}

function startAdd(): void {
  editingId.value = null
  formTitle.value = ''
  formContent.value = ''
  formColor.value = 'yellow'
  formOpen.value = true
}

function startEdit(note: WorkbenchNote): void {
  editingId.value = note.id
  formTitle.value = note.title ?? ''
  formContent.value = note.content
  formColor.value = note.color
  formOpen.value = true
}

function cancelForm(): void {
  formOpen.value = false
}

async function handleSave(): Promise<void> {
  const content = formContent.value.trim()
  if (!content) return
  const title = formTitle.value.trim() || undefined
  if (editingId.value) {
    await store.updateNote(editingId.value, { title, content, color: formColor.value })
  } else {
    await store.addNote({ title, content, color: formColor.value })
  }
  cancelForm()
}

async function handlePin(note: WorkbenchNote): Promise<void> {
  await store.togglePin(note.id)
}

async function handleDelete(id: string): Promise<void> {
  if (confirm('确定要删除这个便签吗？')) {
    await store.deleteNote(id)
    cancelForm()
  }
}

// 面板自管理数据加载（WorkbenchView 已加载，这里防御性重载，数据在内存中与 IDB 同步）
onMounted(async () => {
  await store.loadNotes()
})
</script>

<template>
  <div class="wb-notes">
    <!-- 顶部工具栏 -->
    <div class="notes-toolbar">
      <button class="btn-add-note" data-testid="note-add-button" @click="startAdd">＋ 新增便签</button>
    </div>

    <!-- 空态 -->
    <div v-if="store.sortedNotes.length === 0" class="empty-state" data-testid="note-empty">
      暂无便签
    </div>

    <!-- 网格卡片 -->
    <div v-else class="notes-grid">
      <div
        v-for="note in store.sortedNotes"
        :key="note.id"
        class="note-card"
        :class="[`note-${note.color}`, { 'is-pinned': note.pinned }]"
        data-testid="note-card"
        @click="startEdit(note)"
      >
        <div class="note-card-header">
          <span v-if="note.pinned" class="pin-badge">📌 置顶</span>
          <span v-else></span>
          <button
            class="pin-toggle"
            :class="{ active: note.pinned }"
            :title="note.pinned ? '取消置顶' : '置顶'"
            :data-testid="`note-pin-${note.id}`"
            @click.stop="handlePin(note)"
          >
            📌
          </button>
        </div>

        <div v-if="note.title" class="note-title">{{ note.title }}</div>
        <div class="note-content">{{ note.content }}</div>

        <div class="note-color-tag">
          <span class="color-dot" :class="`dot-${note.color}`"></span>
          <span>{{ COLOR_LABELS[note.color] }}</span>
        </div>
      </div>
    </div>

    <!-- 编辑浮层（新增/编辑共用） -->
    <div v-if="formOpen" class="note-overlay" data-testid="note-overlay" @click.self="cancelForm">
      <div class="note-form">
        <h3 class="note-form-title">{{ editingId ? '编辑便签' : '新增便签' }}</h3>

        <input
          v-model="formTitle"
          type="text"
          class="form-input note-title-input"
          data-testid="note-title-input"
          placeholder="标题（可选）"
        />

        <textarea
          v-model="formContent"
          class="form-input note-content-input"
          rows="5"
          data-testid="note-content-input"
          placeholder="便签内容…"
        ></textarea>

        <div class="note-color-picker">
          <label
            v-for="color in NOTE_COLORS"
            :key="color"
            class="color-option"
            :class="[`color-${color}`, { active: formColor === color }]"
            :data-testid="`note-color-${color}`"
          >
            <input v-model="formColor" type="radio" name="note-color" :value="color" />
            <span class="color-swatch"></span>
            <span class="color-name">{{ COLOR_LABELS[color] }}</span>
          </label>
        </div>

        <div class="note-form-actions">
          <button
            v-if="editingId"
            type="button"
            class="btn-delete"
            data-testid="note-delete-button"
            @click="handleDelete(editingId)"
          >
            删除
          </button>
          <button type="button" class="btn-cancel" data-testid="note-cancel-button" @click="cancelForm">
            取消
          </button>
          <button
            type="button"
            class="btn-save"
            :disabled="!isFormValid"
            data-testid="note-save-button"
            @click="handleSave"
          >
            {{ editingId ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器 */
.wb-notes {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 顶部工具栏 ===== */
.notes-toolbar {
  display: flex;
  justify-content: flex-end;
}

.btn-add-note {
  padding: 8px 16px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-add-note:hover {
  background: var(--accent-hover, var(--color-primary-hover));
}

/* ===== 网格卡片 ===== */
.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.note-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  min-height: 130px;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: box-shadow var(--transition-fast, 0.15s ease);
}

.note-card:hover {
  box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.12));
}

.note-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 22px;
}

.pin-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full, 999px);
  background: rgba(0, 0, 0, 0.12);
}

.pin-toggle {
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm, 6px);
  opacity: 0.4;
  transition: opacity var(--transition-fast, 0.15s ease);
}

.pin-toggle:hover {
  opacity: 0.8;
}

.pin-toggle.active {
  opacity: 1;
}

.note-title {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-content {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
}

.note-color-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: auto;
  font-size: 12px;
  opacity: 0.75;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

/* ===== 四色（浅色）===== */
.note-yellow {
  background: #fef9c3;
  border-color: #fde047;
  color: #713f12;
}

.note-blue {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1e3a8a;
}

.note-green {
  background: #dcfce7;
  border-color: #86efac;
  color: #14532d;
}

.note-pink {
  background: #fce7f3;
  border-color: #f9a8d4;
  color: #831843;
}

.dot-yellow {
  background: #eab308;
}

.dot-blue {
  background: #3b82f6;
}

.dot-green {
  background: #22c55e;
}

.dot-pink {
  background: #ec4899;
}

/* ===== 空态 ===== */
.empty-state {
  text-align: center;
  color: var(--text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== 编辑浮层 ===== */
.note-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5);
}

.note-form {
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-lg, 14px);
  box-shadow: var(--shadow-modal, 0 20px 60px rgba(0, 0, 0, 0.3));
}

.note-form-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

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

.note-content-input {
  min-height: 110px;
  resize: vertical;
}

/* ===== 颜色选择器 ===== */
.note-color-picker {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.color-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  border: 2px solid transparent;
  border-radius: var(--radius-full, 999px);
  transition: all var(--transition-fast, 0.15s ease);
}

.color-option input {
  display: none;
}

.color-option:hover {
  border-color: var(--border-light, var(--color-border));
}

.color-option.active {
  border-color: var(--accent-color, var(--color-primary));
  color: var(--text-primary, var(--color-text));
}

.color-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: inline-block;
}

.color-yellow .color-swatch {
  background: #eab308;
}

.color-blue .color-swatch {
  background: #3b82f6;
}

.color-green .color-swatch {
  background: #22c55e;
}

.color-pink .color-swatch {
  background: #ec4899;
}

/* ===== 表单操作 ===== */
.note-form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-save {
  padding: 9px 18px;
  font-size: 14px;
  color: #fff;
  white-space: nowrap;
  cursor: pointer;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  transition: background-color var(--transition-fast, 0.15s ease);
}

.btn-save:hover:not(:disabled) {
  background: var(--accent-hover, var(--color-primary-hover));
}

.btn-save:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

.btn-cancel {
  padding: 9px 16px;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 0.15s ease);
}

.btn-cancel:hover {
  background: var(--hover-bg, var(--color-bg-active));
}

.btn-delete {
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

.btn-delete:hover {
  background: var(--error-color, var(--color-error));
  color: #fff;
}

/* ===== 暗色模式覆盖 ===== */
:root.dark .note-yellow {
  background: rgba(234, 179, 8, 0.18);
  border-color: #a16207;
  color: #fde047;
}

:root.dark .note-blue {
  background: rgba(59, 130, 246, 0.18);
  border-color: #1d4ed8;
  color: #93c5fd;
}

:root.dark .note-green {
  background: rgba(34, 197, 94, 0.16);
  border-color: #047857;
  color: #6ee7b7;
}

:root.dark .note-pink {
  background: rgba(236, 72, 153, 0.16);
  border-color: #be185d;
  color: #f9a8d4;
}

:root.dark .pin-badge {
  background: rgba(0, 0, 0, 0.35);
}

:root.dark .note-overlay {
  background: rgba(0, 0, 0, 0.7);
}

:root.dark .note-form {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .empty-state {
  background-color: var(--bg-secondary, #1f2937);
}

/* 禁用态按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
:root.dark .btn-save:disabled {
  background-color: var(--input-bg, #374151);
  color: var(--text-muted, #9ca3af);
}

@media (max-width: 640px) {
  .note-form {
    max-width: 100%;
  }
}
</style>
