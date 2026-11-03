/**
 * Closed-form infinite-horizon bound on |ω_z|. Since release 1.0 the derivation lives in
 * src/physics/envelope.js (single source for worker, HUD, scripts and tests); this module keeps
 * the research-script signature. Same arithmetic, same return shape.
 */
import { feasibleBranch } from '../../src/physics/envelope.js'

export function closedFormMaxWz(Ix, Iy, Iz, wx, wy, wz) {
  const r = feasibleBranch([Ix, Iy, Iz], [wx, wy, wz])
  return { max: r.max, candidates: r.candidates, branch: r.branch }
}
