<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { Site } from '../types'
import { useUrlMetadata } from '../composables/useUrlMetadata'
import { useCategoriesStore } from '../stores/categories'
import { useSitesStore } from '../stores/sites'
import { PRESET_ICONS, findPresetIconByUrl, getIconPath, type PresetIcon } from '../composables/presetIcons'
import { getIconUrl } from '../composables/useIconCache'

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

// ===== 图标选择器状态 =====
const showIconPicker = ref(false)
const iconSearchQuery = ref('')
const iconManualInput = ref('')
const iconCategoryFilter = ref('all')

// ===== 游戏选择器状态 =====
const showGamePicker = ref(false)
const availableGames = ref<{ name: string; path: string; icon?: string }[]>([])

// 加载可用的游戏
async function loadAvailableGames() {
  // 游戏文件列表（手动维护或从接口获取）
  // 注意：路径末尾不要加 .html，serve 会重定向导致内容丢失
  const games = [
    { name: 'Tetris', path: '/games/tetris', icon: '🎮' },
    { name: '舒尔特方格', path: '/games/schulte-grid', icon: '🧩' }
  ]
  availableGames.value = games
}

// 选择游戏
function selectGame(game: { name: string; path: string; icon?: string }) {
  form.value.name = game.name
  form.value.url = game.path
  form.value.icon = game.icon || ''
  showGamePicker.value = false
}

// 所有分类
const iconCategories = computed(() => {
  const cats = new Set(PRESET_ICONS.map(i => i.category))
  return ['all', ...Array.from(cats)]
})

// 分类显示名称
const categoryLabels: Record<string, string> = {
  all: '全部',
  '社交与社区': '社交',
  '国内常用网站': '国内常用',
  '工具与开发': '开发工具',
  '前端技术': '前端',
  '后端与数据库': '后端/数据库',
  '云服务与平台': '云平台',
  '大模型与 AI': 'AI',
  '视频与媒体': '视频',
  '其他': '其他',
}

// 过滤后的预置图标
const filteredPresetIcons = computed(() => {
  let icons = PRESET_ICONS
  // 分类过滤
  if (iconCategoryFilter.value !== 'all') {
    icons = icons.filter(i => i.category === iconCategoryFilter.value)
  }
  // 搜索过滤
  const query = iconSearchQuery.value.toLowerCase().trim()
  if (query) {
    icons = icons.filter(icon =>
      icon.label.toLowerCase().includes(query) ||
      icon.name.toLowerCase().includes(query) ||
      (icon.url && icon.url.toLowerCase().includes(query))
    )
  }
  return icons
})

// 获取图标的显示 URL（优先 form.icon，其次自动检测 URL）
const iconDisplaySrc = computed(() => {
  if (form.value.icon) return form.value.icon
  if (form.value.url) {
    try {
      new URL(form.value.url)
      return getIconUrl(form.value.url)
    } catch {
      return ''
    }
  }
  return ''
})

// 自动获取图标（从已填 URL）
async function handleAutoFetchIcon() {
  if (!form.value.url.trim()) {
    errors.value.icon = '请先输入网址'
    return
  }
  try {
    new URL(form.value.url)
  } catch {
    errors.value.icon = '请输入有效的网址'
    return
  }
  errors.value.icon = ''
  isLoading.value = true
  const { fetchMetadata } = useUrlMetadata()
  const metadata = await fetchMetadata(form.value.url)
  isLoading.value = false
  if (metadata?.icon) {
    form.value.icon = metadata.icon
    iconManualInput.value = ''
  } else {
    errors.value.icon = '未找到图标，请手动选择或输入'
  }
}

// 选择预置图标
function selectPresetIcon(icon: PresetIcon) {
  form.value.icon = `/icons/${icon.name}.${icon.ext}`
  iconManualInput.value = ''
  showIconPicker.value = false
  iconSearchQuery.value = ''
}

// 手动输入图标 URL
function applyManualIcon() {
  if (iconManualInput.value.trim()) {
    form.value.icon = iconManualInput.value.trim()
    showIconPicker.value = false
  }
}

// 清除图标
function clearIcon() {
  form.value.icon = ''
  iconManualInput.value = ''
  errors.value.icon = ''
}

// 根据 URL 自动推荐预置图标
const suggestedPresetIcon = computed(() => {
  if (!form.value.url) return null
  return findPresetIconByUrl(form.value.url)
})

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
      sort: newSite.sort || 1
    }
  } else {
    // 新增时默认 sort=1，点击后自动增加
    form.value = {
      name: '',
      url: '',
      description: '',
      category: 'other',
      tags: '',
      icon: '',
      sort: 1
    }
  }
}, { immediate: true })

// 检查是否为有效的 URL（支持 http/https 或本地路径）
const isValidUrl = (url: string): boolean => {
  if (!url.trim()) return false
  // 支持 http://, https:// 或 /games/ 等本地路径
  if (url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://')) {
    return true
  }
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

const validate = () => {
  errors.value = {}

  if (!form.value.name.trim()) {
    errors.value.name = '请输入网站名称'
  }

  if (!form.value.url.trim()) {
    errors.value.url = '请输入网站地址'
  } else if (!isValidUrl(form.value.url)) {
    errors.value.url = '请输入有效的网址'
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
              placeholder="例如：https://github.com 或 /games/tetris.html"
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
            <button
              type="button"
              class="btn-game-picker"
              @click="showGamePicker = !showGamePicker; loadAvailableGames()"
            >
              🎮 选择游戏
            </button>
          </div>
          <div v-if="showGamePicker" class="game-picker">
            <div class="game-list">
              <button
                v-for="game in availableGames"
                :key="game.path"
                type="button"
                class="game-item"
                @click="selectGame(game)"
              >
                <span class="game-icon">{{ game.icon }}</span>
                <span class="game-name">{{ game.name }}</span>
              </button>
            </div>
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
          <label>网站图标</label>

          <!-- 图标预览 + 操作按钮 -->
          <div class="icon-picker">
            <!-- 预览 -->
            <div class="icon-preview-wrapper">
              <img
                v-if="iconDisplaySrc"
                :src="iconDisplaySrc"
                class="icon-preview"
                alt="图标预览"
                @error="e => (e.target as HTMLImageElement).src = '/default-icon.svg'"
              />
              <div v-else class="icon-preview icon-preview-empty">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              </div>
              <div v-if="form.icon" class="icon-path" :title="form.icon">{{ form.icon }}</div>
            </div>

            <!-- 操作按钮 -->
            <div class="icon-actions">
              <button type="button" class="btn-icon-action" @click="handleAutoFetchIcon" :disabled="isLoading" title="从网址获取">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.86 6.69 2.3"/><path d="M21 3v6h-6"/></svg>
                自动获取
              </button>
              <button type="button" class="btn-icon-action" @click="showIconPicker = !showIconPicker" title="选择图标">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
                {{ showIconPicker ? '收起' : '选择图标' }}
              </button>
              <button v-if="form.icon" type="button" class="btn-icon-action btn-icon-clear" @click="clearIcon" title="清除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <!-- 预置图标推荐 -->
            <div v-if="suggestedPresetIcon && !form.icon" class="icon-suggestion">
              <span>检测到：</span>
              <button type="button" class="btn-suggestion" @click="selectPresetIcon(suggestedPresetIcon)">
                <img :src="getIconPath(suggestedPresetIcon)" class="suggestion-icon" alt="" />
                {{ suggestedPresetIcon.label }}
              </button>
            </div>
          </div>

          <!-- 图标选择面板 -->
          <div v-if="showIconPicker" class="icon-picker-panel">
            <!-- 搜索框 -->
            <div class="icon-picker-search">
              <input
                v-model="iconSearchQuery"
                type="text"
                placeholder="搜索图标..."
                class="icon-search-input"
              />
            </div>

            <!-- 分类过滤 -->
            <div class="icon-category-tabs">
              <button
                v-for="cat in iconCategories"
                :key="cat"
                type="button"
                class="icon-category-tab"
                :class="{ active: iconCategoryFilter === cat }"
                @click="iconCategoryFilter = cat"
              >
                {{ categoryLabels[cat] || cat }}
              </button>
            </div>

            <!-- 预置图标网格 -->
            <div class="icon-grid">
              <button
                v-for="icon in filteredPresetIcons"
                :key="icon.name"
                type="button"
                class="icon-grid-item"
                :class="{ active: form.icon === `/icons/${icon.name}.${icon.ext}` }"
                :title="icon.label"
                @click="selectPresetIcon(icon)"
              >
                <img :src="`/icons/${icon.name}.${icon.ext}`" :alt="icon.label" class="grid-icon-img" />
                <span class="grid-icon-label">{{ icon.label }}</span>
              </button>
            </div>

            <!-- 手动输入 -->
            <div class="icon-manual-input">
              <input
                v-model="iconManualInput"
                type="text"
                placeholder="或输入图标 URL..."
                class="icon-url-input"
                @keyup.enter="applyManualIcon"
              />
              <button type="button" class="btn-apply-icon" @click="applyManualIcon" :disabled="!iconManualInput.trim()">应用</button>
            </div>

            <span v-if="errors.icon" class="error-msg">{{ errors.icon }}</span>
          </div>

          <span v-if="!showIconPicker && !form.icon" class="form-hint">可选，点击「自动获取」或「选择图标」</span>
        </div>

        <!-- 排序权重 - 已改为点击频率自动排序，此处隐藏 -->
        <!-- 
        <div class="form-group">
          <label>排序权重</label>
          <input
            v-model.number="form.sort"
            type="number"
            placeholder="数字越小越靠前"
          />
          <span class="form-hint">前台不显示此字段，仅用于排序</span>
        </div>
        -->

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

.btn-game-picker {
  padding: 10px 16px;
  background-color: #8b5cf6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.btn-game-picker:hover {
  background-color: #7c3aed;
}

/* 游戏选择器 */
.game-picker {
  margin-top: 8px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.game-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.game-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.game-item:hover {
  background: #f0f9ff;
  border-color: #8b5cf6;
}

.game-icon {
  font-size: 16px;
}

.game-name {
  font-size: 14px;
  color: #1e293b;
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

/* ========================================
   图标选择器
   ======================================== */

.icon-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.icon-preview-wrapper {
  display: flex;
  align-items: center;
}

.icon-preview {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-hover, #f1f5f9);
}

.icon-path {
  margin-left: 8px;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  word-break: break-all;
}

.icon-preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted, #94a3b8);
}

.icon-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-icon-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  background: white;
  color: var(--color-text-secondary, #64748b);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-icon-action:hover:not(:disabled) {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
}

.btn-icon-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon-clear {
  padding: 6px 8px;
  color: var(--color-text-muted, #94a3b8);
  border-color: transparent;
}

.btn-icon-clear:hover {
  color: var(--color-error, #ef4444);
  border-color: transparent;
  background: #fef2f2;
}

.icon-suggestion {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

.btn-suggestion {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--color-primary, #3b82f6);
  border-radius: 6px;
  background: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-suggestion:hover {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.suggestion-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

/* 图标选择面板 */
.icon-picker-panel {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  padding: 14px;
  background: var(--color-bg-hover, #f8fafc);
  margin-top: 4px;
  animation: dropdownIn 0.15s ease;
}

.icon-picker-search {
  margin-bottom: 12px;
}

.icon-search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  background: white;
}

.icon-search-input:focus {
  border-color: var(--color-primary, #3b82f6);
}

/* 分类标签 */
.icon-category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.icon-category-tab {
  padding: 4px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 16px;
  background: white;
  color: var(--color-text-secondary, #64748b);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.icon-category-tab:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.icon-category-tab.active {
  background: var(--color-primary, #3b82f6);
  color: white;
  border-color: var(--color-primary, #3b82f6);
}

/* 图标网格 */
.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.icon-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border: 1.5px solid transparent;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  transition: all 0.15s;
}

.icon-grid-item:hover {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
}

.icon-grid-item.active {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-light, #eff6ff);
}

.grid-icon-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.grid-icon-label {
  font-size: 11px;
  color: var(--color-text-secondary, #64748b);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.icon-grid-item.active .grid-icon-label {
  color: var(--color-primary, #3b82f6);
}

/* 手动输入 */
.icon-manual-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.icon-url-input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
  background: white;
}

.icon-url-input:focus {
  border-color: var(--color-primary, #3b82f6);
}

.btn-apply-icon {
  padding: 7px 14px;
  border: none;
  border-radius: 6px;
  background: var(--color-primary, #3b82f6);
  color: white;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s;
  white-space: nowrap;
}

.btn-apply-icon:hover:not(:disabled) {
  background: var(--color-primary-hover, #2563eb);
}

.btn-apply-icon:disabled {
  background: var(--color-text-muted, #94a3b8);
  cursor: not-allowed;
}

@keyframes dropdownIn {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
