import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/element-theme.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import './style.css'
import './styles/background.css'
import './styles/mobile.css'
import './styles/records.css'
import { useThemeStore } from './stores/theme'
import { useAppSettingsStore } from './stores/settings'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// 初始化主题和背景
const themeStore = useThemeStore()
themeStore.initTheme()
themeStore.initBackground()
useAppSettingsStore().initSettings()

app.mount('#app')
