/**
 * Closed-form infinite-horizon bound on |ω_z| for torque-free rigid-body motion.
 * Single source for the worker, the HUD, scripts/research and the tests.
 *
 * Invariants (body frame, principal axes):
 *   2T = Ix ωx² + Iy ωy² + Iz ωz²        energy ellipsoid
 *   H² = Ix² ωx² + Iy² ωy² + Iz² ωz²     momentum sphere (sphere in H-space)
 * With a = ωx², b = ωy², c = ωz² ≥ 0 both are linear in (a, b, c). Maximising c subject to
 * a ≥ 0, b ≥ 0 is a one-dimensional linear programme; the optimum lies on a boundary:
 *   a = 0 ("wx=0" branch):  c = (H² − 2T·Iy) / (Iz (Iz − Iy)),  b = (2T − Iz c) / Iy  must be ≥ 0
 *   b = 0 ("wy=0" branch):  c = (H² − 2T·Ix) / (Iz (Iz − Ix)),  a = (2T − Iz c) / Ix  must be ≥ 0
 * Only candidates with c ≥ 0 and the remaining component ≥ 0 lie on the polhode.
 * Bound = max(|ωz0|, √c over feasible candidates).
 *
 * The arithmetic is kept identical to the pre-1.0 rigidBody.polhodeEnvelope() so that every
 * value in reports/validation_2026-11.md and reports/research_2026-11.md reproduces.
 */

/** Two invariants for inertia I = [Ix, Iy, Iz] and body rates w = [wx, wy, wz]. */
export function invariants(I, w) {
  const [Ix, Iy, Iz] = I
  const [wx, wy, wz] = w
  const twoT = Ix * wx * wx + Iy * wy * wy + Iz * wz * wz
  const h2 = (Ix * wx) ** 2 + (Iy * wy) ** 2 + (Iz * wz) ** 2
  return { twoT, h2 }
}

/**
 * Both boundary candidates with their feasibility, and which one is active.
 * @returns {{ twoT:number, h2:number, candidates:Array<{tag:string,c:number,other:number,feasible:boolean}>, branch:string|null, max:number }}
 *   branch is 'a=0' (ωx vanishes at the peak), 'b=0' (ωy vanishes), or null when no boundary
 *   candidate is feasible (pure z spin, rest, or a degenerate inertia).
 */
export function feasibleBranch(I, w) {
  const [Ix, Iy, Iz] = I
  const { twoT, h2 } = invariants(I, w)
  const candidates = []
  let best = Math.abs(w[2])
  let branch = null
  if (twoT <= 0) return { twoT, h2, candidates, branch, max: 0 }
  for (const [Ia, tag, name] of [
    [Iy, 'wx=0', 'a=0'],
    [Ix, 'wy=0', 'b=0'],
  ]) {
    // Ia: inertia of the component that stays non-zero at the peak
    const den = Iz * (Iz - Ia)
    if (Math.abs(den) < 1e-300) continue
    const c = (h2 - twoT * Ia) / den
    const other = (twoT - Iz * c) / Ia
    const feasible = c >= -1e-15 && other >= -1e-12
    candidates.push({ tag, name, c, other, feasible })
    if (feasible) {
      const root = Math.sqrt(Math.max(0, c))
      if (root > best || (root === best && branch === null)) {
        best = root
        branch = name
      }
    }
  }
  return { twoT, h2, candidates, branch, max: best }
}

/** Infinite-horizon max |ω_z| on the torque-free polhode through w (rad/s). */
export function omegaZMax(I, w) {
  return feasibleBranch(I, w).max
}

/**
 * Torque-free Euler step for arbitrary principal inertia (3-state RK4). The ω arithmetic is the
 * same expression order as rigidBody.eulerDerivative with damping 0 and no torque, so for the
 * CubeSat inertia the result is bit-identical to rigidBody.rk4Step (tests/envelope.test.mjs).
 */
function derivative(I, w, out) {
  const [Ix, Iy, Iz] = I
  const wx = w[0]
  const wy = w[1]
  const wz = w[2]
  out[0] = (-0 * Ix * wx - (Iz - Iy) * wy * wz) / Ix
  out[1] = (-0 * Iy * wy - (Ix - Iz) * wz * wx) / Iy
  out[2] = (-0 * Iz * wz - (Iy - Ix) * wx * wy) / Iz
}

const k1 = new Float64Array(3)
const k2 = new Float64Array(3)
const k3 = new Float64Array(3)
const k4 = new Float64Array(3)
const st = new Float64Array(3)

export function rk4Omega(I, w, h) {
  derivative(I, w, k1)
  for (let i = 0; i < 3; i++) st[i] = w[i] + 0.5 * h * k1[i]
  derivative(I, st, k2)
  for (let i = 0; i < 3; i++) st[i] = w[i] + 0.5 * h * k2[i]
  derivative(I, st, k3)
  for (let i = 0; i < 3; i++) st[i] = w[i] + h * k3[i]
  derivative(I, st, k4)
  for (let i = 0; i < 3; i++) w[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
}

export const THRESHOLD_HORIZON_S = 20

/**
 * First time t ≥ 0 at which |ω_z(t)| > limit on the numeric RK4 trajectory with step H,
 * sampled every H up to 20 s. Returns 0 if |ω_z(0)| already exceeds the limit, and null if the
 * limit is never exceeded within the horizon.
 */
export function timeToThreshold(I, w0, limit, H, horizon = THRESHOLD_HORIZON_S) {
  const w = new Float64Array(w0)
  if (Math.abs(w[2]) > limit) return 0
  const n = Math.round(horizon / H)
  for (let k = 1; k <= n; k++) {
    rk4Omega(I, w, H)
    if (Math.abs(w[2]) > limit) return k * H
  }
  return null
}
