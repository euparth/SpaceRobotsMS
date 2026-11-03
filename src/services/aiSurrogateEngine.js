/**
 * Browser-facing PINN surrogate engine.
 * Latency is measured per call; coupled/rigid baselines are the
 * worker benchmark result once available, otherwise metrics.json estimates (17 ms / 0.2 ms).
 *
 * The weights (src/surrogate/weights.json, ~125 kB) are loaded on demand so the first paint of the
 * workbench does not parse them. runPINNInference returns null until loadSurrogate() resolves.
 */
import METRICS from '../surrogate/metrics.json'

let lastResult = null
let lastKey = ''
let coupledMs = METRICS.coupledRolloutMsEstimate ?? 17
let rigidMs = METRICS.rigidRolloutMsEstimate ?? 0.2

/** @type {typeof import('../surrogate/inference.js') | null} */
let inference = null
let loading = null

export function loadSurrogate() {
  if (inference) return Promise.resolve(inference)
  if (!loading) {
    loading = import('../surrogate/inference.js').then((m) => {
      inference = m
      return m
    })
  }
  return loading
}

export function isSurrogateLoaded() {
  return inference !== null
}

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
  if (!inference) return null
  const { WEIGHTS } = inference
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
 * @returns {object | null} null until the weights have loaded
 */
export function runPINNInference(wx, wy, wz, vRel = 10) {
  if (!inference) return null
  const key = `${wx.toFixed(4)},${wy.toFixed(4)},${wz.toFixed(4)}`
  // Cheap cache for identical inputs within the same tick burst
  if (key === lastKey && lastResult) return lastResult
  const result = inference.runSurrogateInference(wx, wy, wz, {
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

export { METRICS }
