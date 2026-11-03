/**
 * In-browser Monte Carlo over spin priors. One row per sampled ω0 with the four verdicts the
 * Verdicts panel shows, computed on exactly the dataset label path:
 *
 *   label    = peakWzInContactWindow(ω0, delay 0) ≤ 3.0        (genData.mjs `fireNowSecure`)
 *   rule     = |ωz0| ≤ 3.0                                       (genData.mjs `!naiveEject`)
 *   envelope = closed-form max |ωz| on the polhode ≤ 3.0         (research phase 2 "physics-limited")
 *   pinn     = runSurrogateInference(ω0).fireNowSecure           (committed weights, nothing tuned)
 *
 * Sampling: mulberry32(seed) → samplePrior(rng, prior), with the dataset's fixed 8-way chunk split
 * (src/physics/priors.js planChunks) so that uniform-box / N=1200 / seed 777001 reproduces the rows
 * of scripts/surrogate/data/capture.json in order.
 */
import { CUBESAT } from './constants.js'
import { feasibleBranch } from './envelope.js'
import { peakWzInContactWindow, WZ_LIMIT } from './captureLabel.js'
import { mulberry32, samplePrior } from './priors.js'
import { runSurrogateInference } from '../surrogate/inference.js'

const I = CUBESAT.inertia

export function monteCarloRow(i, wx, wy, wz, limit = WZ_LIMIT) {
  const peak0 = peakWzInContactWindow(wx, wy, wz, 0)
  const env = feasibleBranch(I, [wx, wy, wz])
  const pinn = runSurrogateInference(wx, wy, wz, { includeTrace: false })
  return {
    i,
    wx,
    wy,
    wz,
    mag: Math.hypot(wx, wy, wz),
    peak0,
    envelopeMax: env.max,
    branch: env.branch,
    pinnPeak: pinn.peakWzPred,
    label: peak0 <= limit,
    rule: Math.abs(wz) <= limit,
    envelope: env.max <= limit,
    pinn: pinn.fireNowSecure,
  }
}

/** Rows for one chunk: identical loop to the `capture` branch of genData.mjs (sampling order). */
export function monteCarloChunk({ seed, count, offset, prior, limit = WZ_LIMIT, onRow = null }) {
  const rng = mulberry32(seed)
  const rows = new Array(count)
  for (let k = 0; k < count; k++) {
    const [wx, wy, wz] = samplePrior(rng, prior)
    rows[k] = monteCarloRow(offset + k, wx, wy, wz, limit)
    if (onRow) onRow(rows[k])
  }
  return rows
}

/** 2×2 confusion of a predictor (true = SECURE) against the solver label. */
export function confusion(rows, key) {
  const c = { secureSecure: 0, falseSecure: 0, falseEject: 0, ejectEject: 0 }
  for (const r of rows) {
    const p = r[key]
    if (p && r.label) c.secureSecure++
    else if (p && !r.label) c.falseSecure++
    else if (!p && r.label) c.falseEject++
    else c.ejectEject++
  }
  c.n = rows.length
  c.agree = c.secureSecure + c.ejectEject
  c.predictedSecure = c.secureSecure + c.falseSecure
  return c
}

export const HISTOGRAM_BIN = 0.5

/** |ω0| histogram (bin 0.5 rad/s, as in validation_2026-11 §…) of rows where predictor is SECURE but the label is EJECT. */
export function falseSecureHistogram(rows, key, bin = HISTOGRAM_BIN) {
  const sel = rows.filter((r) => r[key] && !r.label)
  if (sel.length === 0) return { bins: [], count: 0, min: null, max: null }
  let min = Infinity
  let max = -Infinity
  for (const r of sel) {
    if (r.mag < min) min = r.mag
    if (r.mag > max) max = r.mag
  }
  const first = Math.floor(min / bin)
  const last = Math.floor(max / bin)
  const bins = []
  for (let b = first; b <= last; b++) bins.push({ lo: b * bin, hi: (b + 1) * bin, count: 0 })
  for (const r of sel) bins[Math.floor(r.mag / bin) - first].count++
  return { bins, count: sel.length, min, max }
}

export function summarize(rows) {
  const labelSecure = rows.reduce((n, r) => n + (r.label ? 1 : 0), 0)
  return {
    n: rows.length,
    labelSecure,
    rule: confusion(rows, 'rule'),
    envelope: confusion(rows, 'envelope'),
    pinn: confusion(rows, 'pinn'),
    // research_2026-11 §2c: rule SECURE and closed-form max > 3 → no fire delay can help
    physicsLimited: rows.reduce((n, r) => n + (r.rule && !r.envelope ? 1 : 0), 0),
    // research_2026-11 §1c: closed-form max > 3 but the 0.25 s window peak ≤ 3 → would eject with a later arrival
    windowLimited: rows.reduce((n, r) => n + (!r.envelope && r.label ? 1 : 0), 0),
    histogram: {
      rule: falseSecureHistogram(rows, 'rule'),
      envelope: falseSecureHistogram(rows, 'envelope'),
      pinn: falseSecureHistogram(rows, 'pinn'),
    },
  }
}

export const CSV_COLUMNS = ['i', 'wx', 'wy', 'wz', 'mag', 'peak0', 'envelopeMax', 'branch', 'pinnPeak', 'label', 'rule', 'envelope', 'pinn']

export function rowsToCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')]
  for (const r of rows) {
    lines.push(
      CSV_COLUMNS.map((k) => {
        const v = r[k]
        if (typeof v === 'boolean') return v ? 'SECURE' : 'EJECT'
        if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(17)
        return v == null ? '' : String(v)
      }).join(','),
    )
  }
  return lines.join('\n') + '\n'
}
