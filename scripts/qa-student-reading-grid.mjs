import { chromium } from "playwright"
import { spawn } from "node:child_process"

const PORT = 16718
const BASE = `http://localhost:${PORT}`
const results = []
const startMs = Date.now()

function record(name, pass, info) {
  const line = `${pass ? "PASS " : "FAIL "} ${name}${info ? "  " + JSON.stringify(info).slice(0, 400) : ""}`
  results.push({ name, pass, info })
  console.log(line)
}

function startDev() {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "dev"], {
      cwd: "d:/opencodeWorkSpace/easy-web-tab",
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" }
    })
    let done = false
    const timeout = setTimeout(() => { if (!done) { done = true; reject(new Error("dev timeout")) } }, 60000)
    let buf = ""
    child.stdout.on("data", (d) => { buf += d.toString(); if (!done && buf.includes("ready in")) { clearTimeout(timeout); done = true; resolve(child) } })
    child.stderr.on("data", (d) => { buf += d.toString() })
    child.on("exit", (c) => { if (!done) { clearTimeout(timeout); reject(new Error("dev exit " + c)) } })
  })
}

const SEED_ENTRIES = Array.from({ length: 13 }, (_, i) => ({
  id: "rd_s" + (i + 1),
  bookTitle: "阅读书-" + (i + 1) + " " + (i % 2 ? "长书名测试看会不会截断溢出显示效果测试ABC" : "小书"),
  pages: 10 + i,
  durationMin: 15 + (i % 6) * 5,
  date: `2026-0${8 - (i % 3)}-${String(28 - (i % 27)).padStart(2, "0")}`,
  impression: i % 3 === 0 ? "第" + (i + 1) + "本的感悟，白雪公主的故事很精彩。" : undefined,
  parentSigned: i % 2 === 0,
  signedAt: i % 2 === 0 ? "2026-08-30T10:00:00.000Z" : undefined,
  createdAt: `2026-08-${String(30 - Math.floor(i / 3)).padStart(2, "0")}T00:00:00.000Z`,
  updatedAt: `2026-08-${String(30 - Math.floor(i / 3)).padStart(2, "0")}T00:00:00.000Z`
}))

async function inject(page) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 45000 })
  await page.waitForSelector("#app", { timeout: 30000 })
  await page.evaluate((entries) => new Promise((resolve) => {
    setTimeout(() => {
      try {
        const idbReq = indexedDB.open("easy-web-tab", 6)
        idbReq.onupgradeneeded = () => {
          const db = idbReq.result
          for (const name of ["student_reading"]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
        }
        idbReq.onsuccess = () => {
          const db = idbReq.result
          const tx = db.transaction("student_reading", "readwrite")
          tx.objectStore("student_reading").put({ entries }, "studentReading")
          tx.oncomplete = () => { db.close(); resolve(true) }
          tx.onerror = () => { db.close(); resolve(false) }
        }
        idbReq.onerror = () => resolve(false)
      } catch { resolve(false) }
    }, 250)
  }), SEED_ENTRIES)
  await page.goto(BASE + "/student", { waitUntil: "domcontentloaded", timeout: 45000 })
  await page.waitForTimeout(800)
  for (let tries = 0; tries < 6; tries++) {
    const ok = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll(".st-side-menu li, [data-testid^=\"sm-item-\"]"))
      const target = items[7]
      if (target) { target.click(); return true }
      return false
    })
    if (ok) break
    await page.waitForTimeout(350)
  }
  await page.waitForSelector('[data-testid^="sr-card-"]', { state: "visible", timeout: 25000 })
  await page.waitForTimeout(600)
}

async function checkGridColumns(page) {
  return await page.evaluate(() => {
    const el = document.querySelector(".sr-list")
    if (!el) return { ok: false, reason: "no sr-list" }
    const cs = getComputedStyle(el)
    const gt = cs.gridTemplateColumns
    const cols = gt.split(" ").filter(x => x.trim() !== "").length
    return { ok: cols === 5, cols, gt, w: el.clientWidth }
  })
}

async function checkPaging(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector(".st-content") || document.body
    const count = document.querySelectorAll('[data-testid^="sr-card-"]').length
    const pager = document.querySelector('[data-testid="panel-pager"]')
    const info = document.querySelector('[data-testid="panel-pager-info"]')
    const nextBtn = document.querySelector('[data-testid="panel-pager-next"]')
    const prevBtn = document.querySelector('[data-testid="panel-pager-prev"]')
    const list = document.querySelector(".sr-list")
    const parent = list?.parentElement
    return {
      count,
      pageInfo: info ? info.textContent?.trim() : null,
      hasPager: !!pager,
      nextDisabled: nextBtn ? nextBtn.disabled : true,
      prevDisabled: prevBtn ? prevBtn.disabled : true,
      shellH: shell.clientHeight,
      listScrollH: list?.scrollHeight ?? 0,
      listClientH: parent?.clientHeight ?? shell.clientHeight
    }
  })
}

;(async () => {
  let dev = null; let browser = null; let page = null
  try {
    dev = await startDev()
    browser = await chromium.launch({ headless: true, args: ["--window-size=1440,900"] })
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await inject(page)

    const cols1 = await checkGridColumns(page)
    record("P1 grid columns=5", cols1.ok, cols1)

    const p1 = await checkPaging(page)
    record("P1 第1页卡数=10 (13条分10+3)", p1.count === 10, { p1Count: p1.count, pageInfo: p1.pageInfo, pager: p1.hasPager })
    record("P1 有分页 + next 可点", p1.hasPager && !p1.nextDisabled, { hasPager: p1.hasPager, nextDisabled: p1.nextDisabled })

    if (p1.hasPager && !p1.nextDisabled) {
      await page.evaluate(() => { const b = document.querySelector('[data-testid="panel-pager-next"]'); if (b && !b.disabled) b.click() })
      await page.waitForTimeout(450)
      const p2 = await checkPaging(page)
      record("P2 第2页卡数=3", p2.count === 3, { p2Count: p2.count, pageInfo: p2.pageInfo })
      record("P2 prev 可点 + next 禁用", !p2.prevDisabled && p2.nextDisabled, { prevDisabled: p2.prevDisabled, nextDisabled: p2.nextDisabled })
    }

    const final = await checkPaging(page)
    const fits = final.listScrollH <= final.listClientH + 20
    record("P2 列表不溢出容器 (一屏)", fits, final)

  } catch (e) {
    console.error("ERR", e?.stack || e)
    record("FATAL", false, { msg: String(e)?.slice(0, 250) })
  } finally {
    try { await page?.close() } catch {}
    try { await browser?.close() } catch {}
    if (dev) { try { dev.kill() } catch {} }
  }
  const pass = results.filter(r => r.pass).length
  const fail = results.length - pass
  console.log(`\n===== Reading Grid QA =====\nPASS=${pass} FAIL=${fail} TOTAL=${results.length}  (${(Date.now()-startMs)/1000|0}s)`)
  process.exit(fail > 0 ? 1 : 0)
})()