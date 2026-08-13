import MarkdownIt from 'markdown-it'

let md: MarkdownIt | null = null

function getMd(): MarkdownIt {
  if (md) return md
  md = new MarkdownIt({ html: false, linkify: true, breaks: true })
  const defaultOpen =
    md.renderer.rules.link_open ??
    ((tokens: any[], idx: number, options: any, _env: any, self: any) =>
      self.renderToken(tokens, idx, options))
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const hrefIndex = tokens[idx].attrIndex('href')
    if (hrefIndex >= 0) {
      tokens[idx].attrSet('href', md!.normalizeLink(tokens[idx].attrs![hrefIndex][1]))
      if (!md!.validateLink(tokens[idx].attrs![hrefIndex][1])) return ''
    }
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener nofollow')
    return defaultOpen(tokens, idx, options, env, self)
  }
  return md
}

export function renderMarkdown(content: string): string {
  if (!content) return ''
  return getMd().render(String(content))
}
