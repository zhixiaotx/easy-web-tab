import type { Site, SitesData, Category, PasswordEntry, Countdown } from '../types'
import type { SearchEngine } from '../stores/searchEngines'
import { parseRepeat } from './countdownCore'
import yaml from 'js-yaml'

export function useMarkdown() {
  function parseSitesFromMarkdown(content: string): SitesData & { categories?: Category[]; searchEngines?: SearchEngine[]; passwords?: PasswordEntry[]; countdowns?: Countdown[] } {
    try {
      // 提取 frontmatter (--- 之间的内容)
      const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*/
      const match = content.match(frontmatterRegex)
      
      if (!match) {
        return { sites: [] }
      }

      const frontmatter = match[1]
      const data = yaml.load(frontmatter) as Record<string, unknown>
      
      const sitesData = data.sites as Site[] | undefined
      const categoriesData = data.categories as Category[] | undefined
      const searchEnginesData = data.searchEngines as SearchEngine[] | undefined
      const passwordsData = data.passwords as PasswordEntry[] | undefined

      // 解析倒计时数据（防御性解析：缺失字段使用生成的默认值兜底）
      const countdownsData: Countdown[] | undefined = Array.isArray(data.countdowns)
        ? data.countdowns.map((item, index) => {
            const raw = item as Record<string, unknown> | null
            const now = new Date().toISOString()
            const fallbackId = `cd_${Date.now()}_${index}`
            return {
              id: typeof raw?.id === 'string' && raw.id.trim() !== '' ? raw.id : fallbackId,
              name: typeof raw?.name === 'string' ? raw.name : '',
              endDateTime: typeof raw?.endDateTime === 'string' ? raw.endDateTime : '',
              repeat: parseRepeat(raw?.repeat),
              // 分类：任意非空字符串透传（内置 6 类 + 用户自定义名），缺失/空串 → undefined（后续 normalize 兜底 'work'）
              category: typeof raw?.category === 'string' && raw.category.trim() !== '' ? raw.category.trim() : undefined,
              color: typeof raw?.color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.color) ? raw.color : undefined,
              lastRemindedAt: typeof raw?.lastRemindedAt === 'string' && raw.lastRemindedAt.trim() !== '' ? raw.lastRemindedAt : undefined,
              createdAt: typeof raw?.createdAt === 'string' && raw.createdAt.trim() !== '' ? raw.createdAt : now,
              updatedAt: typeof raw?.updatedAt === 'string' && raw.updatedAt.trim() !== '' ? raw.updatedAt : now,
              sortOrder: typeof raw?.sortOrder === 'number' ? raw.sortOrder : undefined,
              showOnDisplay: typeof raw?.showOnDisplay === 'boolean' ? raw.showOnDisplay : undefined
            }
          })
        : undefined

      return {
        sites: sitesData || [],
        lastUpdated: data.lastUpdated as string | undefined,
        categories: categoriesData,
        searchEngines: searchEnginesData,
        passwords: passwordsData,
        countdowns: countdownsData
      }
    } catch (error) {
      console.error('[Import] Parse error:', error)
      return { sites: [] }
    }
  }

  return {
    parseSitesFromMarkdown
  }
}
