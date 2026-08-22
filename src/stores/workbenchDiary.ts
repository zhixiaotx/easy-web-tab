import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { DiaryData, WorkbenchDiary } from '@/types'
import { emptyDiaryData, findDiaryByDate, normalizeDiaryData, sortDiaryEntries } from '../composables/diaryCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

// 工作台日记本 store（数据存 IndexedDB store 'diary'：每天一条，date 本地 'YYYY-MM-DD' 唯一，upsert 语义，经 diaryCore 归一化后读写）
export const useWorkbenchDiaryStore = defineStore('workbench-diary', () => {
  const entries = ref<WorkbenchDiary[]>([])

  async function loadDiary(): Promise<void> {
    try {
      // 存量脏数据（非法 date 条目/缺 id/非字符串 content 等）经 normalizeDiaryData 幂等归一
      entries.value = normalizeDiaryData(await idbGet<DiaryData>('diary')).entries
    } catch (e) {
      console.error('[Diary] load failed', e)
      entries.value = emptyDiaryData().entries
    }
  }

  async function saveDiary(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError），需写入原始数据。
      // 存 DiaryData 对象形状 { entries }——normalizeDiaryData 拒绝裸数组（diary 无旧数组格式，
      // 见 diaryCore normalizeDiaryData Array.isArray → empty），写裸数组会导致保存后刷新日记全部丢失（T5 QA 实证）
      await idbPut('diary', { entries: toRaw(entries.value) })
      markDirty()
    } catch (e) {
      console.error('[Diary] save failed', e)
    }
  }

  /**
   * 按日期 upsert 当天日记：content trim 后为空 → 跳过（不保存，面板负责 toast「内容为空」）。
   * 命中已有条目 → 更新 content/updatedAt；未命中 → 新建（id `dy_` 前缀，时间戳+随机后缀防同毫秒碰撞）。
   */
  async function upsertEntry(date: string, content: string): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    const existing = findDiaryByDate(entries.value, date)
    if (existing) {
      existing.content = trimmed
      existing.updatedAt = now
    } else {
      entries.value.push({
        id: `dy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date,
        content: trimmed,
        createdAt: now,
        updatedAt: now
      })
    }
    await saveDiary()
  }

  async function deleteEntry(id: string): Promise<void> {
    // 从 toRaw 的原始数组 filter：在 reactive 代理上直接 filter 会得到 Proxy 元素，
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError
    entries.value = toRaw(entries.value).filter(e => e.id !== id)
    await saveDiary()
  }

  // 排序：date 降序 → createdAt 降序（公式属 diaryCore，store 只做薄委托）
  const sortedEntries = computed<WorkbenchDiary[]>(() => sortDiaryEntries(entries.value))

  return {
    entries,
    loadDiary,
    saveDiary,
    upsertEntry,
    deleteEntry,
    sortedEntries
  }
})
