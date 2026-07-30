/**
 * Web Crypto API 加密工具
 * 使用 AES-GCM + PBKDF2 加密密码
 */
const SALT_KEY = 'password-salt'
const VERIFICATION_KEY = 'password-verification'

/**
 * 检查 Web Crypto API 在当前上下文中是否可用。
 * crypto.subtle 仅在安全上下文（HTTPS / localhost）中可用。
 * 在 HTTP 部署的 nginx 中，Firefox/Safari 会返回 undefined。
 */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined'
    && typeof crypto.subtle !== 'undefined'
}

function requireCrypto(): void {
  if (!isCryptoAvailable()) {
    throw new Error('CRYPTO_UNAVAILABLE: 当前页面未使用 HTTPS，加密功能不可用。请通过 HTTPS 访问。')
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer.slice(0) as ArrayBuffer
}

// 确保 Uint8Array 的 buffer 是纯 ArrayBuffer（TS 5.7+ 要求）
function ensureArrayBuffer(u8: Uint8Array): Uint8Array<ArrayBuffer> {
  if (u8.buffer instanceof ArrayBuffer) {
    return new Uint8Array(u8.buffer.slice(0))
  }
  // SharedArrayBuffer fallback → 复制到新 ArrayBuffer
  const ab = new ArrayBuffer(u8.byteLength)
  new Uint8Array(ab).set(u8)
  return new Uint8Array(ab)
}

async function getSalt(): Promise<Uint8Array<ArrayBuffer>> {
  let saltStr = localStorage.getItem(SALT_KEY)
  if (saltStr) {
    return ensureArrayBuffer(new Uint8Array(JSON.parse(saltStr)))
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  localStorage.setItem(SALT_KEY, JSON.stringify(Array.from(salt)))
  return ensureArrayBuffer(salt)
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * 加密字符串
 */
export async function encrypt(plaintext: string, masterPassword: string): Promise<string> {
  requireCrypto()
  const salt = await getSalt()
  const key = await deriveKey(masterPassword, salt)
  const encoder = new TextEncoder()
  const iv = ensureArrayBuffer(crypto.getRandomValues(new Uint8Array(12)))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )
  return arrayBufferToBase64(iv.buffer) + '.' + arrayBufferToBase64(encrypted)
}

/**
 * 解密字符串
 */
export async function decrypt(ciphertext: string, masterPassword: string): Promise<string> {
  requireCrypto()
  const [ivBase64, dataBase64] = ciphertext.split('.')
  const salt = await getSalt()
  const key = await deriveKey(masterPassword, salt)
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64))
  const data = base64ToArrayBuffer(dataBase64)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )
  return new TextDecoder().decode(decrypted)
}

/**
 * 验证主密码是否正确（通过加密/解密验证字符串）
 */
export async function setVerification(masterPassword: string): Promise<void> {
  requireCrypto()
  const value = 'easy-web-tab-verification'
  const encrypted = await encrypt(value, masterPassword)
  localStorage.setItem(VERIFICATION_KEY, encrypted)
}

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
