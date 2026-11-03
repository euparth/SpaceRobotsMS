import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CUBESAT, PRESETS } from '../src/physics/constants.js'
import { feasibleBranch, omegaZMax, rk4Omega, timeToThreshold } from '../src/physics/envelope.js'
import { IX, IY, IZ, polhodeEnvelope, predictOutcome, rk4Step } from '../src/physics/rigidBody.js'
import { computeVerdicts, peakWzInContactWindow, secureWindow, H } from '../src/physics/captureLabel.js'
import { fireSchedule } from '../scripts/surrogate/physicsLib.mjs'
import { runSurrogateInference } from '../src/surrogate/inference.js'

const I = CUBESAT.inertia

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('1e: envelope.omegaZMax equals rigidBody.polhodeEnvelope to 1e-12 on 200 seeded spins', () => {
  const rng = mulberry32(20261104)
  let maxDiff = 0
  for (let i = 0; i < 200; i++) {
    const w = [rng() * 5, rng() * 5, rng() * 5]
    const a = omegaZMax(I, w)
    const b = polhodeEnvelope(...w).peak
    maxDiff = Math.max(maxDiff, Math.abs(a - b))
    assert.ok(Math.abs(a - b) < 1e-12, `spin ${w}: ${a} vs ${b}`)
    const fb = feasibleBranch(I, w)
    assert.ok(fb.branch === 'a=0' || fb.branch === 'b=0', `branch missing for ${w}`)
    const active = fb.candidates.find((c) => c.name === fb.branch)
    assert.ok(active.feasible)
    assert.ok(Math.abs(Math.sqrt(Math.max(0, active.c)) - a) < 1e-12 || a === Math.abs(w[2]))
  }
  assert.ok(maxDiff < 1e-12)
})

test('1e: rk4Omega (3-state) matches rigidBody.rk4Step ω components bit-for-bit over 3000 steps', () => {
  for (const w0 of [[1.5, 1, 0.5], [3, 3, 2.5], [0.3, 4.1, 2.9]]) {
    const w = new Float64Array(w0)
    const y = new Float64Array([...w0, 1, 0, 0, 0])
    for (let k = 0; k < 3000; k++) {
      rk4Omega(I, w, H)
      rk4Step(y, H, 0)
    }
    assert.deepEqual([w[0], w[1], w[2]], [y[0], y[1], y[2]])
  }
})

test('1e: timeToThreshold is the first sampled time with |ωz| > limit on the RK4 trajectory', () => {
  // S4: brute force on the same trajectory
  const w0 = [3, 3, 2.5]
  const t = timeToThreshold(I, w0, 3.0, H)
  const y = new Float64Array([...w0, 1, 0, 0, 0])
  let brute = null
  for (let k = 1; k <= 60000; k++) {
    rk4Step(y, H, 0)
    if (Math.abs(y[2]) > 3.0) {
      brute = k * H
      break
    }
  }
  assert.equal(t, brute)
  assert.equal(timeToThreshold(I, [0, 0, 4.2], 3.0, H), 0)
  assert.equal(timeToThreshold(I, [1.5, 1, 0.5], 3.0, H), null)
  assert.equal(timeToThreshold(I, [0, 0, 0], 3.0, H), null)
})

test('1e: worker verdict code (computeVerdicts) equals the script verdicts on S1–S4', () => {
  for (const p of PRESETS.filter((x) => ['S1', 'S2', 'S3', 'S4'].includes(x.id))) {
    const v = computeVerdicts(p.w)
    // rule
    assert.equal(v.rule.verdict, Math.abs(p.w[2]) <= 3 ? 'SECURE' : 'EJECT')
    // envelope == predictOutcome (SECURE iff peak <= 3)
    const po = predictOutcome(p.w)
    assert.equal(v.envelope.verdict, po.peak <= 3 ? 'SECURE' : 'EJECT')
    assert.equal(v.envelope.max, po.peak)
    // numeric fire-now == dataset label path
    const peak0 = peakWzInContactWindow(...p.w, 0)
    assert.equal(v.numeric.windowPeakNow, peak0)
    assert.equal(v.numeric.verdict, peak0 <= 3 ? 'SECURE' : 'EJECT')
    // secure window: first H-resolution delay must be <= dataset's first 0.04 s-grid delay and within one grid step of it
    const fs = fireSchedule(...p.w, 3.2, 0.04)
    if (fs.firstSecureMs == null) assert.equal(v.numeric.firstSecureDelayMs, null)
    else {
      assert.ok(v.numeric.firstSecureDelayMs <= fs.firstSecureMs, `${p.id}: ${v.numeric.firstSecureDelayMs} > ${fs.firstSecureMs}`)
      assert.ok(fs.firstSecureMs - v.numeric.firstSecureDelayMs < 40 + 1e-9)
      // the delay found must itself be secure on the dataset path
      assert.ok(peakWzInContactWindow(...p.w, v.numeric.firstSecureDelayS) <= 3 + 1e-12)
    }
    // PINN verdict == runSurrogateInference(...).fireNowSecure (what the worker posts)
    const inf = runSurrogateInference(...p.w, { includeTrace: false })
    assert.equal(inf.fireNowSecure ? 'SECURE' : 'EJECT', inf.peakWzPred <= 3 ? 'SECURE' : 'EJECT')
  }
})

test('1e: measured S1–S4 verdict table (values from research_2026-11 Phase 4)', () => {
  const expect = {
    S1: { rule: 'SECURE', env: 'SECURE', envMax: '0.000000', win: '0.000000' },
    S2: { rule: 'SECURE', env: 'SECURE', envMax: '1.659865', win: '0.845196' },
    S3: { rule: 'EJECT', env: 'EJECT', envMax: '4.200000', win: '4.200000' },
    S4: { rule: 'SECURE', env: 'EJECT', envMax: '4.033684', win: '3.924574' },
  }
  for (const p of PRESETS) {
    const e = expect[p.id]
    if (!e) continue
    const v = computeVerdicts(p.w)
    assert.equal(v.rule.verdict, e.rule)
    assert.equal(v.envelope.verdict, e.env)
    assert.equal(v.envelope.max.toFixed(6), e.envMax)
    assert.equal(v.numeric.windowPeakNow.toFixed(6), e.win)
  }
  const sw = secureWindow(3, 3, 2.5)
  assert.equal(sw.fireNowSecure, false)
  assert.ok(sw.firstSecureDelayMs > 0 && sw.firstSecureDelayMs <= 1080)
})
