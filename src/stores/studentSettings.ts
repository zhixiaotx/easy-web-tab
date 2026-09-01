// 学生工作台设置 store（IDB store 'student_settings' 单对象）
// 管理学段/昵称/学号/学校/年级 + 菜单顺序/改名/可见性 + 学段默认值播种 + 家长 PIN
// M1 仅基础框架；M3 起补家长 PIN 加密：PBKDF2(100k,SHA256,256bit) 盐+哈希存 settings，明文永不落地
// 连续 5 次错误锁定 5 分钟；验证成功清零计数

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { idbGet, idbPut } from '@/composables/useIdb'
import { hashParentPin, verifyParentPin as verifyParentPinCrypto } from '@/composables/useCrypto'
import {
  normalizeStudentMenu,
  normalizeStudentMenuVisibility,
  moveStudentMenuItem,
  renameStudentMenuLabel,
  resolveStudentMenuItems,
  resolveStudentMenuAll,
  isStudentMenuEnabled as isStudentMenuEnabledCore,
  applyStageDefaultVisibility,
  type StudentMenuItem,
  type StudentMenuVisibility
} from '@/composables/studentMenuCore'
import {
  normalizeStage,
  planStageSwitch,
  stageDefaultSubjects,
  stageBadge,
  stageLabel,
  type StageSwitchPlan
} from '@/composables/studentStageCore'
import {
  emptyStudentSettings,
  STUDENT_MENU_DEFAULT_ORDER,
  STAGE_MENU_VISIBILITY,
  type StudentSettings,
  type StudentStage
} from '@/types'
import { markDirty } from '@/composables/useCloudSync'

const STORE_KEY = 'student_settings'

/** 允许的最大连续 PIN 输错次数 */
const MAX_FAILED_ATTEMPTS = 5
/** 锁定时长（毫秒）：5 分钟 */
const LOCK_DURATION_MS = 5 * 60 * 1000
/** PIN 格式正则：4-8 位纯数字（PRD 4.14.3） */
const PARENT_PIN_RE = /^\d{4,8}$/
/** PIN 弱口令黑名单：禁止全部字符相同（全 0、全 1、…、全 9） */
const PARENT_PIN_WEAK_RE = /^(\d)\1{3,7}$/
/** PIN 最大位数（UI 圆点渲染上限 + 输入截断上限） */
export const PARENT_PIN_MAX_LENGTH = 8
/** PIN 最小位数（setup 阶段二次确认下限 + verify 提交下限） */
export const PARENT_PIN_MIN_LENGTH = 4

export const useStudentSettingsStore = defineStore('studentSettings', () => {
  const settings = ref<StudentSettings>(emptyStudentSettings())
  const loaded = ref(false)

  // ========================================
  // 计算属性
  // ========================================

  /** 当前学段（归一化） */
  const stage = computed<StudentStage>(() => normalizeStage(settings.value.stage))

  /** 学段徽标（label + color） */
  const stageBadgeInfo = computed(() => stageBadge(stage.value))

  /** 学段中文标签 */
  const stageLabelName = computed(() => stageLabel(stage.value))

  /** 学生昵称（缺失回退「同学」） */
  const displayName = computed(() => {
    const name = settings.value.nickname?.trim()
    return name || '同学'
  })

  /** 菜单顺序（归一化保证恒 14 项） */
  const menuOrder = computed(() => normalizeStudentMenu(settings.value.menuOrder, settings.value.menuLabels).order)

  /** 菜单改名 */
  const menuLabels = computed(() => normalizeStudentMenu(settings.value.menuOrder, settings.value.menuLabels).labels)

  /** 菜单可见性（归一化） */
  const menuVisibility = computed<StudentMenuVisibility>(() =>
    normalizeStudentMenuVisibility(settings.value.menuVisibility)
  )

  /** 渲染用菜单项（按顺序，过滤关闭项） */
  const menuItems = computed<StudentMenuItem[]>(() =>
    resolveStudentMenuItems(menuOrder.value, menuLabels.value, menuVisibility.value)
  )

  /** 全量菜单项（设置弹窗列表用，含关闭项） */
  const menuAllItems = computed<StudentMenuItem[]>(() =>
    resolveStudentMenuAll({ ...settings.value, menuOrder: menuOrder.value, menuLabels: menuLabels.value })
  )

  /** 菜单键 → 是否启用（home 恒 true） */
  function isMenuEnabled(key: string): boolean {
    return isStudentMenuEnabledCore({ ...settings.value, menuVisibility: menuVisibility.value }, key)
  }

  /** 学科清单（缺失回退当前学段默认） */
  const subjects = computed<string[]>(() => {
    if (Array.isArray(settings.value.subjects) && settings.value.subjects.length > 0) {
      return settings.value.subjects
    }
    return stageDefaultSubjects(stage.value)
  })

  // ========================================
  // 持久化
  // ========================================

  async function saveSettings() {
    // 深拷贝：,  仅解包顶层 Proxy；settings.value 经 spread {...settings.value} 赋值后，
    // 嵌套属性（menuOrder/menuLabels）保持为 reactive Proxy，IDB 结构化克隆会 DataCloneError。
    // JSON.parse(JSON.stringify(...)) 彻底剥离所有 Proxy，保证 IDB 可序列化。
    const raw = JSON.parse(JSON.stringify(settings.value))
    await idbPut(STORE_KEY, raw)
    markDirty()
  }

  /** 非异步 setter 统一用此包装持久化：catch 错误日志，防止 fire-and-forget 静默丢数据 */
  function persist(): void {
    void saveSettings().catch(err => console.error('[studentSettings] save failed:', err))
  }

  async function loadSettings() {
    if (loaded.value) return
    const raw = await idbGet<StudentSettings>(STORE_KEY)
    settings.value = normalizeStudentSettings(raw)
    // 学段默认值播种：若 stageSeeded !== stage 则应用学段默认学科/番茄钟（M1 仅学科；
    // 习惯/番茄钟 store 在 M2-M4 实施，stageSeeded 标记暂不写入，待 M2 一起完成）
    loaded.value = true
  }

  // ========================================
  // 归一化（私有）
  // ========================================

  function normalizeStudentSettings(raw: unknown): StudentSettings {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyStudentSettings()
    const o = raw as Record<string, unknown>
    const normalizedStage = normalizeStage(o.stage)
    const menu = normalizeStudentMenu(o.menuOrder, o.menuLabels)
    const visibility = normalizeStudentMenuVisibility(o.menuVisibility)
    const out: StudentSettings = {
      stage: normalizedStage,
      menuOrder: menu.order,
      menuLabels: menu.labels,
      menuVisibility: visibility
    }
    if (typeof o.nickname === 'string' && o.nickname.trim()) {
      out.nickname = Array.from(o.nickname.trim()).slice(0, 12).join('')
    }
    if (typeof o.studentNo === 'string' && o.studentNo.trim()) {
      out.studentNo = o.studentNo.trim()
    }
    if (typeof o.school === 'string' && o.school.trim()) {
      out.school = o.school.trim()
    }
    if (typeof o.grade === 'string' && o.grade.trim()) {
      out.grade = o.grade.trim()
    }
    if (typeof o.birthday === 'string' && o.birthday.trim()) {
      out.birthday = o.birthday.trim()
    }
    const seed = normalizeStage(o.stageSeeded)
    if (seed === normalizedStage) {
      out.stageSeeded = seed
      // 仅当已播种时才采纳 subjects；未播种留空回退默认
      if (Array.isArray(o.subjects)) {
        out.subjects = (o.subjects as unknown[]).filter(s => typeof s === 'string') as string[]
      }
    }
    if (typeof o.parentPinSalt === 'string' && o.parentPinSalt) out.parentPinSalt = o.parentPinSalt
    if (typeof o.parentPinVerification === 'string' && o.parentPinVerification) out.parentPinVerification = o.parentPinVerification
    if (typeof o.parentLockedUntil === 'number' && Number.isFinite(o.parentLockedUntil)) {
      // 锁定已过期 → 丢弃锁定戳，避免僵尸锁定
      if (o.parentLockedUntil > Date.now()) out.parentLockedUntil = o.parentLockedUntil
    }
    if (typeof o.parentPinFailedAttempts === 'number' && Number.isFinite(o.parentPinFailedAttempts)) {
      out.parentPinFailedAttempts = Math.max(0, Math.min(MAX_FAILED_ATTEMPTS, Math.floor(o.parentPinFailedAttempts)))
    }
    return out
  }

  // ========================================
  // 学段切换
  // ========================================

  /** 切换学段（计算计划 → 应用菜单可见性 → 持久化；M2 起补播种学科/习惯/番茄钟） */
  async function switchStage(newStage: StudentStage): Promise<StageSwitchPlan> {
    const plan = planStageSwitch(settings.value, newStage)
    settings.value = {
      ...settings.value,
      stage: plan.stage,
      // 学段切换：对未显式配置的菜单键应用学段默认可见性
      menuVisibility: applyStageDefaultVisibility(menuVisibility.value, plan.menuVisibility)
    }
    // M2 起：实际播种由 StudentView 协调各模块 store，成功后调 markStageSeeded 写入标记
    await saveSettings()
    return plan
  }

  /** 标记学段播种完成（StudentView 在各模块 store 播种成功后调用）。 */
  async function markStageSeeded(stage: StudentStage): Promise<void> {
    if (settings.value.stageSeeded === stage) return
    settings.value = { ...settings.value, stageSeeded: stage }
    await saveSettings()
  }

  // ========================================
  // 字段 setters
  // ========================================

  function setNickname(name: string) {
    settings.value = { ...settings.value, nickname: Array.from(name.trim()).slice(0, 12).join('') }
    persist()
  }

  function setStudentNo(no: string) {
    settings.value = { ...settings.value, studentNo: no.trim() }
    persist()
  }

  function setSchool(school: string) {
    settings.value = { ...settings.value, school: school.trim() }
    persist()
  }

  function setGrade(grade: string) {
    settings.value = { ...settings.value, grade: grade.trim() }
    persist()
  }

  function setBirthday(birthday: string) {
    settings.value = { ...settings.value, birthday: birthday.trim() }
    persist()
  }

  // ========================================
  // 菜单 CRUD
  // ========================================

  function moveMenuItem(key: string, dir: 'up' | 'down') {
    const result = moveStudentMenuItem(menuOrder.value, key, dir)
    if (result.ok && result.order) {
      settings.value = { ...settings.value, menuOrder: result.order }
      persist()
    }
    return result
  }

  function renameMenuItem(key: string, name: string) {
    const result = renameStudentMenuLabel(menuLabels.value, key, name)
    if (result.ok && result.labels) {
      settings.value = { ...settings.value, menuLabels: result.labels }
      persist()
    }
    return result
  }

  function setMenuVisibility(key: string, visible: boolean) {
    const next: StudentMenuVisibility = { ...menuVisibility.value, [key]: visible }
    settings.value = { ...settings.value, menuVisibility: next }
    persist()
  }

  function resetMenu() {
    settings.value = {
      ...settings.value,
      menuOrder: [...STUDENT_MENU_DEFAULT_ORDER],
      menuLabels: {},
      // 重置菜单可见性回到当前学段默认值
      menuVisibility: applyStageDefaultVisibility({}, STAGE_MENU_VISIBILITY[stage.value])
    }
    persist()
  }

  // ========================================
  // 学科清单 CRUD（M1 基础：增删查；学科 store 在 M2 实施）
  // ========================================

  function setSubjects(list: string[]) {
    const seen = new Set<string>()
    const cleaned = list.filter(s => {
      const t = String(s ?? '').trim()
      if (!t || seen.has(t)) return false
      seen.add(t)
      return true
    })
    settings.value = { ...settings.value, subjects: cleaned, stageSeeded: stage.value }
    persist()
  }

  function addSubject(name: string) {
    const t = name.trim()
    if (!t) return false
    const current = subjects.value
    if (current.includes(t)) return false
    setSubjects([...current, t])
    return true
  }

  function removeSubject(name: string) {
    const t = name.trim()
    if (!t) return false
    setSubjects(subjects.value.filter(s => s !== t))
    return true
  }

  // ========================================
  // 家长 PIN（薄委托 useCrypto.hashParentPin / verifyParentPin）
  // ========================================

  /** PIN 校验返回结果 */
  type VerifyPinResult =
    | { ok: true }
    | { ok: false; reason: 'locked' | 'wrong'; remainingAttempts?: number; lockSeconds?: number }

  /** 是否已设置家长 PIN（salt + verification 均存在） */
  function hasParentPin(): boolean {
    return !!(settings.value.parentPinSalt && settings.value.parentPinVerification)
  }

  /** 当前锁定状态：未锁定返回 null，否则返回剩余锁定秒数（向上取整） */
  function lockRemainingSeconds(): number | null {
    const until = settings.value.parentLockedUntil
    if (!until || !Number.isFinite(until)) return null
    const diff = until - Date.now()
    if (diff <= 0) return null
    return Math.ceil(diff / 1000)
  }

  /**
   * 设置家长 PIN（首次设置或修改）：
   * - 校验：4-8 位纯数字（PRD 4.14.3）
   * - 弱口令拒绝：全相同数字（0000 / 1111 … / 99999999）
   * - PBKDF2 哈希 → 写 salt + verification → 清零错误计数 + 解锁 → 落库
   * - 无论是否已设置 PIN 均可调用（覆盖旧 PIN）
   * @returns true 表示成功；false 为 PIN 格式/弱口令错误
   */
  async function setParentPin(pin: string): Promise<boolean> {
    if (!PARENT_PIN_RE.test(pin)) return false
    if (PARENT_PIN_WEAK_RE.test(pin)) return false
    const { saltHex, hashHex } = hashParentPin(pin)
    settings.value = {
      ...settings.value,
      parentPinSalt: saltHex,
      parentPinVerification: hashHex,
      parentPinFailedAttempts: 0,
      parentLockedUntil: undefined
    }
    await saveSettings()
    return true
  }

  /**
   * 验证家长 PIN：
   * - 先检查锁定：若已锁定返回 reason:'locked' + lockSeconds
   * - PBKDF2 重算比对：
   *   - 正确：清零错误计数 + 落库 → ok
   *   - 错误：计数 +1；达到 MAX_FAILED_ATTEMPTS 写入 LOCK_DURATION_MS 锁定 → reason:'wrong' + remainingAttempts
   */
  async function verifyPin(pin: string): Promise<VerifyPinResult> {
    // 锁定检查
    const lockSec = lockRemainingSeconds()
    if (lockSec !== null) {
      return { ok: false, reason: 'locked', lockSeconds: lockSec }
    }
    const salt = settings.value.parentPinSalt
    const expected = settings.value.parentPinVerification
    if (!salt || !expected) {
      // 未设 PIN：按「无 PIN」判定（调用方应先调 hasParentPin 判断），这里返回 wrong
      return { ok: false, reason: 'wrong' }
    }
    if (verifyParentPinCrypto(pin, salt, expected)) {
      // 正确：清零计数
      if (settings.value.parentPinFailedAttempts) {
        settings.value = { ...settings.value, parentPinFailedAttempts: 0 }
        await saveSettings()
      }
      return { ok: true }
    }
    // 错误：+1 计数，达到阈值锁定
    const curAttempts = settings.value.parentPinFailedAttempts ?? 0
    const nextAttempts = curAttempts + 1
    if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
      settings.value = {
        ...settings.value,
        parentPinFailedAttempts: MAX_FAILED_ATTEMPTS,
        parentLockedUntil: Date.now() + LOCK_DURATION_MS
      }
      await saveSettings()
      return { ok: false, reason: 'wrong', remainingAttempts: 0, lockSeconds: Math.ceil(LOCK_DURATION_MS / 1000) }
    }
    settings.value = { ...settings.value, parentPinFailedAttempts: nextAttempts }
    await saveSettings()
    return { ok: false, reason: 'wrong', remainingAttempts: MAX_FAILED_ATTEMPTS - nextAttempts }
  }

  /**
   * 清除家长 PIN（需先通过 verifyPin 验证）
   * @returns true 成功；false 未设置 PIN 或验证未通过
   */
  async function clearParentPin(): Promise<boolean> {
    if (!hasParentPin()) return false
    // 清除 salt + verification + 错误计数 + 锁定
    const { parentPinSalt: _, parentPinVerification: __, parentLockedUntil: ___, parentPinFailedAttempts: ____, ...rest } = settings.value
    settings.value = { ...rest }
    await saveSettings()
    return true
  }

  return {
    // 状态
    settings,
    loaded,
    // 计算属性
    stage,
    stageBadgeInfo,
    stageLabelName,
    displayName,
    menuOrder,
    menuLabels,
    menuVisibility,
    menuItems,
    menuAllItems,
    subjects,
    // 加载/保存
    loadSettings,
    saveSettings,
    // 学段
    switchStage,
    markStageSeeded,
    // 字段
    setNickname,
    setStudentNo,
    setSchool,
    setGrade,
    setBirthday,
    // 菜单
    moveMenuItem,
    renameMenuItem,
    setMenuVisibility,
    isMenuEnabled,
    resetMenu,
    // 学科
    setSubjects,
    addSubject,
    removeSubject,
    // 家长 PIN
    hasParentPin,
    lockRemainingSeconds,
    setParentPin,
    verifyPin,
    clearParentPin
  }
})
