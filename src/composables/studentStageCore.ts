// 学生工作台学段切换纯逻辑模块：学段判定/默认值播种决策/学段徽标查询。
// 零 vue/pinia 运行时依赖，纯函数。
// M1 仅做决策计算（是否需要播种、播种什么数据），实际播种由 store 调用相应模块完成。

import {
  type StudentStage,
  type StudentSettings,
  STAGE_DEFAULT_SUBJECTS,
  STAGE_DEFAULT_HABITS,
  STAGE_DEFAULT_POMODORO,
  STAGE_BADGE,
  STAGE_MENU_VISIBILITY
} from '@/types'
import { applyStageDefaultVisibility, type StudentMenuVisibility } from './studentMenuCore'

/** 学段判定：'K'|'P'|'J'|'H'|'U' 之外一律回退 'P' */
export function normalizeStage(value: unknown): StudentStage {
  if (value === 'K' || value === 'P' || value === 'J' || value === 'H' || value === 'U') return value
  return 'P'
}

/** 学段中文标签 */
export function stageLabel(stage: StudentStage): string {
  switch (stage) {
    case 'K': return '幼儿园'
    case 'P': return '小学'
    case 'J': return '初中'
    case 'H': return '高中'
    case 'U': return '大学'
  }
}

/** 学段徽标配置（label + color） */
export function stageBadge(stage: StudentStage): { label: string; color: string } {
  return STAGE_BADGE[stage]
}

/** 学段默认学科清单（K 空数组，P 3 科，J 9 科） */
export function stageDefaultSubjects(stage: StudentStage): string[] {
  return [...STAGE_DEFAULT_SUBJECTS[stage]]
}

/** 学段默认习惯种子（K 7 项 / P 6 项 / J 5 项） */
export function stageDefaultHabits(stage: StudentStage): { name: string; category: string }[] {
  return STAGE_DEFAULT_HABITS[stage].map(h => ({ ...h }))
}

/** 学段默认番茄钟时长（分钟） */
export function stageDefaultPomodoro(stage: StudentStage): { focus: number; break: number } {
  return { ...STAGE_DEFAULT_POMODORO[stage] }
}

/** 学段默认菜单可见性 */
export function stageDefaultMenuVisibility(stage: StudentStage): StudentMenuVisibility {
  return { ...STAGE_MENU_VISIBILITY[stage] }
}

/**
 * 判断是否需要播种学段默认值。
 * settings.stageSeeded !== stage → true（首次进入或学段切换后）。
 */
export function shouldSeedStageDefaults(settings: StudentSettings, stage: StudentStage): boolean {
  return settings.stageSeeded !== stage
}

/**
 * 计算学段切换后的菜单可见性：
 * 保留用户已显式配置的覆盖项，对未配置的键应用学段默认值。
 * 用于 store 切换学段时调用，避免粗暴覆盖用户手动开启的菜单项。
 */
export function computeStageSwitchVisibility(
  settings: StudentSettings,
  newStage: StudentStage
): StudentMenuVisibility {
  return applyStageDefaultVisibility(
    settings.menuVisibility ?? {},
    STAGE_MENU_VISIBILITY[newStage]
  )
}

/**
 * 学段切换决策结果：store 拿到这个对象后按需执行播种动作。
 * M1 仅返回学段 + 学科 + 番茄钟（习惯/学科 store 在 M2 实施）。
 */
export interface StageSwitchPlan {
  stage: StudentStage
  needSeed: boolean
  subjects: string[]
  pomodoro: { focus: number; break: number }
  menuVisibility: StudentMenuVisibility
}

/**
 * 生成学段切换计划（pure，不修改入参）。
 * 调用方（store）按 needSeed 标志执行实际播种。
 */

/**
 * 根据出生日期（YYYY-MM-DD）计算周岁年龄。
 * 非法/缺失日期返回 null。
 */
export function calcAge(birthday?: string): number | null {
  if (!birthday || typeof birthday !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) {
    age--
  }
  return age >= 0 && age <= 150 ? age : null
}
export function planStageSwitch(settings: StudentSettings, newStage: StudentStage): StageSwitchPlan {
  const needSeed = shouldSeedStageDefaults(settings, newStage)
  return {
    stage: newStage,
    needSeed,
    subjects: stageDefaultSubjects(newStage),
    pomodoro: stageDefaultPomodoro(newStage),
    menuVisibility: computeStageSwitchVisibility(settings, newStage)
  }
}
