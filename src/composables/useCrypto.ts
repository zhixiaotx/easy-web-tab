/**
 * 密码加密工具（crypto-js 实现）
 * 使用 AES-CBC + PBKDF2 加密密码
 * 纯 JS 实现，不依赖 Web Crypto API，HTTP 下也可用
 */
import CryptoJS from 'crypto-js'

const SALT_KEY = 'password-salt-v2'
const VERIFICATION_KEY = 'password-verification-v2'

/**
 * 获取或生成存储在 localStorage 中的 PBKDF2 salt
 */
function getSalt(): CryptoJS.lib.WordArray {
  const saltStr = localStorage.getItem(SALT_KEY)
  if (saltStr) {
    return CryptoJS.enc.Hex.parse(saltStr)
  }
  const salt = CryptoJS.lib.WordArray.random(16)
  localStorage.setItem(SALT_KEY, salt.toString(CryptoJS.enc.Hex))
  return salt
}

/**
 * 使用 PBKDF2 派生 AES 密钥
 */
function deriveKey(password: string, salt: CryptoJS.lib.WordArray): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 100000,
    hasher: CryptoJS.algo.SHA256
  })
}

/**
 * 加密字符串
 * 返回格式: base64(iv) + '.' + base64(密文)
 */
export async function encrypt(plaintext: string, masterPassword: string): Promise<string> {
  const salt = getSalt()
  const key = deriveKey(masterPassword, salt)
  const iv = CryptoJS.lib.WordArray.random(16) // AES-CBC 需要 16 字节 IV
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return iv.toString(CryptoJS.enc.Base64) + '.' + encrypted.ciphertext.toString(CryptoJS.enc.Base64)
}

/**
 * 解密字符串
 */
export async function decrypt(ciphertext: string, masterPassword: string): Promise<string> {
  return decryptCore(ciphertext, masterPassword, getSalt())
}

/**
 * 使用调用方传入的盐解密字符串（用于跨设备密码导入）
 * saltHex 为 hex 字符串，格式同 getSalt().toString(CryptoJS.enc.Hex)
 */
export async function decryptWithSalt(
  ciphertext: string,
  masterPassword: string,
  saltHex: string
): Promise<string> {
  return decryptCore(ciphertext, masterPassword, CryptoJS.enc.Hex.parse(saltHex))
}

/**
 * 解密核心逻辑：使用指定盐派生密钥并解密
 */
async function decryptCore(
  ciphertext: string,
  masterPassword: string,
  salt: CryptoJS.lib.WordArray
): Promise<string> {
  const [ivBase64, dataBase64] = ciphertext.split('.')
  const key = deriveKey(masterPassword, salt)
  const iv = CryptoJS.enc.Base64.parse(ivBase64)
  const ciphertextData = CryptoJS.enc.Base64.parse(dataBase64)

  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({ ciphertext: ciphertextData }),
    key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
  )
  return decrypted.toString(CryptoJS.enc.Utf8)
}

/**
 * 设置主密码验证
 * 加密一个已知字符串并存储在 localStorage 中，用于后续验证密码是否正确
 */
export async function setVerification(masterPassword: string): Promise<void> {
  const value = 'easy-web-tab-verification'
  const encrypted = await encrypt(value, masterPassword)
  localStorage.setItem(VERIFICATION_KEY, encrypted)
}

/**
 * 验证主密码是否正确
 */
export async function verifyMasterPassword(masterPassword: string): Promise<boolean> {
  const stored = localStorage.getItem(VERIFICATION_KEY)
  if (!stored) return false
  try {
    const decrypted = await decrypt(stored, masterPassword)
    return decrypted === 'easy-web-tab-verification'
  } catch {
    return false
  }
}

/**
 * 检查是否已设置主密码
 */
export function hasMasterPassword(): boolean {
  return localStorage.getItem(VERIFICATION_KEY) !== null
}

/**
 * 返回当前 PBKDF2 salt 的 hex 字符串
 * 用于跨设备密码导出时嵌入盐（导出格式: hexSalt|base64(iv).base64(cipher)）
 */
export function getSaltHex(): string {
  return getSalt().toString(CryptoJS.enc.Hex)
}

/**
 * 只读读取已存盐的 hex 字符串（不生成——导出侧不得凭空制造加密身份；未设置返回 null）
 */
export function getStoredSaltHex(): string | null {
  return localStorage.getItem(SALT_KEY)
}

/**
 * 只读读取主密码验证串密文（未设置返回 null）
 */
export function getStoredVerification(): string | null {
  return localStorage.getItem(VERIFICATION_KEY)
}

/**
 * 接管备份来源设备的加密身份：盐 + 验证串成对写入。
 * 任一参数为空字符串/非字符串 → no-op。调用方须保证 IDB 写入成功之后再调用。
 * 效果：备份中的密码 blob 在本设备可用「原设备的主密码」解锁验证并解密。
 */
export function adoptPasswordIdentity(saltHex: string, verification: string): void {
  if (!saltHex || !verification) return
  localStorage.setItem(SALT_KEY, saltHex)
  localStorage.setItem(VERIFICATION_KEY, verification)
}

// ============================================================
// 家长 PIN PBKDF2（独立于主密码：盐存 settings 而非 localStorage）
// 安全：PIN 明文永不落地，仅存 saltHex + PBKDF2(SHA256,100k,256bit) 派生 hashHex
// ============================================================

/** PBKDF2 迭代次数（与主密码一致 10 万次，权衡安全与性能） */
const PARENT_PIN_ITERATIONS = 100000
/** PIN 哈希派生 keySize（256bit = 8*32 WordArray） */
const PARENT_PIN_KEY_SIZE = 256 / 32
/** 盐字节数（128bit） */
const PARENT_PIN_SALT_BYTES = 16

/**
 * 家长 PIN 哈希结果
 * - saltHex: hex 字符串，存 settings.parentPinSalt
 * - hashHex: PBKDF2 派生哈希 hex，存 settings.parentPinVerification
 */
export interface ParentPinHash {
  saltHex: string
  hashHex: string
}

/**
 * 计算家长 PIN 的 PBKDF2 哈希。
 * - 不传 saltHex 时：随机生成 16 字节新盐（首次设置 PIN 用）
 * - 传入 saltHex 时：用给定盐重算（验证 PIN 用）
 * @param pin 明文 PIN（如 '123456'）
 * @param saltHex 可选，已存盐的 hex 字符串
 */
export function hashParentPin(pin: string, saltHex?: string): ParentPinHash {
  const salt = saltHex && typeof saltHex === 'string' && saltHex.length > 0
    ? CryptoJS.enc.Hex.parse(saltHex)
    : CryptoJS.lib.WordArray.random(PARENT_PIN_SALT_BYTES)
  const derived = CryptoJS.PBKDF2(pin, salt, {
    keySize: PARENT_PIN_KEY_SIZE,
    iterations: PARENT_PIN_ITERATIONS,
    hasher: CryptoJS.algo.SHA256
  })
  return {
    saltHex: salt.toString(CryptoJS.enc.Hex),
    hashHex: derived.toString(CryptoJS.enc.Hex)
  }
}

/**
 * 验证家长 PIN：用存储的盐重算哈希，与期望哈希字符串比对。
 * @returns true 表示 PIN 正确
 */
export function verifyParentPin(
  pin: string,
  storedSaltHex: string,
  expectedHashHex: string
): boolean {
  if (!pin || typeof pin !== 'string') return false
  if (!storedSaltHex || typeof storedSaltHex !== 'string') return false
  if (!expectedHashHex || typeof expectedHashHex !== 'string') return false
  const { hashHex } = hashParentPin(pin, storedSaltHex)
  return hashHex === expectedHashHex
}
