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

export { confusion, HISTOGRAM_BIN, falseSecureHistogram, summarize, CSV_COLUMNS, rowsToCsv } from './monteCarloStats.js'
