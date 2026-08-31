import assert from "node:assert/strict"
import {
  MAX_HISTORY, MAX_NAME_LENGTH, MAX_COST, MIN_COST,
  POINTS_HABIT, POINTS_HOMEWORK, POINTS_READING, READING_MIN_MINUTES,
  emptyRewardsData, normalizeRewardItem, normalizeRewardTxn, normalizeRewardsData,
  hasSourceId, habitEarnReason, homeworkEarnReason, readingEarnReason, isReadingEligible,
  addRewardItem, updateRewardItem, deleteRewardItem,
  manualEarn, autoEarn, redeemReward,
  filterActiveRewards, filterSoldOutRewards, recentHistory,
  calcRewardStats, formatTxnPoints
} from "../src/composables/studentRewardCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 常量 PRD 值", () => {
  assert.equal(MAX_HISTORY, 100)
  assert.equal(MAX_NAME_LENGTH, 30)
  assert.equal(MAX_COST, 9999)
  assert.equal(MIN_COST, 1)
  assert.equal(POINTS_HABIT, 5)
  assert.equal(POINTS_HOMEWORK, 10)
  assert.equal(POINTS_READING, 5)
  assert.equal(READING_MIN_MINUTES, 30)
})

test("T2 emptyRewardsData", () => assert.deepEqual(emptyRewardsData(), { totalPoints: 0, history: [], rewards: [] }))

test("T3 normalizeRewardItem 空名/非法 cost→null；合法 name 截断30 + cost 钳9999", () => {
  assert.equal(normalizeRewardItem(null), null)
  assert.equal(normalizeRewardItem({ name: "" }), null)
  assert.equal(normalizeRewardItem({ name: "x", cost: 0 }), null)
  const r = normalizeRewardItem({ name: "A".repeat(40), cost: 99999 })
  assert.equal(r.name.length, 30)
  assert.equal(r.cost, 9999)
})

test("T4 normalizeRewardItem stock 非负可选；负数/非有限不写字段", () => {
  assert.equal(normalizeRewardItem({ name: "x", cost: 10, stock: 5 }).stock, 5)
  const neg = normalizeRewardItem({ name: "x", cost: 10, stock: -1 })
  assert.ok(!("stock" in neg))
  const ok = normalizeRewardItem({ name: "x", cost: 10 })
  assert.ok(!("stock" in ok))
})

test("T5 normalizeRewardTxn earn 必正/redeem 必负/0→null；sourceId 去空白", () => {
  assert.equal(normalizeRewardTxn({ type: "earn", points: 0, reason: "r" }), null)
  assert.equal(normalizeRewardTxn({ type: "earn", points: -5, reason: "r" }), null)
  assert.equal(normalizeRewardTxn({ type: "redeem", points: 5, reason: "r" }), null)
  const t = normalizeRewardTxn({ type: "earn", points: 10, reason: "  ok  ", sourceId: "  s1  " })
  assert.equal(t.points, 10)
  assert.equal(t.sourceId, "s1")
})

test("T6 normalizeRewardsData 非法 total→0；history 截断100 + createdAt 降；rewards cost 升", () => {
  const hist = Array.from({ length: 120 }, (_, i) => ({ type: "earn", points: 1, reason: "r", createdAt: "2026-01-01T00:00:" + String(i % 60).padStart(2, "0") + ".000Z", id: "t" + i }))
  const raw = { totalPoints: "bad", rewards: [{ id: "r1", name: "便宜", cost: 1 }, { id: "r2", name: "贵", cost: 100 }], history: hist }
  const out = normalizeRewardsData(raw)
  assert.equal(out.totalPoints, 0)
  assert.equal(out.history.length, MAX_HISTORY)
  assert.ok(out.history[0].createdAt >= out.history[MAX_HISTORY - 1].createdAt)
  assert.equal(out.rewards[0].cost, 1)
})

test("T7 hasSourceId / earn 模板 / reading 门槛", () => {
  const H = [{ id: "t1", type: "earn" as const, points: 1, reason: "r", sourceId: "habit:h1:2026-01-01", createdAt: "" }]
  assert.equal(hasSourceId(H, "habit:h1:2026-01-01"), true)
  assert.equal(hasSourceId(H, ""), false)
  assert.equal(habitEarnReason("背"), "完成习惯「背」")
  assert.equal(homeworkEarnReason("卷"), "完成作业「卷」")
  assert.equal(readingEarnReason("三体", 35), "阅读「三体」35 分钟")
  assert.equal(isReadingEligible(29), false)
  assert.equal(isReadingEligible(30), true)
})

test("T8 addRewardItem empty/duplicate/invalid-cost/ok 排序", () => {
  const rs = [{ id: "r1", name: "贴纸", cost: 10 }]
  assert.equal(addRewardItem(rs, "   ", 5).reason, "empty")
  assert.equal(addRewardItem(rs, "贴纸", 5).reason, "duplicate")
  assert.equal(addRewardItem(rs, "X", 0).reason, "invalid-cost")
  const r = addRewardItem(rs, "昂贵", 50)
  assert.equal(r.ok, true)
  assert.equal(r.rewards[0].cost, 10)
})

test("T9 updateRewardItem not-found/empty/duplicate/ok 成本排序", () => {
  const rs = [{ id: "r1", name: "A", cost: 50 }, { id: "r2", name: "B", cost: 100 }]
  assert.equal(updateRewardItem(rs, "xx", {}).reason, "not-found")
  assert.equal(updateRewardItem(rs, "r1", { name: "  " }).reason, "empty")
  assert.equal(updateRewardItem(rs, "r1", { name: "B" }).reason, "duplicate")
  const r = updateRewardItem(rs, "r1", { cost: 200 })
  assert.equal(r.rewards[0].id, "r2")
})

test("T10 deleteRewardItem not-found/ok", () => {
  const rs = [{ id: "r1", name: "A", cost: 10 }]
  assert.equal(deleteRewardItem(rs, "r2").reason, "not-found")
  assert.equal(deleteRewardItem(rs, "r1").rewards.length, 0)
})

test("T11 manualEarn invalid/empty/ok 写 earn txn", () => {
  const b = emptyRewardsData()
  assert.equal(manualEarn(b, 0, "x").reason, "invalid-points")
  assert.equal(manualEarn(b, 10, "   ").reason, "empty")
  const r = manualEarn(b, 20, "表扬")
  assert.equal(r.data.totalPoints, 20)
  assert.equal(r.data.history[0].type, "earn")
})

test("T12 autoEarn 幂等：首次加分，再次 noop 无 data", () => {
  let d = emptyRewardsData()
  const r1 = autoEarn(d, POINTS_HABIT, habitEarnReason("背"), "habit:h1:2026-01-01")
  assert.equal(r1.ok, true)
  assert.equal(r1.data.totalPoints, 5)
  d = r1.data
  const r2 = autoEarn(d, POINTS_HABIT, habitEarnReason("背"), "habit:h1:2026-01-01")
  assert.equal(r2.ok, true)
  assert.ok(!r2.data)
})

test("T13 redeemReward not-found/out-of-stock/insufficient(带 shortage)/ok 扣库存扣分", () => {
  const d = { totalPoints: 20, history: [], rewards: [
    { id: "r1", name: "贴", cost: 50 },
    { id: "r2", name: "笔", cost: 10, stock: 0 },
    { id: "r3", name: "糖", cost: 5, stock: 3 },
  ] }
  assert.equal(redeemReward(d, "nope").reason, "not-found")
  assert.equal(redeemReward(d, "r2").reason, "out-of-stock")
  assert.equal(redeemReward(d, "r1").shortage, 30)
  const ok = redeemReward(d, "r3")
  assert.equal(ok.data.totalPoints, 15)
  assert.equal(ok.data.rewards.find(r => r.id === "r3").stock, 2)
})

test("T14 视图辅助：筛选/最近/统计/格式化", () => {
  const rs = [{ id: "a", name: "糖", cost: 5, stock: 3 }, { id: "b", name: "笔", cost: 10, stock: 0 }]
  const hist = [{ id: "t1", type: "earn" as const, points: 10, reason: "a", createdAt: "2026-02-01T00:00:00Z" }, { id: "t2", type: "redeem" as const, points: -5, reason: "b", createdAt: "2026-02-02T00:00:00Z" }]
  const d = { totalPoints: 5, history: hist, rewards: rs }
  assert.equal(filterActiveRewards(rs).length, 1)
  assert.equal(filterSoldOutRewards(rs).length, 1)
  assert.equal(recentHistory(hist, 1).length, 1)
  const s = calcRewardStats(d)
  assert.equal(s.totalEarned, 10)
  assert.equal(s.totalRedeemed, 5)
  assert.equal(s.txnCount, 2)
  assert.equal(formatTxnPoints(hist[0]), "+10")
  assert.equal(formatTxnPoints(hist[1]), "-5")
})

test("T15 history 仅最近 MAX_HISTORY（排序后截断）；非对象 → empty", () => {
  assert.deepEqual(normalizeRewardsData(123), emptyRewardsData())
  assert.deepEqual(normalizeRewardsData([]), emptyRewardsData())
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)

