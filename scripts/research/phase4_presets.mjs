/**
 * Phase 4 — measured values for the README scenario table (S1–S4).
 * Usage: node scripts/research/phase4_presets.mjs
 */
import { IX, IY, IZ, predictOutcome } from '../../src/physics/rigidBody.js'
import { PRESETS, WZ_LIMIT, coupledImpact, peakWzInContactWindow, fireSchedule, HORIZON } from '../surrogate/physicsLib.mjs'
import { closedFormMaxWz } from './closedForm.mjs'

console.log('id | w0 | closed-form max|wz| (infinite horizon) | predictOutcome verdict | window peak |wz| fire-now (rigid label path) | rule |wz0|<=3 | coupledImpact peak|wz| | coupledImpact verdict | coupledImpact maxStrain | first secure delay ms (fireSchedule step 0.04) | capture probability % over 3.2 s')
for (const p of PRESETS) {
  const w = p.w
  const cf = closedFormMaxWz(IX, IY, IZ, ...w).max
  const po = predictOutcome(w)
  const win = peakWzInContactWindow(...w, 0)
  const c = coupledImpact(...w)
  const fs = fireSchedule(...w, HORIZON, 0.04)
  console.log(
    `${p.id} | ${JSON.stringify(w)} | ${cf.toFixed(6)} | ${po.verdict} | ${win.toFixed(6)} | ${Math.abs(w[2]) <= WZ_LIMIT} | ${c.peakWz.toFixed(6)} | ${c.eject ? 'eject' : 'capture'} | ${c.maxStrain.toFixed(6)} | ${fs.firstSecureMs} | ${fs.captureProbability.toFixed(4)}`,
  )
}
console.log('note: live-worker end states (SECURED / EJECTED, enclosure after closure) are not produced by these headless paths')
