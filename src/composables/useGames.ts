import { ref, onMounted } from 'vue'

export interface GameEntry {
  id: string
  name: string
  path: string
  description: string
  icon: string
  category: string
}

const games = ref<GameEntry[]>([])
const loaded = ref(false)

export function useGames() {
  const loadGames = async () => {
    if (loaded.value) return
    
    try {
      const response = await fetch('/games/manifest.json')
      if (response.ok) {
        games.value = await response.json()
      }
    } catch (e) {
      console.warn('Failed to load games manifest:', e)
    }
    
    loaded.value = true
  }

  onMounted(() => {
    loadGames()
  })

  return {
    games,
    loadGames
  }
}
