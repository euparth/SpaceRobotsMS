/**
 * Phase 2 — prior sensitivity: rule statistics, closed-form physics-limited count, PINN agreement.
 * Usage: node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/research/phase2_priors.mjs
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { IX, IY, IZ } from '../../src/physics/rigidBody.js'
import { WZ_LIMIT } from '../surrogate/physicsLib.mjs'
import { PRIORS } from '../surrogate/priors.mjs'
import { closedFormMaxWz } from './closedForm.mjs'
import { runSurrogateInference } from '../../src/surrogate/inference.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const base = join(__dirname, '../surrogate/data/priors')
const pct = (a, b) => (b ? (100 * a) / b : NaN)

console.log('label: fireNowSecure (torque-free RK4, flight 0.3 s, window 0.25 s). rule: |wz0| <= 3. PINN: runSurrogateInference().fireNowSecure (committed weights.json)')
console.log('prior | n | rule SECURE | false-secure | %rule-SECURE | false-eject | physics-limited (rule SECURE & closed-form max>3) | physics SECURE | PINN==label | PINN==rule | PINN false-secure | PINN false-eject | mean|w| | min|w| | max|w|')
for (const prior of PRIORS) {
  const rows = JSON.parse(readFileSync(join(base, prior, 'capture.json'), 'utf8'))
  let ruleSecure = 0
  let fs = 0
  let fe = 0
  let pl = 0
  let physSecure = 0
  let pinnLabel = 0
  let pinnRule = 0
  let pinnFs = 0
  let pinnFe = 0
  let sumMag = 0
  let minMag = Infinity
  let maxMag = 0
  for (const r of rows) {
    const rs = Math.abs(r.wz) <= WZ_LIMIT
    const cf = closedFormMaxWz(IX, IY, IZ, r.wx, r.wy, r.wz).max
    const mag = Math.hypot(r.wx, r.wy, r.wz)
    sumMag += mag
    minMag = Math.min(minMag, mag)
    maxMag = Math.max(maxMag, mag)
    if (rs) ruleSecure++
    if (r.fireNowSecure) physSecure++
    if (rs && !r.fireNowSecure) fs++
    if (!rs && r.fireNowSecure) fe++
    if (rs && cf > WZ_LIMIT) pl++
    const p = runSurrogateInference(r.wx, r.wy, r.wz, { includeTrace: false }).fireNowSecure
    if (p === r.fireNowSecure) pinnLabel++
    if (p === rs) pinnRule++
    if (p && !r.fireNowSecure) pinnFs++
    if (!p && r.fireNowSecure) pinnFe++
  }
  const n = rows.length
  console.log(
    [
      prior,
      n,
      ruleSecure,
      fs,
      pct(fs, ruleSecure).toFixed(4),
      fe,
      pl,
      physSecure,
      `${pinnLabel} (${pct(pinnLabel, n).toFixed(4)}%)`,
      `${pinnRule} (${pct(pinnRule, n).toFixed(4)}%)`,
      pinnFs,
      pinnFe,
      (sumMag / n).toFixed(6),
      minMag.toFixed(6),
      maxMag.toFixed(6),
    ].join(' | '),
  )
}
