/**
 * Polhode sampling for the POLHODE view and its test. Pure (no three.js).
 */
import { CUBESAT } from './constants.js'
import { rk4Omega } from './envelope.js'

const [IX, IY, IZ] = CUBESAT.inertia
export const CURVE_SECONDS = 20
export const CURVE_STEP = 1 / 300
export const CURVE_POINTS = 2400

/**
 * Integrate torque-free Euler from ω0 for CURVE_SECONDS with a 3-state RK4 (same equations as
 * the worker, step 1/300 s) and map to H-space, H = I·ω. Returns Float32Array xyz triples.
 */
export function polhodeCurve(w0, I = CUBESAT.inertia) {
  const w = new Float64Array(w0)
  const n = Math.round(CURVE_SECONDS / CURVE_STEP)
  const every = Math.max(1, Math.floor(n / CURVE_POINTS))
  const pts = []
  for (let k = 0; k <= n; k++) {
    if (k % every === 0) pts.push(I[0] * w[0], I[1] * w[1], I[2] * w[2])
    rk4Omega(I, w, CURVE_STEP)
  }
  return new Float32Array(pts)
}

export { IX, IY, IZ }
