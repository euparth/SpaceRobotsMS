/**
 * Spin priors for capture-label generation. `uniform-box` is the historical default and
 * delegates to sampleOmega() in physicsLib.mjs so the default dataset is unchanged.
 */
import { sampleOmega, MAX_RATE } from './physicsLib.mjs'

export const PRIORS = ['uniform-box', 'log-uniform-mag', 'slow', 'moderate']

/** Isotropic unit vector: cos(theta) uniform on [-1,1], phi uniform on [0,2pi). Consumes 2 rng draws. */
function isotropic(rng) {
  const cosT = 2 * rng() - 1
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
  const phi = 2 * Math.PI * rng()
  return [sinT * Math.cos(phi), sinT * Math.sin(phi), cosT]
}

export function samplePrior(rng, prior = 'uniform-box') {
  switch (prior) {
    case 'uniform-box':
      return sampleOmega(rng, MAX_RATE)
    case 'log-uniform-mag': {
      const lo = Math.log(0.05)
      const hi = Math.log(5)
      const mag = Math.exp(lo + (hi - lo) * rng())
      return isotropic(rng).map((c) => c * mag)
    }
    case 'slow': {
      const mag = rng() * 1
      return isotropic(rng).map((c) => c * mag)
    }
    case 'moderate': {
      const mag = 1 + 2 * rng()
      return isotropic(rng).map((c) => c * mag)
    }
    default:
      throw new Error(`unknown prior "${prior}"; expected one of ${PRIORS.join(', ')}`)
  }
}
