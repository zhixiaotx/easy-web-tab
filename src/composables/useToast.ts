import { shallowRef, readonly } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
  duration: number
}

// Singleton state - shared across all components
const toasts = shallowRef<ToastItem[]>([])
let nextId = 1

export function useToast() {
  const showToast = (type: ToastType, message: string, duration = 2500) => {
    const id = nextId++
    toasts.value = [...toasts.value, { id, type, message, duration }]
    
    // Auto remove after duration
    setTimeout(() => {
      removeToast(id)
    }, duration)
    
    return id
  }
  
  const removeToast = (id: number) => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }
  
  const success = (message: string, duration?: number) => showToast('success', message, duration)
  const error = (message: string, duration?: number) => showToast('error', message, duration)
  const warning = (message: string, duration?: number) => showToast('warning', message, duration)
  const info = (message: string, duration?: number) => showToast('info', message, duration)
  
  return {
    toasts: readonly(toasts),
    showToast,
    removeToast,
    success,
    error,
    warning,
    info
  }
}