// 倒计时提醒纯逻辑模块：邮件提醒配置校验 + 发送决策 + EmailJS 模板参数构造。
// 零 vue/pinia 依赖（node --experimental-strip-types 可运行），组件/提醒引擎只调用本模块，禁止内联重算。
// EmailJS 模板变量命名契约：to_email / countdown_name / occurrence_time / app_url（与模板侧占位符一致）。

/** 邮件提醒配置（来自 AppSettingsData 的设置字段，归一化为本形状后消费）。 */
export interface ReminderEmailConfig {
  enabled: boolean
  toEmail: string
  serviceId: string
  templateId: string
  publicKey: string
}

/**
 * 邮件提醒是否已配置可用：总开关开启 AND 收件箱/Service ID/Template ID/Public Key 全部 trim 后非空。
 * 空串/纯空白/未填任一字段 → false（缺任一字段发送必然失败，提前短路）。
 */
export function isEmailConfigured(cfg: ReminderEmailConfig): boolean {
  if (cfg.enabled !== true) return false
  return (
    cfg.toEmail.trim() !== '' &&
    cfg.serviceId.trim() !== '' &&
    cfg.templateId.trim() !== '' &&
    cfg.publicKey.trim() !== ''
  )
}

/**
 * 单条倒计时本次是否应发提醒邮件：该倒计时开启邮件提醒（emailReminder === true）且邮件配置可用。
 * 缺省/关闭/配置不完整 → false（静默跳过，不抛错）。
 */
export function shouldSendReminderEmail(c: { emailReminder?: boolean }, cfg: ReminderEmailConfig): boolean {
  return c.emailReminder === true && isEmailConfigured(cfg)
}

/**
 * 构造 EmailJS 模板参数：模板变量 to_email / countdown_name / occurrence_time 恒输出，
 * app_url 仅在传入非空时附加（模板未引用该变量则多余参数被 EmailJS 忽略，安全）。
 */
export function buildEmailParams(
  c: { id: string; name: string },
  occurrenceTime: string,
  toEmail: string,
  appUrl?: string
): Record<string, string> {
  return {
    to_email: toEmail,
    countdown_name: c.name,
    occurrence_time: occurrenceTime,
    ...(appUrl ? { app_url: appUrl } : {})
  }
}
