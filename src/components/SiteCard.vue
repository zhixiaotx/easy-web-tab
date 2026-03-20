<script setup lang="ts">
import { ref } from 'vue'
import type { Site } from '../types'

const props = defineProps<{
  site: Site
  readonly?: boolean
}>()

const emit = defineEmits<{
  edit: [site: Site]
  delete: [url: string]
}>()

const isHovered = ref(false)

const getFavicon = (url: string) => {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  } catch {
    return ''
  }
}

// 三层降级：自定义 icon → Google Favicon → 默认 SVG
const handleIconError = (event: Event) => {
  const img = event.target as HTMLImageElement
  const fallbackUrl = (img.closest('.site-card') as HTMLElement)?.dataset.siteUrl || ''

  if (img.src !== getFavicon(fallbackUrl) && img.src !== '/default-icon.svg') {
    // 第一步：降级到 Google Favicon
    img.src = getFavicon(fallbackUrl)
  } else if (img.src !== '/default-icon.svg') {
    // 第二步：降级到本地默认 SVG
    img.src = '/default-icon.svg'
  }
}

const handleClick = () => {
  window.open(props.site.url, '_blank')
}
</script>

<template>
  <div
    class="site-card"
    :data-site-url="site.url"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @click="handleClick"
  >
    <div class="card-header">
      <img
        :src="site.icon || getFavicon(site.url)"
        :alt="site.name"
        class="favicon"
        loading="lazy"
        @error="handleIconError"
      />
      <div v-if="isHovered && !props.readonly" class="card-actions">
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
    <p class="site-desc">{{ site.description || '暂无描述' }}</p>
    <div class="site-tags">
      <span v-for="tag in site.tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
  </div>
</template>

<style scoped>
.site-card {
  background-color: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
              box-shadow 0.25s ease,
              border-color 0.25s ease;
  border: 1px solid #f1f5f9;
}

.site-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
  border-color: #e2e8f0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.favicon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  background-color: #f8fafc;
  transition: transform 0.2s ease;
}

.site-card:hover .favicon {
  transform: scale(1.05);
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

.site-name {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
}

.site-desc {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.site-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  padding: 3px 10px;
  background-color: #f1f5f9;
  border-radius: 12px;
  font-size: 12px;
  color: #64748b;
  transition: background-color 0.2s, color 0.2s;
}

.site-card:hover .tag {
  background-color: #e2e8f0;
}
</style>
