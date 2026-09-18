<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { usePasswordsStore } from '@/stores/passwords'
import type { PasswordSaveResult } from '@/stores/passwords'
import { useSitesStore } from '@/stores/sites'
import { useToast } from '@/composables/useToast'
import { usePanelPaging } from '@/composables/usePanelPaging'
import { getIconUrl } from '@/composables/useIconCache'
import type { PasswordEntry } from '@/types'
import PanelPager from './PanelPager.vue'
import Icon from '@/components/Icon.vue'

const passwordsStore = usePasswordsStore()
const sitesStore = useSitesStore()
const toast = useToast()

// ===== 三态状态机 =====
// ① 无主密码 → 设置主密码；② 有主密码但未解锁 → 解锁；③ 已解锁 → 工具栏 + 列表 + 弹窗
const isNewSetup = ref(!passwordsStore.hasMasterPassword())

const masterPasswordInput = ref('')
const masterPasswordConfirm = ref('')
const authError = ref('')
const isUnlocking = ref(false)

async function handleSetupMasterPassword(): Promise<void> {
  if (masterPasswordInput.value !== masterPasswordConfirm.value) {
    authError.value = '两次输入的密码不一致'
    return
  }
  isUnlocking.value = true
  authError.value = ''
  try {
    await passwordsStore.setupMasterPassword(masterPasswordInput.value)
    isNewSetup.value = false
    masterPasswordInput.value = ''
    masterPasswordConfirm.value = ''
  } catch {
    authError.value = '设置失败，请重试'
  } finally {
    isUnlocking.value = false
  }
}

async function handleUnlock(): Promise<void> {
  isUnlocking.value = true
  authError.value = ''
  try {
    const success = await passwordsStore.unlock(masterPasswordInput.value)
    if (success) {
      masterPasswordInput.value = ''
    } else {
      authError.value = '密码错误'
    }
  } catch {
    authError.value = '解锁失败，请重试'
  } finally {
    isUnlocking.value = false
  }
}

function handleLock(): void {
  passwordsStore.lock()
  masterPasswordInput.value = ''
  masterPasswordConfirm.value = ''
  authError.value = ''
  cancelForm()
}

// ===== 重置密码（忘记主密码自救）=====
// 清空全部密码条目并清除主密码身份，之后回到「设置主密码」流程。
// 破坏性操作，二次确认后执行；已启用云同步时清空状态会同步到其他设备。
async function handleResetVault(): Promise<void> {
  if (
    !confirm(
      '确定要重置密码吗？\n\n此操作将清空所有已保存的密码条目，并清除主密码。\n重置后需重新设置主密码，已保存的密码无法恢复。'
    )
  ) {
    return
  }
  // 先同步切换 UI 状态：重置会清空本地加密身份，界面应立即回到「设置主密码」，
  // 不等待（也不依赖）云端推送结果——否则云推送卡住/失败会让本应跳转的页面停在解锁界面（"重置后没刷新"）。
  isNewSetup.value = true
  masterPasswordInput.value = ''
  masterPasswordConfirm.value = ''
  authError.value = ''
  try {
    const result = await passwordsStore.resetVault()
    if (!result.saved) toast.warning('密码已重置，但本地存储清理失败，重设主密码即可覆盖')
    else if (result.synced) toast.success('密码已重置，已同步到云端')
    else if (result.cloudEnabled) toast.warning('密码已重置，但云同步失败，请稍后手动同步')
    else toast.success('密码已重置，所有密码条目已清空')
  } catch {
    // 本地加密身份已清空、界面已跳转；仅云端同步异常，提示用户稍后手动同步
    toast.error('重置完成，但云端同步异常，请稍后手动同步')
  }
}

// ===== P0-3：空闲自动锁定 =====
// 解锁后启动计时，任一用户活动（鼠标/键盘/触摸/滚动）重置计时；
// 超时（默认 5 分钟）且无操作则自动锁定，与加密身份体系配套提升安全性。
const IDLE_LOCK_MS = 5 * 60 * 1000
let idleTimer = 0
let lastActivityTs = 0
const IDLE_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

function scheduleIdleLock(): void {
  window.clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    if (passwordsStore.isUnlocked) handleLock()
  }, IDLE_LOCK_MS)
}

function onIdleActivity(): void {
  if (!passwordsStore.isUnlocked) return
  const now = Date.now()
  // 节流：连续活动每 >1s 才重置一次，避免 mousemove 高频抖动反复重建定时器
  if (now - lastActivityTs > 1000) {
    lastActivityTs = now
    scheduleIdleLock()
  }
}

function startIdleWatch(): void {
  lastActivityTs = Date.now()
  scheduleIdleLock()
  IDLE_ACTIVITY_EVENTS.forEach((e) =>
    window.addEventListener(e, onIdleActivity, { passive: true })
  )
}

function stopIdleWatch(): void {
  window.clearTimeout(idleTimer)
  idleTimer = 0
  IDLE_ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onIdleActivity))
}

// ===== 搜索（按网站名称）=====
const searchQuery = ref('')
const filteredPasswords = computed<PasswordEntry[]>(() => {
  if (!searchQuery.value) return passwordsStore.passwords
  return passwordsStore.searchPasswords(searchQuery.value)
})

// ===== 自适应分页（桌面 ≥769px；锁定/未解锁时列表不渲染 → containerRef 为 null → 分页惰性 R8）=====
const listEl = ref<HTMLElement | null>(null)
// reactive() 包裹：模板访问 paging.currentPage/pageItems/totalPages/fitsOnePage 时 ref 自动解包（PanelPager 消费契约）
const paging = reactive(
  usePanelPaging({
    items: () => filteredPasswords.value,
    rowHeight: 116, // row-heights.json: password = 116（6 列卡片实测 MAX 113.17 + 2px，R4）
    containerRef: listEl,
    gridRef: listEl, // 与 containerRef 同元素：getComputedStyle(gridTemplateColumns) 实测列数 → 6
    maxRows: 3 // 6 列 × 3 行 = 18 卡/页（行数经 clampMaxRows 钳制）
  })
)

// 搜索变化 → 回第 1 页（输入与清除按钮两条路径都经 searchQuery 变化触发）
watch(searchQuery, () => paging.goto(1))

// ===== 新增/编辑弹窗（共用表单，四字段全部必填）=====
const showForm = ref(false)
const editingId = ref<string | null>(null)
const formSiteName = ref('')
const formUrl = ref('')
const formUsername = ref('')
const formPassword = ref('')
const showFormPassword = ref(false)

// 站点关联下拉（从书签库匹配网站，选中自动带出名称 + URL）
const siteSearchQuery = ref('')
const showSiteDropdown = ref(false)

const availableSites = computed(() => {
  const query = siteSearchQuery.value.toLowerCase()
  return sitesStore.sites
    .filter(site =>
      (site.name ?? '').toLowerCase().includes(query) ||
      (site.url ?? '').toLowerCase().includes(query)
    )
    .slice(0, 20)
})

function onSiteNameInput(): void {
  showSiteDropdown.value = true
  siteSearchQuery.value = formSiteName.value
}

function onSiteNameBlur(): void {
  // 延迟关闭，让点击事件先触发
  setTimeout(() => {
    showSiteDropdown.value = false
  }, 200)
}

function selectSite(site: { name: string; url: string }): void {
  formSiteName.value = site.name
  formUrl.value = site.url
  showSiteDropdown.value = false
  siteSearchQuery.value = ''
}

// 列表内按 URL 匹配书签库图标（无匹配则回退 favicon 服务）
function getSiteIcon(url: string): string {
  return sitesStore.sites.find(s => s.url === url)?.icon || getIconUrl(url)
}

const isFormValid = computed(() => {
  return (
    formSiteName.value.trim() !== '' &&
    formUrl.value.trim() !== '' &&
    formUsername.value.trim() !== '' &&
    formPassword.value.trim() !== ''
  )
})

function startAdd(): void {
  editingId.value = null
  formSiteName.value = ''
  formUrl.value = ''
  formUsername.value = ''
  formPassword.value = ''
  showFormPassword.value = false
  siteSearchQuery.value = ''
  showSiteDropdown.value = false
  showForm.value = true
}

function startEdit(entry: PasswordEntry): void {
  editingId.value = entry.id
  formSiteName.value = entry.siteName
  formUrl.value = entry.url
  formUsername.value = entry.username
  formPassword.value = entry.password
  showFormPassword.value = false
  siteSearchQuery.value = ''
  showSiteDropdown.value = false
  showForm.value = true
}

function cancelForm(): void {
  showForm.value = false
  editingId.value = null
  formSiteName.value = ''
  formUrl.value = ''
  formUsername.value = ''
  formPassword.value = ''
  showFormPassword.value = false
  siteSearchQuery.value = ''
  showSiteDropdown.value = false
}

/**
 * 已落盘后的提示：按云推送结果细化文案。
 * 密码改动会立即主动推送云端，所以"同步成功"必须如实告知；
 * 推送失败也要讲清楚——否则用户会以为什么都好了，下次拉取被云端覆盖才发现丢了。
 */
function toastSaved(verb: string, r: PasswordSaveResult): void {
  if (r.synced) toast.success(`${verb}成功，已同步到云端`)
  else if (r.cloudEnabled) toast.warning(`${verb}成功，但云同步失败，请稍后手动同步`)
  else toast.success(`${verb}成功`)
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const data = {
    siteName: formSiteName.value.trim(),
    url: formUrl.value.trim(),
    username: formUsername.value.trim(),
    password: formPassword.value.trim()
  }
  const isEdit = Boolean(editingId.value)
  const result = isEdit
    ? await passwordsStore.updatePassword(editingId.value!, data)
    : await passwordsStore.addPassword(data)
  // 保存失败多为密码库已锁定（空闲自动锁定后未重新解锁）：
  // 必须明确提示并保留表单内容，否则用户以为改成功了、实际未落盘也未同步
  if (!result.saved) {
    toast.error('保存失败：密码库已锁定，请重新解锁后重试')
    return
  }
  toastSaved(isEdit ? '更新' : '添加', result)
  cancelForm()
}

async function handleDelete(id: string): Promise<void> {
  if (confirm('确定要删除这个密码条目吗？')) {
    const result = await passwordsStore.deletePassword(id)
    if (!result.saved) {
      toast.error('删除失败：密码库已锁定，请重新解锁后重试')
      return
    }
    toastSaved('删除', result)
  }
}

// ===== 列表密码显示/隐藏 =====
const visiblePasswords = ref<Set<string>>(new Set())

function togglePasswordVisibility(id: string): void {
  if (visiblePasswords.value.has(id)) {
    visiblePasswords.value.delete(id)
  } else {
    visiblePasswords.value.add(id)
  }
}

function isPasswordVisible(id: string): boolean {
  return visiblePasswords.value.has(id)
}

// ===== 复制（clipboard API + toast，失败降级 execCommand）=====
async function copyToClipboard(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label}已复制到剪贴板`)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    toast.success(`${label}已复制到剪贴板`)
  }
}

// ===== Esc 关闭弹窗 =====
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && showForm.value) {
    event.preventDefault()
    cancelForm()
  }
}

onMounted(() => {
  // 为网站名称关联下拉准备书签数据（幂等：已有数据不重复加载）
  if (sitesStore.sites.length === 0) {
    sitesStore.loadSites()
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopIdleWatch()
})

// P0-3：解锁态变化时启停空闲锁定监听（immediate 处理挂载时已是解锁态的情况）
watch(
  () => passwordsStore.isUnlocked,
  (unlocked) => {
    if (unlocked) startIdleWatch()
    else stopIdleWatch()
  },
  { immediate: true }
)
</script>

<template>
  <div class="wb-password">
    <!-- ① 设置主密码（首次进入，无 password-verification-v2） -->
    <div v-if="!passwordsStore.isUnlocked && isNewSetup" class="pwd-auth">
      <div class="pwd-auth-card">
        <h3>设置主密码</h3>
        <p class="pwd-auth-hint">首次使用，请设置主密码来保护您的密码数据</p>
        <el-input
          v-model="masterPasswordInput"
          type="password"
          placeholder="输入主密码"
         
          data-testid="pwd-setup-input"
          @keyup.enter="handleSetupMasterPassword"
          show-password
        />
        <el-input
          v-model="masterPasswordConfirm"
          type="password"
          placeholder="确认主密码"
         
          data-testid="pwd-setup-confirm"
          @keyup.enter="handleSetupMasterPassword"
          show-password
        />
        <p v-if="authError" class="pwd-auth-error" data-testid="pwd-auth-error">{{ authError }}</p>
        <el-button
          class="pwd-btn-primary"
          data-testid="pwd-setup-submit"
          :disabled="isUnlocking || !masterPasswordInput || !masterPasswordConfirm"
          @click="handleSetupMasterPassword"
        >
          {{ isUnlocking ? '设置中...' : '设置密码' }}
        </el-button>
      </div>
    </div>

    <!-- ② 解锁（已有主密码，尚未解锁） -->
    <div v-else-if="!passwordsStore.isUnlocked" class="pwd-auth">
      <div class="pwd-auth-card">
        <h3>输入主密码</h3>
        <p class="pwd-auth-hint">请输入主密码以解锁密码管理器</p>
        <el-input
          v-model="masterPasswordInput"
          type="password"
          placeholder="主密码"
         
          data-testid="pwd-unlock-input"
          @keyup.enter="handleUnlock"
          show-password
        />
        <p v-if="authError" class="pwd-auth-error" data-testid="pwd-auth-error">{{ authError }}</p>
        <el-button
          class="pwd-btn-primary"
          data-testid="pwd-unlock-submit"
          :disabled="isUnlocking || !masterPasswordInput"
          @click="handleUnlock"
        >
          {{ isUnlocking ? '解锁中...' : '解锁' }}
        </el-button>
        <p class="pwd-reset-hint">
          <button
            type="button"
            class="pwd-reset-link"
            data-testid="pwd-reset-btn"
            :disabled="isUnlocking"
            @click="handleResetVault"
          >忘记密码？重置密码</button>
        </p>
      </div>
    </div>

    <!-- ③ 已解锁：工具栏 + 条目列表 -->
    <div v-else class="pwd-main">
      <div class="pwd-toolbar">
        <div class="pwd-search-wrap">
          <el-input
            v-model="searchQuery"
            type="text"
            placeholder="搜索网站名称…"
            class="pwd-search"
            data-testid="pwd-search-input"
            clearable
          />
          <el-button
            v-if="searchQuery"
            type="button"
            class="pwd-search-clear"
            title="清除搜索"
            data-testid="pwd-search-clear"
            @click="searchQuery = ''"
          ><Icon name="close" /></el-button>
        </div>
        <el-button class="pwd-btn-lock" data-testid="pwd-lock-btn" title="锁定" @click="handleLock">
          <Icon name="lock" :size="16" />锁定
        </el-button>
        <el-button class="pwd-btn-primary pwd-btn-add" data-testid="pwd-add-btn" @click="startAdd">
          + 新增密码
        </el-button>
      </div>

      <!-- 空态 -->
      <div v-if="filteredPasswords.length === 0" class="pwd-empty" data-testid="pwd-empty">
        {{ searchQuery ? '没有找到匹配的密码' : '暂无保存的密码' }}
      </div>

      <!-- 条目列表（6 列卡片网格：桌面 3 行 × 6 列 = 18 卡/页；移动端 2 列全量渲染） -->
      <div v-else class="pwd-list" :class="{ 'pwd-list-scroll': !paging.fitsOnePage }" ref="listEl">
        <TransitionGroup name="grid">
        <div v-for="entry in paging.pageItems" :key="entry.id" class="pwd-item" data-testid="pwd-item">
          <div class="pwd-card-head">
            <img
              v-if="getSiteIcon(entry.url)"
              :src="getSiteIcon(entry.url)"
              class="pwd-site-icon"
              alt=""
              loading="lazy"
              @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
            />
            <span class="pwd-site-name" :title="entry.siteName">{{ entry.siteName }}</span>
            <a
              class="pwd-icon-btn pwd-open"
              :href="entry.url"
              target="_blank"
              rel="noopener noreferrer"
              title="打开网站"
              :data-testid="`pwd-open-${entry.id}`"
            >↗</a>
          </div>
          <div class="pwd-details">
            <span class="pwd-username" :title="entry.username">{{ entry.username }}</span>
            <span class="pwd-masked" :title="isPasswordVisible(entry.id) ? entry.password : ''">
              {{ isPasswordVisible(entry.id) ? entry.password : '••••••••' }}
            </span>
          </div>
          <div class="pwd-actions">
            <el-button
              text
              class="pwd-icon-btn"
              :title="isPasswordVisible(entry.id) ? '隐藏密码' : '显示密码'"
              :aria-label="isPasswordVisible(entry.id) ? '隐藏密码' : '显示密码'"
              :data-testid="`pwd-toggle-${entry.id}`"
              @click="togglePasswordVisibility(entry.id)"
            >
              <Icon :name="isPasswordVisible(entry.id) ? 'eye-off' : 'eye'" :size="16" />
            </el-button>
            <el-button
              text
              class="pwd-icon-btn"
              title="复制用户名"
              aria-label="复制用户名"
              :data-testid="`pwd-copy-username-${entry.id}`"
              @click="copyToClipboard(entry.username, '用户名')"
            ><Icon name="copy" :size="16" /></el-button>
            <el-button
              text
              class="pwd-icon-btn"
              title="复制密码"
              aria-label="复制密码"
              :data-testid="`pwd-copy-password-${entry.id}`"
              @click="copyToClipboard(entry.password, '密码')"
            ><Icon name="copy" :size="16" /></el-button>
            <el-button
              text
              class="pwd-icon-btn"
              title="编辑"
              :data-testid="`pwd-edit-${entry.id}`"
              @click="startEdit(entry)"
            ><Icon name="pencil" /></el-button>
            <el-button
              text
              class="pwd-icon-btn pwd-delete"
              title="删除"
              :data-testid="`pwd-delete-${entry.id}`"
              @click="handleDelete(entry.id)"
            ><Icon name="trash" /></el-button>
          </div>
        </div>
        </TransitionGroup>
      </div>

      <!-- 自适应分页（仅已解锁列表可见时渲染；totalPages>1 才显示） -->
      <PanelPager :page="paging.currentPage" :total="paging.totalPages" @prev="paging.prev()" @next="paging.next()" />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="showForm"
      width="480px"
      data-testid="pwd-form-modal"
      @close="cancelForm"
    >
      <template #header="{ close }">
        <div class="pwd-dialog-header">
          <h3 class="pwd-dialog-title">{{ editingId ? '编辑密码' : '新增密码' }}</h3>
          <el-button
            type="button"
            class="pwd-modal-close"
            title="关闭"
            data-testid="pwd-modal-close"
            text
            @click="close"
          ><Icon name="close" :size="16" /></el-button>
        </div>
      </template>
      <form class="pwd-modal-body" @submit.prevent="handleSave">
            <div class="form-group">
              <label>网站名称</label>
              <div class="pwd-site-input-wrap">
                <el-input
                  v-model="formSiteName"
                  type="text"
                  placeholder="输入网站名称或从下拉选择"
                 
                  data-testid="pwd-form-site"
                  @input="onSiteNameInput"
                  @blur="onSiteNameBlur"
                  @focus="showSiteDropdown = true"
                />
                <div v-if="showSiteDropdown && availableSites.length > 0" class="pwd-site-dropdown">
                  <div
                    v-for="site in availableSites"
                    :key="site.url"
                    class="pwd-site-option"
                    data-testid="pwd-site-option"
                    @mousedown.prevent="selectSite(site)"
                  >
                    <span class="pwd-site-option-name">{{ site.name }}</span>
                    <span class="pwd-site-option-url">{{ site.url }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>网站 URL</label>
              <el-input
                v-model="formUrl"
                type="text"
                placeholder="https://example.com"
               
                data-testid="pwd-form-url"
              />
            </div>
            <div class="form-group">
              <label>用户名</label>
              <el-input
                v-model="formUsername"
                type="text"
                placeholder="用户名或邮箱"
               
                data-testid="pwd-form-username"
              />
            </div>
            <div class="form-group">
              <label>密码</label>
              <div class="pwd-password-wrap">
                <el-input
                  v-model="formPassword"
                  :type="showFormPassword ? 'text' : 'password'"
                  placeholder="密码"
                 
                  data-testid="pwd-form-password"
                  show-password
                />
              </div>
            </div>
            <div class="pwd-form-actions">
<el-button type="button" class="pwd-btn-cancel" data-testid="pwd-cancel-btn" @click="cancelForm">
              取消
            </el-button>
            <el-button type="primary" native-type="submit" class="pwd-btn-primary" data-testid="pwd-save-btn" :disabled="!isFormValid">
              {{ editingId ? '保存' : '添加' }}
            </el-button>
          </div>
        </form>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 面板容器（WorkbenchView 的 .wb-content 已提供滚动与背景，此处不 position:fixed） */
.wb-password {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 已解锁主体（工具栏 + 列表 + 分页条）：flex 列，让 .pwd-list 的 flex:1 撑满剩余高度供 RO 测量
   （缺此规则时 .pwd-main 为块级，.pwd-list flex:1 失效 → RO 只测到 1 行内容高 → rowsPerPage=1） */
.pwd-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 认证区（设置/解锁共用）===== */
.pwd-auth {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.pwd-auth-card {
  width: 100%;
  max-width: 360px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  padding: 24px;
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.pwd-auth-card h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  margin: 0 0 6px 0;
}

.pwd-auth-hint {
  font-size: 13px;
  color: var(--color-text-secondary, var(--color-text-secondary));
  margin: 0 0 18px 0;
}

.pwd-auth-card .el-input {
  margin-bottom: 12px;
}

.pwd-auth-card .pwd-btn-primary {
  width: 100%;
}

.pwd-auth-error {
  color: var(--color-error, #ef4444);
  font-size: 13px;
  margin: 0 0 12px 0;
}

.pwd-reset-hint {
  margin: 14px 0 0 0;
  text-align: center;
}

.pwd-reset-link {
  background: none;
  border: none;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
  transition: color var(--transition-fast, 0.15s ease);
}

.pwd-reset-link:hover:not(:disabled) {
  color: var(--color-error, #ef4444);
}

.pwd-reset-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== 输入框 ===== */
.form-input {
  width: 100%;
  padding: 9px 12px;
  background-color: var(--color-bg-input, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--color-text, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary, var(--color-primary));
}

/* ===== 主按钮 ===== */
.pwd-btn-primary {
  padding: 10px 18px;
  background: var(--color-primary, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.pwd-btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover, var(--color-primary-hover));
}

.pwd-btn-primary:disabled {
  background: var(--color-text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* ===== 工具栏 ===== */
.pwd-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pwd-search-wrap {
  position: relative;
  flex: 1;
  min-width: 160px;
}

.pwd-search {
  padding-right: 30px;
}

.pwd-search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  padding: 2px 4px;
  border-radius: var(--radius-sm, 6px);
}

.pwd-search-clear:hover {
  color: var(--color-text, var(--color-text));
  background: var(--color-bg-card, var(--color-bg-hover));
}

.pwd-btn-add {
  flex-shrink: 0;
}

.pwd-btn-lock {
  padding: 9px 14px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  color: var(--color-text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.pwd-btn-lock:hover {
  color: var(--color-primary, var(--color-primary));
  border-color: var(--color-primary, var(--color-primary));
}

/* ===== 列表（卡片网格）===== */
.pwd-list {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
}

/* 桌面（≥769px）自适应分页：主体撑满面板高度，列表区 flex:1 撑满剩余高度供 RO 测量；
   一屏放不下时 overflow-y:auto 兜底（R7） */
@media (min-width: 769px) {
  .pwd-main {
    flex: 1;
    min-height: 0;
  }

  .pwd-list {
    flex: 1;
    min-height: 0;
  }

  .pwd-list-scroll {
    overflow-y: auto;
  }
}

/* 移动端（≤768px）分页惰性（全量渲染）：网格收窄为 2 列 */
@media (max-width: 768px) {
  .pwd-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.pwd-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 8px 10px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.pwd-item:hover {
  border-color: var(--color-primary, var(--color-primary));
}

.pwd-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pwd-site-icon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  object-fit: contain;
  flex-shrink: 0;
  background: var(--color-bg-card, var(--color-bg-hover));
}

.pwd-site-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pwd-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-secondary, var(--color-text-secondary));
}

.pwd-username,
.pwd-masked {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pwd-masked {
  font-family: monospace;
}

.pwd-actions {
  display: flex;
  gap: 2px;
  margin-top: auto;
  padding-top: 4px;
  border-top: 1px solid var(--color-border, var(--color-border));
}

.pwd-icon-btn {
  padding: 3px 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity var(--transition-fast, 0.15s ease);
  border-radius: var(--radius-sm, 6px);
  text-decoration: none;
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pwd-icon-btn:hover {
  opacity: 1;
  background: var(--color-bg-card, var(--color-bg-hover));
}

.pwd-icon-btn.pwd-delete:hover {
  color: var(--color-error, var(--color-error));
}

/* ===== 空态 ===== */
.pwd-empty {
  text-align: center;
  color: var(--color-text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px dashed var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== 新增/编辑弹窗 ===== */
.pwd-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.pwd-modal {
  width: 100%;
  max-width: var(--dlg-w-wb-password, 520px);
  max-height: var(--dlg-h-wb-password, 90vh);
  overflow-y: auto;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-card, 0 8px 30px rgba(0, 0, 0, 0.15));
}

.pwd-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.pwd-dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, var(--color-text));
}

.pwd-modal-close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--color-text-muted, var(--color-text-muted));
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm, 6px);
}

.pwd-modal-close:hover {
  color: var(--color-text, var(--color-text));
  background: var(--color-bg-card, var(--color-bg-hover));
}

.pwd-modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, var(--color-text-secondary));
  margin-bottom: 6px;
}

/* ===== 网站名称关联下拉 ===== */
.pwd-site-input-wrap {
  position: relative;
}

.pwd-site-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--color-bg-card, var(--color-bg-card));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.pwd-site-option {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border, var(--color-border));
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pwd-site-option:last-child {
  border-bottom: none;
}

.pwd-site-option:hover {
  background: var(--color-bg-card, var(--color-bg-hover));
}

.pwd-site-option-name {
  font-size: 14px;
  color: var(--color-text, var(--color-text));
  font-weight: 500;
}

.pwd-site-option-url {
  font-size: 12px;
  color: var(--color-text-muted, var(--color-text-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 密码输入 ===== */
.pwd-password-wrap {
  position: relative;
}

.pwd-eye-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 15px;
  padding: 2px;
  opacity: 0.7;
  transition: opacity var(--transition-fast, 0.15s ease);
}

.pwd-eye-btn:hover {
  opacity: 1;
}

/* ===== P3-14 移动端触控目标：图标按钮点击区放大 ===== */
@media (max-width: 768px) {
  /* 行内操作图标按钮（复制/显示密码/删除）≥40px */
  .pwd-icon-btn {
    min-width: 40px;
    min-height: 40px;
    padding: 6px 8px;
    opacity: 0.85;
  }

  /* 密码输入框内嵌的眼睛按钮受输入高度限制，给 32px（仍明显大于默认） */
  .pwd-eye-btn {
    min-width: 32px;
    min-height: 32px;
    padding: 4px;
  }
}

.pwd-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.pwd-btn-cancel {
  padding: 9px 16px;
  background: var(--color-bg-card, var(--color-bg-hover));
  border: 1px solid var(--color-border, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--color-text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.pwd-btn-cancel:hover {
  background: var(--color-bg-hover, var(--color-bg-active));
}

/* ===== 暗色模式覆盖 ===== */
html.dark .pwd-auth-card,
html.dark .pwd-item,
html.dark .pwd-empty {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .pwd-modal {
  background-color: var(--color-bg-card, #1f2937);
}

html.dark .pwd-item {
  box-shadow: none;
}

html.dark .pwd-auth-card h3,
html.dark .pwd-dialog-title {
  color: var(--color-text, #f9fafb);
}

html.dark .pwd-auth-hint {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .pwd-reset-link {
  color: var(--color-text-muted, #9ca3af);
}

html.dark .pwd-reset-link:hover:not(:disabled) {
  color: var(--color-error, #f87171);
}

html.dark .pwd-search {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text, #f9fafb);
  border-color: var(--color-border, #374151);
}

html.dark .pwd-btn-lock,
html.dark .pwd-btn-cancel {
  background-color: var(--color-bg-card, #1f2937);
  color: var(--color-text-secondary, #d1d5db);
  border-color: var(--color-border, #374151);
}

html.dark .pwd-icon-btn:hover,
html.dark .pwd-modal-close:hover {
  background-color: var(--color-bg-hover, #374151);
}

html.dark .pwd-site-name {
  color: var(--color-text, #f9fafb);
}

html.dark .pwd-details {
  color: var(--color-text-secondary, #d1d5db);
}

html.dark .pwd-site-dropdown {
  background-color: var(--color-bg-card, #1f2937);
  border-color: var(--color-border, #374151);
}

html.dark .pwd-site-option {
  border-bottom-color: var(--color-border, #374151);
}

html.dark .pwd-site-option:hover {
  background-color: var(--color-bg-hover, #374151);
}

html.dark .pwd-site-option-name {
  color: var(--color-text, #f9fafb);
}

html.dark .pwd-site-option-url {
  color: var(--color-text-secondary, #d1d5db);
}

/* 禁用态主按钮：亮灰底 + 白字在暗色下对比度不足，改用暗输入底 + 灰色文字 */
html.dark .pwd-btn-primary:disabled {
  background-color: var(--color-bg-input, #374151);
  color: var(--color-text-muted, #9ca3af);
}
</style>
