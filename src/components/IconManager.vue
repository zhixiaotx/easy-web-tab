<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useIconsStore, type MergedIcon, type CustomIcon, type IconExportData } from '@/stores/icons'
import { PRESET_ICONS, type PresetIcon } from '@/composables/presetIcons'

const emit = defineEmits<{
  close: []
}>()

const store = useIconsStore()

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

// 上传
const fileInput = ref<HTMLInputElement | null>(null)
const MAX_SIZE = 500 * 1024 // 500KB

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > MAX_SIZE) {
    alert('图标文件不能超过 500KB')
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    const name = prompt('请输入图标名称', file.name.replace(/\.[^.]+$/, ''))
    if (!name || !name.trim()) {
      input.value = ''
      return
    }

    store.addIcon({
      name: name.trim(),
      label: name.trim(),
      dataUrl,
      category: activeCategory.value === '全部' ? '其他' : activeCategory.value
    })
    input.value = ''
  }
  reader.readAsDataURL(file)
}

// 搜索
const searchQuery = ref('')

// 分类过滤
const CATEGORIES = computed(() => {
  const presetCategories = [...new Set(PRESET_ICONS.map(icon => icon.category))]
  return ['全部', '自定义图标', ...presetCategories]
})

const activeCategory = ref('全部')

// 过滤后的图标列表
const filteredIcons = computed(() => {
  let icons: MergedIcon[]

  if (searchQuery.value.trim()) {
    icons = store.searchIcons(searchQuery.value.trim())
  } else if (activeCategory.value === '自定义图标') {
    icons = store.customIcons.map(icon => ({ ...icon, isCustom: true as const }))
  } else if (activeCategory.value !== '全部') {
    icons = store.getIconsByCategory(activeCategory.value)
  } else {
    icons = store.allIcons
  }

  return icons
})

// 内联编辑
const editingId = ref<string | null>(null)
const editingLabel = ref('')

function startEdit(icon: MergedIcon) {
  editingId.value = 'isCustom' in icon && icon.isCustom ? icon.id : null
  editingLabel.value = icon.label
}

function saveEdit() {
  if (!editingId.value || !editingLabel.value.trim()) return
  store.updateIcon(editingId.value, { label: editingLabel.value.trim() })
  cancelEdit()
}

function cancelEdit() {
  editingId.value = null
  editingLabel.value = ''
}

// 删除
function handleDelete(iconId: string) {
  if (confirm('确定删除该图标？')) {
    store.deleteIcon(iconId)
    if (editingId.value === iconId) {
      cancelEdit()
    }
  }
}

// 导出
function handleExport() {
  const data: IconExportData = store.exportIcons()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `icons-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 导入
const importInput = ref<HTMLInputElement | null>(null)

function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string) as IconExportData
      if (data.version !== 1 || !Array.isArray(data.icons)) {
        alert('导入文件格式不正确')
        return
      }
      store.importIcons(data)
    } catch {
      alert('导入文件解析失败')
    }
    input.value = ''
  }
  reader.readAsText(file)
}

// 获取图标预览 src
function getIconSrc(icon: MergedIcon): string {
  if ('isCustom' in icon && icon.isCustom) {
    return (icon as CustomIcon & { isCustom: true }).dataUrl
  }
  const preset = icon as PresetIcon
  return `/icons/${preset.name}.${preset.ext}`
}

// 判断是否为自定义图标
function isCustom(icon: MergedIcon): icon is CustomIcon & { isCustom: true } {
  return 'isCustom' in icon && icon.isCustom
}

// 获取图标 ID（用于模板 v-for key 和操作）
function getIconId(icon: MergedIcon): string {
  return isCustom(icon) ? icon.id : (icon as PresetIcon).name
}
</script>

<template>
  <div class="manager-overlay" @click.self="emit('close')">
    <div class="manager">
      <div class="manager-header">
        <h2>🎨 图标管理</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <div class="manager-body">
        <!-- 导入/导出 -->
        <div class="import-export-bar">
          <input
            ref="importInput"
            type="file"
            accept=".json"
            class="hidden-file-input"
            @change="handleImport"
          />
          <button class="btn-secondary" @click="importInput?.click()">
            📥 导入
          </button>
          <button class="btn-secondary" @click="handleExport">
            📤 导出
          </button>
          <span class="import-export-hint">
            自定义图标: {{ store.customIcons.length }} 个
          </span>
        </div>

        <!-- 上传区域 -->
        <div class="add-form">
          <h3>上传图标</h3>
          <div class="add-form-row">
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden-file-input"
              @change="handleUpload"
            />
            <button class="btn-add" @click="fileInput?.click()">
              📁 选择文件
            </button>
            <span class="upload-hint">支持 PNG/SVG/GIF，最大 500KB</span>
          </div>
        </div>

        <!-- 搜索 + 分类过滤 -->
        <div class="filter-bar">
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="🔍 搜索图标名称..."
          />
        </div>

        <div class="category-tabs">
          <button
            v-for="cat in CATEGORIES"
            :key="cat"
            class="category-tab"
            :class="{ active: activeCategory === cat }"
            @click="activeCategory = cat"
          >
            {{ cat }}
          </button>
        </div>

        <!-- 图标网格 -->
        <div class="icon-manager-grid">
          <div
            v-for="icon in filteredIcons"
            :key="getIconId(icon)"
            class="icon-manager-item"
            :class="{ 'built-in': !isCustom(icon), custom: isCustom(icon) }"
          >
            <!-- 编辑模式 -->
            <template v-if="isCustom(icon) && editingId === getIconId(icon)">
              <div class="icon-manager-preview">
                <img :src="getIconSrc(icon)" :alt="icon.label" />
              </div>
              <input
                v-model="editingLabel"
                type="text"
                class="edit-input"
                @keyup.enter="saveEdit"
                @keyup.escape="cancelEdit"
              />
              <div class="icon-manager-meta">
                <span class="icon-manager-category">{{ icon.category }}</span>
              </div>
              <div class="icon-manager-actions">
                <button class="btn-icon" @click="saveEdit">✓</button>
                <button class="btn-icon" @click="cancelEdit">✕</button>
              </div>
            </template>

            <!-- 显示模式 -->
            <template v-else>
              <div class="icon-manager-preview">
                <img :src="getIconSrc(icon)" :alt="icon.label" />
              </div>
              <span class="icon-manager-label" :title="icon.label">{{ icon.label }}</span>
              <div class="icon-manager-meta">
                <span class="icon-manager-category">{{ icon.category }}</span>
                <span v-if="isCustom(icon)" class="icon-manager-size">
                  {{ Math.round(('dataUrl' in icon ? (icon as { dataUrl: string }).dataUrl.length : 0) * 0.75 / 1024) }}KB
                </span>
              </div>
              <div v-if="isCustom(icon)" class="icon-manager-actions">
                <button class="btn-icon" @click="startEdit(icon)" title="编辑">✏️</button>
                <button class="btn-icon delete" @click="handleDelete(getIconId(icon))" title="删除">🗑️</button>
              </div>
            </template>
          </div>
        </div>

        <div v-if="filteredIcons.length === 0" class="empty-custom">
          {{ searchQuery ? '未找到匹配的图标' : '暂无图标' }}
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
  z-index: 200;
  padding: 20px;
}

.manager {
  background-color: white;
  border-radius: 12px;
  width: 100%;
  max-width: var(--dlg-w-icon, 900px);
  max-height: var(--dlg-h-icon, 80vh);
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
  z-index: 1;
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

/* 上传区域 */
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

.add-form-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.hidden-file-input {
  display: none;
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

.btn-add:hover {
  background-color: #2563eb;
}

.upload-hint {
  font-size: 12px;
  color: #94a3b8;
}

/* 搜索 + 过滤 */
.filter-bar {
  margin-bottom: 12px;
}

.search-input {
  width: 100%;
  padding: 10px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* 分类选项卡 */
.category-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.category-tab {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.category-tab:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.category-tab.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: white;
}

/* 图标网格 */
.icon-manager-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.icon-manager-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  transition: all 0.2s;
}

.icon-manager-item.custom {
  background: white;
}

.icon-manager-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.icon-manager-item.built-in {
  opacity: 0.6;
}

.icon-manager-preview {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  border-radius: 8px;
  overflow: hidden;
  background: #f1f5f9;
}

.icon-manager-preview img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.icon-manager-label {
  font-size: 12px;
  color: #1e293b;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.icon-manager-meta {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-top: 4px;
}

.icon-manager-category {
  font-size: 10px;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 10px;
}

.icon-manager-size {
  font-size: 10px;
  color: #94a3b8;
}

.icon-manager-actions {
  display: flex;
  gap: 2px;
  margin-top: 6px;
}

/* 编辑输入 */
.edit-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
  margin-bottom: 4px;
}

.edit-input:focus {
  border-color: #3b82f6;
  outline: none;
}

/* 按钮 */
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

.btn-secondary {
  padding: 8px 16px;
  background-color: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-secondary:hover {
  background-color: #e2e8f0;
  border-color: #cbd5e1;
}

/* 导入导出 */
.import-export-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 20px;
  border-top: 1px solid #f1f5f9;
}

.import-export-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-left: auto;
}

/* 空状态 */
.empty-custom {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  padding: 40px 20px;
}
</style>
