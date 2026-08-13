import { shallowRef, readonly } from 'vue'

// 模块级单例：设置弹窗「去设置」入口状态（仿 useToast/useHelpModal 模式，非 Pinia）。
// 供 WeatherCard 等入口调用 openAppSettings() 打开 AppSettingsDialog 并定位到对应设置区块。
const showAppSettings = shallowRef(false)

export function useAppSettingsDialog() {
  const openAppSettings = () => {
    showAppSettings.value = true
  }
  const closeAppSettings = () => {
    showAppSettings.value = false
  }

  return {
    showAppSettings: readonly(showAppSettings),
    openAppSettings,
    closeAppSettings
  }
}
