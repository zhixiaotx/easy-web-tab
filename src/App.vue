<script setup lang="ts">
import { onMounted } from 'vue'
import { useThemeStore } from './stores/theme'
import Toast from './components/Toast.vue'
import CountdownReminder from './components/CountdownReminder.vue'
import { useToast } from './composables/useToast'
import { useCountdownReminder } from './composables/useCountdownReminder'

const themeStore = useThemeStore()
const { toasts, removeToast } = useToast()

onMounted(() => {
  themeStore.initTheme()
  useCountdownReminder().init()
})
</script>

<template>
  <router-view />
  <Toast :toasts="toasts as any" @remove="removeToast" />
  <CountdownReminder />
</template>

<style>
/* 暗色模式样式 */
@import './styles/dark.css';
</style>
