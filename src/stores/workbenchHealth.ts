import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { HealthData, HealthModule, HealthPlan, HealthPlans, HealthRecord } from '@/types'
import {
  normalizeDietRecord,
  normalizeExerciseRecord,
  normalizeHealthData,
  normalizeSleepRecord,
  normalizeWeightRecord
} from '@/composables/healthCore'
import { idbGet, idbPut } from '../composables/useIdb'

// 各模块记录 id 前缀
const RECORD_PREFIX: Record<HealthModule, string> = {
  exercise: 'ex_',
  diet: 'dt_',
  sleep: 'sl_',
  weight: 'wt_'
}

// 各模块记录 normalize 函数映射（addRecord 按 module 分发）。
// sleep 缺省 durationHours 时 normalizeSleepRecord 内部按 sleepTime/wakeTime 补算（healthCore fallback 分支）。
const NORMALIZERS: Record<HealthModule, (raw: any) => HealthRecord> = {
  exercise: normalizeExerciseRecord,
  diet: normalizeDietRecord,
  sleep: normalizeSleepRecord,
  weight: normalizeWeightRecord
}

// 工作台健康管理 store（数据存 IndexedDB store 'health'，key 'items'）
export const useWorkbenchHealthStore = defineStore('workbenchHealth', () => {
  const height = ref<number | undefined>(undefined)
  const plans = ref<HealthPlans>({})
  const records = ref<HealthData['records']>({ exercise: [], diet: [], sleep: [], weight: [] })

  async function loadHealth(): Promise<void> {
    try {
      // IDB 存量旧结构/脏数据经 normalizeHealthData 幂等归一
      const data = normalizeHealthData(await idbGet<HealthData>('health'))
      height.value = data.height
      plans.value = data.plans
      records.value = data.records
    } catch (e) {
      // 加载失败降级为空态（保持默认值），不向上抛
      console.error('[workbenchHealth] loadHealth', e)
    }
  }

  async function saveHealth(): Promise<void> {
    try {
      // ref 的 .value 是 reactive Proxy，toRaw 只解开最外层一层——整包 toRaw({...}) 解不掉
      // 内层 proxy（实测 structuredClone 抛 DataCloneError），必须对每个字段逐个 toRaw，
      // 组装成纯对象后再写入 IDB
      await idbPut('health', {
        height: height.value,
        plans: toRaw(plans.value),
        records: toRaw(records.value)
      })
    } catch (e) {
      console.error('[workbenchHealth] saveHealth', e)
    }
  }

  async function setHeight(cm: number): Promise<void> {
    if (!(Number.isInteger(cm) && cm >= 100 && cm <= 250)) {
      console.warn('[workbenchHealth] setHeight 非法值已忽略（需 100-250 整数）', cm)
      return
    }
    height.value = cm
    await saveHealth()
  }

  async function setPlan(
    module: 'exercise' | 'diet' | 'sleep',
    plan: Omit<HealthPlan, 'module' | 'updatedAt'> | null
  ): Promise<void> {
    if (plan === null) {
      // delete 在 reactive 对象上响应式生效且不残留 undefined 键（避免 {...plans, [k]: undefined} 陷阱）
      delete plans.value[module]
    } else {
      plans.value[module] = { ...plan, module, updatedAt: new Date().toISOString() }
    }
    await saveHealth()
  }

  async function addRecord(module: HealthModule, input: Record<string, unknown>): Promise<void> {
    const now = new Date().toISOString()
    const rec = NORMALIZERS[module]({
      module,
      ...input,
      id: typeof input.id === 'string' && input.id ? input.id : `${RECORD_PREFIX[module]}${Date.now()}`,
      createdAt: now,
      updatedAt: now
    })
    // 联合数组上直接 push 会把入参退化为 never（TS 对联合方法调用取交集），
    // 上抛为 HealthRecord[] 是合法宽化断言（各模块数组元素均为 HealthRecord 成员）
    ;(records.value[module] as HealthRecord[]).push(rec)
    await saveHealth()
  }

  async function updateRecord(module: HealthModule, id: string, patch: Record<string, unknown>): Promise<void> {
    const index = records.value[module].findIndex(r => r.id === id)
    if (index === -1) {
      console.warn('[workbenchHealth] updateRecord 未找到记录', { module, id })
      return
    }
    const old = records.value[module][index]
    // id/module 锁定不可改；patch 覆盖其余字段。Object.assign 保持联合数组元素类型可赋回
    records.value[module][index] = Object.assign({}, old, patch, {
      id: old.id,
      module: old.module,
      updatedAt: new Date().toISOString()
    })
    await saveHealth()
  }

  async function deleteRecord(module: HealthModule, id: string): Promise<void> {
    // 在 toRaw 的原始数组上 filter：reactive 代理上直接 filter 会得到 Proxy 元素（L1 变体）。
    // 展开也必须取 toRaw 的原始对象——直接展开 records.value 会让其余模块数组以 reactive
    // Proxy 残留（实测 structuredClone 抛 DataCloneError），saveHealth 的 toRaw 兜不住内层。
    const raw = toRaw(records.value[module]) as HealthRecord[]
    records.value = {
      ...toRaw(records.value),
      [module]: raw.filter(r => r.id !== id)
    } as HealthData['records']
    await saveHealth()
  }

  return {
    height,
    plans,
    records,
    loadHealth,
    saveHealth,
    setHeight,
    setPlan,
    addRecord,
    updateRecord,
    deleteRecord
  }
})
