// 健康管理 store 注入上下文：让同一套健康子组件（Exercise/Diet/Sleep/Weight）
// 既能跑在成人端（默认 useWorkbenchHealthStore），也能跑在学生端（注入 useStudentHealthStore），
// 从而实现「UI 零复制复用、数据严格隔离」。
//
// 用法：
//   容器侧（如 StudentHealth.vue）：provideHealthStore(useStudentHealthStore())
//   子组件侧：const store = injectHealthStore() ?? useWorkbenchHealthStore()
// 成人端没有 provide 时 inject 返回 undefined → 回退原 store，行为与改造前完全一致。

import { inject, provide, type InjectionKey } from 'vue'
import type { useWorkbenchHealthStore } from '@/stores/workbenchHealth'

/** 子组件实际消费的 store 成员集合（四个健康子组件只用这 10 个成员，见各文件 store.* 调用）。 */
export type HealthStoreLike = Pick<
  ReturnType<typeof useWorkbenchHealthStore>,
  | 'height'
  | 'plans'
  | 'records'
  | 'loadHealth'
  | 'saveHealth'
  | 'setHeight'
  | 'setPlan'
  | 'addRecord'
  | 'updateRecord'
  | 'deleteRecord'
>

const HEALTH_STORE_KEY = Symbol('healthStore') as InjectionKey<HealthStoreLike>

/** 向子树提供健康 store 实例（学生端传入学生 store 即可读写学生自己的数据）。 */
export function provideHealthStore(store: HealthStoreLike): void {
  provide(HEALTH_STORE_KEY, store)
}

/** 取子树注入的健康 store；未注入时返回 undefined（调用方应回退到成人 store）。 */
export function injectHealthStore(): HealthStoreLike | undefined {
  return inject(HEALTH_STORE_KEY, undefined)
}
