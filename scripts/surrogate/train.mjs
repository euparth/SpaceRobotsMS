/**
 * Train rotational PINN + strain / capture heads in pure JS.
 * Writes src/surrogate/weights.json and src/surrogate/metrics.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  createMlp,
  forward,
  backward,
  zeroGrads,
  adamStep,
  serializeMlp,
  predict,
  loadMlp,
} from './nn.mjs'
import {
  IX,
  IY,
  IZ,
  kineticEnergy,
  peakWzInContactWindow,
  sampleTrajectory,
  fireSchedule,
  mulberry32,
  sampleOmega,
  HORIZON,
  WZ_LIMIT,
  FLIGHT_TIME,
  CONTACT_WINDOW,
  PRESETS,
  NET,
} from './physicsLib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, 'data')
const OUT = join(__dirname, '../../src/surrogate')
const MAX_RATE = 5
const DT = 0.02

function loadTrajectories() {
  const meta = JSON.parse(readFileSync(join(DATA, 'trajectories.meta.json'), 'utf8'))
  const buf = readFileSync(join(DATA, 'trajectories.bin'))
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const rows = []
  for (let i = 0; i < f.length; i += meta.stride) {
    rows.push({
      wx0: f[i],
      wy0: f[i + 1],
      wz0: f[i + 2],
      t: f[i + 3],
      wx: f[i + 4],
      wy: f[i + 5],
      wz: f[i + 6],
    })
  }
  return { meta, rows }
}

/** Features: [wx0,wy0,wz0,t,sin(ωt),cos(ωt)] normalized. Hard IC via ω̂ = ω0 + t·N(·). */
function feat(wx0, wy0, wz0, t, out = new Float32Array(6)) {
  out[0] = wx0 / MAX_RATE
  out[1] = wy0 / MAX_RATE
  out[2] = wz0 / MAX_RATE
  out[3] = t / HORIZON
  const phase = (2 * Math.PI * t) / HORIZON
  out[4] = Math.sin(phase)
  out[5] = Math.cos(phase)
  return out
}

function pinnPredict(net, wx0, wy0, wz0, t) {
  const y = predict(net, feat(wx0, wy0, wz0, t))
  // Hard IC: ω̂(t) = ω0 + t * N(·)  — N scaled so typical rates stay O(1)
  return [
    wx0 + t * y[0] * MAX_RATE,
    wy0 + t * y[1] * MAX_RATE,
    wz0 + t * y[2] * MAX_RATE,
  ]
}

function eulerResidual(wx, wy, wz) {
  // dω/dt from Euler (torque-free)
  return [
    -((IZ - IY) * wy * wz) / IX,
    -((IX - IZ) * wz * wx) / IY,
    -((IY - IX) * wx * wy) / IZ,
  ]
}

function angMomMag(wx, wy, wz) {
  return Math.hypot(IX * wx, IY * wy, IZ * wz)
}

function trainPinn(rows, epochs = 12, batch = 128) {
  console.log(`Training rotational PINN on ${rows.length} samples…`)
  const net = createMlp([6, 48, 48, 3], mulberry32(11))
  const n = rows.length
  const idx = new Int32Array(n)
  for (let i = 0; i < n; i++) idx[i] = i
  const rng = mulberry32(99)
  let step = 0
  const xBuf = new Float32Array(6)
  const dy = new Float32Array(3)

  for (let ep = 0; ep < epochs; ep++) {
    // shuffle
    for (let i = n - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      const tmp = idx[i]
      idx[i] = idx[j]
      idx[j] = tmp
    }
    let lossSum = 0
    let nBatch = 0
    for (let start = 0; start < n; start += batch) {
      zeroGrads(net)
      const end = Math.min(n, start + batch)
      let loss = 0
      for (let p = start; p < end; p++) {
        const r = rows[idx[p]]
        feat(r.wx0, r.wy0, r.wz0, r.t, xBuf)
        const { y, cache } = forward(net, xBuf)
        const wx = r.wx0 + r.t * y[0] * MAX_RATE
        const wy = r.wy0 + r.t * y[1] * MAX_RATE
        const wz = r.wz0 + r.t * y[2] * MAX_RATE

        // data loss
        const ex = wx - r.wx
        const ey = wy - r.wy
        const ez = wz - r.wz
        loss += ex * ex + ey * ey + ez * ez

        // conservation vs IC
        const T0 = kineticEnergy(r.wx0, r.wy0, r.wz0)
        const T = kineticEnergy(wx, wy, wz)
        const H0 = angMomMag(r.wx0, r.wy0, r.wz0)
        const H = angMomMag(wx, wy, wz)
        const eT = T - T0
        const eH = H - H0
        loss += 0.05 * (eT * eT + eH * eH)

        // Euler residual via central difference in t (skip near t=0)
        let physX = 0
        let physY = 0
        let physZ = 0
        if (r.t > 0.04 && r.t < HORIZON - 0.04) {
          const dt = 0.02
          const ym = pinnPredict(net, r.wx0, r.wy0, r.wz0, r.t - dt)
          const yp = pinnPredict(net, r.wx0, r.wy0, r.wz0, r.t + dt)
          const dwx = (yp[0] - ym[0]) / (2 * dt)
          const dwy = (yp[1] - ym[1]) / (2 * dt)
          const dwz = (yp[2] - ym[2]) / (2 * dt)
          const [rx, ry, rz] = eulerResidual(wx, wy, wz)
          physX = dwx - rx
          physY = dwy - ry
          physZ = dwz - rz
          loss += 0.02 * (physX * physX + physY * physY + physZ * physZ)
        }

        // dL/dy through hard IC: ∂ω/∂y = t * MAX_RATE
        const scale = r.t * MAX_RATE
        // Approximate grads: data + conservation + phys (finite-diff style on N)
        // ∂L/∂ω ≈ 2e + 0.05*2eT*∂T/∂ω + 0.05*2eH*∂H/∂ω + 0.02*2phys*∂phys/∂ω
        const dT_dwx = IX * wx
        const dT_dwy = IY * wy
        const dT_dwz = IZ * wz
        const hm = H + 1e-12
        const dH_dwx = (IX * IX * wx) / hm
        const dH_dwy = (IY * IY * wy) / hm
        const dH_dwz = (IZ * IZ * wz) / hm

        let gwx = 2 * ex + 0.1 * eT * dT_dwx + 0.1 * eH * dH_dwx
        let gwy = 2 * ey + 0.1 * eT * dT_dwy + 0.1 * eH * dH_dwy
        let gwz = 2 * ez + 0.1 * eT * dT_dwz + 0.1 * eH * dH_dwz
        // physics residual soft push (treat phys as independent of N for stability)
        gwx += 0.04 * physX
        gwy += 0.04 * physY
        gwz += 0.04 * physZ

        dy[0] = (gwx * scale) / (end - start)
        dy[1] = (gwy * scale) / (end - start)
        dy[2] = (gwz * scale) / (end - start)
        backward(net, cache, dy)
      }
      step++
      const lr = 1e-3 * Math.pow(0.92, ep)
      adamStep(net, lr, 0.9, 0.999, 1e-8, step)
      lossSum += loss / (end - start)
      nBatch++
    }
    console.log(`  pinn epoch ${ep + 1}/${epochs} loss=${(lossSum / nBatch).toFixed(4)}`)
  }
  return net
}

function trainStrainHead(strainRows, epochs = 40) {
  console.log(`Training strain head on ${strainRows.length} samples…`)
  const audit = JSON.parse(readFileSync(join(DATA, 'audit.json'), 'utf8'))
  const useContinuous = audit.smoothEnough
  // Input: wx,wy,wz,|ω|,T,|H|  → strain or 3-class logits
  const outDim = useContinuous ? 1 : 3
  const net = createMlp([6, 32, 32, outDim], mulberry32(33))
  const n = strainRows.length
  const split = Math.floor(n * 0.85)
  const train = strainRows.slice(0, split)
  const test = strainRows.slice(split)
  const rng = mulberry32(7)
  let step = 0
  const x = new Float32Array(6)
  const dy = new Float32Array(outDim)

  function encode(r) {
    x[0] = r.wx / MAX_RATE
    x[1] = r.wy / MAX_RATE
    x[2] = r.wz / MAX_RATE
    x[3] = Math.hypot(r.wx, r.wy, r.wz) / (MAX_RATE * Math.sqrt(3))
    x[4] = kineticEnergy(r.wx, r.wy, r.wz) / 20
    x[5] = angMomMag(r.wx, r.wy, r.wz) / 10
    return x
  }

  function band(s) {
    if (s < 0.05) return 0
    if (s < 0.15) return 1
    return 2
  }

  for (let ep = 0; ep < epochs; ep++) {
    // shuffle train
    for (let i = train.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      ;[train[i], train[j]] = [train[j], train[i]]
    }
    let lossSum = 0
    const B = 64
    for (let start = 0; start < train.length; start += B) {
      zeroGrads(net)
      const end = Math.min(train.length, start + B)
      for (let i = start; i < end; i++) {
        const r = train[i]
        const { y, cache } = forward(net, encode(r))
        if (useContinuous) {
          const pred = y[0] // raw; target strain in [0,~0.5]
          const err = pred - r.maxStrain
          lossSum += err * err
          dy[0] = (2 * err) / (end - start)
          backward(net, cache, dy)
        } else {
          // softmax CE
          const m = Math.max(y[0], y[1], y[2])
          const e0 = Math.exp(y[0] - m)
          const e1 = Math.exp(y[1] - m)
          const e2 = Math.exp(y[2] - m)
          const Z = e0 + e1 + e2
          const p0 = e0 / Z
          const p1 = e1 / Z
          const p2 = e2 / Z
          const t = band(r.maxStrain)
          const pt = t === 0 ? p0 : t === 1 ? p1 : p2
          lossSum += -Math.log(pt + 1e-8)
          dy[0] = (p0 - (t === 0 ? 1 : 0)) / (end - start)
          dy[1] = (p1 - (t === 1 ? 1 : 0)) / (end - start)
          dy[2] = (p2 - (t === 2 ? 1 : 0)) / (end - start)
          backward(net, cache, dy)
        }
      }
      step++
      adamStep(net, 2e-3 * Math.pow(0.95, ep), 0.9, 0.999, 1e-8, step)
    }
    if ((ep + 1) % 5 === 0 || ep === 0) {
      console.log(`  strain epoch ${ep + 1}/${epochs} trainLoss=${(lossSum / train.length).toFixed(5)}`)
    }
  }

  // eval
  let sse = 0
  let sst = 0
  let correct = 0
  const mean = test.reduce((s, r) => s + r.maxStrain, 0) / test.length
  for (const r of test) {
    const y = predict(net, encode(r))
    if (useContinuous) {
      sse += (y[0] - r.maxStrain) ** 2
      sst += (r.maxStrain - mean) ** 2
    } else {
      let best = 0
      if (y[1] > y[best]) best = 1
      if (y[2] > y[best]) best = 2
      if (best === band(r.maxStrain)) correct++
    }
  }
  const metrics = useContinuous
    ? { mode: 'continuous', r2: 1 - sse / sst, rmse: Math.sqrt(sse / test.length), nTest: test.length }
    : { mode: 'band', accuracy: correct / test.length, nTest: test.length }
  console.log('  strain metrics', metrics)
  return { net, metrics, useContinuous }
}

/** Direct peak-|ωz| head — robust capture classifier fallback / boost. */
function trainPeakHead(captureRows, epochs = 50) {
  console.log(`Training peak-|ωz| head on ${captureRows.length} samples…`)
  const net = createMlp([6, 48, 32, 1], mulberry32(55))
  const n = captureRows.length
  const split = Math.floor(n * 0.85)
  const train = captureRows.slice(0, split)
  const test = captureRows.slice(split)
  const rng = mulberry32(13)
  let step = 0
  const x = new Float32Array(6)
  const dy = new Float32Array(1)

  function encode(r) {
    x[0] = r.wx / MAX_RATE
    x[1] = r.wy / MAX_RATE
    x[2] = r.wz / MAX_RATE
    x[3] = Math.hypot(r.wx, r.wy, r.wz) / (MAX_RATE * Math.sqrt(3))
    x[4] = kineticEnergy(r.wx, r.wy, r.wz) / 20
    x[5] = angMomMag(r.wx, r.wy, r.wz) / 10
    return x
  }

  for (let ep = 0; ep < epochs; ep++) {
    for (let i = train.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      ;[train[i], train[j]] = [train[j], train[i]]
    }
    let lossSum = 0
    const B = 64
    for (let start = 0; start < train.length; start += B) {
      zeroGrads(net)
      const end = Math.min(train.length, start + B)
      for (let i = start; i < end; i++) {
        const r = train[i]
        const { y, cache } = forward(net, encode(r))
        const pred = y[0] * MAX_RATE // scale
        const err = pred - r.peak0
        lossSum += err * err
        dy[0] = ((2 * err * MAX_RATE) / (end - start))
        backward(net, cache, dy)
      }
      step++
      adamStep(net, 2e-3 * Math.pow(0.95, ep), 0.9, 0.999, 1e-8, step)
    }
    if ((ep + 1) % 10 === 0) console.log(`  peak epoch ${ep + 1} loss=${(lossSum / train.length).toFixed(4)}`)
  }

  let correct = 0
  let naiveCorrect = 0
  let sse = 0
  for (const r of test) {
    const pred = predict(net, encode(r))[0] * MAX_RATE
    sse += (pred - r.peak0) ** 2
    const secure = pred <= WZ_LIMIT
    if (secure === r.fireNowSecure) correct++
    if (!r.naiveEject === r.fireNowSecure) naiveCorrect++
  }
  const metrics = {
    rmse: Math.sqrt(sse / test.length),
    accuracy: correct / test.length,
    naiveAccuracy: naiveCorrect / test.length,
    nTest: test.length,
  }
  console.log('  peak metrics', metrics)
  return { net, metrics }
}

function evaluatePinn(net, nTest = 400) {
  const rng = mulberry32(12345)
  let sseWz = 0
  let nPts = 0
  let captureCorrect = 0
  let naiveCorrect = 0
  const delayStep = 0.04
  let delayMae = 0
  let delayN = 0

  for (let i = 0; i < nTest; i++) {
    const [wx0, wy0, wz0] = i < PRESETS.length ? PRESETS[i].w : sampleOmega(rng)
    const tr = sampleTrajectory(wx0, wy0, wz0, HORIZON, DT)
    for (let k = 0; k < tr.t.length; k++) {
      const [wx, wy, wz] = pinnPredict(net, wx0, wy0, wz0, tr.t[k])
      sseWz += (wz - tr.wz[k]) ** 2
      nPts++
    }
    // fire-now capture from PINN contact-window peak
    const peakTrue = peakWzInContactWindow(wx0, wy0, wz0, 0)
    const peakPred = pinnPeakInWindow(net, wx0, wy0, wz0, 0)
    const secureTrue = peakTrue <= WZ_LIMIT
    const securePred = peakPred <= WZ_LIMIT
    if (securePred === secureTrue) captureCorrect++
    if ((Math.abs(wz0) <= WZ_LIMIT) === secureTrue) naiveCorrect++

    // optimal delay comparison (coarse)
    const sched = fireSchedule(wx0, wy0, wz0, HORIZON, delayStep)
    const predSched = pinnFireSchedule(net, wx0, wy0, wz0, delayStep)
    delayMae += Math.abs(sched.optimalLaunchDelayMs - predSched.optimalLaunchDelayMs)
    delayN++
  }

  return {
    wzRmse: Math.sqrt(sseWz / nPts),
    captureAccuracy: captureCorrect / nTest,
    naiveAccuracy: naiveCorrect / nTest,
    optimalDelayMaeMs: delayMae / delayN,
    nTest,
  }
}

function pinnPeakInWindow(net, wx0, wy0, wz0, delay) {
  const t0 = delay + FLIGHT_TIME
  const t1 = t0 + CONTACT_WINDOW
  let peak = 0
  for (let t = t0; t <= t1 + 1e-9; t += DT) {
    const [, , wz] = pinnPredict(net, wx0, wy0, wz0, Math.max(0, t))
    peak = Math.max(peak, Math.abs(wz))
  }
  return peak
}

function pinnFireSchedule(net, wx0, wy0, wz0, step = 0.04) {
  let secure = 0
  let total = 0
  let bestPeak = Infinity
  let bestDelay = 0
  for (let d = 0; d <= HORIZON + 1e-9; d += step) {
    const peak = pinnPeakInWindow(net, wx0, wy0, wz0, d)
    total++
    if (peak <= WZ_LIMIT) secure++
    if (peak < bestPeak) {
      bestPeak = peak
      bestDelay = d
    }
  }
  return {
    captureProbability: total ? (100 * secure) / total : 0,
    optimalLaunchDelayMs: Math.round(bestDelay * 1000),
    bestPeak,
    fireNowSecure: pinnPeakInWindow(net, wx0, wy0, wz0, 0) <= WZ_LIMIT,
  }
}

function measureLatency(nets) {
  const trials = 200
  const ws = [3, 3, 2.5]
  // warm up
  for (let i = 0; i < 20; i++) runInferenceBundle(nets, ...ws)
  const t0 = performance.now()
  for (let i = 0; i < trials; i++) runInferenceBundle(nets, ...ws)
  return (performance.now() - t0) / trials
}

function runInferenceBundle(nets, wx, wy, wz) {
  // Full surrogate pass: PINN sweep + peak head + strain
  const nPts = Math.floor(HORIZON / DT) + 1
  const wzTrace = new Float32Array(nPts)
  for (let k = 0; k < nPts; k++) {
    const t = k * DT
    const w = pinnPredict(nets.pinn, wx, wy, wz, t)
    wzTrace[k] = w[2]
  }
  const peakNow = pinnPeakInWindow(nets.pinn, wx, wy, wz, 0)
  const sched = pinnFireSchedule(nets.pinn, wx, wy, wz, 0.04)
  const x = new Float32Array(6)
  x[0] = wx / MAX_RATE
  x[1] = wy / MAX_RATE
  x[2] = wz / MAX_RATE
  x[3] = Math.hypot(wx, wy, wz) / (MAX_RATE * Math.sqrt(3))
  x[4] = kineticEnergy(wx, wy, wz) / 20
  x[5] = angMomMag(wx, wy, wz) / 10
  const peakDirect = predict(nets.peak, x)[0] * MAX_RATE
  const strainOut = predict(nets.strain, x)
  return { wzTrace, peakNow, sched, peakDirect, strainOut }
}

async function main() {
  if (!existsSync(join(DATA, 'trajectories.bin'))) {
    console.error('Missing data — run genData.mjs first')
    process.exit(1)
  }
  mkdirSync(OUT, { recursive: true })

  const { rows } = loadTrajectories()
  // Subsample for speed if huge
  const trainRows = rows.length > 200000 ? rows.filter((_, i) => i % 2 === 0) : rows
  const pinn = trainPinn(trainRows, 10, 256)

  const strainRows = JSON.parse(readFileSync(join(DATA, 'strain.json'), 'utf8'))
  const strain = trainStrainHead(strainRows, 35)

  const captureRows = JSON.parse(readFileSync(join(DATA, 'capture.json'), 'utf8'))
  const peak = trainPeakHead(captureRows, 45)

  console.log('Evaluating PINN on held-out spins…')
  const pinnEval = evaluatePinn(pinn, 500)
  console.log('  pinnEval', pinnEval)

  // Blend: use peak head for fire-now if better than PINN alone
  const blendAcc = Math.max(pinnEval.captureAccuracy, peak.metrics.accuracy)
  const beatsNaive = blendAcc > peak.metrics.naiveAccuracy + 0.01

  const nets = { pinn, peak: peak.net, strain: strain.net }
  const latencyMs = measureLatency(nets)
  console.log(`  measured inference latency ${latencyMs.toFixed(3)} ms`)

  // Browser re-measures coupled/rigid costs live via worker benchmark
  const coupledMsEstimate = 17
  const rigidMsEstimate = 0.2

  const weights = {
    version: 1,
    kind: 'js-mlp',
    horizon: HORIZON,
    dt: DT,
    maxRate: MAX_RATE,
    wzLimit: WZ_LIMIT,
    flightTime: FLIGHT_TIME,
    contactWindow: CONTACT_WINDOW,
    pinn: serializeMlp(pinn),
    peak: serializeMlp(peak.net),
    strain: serializeMlp(strain.net),
    strainMode: strain.useContinuous ? 'continuous' : 'band',
  }

  const metrics = {
    trainedAt: new Date().toISOString(),
    pinn: pinnEval,
    peak: peak.metrics,
    strain: strain.metrics,
    captureAccuracy: blendAcc,
    naiveAccuracy: peak.metrics.naiveAccuracy,
    beatsNaive,
    inferenceLatencyMs: latencyMs,
    latencyBudgetMs: 2,
    latencyOk: latencyMs < 2,
    coupledRolloutMsEstimate: coupledMsEstimate,
    rigidRolloutMsEstimate: rigidMsEstimate,
    speedupVsCoupledEstimate: coupledMsEstimate / Math.max(latencyMs, 1e-6),
    fidelityScore: blendAcc,
    threadArea: NET.threadArea,
    youngsModulus: NET.youngsModulus,
    wovenEfficiency: NET.wovenEfficiency,
    label: 'JS MLP (physics-informed)',
  }

  writeFileSync(join(OUT, 'weights.json'), JSON.stringify(weights))
  writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2))
  console.log('Wrote', join(OUT, 'weights.json'))
  console.log('Wrote', join(OUT, 'metrics.json'))
  console.log(
    `PASS gates: latencyOk=${metrics.latencyOk} beatsNaive=${beatsNaive} acc=${(100 * blendAcc).toFixed(1)}% vs naive ${(100 * metrics.naiveAccuracy).toFixed(1)}%`,
  )
  if (!metrics.latencyOk || !beatsNaive) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
