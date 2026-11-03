/**
 * Shared physics helpers for offline dataset generation.
 * Mirrors the live worker's contact-window capture law.
 */
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const require = createRequire(import.meta.url)

// Dynamic ESM imports of the live physics modules
const constants = await import(join(root, 'src/physics/constants.js'))
const rigid = await import(join(root, 'src/physics/rigidBody.js'))
const { NetSolver } = await import(join(root, 'src/physics/netSolver.js'))

export const { CAPTURE, CUBESAT, NET, STRAIN_BANDS, MAX_RATE, PRESETS } = constants
export const { IX, IY, IZ, rk4Step, kineticEnergy, quatToMatrix, predictOutcome } = rigid

// Label path shared with the worker and the in-browser Monte Carlo (release 1.0): same code,
// moved to src/physics/captureLabel.js. H = 1/3000, FLIGHT_TIME = 0.3 s, CONTACT_WINDOW = 0.25 s.
export { H, FLIGHT_TIME, CONTACT_WINDOW, HORIZON, WZ_LIMIT, y0, peakWzInContactWindow } from '../../src/physics/captureLabel.js'
import { H, FLIGHT_TIME, CONTACT_WINDOW, HORIZON, WZ_LIMIT, y0, peakWzInContactWindow } from '../../src/physics/captureLabel.js'

export function secureIfFiredAt(wx, wy, wz, delay = 0) {
  return peakWzInContactWindow(wx, wy, wz, delay) <= WZ_LIMIT
}

/** Sample a torque-free ω(t) trajectory at uniform Δt. */
export function sampleTrajectory(wx, wy, wz, horizon = HORIZON, dt = 0.02) {
  const y = y0(wx, wy, wz)
  const n = Math.floor(horizon / dt) + 1
  const ts = new Float64Array(n)
  const wxA = new Float64Array(n)
  const wyA = new Float64Array(n)
  const wzA = new Float64Array(n)
  let t = 0
  let k = 0
  const stepsPer = Math.max(1, Math.round(dt / H))
  for (let i = 0; i < n; i++) {
    ts[i] = t
    wxA[i] = y[0]
    wyA[i] = y[1]
    wzA[i] = y[2]
    for (let s = 0; s < stepsPer; s++) rk4Step(y, H, 0)
    t += stepsPer * H
  }
  return { t: ts, wx: wxA, wy: wyA, wz: wzA }
}

/**
 * Coupled rollout: launch net immediately, integrate until after contact window.
 * Returns peak strain during contact (before closure) and peak |ωz|.
 * opts.coupling: 'one-way' (default; body is torque-free, net sees the body as an infinite-mass
 * wall) or 'two-way' (experimental; see coupledImpactTwoWay).
 */
export function coupledImpact(wx, wy, wz, opts = undefined) {
  if (opts && opts.coupling && opts.coupling !== 'one-way') {
    if (opts.coupling !== 'two-way') throw new Error(`unknown coupling "${opts.coupling}"`)
    return coupledImpactTwoWay(wx, wy, wz, opts)
  }
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
      if (Math.round(t / H) % 20 === 0) {
        net.measure()
        maxStrain = Math.max(maxStrain, net.maxStrain)
      }
      if (t - tContact >= CONTACT_WINDOW) break
    }
  }
  net.measure()
  maxStrain = Math.max(maxStrain, net.maxStrain)
  return { tContact, peakWz, maxStrain, eject: peakWz > WZ_LIMIT }
}

/** Total linear momentum (kg·m/s) and angular momentum about the world origin (kg·m²/s) of body + net. */
// Momentum budget of body + net: moved unchanged to src/physics/momentum.js (release 1.0)
const { momentumBudget } = await import(join(root, 'src/physics/momentum.js'))
export { momentumBudget }

/**
 * Experimental two-way coupling. Same schedule as coupledImpact(); in addition:
 *  - NetSolver.twoWay = true, so resolveContacts() accumulates the reaction impulse on the body.
 *  - The reaction from substep n is applied during substep n+1 (one-substep lag, H = 1/3000 s):
 *      * torque τ_body = Rᵀ · (reactionAngImpulse / H) is held constant across the four RK4 stages
 *        (zero-order hold), via rk4Step(y, H, 0, τ_body);
 *      * translation: v += reactionImpulse / m, p += v · H (symplectic Euler), before the net step.
 *  - opts.drawstring (default true) controls whether the corner drawstring servo is engaged at contact.
 *  - opts.momentum (default false) returns momentum budgets at t = flight − 0.02 s and at the end.
 */
export function coupledImpactTwoWay(wx, wy, wz, opts = {}) {
  const useDrawstring = opts.drawstring !== false
  // opts.bodyFeedback=false: accumulate reactions but do not apply them (one-way kinematics, for budget comparison)
  const fb = opts.bodyFeedback !== false ? 1 : 0
  const y = y0(wx, wy, wz)
  const body = {
    p: new Float64Array(3),
    v: new Float64Array(3),
    R: new Float64Array(9),
    w: new Float64Array(3),
    half: CUBESAT.dims.map((d) => d / 2),
  }
  const net = new NetSolver()
  net.twoWay = true
  net.launch()
  const m = CUBESAT.mass
  const tau = new Float64Array(3)
  let t = 0
  let tContact = -1
  let phase = 'flight'
  let maxStrain = 0
  let peakWz = 0
  let maxTorque = 0
  let maxForce = 0
  let before = null
  const tBefore = FLIGHT_TIME - 0.02
  const limit = FLIGHT_TIME + CONTACT_WINDOW + 0.15
  quatToMatrix(y[3], y[4], y[5], y[6], body.R)

  while (t < limit) {
    // reaction from the previous substep → body-frame torque (ZOH) and linear impulse
    const R = body.R
    const Lx = net.reactionAngImpulse[0] / H
    const Ly = net.reactionAngImpulse[1] / H
    const Lz = net.reactionAngImpulse[2] / H
    tau[0] = fb * (R[0] * Lx + R[3] * Ly + R[6] * Lz)
    tau[1] = fb * (R[1] * Lx + R[4] * Ly + R[7] * Lz)
    tau[2] = fb * (R[2] * Lx + R[5] * Ly + R[8] * Lz)
    maxTorque = Math.max(maxTorque, Math.hypot(Lx, Ly, Lz))
    maxForce = Math.max(maxForce, Math.hypot(net.reactionImpulse[0], net.reactionImpulse[1], net.reactionImpulse[2]) / H)
    rk4Step(y, H, 0, fb ? tau : null)
    body.v[0] += (fb * net.reactionImpulse[0]) / m
    body.v[1] += (fb * net.reactionImpulse[1]) / m
    body.v[2] += (fb * net.reactionImpulse[2]) / m
    body.p[0] += body.v[0] * H
    body.p[1] += body.v[1] * H
    body.p[2] += body.v[2] * H
    quatToMatrix(y[3], y[4], y[5], y[6], body.R)
    body.w[0] = R[0] * y[0] + R[1] * y[1] + R[2] * y[2]
    body.w[1] = R[3] * y[0] + R[4] * y[1] + R[5] * y[2]
    body.w[2] = R[6] * y[0] + R[7] * y[1] + R[8] * y[2]
    if (opts.momentum && before === null && t >= tBefore) before = momentumBudget(y, body, net)
    net.step(H, body)
    t += H

    if (phase === 'flight' && net.contactCount > 0) {
      phase = 'contact'
      tContact = t
      if (useDrawstring) net.drawstring = true
    }
    if (phase === 'contact') {
      peakWz = Math.max(peakWz, Math.abs(y[2]))
      if (Math.round(t / H) % 20 === 0) {
        net.measure()
        maxStrain = Math.max(maxStrain, net.maxStrain)
      }
      if (t - tContact >= CONTACT_WINDOW) break
    }
    if (!Number.isFinite(y[0]) || !Number.isFinite(net.pos[0])) {
      return { tContact, peakWz: NaN, maxStrain: NaN, eject: null, unstable: true, tFail: t }
    }
  }
  // apply the trailing reaction so the final budget includes the last substep's impulse
  body.v[0] += (fb * net.reactionImpulse[0]) / m
  body.v[1] += (fb * net.reactionImpulse[1]) / m
  body.v[2] += (fb * net.reactionImpulse[2]) / m
  {
    const R = body.R
    const Lx = fb * net.reactionAngImpulse[0]
    const Ly = fb * net.reactionAngImpulse[1]
    const Lz = fb * net.reactionAngImpulse[2]
    y[0] += (R[0] * Lx + R[3] * Ly + R[6] * Lz) / IX
    y[1] += (R[1] * Lx + R[4] * Ly + R[7] * Lz) / IY
    y[2] += (R[2] * Lx + R[5] * Ly + R[8] * Lz) / IZ
  }
  net.measure()
  maxStrain = Math.max(maxStrain, net.maxStrain)
  const out = {
    tContact,
    peakWz,
    maxStrain,
    eject: peakWz > WZ_LIMIT,
    unstable: false,
    maxReactionForceN: maxForce,
    maxReactionTorqueNm: maxTorque,
    bodyV: [...body.v],
    bodyP: [...body.p],
    wEnd: [y[0], y[1], y[2]],
  }
  if (opts.momentum) out.momentum = { before, after: momentumBudget(y, body, net) }
  return out
}

/** Phase-averaged capture probability and best fire delay over [0, scanHorizon]. */
export function fireSchedule(wx, wy, wz, scanHorizon = HORIZON, step = 0.02) {
  let secure = 0
  let total = 0
  let bestPeak = Infinity
  let bestDelay = 0
  let firstSecure = null
  for (let d = 0; d <= scanHorizon + 1e-9; d += step) {
    const peak = peakWzInContactWindow(wx, wy, wz, d)
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
  return {
    captureProbability: total ? (100 * secure) / total : 0,
    optimalLaunchDelayMs: Math.round(bestDelay * 1000),
    firstSecureMs: firstSecure === null ? null : Math.round(firstSecure * 1000),
    bestPeak,
    fireNowSecure: peakWzInContactWindow(wx, wy, wz, 0) <= WZ_LIMIT,
  }
}

// Seeded RNG and the box sampler: moved unchanged to src/physics/priors.js (release 1.0)
export { mulberry32, sampleOmega } from '../../src/physics/priors.js'
