<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useThemeStore, THEMES, type ThemeAccent } from '../stores/theme'

const themeStore = useThemeStore()
const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const activeIndex = ref(0)

// accent → 真实色（与 themes.css 保持一致，用于色点预览）
const accentColor: Record<string, string> = {
  blue: '#3b82f6',
  brown: '#a47551',
  pink: '#ec4899',
  green: '#22c55e',
  purple: '#8b5cf6',
  red: '#c8102e',
  gray: '#6c7a8c',
  system: '#94a3b8'
}
const dotColor = (accent: ThemeAccent | null) => accentColor[accent ?? 'system']
const currentTheme = computed(() => themeStore.currentTheme)

function setExpanded(v: boolean) {
  triggerRef.value?.setAttribute('aria-expanded', String(v))
}
function toggleOpen() {
  open.value = !open.value
  if (open.value) {
    activeIndex.value = Math.max(0, THEMES.findIndex(t => t.id === themeStore.currentThemeId))
  }
  setExpanded(open.value)
}
function close() {
  open.value = false
  setExpanded(false)
  triggerRef.value?.focus()
}
function selectTheme(id: string) {
  themeStore.setTheme(id)
  close()
}
function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (!open.value) toggleOpen()
  }
}
function onMenuKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') { e.preventDefault(); close() }
  else if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex.value = (activeIndex.value + 1) % THEMES.length }
  else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex.value = (activeIndex.value - 1 + THEMES.length) % THEMES.length }
  else if (e.key === 'Home') { e.preventDefault(); activeIndex.value = 0 }
  else if (e.key === 'End') { e.preventDefault(); activeIndex.value = THEMES.length - 1 }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTheme(THEMES[activeIndex.value].id) }
}
function onClickOutside(e: MouseEvent) {
  if (
    open.value &&
    menuRef.value &&
    !menuRef.value.contains(e.target as Node) &&
    !triggerRef.value?.contains(e.target as Node)
  ) {
    close()
  }
}
onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>

<template>
  <div class="theme-select">
    <button
      ref="triggerRef"
      class="theme-toggle"
      :class="{ 'is-open': open }"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      aria-label="选择主题"
      @click="toggleOpen"
      @keydown="onTriggerKeydown"
    >
      <span class="theme-dot" :style="{ background: dotColor(currentTheme.accent) }"></span>
      <span class="theme-name">{{ currentTheme.name }}</span>
      <svg class="theme-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <div
      v-show="open"
      ref="menuRef"
      class="theme-menu"
      role="listbox"
      :aria-activedescendant="`theme-opt-${activeIndex}`"
      tabindex="-1"
      @keydown="onMenuKeydown"
    >
      <button
        v-for="(t, i) in THEMES"
        :id="`theme-opt-${i}`"
        :key="t.id"
        class="theme-option"
        :class="{ 'is-active': i === activeIndex, 'is-selected': t.id === themeStore.currentThemeId }"
        role="option"
        :aria-selected="t.id === themeStore.currentThemeId"
        @click="selectTheme(t.id)"
        @mousemove="activeIndex = i"
      >
        <span class="theme-dot" :style="{ background: dotColor(t.accent) }"></span>
        <span class="theme-option-name">{{ t.name }}</span>
        <svg v-if="t.id === themeStore.currentThemeId" class="theme-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </button>
    </div>

    <div v-if="open" class="theme-scrim" @click="close"></div>
  </div>
</template>

<style scoped>
.theme-select {
  position: relative;
  display: inline-block;
}

/* trigger：保留 .theme-toggle 以兼容 HomeView App Bar ghost 样式 */
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  min-height: 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
  transition:
    transform var(--motion-duration, 220ms) var(--motion-ease, ease),
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    color var(--motion-duration, 220ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.theme-toggle:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.theme-toggle.is-open {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.theme-toggle:active:not(:disabled) {
  transform: var(--motion-press, scale(0.97));
}
.theme-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex: 0 0 auto;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.theme-name {
  white-space: nowrap;
}
.theme-caret {
  width: 16px;
  height: 16px;
  opacity: 0.6;
  transition: transform var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.theme-toggle.is-open .theme-caret {
  transform: rotate(180deg);
}

/* 下拉面板（桌面：trigger 下方） */
.theme-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: 200px;
  max-height: 360px;
  overflow-y: auto;
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  padding: 6px;
  box-shadow: var(--shadow-dropdown);
  z-index: var(--z-dropdown, 100);
}
.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text);
  text-align: left;
}
.theme-option:hover,
.theme-option.is-active {
  background-color: var(--color-bg-hover);
}
.theme-option.is-selected {
  color: var(--color-primary);
  font-weight: 500;
}
.theme-option-name {
  flex: 1;
}
.theme-check {
  width: 16px;
  height: 16px;
  color: var(--color-primary);
  flex: 0 0 auto;
}

/* 点击关闭遮罩（桌面透明、移动端半透明） */
.theme-scrim {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-dropdown, 100) - 1);
  background: transparent;
}

/* 窄屏：底部全宽 sheet */
@media (max-width: 768px) {
  .theme-menu {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    max-height: 60vh;
    border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
    padding: 12px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
    box-shadow: var(--shadow-modal);
    animation: theme-sheet-up var(--anim-base, 250ms) var(--ease-out, cubic-bezier(0.34, 1.56, 0.64, 1));
  }
  .theme-option {
    padding: 14px 12px;
    font-size: var(--font-size-base, 15px);
  }
  .theme-scrim {
    background: rgba(0, 0, 0, 0.4);
  }
  /* trigger 在窄屏仅留色点 + 箭头，节省空间 */
  .theme-name {
    display: none;
  }
}

@keyframes theme-sheet-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .theme-menu { animation: none; }
  .theme-caret { transition: none; }
}
</style>
