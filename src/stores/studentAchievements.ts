// 学生工作台成就勋章 store
// 数据存 IndexedDB store 'student_achievements' 单对象 { definitions, unlocked }。
// 内置 10 枚勋章定义不可编辑、不可手动撤销；解锁由各 store 数据聚合触发（recomputeUnlocks）。
// 薄委托 studentAchievementCore：归一化/合并内置/指标计算/解锁判定/统计/分类筛选均为纯函数，
// store 禁止内联重算。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  normalizeAchievementsData,
  mergeBuiltinAchievements,
  calcAchievementStats as calcAchievementStatsCore,
  filterByCategory as filterByCategoryCore,
  checkUnlocks as checkUnlocksCore,
  calcProgressPercent as calcProgressPercentCore,
  formatUnlockTime as formatUnlockTimeCore,
  categoryLabel as categoryLabelCore,
  isoNowForAchievements,
  type AchievementMetrics,
  type AchievementStats
} from '@/composables/studentAchievementCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import type {
  StudentAchievementCategory,
  StudentAchievementDef,
  StudentAchievementsData
} from '@/types'

const STORE_KEY = 'student_achievements'

export type StudentAchievementOpError = 'not-found' | 'already-unlocked'
export type StudentAchievementOp = { ok: boolean; reason?: StudentAchievementOpError }

export const useStudentAchievementsStore = defineStore('studentAchievements', () => {
  const definitions = ref<StudentAchievementDef[]>([])
  const unlocked = ref<Record<string, string>>({})

  // ========================================
  // 持久化
  // ========================================

  async function loadAchievements(): Promise<void> {
    try {
      const norm = normalizeAchievementsData(await idbGet<StudentAchievementsData>(STORE_KEY))
      // 合并内置（首次加载 / 老数据缺定义时补齐）
      definitions.value = mergeBuiltinAchievements(norm.definitions)
      unlocked.value = { ...norm.unlocked }
      // 若合并后定义有变化（补齐了内置）→ 落库保持一致
      if (definitions.value.length !== norm.definitions.length) {
        await saveAchievements()
      }
    } catch (e) {
      console.error('[studentAchievements] load failed', e)
      // 兜底：构建内置 10 枚空解锁
      definitions.value = mergeBuiltinAchievements([])
      unlocked.value = {}
    }
  }

  async function saveAchievements(): Promise<void> {
    try {
      //, ：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError）
      await idbPut(STORE_KEY, {
        definitions: JSON.parse(JSON.stringify(definitions.value)),
        unlocked: JSON.parse(JSON.stringify(unlocked.value))
      })
    } catch (e) {
      console.error('[studentAchievements] save failed', e)
    }
  }

  // ========================================
  // 自动解锁（核心入口，由面板 onMounted/监听 store 变化时调用）
  // ========================================

  /**
   * 基于跨 store 指标重算解锁状态：扫描所有未解锁勋章，达成则写入 unlocked（带时间戳）。
   * 返回新解锁的 id 列表（供 UI 弹 toast / 解锁动画用）。
   * 幂等：已解锁的不再触发；空 metrics 全部跳过。
   */
  async function recomputeUnlocks(metrics: AchievementMetrics): Promise<string[]> {
    const newIds = checkUnlocksCore(definitions.value, unlocked.value, metrics)
    if (newIds.length === 0) return []
    const now = isoNowForAchievements()
    const next = { ...unlocked.value }
    for (const id of newIds) {
      next[id] = now
    }
    unlocked.value = next
    await saveAchievements()
    return newIds
  }

  // ========================================
  // 手动解锁（家长模式；M3 桩，不接受未在 definitions 的 id）
  // ========================================

  /** 手动解锁单条勋章（家长模式下发放特殊勋章）。幂等：已解锁返回 already-unlocked。 */
  async function manualUnlock(id: string): Promise<StudentAchievementOp> {
    const def = definitions.value.find(d => d.id === id)
    if (!def) return { ok: false, reason: 'not-found' }
    if (unlocked.value[id]) return { ok: false, reason: 'already-unlocked' }
    unlocked.value = { ...unlocked.value, [id]: isoNowForAchievements() }
    await saveAchievements()
    return { ok: true }
  }

  // ========================================
  // 薄委托查询（视图层禁止内联重算）
  // ========================================

  /** 是否已解锁 */
  function isUnlocked(id: string): boolean {
    return !!unlocked.value[id]
  }

  /** 解锁时间 ISO（未解锁返回 undefined） */
  function getUnlockTime(id: string): string | undefined {
    return unlocked.value[id]
  }

  /** 解锁时间本地可读字符串（未解锁返回空串） */
  function unlockTimeText(id: string): string {
    return formatUnlockTimeCore(unlocked.value[id])
  }

  /** 按分类筛选（'all' 全部） */
  function filterByCategory(category: 'all' | StudentAchievementCategory): StudentAchievementDef[] {
    return filterByCategoryCore(definitions.value, category)
  }

  /** 单条进度百分比（0-100 整数；已解锁恒 100） */
  function progressPercent(def: StudentAchievementDef, metrics: AchievementMetrics): number {
    return calcProgressPercentCore(def, metrics, isUnlocked(def.id))
  }

  /** 统计 */
  function stats(): AchievementStats {
    return calcAchievementStatsCore(definitions.value, unlocked.value)
  }

  /** 分类中文标签 */
  function categoryText(category: StudentAchievementCategory): string {
    return categoryLabelCore(category)
  }

  return {
    // 状态
    definitions,
    unlocked,
    // 持久化
    loadAchievements,
    saveAchievements,
    // 解锁
    recomputeUnlocks,
    manualUnlock,
    // 查询
    isUnlocked,
    getUnlockTime,
    unlockTimeText,
    filterByCategory,
    progressPercent,
    stats,
    categoryText
  }
})
