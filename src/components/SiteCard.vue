<script setup lang="ts">
import { ref } from 'vue'
import type { Site } from '../types'
import { getFaviconImgSrc, getIconUrl } from '../composables/useIconCache'
import { useSitesStore } from '../stores/sites'

const props = defineProps<{
  site: Site
  readonly?: boolean
  isDragOver?: boolean
  isDragging?: boolean
}>()

const emit = defineEmits<{
  edit: [site: Site]
  delete: [url: string]
  unmark: [url: string]
}>()

const sitesStore = useSitesStore()
const isHovered = ref(false)

// 四层降级：自定义 icon → 本地缓存 → Google Favicon → 默认 SVG
const handleIconError = (event: Event) => {
  const img = event.target as HTMLImageElement
  const siteUrl = (img.closest('.site-card') as HTMLElement)?.dataset.siteUrl || ''
  const googleUrl = getIconUrl(siteUrl)

  if (img.src !== googleUrl && img.src !== '/default-icon.svg') {
    img.src = googleUrl
  } else if (img.src !== '/default-icon.svg') {
    img.src = '/default-icon.svg'
  }
}

const handleClick = () => {
  // 记录点击次数（使用频率排序）
  sitesStore.incrementClick(props.site.url)
  window.open(props.site.url, '_blank')
}
</script>

<template>
  <div
    class="site-card"
    :class="{ 'is-drag-over': props.isDragOver, 'is-dragging': props.isDragging }"
    :data-site-url="site.url"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @click="handleClick"
  >
    <div class="card-header">
      <div class="favicon-wrapper">
        <img
          :src="getFaviconImgSrc(site.url, site.icon)"
          :alt="site.name"
          class="favicon"
          loading="lazy"
          @error="handleIconError"
        />
      </div>
      <div v-if="site.isValid === false" class="invalid-badge" title="链接已失效">
        ⚠️
      </div>
      <div v-if="isHovered && !props.readonly" class="card-actions">
        <button v-if="site.isValid === false" class="action-btn unmark" @click.stop="emit('unmark', site.url)" title="取消失效标记">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </button>
        <button class="action-btn edit" @click.stop="emit('edit', site)" title="编辑">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="action-btn delete" @click.stop="emit('delete', site.url)" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>
    <h3 class="site-name">{{ site.name }}</h3>
  </div>
</template>

<style scoped>
.site-card {
  background-color: white;
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  position: relative;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.25s ease,
              border-color 0.25s ease,
              opacity 0.15s ease;
}

.site-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  border-color: #e2e8f0;
}

.site-card.is-dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.site-card.is-drag-over {
  border-color: #3b82f6;
  border-style: dashed;
  transform: scale(1.02);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.card-header {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 10px;
  position: relative;
}

.favicon-wrapper {
  position: relative;
  display: inline-flex;
}

.favicon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  background-color: #f8fafc;
  transition: transform 0.2s ease;
}

.site-card:hover .favicon {
  transform: scale(1.08);
}

.invalid-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  font-size: 16px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.card-actions {
  display: flex;
  gap: 4px;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 14px;
  opacity: 0.5;
  transition: opacity 0.2s, color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.action-btn:hover {
  opacity: 1;
}

.action-btn.edit {
  color: #3b82f6;
}

.action-btn.edit:hover {
  background-color: #eff6ff;
}

.action-btn.delete:hover {
  color: #ef4444;
  background-color: #fef2f2;
}

.action-btn.unmark {
  color: #10b981;
}

.action-btn.unmark:hover {
  background-color: #ecfdf5;
}

.site-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.invalid-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: 14px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.card-actions {
  position: absolute;
  top: -8px;
  right: -8px;
  display: flex;
  gap: 2px;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.action-btn {
  background: white;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  padding: 3px;
  font-size: 12px;
  opacity: 0.9;
  transition: opacity 0.2s, color 0.2s, background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.action-btn:hover {
  opacity: 1;
}

.action-btn.edit {
  color: #3b82f6;
}

.action-btn.edit:hover {
  background-color: #eff6ff;
}

.action-btn.delete:hover {
  color: #ef4444;
  background-color: #fef2f2;
}

.action-btn.unmark {
  color: #10b981;
}

.action-btn.unmark:hover {
  background-color: #ecfdf5;
}
</style>
