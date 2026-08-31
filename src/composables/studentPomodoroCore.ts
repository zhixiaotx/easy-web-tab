// 学生工作台番茄钟纯逻辑模块（学段时长版）。
// 薄复用成人 pomodoroCore 的纯函数（归一化/状态机/格式化/今日统计），
// 叠加学段默认时长映射（K 15/5、P 25/5、J 50/10）。
// 零 vue/pinia 运行时依赖，纯函数。

import {
  emptyPomodoroData,
  normalizePomodoroData,
  sessionPhase,
  formatRemaining,
  todayStats,
  type PomodoroData,
  type PomodoroPhase,
  type PomodoroRecord,
  type PomodoroSettings
} from '@/composables/pomodoroCore'
import { STAGE_DEFAULT_POMODORO, type StudentStage } from '@/types'

// 重导出成人番茄钟纯函数（学生版直接复用，禁止组件内联重算）
export {
  emptyPomodoroData,
  normalizePomodoroData,
  sessionPhase,
  formatRemaining,
  todayStats
}
export type { PomodoroData, PomodoroPhase, PomodoroRecord, PomodoroSettings }

/**
 * 学段默认番茄钟设置：将 types 的 {focus, break} 映射为完整 PomodoroSettings。
 * 长休 = 短休 × 3；每 4 个专注会话一次长休（与成人版一致）。
 * - K（幼儿园）：15 分钟专注 / 5 分钟短休 / 15 分钟长休
 * - P（小学）：25 分钟专注 / 5 分钟短休 / 15 分钟长休
 * - J（初中）：50 分钟专注 / 10 分钟短休 / 30 分钟长休
 */
export function stageDefaultPomodoroSettings(stage: StudentStage): PomodoroSettings {
  const { focus, break: breakMin } = STAGE_DEFAULT_POMODORO[stage]
  return {
    workMinutes: focus,
    breakMinutes: breakMin,
    longBreakMinutes: breakMin * 3,
    sessionsPerCycle: 4
  }
}

/** 校验番茄钟设置是否仍为学段默认值（用户未自定义时返回 true） */
export function isStageDefaultSettings(
  settings: PomodoroSettings,
  stage: StudentStage
): boolean {
  const def = stageDefaultPomodoroSettings(stage)
  return (
    settings.workMinutes === def.workMinutes &&
    settings.breakMinutes === def.breakMinutes &&
    settings.longBreakMinutes === def.longBreakMinutes &&
    settings.sessionsPerCycle === def.sessionsPerCycle
  )
}
