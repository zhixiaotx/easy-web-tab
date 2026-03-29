/**
 * 数据备份 composable
 * - 本地版本历史（最近10个版本）
 * - 手动导出到文件
 * - 自动备份触发
 */

export interface BackupData {
  timestamp: string
  sites: any[]
  categories: any[]
  searchEngines: any[]
}

export interface BackupMetadata {
  lastBackup: string
  backupCount: number
  autoBackupEnabled: boolean
  lastAutoBackup: string
}

const BACKUP_KEY = 'easywebtab-backups'
const METADATA_KEY = 'easywebtab-backup-metadata'
const MAX_BACKUPS = 10

// 延迟备份防抖（5秒内多次修改只备份一次）
let backupTimeout: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_DELAY = 5000

/**
 * 获取所有备份
 */
export function getBackups(): BackupData[] {
  try {
    const data = localStorage.getItem(BACKUP_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * 保存备份元数据
 */
function saveMetadata(metadata: Partial<BackupMetadata>) {
  const current = getMetadata()
  const updated = { ...current, ...metadata }
  localStorage.setItem(METADATA_KEY, JSON.stringify(updated))
}

/**
 * 获取备份元数据
 */
export function getMetadata(): BackupMetadata {
  try {
    const data = localStorage.getItem(METADATA_KEY)
    return data ? JSON.parse(data) : {
      lastBackup: '',
      backupCount: 0,
      autoBackupEnabled: true,
      lastAutoBackup: ''
    }
  } catch {
    return {
      lastBackup: '',
      backupCount: 0,
      autoBackupEnabled: true,
      lastAutoBackup: ''
    }
  }
}

/**
 * 创建新备份
 */
export function createBackup(
  sites: any[],
  categories: any[],
  searchEngines: any[]
): BackupData {
  const backup: BackupData = {
    timestamp: new Date().toISOString(),
    sites: [...sites],
    categories: [...categories],
    searchEngines: [...searchEngines]
  }

  // 获取现有备份
  const backups = getBackups()

  // 添加新备份到开头
  backups.unshift(backup)

  // 保留最近10个
  const trimmed = backups.slice(0, MAX_BACKUPS)

  // 保存
  localStorage.setItem(BACKUP_KEY, JSON.stringify(trimmed))

  // 更新元数据
  saveMetadata({
    lastBackup: backup.timestamp,
    backupCount: trimmed.length,
    lastAutoBackup: backup.timestamp
  })

  return backup
}

/**
 * 定时自动备份（防抖）
 * 在数据变化后5秒自动创建备份
 */
export function scheduleAutoBackup(
  sites: any[],
  categories: any[],
  searchEngines: any[]
) {
  const metadata = getMetadata()
  if (!metadata.autoBackupEnabled) return

  // 清除之前的定时器
  if (backupTimeout) {
    clearTimeout(backupTimeout)
  }

  // 5秒后创建备份
  backupTimeout = setTimeout(() => {
    createBackup(sites, categories, searchEngines)
    console.log('[Backup] Auto backup created')
  }, DEBOUNCE_DELAY)
}

/**
 * 立即执行备份（取消防抖）
 */
export function triggerImmediateBackup(
  sites: any[],
  categories: any[],
  searchEngines: any[]
) {
  if (backupTimeout) {
    clearTimeout(backupTimeout)
    backupTimeout = null
  }
  return createBackup(sites, categories, searchEngines)
}

/**
 * 从备份恢复数据
 */
export function restoreFromBackup(backup: BackupData): {
  sites: any[]
  categories: any[]
  searchEngines: any[]
} {
  return {
    sites: [...backup.sites],
    categories: [...backup.categories],
    searchEngines: [...backup.searchEngines]
  }
}

/**
 * 删除指定备份
 */
export function deleteBackup(timestamp: string) {
  const backups = getBackups()
  const filtered = backups.filter(b => b.timestamp !== timestamp)
  localStorage.setItem(BACKUP_KEY, JSON.stringify(filtered))
  saveMetadata({ backupCount: filtered.length })
}

/**
 * 清空所有备份
 */
export function clearAllBackups() {
  localStorage.removeItem(BACKUP_KEY)
  saveMetadata({ lastBackup: '', backupCount: 0, lastAutoBackup: '' })
}

/**
 * 导出为 Markdown 文件
 */
export function exportToMarkdownFile(
  sites: any[],
  categories: any[],
  searchEngines: any[]
) {
  // 生成 Markdown 格式
  const sitesList = sites.map(site => {
    return `  - name: ${site.name}
    url: ${site.url}
    description: ${site.description || ''}
    category: ${site.category}
    tags: [${site.tags?.join(', ') || ''}]
    icon: ${site.icon || ''}
    sort: ${site.sort || 0}
    createdAt: ${site.createdAt || ''}`
  }).join('\n\n')

  // 分类
  const categoriesSection = categories.length > 0
    ? `categories:\n${categories.map((c: any) => `  - id: ${c.id}\n    name: ${c.name}\n    icon: ${c.icon}\n    sort: ${c.sort || 0}`).join('\n\n')}\n\n`
    : ''

  // 搜索引擎
  const enginesSection = searchEngines.length > 0
    ? `searchEngines:\n${searchEngines.map((e: any) => `  - id: ${e.id}\n    name: ${e.name}\n    url: ${e.url}\n    isDefault: ${e.isDefault}\n    sort: ${e.sort}`).join('\n\n')}\n\n`
    : ''

  const markdown = `---
${categoriesSection}${enginesSection}sites:
${sitesList}
---

# 我的书签

个人网站导航 - 备份于 ${new Date().toLocaleString('zh-CN')}
`

  // 下载文件
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  
  // 文件名包含日期
  const date = new Date().toISOString().slice(0, 10)
  a.download = `easywebtab-backup-${date}.md`
  
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 切换自动备份
 */
export function setAutoBackup(enabled: boolean) {
  saveMetadata({ autoBackupEnabled: enabled })
}

/**
 * 导入 Markdown 文件
 */
export function importFromMarkdownFile(markdownText: string): {
  sites: any[]
  categories: any[]
  searchEngines: any[]
} | null {
  try {
    // 简单解析 YAML frontmatter
    const match = markdownText.match(/^---\n([\s\S]*?)\n---\n/)
    if (!match) {
      return null
    }

    const frontmatter = match[1]
    const result = {
      sites: [] as any[],
      categories: [] as any[],
      searchEngines: [] as any[]
    }

    // 解析 sites
    const sitesMatch = frontmatter.match(/sites:\n([\s\S]*?)$/m)
    if (sitesMatch) {
      // 简单解析（实际项目应该用专门的 YAML 解析库）
      const siteBlocks = sitesMatch[1].match(/- name: (.+)/g)
      if (siteBlocks) {
        for (const block of siteBlocks) {
          const name = block.replace('- name: ', '').trim()
          result.sites.push({
            name,
            url: '',
            category: '',
            tags: [],
            sort: 0
          })
        }
      }
    }

    // 解析 categories
    if (frontmatter.includes('categories:')) {
      const catMatch = frontmatter.match(/categories:\n([\s\S]*?)(searchEngines:|$)/m)
      if (catMatch) {
        const catBlocks = catMatch[1].match(/- id: (.+)/g)
        if (catBlocks) {
          for (const block of catBlocks) {
            const id = block.replace('- id: ', '').trim()
            result.categories.push({ id, name: id, icon: '📁', sort: 0 })
          }
        }
      }
    }

    // 解析 searchEngines
    if (frontmatter.includes('searchEngines:')) {
      const engMatch = frontmatter.match(/searchEngines:\n([\s\S]*?)$/m)
      if (engMatch) {
        const engBlocks = engMatch[1].match(/- id: (.+)/g)
        if (engBlocks) {
          for (const block of engBlocks) {
            const id = block.replace('- id: ', '').trim()
            result.searchEngines.push({ id, name: id, url: '', isDefault: false, sort: 0 })
          }
        }
      }
    }

    return result
  } catch {
    return null
  }
}
