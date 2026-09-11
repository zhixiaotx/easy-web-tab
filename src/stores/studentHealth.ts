import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type {
  HealthPlan,
  HealthPlans,
  StudentHealthData,
  StudentHealthModule,
  StudentHealthRecord
} from '@/types'
import {
  normalizeDietRecord,
  normalizeExerciseRecord,
  normalizeHeightRecord,
  normalizeSleepRecord,
  normalizeStudentHealthData,
  normalizeWeightRecord
} from '@/composables/healthCore'
import { idbGet, idbPut } from '../composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'

// 学生健康管理 store（复刻成人 workbenchHealth，数据与成人严格隔离：
//   IDB store 'student_health' 而非 'health'，随云端 student.json 信封同步而非 workbench.json）
// 在成人 4 模块基础上额外支持第 5 个模块 height（身高成长记录）。

// 各模块记录 id 前缀
const RECORD_PREFIX: Record<StudentHealthModule, string> = {
  exercise: 'ex_',
  diet: 'dt_',
  sleep: 'sl_',
  weight: 'wt_',
  height: 'ht_'
}

// 各模块记录 normalize 函数映射（addRecord 按 module 分发）。
// sleep 缺省 durationHours 时 normalizeSleepRecord 内部按 sleepTime/wakeTime 补算（healthCore fallback 分支）。
const NORMALIZERS: Record<StudentHealthModule, (raw: any) => StudentHealthRecord> = {
  exercise: normalizeExerciseRecord,
  diet: normalizeDietRecord,
  sleep: normalizeSleepRecord,
  weight: normalizeWeightRecord,
  height: normalizeHeightRecord
}

export const useStudentHealthStore = defineStore('studentHealth', () => {
  const height = ref<number | undefined>(undefined)
  const plans = ref<HealthPlans>({})
  const records = ref<StudentHealthData['records']>({
    exercise: [],
    diet: [],
    sleep: [],
    weight: [],
    height: []
  })

  async function loadHealth(): Promise<void> {
    try {
      // IDB 存量旧结构/脏数据经 normalizeStudentHealthData 幂等归一
      const data = normalizeStudentHealthData(await idbGet<StudentHealthData>('student_health'))
      height.value = data.height
      plans.value = data.plans
      records.value = data.records
    } catch (e) {
      // 加载失败降级为空态（保持默认值），不向上抛
      console.error('[studentHealth] loadHealth', e)
    }
  }

  async function saveHealth(): Promise<void> {
    try {
      // ref 的 .value 是 reactive Proxy，toRaw 只解开最外层一层——整包 toRaw({...}) 解不掉
      // 内层 proxy（实测 structuredClone 抛 DataCloneError），必须对每个字段逐个 toRaw，
      // 组装成纯对象后再写入 IDB
      await idbPut('student_health', {
        height: height.value,
        plans: toRaw(plans.value),
        records: toRaw(records.value)
      })
      markDirty()
    } catch (e) {
      console.error('[studentHealth] saveHealth', e)
    }
  }

  async function setHeight(cm: number): Promise<void> {
    if (!(Number.isInteger(cm) && cm >= 100 && cm <= 250)) {
      console.warn('[studentHealth] setHeight 非法值已忽略（需 100-250 整数）', cm)
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

  async function addRecord(module: StudentHealthModule, input: Record<string, unknown>): Promise<void> {
    const now = new Date().toISOString()
    const rec = NORMALIZERS[module]({
      module,
      ...input,
      id: typeof input.id === 'string' && input.id ? input.id : `${RECORD_PREFIX[module]}${Date.now()}`,
      createdAt: now,
      updatedAt: now
    })
    // 联合数组上直接 push 会把入参退化为 never（TS 对联合方法调用取交集），
    // 上抛为 StudentHealthRecord[] 是合法宽化断言（各模块数组元素均为 StudentHealthRecord 成员）
    ;(records.value[module] as StudentHealthRecord[]).push(rec)
    await saveHealth()
  }

  async function updateRecord(module: StudentHealthModule, id: string, patch: Record<string, unknown>): Promise<void> {
    const index = records.value[module].findIndex(r => r.id === id)
    if (index === -1) {
      console.warn('[studentHealth] updateRecord 未找到记录', { module, id })
      return
    }
    const old = records.value[module][index]
    // id/module 锁定不可改；patch 覆盖其余字段。Object.assign 保持联合数组元素类型可赋回
    records.value[module][index] = Object.assign({}, old, patch, {
      id: old.id,
      module: old.module,
      updatedAt: new Date().toISOString()
    }) as StudentHealthRecord
    await saveHealth()
  }

  async function deleteRecord(module: StudentHealthModule, id: string): Promise<void> {
    // 在 toRaw 的原始数组上 filter：reactive 代理上直接 filter 会得到 Proxy 元素（L1 变体）。
    // 展开也必须取 toRaw 的原始对象——直接展开 records.value 会让其余模块数组以 reactive
    // Proxy 残留（实测 structuredClone 抛 DataCloneError），saveHealth 的 toRaw 兜不住内层。
    const raw = toRaw(records.value[module]) as StudentHealthRecord[]
    records.value = {
      ...toRaw(records.value),
      [module]: raw.filter(r => r.id !== id)
    } as StudentHealthData['records']
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
