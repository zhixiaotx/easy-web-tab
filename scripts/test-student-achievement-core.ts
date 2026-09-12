import assert from "node:assert/strict"
import {
  BUILTIN_ACHIEVEMENT_IDS, MANUAL_ACHIEVEMENT_IDS, KNOWN_METRICS,
  buildBuiltinAchievements, emptyAchievementsData, normalizeAchievementDef, normalizeAchievementsData,
  mergeBuiltinAchievements, calcMaxStreak, calcTotalReadingEntries, calcTotalPomoSessions,
  calcHwCompletionRate, calcHwTotal, metricValue, calcProgressPercent, isAchievementEarned,
  checkUnlocks, filterByCategory, categoryLabel, calcAchievementStats, formatUnlockTime,
  isoNowForAchievements
} from "../src/composables/studentAchievementCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 常量集合长度/内容：26 内置 / 0 手动 / 10 指标", () => {
  assert.equal(BUILTIN_ACHIEVEMENT_IDS.length, 26)
  assert.equal(BUILTIN_ACHIEVEMENT_IDS[0], "streak-1")
  assert.equal(BUILTIN_ACHIEVEMENT_IDS[25], "all-built-unlocked")
  assert.deepEqual(MANUAL_ACHIEVEMENT_IDS, [])
  assert.deepEqual(KNOWN_METRICS, [
    "max-streak", "reading-count", "pomo-count", "hw-rate", "hw-total",
    "review-count", "review-total", "review-mastered-count", "achievement-count", "all-built-unlocked"
  ])
})

test("T2 buildBuiltinAchievements：26 条；分类 streak=habit、book=reading、pomo=pomodoro、hw/review=study；id/metric/target 与常量一致；幂等返回副本", () => {
  const a = buildBuiltinAchievements(); const b = buildBuiltinAchievements()
  assert.notEqual(a, b)
  assert.equal(a.length, 26)
  a[0].name = "X"
  assert.equal(buildBuiltinAchievements()[0].name, "1 天小红花")
  for (let i = 0; i < 26; i++) assert.equal(a[i].id, BUILTIN_ACHIEVEMENT_IDS[i])
  assert.equal(a.find(d => d.id === "hw-rate-95")!.category, "study")
  assert.equal(a.find(d => d.id === "pomo-50")!.category, "pomodoro")
  assert.equal(a.find(d => d.id === "book-10")!.category, "reading")
  assert.equal(a.find(d => d.id === "streak-7")!.category, "habit")
  assert.equal(a.find(d => d.id === "review-first")!.category, "study")
})

test("T2b 分类分布：habit 12 / reading 4 / pomodoro 4 / study 6", () => {
  const a = buildBuiltinAchievements()
  const count = (c: string) => a.filter(d => d.category === c).length
  assert.equal(count("habit"), 12)
  assert.equal(count("reading"), 4)
  assert.equal(count("pomodoro"), 4)
  assert.equal(count("study"), 6)
  assert.equal(count("habit") + count("reading") + count("pomodoro") + count("study"), 26)
})

test("T3 emptyAchievementsData / normalizeAchievementDef：非法必填/枚举/target<1 → null；合法 id 映射", () => {
  assert.deepEqual(emptyAchievementsData(), { definitions: [], unlocked: {} })
  assert.equal(normalizeAchievementDef(null), null)
  assert.equal(normalizeAchievementDef({ id: "", name: "A", description: "d", emoji: "E", category: "habit", metric: "max-streak", target: 1 }), null)
  assert.equal(normalizeAchievementDef({ id: "x", name: "A", description: "d", emoji: "E", category: "bad-cat", metric: "max-streak", target: 1 }), null)
  assert.equal(normalizeAchievementDef({ id: "x", name: "A", description: "d", emoji: "E", category: "habit", metric: "bad-metric", target: 1 }), null)
  assert.equal(normalizeAchievementDef({ id: "x", name: "A", description: "d", emoji: "E", category: "habit", metric: "max-streak", target: 0 }), null)
  const d = normalizeAchievementDef({ id: "  x  ", name: "  名称  ", description: " desc ", emoji: " E ", category: "habit", metric: "max-streak", target: 7.9 })!
  assert.equal(d.id, "x"); assert.equal(d.name, "名称"); assert.equal(d.description, "desc"); assert.equal(d.emoji, "E")
  assert.equal(d.category, "habit"); assert.equal(d.metric, "max-streak"); assert.equal(d.target, 7)
})

test("T4 normalizeAchievementsData：definitions 内置 id 去重+按 BUILTIN_ORDER；unknown 非法 unlocked ISO 被剔除；非对象→empty；幂等二次归一一致", () => {
  const defs = [
    { id: "streak-7", name: "A", description: "a", emoji: "🔥", category: "habit", metric: "max-streak", target: 7 },
    { id: "book-10", name: "B", description: "b", emoji: "📚", category: "reading", metric: "reading-count", target: 10 },
    { id: "streak-7", name: "DUPLICATE", description: "dup", emoji: "🔥", category: "habit", metric: "max-streak", target: 7 },
  ]
  const raw = { definitions: defs, unlocked: { "streak-7": "2026-02-01T08:00:00Z", "bad-id": "not-iso", "x": "" } }
  const o = normalizeAchievementsData(raw)
  assert.equal(o.definitions.length, 2)
  assert.equal(o.definitions[0].id, "streak-7"); assert.equal(o.definitions[0].name, "A") // 首条保留
  assert.equal(o.definitions[1].id, "book-10")
  assert.ok(o.unlocked["streak-7"]); assert.equal(!!o.unlocked["bad-id"], false)
  assert.equal(!!o.unlocked["x"], false)
  assert.deepEqual(normalizeAchievementsData("x"), emptyAchievementsData())
  assert.deepEqual(normalizeAchievementsData([]), emptyAchievementsData())
  // 幂等
  assert.deepEqual(normalizeAchievementsData(o).definitions.map(d => d.id), o.definitions.map(d => d.id))
})

test("T5 mergeBuiltinAchievements：缺失内置补齐；未知 id 保留在末尾；排序：内置顺序优先", () => {
  const existing = [
    { id: "pomo-50", name: "P", description: "p", emoji: "⏰", category: "pomodoro", metric: "pomo-count", target: 50 },
    { id: "custom-1", name: "C", description: "c", emoji: "C", category: "study", metric: "hw-rate", target: 1 },
  ]
  const m = mergeBuiltinAchievements(existing)
  // 首条为内置顺序首（缺失补齐）
  assert.equal(m[0].id, BUILTIN_ACHIEVEMENT_IDS[0])
  // custom-1 末尾
  assert.equal(m[m.length - 1].id, "custom-1")
  // streak-30 内置也补齐
  assert.equal(m.findIndex(d => d.id === "streak-30") >= 0, true)
})

test("T6 聚合指标：streak / reading / pomo / hw", () => {
  // streak 构造：习惯 h1 连续 3 天（今、昨、前天）、h2 连续 7 天
  const today = "2026-02-05"
  const habits = [{ id: "h1" }, { id: "h2" }] as any
  const records = [] as any[]
  for (let i = 0; i < 3; i++) {
    const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() - i)
    records.push({ habitId: "h1", date: d.toISOString().slice(0, 10) })
  }
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() - i)
    records.push({ habitId: "h2", date: d.toISOString().slice(0, 10) })
  }
  assert.equal(calcMaxStreak(habits, records, today), 7)
  assert.equal(calcMaxStreak([], records, today), 0)
  assert.equal(calcMaxStreak(habits, [], today), 0)
  assert.equal(calcTotalReadingEntries(Array.from({ length: 12 }) as any), 12)
  const pomo = [{ workSessions: 1 }, { workSessions: 2 }, { workSessions: 0 }, { workSessions: -1 }, { workSessions: NaN }] as any
  assert.equal(calcTotalPomoSessions(pomo), 3)
  const hw = [
    { status: "done" }, { status: "done" }, { status: "pending" }, { status: "overdue" },
  ] as any
  assert.equal(calcHwTotal(hw), 4)
  assert.equal(calcHwCompletionRate(hw), 50)
  assert.equal(calcHwCompletionRate([]), 0)
})

test("T7 metricValue 取对映射；未知=0", () => {
  const m = { "max-streak": 7, "reading-count": 15, "pomo-count": 55, "hw-rate": 88, "hw-total": 4 } as const
  assert.equal(metricValue("max-streak", m), 7)
  assert.equal(metricValue("reading-count", m), 15)
  assert.equal(metricValue("pomo-count", m), 55)
  assert.equal(metricValue("hw-rate", m), 88)
  assert.equal(metricValue("unknown-metric", m), 0)
})

test("T8 calcProgressPercent：已解锁=100；普通 current/target*100 整数 floor；hw-rate-95 门槛 <10 半段", () => {
  const builtins = buildBuiltinAchievements()
  const streak7 = builtins.find(d => d.id === "streak-7")!
  const m1 = { "max-streak": 5, "reading-count": 0, "pomo-count": 0, "hw-rate": 0, "hw-total": 0 } as any
  assert.equal(calcProgressPercent(streak7, m1, false), Math.floor(5 / 7 * 100))
  assert.equal(calcProgressPercent(streak7, m1, true), 100)
  const hw95 = builtins.find(d => d.id === "hw-rate-95")!
  // 总共 5 篇 + 完成率 0% → 总进度 floor(5/10*50 + 0) = 25；封顶 99
  assert.equal(calcProgressPercent(hw95, { "max-streak":0,"reading-count":0,"pomo-count":0,"hw-rate":0,"hw-total":5 }, false), 25)
  // 总共 10 篇 + 100% 率 → 100
  assert.equal(calcProgressPercent(hw95, { "max-streak":0,"reading-count":0,"pomo-count":0,"hw-rate":100,"hw-total":10 }, false), 100)
})

test("T9 isAchievementEarned：streak-7→max-streak>=7；hw-rate-95 需 total>=10 & rate>=95", () => {
  const builtins = buildBuiltinAchievements()
  const s7 = builtins.find(d => d.id === "streak-7")!
  const hw = builtins.find(d => d.id === "hw-rate-95")!
  assert.equal(isAchievementEarned(s7, { "max-streak": 6, "reading-count":0,"pomo-count":0,"hw-rate":0,"hw-total":0 } as any), false)
  assert.equal(isAchievementEarned(s7, { "max-streak": 7, "reading-count":0,"pomo-count":0,"hw-rate":0,"hw-total":0 } as any), true)
  assert.equal(isAchievementEarned(hw, { "max-streak":0,"reading-count":0,"pomo-count":0,"hw-rate":95,"hw-total":9 }), false)
  assert.equal(isAchievementEarned(hw, { "max-streak":0,"reading-count":0,"pomo-count":0,"hw-rate":95,"hw-total":10 }), true)
  assert.equal(isAchievementEarned(hw, { "max-streak":0,"reading-count":0,"pomo-count":0,"hw-rate":94,"hw-total":20 }), false)
})

test("T10 checkUnlocks：排除已解锁；批量新达成按 defs 顺序", () => {
  const defs = buildBuiltinAchievements()
  const unlocked = { "streak-7": "2026-01-01T00:00:00Z" }
  const m = { "max-streak": 31, "reading-count": 15, "pomo-count": 0, "hw-rate": 95, "hw-total": 9 } as any
  const list = checkUnlocks(defs, unlocked, m)
  assert.ok(list.includes("streak-30"))
  assert.ok(list.includes("book-10"))
  assert.equal(list.includes("streak-7"), false)
  assert.equal(list.includes("hw-rate-95"), false)
})

test("T11 视图辅助：filterByCategory / categoryLabel / calcAchievementStats / formatUnlockTime / isoNow", () => {
  const defs = buildBuiltinAchievements()
  assert.equal(filterByCategory(defs, "all").length, defs.length)
  assert.notEqual(filterByCategory(defs, "all"), defs)
  assert.equal(filterByCategory(defs, "habit").length, 12)
  assert.equal(filterByCategory(defs, "reading").length, 4)
  assert.equal(filterByCategory(defs, "study").length, 6)
  assert.equal(filterByCategory(defs, "pomodoro").length, 4)
  assert.equal(categoryLabel("habit"), "习惯")
  assert.equal(categoryLabel("reading"), "阅读")
  assert.equal(categoryLabel("pomodoro"), "专注")
  const unlocked = { "streak-7": "t", "book-10": "t" }
  const s = calcAchievementStats(defs, unlocked)
  assert.equal(s.total, 26); assert.equal(s.unlocked, 2); assert.equal(s.locked, 24)
  assert.equal(s.rate, Math.round(2 / 26 * 100)); assert.equal(s.allUnlocked, false)
  const all = Object.fromEntries(BUILTIN_ACHIEVEMENT_IDS.map(i => [i, "t"]))
  assert.equal(calcAchievementStats(defs, all).allUnlocked, true)
  // formatUnlockTime
  assert.equal(formatUnlockTime(undefined), "")
  assert.equal(formatUnlockTime(""), "")
  assert.equal(formatUnlockTime("bad"), "")
  const formatted = formatUnlockTime("2026-02-05T08:05:03.000Z")
  assert.ok(formatted.startsWith("2026-"))
  assert.ok(formatted.includes(" "))
  assert.ok(formatted.includes(":"))
  // isoNow 合法 ISO
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(isoNowForAchievements()))
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)
