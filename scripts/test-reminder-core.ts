import assert from 'node:assert/strict'
import {
  isEmailConfigured,
  shouldSendReminderEmail,
  buildEmailParams,
  type ReminderEmailConfig
} from '../src/composables/reminderCore.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// 构造一份「全字段填齐 + 总开关开启」的基准配置，用例用 partial 覆盖单个字段
function cfg(overrides: Partial<ReminderEmailConfig> = {}): ReminderEmailConfig {
  return {
    enabled: true,
    toEmail: 'me@example.com',
    serviceId: 'service_abc',
    templateId: 'template_xyz',
    publicKey: 'public_key_123',
    ...overrides
  }
}

// T1 — 总开关关闭 + 全部填齐 → false
test('T1 isEmailConfigured: enabled=false + all filled → false', () => {
  assert.equal(isEmailConfigured(cfg({ enabled: false })), false)
})

// T2 — 总开关开启 + 全部为空 → false
test('T2 isEmailConfigured: enabled=true + all empty → false', () => {
  assert.equal(isEmailConfigured(cfg({ toEmail: '', serviceId: '', templateId: '', publicKey: '' })), false)
})

// T3 — 总开关开启 + 任一字段缺失 → false（四个字段分别验证）
test('T3 isEmailConfigured: enabled=true + one missing → false', () => {
  assert.equal(isEmailConfigured(cfg({ toEmail: '' })), false)
  assert.equal(isEmailConfigured(cfg({ serviceId: '' })), false)
  assert.equal(isEmailConfigured(cfg({ templateId: '' })), false)
  assert.equal(isEmailConfigured(cfg({ publicKey: '' })), false)
})

// T4 — 总开关开启 + 全部填齐 → true
test('T4 isEmailConfigured: enabled=true + all filled → true', () => {
  assert.equal(isEmailConfigured(cfg()), true)
})

// T5 — 纯空白字符串（trim 后为空）→ false
test('T5 isEmailConfigured: enabled=true + whitespace-only strings → false', () => {
  assert.equal(isEmailConfigured(cfg({ toEmail: '   ' })), false)
  assert.equal(isEmailConfigured(cfg({ serviceId: '  ' })), false)
  assert.equal(isEmailConfigured(cfg({ templateId: '\t' })), false)
  assert.equal(isEmailConfigured(cfg({ publicKey: ' ' })), false)
})

// T6 — 倒计时未开邮件提醒（缺省/undefined）+ 已配置 → false
test('T6 shouldSendReminderEmail: emailReminder undefined + configured → false', () => {
  assert.equal(shouldSendReminderEmail({}, cfg()), false)
  assert.equal(shouldSendReminderEmail({ emailReminder: undefined }, cfg()), false)
})

// T7 — 倒计时显式关闭邮件提醒 + 已配置 → false
test('T7 shouldSendReminderEmail: emailReminder false + configured → false', () => {
  assert.equal(shouldSendReminderEmail({ emailReminder: false }, cfg()), false)
})

// T8 — 倒计时开启邮件提醒 + 未配置（总开关关 / 字段缺失）→ false
test('T8 shouldSendReminderEmail: emailReminder true + NOT configured → false', () => {
  assert.equal(shouldSendReminderEmail({ emailReminder: true }, cfg({ enabled: false })), false)
  assert.equal(shouldSendReminderEmail({ emailReminder: true }, cfg({ toEmail: '' })), false)
})

// T9 — 倒计时开启邮件提醒 + 已配置 → true
test('T9 shouldSendReminderEmail: emailReminder true + configured → true', () => {
  assert.equal(shouldSendReminderEmail({ emailReminder: true }, cfg()), true)
})

// T10 — buildEmailParams 精确形状：三必填模板变量 + app_url 传入时附加/未传不附加/空串不附加
test('T10 buildEmailParams', () => {
  const c = { id: 'cd_1', name: '年终总结' }
  assert.deepEqual(buildEmailParams(c, '2026-12-31 09:00', 'me@example.com'), {
    to_email: 'me@example.com',
    countdown_name: '年终总结',
    occurrence_time: '2026-12-31 09:00'
  })
  assert.deepEqual(buildEmailParams(c, '2026-12-31 09:00', 'me@example.com', 'http://localhost:16718'), {
    to_email: 'me@example.com',
    countdown_name: '年终总结',
    occurrence_time: '2026-12-31 09:00',
    app_url: 'http://localhost:16718'
  })
  // 空串 appUrl → 视同未传，不附加 app_url
  assert.deepEqual(buildEmailParams(c, '2026-12-31 09:00', 'me@example.com', ''), {
    to_email: 'me@example.com',
    countdown_name: '年终总结',
    occurrence_time: '2026-12-31 09:00'
  })
})

let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`PASS  ${t.name}`)
  } catch (e) {
    failed++
    console.error(`FAIL  ${t.name}\n      ${e instanceof Error ? e.message : e}`)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
process.exit(failed > 0 ? 1 : 0)
