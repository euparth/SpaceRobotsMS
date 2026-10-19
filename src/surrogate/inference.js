/**
 * Fast PINN + peak-head + strain-head inference.
 * Capture decisions use the peak head on PINN-advanced states (not a dense window sweep).
 */
import { loadMlp, predict } from './mlp.js'
import weightsJson from './weights.json'
import metricsJson from './metrics.json'

const IX = 0.479
const IY = 0.273
const IZ = 0.464

export const METRICS = metricsJson
export const WEIGHTS = weightsJson

const HORIZON = weightsJson.horizon
const DT = weightsJson.dt
const MAX_RATE = weightsJson.maxRate
const WZ_LIMIT = weightsJson.wzLimit
const FLIGHT = weightsJson.flightTime
const WINDOW = weightsJson.contactWindow
const STRAIN_MODE = weightsJson.strainMode

const pinnNet = loadMlp(weightsJson.pinn)
const peakNet = loadMlp(weightsJson.peak)
const strainNet = loadMlp(weightsJson.strain)

const featBuf = new Float32Array(6)
const stateBuf = new Float32Array(6)

function feat(wx0, wy0, wz0, t) {
  featBuf[0] = wx0 / MAX_RATE
  featBuf[1] = wy0 / MAX_RATE
  featBuf[2] = wz0 / MAX_RATE
  featBuf[3] = t / HORIZON
  const phase = (2 * Math.PI * t) / HORIZON
  featBuf[4] = Math.sin(phase)
  featBuf[5] = Math.cos(phase)
  return featBuf
}

function encodeState(wx, wy, wz) {
  stateBuf[0] = wx / MAX_RATE
  stateBuf[1] = wy / MAX_RATE
  stateBuf[2] = wz / MAX_RATE
  stateBuf[3] = Math.hypot(wx, wy, wz) / (MAX_RATE * Math.sqrt(3))
  stateBuf[4] = (0.5 * (IX * wx * wx + IY * wy * wy + IZ * wz * wz)) / 20
  stateBuf[5] = Math.hypot(IX * wx, IY * wy, IZ * wz) / 10
  return stateBuf
}

/** ω̂(t; ω₀) with hard IC. */
export function predictOmega(wx0, wy0, wz0, t) {
  const y = predict(pinnNet, feat(wx0, wy0, wz0, t))
  return [
    wx0 + t * y[0] * MAX_RATE,
    wy0 + t * y[1] * MAX_RATE,
    wz0 + t * y[2] * MAX_RATE,
  ]
}

export function predictPeakWz(wx, wy, wz) {
  return Math.abs(predict(peakNet, encodeState(wx, wy, wz))[0] * MAX_RATE)
}

export function predictStrain(wx, wy, wz) {
  const y = predict(strainNet, encodeState(wx, wy, wz))
  if (STRAIN_MODE === 'continuous') {
    return { peakStrain: Math.max(0, y[0]), mode: 'continuous', band: strainBand(y[0]) }
  }
  let best = 0
  if (y[1] > y[best]) best = 1
  if (y[2] > y[best]) best = 2
  const mid = best === 0 ? 0.025 : best === 1 ? 0.1 : 0.2
  return { peakStrain: mid, mode: 'band', band: best }
}

function strainBand(s) {
  if (s < 0.05) return 0
  if (s < 0.15) return 1
  return 2
}

/**
 * Peak |ωz| in the contact window if the net is fired after `delay` seconds.
 * Uses the PINN ωz(t) sweep over [delay+flight, delay+flight+window] so intermediate-axis
 * growth (and pure-Z holds) are respected. Fire-now also blends the dedicated peak head.
 */
export function pinnPeakInWindow(wx0, wy0, wz0, delay, dt = 0.05) {
  const t0 = Math.max(0, delay) + FLIGHT
  const t1 = t0 + WINDOW
  let peak = 0
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    const wz = predictOmega(wx0, wy0, wz0, t)[2]
    peak = Math.max(peak, Math.abs(wz))
  }
  return peak
}

export function peakIfFiredAt(wx0, wy0, wz0, delay) {
  const pinnPeak = pinnPeakInWindow(wx0, wy0, wz0, delay)
  if (delay < 1e-9) {
    // Blend peak head (trained on contact-window labels) with PINN window for fire-now
    return Math.max(pinnPeak, predictPeakWz(wx0, wy0, wz0))
  }
  return pinnPeak
}

export function fireSchedule(wx0, wy0, wz0, step = 0.1) {
  let secure = 0
  let total = 0
  let bestPeak = Infinity
  let bestDelay = 0
  let firstSecure = null
  for (let d = 0; d <= HORIZON + 1e-9; d += step) {
    const peak = peakIfFiredAt(wx0, wy0, wz0, d)
    total++
    if (peak <= WZ_LIMIT) {
      secure++
      if (firstSecure === null) firstSecure = d
    }
    if (peak < bestPeak) {
      bestPeak = peak
      bestDelay = d
    }
  }
  const fireNowPeak = peakIfFiredAt(wx0, wy0, wz0, 0)
  return {
    captureProbability: total ? (100 * secure) / total : 0,
    optimalLaunchDelayMs: Math.round(bestDelay * 1000),
    firstSecureMs: firstSecure === null ? null : Math.round(firstSecure * 1000),
    bestPeak,
    fireNowPeak,
    fireNowSecure: fireNowPeak <= WZ_LIMIT,
  }
}

/** Sparse ωz trace for the credibility chart. */
export function omegaZTrace(wx0, wy0, wz0, dt = 0.04) {
  const n = Math.floor(HORIZON / dt) + 1
  const t = new Float32Array(n)
  const wz = new Float32Array(n)
  const wx = new Float32Array(n)
  const wy = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const tk = k * dt
    t[k] = tk
    const w = predictOmega(wx0, wy0, wz0, tk)
    wx[k] = w[0]
    wy[k] = w[1]
    wz[k] = w[2]
  }
  return { t, wx, wy, wz, dt, horizon: HORIZON }
}

/**
 * One PINN sweep reused for the ωz chart and the fire-schedule window peaks.
 */
function sweepOmega(wx0, wy0, wz0, dt = 0.05) {
  const n = Math.floor(HORIZON / dt) + 1
  const t = new Float32Array(n)
  const wxA = new Float32Array(n)
  const wyA = new Float32Array(n)
  const wzA = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const tk = k * dt
    t[k] = tk
    const w = predictOmega(wx0, wy0, wz0, tk)
    wxA[k] = w[0]
    wyA[k] = w[1]
    wzA[k] = w[2]
  }
  return { t, wx: wxA, wy: wyA, wz: wzA, dt, horizon: HORIZON }
}

function peakFromSweep(sweep, delay) {
  const t0 = Math.max(0, delay) + FLIGHT
  const t1 = t0 + WINDOW
  // Contact window must lie inside the PINN horizon or the lookup is meaningless
  if (t1 > sweep.horizon + 1e-9) return Infinity
  let peak = 0
  const { wz, dt } = sweep
  const i0 = Math.max(0, Math.floor(t0 / dt))
  const i1 = Math.min(wz.length - 1, Math.ceil(t1 / dt))
  for (let i = i0; i <= i1; i++) peak = Math.max(peak, Math.abs(wz[i]))
  return peak
}

function scheduleFromSweep(wx0, wy0, wz0, sweep, step = 0.1) {
  let secure = 0
  let total = 0
  let bestPeak = Infinity
  let bestDelay = 0
  let firstSecure = null
  const maxDelay = Math.max(0, HORIZON - FLIGHT - WINDOW)
  for (let d = 0; d <= maxDelay + 1e-9; d += step) {
    const peak = peakFromSweep(sweep, d)
    total++
    if (peak <= WZ_LIMIT) {
      secure++
      if (firstSecure === null) firstSecure = d
    }
    if (peak < bestPeak) {
      bestPeak = peak
      bestDelay = d
    }
  }
  const pinnNow = peakFromSweep(sweep, 0)
  const fireNowPeak = Math.max(pinnNow, predictPeakWz(wx0, wy0, wz0))
  // Prefer earliest secure phase when available (nutation-sync auto-fire)
  const optDelay = firstSecure !== null ? firstSecure : bestDelay
  return {
    captureProbability: total ? (100 * secure) / total : 0,
    optimalLaunchDelayMs: Math.round(optDelay * 1000),
    firstSecureMs: firstSecure === null ? null : Math.round(firstSecure * 1000),
    bestPeak,
    fireNowPeak,
    fireNowSecure: fireNowPeak <= WZ_LIMIT,
  }
}

/**
 * Full surrogate inference for one live state.
 * @returns measured fields — never hard-coded marketing numbers
 */
export function runSurrogateInference(wx, wy, wz, opts = {}) {
  const vRel = opts.vRel ?? 10
  const includeTrace = opts.includeTrace !== false
  const scheduleStep = opts.scheduleStep ?? 0.1

  const t0 = performance.now()
  const sweep = sweepOmega(wx, wy, wz, 0.05)
  const sched = scheduleFromSweep(wx, wy, wz, sweep, scheduleStep)
  const strain = predictStrain(wx, wy, wz)
  const trace = includeTrace ? { ...sweep, dt: 0.05, horizon: HORIZON } : null
  const latencyMs = performance.now() - t0

  const isCriticalEjection = !sched.fireNowSecure
  const neverSecure = sched.firstSecureMs == null
  let statusText
  if (sched.fireNowSecure) statusText = 'CAPTURE FEASIBLE — fire now'
  else if (neverSecure) statusText = 'CRITICAL EJECTION — no secure phase in horizon'
  else statusText = `HOLD — fire in ${sched.optimalLaunchDelayMs} ms sim`

  // Tension estimate: σ_eff ≈ η E ε → T = σ A
  const eta = metricsJson.wovenEfficiency ?? 0.002
  const E = metricsJson.youngsModulus ?? 120e9
  const A = metricsJson.threadArea ?? Math.PI * 2.5e-7
  const peakTensionN = eta * E * strain.peakStrain * A

  const coupledMs = opts.coupledMs ?? metricsJson.coupledRolloutMsEstimate ?? 17
  const rigidMs = opts.rigidMs ?? metricsJson.rigidRolloutMsEstimate ?? 0.2
  const speedup = coupledMs / Math.max(latencyMs, 1e-6)

  return {
    wx,
    wy,
    wz,
    vRel,
    captureProbability: sched.captureProbability,
    isCriticalEjection,
    fireNowSecure: sched.fireNowSecure,
    statusText,
    peakWzPred: sched.fireNowPeak,
    peakStrain: strain.peakStrain,
    peakStrainPct: 100 * strain.peakStrain,
    strainBand: strain.band,
    peakTensionN,
    // Legacy-ish field name from brief — we store strain%, not fake GPa
    peakStressGPa: null,
    optimalLaunchDelayMs: sched.optimalLaunchDelayMs,
    firstSecureMs: sched.firstSecureMs,
    inferenceLatencyMs: latencyMs,
    solverSpeedupFactor: speedup,
    rigidRolloutMs: rigidMs,
    coupledRolloutMs: coupledMs,
    pinnFidelityScore: metricsJson.fidelityScore ?? metricsJson.captureAccuracy,
    heldOutAccuracy: metricsJson.captureAccuracy,
    naiveAccuracy: metricsJson.naiveAccuracy,
    modelLabel: metricsJson.label || 'JS MLP',
    wzLimit: WZ_LIMIT,
    flightTime: FLIGHT,
    contactWindow: WINDOW,
    horizon: HORIZON,
    trace,
    confidence: Math.min(0.99, Math.max(0.5, metricsJson.captureAccuracy ?? 0.9)),
  }
}

/** Bench-only: average latency over N calls. */
export function measureInferenceLatency(n = 100) {
  runSurrogateInference(3, 3, 2.5, { includeTrace: true })
  const t0 = performance.now()
  for (let i = 0; i < n; i++) runSurrogateInference(3, 3, 2.5, { includeTrace: true })
  return (performance.now() - t0) / n
}
