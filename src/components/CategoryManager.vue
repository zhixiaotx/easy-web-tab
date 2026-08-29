<script setup lang="ts">
import Icon from './Icon.vue'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useCategoriesStore } from '../stores/categories'
import { useSitesStore } from '../stores/sites'

const emit = defineEmits<{
  close: []
}>()

const categoriesStore = useCategoriesStore()
const sitesStore = useSitesStore()

// ESC 键关闭弹框
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

const newCategoryName = ref('')
const newCategoryIcon = ref('📂')
const editingId = ref<string | null>(null)
const editingName = ref('')
const editingIcon = ref('')

const defaultIcons = ['📂', '🔧', '⚙️', '🔗', '🌟', '💡', '🚀', '🎯', '📌', '🏷️', '📰', '🎮', '🎬', '🛒', '🏠', '📚', '💰', '🏛️', '✈️', '🏥', '🎨', '📁', '🌐', '💻', '📱', '🎵', '🎥', '📷', '🎨', '📝', '📊', '📈', '📉', '💼', '📋', '📌', '🔖', '🏷️', '🎫', '🎟️', '🎪', '🎭', '🎨', '🎬', '🎤', '🎧', '🎵', '🎶', '🔊', '🔈', '📺', '📻', '☎️', '📞', '📧', '📩', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🔍', '🔎', '🔏', '🔐', '🔑', '🗝️', '🔒', '🔓', '💳', '💵', '💴', '💶', '💷', '💸', '💹', '📦', '📫', '📬', '📭', '🏠', '🏢', '🏣', '🏤', '🏥', '🏦', '🏧', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏮', '🏯', '🏰', '🗼', '🗽', '⛪', '🕌', '🕍', '⛩️', '🛕', '🛤️', '🛣️', '🗾', '🗻', '🌋', '🗾', '🏔️', '⛰️', '🌄', '🌅', '🌈', '�天使', '🌊', '⛵', '🚢', '✈️', '🚀', '🛩️', '💺', '🛰️', '🛸', '🚁', '🚂', '🚃', '🚄', '🚅', '🚇', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍', '🚎', '🚐', '🚑', '🚒', '🚓', '🚔', '🚕', '🚖', '🚗', '🚘', '🚙', '🚚', '🚛', '🚜', '🏎️', '🏍️', '🛵', '🚲', '🛴', '🛹', '🛼', '🚏', '🛤️', '🛣️', '🗺️', '🧭', '⏰', '⏱️', '⏲️', '⏰', '🕰️', '⏳', '⌛', '⏰', '⏱️', '⏲️', '⏰', '🕰️', '⏳', '⌛', '🔔', '🔕', '🔇', '🔈', '🔉', '🔊', '📢', '📣', '🔔', '🔕']

// 获取使用某分类的网站数量
function getSiteCount(categoryId: string): number {
  return sitesStore.sites.filter(s => s.category === categoryId).length
}

// 添加分类
function handleAdd() {
  if (!newCategoryName.value.trim()) return
  
  categoriesStore.addCategory(newCategoryName.value.trim(), newCategoryIcon.value)
  newCategoryName.value = ''
  newCategoryIcon.value = '📂'
}

// 开始编辑
function startEdit(cat: { id: string; name: string; icon: string }) {
  editingId.value = cat.id
  editingName.value = cat.name
  editingIcon.value = cat.icon
}

// 取消编辑
function cancelEdit() {
  editingId.value = null
  editingName.value = ''
  editingIcon.value = ''
}

// 保存编辑
function saveEdit() {
  if (!editingId.value || !editingName.value.trim()) return
  
  categoriesStore.updateCategory(editingId.value, {
    name: editingName.value.trim(),
    icon: editingIcon.value
  })
  cancelEdit()
}

// 删除分类
function handleDelete(categoryId: string) {
  const siteCount = getSiteCount(categoryId)
  const target = categoriesStore.deleteCategory(categoryId)
  
  // 迁移网站到 'other' 分类
  if (siteCount > 0) {
    sitesStore.migrateSitesToCategory(categoryId, target)
  }
}

// 移动分类
function handleMove(categoryId: string, direction: 'up' | 'down') {
  categoriesStore.moveCategory(categoryId, direction)
}

// 预定义分类
const builtInCategories = computed(() => 
  categoriesStore.allCategories.filter(c => c.isBuiltIn)
)

// 自定义分类 (已排序)
const sortedCustomCategories = computed(() => 
  [...categoriesStore.customCategories].sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999))
)
</script>

<template>
  <Transition name="dialog">
  <div class="manager-overlay" @click.self="emit('close')">
    <div class="manager">
      <div class="manager-header">
        <h2>分类管理</h2>
        <button class="close-btn" @click="emit('close')"><Icon name="close" /></button>
      </div>

      <div class="manager-body">
        <!-- 添加新分类 -->
        <div class="add-form">
          <h3>添加分类</h3>
          <div class="add-form-row">
            <input
              v-model="newCategoryIcon"
              type="text"
              class="icon-input"
              placeholder="图标"
              maxlength="2"
            />
            <input
              v-model="newCategoryName"
              type="text"
              class="name-input"
              placeholder="分类名称"
              @keyup.enter="handleAdd"
            />
            <button class="btn-add" @click="handleAdd" :disabled="!newCategoryName.trim()">
              添加
            </button>
          </div>
          <div class="icon-suggestions">
            <span class="icon-label">快速选择:</span>
            <button
              v-for="icon in defaultIcons"
              :key="icon"
              class="icon-btn"
              :class="{ active: newCategoryIcon === icon }"
              @click="newCategoryIcon = icon"
            >
              {{ icon }}
            </button>
          </div>
        </div>

        <!-- 分类列表 -->
        <div class="category-list">
          <h3>分类排序</h3>
          
          <!-- 预定义分类 -->
          <div class="list-section">
            <div class="section-title">固定分类（不可删除）</div>
            <div
              v-for="cat in builtInCategories"
              :key="cat.id"
              class="category-item built-in"
            >
              <span class="sort-hint"><Icon name="lock" /></span>
              <span class="category-icon">{{ cat.icon }}</span>
              <span class="category-name">{{ cat.name }}</span>
              <span class="site-count">({{ getSiteCount(cat.id) }})</span>
            </div>
          </div>

          <!-- 自定义分类 -->
          <div class="list-section">
            <div class="section-title">自定义分类（可拖拽排序）</div>
            <div
              v-for="cat in sortedCustomCategories"
              :key="cat.id"
              class="category-item custom"
            >
              <template v-if="editingId === cat.id">
                <input
                  v-model="editingIcon"
                  type="text"
                  class="edit-input icon-input"
                  maxlength="2"
                />
                <input
                  v-model="editingName"
                  type="text"
                  class="edit-input name-input"
                  @keyup.enter="saveEdit"
                  @keyup.escape="cancelEdit"
                />
                <button class="btn-icon" @click="saveEdit"><Icon name="check" /></button>
                <button class="btn-icon" @click="cancelEdit"><Icon name="close" /></button>
              </template>
              <template v-if="editingId === cat.id">
                <div class="edit-icon-suggestions">
                  <button
                    v-for="icon in defaultIcons.slice(0, 20)"
                    :key="icon"
                    class="icon-btn-small"
                    :class="{ active: editingIcon === icon }"
                    @click="editingIcon = icon"
                  >
                    {{ icon }}
                  </button>
                </div>
              </template>
              <template v-else>
                <div class="sort-controls">
                  <button 
                    class="btn-sort" 
                    @click="handleMove(cat.id, 'up')"
                    :disabled="!categoriesStore.canMove(cat.id, 'up')"
                    title="上移"
                  >↑</button>
                  <button 
                    class="btn-sort" 
                    @click="handleMove(cat.id, 'down')"
                    :disabled="!categoriesStore.canMove(cat.id, 'down')"
                    title="下移"
                  >↓</button>
                </div>
                <span class="category-icon">{{ cat.icon }}</span>
                <span class="category-name">{{ cat.name }}</span>
                <span class="site-count">({{ getSiteCount(cat.id) }})</span>
                <button class="btn-icon" @click="startEdit(cat)"><Icon name="pencil" /></button>
                <button class="btn-icon delete" @click="handleDelete(cat.id)"><Icon name="trash" /></button>
              </template>
            </div>
          </div>

          <div v-if="sortedCustomCategories.length === 0" class="empty-custom">
            暂无自定义分类
          </div>
        </div>
      </div>
    </div>
  </div>
  </Transition>
</template>

<style scoped>
.manager-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

  .manager {
    background-color: white;
    border-radius: 12px;
    width: 100%;
    max-width: var(--dlg-w-category, 900px);
  max-height: var(--dlg-h-category, 80vh);
  overflow-y: auto;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
  position: sticky;
  top: 0;
  background: white;
  border-radius: 12px 12px 0 0;
}

.manager-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
}

.close-btn:hover {
  color: #64748b;
}

.manager-body {
  padding: 24px;
}

.add-form {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #f1f5f9;
}

.add-form h3,
.category-list h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 12px 0;
}

.add-form-row {
  display: flex;
  gap: 8px;
}

.icon-input {
  width: 48px;
  text-align: center;
  font-size: 18px;
}

.name-input {
  flex: 1;
}

.btn-add {
  padding: 10px 16px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-add:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-add:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
}

.icon-suggestions {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.icon-label {
  font-size: 12px;
  color: #94a3b8;
}

.icon-btn {
  padding: 4px 8px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: #e2e8f0;
}

.icon-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
}

.category-list {
  /* empty */
}

.list-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 8px;
}

.category-item.built-in {
  opacity: 0.6;
  background: #fef3c7;
}

.category-item.custom {
  background: #fff;
  border: 1px solid #e2e8f0;
}

.sort-hint {
  font-size: 12px;
  width: 24px;
}

.sort-controls {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.btn-sort {
  width: 20px;
  height: 16px;
  padding: 0;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-sort:hover:not(:disabled) {
  background: #e2e8f0;
  color: #3b82f6;
}

.btn-sort:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.category-icon {
  font-size: 18px;
}

.category-name {
  flex: 1;
  font-size: 14px;
  color: #1e293b;
}

.site-count {
  font-size: 12px;
  color: #94a3b8;
  margin-right: 8px;
}

.edit-input {
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 14px;
}

.edit-input.icon-input {
  width: 40px;
  text-align: center;
}

.edit-input.name-input {
  flex: 1;
}

.edit-icon-suggestions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  width: 100%;
  padding: 8px;
  background: #f8fafc;
  border-radius: 4px;
  margin-top: 4px;
}

.icon-btn-small {
  width: 28px;
  height: 28px;
  padding: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn-small:hover {
  background: #e2e8f0;
}

.icon-btn-small.active {
  background: #3b82f6;
  border-color: #3b82f6;
}

.btn-icon {
  padding: 4px 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.btn-icon:hover {
  opacity: 1;
}

.btn-icon.delete:hover {
  color: #ef4444;
}

.empty-custom {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  padding: 20px;
}
</style>
