/**
 * Browser-facing PINN surrogate engine.
 * Field names mirror the thesis brief; values are always measured.
 */
import {
  runSurrogateInference,
  measureInferenceLatency,
  predictOmega,
  METRICS,
  WEIGHTS,
} from '../surrogate/inference.js'

let lastResult = null
let lastKey = ''
let coupledMs = METRICS.coupledRolloutMsEstimate ?? 17
let rigidMs = METRICS.rigidRolloutMsEstimate ?? 0.2

export function setBenchmarkBaselines({ coupledMs: c, rigidMs: r } = {}) {
  if (Number.isFinite(c) && c > 0) coupledMs = c
  if (Number.isFinite(r) && r > 0) rigidMs = r
}

export function getBenchmarkBaselines() {
  return { coupledMs, rigidMs }
}

export function getSurrogateMetrics() {
  return METRICS
}

export function getSurrogateWeightsMeta() {
  return {
    version: WEIGHTS.version,
    kind: WEIGHTS.kind,
    horizon: WEIGHTS.horizon,
    modelLabel: METRICS.label,
  }
}

/**
 * @param {number} wx
 * @param {number} wy
 * @param {number} wz
 * @param {number} [vRel=10]
 */
export function runPINNInference(wx, wy, wz, vRel = 10) {
  const key = `${wx.toFixed(4)},${wy.toFixed(4)},${wz.toFixed(4)}`
  // Cheap cache for identical inputs within the same tick burst
  if (key === lastKey && lastResult) return lastResult
  const result = runSurrogateInference(wx, wy, wz, {
    vRel,
    coupledMs,
    rigidMs,
    includeTrace: true,
  })
  lastKey = key
  lastResult = result
  return result
}

export function clearSurrogateCache() {
  lastKey = ''
  lastResult = null
}

export { measureInferenceLatency, predictOmega, METRICS, WEIGHTS }
