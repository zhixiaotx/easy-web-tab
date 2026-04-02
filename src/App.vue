<script setup lang="ts">
import { onMounted } from 'vue'
import { useThemeStore } from './stores/theme'
import Toast from './components/Toast.vue'
import { useToast } from './composables/useToast'

const themeStore = useThemeStore()
const { toasts, removeToast } = useToast()

onMounted(() => {
  themeStore.initTheme()
})
</script>

<template>
  <router-view />
  <Toast :toasts="toasts as any" @remove="removeToast" />
</template>

<style>
/* 暗色模式样式 */
@import './styles/dark.css';
</style>
