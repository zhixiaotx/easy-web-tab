import assert from 'node:assert/strict'
import { renderMarkdown } from '../src/composables/noteMarkdown.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// 断言计数器：Proxy 包装 node:assert/strict，每次断言调用 +1（输出 assertion 总数）
let assertCount = 0
const a: typeof assert = new Proxy(assert, {
  get(t, prop) {
    const v = Reflect.get(t, prop)
    if (typeof v === 'function') {
      return (...args: unknown[]) => {
        assertCount++
        return (v as (...x: unknown[]) => unknown).apply(t, args)
      }
    }
    return v
  }
}) as typeof assert

// markdown-it 渲染结果固定以 '\n' 结尾（块级 token 后换行），
// trimRender 去掉尾部换行后做精确匹配；个别断言保留 RAW 输出以证明该行为已被理解。
function trimRender(s: string): string {
  return renderMarkdown(s).trim()
}

// T1 — 标题：`# 标题` → `<h1>标题</h1>`
// 额外锁定 RAW 渲染：markdown-it 在块级 token 后追加尾部 '\n'，
// 故 renderMarkdown('# 标题') 精确等于 "<h1>标题</h1>\n"（非仅 trim 后相等）。
test('T1 heading renders h1', () => {
  a.equal(trimRender('# 标题'), '<h1>标题</h1>')
  a.equal(renderMarkdown('# 标题'), '<h1>标题</h1>\n') // RAW：尾部换行行为已确认
})

// T2 — 加粗：`**加粗**` → 包含 `<strong>加粗</strong>`，且段落以 `<p>` 开头
test('T2 bold wrapped in paragraph', () => {
  const out = trimRender('**加粗**')
  a.ok(out.includes('<strong>加粗</strong>'))
  a.ok(out.startsWith('<p>'))
})

// T3 — 硬换行（breaks:true）：`a\nb` → `<p>a<br>`（单换行不拆段）
test('T3 single newline becomes <br>', () => {
  a.ok(trimRender('a\nb').includes('<p>a<br>'))
})

// T4 — 显式链接：href 保留 + 新窗口 + noopener nofollow
test('T4 explicit link opens in new tab with rel', () => {
  const out = trimRender('[链接](https://example.com)')
  a.ok(out.includes('href="https://example.com"'))
  a.ok(out.includes('target="_blank"'))
  a.ok(out.includes('rel="noopener nofollow"'))
})

// T5 — linkify（linkify:true）：裸 URL 自动转链接，同样走 link_open 规则（target/rel）
test('T5 linkify autolinks bare url with target', () => {
  const out = trimRender('访问 https://example.com')
  a.ok(out.includes('<a href="https://example.com"'))
  a.ok(out.includes('target="_blank"'))
})

// T6 — XSS：html:false 使 `<script>` 转义为 `&lt;script&gt;`，不产生真实 script 标签
test('T6 script tag is escaped', () => {
  const out = trimRender('<script>alert(1)</script>')
  a.ok(out.includes('&lt;script&gt;'))
  a.ok(!out.includes('<script>alert'))
})

// T7 — javascript: 协议链接：validateLink 拒绝 → 不生成 `<a>`；
// 观测到的确定性行为：markdown-it 将失败链接整体回显为转义纯文本
// `<p>[x](javascript:alert(1))</p>`（link 令牌从未建立，原文照抄）。
// 因此 `javascript:` 字符串以纯文本形式合法存在于输出中——锁该精确行为，
// 核心安全不变量是「不存在可点击的危险 href」。
test('T7 javascript: link is not rendered as <a>', () => {
  const out = trimRender('[x](javascript:alert(1))')
  a.ok(!out.includes('<a'))
  a.equal(out, '<p>[x](javascript:alert(1))</p>') // 原文转义回显（无链接）
})

// T8 — 原始 HTML：html:false 使 `<img ...>` 转义，不产生 img 标签
test('T8 raw html img is escaped', () => {
  const out = trimRender('<img src=x onerror=alert(1)>')
  a.ok(!out.includes('<img'))
})

// T9 — 空字符串：返回 ''（不产生任何标记）
test('T9 empty string renders empty', () => {
  a.equal(trimRender(''), '')
  a.equal(renderMarkdown(''), '')
})

// T10 — 纯空白输入：先观测 markdown-it 行为 —— `'\n\n  '` 渲染为 ''（空串，非 `<p></p>`）。
// 据此锁定该精确行为：结果为空串，且不含任何元素标记（/<\/?[a-z]/i 不匹配）。
test('T10 whitespace-only renders empty (observed: "" not <p></p>)', () => {
  const out = renderMarkdown('\n\n  ')
  a.equal(out, '') // 观测结论：markdown-it 对纯空白输入不产出 `<p></p>`，直接输出空串
  a.ok(!/<\/?[a-z]/i.test(out))
})

// T11 — 无序列表：包含 ul 与两项 li
test('T11 unordered list renders ul/li', () => {
  const out = trimRender('- a\n- b')
  a.ok(out.includes('<ul>'))
  a.ok(out.includes('<li>a</li>'))
  a.ok(out.includes('<li>b</li>'))
})

// T12 — 围栏代码块：包含 `<pre><code>`
test('T12 fenced code block renders pre/code', () => {
  a.ok(trimRender('```\ncode\n```').includes('<pre><code>'))
})

// T13 — GFM 表格：包含 `<table>`
test('T13 table renders table element', () => {
  a.ok(trimRender('| a | b |\n|---|---|\n| 1 | 2 |').includes('<table>'))
})

// T14 — 引用块：包含 `<blockquote>`
test('T14 blockquote renders', () => {
  a.ok(trimRender('> quote').includes('<blockquote>'))
})

// T15 — 分隔线：包含 `<hr>`
test('T15 hr renders', () => {
  a.ok(trimRender('---').includes('<hr>'))
})

// T16 — 图片：markdown 图片语法生成 `<img>`
test('T16 markdown image renders img', () => {
  a.ok(trimRender('![图](https://x.com/i.png)').includes('<img'))
})

// T17 — 非字符串入参（undefined/null）：防御式返回 ''，不抛异常
test('T17 undefined/null render empty', () => {
  a.equal(renderMarkdown(undefined as any), '')
  a.equal(renderMarkdown(null as any), '')
})

// T18 — 确定性：相同输入两次渲染结果逐字节一致（惰性单例 md 实例不会引入状态）
test('T18 deterministic output for same input', () => {
  a.equal(renderMarkdown('**加粗**'), renderMarkdown('**加粗**'))
  a.equal(renderMarkdown('# 标题'), renderMarkdown('# 标题'))
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
if (failed > 0) {
  console.error(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 1`)
  process.exit(1)
}
console.log(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 0`)
