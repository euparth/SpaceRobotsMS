/**
 * Closed-form infinite-horizon bound on |ω_z| for torque-free motion.
 *
 * Invariants:  2T = Ix wx² + Iy wy² + Iz wz²        (energy ellipsoid)
 *              H² = Ix² wx² + Iy² wy² + Iz² wz²     (momentum sphere)
 * With a = wx², b = wy², c = wz² ≥ 0 these are two linear equations in (a, b, c).
 * Maximising c over the feasible set {a ≥ 0, b ≥ 0} is a 1-D linear programme whose
 * optimum lies on a boundary: either a = 0 or b = 0.
 *   a = 0:  c = (H² − 2T·Iy) / (Iz (Iz − Iy)),  b = (2T − Iz c) / Iy  must be ≥ 0
 *   b = 0:  c = (H² − 2T·Ix) / (Iz (Iz − Ix)),  a = (2T − Iz c) / Ix  must be ≥ 0
 * Only candidates with c ≥ 0 and the remaining component ≥ 0 lie on the polhode.
 * The bound is max(|wz0|, sqrt(c*)) over feasible candidates.
 * Implemented independently of rigidBody.polhodeEnvelope(); the two are compared in tests.
 */
export function closedFormMaxWz(Ix, Iy, Iz, wx, wy, wz) {
  const twoT = Ix * wx * wx + Iy * wy * wy + Iz * wz * wz
  const h2 = (Ix * wx) ** 2 + (Iy * wy) ** 2 + (Iz * wz) ** 2
  let best = Math.abs(wz)
  if (twoT <= 0) return { max: 0, candidates: [] }
  const candidates = []
  for (const [Ia, Ib, tag] of [
    [Iy, Ix, 'wx=0'],
    [Ix, Iy, 'wy=0'],
  ]) {
    // Ia: inertia of the component that stays non-zero; Ib: component set to zero
    const den = Iz * (Iz - Ia)
    if (Math.abs(den) < 1e-300) continue
    const c = (h2 - twoT * Ia) / den
    const other = (twoT - Iz * c) / Ia
    const feasible = c >= -1e-15 && other >= -1e-12
    candidates.push({ tag, c, other, feasible })
    if (feasible) best = Math.max(best, Math.sqrt(Math.max(0, c)))
  }
  return { max: best, candidates }
}
