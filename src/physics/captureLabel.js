/**
 * Capture label path shared by the dataset generator (scripts/surrogate/physicsLib.mjs), the
 * physics worker, the in-browser Monte Carlo and the tests.
 *
 * Label: fireNowSecure = peakWzInContactWindow(ω0, 0) ≤ CAPTURE.wzLimit — torque-free RK4 for the
 * net flight time, then max |ω_z| over the contact window, no net in the loop.
 */
import { CAPTURE, CUBESAT, NET, SOLVER } from './constants.js'
import { rk4Step } from './rigidBody.js'
import { feasibleBranch, timeToThreshold } from './envelope.js'

export const H = 1 / 3000
export const FLIGHT_TIME = NET.standoff / NET.approachSpeed // 0.3 s
export const CONTACT_WINDOW = CAPTURE.decisionWindow // 0.25 s
export const WZ_LIMIT = CAPTURE.wzLimit
export const HORIZON = 3.2 // fire-delay scan horizon used by the dataset and the PINN

if (H !== SOLVER.substep) throw new Error('captureLabel H must equal SOLVER.substep')

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

/**
 * Numeric secure window from one RK4 trajectory sampled every H.
 * For a fire delay d the net arrives at d + FLIGHT_TIME and the verdict window is the next
 * CONTACT_WINDOW; the window peak is the max of |ωz| over the samples in that interval.
 * Returns the first delay (resolution H) whose window peak is ≤ limit, over d ∈ [0, HORIZON].
 */
export function secureWindow(wx, wy, wz, limit = WZ_LIMIT) {
  const flightSteps = Math.round(FLIGHT_TIME / H) // 900
  const windowSteps = Math.round(CONTACT_WINDOW / H) // 750
  const scanSteps = Math.round(HORIZON / H) // 9600
  const n = scanSteps + flightSteps + windowSteps + 1
  const s = new Float64Array(n)
  const y = y0(wx, wy, wz)
  s[0] = Math.abs(y[2])
  for (let k = 1; k < n; k++) {
    rk4Step(y, H, 0)
    s[k] = Math.abs(y[2])
  }
  // sliding max over windowSteps+1 samples ending at index j, via monotonic deque
  const dq = new Int32Array(n)
  let head = 0
  let tail = 0
  let firstSecure = null
  let bestPeak = Infinity
  let bestDelay = 0
  let windowPeakNow = NaN
  for (let j = 0; j < n; j++) {
    while (tail > head && s[dq[tail - 1]] <= s[j]) tail--
    dq[tail++] = j
    const start = j - windowSteps
    if (start < flightSteps) continue
    while (dq[head] < start) head++
    const d = start - flightSteps
    if (d > scanSteps) break
    const peak = s[dq[head]]
    if (d === 0) windowPeakNow = peak
    if (peak <= limit && firstSecure === null) firstSecure = d
    if (peak < bestPeak) {
      bestPeak = peak
      bestDelay = d
    }
  }
  return {
    windowPeakNow,
    fireNowSecure: windowPeakNow <= limit,
    firstSecureDelayS: firstSecure === null ? null : firstSecure * H,
    firstSecureDelayMs: firstSecure === null ? null : Math.round(firstSecure * H * 1000),
    bestDelayMs: Math.round(bestDelay * H * 1000),
    bestPeak,
    scanHorizonS: HORIZON,
    resolutionS: H,
  }
}

/**
 * Verdicts for an initial body rate ω0 from the three physics-side predictors.
 *   rule:     |ωz0| ≤ limit                          (static threshold on the initial state)
 *   envelope: closed-form infinite-horizon max |ωz| ≤ limit
 *   numeric:  fire-now window peak from the RK4 trajectory (the dataset label), secure window, time to threshold
 */
export function computeVerdicts(w0, limit = WZ_LIMIT) {
  const I = CUBESAT.inertia
  const wz0 = Math.abs(w0[2])
  const env = feasibleBranch(I, w0)
  const numeric = secureWindow(w0[0], w0[1], w0[2], limit)
  const tThresh = timeToThreshold(I, w0, limit, H)
  return {
    w0: [w0[0], w0[1], w0[2]],
    limit,
    rule: { verdict: wz0 <= limit ? 'SECURE' : 'EJECT', wz0 },
    envelope: {
      verdict: env.max <= limit ? 'SECURE' : 'EJECT',
      max: env.max,
      branch: env.branch,
      twoT: env.twoT,
      h2: env.h2,
      candidates: env.candidates,
    },
    numeric: {
      verdict: numeric.fireNowSecure ? 'SECURE' : 'EJECT',
      ...numeric,
      timeToThresholdS: tThresh,
    },
  }
}
