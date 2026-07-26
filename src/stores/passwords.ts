import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PasswordEntry } from '../types'
import { encrypt, decrypt, verifyMasterPassword, setVerification, hasMasterPassword } from '../composables/useCrypto'

const STORAGE_KEY = 'user-passwords'

export const usePasswordsStore = defineStore('passwords', () => {
  const passwords = ref<PasswordEntry[]>([])
  const isUnlocked = ref(false)
  let currentMasterPassword = ''

  // 加载加密数据
  async function loadPasswords(masterPassword: string): Promise<boolean> {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      passwords.value = []
      isUnlocked.value = true
      currentMasterPassword = masterPassword
      return true
    }

    try {
      const decrypted = await decrypt(stored, masterPassword)
      passwords.value = JSON.parse(decrypted)
      isUnlocked.value = true
      currentMasterPassword = masterPassword
      return true
    } catch {
      return false
    }
  }

  // 保存到 localStorage（加密）
  async function savePasswords(): Promise<void> {
    if (!currentMasterPassword) return
    const json = JSON.stringify(passwords.value)
    const encrypted = await encrypt(json, currentMasterPassword)
    localStorage.setItem(STORAGE_KEY, encrypted)
  }

  // 设置主密码
  async function setupMasterPassword(password: string): Promise<void> {
    await setVerification(password)
    currentMasterPassword = password
    isUnlocked.value = true
    passwords.value = []
    await savePasswords()
  }

  // 验证主密码
  async function unlock(password: string): Promise<boolean> {
    const valid = await verifyMasterPassword(password)
    if (valid) {
      await loadPasswords(password)
    }
    return valid
  }

  // 锁定
  function lock(): void {
    isUnlocked.value = false
    currentMasterPassword = ''
    passwords.value = []
  }

  // 添加密码
  async function addPassword(entry: Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const now = new Date().toISOString()
    passwords.value.push({
      ...entry,
      id: `pwd_${Date.now()}`,
      createdAt: now,
      updatedAt: now
    })
    await savePasswords()
  }

  // 更新密码
  async function updatePassword(id: string, updates: Partial<Omit<PasswordEntry, 'id' | 'createdAt'>>): Promise<void> {
    const index = passwords.value.findIndex(p => p.id === id)
    if (index !== -1) {
      passwords.value[index] = {
        ...passwords.value[index],
        ...updates,
        updatedAt: new Date().toISOString()
      }
      await savePasswords()
    }
  }

  // 删除密码
  async function deletePassword(id: string): Promise<void> {
    passwords.value = passwords.value.filter(p => p.id !== id)
    await savePasswords()
  }

  // 搜索密码
  function searchPasswords(query: string): PasswordEntry[] {
    if (!query) return passwords.value
    const lower = query.toLowerCase()
    return passwords.value.filter(p =>
      p.siteName.toLowerCase().includes(lower) ||
      p.url.toLowerCase().includes(lower) ||
      p.username.toLowerCase().includes(lower)
    )
  }

  // 导出明文（用于 sites.md）
  function exportPasswords(): PasswordEntry[] {
    return [...passwords.value]
  }

  // 导出加密数据（用于 sites.md frontmatter）
  async function exportEncryptedPasswords(): Promise<PasswordEntry[]> {
    if (!currentMasterPassword || passwords.value.length === 0) return []
    const entries: PasswordEntry[] = []
    for (const entry of passwords.value) {
      entries.push({
        ...entry,
        password: await encrypt(entry.password, currentMasterPassword)
      })
    }
    return entries
  }

  // 导入密码（从 sites.md，password 字段为加密数据）
  async function importPasswords(entries: PasswordEntry[]): Promise<number> {
    if (!currentMasterPassword) return 0
    let imported = 0
    for (const entry of entries) {
      try {
        // 解密密码字段
        const decryptedPassword = await decrypt(entry.password, currentMasterPassword)
        const decryptedEntry = { ...entry, password: decryptedPassword }
        
        const existing = passwords.value.find(p => p.id === entry.id)
        if (existing) {
          Object.assign(existing, decryptedEntry)
        } else {
          passwords.value.push(decryptedEntry)
        }
        imported++
      } catch {
        // 解密失败则跳过
        console.warn(`[Passwords] Failed to decrypt entry: ${entry.siteName}`)
      }
    }
    if (imported > 0) {
      await savePasswords()
    }
    return imported
  }

  return {
    passwords,
    isUnlocked,
    hasMasterPassword,
    loadPasswords,
    setupMasterPassword,
    unlock,
    lock,
    addPassword,
    updatePassword,
    deletePassword,
    searchPasswords,
    exportPasswords,
    exportEncryptedPasswords,
    importPasswords
  }
})
