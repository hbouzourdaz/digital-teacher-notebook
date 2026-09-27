export interface ParsedRoute {
  path: string
  segments: string[]
  query: Record<string, string>
  id: number | null
}

/** يفكّ مساراً مثل /students/12?tab=grades إلى مكوّناته */
export function parseRoute(full: string): ParsedRoute {
  const [rawPath, rawQuery = ''] = full.split('?')
  const path = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath || '/'
  const segments = path.split('/').filter(Boolean)
  const query: Record<string, string> = {}
  for (const pair of rawQuery.split('&')) {
    if (!pair) continue
    const [key, value = ''] = pair.split('=')
    if (key) query[decodeURIComponent(key)] = decodeURIComponent(value)
  }
  const numeric = segments.find((segment) => /^\d+$/.test(segment))
  return { path, segments, query, id: numeric ? Number(numeric) : null }
}
