import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PasswordEntry } from '../types'
import {
  encrypt,
  decrypt,
  decryptWithSalt,
  verifyMasterPassword,
  setVerification,
  hasMasterPassword,
  getSaltHex
} from '../composables/useCrypto'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty, useCloudSync } from '@/composables/useCloudSync'
import { useAppSettingsStore } from '@/stores/settings'

const STORAGE_KEY = 'user-passwords'

/** 写操作结果：落盘与云推送分别报告，便于 UI 给出准确提示 */
export interface PasswordSaveResult {
  /** 是否已写入 IndexedDB（false = 未落盘，通常是密码库已锁定） */
  saved: boolean
  /** 是否已成功推送云端 */
  synced: boolean
  /** 是否已启用并配置云同步（false 时 synced=false 不算故障） */
  cloudEnabled: boolean
}

export const usePasswordsStore = defineStore('passwords', () => {
  const passwords = ref<PasswordEntry[]>([])
  const isUnlocked = ref(false)
  let currentMasterPassword = ''

  // 加载加密数据（IndexedDB 优先；localStorage 仅在 v2 验证存在时一次性迁移）
  async function loadPasswords(masterPassword: string): Promise<boolean> {
    let stored: string | undefined
    try {
      stored = await idbGet<string>('passwords')
    } catch (e) {
      console.error('[Passwords] load failed', e)
    }
    if (stored === undefined) {
      const legacy = localStorage.getItem(STORAGE_KEY)
      // 仅当 v2 验证存在时才迁移：v2 不存在说明是 v1 AES-GCM 旧库，
      // 绝不能复制（留给 migrateLegacyVault 流程），否则 crypto-js 解密失败且旧数据被"假迁移"
      if (legacy !== null && localStorage.getItem('password-verification-v2') !== null) {
        stored = legacy
        try {
          await idbPut('passwords', stored)
        } catch (e) {
          console.error('[Passwords] migrate to IDB failed', e)
        }
      }
    }
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

  /**
   * 落盘成功后立即主动推送云端。
   *
   * 必要性：全局同步策略是"密码永远云端覆盖本地"，本地改动若不及时推上去，
   * 下一次拉取就会被云端旧密文整体覆盖，表现为"改了又变回去"。
   *
   * 关键：这里只 push、绝不先 pull —— 先拉会先把本次改动覆盖掉，等于白改。
   * 未启用云同步时直接返回，静默跳过（不算故障）。
   */
  async function pushPasswordsToCloud(): Promise<{ synced: boolean; cloudEnabled: boolean }> {
    const settings = useAppSettingsStore()
    const cloudEnabled = Boolean(
      settings.cloudSyncEnabled &&
      settings.cloudSyncUrl &&
      settings.cloudSyncUsername &&
      settings.cloudSyncPassword
    )
    if (!cloudEnabled) return { synced: false, cloudEnabled: false }
    try {
      const { pushNow } = useCloudSync()
      // silent=true：提示交由调用方按操作语义给出，避免出现两条重复的 toast
      const synced = await pushNow(true)
      return { synced, cloudEnabled: true }
    } catch (e) {
      console.warn('[Passwords] cloud push failed', e)
      return { synced: false, cloudEnabled: true }
    }
  }

  // 保存到 IndexedDB（加密）+ 立即主动推送云端。
  // saved=false 最常见原因是密码库已锁定（currentMasterPassword 为空）——
  // 此时必须让调用方感知并提示用户重新解锁，否则会出现"界面显示已改、实际未落盘、
  // 也未 markDirty，云同步自然推不上去"的静默失败。
  async function savePasswords(): Promise<PasswordSaveResult> {
    if (!currentMasterPassword) {
      console.warn('[Passwords] save skipped: vault is locked (no master password)')
      return { saved: false, synced: false, cloudEnabled: false }
    }
    const json = JSON.stringify(passwords.value)
    const encrypted = await encrypt(json, currentMasterPassword)
    try {
      await idbPut('passwords', encrypted)
      markDirty()
    } catch (e) {
      console.error('[Passwords] save failed', e)
      return { saved: false, synced: false, cloudEnabled: false }
    }
    const { synced, cloudEnabled } = await pushPasswordsToCloud()
    return { saved: true, synced, cloudEnabled }
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

  // 添加密码（saved=false = 未保存，通常因密码库已锁定）
  async function addPassword(entry: Omit<PasswordEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<PasswordSaveResult> {
    const now = new Date().toISOString()
    passwords.value.push({
      ...entry,
      id: `pwd_${Date.now()}`,
      createdAt: now,
      updatedAt: now
    })
    return await savePasswords()
  }

  // 更新密码（saved=false = 未保存：id 不存在，或密码库已锁定）
  async function updatePassword(id: string, updates: Partial<Omit<PasswordEntry, 'id' | 'createdAt'>>): Promise<PasswordSaveResult> {
    const index = passwords.value.findIndex(p => p.id === id)
    if (index === -1) return { saved: false, synced: false, cloudEnabled: false }
    passwords.value[index] = {
      ...passwords.value[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    return await savePasswords()
  }

  // 删除密码（saved=false = 未保存，通常因密码库已锁定）
  async function deletePassword(id: string): Promise<PasswordSaveResult> {
    passwords.value = passwords.value.filter(p => p.id !== id)
    return await savePasswords()
  }

  // 搜索密码（按网站名称匹配；旧数据可能缺字段，防御处理避免渲染崩溃）
  function searchPasswords(query: string): PasswordEntry[] {
    if (!query) return passwords.value
    const lower = query.toLowerCase()
    return passwords.value.filter(p =>
      (p.siteName ?? '').toLowerCase().includes(lower)
    )
  }

  // 导出明文（用于 sites.md）
  function exportPasswords(): PasswordEntry[] {
    return [...passwords.value]
  }

  // 导出加密数据（用于 sites.md frontmatter）
  // password 字段格式: hexSalt|base64(iv).base64(cipher)，| 为分隔符，保证跨设备可解密
  async function exportEncryptedPasswords(): Promise<PasswordEntry[]> {
    if (!currentMasterPassword || passwords.value.length === 0) return []
    const saltHex = getSaltHex()
    const entries: PasswordEntry[] = []
    for (const entry of passwords.value) {
      entries.push({
        ...entry,
        password: `${saltHex}|${await encrypt(entry.password, currentMasterPassword)}`
      })
    }
    return entries
  }

  // 导入密码（从 sites.md，password 字段为加密数据）
  async function importPasswords(entries: PasswordEntry[]): Promise<{ imported: number; failed: number; saved: boolean; synced: boolean; cloudEnabled: boolean }> {
    if (!currentMasterPassword) return { imported: 0, failed: entries.length, saved: false, synced: false, cloudEnabled: false }
    let imported = 0
    let failed = 0
    for (const entry of entries) {
      try {
        // 检测盐前缀：有则用嵌入盐解密（跨设备），无则回退当前设备盐（旧格式兼容）
        const saltIndex = entry.password.indexOf('|')
        let decryptedPassword: string
        if (saltIndex !== -1) {
          const saltHex = entry.password.slice(0, saltIndex)
          const ciphertext = entry.password.slice(saltIndex + 1)
          decryptedPassword = await decryptWithSalt(ciphertext, currentMasterPassword, saltHex)
        } else {
          decryptedPassword = await decrypt(entry.password, currentMasterPassword)
        }
        const decryptedEntry = { ...entry, password: decryptedPassword }

        const existing = passwords.value.find(p => p.id === entry.id)
        if (existing) {
          Object.assign(existing, decryptedEntry)
        } else {
          passwords.value.push(decryptedEntry)
        }
        imported++
      } catch {
        failed++
        console.warn(`[Passwords] Failed to decrypt entry: ${entry.siteName}`)
      }
    }
    let saved = false
    let synced = false
    let cloudEnabled = false
    if (imported > 0) {
      const result = await savePasswords()
      saved = result.saved
      synced = result.synced
      cloudEnabled = result.cloudEnabled
    }
    return { imported, failed, saved, synced, cloudEnabled }
  }

  // 迁移旧版密码数据（v1：Web Crypto AES-GCM + 无 -v2 后缀的旧 key）
  async function migrateLegacyVault(oldMasterPassword: string): Promise<{ ok: boolean; message: string }> {
    const legacyVerification = localStorage.getItem('password-verification') // v1 旧 key（无 -v2）
    const hasV2 = localStorage.getItem('password-verification-v2') !== null
    if (!legacyVerification || hasV2) {
      return { ok: false, message: '没有检测到需要迁移的旧版密码数据' }
    }

    try {
      // 尝试用旧盐（v1: password-salt，JSON 数字数组）派生 PBKDF2 key 并解密旧 user-passwords
      const legacySaltRaw = localStorage.getItem('password-salt')
      if (!legacySaltRaw) {
        return { ok: false, message: '未找到旧版盐数据，无法迁移（请手动重新录入密码）' }
      }
      // v1 盐是 JSON 数组如 [1,2,3,...]，数组元素是字节值 → 手动拼 hex；否则可能已是 hex
      let legacySaltHex: string
      try {
        const parsed = JSON.parse(legacySaltRaw)
        if (Array.isArray(parsed)) {
          legacySaltHex = parsed.map((b: number) => b.toString(16).padStart(2, '0')).join('')
        } else {
          legacySaltHex = legacySaltRaw
        }
      } catch {
        legacySaltHex = legacySaltRaw
      }
      const stored = localStorage.getItem('user-passwords')
      if (!stored) {
        // 无旧 vault 数据，仅清理旧 verification 标记并视作完成
        localStorage.removeItem('password-verification')
        return { ok: true, message: '迁移完成（无旧密码数据）' }
      }
      const decrypted = await decryptWithSalt(stored, oldMasterPassword, legacySaltHex)
      const legacyEntries = JSON.parse(decrypted) as PasswordEntry[]
      if (!Array.isArray(legacyEntries)) throw new Error('旧数据格式无效')
      // 迁移：写入当前 vault（用 v2 盐重新加密），并建立 v2 验证标记
      passwords.value = legacyEntries
      currentMasterPassword = oldMasterPassword
      isUnlocked.value = true
      await savePasswords()
      await setVerification(oldMasterPassword)
      // 清理旧 key
      localStorage.removeItem('password-verification')
      localStorage.removeItem('password-salt')
      return { ok: true, message: `迁移成功：已恢复 ${legacyEntries.length} 条密码` }
    } catch {
      // 旧 AES-GCM 密文在 crypto-js 下解密必然抛错 → 给用户明确提示（预期行为，非 bug）
      return { ok: false, message: '迁移失败：旧数据为 AES-GCM 加密（需 Web Crypto/HTTPS 环境），请手动重新录入密码' }
    }
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
    importPasswords,
    migrateLegacyVault
  }
})
