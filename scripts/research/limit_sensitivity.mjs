/**
 * Sensitivity of the default-dataset counts to the z-spin limit. Only the limit changes: the label
 * is the committed contact-window peak (capture.json peak0), so no dataset is regenerated.
 * Usage: node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/research/limit_sensitivity.mjs
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { IX, IY, IZ } from '../../src/physics/rigidBody.js'
import { WZ_LIMIT } from '../surrogate/physicsLib.mjs'
import { closedFormMaxWz } from './closedForm.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rows = JSON.parse(readFileSync(join(__dirname, '../surrogate/data/capture.json'), 'utf8'))
const LIMITS = [1, 2, 3, 4]

function countsAt(limit) {
  const c = { limit, labelSecure: 0, ruleSecure: 0, ruleFalseSecure: 0, ruleFalseEject: 0, envSecure: 0, envFalseSecure: 0, envFalseEject: 0 }
  for (const r of rows) {
    const label = r.peak0 <= limit
    const rule = Math.abs(r.wz) <= limit
    const env = closedFormMaxWz(IX, IY, IZ, r.wx, r.wy, r.wz).max <= limit
    if (label) c.labelSecure++
    if (rule) c.ruleSecure++
    if (rule && !label) c.ruleFalseSecure++
    if (!rule && label) c.ruleFalseEject++
    if (env) c.envSecure++
    if (env && !label) c.envFalseSecure++
    if (!env && label) c.envFalseEject++
  }
  return c
}

// Guard: at the production limit the committed flag and the published counts must reproduce.
if (WZ_LIMIT !== 3) throw new Error(`expected WZ_LIMIT 3, got ${WZ_LIMIT}`)
const flagMismatch = rows.filter((r) => (r.peak0 <= WZ_LIMIT) !== r.fireNowSecure).length
const base = countsAt(WZ_LIMIT)
const expected = { ruleSecure: 731, ruleFalseSecure: 245, ruleFalseEject: 4, envFalseSecure: 0, envFalseEject: 99 }
for (const [k, v] of Object.entries(expected)) {
  if (base[k] !== v) throw new Error(`3.0 row does not reproduce: ${k} = ${base[k]}, expected ${v}`)
}
if (flagMismatch) throw new Error(`peak0 disagrees with fireNowSecure on ${flagMismatch} rows`)

console.log(`dataset: scripts/surrogate/data/capture.json, n = ${rows.length}; label: peak0 <= limit; 3.0 row and fireNowSecure reproduced`)
console.log('limit | label secure | rule secure | rule false-secure | % of rule-secure | rule false-eject | envelope secure | envelope false-secure | envelope false-eject')
for (const L of LIMITS) {
  const c = countsAt(L)
  const pct = c.ruleSecure ? ((100 * c.ruleFalseSecure) / c.ruleSecure).toFixed(4) : 'n/a'
  console.log([L.toFixed(1), c.labelSecure, c.ruleSecure, c.ruleFalseSecure, pct, c.ruleFalseEject, c.envSecure, c.envFalseSecure, c.envFalseEject].join(' | '))
}
