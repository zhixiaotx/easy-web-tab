<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Site } from '../types'
import { useUrlMetadata } from '../composables/useUrlMetadata'
import { useCategoriesStore } from '../stores/categories'
import { useSitesStore } from '../stores/sites'

const categoriesStore = useCategoriesStore()
const sitesStore = useSitesStore()

const props = defineProps<{
  site: Site | null
}>()

const emit = defineEmits<{
  save: [site: Site]
  close: []
}>()

const form = ref({
  name: '',
  url: '',
  description: '',
  category: 'other',
  tags: '',
  icon: '',
  sort: 0
})

const isEditing = computed(() => !!props.site)
const errors = ref<Record<string, string>>({})
const isLoading = ref(false)

// 标签自动补全
const tagInputRef = ref<HTMLInputElement | null>(null)
const tagQuery = ref('')
const showTagSuggestions = ref(false)

const { fetchMetadata } = useUrlMetadata()

// 过滤匹配的标签
const matchedTags = computed(() => {
  if (!tagQuery.value) return []
  const query = tagQuery.value.toLowerCase()
  // 获取已填写的标签
  const existingTags = form.value.tags.split(',').map(t => t.trim()).filter(Boolean)
  return sitesStore.allTags.filter(tag => 
    tag.toLowerCase().includes(query) && 
    !existingTags.includes(tag)
  ).slice(0, 8) // 最多显示8个
})

// 输入标签时更新查询
function handleTagInput(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.value
  form.value.tags = value
  
  // 获取最后一个逗号后的的内容作为查询
  const lastCommaIndex = value.lastIndexOf(',')
  tagQuery.value = lastCommaIndex >= 0 ? value.slice(lastCommaIndex + 1).trim() : value.trim()
  
  showTagSuggestions.value = tagQuery.value.length > 0 && matchedTags.value.length > 0
}

// 选择标签
function selectTag(tag: string) {
  const currentTags = form.value.tags
  const lastCommaIndex = currentTags.lastIndexOf(',')
  
  if (lastCommaIndex >= 0) {
    // 替换当前输入的部分
    form.value.tags = currentTags.slice(0, lastCommaIndex + 1) + tag + ', '
  } else {
    // 直接替换
    form.value.tags = tag + ', '
  }
  
  tagQuery.value = ''
  showTagSuggestions.value = false
  tagInputRef.value?.focus()
}

// 隐藏建议列表
function hideTagSuggestions() {
  setTimeout(() => {
    showTagSuggestions.value = false
  }, 150)
}

// 自动获取元数据
const handleFetchMetadata = async () => {
  if (!form.value.url.trim()) {
    errors.value.url = '请先输入网址'
    return
  }

  try {
    new URL(form.value.url)
  } catch {
    errors.value.url = '请输入有效的网址'
    return
  }

  // 重复检测（新增模式才检测，编辑模式跳过）
  const duplicate = !isEditing.value ? sitesStore.sites.find(s => s.url === form.value.url) : null

  isLoading.value = true
  if (!duplicate) {
    errors.value.url = ''
  } else {
    errors.value.url = `⚠️ 该网址已存在（${duplicate.name}），继续获取将覆盖现有条目`
  }

  const metadata = await fetchMetadata(form.value.url)

  if (metadata) {
    // 只有为空时才填充
    if (!form.value.name && metadata.title) {
      form.value.name = metadata.title
    }
    if (!form.value.description && metadata.description) {
      form.value.description = metadata.description
    }
    if (!form.value.icon && metadata.icon) {
      form.value.icon = metadata.icon
    }
  } else {
    errors.value.url = '无法获取网址信息，请手动填写'
  }

  isLoading.value = false
}

watch(() => props.site, (newSite) => {
  if (newSite) {
    form.value = {
      name: newSite.name,
      url: newSite.url,
      description: newSite.description || '',
      category: newSite.category || 'other',
      tags: newSite.tags.join(', '),
      icon: newSite.icon || '',
      sort: newSite.sort || 0
    }
  } else {
    // 新增时自动计算排序权重
    const maxSort = sitesStore.sites.reduce((max, s) => Math.max(max, s.sort || 0), 0)
    form.value = {
      name: '',
      url: '',
      description: '',
      category: 'other',
      tags: '',
      icon: '',
      sort: maxSort + 1
    }
  }
}, { immediate: true })

const validate = () => {
  errors.value = {}

  if (!form.value.name.trim()) {
    errors.value.name = '请输入网站名称'
  }

  if (!form.value.url.trim()) {
    errors.value.url = '请输入网站地址'
  } else {
    try {
      new URL(form.value.url)
    } catch {
      errors.value.url = '请输入有效的网址'
    }
  }

  return Object.keys(errors.value).length === 0
}

const handleSubmit = () => {
  if (!validate()) return

  const site: Site = {
    name: form.value.name.trim(),
    url: form.value.url.trim(),
    description: form.value.description.trim() || undefined,
    category: form.value.category,
    tags: form.value.tags.split(',').map(t => t.trim()).filter(Boolean),
    icon: form.value.icon.trim() || undefined,
    sort: form.value.sort || undefined
  }

  emit('save', site)
}
</script>

<template>
  <Transition name="modal">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal">
      <div class="modal-header">
        <h2>{{ isEditing ? '编辑网站' : '添加网站' }}</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <form class="modal-body" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>网站名称 *</label>
          <div v-if="isLoading && !form.name" class="skeleton skeleton-name"></div>
          <input
            v-else
            v-model="form.name"
            type="text"
            placeholder="例如：GitHub"
            :class="{ error: errors.name }"
          />
          <span v-if="errors.name" class="error-msg">{{ errors.name }}</span>
        </div>

        <div class="form-group">
          <label>网站地址 *</label>
          <div class="url-input-group">
            <input
              v-model="form.url"
              type="text"
              placeholder="例如：https://github.com"
              :class="{ error: errors.url }"
            />
            <button
              type="button"
              class="btn-fetch"
              :disabled="isLoading"
              @click="handleFetchMetadata"
            >
              <span v-if="isLoading" class="spinner"></span>
              {{ isLoading ? '获取中...' : '获取' }}
            </button>
          </div>
          <span v-if="errors.url" class="error-msg">{{ errors.url }}</span>
        </div>

        <div class="form-group">
          <label>网站描述</label>
          <div v-if="isLoading && !form.description" class="skeleton skeleton-desc"></div>
          <textarea
            v-else
            v-model="form.description"
            placeholder="简要描述这个网站..."
            rows="3"
          ></textarea>
        </div>

        <div class="form-group">
          <label>分类 *</label>
          <select v-model="form.category" class="category-select">
            <option v-for="cat in categoriesStore.allCategories" :key="cat.id" :value="cat.id">
              {{ cat.icon }} {{ cat.name }}
            </option>
          </select>
        </div>

        <div class="form-group tag-group">
          <label>标签</label>
          <div class="tag-input-wrapper">
            <input
              ref="tagInputRef"
              :value="form.tags"
              type="text"
              placeholder="输入标签，已有的标签会提示"
              @input="handleTagInput"
              @blur="hideTagSuggestions"
              @focus="tagQuery && (showTagSuggestions = matchedTags.length > 0)"
            />
            <div v-if="showTagSuggestions && matchedTags.length > 0" class="tag-suggestions">
              <span
                v-for="tag in matchedTags"
                :key="tag"
                class="tag-suggestion"
                @mousedown.prevent="selectTag(tag)"
              >
                {{ tag }}
              </span>
            </div>
          </div>
          <span class="form-hint">用逗号分隔，如：开发, 代码, 开源</span>
        </div>

        <div class="form-group">
          <label>图标地址</label>
          <div v-if="isLoading && !form.icon" class="skeleton skeleton-icon"></div>
          <input
            v-else
            v-model="form.icon"
            type="text"
            placeholder="可选，自定义图标 URL"
          />
        </div>

        <div class="form-group">
          <label>排序权重</label>
          <input
            v-model.number="form.sort"
            type="number"
            placeholder="数字越小越靠前"
          />
          <span class="form-hint">前台不显示此字段，仅用于排序</span>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
          <button type="submit" class="btn-submit">
            {{ isEditing ? '保存' : '添加' }}
          </button>
        </div>
      </form>
    </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

/* 骨架屏动画 */
@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton {
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border, #e2e8f0);
}

.skeleton-name {
  height: 18px;
  width: 60%;
  margin-bottom: 8px;
}

.skeleton-desc {
  height: 60px;
  width: 100%;
}

.skeleton-icon {
  height: 40px;
  width: 40px;
  flex-shrink: 0;
}

/* 按钮 spinner */
.btn-fetch .spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.modal {
  background-color: white;
  border-radius: 12px;
  width: 100%;
  max-width: 864px; /* 增加 80% (原 480px * 1.8) */
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
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

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
  background-color: white;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
  background-color: white;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #3b82f6;
}

.category-select {
  cursor: pointer;
}

.url-input-group {
  display: flex;
  gap: 8px;
}

.url-input-group input {
  flex: 1;
}

.btn-fetch {
  padding: 10px 16px;
  background-color: #10b981;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.btn-fetch:hover:not(:disabled) {
  background-color: #059669;
}

.btn-fetch:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
}

/* 标签输入组 */
.tag-group {
  position: relative;
}

.tag-input-wrapper {
  position: relative;
}

.tag-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
  padding: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.tag-suggestion {
  padding: 4px 10px;
  background: #f1f5f9;
  border-radius: 4px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.tag-suggestion:hover {
  background: #3b82f6;
  color: white;
}

.form-group input.error,
.form-group textarea.error {
  border-color: #ef4444;
}

.error-msg {
  display: block;
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
}

.form-hint {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
}

.btn-cancel {
  padding: 10px 20px;
  background-color: #f1f5f9;
  color: #64748b;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-cancel:hover {
  background-color: #e2e8f0;
}

.btn-submit {
  padding: 10px 24px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-submit:hover {
  background-color: #2563eb;
}

/* === Vue Transition 动画 === */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal {
  animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-leave-active .modal {
  animation: modal-out 0.2s ease forwards;
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes modal-out {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
}
</style>
