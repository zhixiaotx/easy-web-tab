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

const handleClick = () => {
  window.open(props.site.url, '_blank')
}
</script>

<template>
  <div
    class="site-card"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @click="handleClick"
  >
    <div class="card-header">
      <img
        :src="site.icon || getFavicon(site.url)"
        :alt="site.name"
        class="favicon"
        @error="($event.target as HTMLImageElement).src = '/default-icon.svg'"
      />
      <div v-if="isHovered && !props.readonly" class="card-actions">
        <button class="action-btn edit" @click.stop="emit('edit', site)">✏️</button>
        <button class="action-btn delete" @click.stop="emit('delete', site.url)">🗑️</button>
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
  transition: all 0.2s;
  border: 1px solid #f1f5f9;
}

.site-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
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
}

.card-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 14px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.action-btn:hover {
  opacity: 1;
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
}
</style>
