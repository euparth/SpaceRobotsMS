import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IX, IY, IZ, rk4Step, kineticEnergy, polhodeEnvelope } from '../src/physics/rigidBody.js'
import { PRESETS } from '../src/physics/constants.js'
import { closedFormMaxWz } from '../scripts/research/closedForm.mjs'

const H = 1 / 3000
const SPINS = [
  [1.5, 1.0, 0.5],
  [3.0, 3.0, 2.5],
  [0.3, 4.1, 2.9],
  [4.7, 0.2, 1.1],
]
const hMag = (y) => Math.hypot(IX * y[0], IY * y[1], IZ * y[2])
const y0 = (w) => new Float64Array([...w, 1, 0, 0, 0])

test('1a: |H| and T relative drift over 10 s at H stay below 1e-12', () => {
  for (const w of SPINS) {
    const y = y0(w)
    const H0 = hMag(y)
    const T0 = kineticEnergy(...w)
    for (let k = 0; k < 30000; k++) rk4Step(y, H, 0)
    assert.ok(Math.abs(hMag(y) - H0) / H0 < 1e-12, `|H| drift ${w}`)
    assert.ok(Math.abs(kineticEnergy(y[0], y[1], y[2]) - T0) / T0 < 1e-12, `T drift ${w}`)
  }
})

test('1b: RK4 error vs H/8 reference is at round-off for h<=H and decreases ~4th order for coarse h', () => {
  const integrate = (w, h, T) => {
    const y = y0(w)
    const n = Math.round(T / h)
    for (let k = 0; k < n; k++) rk4Step(y, h, 0)
    return [y[0], y[1], y[2]]
  }
  const T = 0.55
  for (const w of SPINS) {
    const ref = integrate(w, H / 8, T)
    const err = (h) => {
      const r = integrate(w, h, T)
      return Math.hypot(r[0] - ref[0], r[1] - ref[1], r[2] - ref[2])
    }
    assert.ok(err(H) < 1e-11, `fine-step error ${w}`)
    // 0.55 s = 1650 H; 75 and 150 divide 1650 so both coarse runs end exactly at T
    const e75 = err(75 * H)
    const e150 = err(150 * H)
    const order = Math.log2(e150 / e75)
    assert.ok(order > 3 && order < 5, `observed order ${order} for ${w}`)
  }
})

test('1c: closed-form max |wz| equals rigidBody.polhodeEnvelope and bounds the numeric 20 s peak', () => {
  for (const w of [...SPINS, ...PRESETS.map((p) => p.w)]) {
    const cf = closedFormMaxWz(IX, IY, IZ, ...w).max
    const env = polhodeEnvelope(...w).peak
    assert.ok(Math.abs(cf - env) < 1e-12, `envelope mismatch ${w}: ${cf} vs ${env}`)
    const y = y0(w)
    let peak = Math.abs(y[2])
    for (let k = 0; k < 60000; k++) {
      rk4Step(y, H, 0)
      peak = Math.max(peak, Math.abs(y[2]))
    }
    assert.ok(peak <= cf + 1e-9, `numeric peak ${peak} exceeds bound ${cf} for ${w}`)
    if (Math.hypot(w[0], w[1]) > 1e-9 && Math.hypot(...w) > 1e-9) {
      assert.ok(cf - peak < 1e-5, `bound ${cf} not approached by 20 s numeric peak ${peak} for ${w}`)
    }
  }
})

test('1c: closed-form candidates reject the infeasible branch (polhode does not cross that axis)', () => {
  const r = closedFormMaxWz(IX, IY, IZ, 3.0, 3.0, 2.5)
  assert.equal(r.candidates.length, 2)
  assert.ok(r.candidates.some((c) => c.feasible))
})
