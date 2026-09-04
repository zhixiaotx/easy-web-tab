<script setup lang="ts">
// 工作台全局搜索浮层（Alt+K / 侧栏底部按钮打开）。
// 搜索纯逻辑 100% 委托 spotlightCore.searchAll（组件禁止内联过滤/排序）；
// 密码类结果仅按 siteName/url 命中（core 契约），本组件绝不展示密码明文。
// 键盘：↑/↓ 移动选中、Enter 选中跳转、Esc 关闭（监听 window keydown，输入框内同样生效）。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '@/components/Icon.vue'
import { searchAll } from '@/composables/spotlightCore'
import type { SpotlightData, SpotlightLedgerHit } from '@/composables/spotlightCore'
import type { Countdown, PasswordEntry, Site, WorkbenchNote, WorkbenchTodo } from '@/types'

// 选中结果后的动作：navigate=跳转工作台面板；password=密码库（解锁后跳转密码面板）；site=新窗口打开网址
export type SpotlightAction =
  | { kind: 'navigate'; section: string }
  | { kind: 'password' }
  | { kind: 'site'; url: string }

const props = defineProps<{ data: SpotlightData }>()
const emit = defineEmits<{ select: [action: SpotlightAction]; close: [] }>()

const query = ref('')
const activeIndex = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLDivElement | null>(null)

// 分组渲染顺序 + 中文标签（与 SpotlightGroups 键一一对应）
const GROUP_ORDER = ['todos', 'notes', 'countdowns', 'ledger', 'passwords', 'sites'] as const
type GroupKey = (typeof GROUP_ORDER)[number]

const GROUP_LABELS: Record<GroupKey, string> = {
  todos: '待办',
  notes: '便签',
  countdowns: '倒计时',
  ledger: '记账',
  passwords: '密码',
  sites: '网址'
}

// 扁平结果项：键盘上下移动只需遍历此数组（行渲染由 rows 承担分组头）
interface SpotlightResultItem {
  testId: string // sp-result-<group>-<id>
  group: GroupKey
  title: string
  sub?: string
  action: SpotlightAction
}

// 渲染行：分组标题行 / 结果项行（index 为扁平序号，供键盘移动与滚动定位）
type SpotlightRow =
  | { type: 'header'; key: string; label: string }
  | { type: 'item'; key: string; item: SpotlightResultItem; index: number }

/** 各类结果 → 扁平展示项（测试标识/标题/副标题/动作）。site 无 id 字段，用 url 作唯一键。 */
function buildGroupItems(group: GroupKey, list: unknown): SpotlightResultItem[] {
  switch (group) {
    case 'todos':
      return (list as WorkbenchTodo[]).map(t => ({
        testId: `sp-result-todo-${t.id}`,
        group,
        title: t.title,
        sub: t.description,
        action: { kind: 'navigate', section: 'todos' }
      }))
    case 'notes':
      return (list as WorkbenchNote[]).map(n => ({
        testId: `sp-result-note-${n.id}`,
        group,
        title: n.title || n.content,
        sub: n.title ? n.content : undefined,
        action: { kind: 'navigate', section: 'notes' }
      }))
    case 'countdowns':
      return (list as Countdown[]).map(c => ({
        testId: `sp-result-countdown-${c.id}`,
        group,
        title: c.name,
        sub: c.endDateTime.replace('T', ' '),
        action: { kind: 'navigate', section: 'countdowns' }
      }))
    case 'ledger':
      return (list as SpotlightLedgerHit[]).map(h =>
        h.kind === 'category'
          ? {
              testId: `sp-result-ledger-category-${h.category.id}`,
              group,
              title: h.category.name,
              sub: h.category.type === 'income' ? '收入分类' : '支出分类',
              action: { kind: 'navigate', section: 'ledger' }
            }
          : {
              testId: `sp-result-ledger-entry-${h.entry.id}`,
              group,
              title: h.entry.note || '记账记录',
              sub: `${h.entry.date} 记账`,
              action: { kind: 'navigate', section: 'ledger' }
            }
      )
    case 'passwords':
      return (list as PasswordEntry[]).map(p => ({
        testId: `sp-result-password-${p.id}`,
        group,
        title: p.siteName,
        sub: p.url,
        action: { kind: 'password' }
      }))
    case 'sites':
      return (list as Site[]).map(s => ({
        testId: `sp-result-site-${s.url}`,
        group,
        title: s.name,
        sub: s.url,
        action: { kind: 'site', url: s.url }
      }))
  }
}

const results = computed(() => searchAll(query.value, props.data))

const rows = computed<SpotlightRow[]>(() => {
  const out: SpotlightRow[] = []
  let idx = 0
  for (const group of GROUP_ORDER) {
    const items = buildGroupItems(group, results.value[group])
    if (items.length === 0) continue
    out.push({ type: 'header', key: group, label: GROUP_LABELS[group] })
    for (const item of items) {
      out.push({ type: 'item', key: item.testId, item, index: idx++ })
    }
  }
  return out
})

const itemCount = computed(() => rows.value.filter(r => r.type === 'item').length)

// ==================== 键盘 / 鼠标交互 ====================

function scrollActiveIntoView() {
  resultsRef.value?.querySelector(`[data-index="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' })
}

function move(dir: number) {
  if (itemCount.value === 0) return
  if (activeIndex.value === -1) {
    activeIndex.value = dir === 1 ? 0 : itemCount.value - 1
  } else {
    activeIndex.value = (activeIndex.value + dir + itemCount.value) % itemCount.value
  }
  scrollActiveIntoView()
}

function selectActive() {
  const row = rows.value.find(r => r.type === 'item' && r.index === activeIndex.value)
  if (row && row.type === 'item') emit('select', row.item.action)
}

function selectAt(index: number) {
  const row = rows.value.find(r => r.type === 'item' && r.index === index)
  if (row && row.type === 'item') emit('select', row.item.action)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    selectActive()
  }
}

onMounted(() => {
  inputRef.value?.focus()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// 查询变化 → 结果重建，旧选中序号失效
watch(query, () => {
  activeIndex.value = -1
})
</script>

<template>
  <div class="sp-overlay" data-testid="sp-overlay" @click.self="emit('close')">
    <div class="sp-panel" role="dialog" aria-modal="true" aria-label="全局搜索">
      <div class="sp-search">
        <Icon name="search" :size="18" class="sp-search-icon" />
        <input
          ref="inputRef"
          v-model="query"
          class="sp-input"
          data-testid="sp-input"
          type="text"
          placeholder="搜索待办、便签、倒计时、记账、密码、网址…（↑↓ 选择 / Enter 跳转 / Esc 关闭）"
          spellcheck="false"
        />
        <button class="sp-close-btn" data-testid="sp-close" title="关闭 (Esc)" @click="emit('close')"><Icon name="close" /></button>
      </div>

      <div v-if="query.trim() === ''" class="sp-hint">输入关键词，跨工作台全局搜索</div>
      <div v-else-if="itemCount === 0" class="sp-empty" data-testid="sp-empty">
        未找到「{{ query.trim() }}」相关结果
      </div>
      <div v-else ref="resultsRef" class="sp-results">
        <template v-for="row in rows" :key="row.type === 'header' ? `h-${row.key}` : `i-${row.key}`">
          <div v-if="row.type === 'header'" class="sp-group">{{ row.label }}</div>
          <button
            v-else
            class="sp-result"
            :class="{ active: row.index === activeIndex }"
            :data-testid="row.item.testId"
            :data-index="row.index"
            @click="selectAt(row.index)"
            @mouseenter="activeIndex = row.index"
          >
            <span class="sp-result-title">{{ row.item.title }}</span>
            <span v-if="row.item.sub" class="sp-result-sub">{{ row.item.sub }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  background-color: rgba(15, 23, 42, 0.45);
}

.sp-panel {
  width: min(600px, 100%);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 0 24px 64px rgba(2, 6, 23, 0.35);
}

.sp-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.sp-search-icon {
  flex-shrink: 0;
  color: var(--color-text-secondary, #64748b);
}

.sp-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--color-text, #1e293b);
}

.sp-input::placeholder {
  color: var(--color-text-secondary, #64748b);
}

.sp-close-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.sp-close-btn:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text, #1e293b);
}

.sp-hint,
.sp-empty {
  padding: 28px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
}

.sp-results {
  overflow-y: auto;
  padding: 8px;
}

.sp-group {
  padding: 8px 12px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}

.sp-result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s;
}

.sp-result:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}

.sp-result.active {
  background-color: var(--color-primary-light, #eff6ff);
}

.sp-result-title {
  font-size: 14px;
  color: var(--color-text, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-result-sub {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 暗色模式覆盖（跟随 WorkbenchView dark 变量模式） */
html.dark .sp-overlay {
  background-color: rgba(2, 6, 23, 0.6);
}

html.dark .sp-panel {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
}

html.dark .sp-search {
  border-bottom-color: var(--color-border, #374151);
}

html.dark .sp-search-icon,
html.dark .sp-input::placeholder {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .sp-input {
  color: var(--color-text, #f9fafb);
}

html.dark .sp-close-btn:hover {
  background-color: var(--color-bg-hover, #374151);
  color: var(--color-text, #f9fafb);
}

html.dark .sp-hint,
html.dark .sp-empty,
html.dark .sp-group,
html.dark .sp-result-sub {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .sp-result:hover {
  background-color: var(--color-bg-hover, #374151);
}

html.dark .sp-result.active {
  background-color: #1e3a5f;
}

html.dark .sp-result-title {
  color: var(--color-text, #f9fafb);
}
</style>
