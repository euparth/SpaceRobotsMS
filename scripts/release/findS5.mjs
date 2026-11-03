/**
 * Release 1.0, Phase 2c — choose preset S5 "Envelope boundary":
 *   |ωz0| ≤ 3 and closed-form ωz,max within 0.05 of 3.0 (target just below the limit).
 * Fix ωy = 1.00, ωz0 = 2.00 and bisect ωx so that omegaZMax = 2.98; then round ωx to 0.01 and
 * re-evaluate. Prints the rounded ω0 and every quantity the verdict panel shows for it.
 * Usage: node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/release/findS5.mjs
 */
import { CUBESAT } from '../../src/physics/constants.js'
import { omegaZMax } from '../../src/physics/envelope.js'
import { computeVerdicts } from '../../src/physics/captureLabel.js'
import { runSurrogateInference } from '../../src/surrogate/inference.js'
import { coupledImpact } from '../surrogate/physicsLib.mjs'

const I = CUBESAT.inertia
const WY = 1.0
const WZ = 2.0
const TARGET = 2.98
let lo = 0
let hi = 5
for (let k = 0; k < 80; k++) {
  const mid = 0.5 * (lo + hi)
  if (omegaZMax(I, [mid, WY, WZ]) < TARGET) lo = mid
  else hi = mid
}
const exact = 0.5 * (lo + hi)
const wx = Math.round(exact * 100) / 100
const w0 = [wx, WY, WZ]
console.log(`bisection: wx_exact ${exact} -> rounded ${wx}; omegaZMax(exact) ${omegaZMax(I, [exact, WY, WZ])}`)
const v = computeVerdicts(w0)
const p = runSurrogateInference(...w0, { includeTrace: false })
const c = coupledImpact(...w0)
console.log(`S5 w0 ${JSON.stringify(w0)}`)
console.log(`closed-form max|wz| ${v.envelope.max} branch ${v.envelope.branch} 2T ${v.envelope.twoT} H2 ${v.envelope.h2}`)
console.log(`|3 - max| ${Math.abs(3 - v.envelope.max)} within 0.05: ${Math.abs(3 - v.envelope.max) <= 0.05}`)
console.log(`rule ${v.rule.verdict} envelope ${v.envelope.verdict} numeric ${v.numeric.verdict} windowPeakNow ${v.numeric.windowPeakNow} firstSecureDelayMs ${v.numeric.firstSecureDelayMs} timeToThreshold ${v.numeric.timeToThresholdS}`)
console.log(`pinn fireNowSecure ${p.fireNowSecure} peakWzPred ${p.peakWzPred} firstSecureMs ${p.firstSecureMs} captureProbability ${p.captureProbability}`)
console.log(`coupledImpact one-way: peakWz ${c.peakWz} eject ${c.eject} tContact ${c.tContact} maxStrain ${c.maxStrain}`)
