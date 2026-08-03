import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import type { WorkbenchTodo } from '@/types'
import { idbGet, idbPut } from '../composables/useIdb'

// 工作台待办任务 store（数据存 IndexedDB，T8 填充完整增删改查）
export const useWorkbenchTodosStore = defineStore('workbenchTodos', () => {
  const todos = ref<WorkbenchTodo[]>([])

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

  return { todos, loadTodos, saveTodos }
})
