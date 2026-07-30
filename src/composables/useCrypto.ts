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
  const [ivBase64, dataBase64] = ciphertext.split('.')
  const salt = getSalt()
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
