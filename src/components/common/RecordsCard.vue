<template>
  <div class="ewt-card">
    <dl class="ewt-card-fields">
      <div v-for="f in fields" :key="f.label" class="ewt-card-field">
        <dt class="ewt-card-label">{{ f.label }}</dt>
        <dd class="ewt-card-value" :class="{ 'ewt-emphasis': f.emphasis }">{{ display(f.value) }}</dd>
      </div>
    </dl>
    <div v-if="$slots.actions" class="ewt-card-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
export interface CardField {
  label: string
  value?: string | number | null
  emphasis?: boolean
}

defineProps<{ fields: CardField[] }>()

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
.ewt-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border, #e5e7eb);
}
</style>
