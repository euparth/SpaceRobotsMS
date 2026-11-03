/**
 * Task C: static |wz(0)| <= WZ_LIMIT rule vs physics labels on scripts/surrogate/data/capture.json.
 * Usage: node scripts/validation/misclass.mjs
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { WZ_LIMIT, coupledImpact } from '../surrogate/physicsLib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rows = JSON.parse(readFileSync(join(__dirname, '../surrogate/data/capture.json'), 'utf8'))
const N = rows.length

let ruleSecure = 0
let falseSecure = 0
let falseEject = 0
let ruleFieldMismatch = 0
const fsMag = []
for (const r of rows) {
  const rs = Math.abs(r.wz) <= WZ_LIMIT
  if (rs !== !r.naiveEject) ruleFieldMismatch++
  if (rs) ruleSecure++
  if (rs && !r.fireNowSecure) {
    falseSecure++
    fsMag.push(Math.hypot(r.wx, r.wy, r.wz))
  }
  if (!rs && r.fireNowSecure) falseEject++
}
const pct = (a, b) => (b ? (100 * a) / b : NaN)

console.log('rows', N)
console.log('label used: fireNowSecure = peakWzInContactWindow(wx,wy,wz,0) <= WZ_LIMIT (torque-free RK4, flight 0.3 s + window 0.25 s, no net)')
console.log('rule: |wz(0)| <= WZ_LIMIT => SECURE; WZ_LIMIT =', WZ_LIMIT)
console.log('rule vs stored naiveEject field mismatches', ruleFieldMismatch)
console.log('rule_secure', ruleSecure, 'rule_eject', N - ruleSecure)
console.log('physics_secure', rows.filter((r) => r.fireNowSecure).length, 'physics_eject', rows.filter((r) => !r.fireNowSecure).length)
console.log('false_secure', falseSecure, 'pct_of_all', pct(falseSecure, N), 'pct_of_rule_secure', pct(falseSecure, ruleSecure))
console.log('false_eject', falseEject, 'pct_of_all', pct(falseEject, N), 'pct_of_rule_secure', pct(falseEject, ruleSecure), 'pct_of_rule_eject', pct(falseEject, N - ruleSecure))
console.log('total_disagreements', falseSecure + falseEject, 'pct_of_all', pct(falseSecure + falseEject, N))
console.log('reproduces_249', falseSecure + falseEject === 249)

const BIN = 0.5
const nBins = Math.ceil(Math.sqrt(3) * 5 / BIN)
const hist = new Array(nBins).fill(0)
for (const m of fsMag) hist[Math.min(nBins - 1, Math.floor(m / BIN))]++
console.log(`false_secure |omega(0)| histogram (bin ${BIN} rad/s), n=${fsMag.length}`)
console.log(`  min ${Math.min(...fsMag)} max ${Math.max(...fsMag)}`)
for (let i = 0; i < nBins; i++) {
  if (hist[i] === 0 && (i * BIN > Math.max(...fsMag) || (i + 1) * BIN < Math.min(...fsMag))) continue
  console.log(`  [${(i * BIN).toFixed(1)}, ${((i + 1) * BIN).toFixed(1)}) ${String(hist[i]).padStart(4)} ${'#'.repeat(hist[i])}`)
}

console.log('--- secondary: same rule vs coupled rollout verdict (coupledImpact eject) on all rows ---')
const t0 = performance.now()
let cRuleSecure = 0
let cFalseSecure = 0
let cFalseEject = 0
let labelAgree = 0
for (const r of rows) {
  const c = coupledImpact(r.wx, r.wy, r.wz)
  const physSecure = !c.eject
  const rs = Math.abs(r.wz) <= WZ_LIMIT
  if (rs) cRuleSecure++
  if (rs && !physSecure) cFalseSecure++
  if (!rs && physSecure) cFalseEject++
  if (physSecure === r.fireNowSecure) labelAgree++
}
console.log('coupled_rollouts', N, 'wall_s', (performance.now() - t0) / 1000)
console.log('coupled false_secure', cFalseSecure, 'pct_of_all', pct(cFalseSecure, N), 'pct_of_rule_secure', pct(cFalseSecure, cRuleSecure))
console.log('coupled false_eject', cFalseEject, 'pct_of_all', pct(cFalseEject, N), 'pct_of_rule_secure', pct(cFalseEject, cRuleSecure), 'pct_of_rule_eject', pct(cFalseEject, N - cRuleSecure))
console.log('coupled total_disagreements', cFalseSecure + cFalseEject)
console.log('coupled verdict == dataset fireNowSecure label', labelAgree, 'of', N)
