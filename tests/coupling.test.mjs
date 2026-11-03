import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coupledImpact, coupledImpactTwoWay } from '../scripts/surrogate/physicsLib.mjs'
import { NetSolver } from '../src/physics/netSolver.js'
import { rk4Step } from '../src/physics/rigidBody.js'

const norm = (v) => Math.hypot(...v)
const sub = (a, b) => a.map((x, i) => x - b[i])

test('default coupledImpact() output is unchanged by the two-way option plumbing (reference values from validation_2026-11.md Task B)', () => {
  // z-axis 3.5 rad/s: peak 3.5, eject; x-axis 2.0: peak 0, capture (tContact 0.279333)
  const a = coupledImpact(0, 0, 3.5)
  assert.equal(a.eject, true)
  assert.equal(a.peakWz.toFixed(6), '3.500000')
  const b = coupledImpact(2.0, 0, 0)
  assert.equal(b.eject, false)
  assert.equal(b.tContact.toFixed(6), '0.279333')
  assert.equal(b.maxStrain.toFixed(6), '0.036925')
})

test('rk4Step with torque=null is bit-identical to the 3-argument call', () => {
  const y1 = new Float64Array([3, 3, 2.5, 1, 0, 0, 0])
  const y2 = new Float64Array([3, 3, 2.5, 1, 0, 0, 0])
  for (let k = 0; k < 3000; k++) {
    rk4Step(y1, 1 / 3000, 0)
    rk4Step(y2, 1 / 3000, 0, null)
  }
  for (let i = 0; i < 7; i++) assert.equal(y1[i], y2[i])
})

test('NetSolver.twoWay defaults to false and the reaction accumulators are zero on the default path', () => {
  const n = new NetSolver()
  assert.equal(n.twoWay, false)
  assert.deepEqual([...n.reactionImpulse], [0, 0, 0])
})

test('two-way coupling with drawstring off conserves total linear momentum to 1e-9 and is finite', () => {
  for (const w of [
    [2.8535, 2.5291, 2.9003],
    [0.5719, 1.3508, 2.9619],
  ]) {
    const r = coupledImpactTwoWay(...w, { drawstring: false, momentum: true })
    assert.equal(r.unstable, false)
    assert.ok(Number.isFinite(r.peakWz))
    const dP = norm(sub(r.momentum.after.total.P, r.momentum.before.total.P))
    assert.ok(dP < 1e-9, `|ΔP| ${dP}`)
    assert.ok(norm(r.bodyV) > 0, 'body must acquire velocity from the net')
  }
})

test('two-way single-axis z spins reproduce the one-way verdict boundary (3.0 capture, 3.5 eject)', () => {
  assert.equal(coupledImpact(0, 0, 3.0, { coupling: 'two-way' }).eject, false)
  assert.equal(coupledImpact(0, 0, 3.5, { coupling: 'two-way' }).eject, true)
})
