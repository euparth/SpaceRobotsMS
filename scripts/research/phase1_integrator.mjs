/**
 * Phase 1 — integrator verification (rigid body only, no net).
 * Usage: node scripts/research/phase1_integrator.mjs
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { IX, IY, IZ, rk4Step, kineticEnergy, polhodeEnvelope } from '../../src/physics/rigidBody.js'
import { H, FLIGHT_TIME, CONTACT_WINDOW, WZ_LIMIT, mulberry32, peakWzInContactWindow, y0 } from '../surrogate/physicsLib.mjs'
import { closedFormMaxWz } from './closedForm.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rows = JSON.parse(readFileSync(join(__dirname, '../surrogate/data/capture.json'), 'utf8'))

function pickSpins(n, seed) {
  const rng = mulberry32(seed)
  const picked = new Set()
  while (picked.size < n) picked.add(Math.floor(rng() * rows.length))
  return [...picked].map((i) => ({ i, w: [rows[i].wx, rows[i].wy, rows[i].wz] }))
}
const hMag = (y) => Math.hypot(IX * y[0], IY * y[1], IZ * y[2])
const median = (a) => {
  const s = [...a].sort((p, q) => p - q)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

console.log(`IX=${IX} IY=${IY} IZ=${IZ} H=${H} FLIGHT=${FLIGHT_TIME} WINDOW=${CONTACT_WINDOW} WZ_LIMIT=${WZ_LIMIT}`)
const spins = pickSpins(50, 20261103)
console.log('spins: 50 rows of capture.json, mulberry32 seed 20261103, indices', JSON.stringify(spins.map((s) => s.i)))

// ---- 1a: 10 s drift at production H
console.log('=== 1a drift over 10 s at H ===')
const steps10 = Math.round(10 / H)
const dH = []
const dT = []
let maxDH = 0
let maxDT = 0
for (const s of spins) {
  const y = y0(...s.w)
  const H0 = hMag(y)
  const T0 = kineticEnergy(...s.w)
  let worstH = 0
  let worstT = 0
  for (let k = 0; k < steps10; k++) {
    rk4Step(y, H, 0)
    worstH = Math.max(worstH, Math.abs(hMag(y) - H0) / H0)
    worstT = Math.max(worstT, Math.abs(kineticEnergy(y[0], y[1], y[2]) - T0) / T0)
  }
  dH.push(worstH)
  dT.push(worstT)
  maxDH = Math.max(maxDH, worstH)
  maxDT = Math.max(maxDT, worstT)
}
console.log('steps_per_run', steps10)
console.log('rel_drift_|H| max', maxDH, 'median', median(dH))
console.log('rel_drift_T   max', maxDT, 'median', median(dT))
console.log('drift = max over all steps of |X(t)-X(0)|/X(0), then max/median across the 50 runs')

// ---- 1b: convergence
console.log('=== 1b convergence vs H/8 at t=0.3 and t=0.55 ===')
const tA = FLIGHT_TIME
const tB = FLIGHT_TIME + CONTACT_WINDOW
function integrateTo(w, h, times) {
  const y = y0(...w)
  const out = []
  let t = 0
  for (const target of times) {
    const n = Math.round((target - t) / h)
    for (let k = 0; k < n; k++) rk4Step(y, h, 0)
    t += n * h
    out.push([y[0], y[1], y[2]])
  }
  return out
}
const levels = [1, 2, 4, 8]
const ref = spins.map((s) => integrateTo(s.w, H / 8, [tA, tB]))
const errs = {}
for (const L of levels.slice(0, 3)) {
  let eA = 0
  let eB = 0
  spins.forEach((s, k) => {
    const r = integrateTo(s.w, H / L, [tA, tB])
    eA = Math.max(eA, Math.hypot(r[0][0] - ref[k][0][0], r[0][1] - ref[k][0][1], r[0][2] - ref[k][0][2]))
    eB = Math.max(eB, Math.hypot(r[1][0] - ref[k][1][0], r[1][1] - ref[k][1][1], r[1][2] - ref[k][1][2]))
  })
  errs[L] = { eA, eB }
  console.log(`h=H/${L} (${H / L}) max|Δω| t=0.30: ${eA}  t=0.55: ${eB}`)
}
const ordA1 = Math.log2(errs[1].eA / errs[2].eA)
const ordA2 = Math.log2(errs[2].eA / errs[4].eA)
const ordB1 = Math.log2(errs[1].eB / errs[2].eB)
const ordB2 = Math.log2(errs[2].eB / errs[4].eB)
console.log(`observed order log2(e_H/e_H/2): t=0.30 ${ordA1}  t=0.55 ${ordB1}`)
console.log(`observed order log2(e_H/2/e_H/4): t=0.30 ${ordA2}  t=0.55 ${ordB2}`)
console.log('note: errors near 1e-13 are at double-precision round-off; order is not observable there')
console.log('--- supplementary coarse sweep (same 50 spins, same H/8 reference); multiples chosen so 0.30 s = 900H and 0.55 s = 1650H are integer step counts ---')
let prev = null
for (const M of [15, 30, 75, 150]) {
  const h = H * M
  if (Math.abs(tA / h - Math.round(tA / h)) > 1e-9 || Math.abs(tB / h - Math.round(tB / h)) > 1e-9) throw new Error(`non-integer step count for M=${M}`)
  let eA = 0
  let eB = 0
  spins.forEach((s, k) => {
    const r = integrateTo(s.w, h, [tA, tB])
    eA = Math.max(eA, Math.hypot(r[0][0] - ref[k][0][0], r[0][1] - ref[k][0][1], r[0][2] - ref[k][0][2]))
    eB = Math.max(eB, Math.hypot(r[1][0] - ref[k][1][0], r[1][1] - ref[k][1][1], r[1][2] - ref[k][1][2]))
  })
  const ord = prev
    ? ` order_vs_prev=log(e/e_prev)/log(h/h_prev) t=0.30 ${Math.log(eA / prev.eA) / Math.log(M / prev.M)} t=0.55 ${Math.log(eB / prev.eB) / Math.log(M / prev.M)}`
    : ''
  console.log(`h=${M}H (${h}) max|Δω| t=0.30: ${eA}  t=0.55: ${eB}${ord}`)
  prev = { eA, eB, M }
}

// ---- 1c: closed-form bound on all 1200 rows
console.log('=== 1c closed-form infinite-horizon max |wz| vs 0.25 s window peak (1200 rows) ===')
const LONG_T = 20
const longSteps = Math.round(LONG_T / H)
let physicsLimited = 0
let windowLimited = 0
let ruleSecure = 0
let cfAbove = 0
let maxOver = 0 // numeric window peak exceeding bound (should be ~0)
let maxEnvelopeDiff = 0
let maxShortfall = 0
let shortfallRows = []
let maxLongOver = 0
const t0 = performance.now()
const perRow = []
for (const r of rows) {
  const w = [r.wx, r.wy, r.wz]
  const cf = closedFormMaxWz(IX, IY, IZ, ...w).max
  const env = polhodeEnvelope(...w).peak
  maxEnvelopeDiff = Math.max(maxEnvelopeDiff, Math.abs(cf - env))
  const winPeak = peakWzInContactWindow(...w, 0)
  if (winPeak !== r.peak0) throw new Error(`label path mismatch row ${r.i}`)
  const rs = Math.abs(r.wz) <= WZ_LIMIT
  if (rs) ruleSecure++
  if (cf > WZ_LIMIT) cfAbove++
  if (rs && cf > WZ_LIMIT) physicsLimited++
  if (cf > WZ_LIMIT && winPeak <= WZ_LIMIT) windowLimited++
  maxOver = Math.max(maxOver, winPeak - cf)
  // long-horizon numeric peak
  const y = y0(...w)
  let longPeak = Math.abs(y[2])
  let tPeak = 0
  for (let k = 0; k < longSteps; k++) {
    rk4Step(y, H, 0)
    const a = Math.abs(y[2])
    if (a > longPeak) {
      longPeak = a
      tPeak = (k + 1) * H
    }
  }
  const shortfall = cf - longPeak
  maxLongOver = Math.max(maxLongOver, longPeak - cf)
  if (shortfall > maxShortfall) maxShortfall = shortfall
  if (shortfall > 1e-3) shortfallRows.push({ i: r.i, w, cf, longPeak, tPeak, shortfall })
  perRow.push({ i: r.i, winPeak, cf, longPeak, tPeak })
}
console.log('wall_s', (performance.now() - t0) / 1000)
console.log('rule_secure', ruleSecure, 'closed_form_max_gt_3', cfAbove)
console.log('physics_limited (rule SECURE & closed-form max > 3)', physicsLimited)
console.log('window_limited (closed-form max > 3 & window peak <= 3)', windowLimited)
console.log('max(window peak - closed-form bound)', maxOver, '(positive = numeric exceeds bound)')
console.log('max|closedFormMaxWz - rigidBody.polhodeEnvelope.peak|', maxEnvelopeDiff)
console.log(`long-horizon numeric peak over ${LONG_T} s at H: max(longPeak - bound)`, maxLongOver)
console.log(`max(bound - longPeak) over ${LONG_T} s`, maxShortfall, 'rows with shortfall > 1e-3:', shortfallRows.length)
for (const s of shortfallRows) console.log('  shortfall', JSON.stringify(s))
const sortedShort = perRow.map((p) => p.cf - p.longPeak).sort((a, b) => a - b)
console.log('bound - longPeak percentiles: p50', median(sortedShort), 'p90', sortedShort[Math.floor(0.9 * sortedShort.length)], 'p99', sortedShort[Math.floor(0.99 * sortedShort.length)], 'max', sortedShort[sortedShort.length - 1])
console.log('tPeak percentiles (s): p50', median(perRow.map((p) => p.tPeak)), 'max', Math.max(...perRow.map((p) => p.tPeak)))
