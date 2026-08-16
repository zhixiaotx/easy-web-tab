// EmailJS 邮件提醒封装：纯函数模块（零 Pinia 依赖），供倒计时提醒引擎发送到期邮件。
// 采用 EmailJS v4 options-param 模式：send 第 4 参传 { publicKey }，
// 不做全局 init（emailjs.init），避免全局 key 过期后影响所有发送。
import emailjs from '@emailjs/browser'
import type { ReminderEmailConfig } from './reminderCore'

// 发送倒计时到期邮件提醒。
// 契约：发送失败静默降级 —— console.warn 记录后返回 false，不重试、不弹 toast。
// 返回 true 仅当请求已发出且服务端状态码为 200（邮件已提交给 EmailJS 平台）。
export async function sendReminderEmail(
  cfg: ReminderEmailConfig,
  params: Record<string, string>
): Promise<boolean> {
  try {
    const res = await emailjs.send(cfg.serviceId, cfg.templateId, params, { publicKey: cfg.publicKey })
    return res?.status === 200
  } catch (error) {
    console.warn('[ReminderEmail] 发送失败:', error)
    return false
  }
}
