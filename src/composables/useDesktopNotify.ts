// 桌面通知封装：纯函数模块（零 Pinia / Vue 依赖），供倒计时提醒引擎三通道分发调用。
// 所有函数在浏览器不支持 Notification API 时安全降级（返回 false / 'unsupported'），不抛错。
// 发送前自行判定权限，绝不主动请求权限（请求权限属 UI 层职责，由设置页触发）。

// 浏览器是否支持 Notification API（含 Safari 老前缀的兼容判断由运行时自行处理，这里仅探测标准 API）
export function notificationsSupported(): boolean {
  return 'Notification' in window
}

// 当前通知权限；浏览器不支持时返回 'unsupported'
export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

// 请求通知权限（返回最终权限态）；浏览器不支持 → 'unsupported'；
// requestPermission 抛异常（如非安全上下文）→ 视为未授权返回 'denied'，不向上抛错
export async function requestNotifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

// 发送一条桌面通知；仅当「支持 + 权限已授予」才真正创建，否则静默返回 false。
// tag 用于同标签去重（倒计时场景传倒计时 id，同一倒计时多条通知只保留最新一条）。
export function sendDesktopNotification(title: string, body: string, tag?: string): boolean {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  try {
    new Notification(title, { body, tag })
    return true
  } catch {
    // 创建失败（个别平台/浏览器限制）静默降级，不打扰用户
    return false
  }
}
