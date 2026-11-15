// Prints gzip size of the JS needed to load `/` (client entry + index route, static imports only).
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

// Post-split measurement was 216,492 B gzip; budget adds ~15% headroom.
const BUDGET_GZIP = 250_000
const dir = '.output/public'
const manifest = JSON.parse(readFileSync(`${dir}/.vite/manifest.json`, 'utf8'))
const ENTRY = Object.keys(manifest).find((k) => manifest[k].isEntry)
const ROUTE = 'src/routes/index.tsx?tsr-split=component'

export function initialChunks() {
  const seen = new Set()
  const visit = (key) => {
    if (seen.has(key) || !manifest[key]) return
    seen.add(key)
    for (const i of manifest[key].imports ?? []) visit(i)
  }
  visit(ENTRY)
  visit(ROUTE)
  return [...seen].map((k) => manifest[k].file).filter((f) => f.endsWith('.js'))
}

export function measure() {
  const rows = initialChunks().map((f) => {
    const buf = readFileSync(`${dir}/${f}`)
    return { file: f, raw: buf.length, gzip: gzipSync(buf).length }
  })
  return {
    rows,
    raw: rows.reduce((n, r) => n + r.raw, 0),
    gzip: rows.reduce((n, r) => n + r.gzip, 0),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, raw, gzip } = measure()
  for (const r of rows.sort((a, b) => b.gzip - a.gzip).slice(0, 10))
    console.log(`${(r.gzip / 1024).toFixed(1).padStart(7)} kB gz  ${r.file}`)
  console.log(
    `initial JS: ${(raw / 1024).toFixed(1)} kB raw, ${(gzip / 1024).toFixed(1)} kB gzip (${rows.length} files)`,
  )
  console.log(`budget: ${BUDGET_GZIP} B gzip`)
  if (gzip > BUDGET_GZIP) {
    console.error(`initial JS ${gzip} B exceeds budget ${BUDGET_GZIP} B`)
    process.exit(1)
  }
}
