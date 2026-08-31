// Node ESM resolution hook — makes Vite-style extensionless relative imports
// ('../types', './healthCore') AND '@/alias' imports resolve under
// `node --experimental-strip-types`. Needed because pure core modules follow
// the project's Vite convention of omitting extensions and using the '@/'
// alias (mapped in vite.config.js -> /src). Plain node ESM would throw
// ERR_MODULE_NOT_FOUND / ERR_UNSUPPORTED_DIR_IMPORT.
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '..')
const SRC_DIR = path.join(PROJECT_ROOT, 'src')

const EXT_RE = /\.(?:ts|mjs|cjs|js|json)$/i
function hasExt(s) { return EXT_RE.test(s) }

async function tryResolve(specifier, context, nextResolve) {
  if (hasExt(specifier)) {
    return await nextResolve(specifier, context)
  }
  const candidates = [specifier, `${specifier}.ts`, `${specifier}/index.ts`]
  let lastErr = null
  for (const candidate of candidates) {
    try {
      return await nextResolve(candidate, context)
    } catch (err) {
      const code = err?.code
      if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'ERR_UNSUPPORTED_DIR_IMPORT') throw err
      lastErr = err
    }
  }
  throw lastErr ?? new Error(`Cannot resolve ${specifier}`)
}

export async function resolve(specifier, context, nextResolve) {
  if (typeof specifier !== 'string') {
    return nextResolve(specifier, context)
  }
  // '@/alias' -> translate to absolute file:// under src/
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2)
    const absPath = path.join(SRC_DIR, rel)
    const fileUrl = pathToFileURL(absPath).href
    try {
      return await tryResolve(fileUrl, context, nextResolve)
    } catch (_err) {
      return nextResolve(specifier, context)
    }
  }
  if (specifier === '@') {
    return nextResolve(specifier, context)
  }
  // Relative import -> extensionless candidate probing
  if (specifier.startsWith('.')) {
    if (hasExt(specifier)) {
      return nextResolve(specifier, context)
    }
    try {
      return await tryResolve(specifier, context, nextResolve)
    } catch (_err) {
      return nextResolve(specifier, context)
    }
  }
  return nextResolve(specifier, context)
}
