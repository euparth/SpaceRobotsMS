import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CUBESAT, PRESETS, PRESET_S5, UI_PRESETS } from '../src/physics/constants.js'
import { invariants, omegaZMax } from '../src/physics/envelope.js'
import { polhodeCurve } from '../src/physics/polhode.js'
import { computeVerdicts } from '../src/physics/captureLabel.js'

const I = CUBESAT.inertia
const [IX, IY, IZ] = I

test('2a: every sampled polhode point lies on both the energy ellipsoid and the momentum sphere (rel. 1e-5, Float32 storage)', () => {
  for (const p of UI_PRESETS) {
    const { twoT, h2 } = invariants(I, p.w)
    if (twoT < 1e-12) continue
    const pts = polhodeCurve(p.w)
    assert.ok(pts.length >= 3 * 2000, `${p.id}: ${pts.length / 3} points`)
    let maxE = 0
    let maxH = 0
    for (let i = 0; i < pts.length; i += 3) {
      const hx = pts[i]
      const hy = pts[i + 1]
      const hz = pts[i + 2]
      const e = (hx * hx) / IX + (hy * hy) / IY + (hz * hz) / IZ
      const h = hx * hx + hy * hy + hz * hz
      maxE = Math.max(maxE, Math.abs(e - twoT) / twoT)
      maxH = Math.max(maxH, Math.abs(h - h2) / h2)
    }
    // Float32 storage of the points limits this to ~1e-6; the Float64 integration itself is ~1e-12
    assert.ok(maxE < 1e-5, `${p.id}: energy residual ${maxE}`)
    assert.ok(maxH < 1e-5, `${p.id}: momentum residual ${maxH}`)
  }
})

test('2a: |Hz| along the sampled polhode never exceeds Iz·ωz,max (closed form)', () => {
  for (const p of UI_PRESETS) {
    const pts = polhodeCurve(p.w)
    const bound = IZ * omegaZMax(I, p.w)
    for (let i = 2; i < pts.length; i += 3) assert.ok(Math.abs(pts[i]) <= bound + 1e-6, `${p.id}: Hz ${pts[i]} > ${bound}`)
  }
})

test('2c: S5 "Envelope boundary" — |ωz0| ≤ 3 and closed-form ωz,max within 0.05 of 3.0 (recorded ω0 = [2.09, 1.00, 2.00])', () => {
  assert.deepEqual(PRESET_S5.w, [2.09, 1.0, 2.0])
  assert.ok(Math.abs(PRESET_S5.w[2]) <= 3)
  const max = omegaZMax(I, PRESET_S5.w)
  assert.ok(Math.abs(3 - max) <= 0.05, `ωz,max ${max}`)
  assert.equal(max.toFixed(6), '2.977154')
  const v = computeVerdicts(PRESET_S5.w)
  assert.equal(v.rule.verdict, 'SECURE')
  assert.equal(v.envelope.verdict, 'SECURE')
  assert.equal(v.numeric.verdict, 'SECURE')
  assert.equal(v.numeric.timeToThresholdS, null)
})

test('2c: dataset presets S1–S4 are unchanged (genData.mjs seeds trajectories with them)', () => {
  assert.deepEqual(
    PRESETS.map((p) => p.w),
    [
      [0, 0, 0],
      [1.5, 1.0, 0.5],
      [0, 0, 4.2],
      [3.0, 3.0, 2.5],
    ],
  )
  assert.equal(PRESETS.length, 4)
  assert.equal(UI_PRESETS.length, 5)
})
