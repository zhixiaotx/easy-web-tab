<script setup lang="ts">
import { onMounted } from 'vue'
import { useThemeStore } from './stores/theme'
import Toast from './components/Toast.vue'
import CountdownReminder from './components/CountdownReminder.vue'
import CloudSyncConflictModal from './components/CloudSyncConflictModal.vue'
import BeianFooter from './components/BeianFooter.vue'
import { useToast } from './composables/useToast'
import { useCountdownReminder } from './composables/useCountdownReminder'
import { useCloudSync } from './composables/useCloudSync'

const themeStore = useThemeStore()
const { toasts, removeToast } = useToast()
const cloudSync = useCloudSync()

onMounted(() => {
  themeStore.initTheme()
  useCountdownReminder().init()
  cloudSync.init()
})
</script>

<template>
  <!--
    Route transition: <Transition mode="out-in"> fails when the OLD component
    is a Vue fragment (multiple root elements, e.g. HomeView) because Vue
    cannot apply CSS transition classes to a fragment. The leave phase "completes"
    instantly but the enter phase never starts, leaving a blank page.

    Fix: CSS @keyframes fade-in + :key="$route.path" forces component
    recreation on navigation. Works with both single-root and fragment components.
    The route-transition CSS class is defined in animations.css.
  -->
  <router-view v-slot="{ Component }">
    <component :is="Component" :key="$route.path" class="route-transition" />
  </router-view>
  <Toast :toasts="toasts as any" @remove="removeToast" />
  <CountdownReminder />
  <CloudSyncConflictModal v-if="cloudSync.conflictData.value" />
  <BeianFooter />
</template>

<style>
/* 动画 tokens + 过渡 classes */
@import './styles/animations.css';
/* 暗色模式样式 */
@import './styles/dark.css';
/* 多主题强调色覆盖（须在 dark.css 之后，覆盖其 primary 变量） */
@import './styles/themes.css';
</style>
