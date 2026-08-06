import assert from 'node:assert/strict'
import {
  calcBmi,
  calcDailyAttainment,
  calcExerciseAttainment,
  classifyBmi,
  dietCalories,
  emptyHealthData,
  normalizeDietRecord,
  normalizeExerciseRecord,
  normalizeHealthData,
  normalizeSleepRecord,
  normalizeWeightRecord,
  sleepDurationHours,
  weekKeyOf,
  weightChartScale,
  weightTarget
} from '../src/composables/healthCore.ts'
import type { DietRecord, ExerciseRecord, HealthPlan, SleepRecord, WeightRecord } from '../src/types'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// —— 测试辅助：断言失败时抛带上下文的错误，避免在断言里用非空断言运算符 ——
function bmiOf(weightKg: number, heightCm: number): number {
  const bmi = calcBmi(weightKg, heightCm)
  if (bmi === null) throw new Error(`calcBmi(${weightKg}, ${heightCm}) 意外返回 null`)
  return bmi
}

function mustExercise(records: ExerciseRecord[], plan: HealthPlan | undefined, todayStr: string) {
  const r = calcExerciseAttainment(records, plan, todayStr)
  if (r === null) throw new Error('calcExerciseAttainment 意外返回 null')
  return r
}

function mustScale(records: WeightRecord[], width: number, height: number, pad?: number) {
  const s = weightChartScale(records, width, height, pad)
  if (s === null) throw new Error('weightChartScale 意外返回 null')
  return s
}

function mkExercise(id: string, date: string, duration: number, calories: number): ExerciseRecord {
  return {
    id, module: 'exercise', date, exerciseType: '跑步', duration, calories,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function mkDiet(id: string, date: string, calories: number): DietRecord {
  return {
    id, module: 'diet', date, mealType: '午餐', content: '测试餐', calories,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function mkSleep(id: string, date: string, durationHours: number): SleepRecord {
  return {
    id, module: 'sleep', date, sleepTime: '23:00', wakeTime: '07:00', durationHours, quality: 4,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function mkWeight(id: string, date: string, weightKg: number, createdAt = '2026-01-01T00:00:00.000Z'): WeightRecord {
  return {
    id, module: 'weight', date, weightKg,
    createdAt, updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function mkPlan(module: HealthPlan['module'], metric: HealthPlan['metric'], target: number, period: HealthPlan['period'] = 'weekly'): HealthPlan {
  return { module, metric, period, target, updatedAt: '2026-01-01T00:00:00.000Z' }
}

// T1 — classifyBmi 国标边界：18.4→under / 18.5→normal / 23.9→normal / 24.0→overweight / 27.9→overweight / 28.0→obese
test('T1 classifyBmi 国标边界', () => {
  const h = 170
  // 用 calcBmi 反推体重保证分界正确：bmi = w / 1.7²
  const w = (bmi: number) => bmi * (h / 100) ** 2
  assert.equal(classifyBmi(bmiOf(w(18.4), h)), 'under')
  assert.equal(classifyBmi(bmiOf(w(18.5), h)), 'normal')
  assert.equal(classifyBmi(bmiOf(w(23.9), h)), 'normal')
  assert.equal(classifyBmi(bmiOf(w(24.0), h)), 'overweight')
  assert.equal(classifyBmi(bmiOf(w(27.9), h)), 'overweight')
  assert.equal(classifyBmi(bmiOf(w(28.0), h)), 'obese')
})

// T2 — calcBmi 缺失/非正输入返回 null
test('T2 calcBmi 缺失/非正输入返回 null', () => {
  assert.equal(calcBmi(70, undefined), null)
  assert.equal(calcBmi(undefined, 170), null)
  assert.equal(calcBmi(0, 170), null)
  assert.equal(calcBmi(-60, 170), null)
})

// T3 — weightTarget / dietCalories 公式
test('T3 weightTarget / dietCalories 公式', () => {
  assert.equal(weightTarget(170), 69.4)
  assert.equal(dietCalories(69.4), 1735)
})

// T4 — sleepDurationHours：跨夜 / 同刻=24h / 同日跨 1h / 非法输入=0
test('T4 sleepDurationHours 跨夜/同刻/非法', () => {
  assert.equal(sleepDurationHours('23:30', '06:30'), 7)
  assert.equal(sleepDurationHours('06:00', '06:00'), 24)
  assert.equal(sleepDurationHours('22:00', '23:00'), 1)
  assert.equal(sleepDurationHours('abc', '06:30'), 0)
  assert.equal(sleepDurationHours('25:00', '06:30'), 0)
})

// T5 — weekKeyOf 周一起点：周日 / 周一自身 / 周四 / 跨月周日 / 跨年
test('T5 weekKeyOf 周一起点（周日/周一/跨月/跨年）', () => {
  assert.equal(weekKeyOf('2026-08-09'), '2026-08-03') // 周日 → 本周一
  assert.equal(weekKeyOf('2026-08-03'), '2026-08-03') // 周一 → 自身
  assert.equal(weekKeyOf('2026-08-06'), '2026-08-03') // 周四 → 本周一
  assert.equal(weekKeyOf('2026-08-02'), '2026-07-27') // 上周日 → 上周一（跨月）
  assert.equal(weekKeyOf('2026-01-01'), '2025-12-29') // 周四 → 上一年周一（跨年）
})

// T6 — calcExerciseAttainment：周过滤 + times/minutes/calories 三指标 + 无 plan + 空记录 + 非 exercise 计划
test('T6 calcExerciseAttainment 周过滤与三种指标', () => {
  const records = [
    mkExercise('a', '2026-08-03', 30, 300), // 本周一
    mkExercise('b', '2026-08-05', 45, 450), // 本周三
    mkExercise('c', '2026-07-28', 60, 600) // 上周二（周键 2026-07-27）
  ]
  const times = mkPlan('exercise', 'times', 3)
  assert.deepEqual(mustExercise(records, times, '2026-08-06'), { current: 2, target: 3, percent: 2 / 3 })
  const minutes = mkPlan('exercise', 'minutes', 90)
  assert.deepEqual(mustExercise(records, minutes, '2026-08-06'), { current: 75, target: 90, percent: 75 / 90 })
  const calories = mkPlan('exercise', 'calories', 1000)
  assert.deepEqual(mustExercise(records, calories, '2026-08-06'), { current: 750, target: 1000, percent: 0.75 })
  assert.equal(calcExerciseAttainment(records, undefined, '2026-08-06'), null) // 无 plan
  assert.deepEqual(mustExercise([], times, '2026-08-06'), { current: 0, target: 3, percent: 0 }) // 空记录
  assert.equal(calcExerciseAttainment(records, mkPlan('diet', 'calories', 1000), '2026-08-06'), null) // 非 exercise 计划
})

// T7 — calcDailyAttainment：diet/sleep 同日求和、异日剔除、无 plan、非 diet/sleep 计划
test('T7 calcDailyAttainment 同日求和与异日剔除', () => {
  const dietRecords = [
    mkDiet('a', '2026-08-05', 600),
    mkDiet('b', '2026-08-05', 400),
    mkDiet('c', '2026-08-04', 800) // 异日不计入
  ]
  const dietPlan = mkPlan('diet', 'calories', 2000, 'daily')
  assert.deepEqual(calcDailyAttainment(dietRecords, dietPlan, '2026-08-05'), { current: 1000, target: 2000, percent: 0.5 })
  assert.equal(calcDailyAttainment(dietRecords, undefined, '2026-08-05'), null) // 无 plan

  const sleepRecords = [
    mkSleep('a', '2026-08-05', 7),
    mkSleep('b', '2026-08-05', 8)
  ]
  const sleepPlan = mkPlan('sleep', 'duration', 8, 'daily')
  assert.deepEqual(calcDailyAttainment(sleepRecords, sleepPlan, '2026-08-05'), { current: 15, target: 8, percent: 15 / 8 })
  assert.equal(calcDailyAttainment(sleepRecords, mkPlan('exercise', 'times', 3), '2026-08-05'), null) // 非 diet/sleep 计划
})

// T8 — normalizeHealthData：脏数据剔除且不抛错（height 越界 / 非法计划 / 非法记录 / 非数组）
test('T8 normalizeHealthData 剔除脏数据且不抛错', () => {
  const data = normalizeHealthData({
    height: 9999, // 越界 → 剔除
    plans: {
      exercise: { module: 'exercise', metric: 'times', period: 'weekly', target: 3, updatedAt: 'x' },
      diet: { module: 'diet', metric: 'bogus', period: 'daily', target: 1000, updatedAt: 'x' }, // 非法 metric → 丢弃
      sleep: { module: 'sleep', metric: 'duration', period: 'monthly', target: 8, updatedAt: 'x' } // 非法 period → 丢弃
    } as never,
    records: {
      exercise: [null, { date: 'bad-date', duration: -10, calories: 'abc' }, { date: '2026-08-05', duration: 30 }],
      diet: 'not-an-array', // 非数组 → []
      sleep: [{ durationHours: 'bad' }], // NaN → sleepDurationHours 补算（空时间 → 0）
      weight: [{}]
    } as never
  })
  assert.equal(data.height, undefined)
  assert.equal(data.plans.exercise?.target, 3)
  assert.equal(data.plans.diet, undefined)
  assert.equal(data.plans.sleep, undefined)
  assert.equal(data.records.exercise.length, 3)
  assert.equal(data.records.exercise[0].module, 'exercise') // null 条目兜底不抛错
  assert.equal(data.records.exercise[1].duration, 0) // 负数钳 0
  assert.equal(data.records.exercise[1].calories, 0) // 'abc' → NaN → 0
  assert.equal(data.records.exercise[2].duration, 30)
  assert.equal(data.records.diet.length, 0)
  assert.equal(data.records.sleep[0].durationHours, 0)
  assert.ok(data.records.weight[0].id.startsWith('wt_'))
  assert.match(data.records.exercise[1].date, /^\d{4}-\d{2}-\d{2}$/) // localToday 兜底格式
})

// T9 — normalizeHealthData：合法数据透传（height 保留、计划保留、记录保留）
test('T9 normalizeHealthData 合法数据透传', () => {
  const data = normalizeHealthData({
    height: 170,
    plans: { exercise: mkPlan('exercise', 'times', 3) },
    records: {
      exercise: [{ id: 'ex_1', module: 'exercise', date: '2026-08-05', exerciseType: '跑步', duration: 30, calories: 300, createdAt: 'x', updatedAt: 'x' }]
    }
  })
  assert.equal(data.height, 170)
  assert.equal(data.plans.exercise?.target, 3)
  assert.equal(data.records.exercise[0].duration, 30)
  assert.equal(data.records.diet.length, 0)
})

// T10 — weightChartScale：空→null；1 条居中；3 条按序 x=0/中/width + y 归一化；同日按 createdAt 排序
test('T10 weightChartScale 空/单点/多点与同日排序', () => {
  assert.equal(weightChartScale([], 400, 200), null)

  const one = mustScale([mkWeight('a', '2026-08-01', 70)], 400, 200)
  assert.equal(one.points.length, 1)
  assert.equal(one.points[0].x, 200) // 水平居中
  assert.equal(one.points[0].y, 100) // 垂直居中
  assert.equal(one.minY, 69)
  assert.equal(one.maxY, 71)

  const three = mustScale([
    mkWeight('a', '2026-08-01', 60),
    mkWeight('b', '2026-08-02', 65),
    mkWeight('c', '2026-08-03', 70)
  ], 400, 200)
  assert.equal(three.points[0].x, 0)
  assert.equal(three.points[1].x, 200)
  assert.equal(three.points[2].x, 400)
  assert.equal(three.points[0].y, 163.33)
  assert.equal(three.points[1].y, 100)
  assert.equal(three.points[2].y, 36.67)
  assert.equal(three.minY, 59)
  assert.equal(three.maxY, 71)

  // 同日按 createdAt 升序
  const same = mustScale([
    mkWeight('a', '2026-08-02', 70, '2026-08-02T10:00:00.000Z'),
    mkWeight('b', '2026-08-02', 66, '2026-08-02T08:00:00.000Z'),
    mkWeight('c', '2026-08-01', 65)
  ], 400, 200)
  assert.deepEqual(same.points.map(p => `${p.date}:${p.weightKg}`), ['2026-08-01:65', '2026-08-02:66', '2026-08-02:70'])
})

// T11 — 各记录 normalize 兜底：id 前缀 / module 强制 / 数值钳制 / note 类型 / durationHours 补算 / quality 钳制
test('T11 各记录 normalize 兜底', () => {
  const ex = normalizeExerciseRecord({ date: 'bad', duration: -5, note: 123 })
  assert.equal(ex.module, 'exercise')
  assert.equal(ex.duration, 0)
  assert.equal(ex.note, undefined)
  assert.match(ex.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(ex.id.startsWith('ex_'))

  const sl = normalizeSleepRecord({ sleepTime: '23:00', wakeTime: '07:00', durationHours: 'bad', quality: 9 })
  assert.equal(sl.durationHours, 8) // NaN → 补算 23:00→07:00 = 8h
  assert.equal(sl.quality, 5) // 钳到 1-5
  assert.ok(sl.id.startsWith('sl_'))

  const wt = normalizeWeightRecord({})
  assert.equal(wt.weightKg, 0)
  assert.ok(wt.id.startsWith('wt_'))

  const dt = normalizeDietRecord({ mealType: '夜宵' })
  assert.equal(dt.mealType, '早餐') // 非法 mealType 回退默认
  assert.ok(dt.id.startsWith('dt_'))
})

// T12 — emptyHealthData 初始结构
test('T12 emptyHealthData 初始结构', () => {
  const e = emptyHealthData()
  assert.equal(e.height, undefined)
  assert.deepEqual(e, { plans: {}, records: { exercise: [], diet: [], sleep: [], weight: [] } })
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log(`  ✓ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${t.name}`)
    console.error(e)
  }
}
console.log(`\n${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)
