/**
 * Gate: latency < 2 ms and held-out capture accuracy beats the naive |ωz|>3 rule.
 * Re-measures latency with the production inference path (single PINN sweep).
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  peakWzInContactWindow,
  mulberry32,
  sampleOmega,
  PRESETS,
  WZ_LIMIT,
  secureIfFiredAt,
} from './physicsLib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const metricsPath = join(root, 'src/surrogate/metrics.json')

const weights = JSON.parse(readFileSync(join(root, 'src/surrogate/weights.json'), 'utf8'))
const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'))

const { loadMlp, predict } = await import(pathToFileURL(join(root, 'src/surrogate/mlp.js')).href)

const IX = 0.479
const IY = 0.273
const IZ = 0.464
const HORIZON = weights.horizon
const MAX_RATE = weights.maxRate
const FLIGHT = weights.flightTime
const WINDOW = weights.contactWindow

const pinnNet = loadMlp(weights.pinn)
const peakNet = loadMlp(weights.peak)

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

function predictOmega(wx0, wy0, wz0, t) {
  const y = predict(pinnNet, feat(wx0, wy0, wz0, t))
  return [wx0 + t * y[0] * MAX_RATE, wy0 + t * y[1] * MAX_RATE, wz0 + t * y[2] * MAX_RATE]
}

function predictPeakWz(wx, wy, wz) {
  return Math.abs(predict(peakNet, encodeState(wx, wy, wz))[0] * MAX_RATE)
}

function runFull(wx, wy, wz) {
  const dt = 0.05
  const n = Math.floor(HORIZON / dt) + 1
  const wzA = new Float32Array(n)
  for (let k = 0; k < n; k++) wzA[k] = predictOmega(wx, wy, wz, k * dt)[2]
  const step = 0.1
  let secure = 0
  let total = 0
  let bestPeak = Infinity
  let bestDelay = 0
  let firstSecure = null
  const maxDelay = Math.max(0, HORIZON - FLIGHT - WINDOW)
  for (let d = 0; d <= maxDelay + 1e-9; d += step) {
    const t0 = d + FLIGHT
    const t1 = t0 + WINDOW
    if (t1 > HORIZON + 1e-9) continue
    let peak = 0
    const i0 = Math.max(0, Math.floor(t0 / dt))
    const i1 = Math.min(n - 1, Math.ceil(t1 / dt))
    for (let i = i0; i <= i1; i++) peak = Math.max(peak, Math.abs(wzA[i]))
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
  const pinnNow = (() => {
    const t0 = FLIGHT
    const t1 = FLIGHT + WINDOW
    let peak = 0
    const i0 = Math.max(0, Math.floor(t0 / dt))
    const i1 = Math.min(n - 1, Math.ceil(t1 / dt))
    for (let i = i0; i <= i1; i++) peak = Math.max(peak, Math.abs(wzA[i]))
    return peak
  })()
  const fireNowPeak = Math.max(pinnNow, predictPeakWz(wx, wy, wz))
  const optDelay = firstSecure !== null ? firstSecure : bestDelay
  return {
    bestDelay: optDelay,
    secure,
    total,
    fireNowPeak,
    fireNowSecure: fireNowPeak <= WZ_LIMIT,
    captureProbability: total ? (100 * secure) / total : 0,
  }
}

function measureLatency(n = 150) {
  for (let i = 0; i < 10; i++) runFull(3, 3, 2.5)
  const t0 = performance.now()
  for (let i = 0; i < n; i++) runFull(3, 3, 2.5)
  return (performance.now() - t0) / n
}

function evaluateAccuracy(n = 600) {
  const rng = mulberry32(99991)
  let correct = 0
  let naive = 0
  for (let i = 0; i < n; i++) {
    const [wx, wy, wz] = i < PRESETS.length ? PRESETS[i].w : sampleOmega(rng)
    const peakTrue = peakWzInContactWindow(wx, wy, wz, 0)
    const peakPred = runFull(wx, wy, wz).fireNowPeak
    const secureTrue = peakTrue <= WZ_LIMIT
    if ((peakPred <= WZ_LIMIT) === secureTrue) correct++
    if ((Math.abs(wz) <= WZ_LIMIT) === secureTrue) naive++
  }
  return { accuracy: correct / n, naiveAccuracy: naive / n, n }
}

const latencyMs = measureLatency()
const eval_ = evaluateAccuracy()
const latencyOk = latencyMs < 2
const beatsNaive = eval_.accuracy > eval_.naiveAccuracy + 0.005

metrics.inferenceLatencyMs = latencyMs
metrics.latencyOk = latencyOk
metrics.checkAccuracy = eval_.accuracy
metrics.naiveAccuracy = eval_.naiveAccuracy
metrics.beatsNaive = beatsNaive
metrics.fidelityScore = eval_.accuracy
metrics.captureAccuracy = eval_.accuracy
metrics.checkedAt = new Date().toISOString()
writeFileSync(metricsPath, JSON.stringify(metrics, null, 2))

console.log(`latency ${latencyMs.toFixed(3)} ms  budget 2 ms  ok=${latencyOk}`)
console.log(
  `accuracy ${(100 * eval_.accuracy).toFixed(1)}%  naive ${(100 * eval_.naiveAccuracy).toFixed(1)}%  beats=${beatsNaive}`,
)

for (const p of PRESETS) {
  const r = runFull(...p.w)
  const truth = peakWzInContactWindow(...p.w, 0)
  const truthAt = secureIfFiredAt(...p.w, r.bestDelay)
  console.log(
    `  ${p.id} predPeak=${r.fireNowPeak.toFixed(2)} truth=${truth.toFixed(2)} securePred=${r.fireNowSecure} P=${r.captureProbability.toFixed(1)}% optMs=${Math.round(r.bestDelay * 1000)} truth@opt=${truthAt}`,
  )
}

if (!latencyOk || !beatsNaive) {
  console.error('check:surrogate FAILED')
  process.exit(1)
}
console.log('check:surrogate PASSED')
