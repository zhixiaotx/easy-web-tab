<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePasswordsStore } from '@/stores/passwords'
import type { PasswordEntry } from '@/types'

const passwordsStore = usePasswordsStore()

// ===== 三态状态机 =====
// ① 无主密码 → 设置主密码；② 有主密码但未解锁 → 解锁；③ 已解锁 → 工具栏 + 列表 + 表单
// 面板不做 onMounted load：setupMasterPassword / unlock 成功时 store 内部才加载/解密数据
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

// ===== 搜索 =====
const searchQuery = ref('')
const filteredPasswords = computed<PasswordEntry[]>(() => {
  if (!searchQuery.value) return passwordsStore.passwords
  return passwordsStore.searchPasswords(searchQuery.value)
})

// ===== 新增/编辑表单（共用，四字段全部必填）=====
const showForm = ref(false)
const editingId = ref<string | null>(null)
const formSiteName = ref('')
const formUrl = ref('')
const formUsername = ref('')
const formPassword = ref('')
const showFormPassword = ref(false)

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
  showForm.value = true
}

function startEdit(entry: PasswordEntry): void {
  editingId.value = entry.id
  formSiteName.value = entry.siteName
  formUrl.value = entry.url
  formUsername.value = entry.username
  formPassword.value = entry.password
  showFormPassword.value = false
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
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
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

async function handleDelete(id: string): Promise<void> {
  if (confirm('确定要删除这个密码条目吗？')) {
    await passwordsStore.deletePassword(id)
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

// ===== 复制（与 PasswordManager.vue copyToClipboard 一致：clipboard API + show-toast，失败降级 execCommand）=====
async function copyToClipboard(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    // 使用 toast 提示
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
  <div class="wb-password">
    <!-- ① 设置主密码（首次进入，无 password-verification-v2） -->
    <div v-if="!passwordsStore.isUnlocked && isNewSetup" class="pwd-auth">
      <div class="pwd-auth-card">
        <h3>设置主密码</h3>
        <p class="pwd-auth-hint">首次使用，请设置主密码来保护您的密码数据</p>
        <input
          v-model="masterPasswordInput"
          type="password"
          placeholder="输入主密码"
          class="form-input"
          data-testid="pwd-setup-input"
          @keyup.enter="handleSetupMasterPassword"
        />
        <input
          v-model="masterPasswordConfirm"
          type="password"
          placeholder="确认主密码"
          class="form-input"
          data-testid="pwd-setup-confirm"
          @keyup.enter="handleSetupMasterPassword"
        />
        <p v-if="authError" class="pwd-auth-error" data-testid="pwd-auth-error">{{ authError }}</p>
        <button
          class="pwd-btn-primary"
          data-testid="pwd-setup-submit"
          :disabled="isUnlocking || !masterPasswordInput || !masterPasswordConfirm"
          @click="handleSetupMasterPassword"
        >
          {{ isUnlocking ? '设置中...' : '设置密码' }}
        </button>
      </div>
    </div>

    <!-- ② 解锁（已有主密码，尚未解锁） -->
    <div v-else-if="!passwordsStore.isUnlocked" class="pwd-auth">
      <div class="pwd-auth-card">
        <h3>输入主密码</h3>
        <p class="pwd-auth-hint">请输入主密码以解锁密码管理器</p>
        <input
          v-model="masterPasswordInput"
          type="password"
          placeholder="主密码"
          class="form-input"
          data-testid="pwd-unlock-input"
          @keyup.enter="handleUnlock"
        />
        <p v-if="authError" class="pwd-auth-error" data-testid="pwd-auth-error">{{ authError }}</p>
        <button
          class="pwd-btn-primary"
          data-testid="pwd-unlock-submit"
          :disabled="isUnlocking || !masterPasswordInput"
          @click="handleUnlock"
        >
          {{ isUnlocking ? '解锁中...' : '解锁' }}
        </button>
      </div>
    </div>

    <!-- ③ 已解锁：工具栏 + 新增/编辑表单 + 条目列表 -->
    <div v-else class="pwd-main">
      <div class="pwd-toolbar">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索密码…"
          class="form-input pwd-search"
          data-testid="pwd-search-input"
        />
        <button class="pwd-btn-lock" data-testid="pwd-lock-btn" title="锁定" @click="handleLock">
          🔒 锁定
        </button>
        <button class="pwd-btn-primary pwd-btn-add" data-testid="pwd-add-btn" @click="startAdd">
          + 新增密码
        </button>
      </div>

      <!-- 新增/编辑共用表单 -->
      <form v-if="showForm" class="pwd-form" @submit.prevent="handleSave">
        <h3>{{ editingId ? '编辑密码' : '新增密码' }}</h3>
        <div class="pwd-form-grid">
          <div class="form-group">
            <label>网站名称</label>
            <input
              v-model="formSiteName"
              type="text"
              placeholder="网站名称"
              class="form-input"
              data-testid="pwd-form-site"
            />
          </div>
          <div class="form-group">
            <label>网站 URL</label>
            <input
              v-model="formUrl"
              type="text"
              placeholder="https://example.com"
              class="form-input"
              data-testid="pwd-form-url"
            />
          </div>
          <div class="form-group">
            <label>用户名</label>
            <input
              v-model="formUsername"
              type="text"
              placeholder="用户名或邮箱"
              class="form-input"
              data-testid="pwd-form-username"
            />
          </div>
          <div class="form-group">
            <label>密码</label>
            <div class="pwd-password-wrap">
              <input
                v-model="formPassword"
                :type="showFormPassword ? 'text' : 'password'"
                placeholder="密码"
                class="form-input"
                data-testid="pwd-form-password"
              />
              <button type="button" class="pwd-eye-btn" title="显示/隐藏" @click="showFormPassword = !showFormPassword">
                {{ showFormPassword ? '🙈' : '👁️' }}
              </button>
            </div>
          </div>
        </div>
        <div class="pwd-form-actions">
          <button type="button" class="pwd-btn-cancel" data-testid="pwd-cancel-btn" @click="cancelForm">
            取消
          </button>
          <button type="submit" class="pwd-btn-primary" data-testid="pwd-save-btn" :disabled="!isFormValid">
            {{ editingId ? '保存' : '添加' }}
          </button>
        </div>
      </form>

      <!-- 空态 -->
      <div v-if="filteredPasswords.length === 0" class="pwd-empty" data-testid="pwd-empty">
        {{ searchQuery ? '没有找到匹配的密码' : '暂无保存的密码' }}
      </div>

      <!-- 条目列表 -->
      <div v-else class="pwd-list">
        <div v-for="entry in filteredPasswords" :key="entry.id" class="pwd-item" data-testid="pwd-item">
          <div class="pwd-info">
            <div class="pwd-item-header">
              <span class="pwd-site-name">{{ entry.siteName }}</span>
              <a
                class="pwd-site-url"
                :href="entry.url"
                target="_blank"
                rel="noopener noreferrer"
              >{{ entry.url }}</a>
            </div>
            <div class="pwd-details">
              <span class="pwd-username">👤 {{ entry.username }}</span>
              <span class="pwd-masked">
                🔑 {{ isPasswordVisible(entry.id) ? entry.password : '••••••••' }}
              </span>
            </div>
          </div>
          <div class="pwd-actions">
            <button
              class="pwd-icon-btn"
              :title="isPasswordVisible(entry.id) ? '隐藏密码' : '显示密码'"
              :data-testid="`pwd-toggle-${entry.id}`"
              @click="togglePasswordVisibility(entry.id)"
            >
              {{ isPasswordVisible(entry.id) ? '🙈' : '👁️' }}
            </button>
            <button
              class="pwd-icon-btn"
              title="复制用户名"
              :data-testid="`pwd-copy-username-${entry.id}`"
              @click="copyToClipboard(entry.username, '用户名')"
            >📋</button>
            <button
              class="pwd-icon-btn"
              title="复制密码"
              :data-testid="`pwd-copy-password-${entry.id}`"
              @click="copyToClipboard(entry.password, '密码')"
            >🔐</button>
            <button
              class="pwd-icon-btn"
              title="编辑"
              :data-testid="`pwd-edit-${entry.id}`"
              @click="startEdit(entry)"
            >✏️</button>
            <button
              class="pwd-icon-btn pwd-delete"
              title="删除"
              :data-testid="`pwd-delete-${entry.id}`"
              @click="handleDelete(entry.id)"
            >🗑️</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 面板容器（WorkbenchView 的 .wb-content 已提供滚动与背景，此处不 position:fixed） */
.wb-password {
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
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  padding: 24px;
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.pwd-auth-card h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  margin: 0 0 6px 0;
}

.pwd-auth-hint {
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
  margin: 0 0 18px 0;
}

.pwd-auth-card .form-input {
  margin-bottom: 12px;
}

.pwd-auth-card .pwd-btn-primary {
  width: 100%;
}

.pwd-auth-error {
  color: var(--error-color, #ef4444);
  font-size: 13px;
  margin: 0 0 12px 0;
}

/* ===== 输入框 ===== */
.form-input {
  padding: 9px 12px;
  background-color: var(--input-bg, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  color: var(--text-primary, var(--color-text));
  box-sizing: border-box;
  transition: border-color var(--transition-fast, 0.15s ease);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-color, var(--color-primary));
}

/* ===== 主按钮 ===== */
.pwd-btn-primary {
  padding: 10px 18px;
  background: var(--accent-color, var(--color-primary));
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: #fff;
  white-space: nowrap;
  transition: background-color var(--transition-fast, 0.15s ease);
}

.pwd-btn-primary:hover:not(:disabled) {
  background: var(--accent-hover, var(--color-primary-hover));
}

.pwd-btn-primary:disabled {
  background: var(--text-muted, var(--color-text-muted));
  cursor: not-allowed;
}

/* ===== 工具栏 ===== */
.pwd-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pwd-search {
  flex: 1;
  min-width: 160px;
}

.pwd-btn-add {
  flex-shrink: 0;
}

.pwd-btn-lock {
  padding: 9px 14px;
  font-size: 13px;
  border-radius: var(--radius-full, 999px);
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  color: var(--text-secondary, var(--color-text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.pwd-btn-lock:hover {
  color: var(--accent-color, var(--color-primary));
  border-color: var(--accent-color, var(--color-primary));
}

/* ===== 新增/编辑表单 ===== */
.pwd-form {
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  padding: 16px;
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
}

.pwd-form h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  margin: 0 0 14px 0;
}

.pwd-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, var(--color-text-secondary));
  margin-bottom: 6px;
}

.pwd-password-wrap {
  position: relative;
}

.pwd-password-wrap .form-input {
  padding-right: 36px;
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

.pwd-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.pwd-btn-cancel {
  padding: 9px 16px;
  background: var(--bg-secondary, var(--color-bg-hover));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  cursor: pointer;
  color: var(--text-secondary, var(--color-text-secondary));
  white-space: nowrap;
  transition: all var(--transition-fast, 0.15s ease);
}

.pwd-btn-cancel:hover {
  background: var(--hover-bg, var(--color-bg-active));
}

/* ===== 列表 ===== */
.pwd-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pwd-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px solid var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.08));
  transition: border-color var(--transition-fast, 0.15s ease);
}

.pwd-item:hover {
  border-color: var(--accent-color, var(--color-primary));
}

.pwd-info {
  flex: 1;
  min-width: 0;
}

.pwd-item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.pwd-site-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, var(--color-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pwd-site-url {
  font-size: 12px;
  color: var(--text-muted, var(--color-text-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
  flex-shrink: 0;
  max-width: 45%;
}

.pwd-site-url:hover {
  color: var(--accent-color, var(--color-primary));
  text-decoration: underline;
}

.pwd-details {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary, var(--color-text-secondary));
}

.pwd-masked {
  font-family: monospace;
}

.pwd-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.pwd-icon-btn {
  padding: 6px 7px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity var(--transition-fast, 0.15s ease);
  border-radius: var(--radius-sm, 6px);
}

.pwd-icon-btn:hover {
  opacity: 1;
  background: var(--bg-secondary, var(--color-bg-hover));
}

.pwd-icon-btn.pwd-delete:hover {
  color: var(--error-color, var(--color-error));
}

/* ===== 空态 ===== */
.pwd-empty {
  text-align: center;
  color: var(--text-muted, var(--color-text-muted));
  font-size: 14px;
  padding: 40px 20px;
  background: var(--bg-card, var(--color-bg-card));
  border: 1px dashed var(--border-color, var(--color-border));
  border-radius: var(--radius-md, 10px);
}

/* ===== 暗色模式覆盖 ===== */
:root.dark .pwd-auth-card,
:root.dark .pwd-form,
:root.dark .pwd-item,
:root.dark .pwd-empty {
  background-color: var(--bg-secondary, #1f2937);
}

:root.dark .pwd-item {
  box-shadow: none;
}

:root.dark .pwd-auth-card h3,
:root.dark .pwd-form h3 {
  color: var(--text-primary, #f9fafb);
}

:root.dark .pwd-auth-hint {
  color: var(--text-secondary, #d1d5db);
}

:root.dark .pwd-auth-card .form-input,
:root.dark .pwd-form .form-input,
:root.dark .pwd-search {
  background-color: var(--input-bg, #374151);
  color: var(--text-primary, #f9fafb);
  border-color: var(--border-color, #374151);
}

:root.dark .pwd-btn-lock,
:root.dark .pwd-btn-cancel {
  background-color: var(--bg-card, #1f2937);
  color: var(--text-secondary, #d1d5db);
  border-color: var(--border-color, #374151);
}

:root.dark .pwd-icon-btn:hover {
  background-color: var(--hover-bg, #374151);
}

:root.dark .pwd-site-name {
  color: var(--text-primary, #f9fafb);
}

:root.dark .pwd-site-url,
:root.dark .pwd-details {
  color: var(--text-secondary, #d1d5db);
}

@media (max-width: 640px) {
  .pwd-form-grid {
    grid-template-columns: 1fr;
  }

  .pwd-item {
    flex-wrap: wrap;
  }

  .pwd-actions {
    margin-left: auto;
  }
}
</style>
