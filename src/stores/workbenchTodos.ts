import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { TodoPriority, WorkbenchTodo } from '@/types'
import {
  normalizeTodo,
  BUILTIN_TODO_CATEGORIES,
  isTodoBuiltinCategory,
  moveCustomCategoryInList
} from '@/composables/todoCore'
import { idbGet, idbPut } from '../composables/useIdb'

// 优先级排序权重：高(0) → 中(1) → 低(2)
const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 }

// 分类注册表偏好（localStorage，不随 JSON 备份导出——与倒计时分类偏好同策略）：
// customCategories = 用户自定义分类名数组；tabCategories = 标签页可见分类（默认全部内置）
const TODO_CATEGORIES_KEY = 'user-todo-categories'
const TODO_TAB_CATEGORIES_KEY = 'user-todo-tab-categories'

/** 分类操作错误语义：empty 空名 / builtin 内置禁删 / duplicate 重名 / not-found 不存在 / in-use 被引用 / boundary 已在边界。 */
export type TodoCategoryError = 'empty' | 'builtin' | 'duplicate' | 'not-found' | 'in-use' | 'boundary'
/** 分类 CRUD 统一返回结构（ok:true 无 reason；ok:false 时 reason 语义精确）。 */
export type TodoCategoryOp = { ok: boolean; reason?: TodoCategoryError }

/** 从 localStorage 读字符串数组：JSON.parse 校验是 string[]，损坏/非数组 → []。 */
function readStringArray(key: string): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(raw) && raw.every(item => typeof item === 'string') ? raw : []
  } catch {
    return []
  }
}

// 工作台待办任务 store（数据存 IndexedDB，T8 填充完整增删改查）
export const useWorkbenchTodosStore = defineStore('workbenchTodos', () => {
  const todos = ref<WorkbenchTodo[]>([])

  // ===== 分类管理（自定义分类注册表 + 标签页可见分类，仿倒计时 store）=====
  const customCategories = ref<string[]>([])
  const tabCategories = ref<string[]>([])

  // 内置 3 类 + 自定义分类（表单下拉全量来源）
  const allCategories = computed<string[]>(() => [...BUILTIN_TODO_CATEGORIES, ...customCategories.value])

  function loadCategoryPreferences(): void {
    customCategories.value = readStringArray(TODO_CATEGORIES_KEY)
    const saved = readStringArray(TODO_TAB_CATEGORIES_KEY)
    // 首次无记录 → 默认全部内置分类可见；有记录则原样恢复
    tabCategories.value = saved.length > 0 ? saved : [...BUILTIN_TODO_CATEGORIES]
  }

  function persistCategoryPreferences(): void {
    localStorage.setItem(TODO_CATEGORIES_KEY, JSON.stringify(customCategories.value))
    localStorage.setItem(TODO_TAB_CATEGORIES_KEY, JSON.stringify(tabCategories.value))
  }

  function addCategory(name: string): TodoCategoryOp {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    // 大小写不敏感查重（含内置分类）
    if (allCategories.value.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: 'duplicate' }
    }
    customCategories.value.push(trimmed)
    // 新建分类自动加入标签页
    if (!tabCategories.value.includes(trimmed)) tabCategories.value.push(trimmed)
    persistCategoryPreferences()
    return { ok: true }
  }

  async function updateCategory(oldName: string, newName: string): Promise<TodoCategoryOp> {
    if (!customCategories.value.includes(oldName)) return { ok: false, reason: 'not-found' }
    const trimmed = newName.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    // 与其他分类重名（≠ oldName 自身，大小写不敏感）
    if (allCategories.value.some(c => c !== oldName && c.toLowerCase() === trimmed.toLowerCase())) {
      return { ok: false, reason: 'duplicate' }
    }
    const idx = customCategories.value.indexOf(oldName)
    customCategories.value[idx] = trimmed
    const ti = tabCategories.value.indexOf(oldName)
    if (ti !== -1) tabCategories.value[ti] = trimmed
    // 同步存量 todos 分类字段（toRaw 防 DataCloneError；整数组重建触发响应式）
    todos.value = toRaw(todos.value).map(t =>
      t.categoryId === oldName ? { ...t, categoryId: trimmed, updatedAt: new Date().toISOString() } : t
    )
    await saveTodos()
    persistCategoryPreferences()
    return { ok: true }
  }

  function deleteCategory(name: string): TodoCategoryOp {
    if (isTodoBuiltinCategory(name)) return { ok: false, reason: 'builtin' }
    if (!customCategories.value.includes(name)) return { ok: false, reason: 'not-found' }
    // 被任一 todo（全量，非筛选视图）引用禁删（同倒计时/记账策略）
    if (todos.value.some(t => t.categoryId === name)) return { ok: false, reason: 'in-use' }
    customCategories.value = customCategories.value.filter(c => c !== name)
    tabCategories.value = tabCategories.value.filter(c => c !== name)
    persistCategoryPreferences()
    return { ok: true }
  }

  function moveCategory(name: string, dir: 'up' | 'down'): TodoCategoryOp {
    if (!customCategories.value.includes(name)) return { ok: false, reason: 'not-found' }
    const next = moveCustomCategoryInList(customCategories.value, name, dir)
    // 已在边界（顺序未变）→ boundary
    if (next.every((c, i) => c === customCategories.value[i])) {
      return { ok: false, reason: 'boundary' }
    }
    // 新数组整体赋值触发响应式（ref 数组替换）
    customCategories.value = next
    persistCategoryPreferences()
    return { ok: true }
  }

  function toggleTabCategory(name: string, visible: boolean): TodoCategoryOp {
    if (!allCategories.value.includes(name)) return { ok: false, reason: 'not-found' }
    if (visible) {
      if (!tabCategories.value.includes(name)) tabCategories.value.push(name)
    } else {
      tabCategories.value = tabCategories.value.filter(c => c !== name)
    }
    persistCategoryPreferences()
    return { ok: true }
  }

  // 分类偏好惰性加载（setup 内同步初始化）
  loadCategoryPreferences()

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
    categoryId?: string
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
        color: input.color,
        categoryId: input.categoryId
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
    customCategories,
    tabCategories,
    allCategories,
    loadTodos,
    saveTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    toggleTodo,
    addCategory,
    updateCategory,
    deleteCategory,
    moveCategory,
    toggleTabCategory,
    sortedTodos,
    totalCount,
    activeCount,
    completedCount
  }
})
