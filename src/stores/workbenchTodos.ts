import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { TodoPriority, WorkbenchTodo } from '@/types'
import { normalizeTodo } from '@/composables/todoCore'
import { idbGet, idbPut } from '../composables/useIdb'

// 优先级排序权重：高(0) → 中(1) → 低(2)
const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 }

// 工作台待办任务 store（数据存 IndexedDB，T8 填充完整增删改查）
export const useWorkbenchTodosStore = defineStore('workbenchTodos', () => {
  const todos = ref<WorkbenchTodo[]>([])

  async function loadTodos(): Promise<void> {
    try {
      // 存量数据（无 color 等字段）经 normalizeTodo 幂等归一
      todos.value = ((await idbGet<WorkbenchTodo[]>('todos')) ?? []).map(normalizeTodo)
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
    color?: string
  }): Promise<void> {
    const now = new Date().toISOString()
    todos.value.push(
      normalizeTodo({
        id: `td_${Date.now()}`,
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: input.dueDate,
        completed: false,
        createdAt: now,
        updatedAt: now,
        color: input.color
      })
    )
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

  // 排序（查询筛选由组件经 filterTodos 应用）：未完成在前 → 优先级(高→低) → 截止日期升序(无截止排最后) → 创建时间降序(新的在前)
  const sortedTodos = computed<WorkbenchTodo[]>(() =>
    [...todos.value].sort((a, b) => {
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
  )

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
    sortedTodos,
    totalCount,
    activeCount,
    completedCount
  }
})
