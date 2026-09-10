<script setup lang="ts">
// 工作台头部「页面切换下拉」：替代原来的「返回管理页」箭头按钮。
// 显示当前所在页名称，点击展开菜单，可跳到管理页与其他工作台（隐藏的页面不列出，当前页排除）。
// 三个工作台视图（Workbench / Business / Student）共用，样式自包含在 scoped 内。
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppSettingsStore } from '@/stores/settings'
import Icon from '@/components/Icon.vue'

type PageKey = 'home' | 'workbench' | 'business' | 'student'

const props = defineProps<{ current: Exclude<PageKey, 'home'> }>()

const router = useRouter()
const settings = useAppSettingsStore()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const PAGES: Record<PageKey, { path: string; icon: string }> = {
  home: { path: '/', icon: 'home' },
  workbench: { path: '/workbench', icon: 'toolbox' },
  business: { path: '/business', icon: 'store' },
  student: { path: '/student', icon: 'notes' }
}

const nameOf = (key: PageKey): string => {
  switch (key) {
    case 'home':
      return '管理页'
    case 'workbench':
      return settings.workbenchPageDisplayName
    case 'business':
      return settings.businessPageDisplayName
    case 'student':
      return settings.studentPageDisplayName
  }
}

const visiblePages = computed<PageKey[]>(() => {
  const list: PageKey[] = ['home']
  if (settings.workbenchPageVisible !== false) list.push('workbench')
  if (settings.businessPageVisible !== false) list.push('business')
  if (settings.studentPageVisible !== false) list.push('student')
  return list
})

const menuItems = computed(() =>
  visiblePages.value
    .filter((key) => key !== props.current)
    .map((key) => ({ key, name: nameOf(key), ...PAGES[key] }))
)

const currentName = computed(() => nameOf(props.current))
const currentIcon = computed(() => PAGES[props.current].icon)

function toggle(): void {
  open.value = !open.value
}

function close(): void {
  open.value = false
}

function select(path: string): void {
  open.value = false
  void router.push(path)
}

// 点击组件外部关闭：pointerdown 捕获阶段监听，命中组件内部则忽略
function onDocPointerDown(e: PointerEvent): void {
  if (!open.value) return
  const root = rootRef.value
  if (root && e.target instanceof Node && root.contains(e.target)) return
  close()
}

function onDocKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) close()
}

document.addEventListener('pointerdown', onDocPointerDown, true)
document.addEventListener('keydown', onDocKeydown)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onDocKeydown)
})
</script>

<template>
  <div ref="rootRef" class="page-switcher" data-testid="page-switcher">
    <h1 class="ps-heading">
      <button
        type="button"
        class="ps-trigger"
        data-testid="page-switcher-trigger"
        :title="`切换页面（当前：${currentName}）`"
        :aria-expanded="open"
        aria-haspopup="menu"
        @click="toggle"
      >
        <span class="ps-icon"><Icon :name="currentIcon" :size="18" /></span>
        <span class="ps-label">{{ currentName }}</span>
        <span class="ps-caret" :class="{ 'is-open': open }"><Icon name="chevron-down" :size="14" /></span>
      </button>
    </h1>

    <transition name="ps-pop">
      <ul v-if="open" class="ps-menu" role="menu" :aria-label="'切换页面'">
        <li v-for="item in menuItems" :key="item.key" role="none">
          <button
            type="button"
            class="ps-menu-item"
            role="menuitem"
            :data-testid="`page-switcher-${item.key}`"
            :title="`前往${item.name}`"
            @click="select(item.path)"
          >
            <span class="ps-icon"><Icon :name="item.icon" :size="16" /></span>
            <span class="ps-menu-label">{{ item.name }}</span>
          </button>
        </li>
      </ul>
    </transition>
  </div>
</template>

<style scoped>
.page-switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

/* h1 保留页面主标题语义，但重置默认外边距与继承的字号，避免撑高头部 */
.ps-heading {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  min-width: 0;
}

.ps-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background-color: transparent;
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-2xl, 20px);
  font-weight: var(--font-weight-semibold, 600);
  line-height: var(--line-height-tight, 1.3);
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    border-color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.ps-trigger:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
  border-color: var(--color-border, #e2e8f0);
}

.ps-trigger:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: 2px;
}

.ps-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-primary, #3b82f6);
}

.ps-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ps-caret {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--color-text-secondary, #64748b);
  transition: transform var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.ps-caret.is-open {
  transform: rotate(180deg);
}

.ps-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  min-width: 180px;
  margin: 0;
  padding: 6px;
  list-style: none;
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.ps-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-normal, 400);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-duration, 0.2s) var(--motion-ease, ease),
    color var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.ps-menu-item:hover {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

.ps-menu-item:focus-visible {
  outline: 2px solid var(--color-primary, #3b82f6);
  outline-offset: -2px;
}

.ps-menu-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 进出场动画：与全局微交互参数保持一致 */
.ps-pop-enter-active,
.ps-pop-leave-active {
  transition: opacity var(--motion-duration, 0.2s) var(--motion-ease, ease),
    transform var(--motion-duration, 0.2s) var(--motion-ease, ease);
}

.ps-pop-enter-from,
.ps-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 移动端：触控目标拉到 44px（WCAG 2.2 目标尺寸下限），菜单宽度自适应 */
@media (max-width: 768px) {
  .ps-trigger {
    min-height: 44px;
    padding: 8px 10px;
  }

  .ps-menu-item {
    min-height: 44px;
  }

  .ps-menu {
    min-width: 200px;
    max-width: calc(100vw - 24px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ps-trigger,
  .ps-caret,
  .ps-menu-item,
  .ps-pop-enter-active,
  .ps-pop-leave-active {
    transition: none;
  }
}
</style>
