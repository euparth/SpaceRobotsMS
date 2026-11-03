/**
 * Task B: single-axis sweep through the coupled rigid-body + XPBD net rollout, net fired at t = 0.
 * The rollout loop is the one in coupledImpact() (scripts/surrogate/physicsLib.mjs) with extra
 * read-only observers; every run is cross-checked against coupledImpact() itself.
 * Usage: node scripts/validation/axisSweep.mjs
 */
import { NetSolver } from '../../src/physics/netSolver.js'
import { NODE_COUNT } from '../../src/physics/netTopology.js'
import {
  CUBESAT,
  CONTACT_WINDOW,
  FLIGHT_TIME,
  H,
  WZ_LIMIT,
  coupledImpact,
  peakWzInContactWindow,
  quatToMatrix,
  rk4Step,
  y0,
} from '../surrogate/physicsLib.mjs'

const RATES = [0.1, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
const AXES = ['x', 'y', 'z']

function observedImpact(wx, wy, wz) {
  const y = y0(wx, wy, wz)
  const body = {
    p: new Float64Array(3),
    v: new Float64Array(3),
    R: new Float64Array(9),
    w: new Float64Array(3),
    half: CUBESAT.dims.map((d) => d / 2),
  }
  const net = new NetSolver()
  net.launch()
  let t = 0
  let tContact = -1
  let phase = 'flight'
  let maxStrain = 0
  let peakWz = 0
  let peakW = 0
  let peakContactCount = 0
  const limit = FLIGHT_TIME + CONTACT_WINDOW + 0.15

  while (t < limit) {
    rk4Step(y, H, 0)
    quatToMatrix(y[3], y[4], y[5], y[6], body.R)
    const R = body.R
    body.w[0] = R[0] * y[0] + R[1] * y[1] + R[2] * y[2]
    body.w[1] = R[3] * y[0] + R[4] * y[1] + R[5] * y[2]
    body.w[2] = R[6] * y[0] + R[7] * y[1] + R[8] * y[2]
    net.step(H, body)
    t += H

    if (phase === 'flight' && net.contactCount > 0) {
      phase = 'contact'
      tContact = t
      net.drawstring = true
    }
    if (phase === 'contact') {
      peakWz = Math.max(peakWz, Math.abs(y[2]))
      peakW = Math.max(peakW, Math.hypot(y[0], y[1], y[2]))
      peakContactCount = Math.max(peakContactCount, net.contactCount)
      if (Math.round(t / H) % 20 === 0) {
        net.measure()
        maxStrain = Math.max(maxStrain, net.maxStrain)
      }
      if (t - tContact >= CONTACT_WINDOW) break
    }
  }
  net.measure()
  maxStrain = Math.max(maxStrain, net.maxStrain)
  return {
    tContact,
    tEnd: t,
    peakWz,
    peakW,
    maxStrain,
    eject: peakWz > WZ_LIMIT,
    contactEnd: net.contactCount,
    contactPeak: peakContactCount,
    enclosureEnd: net.enclosure(body),
    wEnd: [y[0], y[1], y[2]],
  }
}

console.log(`H=${H} FLIGHT_TIME=${FLIGHT_TIME} CONTACT_WINDOW=${CONTACT_WINDOW} WZ_LIMIT=${WZ_LIMIT} NODE_COUNT=${NODE_COUNT}`)
console.log('verdict rule (coupledImpact): eject = max |omega_z body| over [tContact, tContact+window] > WZ_LIMIT')
console.log(
  'axis | w | verdict | peak|w| contact | peak|wz| contact | tContact s | knots in contact end/144 | peak knots/144 | enclosure end | maxStrain | rigid-label secure | match coupledImpact | repeat identical',
)

let mismatches = 0
let nonRepeat = 0
for (const axis of AXES) {
  for (const w of RATES) {
    const omega = [axis === 'x' ? w : 0, axis === 'y' ? w : 0, axis === 'z' ? w : 0]
    const r = observedImpact(...omega)
    const r2 = observedImpact(...omega)
    const ref = coupledImpact(...omega)
    const match =
      ref.peakWz === r.peakWz && ref.eject === r.eject && ref.tContact === r.tContact && ref.maxStrain === r.maxStrain
    const repeat = JSON.stringify(r) === JSON.stringify(r2)
    if (!match) mismatches++
    if (!repeat) nonRepeat++
    const rigidSecure = peakWzInContactWindow(...omega, 0) <= WZ_LIMIT
    console.log(
      [
        axis,
        w.toFixed(1),
        r.eject ? 'eject' : 'capture',
        r.peakW.toFixed(6),
        r.peakWz.toFixed(6),
        r.tContact.toFixed(6),
        `${r.contactEnd}/${NODE_COUNT}`,
        `${r.contactPeak}/${NODE_COUNT}`,
        r.enclosureEnd.toFixed(4),
        r.maxStrain.toFixed(6),
        rigidSecure,
        match,
        repeat,
      ].join(' | '),
    )
  }
}
console.log(`coupledImpact mismatches: ${mismatches}`)
console.log(`non-repeatable runs: ${nonRepeat}`)
