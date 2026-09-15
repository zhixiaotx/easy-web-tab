<template>
  <div class="ewt-card" @click="emit('edit')">
    <dl class="ewt-card-fields">
      <div v-for="f in visibleFields" :key="f.label" class="ewt-card-field">
        <dt class="ewt-card-label">{{ f.label }}</dt>
        <dd class="ewt-card-value" :class="{ 'ewt-emphasis': f.emphasis }">{{ display(f.value) }}</dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface CardField {
  label: string
  value?: string | number | null
  emphasis?: boolean
}

const props = defineProps<{ fields: CardField[]; maxFields?: number }>()
const emit = defineEmits<{ edit: [] }>()

// 卡片仅展示前几个关键字段，固定高度下更紧凑；其余字段在列表视图中查看。
const visibleFields = computed(() => {
  const n = props.maxFields ?? 4
  return props.fields.slice(0, n)
})

function display(v?: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}
</script>

<style scoped>
.ewt-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  box-sizing: border-box;
  height: 156px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.ewt-card:hover {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}
.ewt-card:active {
  transform: scale(0.99);
}
:global(html.dark) .ewt-card {
  background: var(--color-surface, #1f2937);
  border-color: var(--color-border, #374151);
}
.ewt-card-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.ewt-card-field {
  display: contents;
}
.ewt-card-label {
  font-size: 12px;
  color: var(--color-text-soft, #6b7280);
  white-space: nowrap;
}
.ewt-card-value {
  font-size: 13px;
  color: var(--color-text, #1f2937);
  word-break: break-word;
  margin: 0;
}
.ewt-card-value.ewt-emphasis {
  font-weight: 600;
  color: var(--color-primary, #3b82f6);
}
:global(html.dark) .ewt-card-value {
  color: var(--color-text, #e5e7eb);
}
</style>
