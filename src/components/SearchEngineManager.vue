<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSearchEnginesStore } from '../stores/searchEngines'
import type { SearchEngine } from '../stores/searchEngines'

const emit = defineEmits<{
  close: []
}>()

const store = useSearchEnginesStore()

const newEngineName = ref('')
const newEngineUrl = ref('')
const newEngineQuery = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const editingUrl = ref('')

// 内置引擎编辑状态
const builtInEditingId = ref<string | null>(null)
const builtInEditingUrl = ref('')

// 按排序显示
const sortedEngines = computed(() => 
  [...store.customEngines].sort((a, b) => a.sort - b.sort)
)

// 添加引擎
function handleAdd() {
  if (!newEngineName.value.trim() || !newEngineUrl.value.trim()) return
  
  let url = newEngineUrl.value.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  
  const query = newEngineQuery.value.trim() || 'q='
  const fullUrl = url + (url.endsWith('/') ? '' : '/') + '?' + query
  
  store.addEngine(newEngineName.value.trim(), fullUrl)
  newEngineName.value = ''
  newEngineUrl.value = ''
  newEngineQuery.value = ''
}

// 开始编辑
function startEdit(engine: SearchEngine) {
  editingId.value = engine.id
  editingName.value = engine.name
  editingUrl.value = engine.url
}

// 取消编辑
function cancelEdit() {
  editingId.value = null
  editingName.value = ''
  editingUrl.value = ''
}

// 保存编辑
function saveEdit() {
  if (!editingId.value || !editingName.value.trim()) return
  
  store.updateEngine(editingId.value, {
    name: editingName.value.trim(),
    url: editingUrl.value.trim()
  })
  cancelEdit()
}

// 删除引擎
function handleDelete(id: string) {
  if (confirm('确定要删除这个搜索引擎吗？')) {
    store.deleteEngine(id)
  }
}

// 移动排序
function handleMove(id: string, direction: 'up' | 'down') {
  store.moveEngine(id, direction)
}

// 恢复默认引擎
function handleReset() {
  if (confirm('确定要恢复默认搜索引擎吗？当前自定义引擎将被覆盖。')) {
    store.resetToDefault()
  }
}

// 开始编辑内置引擎 URL
function startEditBuiltIn(engine: SearchEngine) {
  builtInEditingId.value = engine.id
  builtInEditingUrl.value = engine.url
}

// 取消编辑内置引擎
function cancelEditBuiltIn() {
  builtInEditingId.value = null
  builtInEditingUrl.value = ''
}

// 保存内置引擎 URL
function saveBuiltInUrl() {
  if (!builtInEditingId.value || !builtInEditingUrl.value.trim()) return
  store.updateBuiltInEngineUrl(builtInEditingId.value, builtInEditingUrl.value.trim())
  builtInEditingId.value = null
  builtInEditingUrl.value = ''
}

// 截断 URL 显示
function truncateUrl(url: string, maxLength = 40) {
  if (url.length <= maxLength) return url
  return url.slice(0, maxLength) + '...'
}
</script>

<template>
  <div class="manager-overlay" @click.self="emit('close')">
    <div class="manager">
      <div class="manager-header">
        <h2>搜索引擎管理</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="manager-body">
        <!-- 添加新引擎 -->
        <div class="add-form">
          <h3>添加搜索引擎</h3>
          <div class="form-row">
            <input
              v-model="newEngineName"
              type="text"
              placeholder="名称，如：百度"
              class="input-name"
            />
            <input
              v-model="newEngineUrl"
              type="text"
              placeholder="网址，如：https://baidu.com"
              class="input-url"
            />
          </div>
          <div class="form-row">
            <input
              v-model="newEngineQuery"
              type="text"
              placeholder="查询参数，如：wd= (会自动拼接到URL后)"
              class="input-query"
            />
            <button 
              class="btn-add" 
              @click="handleAdd" 
              :disabled="!newEngineName.trim() || !newEngineUrl.trim()"
            >
              添加
            </button>
          </div>
        </div>

        <!-- 内置引擎 -->
        <div class="engine-section">
          <h3>内置引擎 (不可删除)</h3>
          <button class="btn-reset" @click="handleReset">恢复默认引擎</button>
          <div
            v-for="engine in store.builtInEngines"
            :key="engine.id"
            class="engine-item built-in"
            :class="{ 'is-default': engine.isDefault }"
          >
            <div class="sort-controls">
              <span class="lock-icon">🔒</span>
            </div>
            
            <!-- 编辑模式 -->
            <template v-if="builtInEditingId === engine.id">
              <input
                v-model="builtInEditingUrl"
                type="text"
                class="edit-input url built-in-url"
                placeholder="URL"
              />
              <button class="btn-icon" @click="saveBuiltInUrl">✓</button>
              <button class="btn-icon" @click="cancelEditBuiltIn">✕</button>
            </template>
            
            <!-- 显示模式 -->
            <template v-else>
              <span class="engine-name">
                {{ engine.name }}
                <span v-if="engine.isDefault" class="default-tag">默认</span>
              </span>
              <span class="engine-url" :title="engine.url">{{ truncateUrl(engine.url) }}</span>
              <button 
                v-if="engine.id !== 'local'"
                class="btn-icon" 
                @click="startEditBuiltIn(engine)" 
                title="编辑URL"
              >✏️</button>
            </template>
          </div>
        </div>

        <!-- 自定义引擎 -->
        <div class="engine-section">
          <h3>自定义引擎 ({{ store.customEngines.length }})</h3>
          
          <div v-if="store.customEngines.length === 0" class="empty-state">
            暂无自定义引擎
          </div>

          <div
            v-for="engine in sortedEngines"
            :key="engine.id"
            class="engine-item custom"
            :class="{ 'is-default': engine.isDefault }"
          >
            <template v-if="editingId === engine.id">
              <input
                v-model="editingName"
                type="text"
                class="edit-input name"
                placeholder="名称"
              />
              <input
                v-model="editingUrl"
                type="text"
                class="edit-input url"
                placeholder="URL"
              />
              <button class="btn-icon" @click="saveEdit">✓</button>
              <button class="btn-icon" @click="cancelEdit">✕</button>
            </template>
            <template v-else>
              <div class="sort-controls">
                <button 
                  class="btn-sort" 
                  @click="handleMove(engine.id, 'up')"
                  :disabled="!store.canMove(engine.id, 'up')"
                  title="上移"
                >↑</button>
                <button 
                  class="btn-sort" 
                  @click="handleMove(engine.id, 'down')"
                  :disabled="!store.canMove(engine.id, 'down')"
                  title="下移"
                >↓</button>
              </div>
              <span class="engine-name">
                {{ engine.name }}
                <span v-if="engine.isDefault" class="default-tag">默认</span>
              </span>
              <span class="engine-url" :title="engine.url">{{ truncateUrl(engine.url) }}</span>
              <button class="btn-icon" @click="startEdit(engine)">✏️</button>
              <button class="btn-icon delete" @click="handleDelete(engine.id)">🗑️</button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manager-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.manager {
  background-color: white;
  border-radius: 12px;
  width: 100%;
  max-width: 700px;
  max-height: 80vh;
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

.add-form h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 12px 0;
}

.form-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.input-name {
  width: 120px;
}

.input-url {
  flex: 1;
}

.input-query {
  flex: 1;
}

.form-row input {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}

.form-row input:focus {
  border-color: #3b82f6;
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

.engine-list h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 12px 0;
}

.empty-state {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  padding: 20px;
  background: #f8fafc;
  border-radius: 8px;
}

.engine-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 8px;
}

.engine-item.is-default {
  background: #fef3c7;
  border-color: #fbbf24;
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

.engine-name {
  flex: 1;
  font-size: 14px;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 8px;
}

.engine-url {
  font-size: 12px;
  color: #94a3b8;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.default-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: #fbbf24;
  color: white;
  border-radius: 4px;
}

.edit-input {
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 14px;
}

.edit-input.name {
  width: 100px;
}

.edit-input.url {
  flex: 1;
}

.edit-input.url.built-in-url {
  min-width: 250px;
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

.btn-icon.set-default:hover {
  color: #fbbf24;
}

.btn-reset {
  margin-bottom: 12px;
  padding: 6px 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.btn-reset:hover {
  background: #2563eb;
}
</style>
