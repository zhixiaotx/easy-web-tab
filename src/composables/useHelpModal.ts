import { shallowRef, readonly } from 'vue'

// Singleton state - shared across all components (same pattern as useToast.ts)
const showHelp = shallowRef(false)

export function useHelpModal() {
  const openHelp = () => { showHelp.value = true }
  const closeHelp = () => { showHelp.value = false }

  return {
    showHelp: readonly(showHelp),
    openHelp,
    closeHelp,
  }
}
