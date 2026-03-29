import type { Site, SitesData, Category } from '../types'
import type { SearchEngine } from '../stores/searchEngines'
import yaml from 'js-yaml'

export function useMarkdown() {
  function parseSitesFromMarkdown(content: string): SitesData & { categories?: Category[]; searchEngines?: SearchEngine[] } {
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

      return {
        sites: sitesData || [],
        lastUpdated: data.lastUpdated as string | undefined,
        categories: categoriesData,
        searchEngines: searchEnginesData
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
