/**
 * Momentum budget of body + net, shared by scripts/research/phase3_twoway.mjs (via physicsLib) and
 * the physics worker. World frame; angular momentum about the world origin (the body starts there).
 *
 *   P_body = m v,              L_body = R (I ω) + p × P_body
 *   P_net  = Σ m_k v_k,        L_net  = Σ x_k × m_k v_k
 *
 * With one-way coupling the body is an infinite-mass wall and the drawstring is an external
 * spring, so neither total is conserved; two-way coupling with the drawstring off closes ΔP_total
 * to round-off (2.5e-12 N·s measured) and leaves an angular-momentum residual of ~1 % of |L|
 * from sequential XPBD projection (research_2026-11 §3c).
 */
import { CUBESAT } from './constants.js'
import { IX, IY, IZ } from './rigidBody.js'

/**
 * @param includePending  when true, the reaction impulse the net accumulated in its last step but
 *                        the body has not yet received (one-substep lag) is credited to the body,
 *                        so a live readout taken between net.step() and the next body step is not
 *                        short by one substep's impulse. The scripts apply the trailing reaction
 *                        explicitly and call this with the default (false).
 */
export function momentumBudget(y, body, net, includePending = false) {
  const R = body.R
  const hx = IX * y[0]
  const hy = IY * y[1]
  const hz = IZ * y[2]
  const m = CUBESAT.mass
  const P = [m * body.v[0], m * body.v[1], m * body.v[2]]
  const L = [
    R[0] * hx + R[1] * hy + R[2] * hz + (body.p[1] * P[2] - body.p[2] * P[1]),
    R[3] * hx + R[4] * hy + R[5] * hz + (body.p[2] * P[0] - body.p[0] * P[2]),
    R[6] * hx + R[7] * hy + R[8] * hz + (body.p[0] * P[1] - body.p[1] * P[0]),
  ]
  if (includePending && net.twoWay) {
    const J = net.reactionImpulse
    const A = net.reactionAngImpulse // about body.p, world frame
    L[0] += A[0] + (body.p[1] * J[2] - body.p[2] * J[1])
    L[1] += A[1] + (body.p[2] * J[0] - body.p[0] * J[2])
    L[2] += A[2] + (body.p[0] * J[1] - body.p[1] * J[0])
    P[0] += J[0]
    P[1] += J[1]
    P[2] += J[2]
  }
  const Pn = [0, 0, 0]
  const Ln = [0, 0, 0]
  for (let n = 0; n < net.invMass.length; n++) {
    const mk = 1 / net.invMass[n]
    const k = n * 3
    const x = net.pos[k]
    const yy = net.pos[k + 1]
    const z = net.pos[k + 2]
    const vx = mk * net.vel[k]
    const vy = mk * net.vel[k + 1]
    const vz = mk * net.vel[k + 2]
    Pn[0] += vx
    Pn[1] += vy
    Pn[2] += vz
    Ln[0] += yy * vz - z * vy
    Ln[1] += z * vx - x * vz
    Ln[2] += x * vy - yy * vx
  }
  return { body: { P, L }, net: { P: Pn, L: Ln }, total: { P: P.map((v, i) => v + Pn[i]), L: L.map((v, i) => v + Ln[i]) } }
}

const norm = (a) => Math.hypot(a[0], a[1], a[2])
const diff = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/** Change of the budget between two snapshots, with the magnitudes the UI and the report quote. */
export function budgetDelta(before, after) {
  const dP = diff(after.total.P, before.total.P)
  const dL = diff(after.total.L, before.total.L)
  return {
    dPTotal: norm(dP),
    dLTotal: norm(dL),
    dPBody: norm(diff(after.body.P, before.body.P)),
    dPNet: norm(diff(after.net.P, before.net.P)),
    dLBody: norm(diff(after.body.L, before.body.L)),
    dLNet: norm(diff(after.net.L, before.net.L)),
    pBefore: norm(before.total.P),
    lBefore: norm(before.total.L),
  }
}
