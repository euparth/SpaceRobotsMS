import { CAPTURE, CUBESAT } from './constants.js'

export const [IX, IY, IZ] = CUBESAT.inertia

/**
 * State y = [ωx, ωy, ωz, q0, q1, q2, q3] with q the scalar-first body→LVLH quaternion.
 * Net restraint is modelled as a viscous torque τ = −c·I·ω (c = 0 when torque-free).
 * `torque` (optional, body frame, N·m) is an external torque held constant over the step;
 * when null the arithmetic is identical to the torque-free form.
 */
export function eulerDerivative(y, damping, out, torque = null) {
  const wx = y[0]
  const wy = y[1]
  const wz = y[2]
  const q0 = y[3]
  const q1 = y[4]
  const q2 = y[5]
  const q3 = y[6]
  let tx = -damping * IX * wx
  let ty = -damping * IY * wy
  let tz = -damping * IZ * wz
  if (torque) {
    tx += torque[0]
    ty += torque[1]
    tz += torque[2]
  }
  out[0] = (tx - (IZ - IY) * wy * wz) / IX
  out[1] = (ty - (IX - IZ) * wz * wx) / IY
  out[2] = (tz - (IY - IX) * wx * wy) / IZ
  out[3] = 0.5 * (-q1 * wx - q2 * wy - q3 * wz)
  out[4] = 0.5 * (q0 * wx + q2 * wz - q3 * wy)
  out[5] = 0.5 * (q0 * wy + q3 * wx - q1 * wz)
  out[6] = 0.5 * (q0 * wz + q1 * wy - q2 * wx)
}

const k1 = new Float64Array(7)
const k2 = new Float64Array(7)
const k3 = new Float64Array(7)
const k4 = new Float64Array(7)
const stage = new Float64Array(7)

export function rk4Step(y, h, damping = 0, torque = null) {
  eulerDerivative(y, damping, k1, torque)
  for (let i = 0; i < 7; i++) stage[i] = y[i] + 0.5 * h * k1[i]
  eulerDerivative(stage, damping, k2, torque)
  for (let i = 0; i < 7; i++) stage[i] = y[i] + 0.5 * h * k2[i]
  eulerDerivative(stage, damping, k3, torque)
  for (let i = 0; i < 7; i++) stage[i] = y[i] + h * k3[i]
  eulerDerivative(stage, damping, k4, torque)
  for (let i = 0; i < 7; i++) y[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
  const n = Math.hypot(y[3], y[4], y[5], y[6])
  y[3] /= n
  y[4] /= n
  y[5] /= n
  y[6] /= n
}

/** Row-major rotation matrix R such that v_lvlh = R · v_body. */
export function quatToMatrix(q0, q1, q2, q3, m) {
  m[0] = 1 - 2 * (q2 * q2 + q3 * q3)
  m[1] = 2 * (q1 * q2 - q0 * q3)
  m[2] = 2 * (q1 * q3 + q0 * q2)
  m[3] = 2 * (q1 * q2 + q0 * q3)
  m[4] = 1 - 2 * (q1 * q1 + q3 * q3)
  m[5] = 2 * (q2 * q3 - q0 * q1)
  m[6] = 2 * (q1 * q3 - q0 * q2)
  m[7] = 2 * (q2 * q3 + q0 * q1)
  m[8] = 1 - 2 * (q1 * q1 + q2 * q2)
  return m
}

export const kineticEnergy = (wx, wy, wz) => 0.5 * (IX * wx * wx + IY * wy * wy + IZ * wz * wz)

/** Angle between the body Z axis and the angular momentum vector, in radians. */
export function nutationAngle(wx, wy, wz) {
  const hx = IX * wx
  const hy = IY * wy
  const hz = IZ * wz
  const h = Math.hypot(hx, hy, hz)
  if (h < 1e-12) return 0
  return Math.acos(Math.min(1, Math.max(-1, hz / h)))
}

/**
 * Bounds of |ωz| on the torque-free polhode through ω, found from the intersection of the
 * energy ellipsoid (2T) and the momentum sphere (H²). Z is the intermediate axis, so every
 * non-equilibrium polhode passes through ωz = 0 and the peak sits where ωx or ωy vanishes.
 */
export function polhodeEnvelope(wx, wy, wz) {
  const twoT = IX * wx * wx + IY * wy * wy + IZ * wz * wz
  const h2 = (IX * wx) ** 2 + (IY * wy) ** 2 + (IZ * wz) ** 2
  const current = Math.abs(wz)
  if (twoT < 1e-12) return { peak: 0, floor: 0, constant: true }
  if (Math.hypot(wx, wy) < 1e-9) return { peak: current, floor: current, constant: true }
  let peak = current
  for (const Ia of [IX, IY]) {
    const s = (h2 - Ia * twoT) / (IZ * (IZ - Ia))
    const u = (twoT - IZ * s) / Ia
    if (s >= 0 && u >= -1e-12) peak = Math.max(peak, Math.sqrt(s))
  }
  return { peak, floor: 0, constant: false }
}

export function predictOutcome(w, limit = CAPTURE.wzLimit) {
  const envelope = polhodeEnvelope(w[0], w[1], w[2])
  if (envelope.peak <= limit) return { verdict: 'SECURE', ...envelope }
  if (envelope.constant) return { verdict: 'EJECT', ...envelope }
  return { verdict: 'PHASE_DEPENDENT', ...envelope }
}

export function principalAxes() {
  const axes = [
    { axis: 'x', I: IX },
    { axis: 'y', I: IY },
    { axis: 'z', I: IZ },
  ]
  const roles = ['major', 'intermediate', 'minor']
  ;[...axes]
    .sort((a, b) => b.I - a.I)
    .forEach((a, i) => {
      a.role = roles[i]
      a.stable = roles[i] !== 'intermediate'
    })
  return axes
}
