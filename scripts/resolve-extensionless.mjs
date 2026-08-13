// Node ESM resolution hook — makes Vite-style extensionless relative imports
// ('../types', './healthCore') resolve under `node --experimental-strip-types`.
// Needed because useIdb.ts (and the pure core modules it imports) follow the
// project's Vite convention of omitting extensions; plain node ESM would throw
// ERR_MODULE_NOT_FOUND / ERR_UNSUPPORTED_DIR_IMPORT.
export async function resolve(specifier, context, nextResolve) {
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) {
    return nextResolve(specifier, context)
  }
  // Bare-relative with an extension already present -> let node handle it
  if (/\.(?:ts|mjs|cjs|js|json)$/i.test(specifier)) {
    return nextResolve(specifier, context)
  }
  // Extensionless relative -> try as-is, then +'.ts', then +'/index.ts'
  const candidates = [specifier, `${specifier}.ts`, `${specifier}/index.ts`]
  for (const candidate of candidates) {
    try {
      return await nextResolve(candidate, context)
    } catch (err) {
      const code = err?.code
      if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'ERR_UNSUPPORTED_DIR_IMPORT') throw err
    }
  }
  return nextResolve(specifier, context)
}
