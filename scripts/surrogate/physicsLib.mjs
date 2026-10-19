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

export const H = 1 / 3000
export const FLIGHT_TIME = NET.standoff / NET.approachSpeed // ~0.3 s
export const CONTACT_WINDOW = CAPTURE.decisionWindow
export const HORIZON = 3.2
export const WZ_LIMIT = CAPTURE.wzLimit

export function y0(wx, wy, wz) {
  return new Float64Array([wx, wy, wz, 1, 0, 0, 0])
}

/** Peak |ωz| in [delay+flight, delay+flight+window] after torque-free tumble. */
export function peakWzInContactWindow(wx, wy, wz, delay = 0) {
  const y = y0(wx, wy, wz)
  const wait = delay + FLIGHT_TIME
  for (let t = 0; t < wait - 1e-12; t += H) rk4Step(y, H, 0)
  let peak = Math.abs(y[2])
  for (let t = 0; t < CONTACT_WINDOW - 1e-12; t += H) {
    rk4Step(y, H, 0)
    peak = Math.max(peak, Math.abs(y[2]))
  }
  return peak
}

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
 */
export function coupledImpact(wx, wy, wz) {
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

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sampleOmega(rng, max = MAX_RATE) {
  return [rng() * max, rng() * max, rng() * max]
}
