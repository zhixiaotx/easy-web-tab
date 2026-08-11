<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppSettingsStore } from '@/stores/settings'
import { useAppSettingsDialog } from '@/composables/useAppSettingsDialog'
import { fetchWeather, weatherEmoji, type WeatherInfo } from '@/composables/useWeather'

/**
 * 天气卡（open-meteo，可配置城市）。
 * 读 settingsStore.workbenchCity：未配置（undefined/空串）固定显示占位「未设置城市」+「去设置」；
 * 配置后 watch 城市变化 → fetchWeather → 显示温度/天气 emoji/湿度；
 * 加载中显示轻量占位，获取失败保持占位（静默降级，不 toast 不报错，无隐藏分支）。
 * 本期独立组件，Todo 14 才嵌入 WorkbenchHome。
 */
const settingsStore = useAppSettingsStore()
const { openAppSettings } = useAppSettingsDialog()

// 响应式 city（Pinia setup store 的 ref 解构会丢失响应性，须经 computed 派生）
const city = computed(() => settingsStore.workbenchCity)
const weather = ref<WeatherInfo | null>(null)
const loading = ref(false)

watch(
  () => settingsStore.workbenchCity,
  (newCity) => {
    weather.value = null
    if (!newCity || newCity.trim() === '') {
      loading.value = false
      return
    }
    loading.value = true
    void fetchWeather(newCity).then((result) => {
      weather.value = result // null = 失败，保持占位
      loading.value = false
    })
  },
  { immediate: true }
)
</script>

<template>
  <div class="weather-card" data-testid="wx-card">
    <!-- 未配置：固定占位 + 去设置（不做隐藏分支） -->
    <div v-if="!city" class="wx-placeholder">
      <span class="wx-placeholder-icon">🌤️</span>
      <span class="wx-placeholder-text">未设置城市</span>
      <button
        type="button"
        class="wx-setup-btn"
        data-testid="wx-setup-btn"
        @click="openAppSettings()"
      >去设置</button>
    </div>

    <!-- 已配置：成功显示天气数据；加载中/失败保持轻量占位（静默） -->
    <div v-else class="wx-body">
      <span class="wx-city" data-testid="wx-city">{{ city }}</span>
      <template v-if="weather">
        <span class="wx-emoji" data-testid="wx-emoji">{{ weatherEmoji(weather.code) }}</span>
        <span class="wx-temp" data-testid="wx-temp">{{ Math.round(weather.temp) }}°C</span>
        <span class="wx-humidity" data-testid="wx-humidity">湿度 {{ weather.humidity }}%</span>
      </template>
      <span v-else class="wx-loading" data-testid="wx-loading">{{ loading ? '加载中…' : '--°C' }}</span>
    </div>
  </div>
</template>

<style scoped>
.weather-card {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-top: 2px solid var(--accent-color, var(--color-primary));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.wx-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.wx-placeholder-icon {
  font-size: 22px;
}

.wx-placeholder-text {
  font-size: 14px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.wx-setup-btn {
  padding: 4px 12px;
  border: 1px solid var(--color-primary, #3b82f6);
  border-radius: 6px;
  background-color: var(--color-primary-light, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.wx-setup-btn:hover {
  background-color: var(--color-primary, #3b82f6);
  color: #fff;
}

.wx-body {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.wx-city {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
}

.wx-emoji {
  font-size: 22px;
  line-height: 1;
}

.wx-temp {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, var(--color-text));
  font-variant-numeric: tabular-nums;
}

.wx-humidity {
  font-size: 12px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.wx-loading {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

/* ===== 暗色模式覆盖 ===== */
:root.dark .weather-card {
  background-color: var(--bg-secondary, #1f2937);
  box-shadow: none;
}

:root.dark .wx-placeholder-text,
:root.dark .wx-humidity,
:root.dark .wx-loading {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .wx-city,
:root.dark .wx-temp {
  color: var(--text-primary, #f9fafb);
}

:root.dark .wx-setup-btn {
  background-color: #1e3a5f;
  color: #60a5fa;
}
</style>
