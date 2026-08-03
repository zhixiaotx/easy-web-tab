import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { TodoPriority, WorkbenchTodo } from '@/types'
import { idbGet, idbPut } from '../composables/useIdb'

// 优先级排序权重：高(0) → 中(1) → 低(2)
const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 }

// 工作台待办任务 store（数据存 IndexedDB，T8 填充完整增删改查）
export const useWorkbenchTodosStore = defineStore('workbenchTodos', () => {
  const todos = ref<WorkbenchTodo[]>([])

  // 筛选页签：全部 / 待办 / 已完成
  const filter = ref<'all' | 'active' | 'completed'>('all')
  // 关键字搜索（匹配 title + description）
  const searchQuery = ref('')

  async function loadTodos(): Promise<void> {
    try {
      todos.value = (await idbGet<WorkbenchTodo[]>('todos')) ?? []
    } catch (e) {
      console.error('[Todos] load failed', e)
      todos.value = []
    }
  }

  async function saveTodos(): Promise<void> {
    try {
      // toRaw：IDB 结构化克隆无法处理 Vue reactive Proxy（DataCloneError），需写入原始数组
      await idbPut('todos', toRaw(todos.value))
    } catch (e) {
      console.error('[Todos] save failed', e)
    }
  }

  async function addTodo(input: {
    title: string
    description?: string
    priority: TodoPriority
    dueDate?: string
  }): Promise<void> {
    const now = new Date().toISOString()
    todos.value.push({
      id: `td_${Date.now()}`,
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueDate: input.dueDate,
      completed: false,
      createdAt: now,
      updatedAt: now
    })
    await saveTodos()
  }

  async function updateTodo(id: string, patch: Partial<WorkbenchTodo>): Promise<void> {
    const index = todos.value.findIndex(t => t.id === id)
    if (index !== -1) {
      todos.value[index] = {
        ...todos.value[index],
        ...patch,
        updatedAt: new Date().toISOString()
      }
      await saveTodos()
    }
  }

  async function deleteTodo(id: string): Promise<void> {
    // 从 toRaw 的原始数组 filter：在 reactive 代理上直接 filter 会得到 Proxy 元素，
    // toRaw 只解开一层数组，残留的 Proxy 元素会让 IDB 结构化克隆抛 DataCloneError（L1 变体）
    todos.value = toRaw(todos.value).filter(t => t.id !== id)
    await saveTodos()
  }

  async function toggleTodo(id: string): Promise<void> {
    const todo = todos.value.find(t => t.id === id)
    if (todo) {
      todo.completed = !todo.completed
      todo.updatedAt = new Date().toISOString()
      await saveTodos()
    }
  }

  // 筛选 + 搜索 + 排序：未完成在前 → 优先级(高→低) → 截止日期升序(无截止排最后) → 创建时间降序(新的在前)
  const visibleTodos = computed<WorkbenchTodo[]>(() => {
    const q = searchQuery.value.trim().toLowerCase()
    const filtered = todos.value.filter(t => {
      if (filter.value === 'active' && t.completed) return false
      if (filter.value === 'completed' && !t.completed) return false
      if (q) {
        const inTitle = t.title.toLowerCase().includes(q)
        const inDesc = t.description ? t.description.toLowerCase().includes(q) : false
        if (!inTitle && !inDesc) return false
      }
      return true
    })
    return [...filtered].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const pa = PRIORITY_ORDER[a.priority]
      const pb = PRIORITY_ORDER[b.priority]
      if (pa !== pb) return pa - pb
      if (a.dueDate !== b.dueDate) {
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate < b.dueDate ? -1 : 1
      }
      return a.createdAt < b.createdAt ? 1 : -1
    })
  })

  // 页签计数
  const totalCount = computed(() => todos.value.length)
  const activeCount = computed(() => todos.value.filter(t => !t.completed).length)
  const completedCount = computed(() => todos.value.filter(t => t.completed).length)

  return {
    todos,
    loadTodos,
    saveTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    filter,
    searchQuery,
    visibleTodos,
    totalCount,
    activeCount,
    completedCount
  }
})
