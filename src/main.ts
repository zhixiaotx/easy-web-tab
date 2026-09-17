import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
// 按需引入：unplugin-auto-import + unplugin-vue-components 会在编译期
// 自动注入用到的 El* 组件及其样式（见 vite.config.js 的 ElementPlusResolver），
// 不再全量引入 element-plus / dist/index.css，显著减小入口包体。
// 暗色主题为 css 变量方案，必须保留（轻量，仅变量定义）。
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/element-theme.css'
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
// Element Plus 中文语言包改为在 App.vue 顶层用 <el-config-provider :locale="zhCn"> 承接
// （按需引入后不再 app.use(ElementPlus, { locale })）

// 初始化主题和背景
const themeStore = useThemeStore()
themeStore.initTheme()
themeStore.initBackground()
useAppSettingsStore().initSettings()

app.mount('#app')
