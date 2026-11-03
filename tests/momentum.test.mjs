import { test } from 'node:test'
import assert from 'node:assert/strict'
import { budgetDelta, momentumBudget } from '../src/physics/momentum.js'
import { coupledImpactTwoWay, momentumBudget as libBudget } from '../scripts/surrogate/physicsLib.mjs'
import { F, HEADER_LENGTH, NODE_POSITION_OFFSET } from '../src/physics/stateLayout.js'

const S2 = [1.5, 1.0, 0.5]

test('4a: physicsLib.momentumBudget is the shared src/physics/momentum.js function (one implementation for scripts and worker)', () => {
  assert.equal(libBudget, momentumBudget)
})

test('4a: two-way coupling, drawstring off — |ΔP_total| ≤ 1e-9 N·s and the body/net momentum exchange balances (research §3c)', () => {
  const r = coupledImpactTwoWay(...S2, { drawstring: false, momentum: true })
  const d = budgetDelta(r.momentum.before, r.momentum.after)
  assert.ok(d.dPTotal < 1e-9, `ΔP_total ${d.dPTotal}`)
  assert.ok(Math.abs(d.dPBody - d.dPNet) < 1e-9, `body ${d.dPBody} vs net ${d.dPNet}`)
  assert.ok(d.dPBody > 1, 'a contact actually happened')
  // XPBD angular-momentum residual: about 1 % of |L| (3.2e-2 N·m·s max over 20 spins in the report)
  assert.ok(d.dLTotal < 0.05, `ΔL_total ${d.dLTotal}`)
  // measured for S2: 2.79 % of |L_before| (the report's ~1 % is the 20-spin maximum relative to a larger |L|)
  assert.ok(d.dLTotal / d.lBefore < 0.05, `ΔL/|L| ${d.dLTotal / d.lBefore}`)
})

test('4a: live readout — crediting the pending one-substep reaction to the body', () => {
  const net = { twoWay: true, reactionImpulse: new Float64Array(3), reactionAngImpulse: new Float64Array(3), invMass: new Float64Array(0), pos: new Float64Array(0), vel: new Float64Array(0) }
  const body = { p: new Float64Array([0.1, 0.2, 0.3]), v: new Float64Array([1, 2, 3]), R: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) }
  const y = new Float64Array([1, 2, 3, 1, 0, 0, 0])
  // zero pending reaction: identical to the strict call the scripts use
  assert.deepEqual(momentumBudget(y, body, net, true), momentumBudget(y, body, net))
  // pending J shows up as +J in P_body and +(A + p × J) in L_body
  net.reactionImpulse.set([0.5, 0, 0])
  net.reactionAngImpulse.set([0, 0, 0.01])
  const a = momentumBudget(y, body, net, true)
  const b0 = momentumBudget(y, body, net)
  assert.ok(Math.abs(a.body.P[0] - b0.body.P[0] - 0.5) < 1e-15)
  assert.ok(Math.abs(a.body.L[1] - b0.body.L[1] - 0.3 * 0.5) < 1e-15)
  assert.ok(Math.abs(a.body.L[2] - b0.body.L[2] - (0.01 - 0.2 * 0.5)) < 1e-15)
})

test('4a: drawstring on (production schedule) removes momentum from body+net — the readout must show it, not hide it', () => {
  const r = coupledImpactTwoWay(...S2, { drawstring: true, momentum: true })
  const d = budgetDelta(r.momentum.before, r.momentum.after)
  assert.ok(d.dPTotal > 1, `ΔP_total ${d.dPTotal}`)
})

test('4a: one-way kinematics (no body feedback) loses the whole contact impulse', () => {
  const r = coupledImpactTwoWay(...S2, { drawstring: false, momentum: true, bodyFeedback: false })
  const d = budgetDelta(r.momentum.before, r.momentum.after)
  assert.ok(d.dPBody < 1e-12, 'body unchanged')
  assert.ok(d.dPTotal > 1, `ΔP_total ${d.dPTotal}`)
})

test('4a: state buffer header carries ΔP, ΔL and the coupling flags without overlapping node data', () => {
  assert.equal(F.DP_TOTAL, 38)
  assert.equal(F.DL_TOTAL, 39)
  assert.equal(F.COUPLING, 40)
  assert.ok(F.COUPLING < HEADER_LENGTH)
  assert.equal(NODE_POSITION_OFFSET, HEADER_LENGTH)
})
