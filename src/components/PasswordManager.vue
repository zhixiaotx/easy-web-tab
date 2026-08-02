<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePasswordsStore } from '../stores/passwords'
import { useSitesStore } from '../stores/sites'
import { useToast } from '../composables/useToast'
import type { PasswordEntry } from '../types'

const emit = defineEmits<{
  close: []
}>()

const passwordsStore = usePasswordsStore()
const sitesStore = useSitesStore()
const toast = useToast()

// ESC 键关闭弹框
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// 主密码状态
const masterPasswordInput = ref('')
const masterPasswordConfirm = ref('')
const isNewSetup = ref(!passwordsStore.hasMasterPassword())
const unlockError = ref('')
const isUnlocking = ref(false)

// 旧版 vault 迁移：存在 v1 验证 key（password-verification）且无 v2 key（password-verification-v2）时进入迁移流程
const showLegacyMigration = ref(
  localStorage.getItem('password-verification') !== null &&
  localStorage.getItem('password-verification-v2') === null
)
const legacyPasswordInput = ref('')
const migrationMessage = ref('')
const migrationOk = ref(false)
const isMigrating = ref(false)

// 搜索
const searchQuery = ref('')

// 添加/编辑表单
const showForm = ref(false)
const editingId = ref<string | null>(null)
const formSiteName = ref('')
const formUrl = ref('')
const formUsername = ref('')
const formPassword = ref('')
const showPassword = ref(false)

// 站点选择下拉
const siteSearchQuery = ref('')
const showSiteDropdown = ref(false)

// 显示密码状态 (列表中)
const visiblePasswords = ref<Set<string>>(new Set())

// 计算属性：过滤后的密码列表
const filteredPasswords = computed(() => {
  if (!searchQuery.value) return passwordsStore.passwords
  return passwordsStore.searchPasswords(searchQuery.value)
})

// 计算属性：可选择的站点列表 (从现有站点中选择)
const availableSites = computed(() => {
  const query = siteSearchQuery.value.toLowerCase()
  return sitesStore.sites.filter(site =>
    site.name.toLowerCase().includes(query) ||
    site.url.toLowerCase().includes(query)
  ).slice(0, 20) // 最多显示20个
})

// 主密码操作
async function handleSetupMasterPassword() {
  if (!masterPasswordInput.value) return
  if (masterPasswordInput.value !== masterPasswordConfirm.value) {
    unlockError.value = '两次输入的密码不一致'
    return
  }
  
  isUnlocking.value = true
  try {
    await passwordsStore.setupMasterPassword(masterPasswordInput.value)
    isNewSetup.value = false
    unlockError.value = ''
    } catch {
      unlockError.value = '设置失败，请重试'
    } finally {
    isUnlocking.value = false
  }
}

async function handleUnlock() {
  if (!masterPasswordInput.value) return
  
  isUnlocking.value = true
  unlockError.value = ''
  
  try {
    const success = await passwordsStore.unlock(masterPasswordInput.value)
    if (!success) {
      unlockError.value = '密码错误'
    }
    } catch {
      unlockError.value = '解锁失败，请重试'
    } finally {
    isUnlocking.value = false
  }
}

function handleLock() {
  passwordsStore.lock()
  masterPasswordInput.value = ''
  masterPasswordConfirm.value = ''
  showForm.value = false
  editingId.value = null
}

// 迁移旧版 vault（migrateLegacyVault 内部已 catch，不 throw；仅消费返回结果）
async function handleMigrateLegacyVault() {
  if (!legacyPasswordInput.value || isMigrating.value) return

  isMigrating.value = true
  migrationMessage.value = ''
  migrationOk.value = false
  try {
    const result = await passwordsStore.migrateLegacyVault(legacyPasswordInput.value)
    migrationMessage.value = result.message
    migrationOk.value = result.ok
    if (result.ok) {
      // store 已置 isUnlocked + currentMasterPassword + v2 verification，直接进入列表态
      showLegacyMigration.value = false
      isNewSetup.value = !passwordsStore.hasMasterPassword()
      legacyPasswordInput.value = ''
      toast.success(result.message)
    }
  } finally {
    isMigrating.value = false
  }
}

// 表单操作
function startAdd() {
  editingId.value = null
  formSiteName.value = ''
  formUrl.value = ''
  formUsername.value = ''
  formPassword.value = ''
  showPassword.value = false
  siteSearchQuery.value = ''
  showForm.value = true
}

function startEdit(entry: PasswordEntry) {
  editingId.value = entry.id
  formSiteName.value = entry.siteName
  formUrl.value = entry.url
  formUsername.value = entry.username
  formPassword.value = entry.password
  showPassword.value = false
  siteSearchQuery.value = ''
  showForm.value = true
}

function cancelForm() {
  showForm.value = false
  editingId.value = null
  formSiteName.value = ''
  formUrl.value = ''
  formUsername.value = ''
  formPassword.value = ''
  showPassword.value = false
  siteSearchQuery.value = ''
}

async function handleSave() {
  if (!formSiteName.value.trim() || !formUrl.value.trim() || !formUsername.value.trim() || !formPassword.value.trim()) {
    return
  }
  
  const data = {
    siteName: formSiteName.value.trim(),
    url: formUrl.value.trim(),
    username: formUsername.value.trim(),
    password: formPassword.value.trim()
  }
  
  if (editingId.value) {
    await passwordsStore.updatePassword(editingId.value, data)
  } else {
    await passwordsStore.addPassword(data)
  }
  
  cancelForm()
}

async function handleDelete(id: string) {
  if (confirm('确定要删除这个密码条目吗？')) {
    await passwordsStore.deletePassword(id)
  }
}

// 选择站点
function selectSite(site: { name: string; url: string }) {
  formSiteName.value = site.name
  formUrl.value = site.url
  showSiteDropdown.value = false
  siteSearchQuery.value = ''
}

// 手动输入时关闭下拉
function onSiteNameInput() {
  showSiteDropdown.value = true
  siteSearchQuery.value = formSiteName.value
}

function onSiteNameBlur() {
  // 延迟关闭，让点击事件先触发
  setTimeout(() => {
    showSiteDropdown.value = false
  }, 200)
}

// 显示/隐藏密码
function togglePasswordVisibility(id: string) {
  if (visiblePasswords.value.has(id)) {
    visiblePasswords.value.delete(id)
  } else {
    visiblePasswords.value.add(id)
  }
}

function isPasswordVisible(id: string): boolean {
  return visiblePasswords.value.has(id)
}

// 复制功能
async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    // 使用 toast 提示（如果可用）
    const event = new CustomEvent('show-toast', {
      detail: { type: 'success', message: `${label}已复制到剪贴板` }
    })
    window.dispatchEvent(event)
  } catch {
    // 降级方案
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    
    const event = new CustomEvent('show-toast', {
      detail: { type: 'success', message: `${label}已复制到剪贴板` }
    })
    window.dispatchEvent(event)
  }
}
</script>

<template>
  <div class="manager-overlay" @click.self="emit('close')">
    <div class="manager">
      <div class="manager-header">
        <h2>🔑 密码管理</h2>
        <div class="header-actions">
          <button v-if="passwordsStore.isUnlocked" class="btn-lock" @click="handleLock" title="锁定">
            🔒 锁定
          </button>
          <button class="close-btn" @click="emit('close')">✕</button>
        </div>
      </div>

      <div class="manager-body">
        <!-- 旧版 vault 迁移界面 -->
        <div v-if="showLegacyMigration" class="auth-section">
          <div class="auth-card">
            <h3>迁移旧版密码数据</h3>
            <p class="auth-hint">检测到旧版密码数据，请输入旧版主密码完成迁移</p>
            <input
              v-model="legacyPasswordInput"
              type="password"
              placeholder="旧版主密码"
              class="auth-input"
              @keyup.enter="handleMigrateLegacyVault"
            />
            <p v-if="migrationMessage" :class="migrationOk ? 'auth-success' : 'auth-error'">
              {{ migrationMessage }}
            </p>
            <button
              class="btn-primary"
              @click="handleMigrateLegacyVault"
              :disabled="isMigrating || !legacyPasswordInput"
            >
              {{ isMigrating ? '迁移中...' : '迁移' }}
            </button>
          </div>
        </div>

        <template v-else>
        <!-- 主密码设置/解锁界面 -->
        <div v-if="!passwordsStore.isUnlocked" class="auth-section">
          <!-- 新用户设置 -->
          <template v-if="isNewSetup">
            <div class="auth-card">
              <h3>设置主密码</h3>
              <p class="auth-hint">首次使用，请设置主密码来保护您的密码数据</p>
              <input
                v-model="masterPasswordInput"
                type="password"
                placeholder="输入主密码"
                class="auth-input"
                @keyup.enter="handleSetupMasterPassword"
              />
              <input
                v-model="masterPasswordConfirm"
                type="password"
                placeholder="确认主密码"
                class="auth-input"
                @keyup.enter="handleSetupMasterPassword"
              />
              <p v-if="unlockError" class="auth-error">{{ unlockError }}</p>
              <button
                class="btn-primary"
                @click="handleSetupMasterPassword"
                :disabled="isUnlocking || !masterPasswordInput || !masterPasswordConfirm"
              >
                {{ isUnlocking ? '设置中...' : '设置密码' }}
              </button>
            </div>
          </template>
          
          <!-- 已有用户解锁 -->
          <template v-else>
            <div class="auth-card">
              <h3>输入主密码</h3>
              <p class="auth-hint">请输入主密码以解锁密码管理器</p>
              <input
                v-model="masterPasswordInput"
                type="password"
                placeholder="主密码"
                class="auth-input"
                @keyup.enter="handleUnlock"
              />
              <p v-if="unlockError" class="auth-error">{{ unlockError }}</p>
              <button
                class="btn-primary"
                @click="handleUnlock"
                :disabled="isUnlocking || !masterPasswordInput"
              >
                {{ isUnlocking ? '解锁中...' : '解锁' }}
              </button>
            </div>
          </template>
        </div>

        <!-- 密码管理界面 (已解锁) -->
        <div v-else class="password-section">
          <!-- 搜索和添加 -->
          <div class="toolbar">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索密码..."
              class="search-input"
            />
            <button class="btn-add" @click="startAdd">+ 添加密码</button>
          </div>

          <!-- 添加/编辑表单 -->
          <div v-if="showForm" class="add-form">
            <h3>{{ editingId ? '编辑密码' : '添加密码' }}</h3>
            <div class="form-group">
              <label>网站名称</label>
              <div class="site-input-wrapper">
                <input
                  v-model="formSiteName"
                  type="text"
                  placeholder="输入网站名称或从下拉选择"
                  class="form-input"
                  @input="onSiteNameInput"
                  @blur="onSiteNameBlur"
                  @focus="showSiteDropdown = true"
                />
                <div v-if="showSiteDropdown && availableSites.length > 0" class="site-dropdown">
                  <div
                    v-for="site in availableSites"
                    :key="site.url"
                    class="site-option"
                    @mousedown.prevent="selectSite(site)"
                  >
                    <span class="site-name">{{ site.name }}</span>
                    <span class="site-url">{{ site.url }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>网站 URL</label>
              <input
                v-model="formUrl"
                type="text"
                placeholder="https://example.com"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label>用户名</label>
              <input
                v-model="formUsername"
                type="text"
                placeholder="用户名或邮箱"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label>密码</label>
              <div class="password-input-wrapper">
                <input
                  v-model="formPassword"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="密码"
                  class="form-input"
                />
                <button
                  type="button"
                  class="btn-toggle-password"
                  @click="showPassword = !showPassword"
                >
                  {{ showPassword ? '👁️' : '👁️‍🗨️' }}
                </button>
              </div>
            </div>
            <div class="form-actions">
              <button class="btn-cancel" @click="cancelForm">取消</button>
              <button
                class="btn-save"
                @click="handleSave"
                :disabled="!formSiteName.trim() || !formUrl.trim() || !formUsername.trim() || !formPassword.trim()"
              >
                {{ editingId ? '保存' : '添加' }}
              </button>
            </div>
          </div>

          <!-- 密码列表 -->
          <div class="password-list">
            <div v-if="filteredPasswords.length === 0" class="empty-state">
              {{ searchQuery ? '没有找到匹配的密码' : '暂无保存的密码' }}
            </div>
            
            <div
              v-for="entry in filteredPasswords"
              :key="entry.id"
              class="password-item"
            >
              <div class="password-info">
                <div class="password-header">
                  <span class="site-name">{{ entry.siteName }}</span>
                  <span class="site-url">{{ entry.url }}</span>
                </div>
                <div class="password-details">
                  <span class="username">👤 {{ entry.username }}</span>
                  <span class="password-masked">
                    🔑 {{ isPasswordVisible(entry.id) ? entry.password : '••••••••' }}
                  </span>
                </div>
              </div>
              <div class="password-actions">
                <button
                  class="btn-icon"
                  @click="togglePasswordVisibility(entry.id)"
                  :title="isPasswordVisible(entry.id) ? '隐藏密码' : '显示密码'"
                >
                  {{ isPasswordVisible(entry.id) ? '🙈' : '👁️' }}
                </button>
                <button
                  class="btn-icon"
                  @click="copyToClipboard(entry.username, '用户名')"
                  title="复制用户名"
                >
                  📋
                </button>
                <button
                  class="btn-icon"
                  @click="copyToClipboard(entry.password, '密码')"
                  title="复制密码"
                >
                  🔐
                </button>
                <button class="btn-icon" @click="startEdit(entry)">✏️</button>
                <button class="btn-icon delete" @click="handleDelete(entry.id)">🗑️</button>
              </div>
            </div>
          </div>
        </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manager-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.manager {
  background-color: white;
  border-radius: 12px;
  width: 100%;
  max-width: var(--dlg-w-password, 700px);
  max-height: var(--dlg-h-password, 80vh);
  overflow-y: auto;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
  position: sticky;
  top: 0;
  background: white;
  border-radius: 12px 12px 0 0;
}

.manager-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-lock {
  padding: 6px 12px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: #64748b;
  transition: all 0.2s;
}

.btn-lock:hover {
  background: #e2e8f0;
  color: #3b82f6;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
}

.close-btn:hover {
  color: #64748b;
}

.manager-body {
  padding: 24px;
}

/* 认证区域 */
.auth-section {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.auth-card {
  text-align: center;
  max-width: 360px;
  width: 100%;
}

.auth-card h3 {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 8px 0;
}

.auth-hint {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 24px 0;
}

.auth-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 12px;
  box-sizing: border-box;
}

.auth-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.auth-error {
  color: #ef4444;
  font-size: 13px;
  margin: 0 0 12px 0;
}

.auth-success {
  color: var(--color-success);
  font-size: 13px;
  margin: 0 0 12px 0;
}

.btn-primary {
  width: 100%;
  padding: 12px 16px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-primary:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
}

/* 密码管理区域 */
.password-section {
  /* 空 */
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.btn-add {
  padding: 10px 16px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-add:hover {
  background-color: #2563eb;
}

/* 添加/编辑表单 */
.add-form {
  background: #f8fafc;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.add-form h3 {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 16px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.site-input-wrapper {
  position: relative;
}

.site-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.site-option {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.site-option:hover {
  background: #f1f5f9;
}

.site-option:last-child {
  border-bottom: none;
}

.site-option .site-name {
  font-size: 14px;
  color: #1e293b;
  font-weight: 500;
}

.site-option .site-url {
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.password-input-wrapper {
  position: relative;
}

.btn-toggle-password {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-cancel {
  padding: 10px 16px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  color: #64748b;
}

.btn-cancel:hover {
  background: #e2e8f0;
}

.btn-save {
  padding: 10px 16px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: #2563eb;
}

.btn-save:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

/* 密码列表 */
.password-list {
  /* 空 */
}

.empty-state {
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
  padding: 40px 20px;
  background: #f8fafc;
  border-radius: 8px;
}

.password-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 8px;
  transition: box-shadow 0.2s;
}

.password-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.password-info {
  flex: 1;
  min-width: 0;
}

.password-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.site-name {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.site-url {
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.password-details {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: #64748b;
}

.username {
  /* 空 */
}

.password-masked {
  font-family: monospace;
}

.password-actions {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.btn-icon {
  padding: 6px 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.2s;
  border-radius: 4px;
}

.btn-icon:hover {
  opacity: 1;
  background: #f1f5f9;
}

.btn-icon.delete:hover {
  color: #ef4444;
}

/* 暗色模式 */
:root.dark .manager {
  background-color: #1f2937;
}

:root.dark .manager-header {
  background: #1f2937;
  border-bottom-color: #374151;
}

:root.dark .manager-header h2 {
  color: #f3f4f6;
}

:root.dark .btn-lock {
  background: #374151;
  border-color: #4b5563;
  color: #9ca3af;
}

:root.dark .auth-card h3,
:root.dark .add-form h3 {
  color: #f3f4f6;
}

:root.dark .auth-hint {
  color: #9ca3af;
}

:root.dark .auth-input,
:root.dark .search-input,
:root.dark .form-input {
  background: #111827;
  border-color: #4b5563;
  color: #f3f4f6;
}

:root.dark .auth-input:focus,
:root.dark .search-input:focus,
:root.dark .form-input:focus {
  border-color: #3b82f6;
}

:root.dark .add-form {
  background: #111827;
}

:root.dark .form-group label {
  color: #d1d5db;
}

:root.dark .site-dropdown {
  background: #1f2937;
  border-color: #4b5563;
}

:root.dark .site-option {
  border-bottom-color: #374151;
}

:root.dark .site-option:hover {
  background: #374151;
}

:root.dark .site-option .site-name {
  color: #f3f4f6;
}

:root.dark .site-option .site-url {
  color: #9ca3af;
}

:root.dark .btn-cancel {
  background: #374151;
  border-color: #4b5563;
  color: #9ca3af;
}

:root.dark .btn-cancel:hover {
  background: #4b5563;
}

:root.dark .password-item {
  background: #111827;
  border-color: #374151;
}

:root.dark .password-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

:root.dark .site-name {
  color: #f3f4f6;
}

:root.dark .site-url,
:root.dark .password-details {
  color: #9ca3af;
}

:root.dark .empty-state {
  background: #111827;
  color: #6b7280;
}

:root.dark .btn-icon:hover {
  background: #374151;
}

@media (max-width: 640px) {
  .manager {
    max-height: 90vh;
    margin: 10px;
  }
  
  .toolbar {
    flex-direction: column;
  }
  
  .password-item {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .password-actions {
    margin-left: 0;
    margin-top: 12px;
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
