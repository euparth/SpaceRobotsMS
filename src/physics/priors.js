/**
 * Spin priors and the seeded RNG, shared by the dataset generator (scripts/surrogate/*.mjs), the
 * in-browser Monte Carlo and the tests. Moved here unchanged from scripts/surrogate/physicsLib.mjs
 * and priors.mjs for release 1.0; `uniform-box` with mulberry32 is the historical default and
 * reproduces scripts/surrogate/data/capture.json byte for byte (see tests/montecarlo.test.mjs).
 */
import { MAX_RATE } from './constants.js'

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

export const PRIORS = ['uniform-box', 'log-uniform-mag', 'slow', 'moderate']

export const PRIOR_DESCRIPTION = Object.freeze({
  'uniform-box': 'each component uniform on [0, 5) rad/s, positive octant (dataset default)',
  'log-uniform-mag': '|ω| log-uniform on [0.05, 5] rad/s, isotropic direction',
  slow: '|ω| uniform on [0, 1] rad/s, isotropic direction',
  moderate: '|ω| uniform on [1, 3] rad/s, isotropic direction',
  custom: '|ω| uniform on [min, max] rad/s, isotropic direction',
})

/** Isotropic unit vector: cos(theta) uniform on [-1,1], phi uniform on [0,2pi). Consumes 2 rng draws. */
function isotropic(rng) {
  const cosT = 2 * rng() - 1
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
  const phi = 2 * Math.PI * rng()
  return [sinT * Math.cos(phi), sinT * Math.sin(phi), cosT]
}

/**
 * @param rng    mulberry32 generator
 * @param prior  one of PRIORS, or { kind: 'custom', min, max } for an isotropic |ω| uniform on [min, max]
 */
export function samplePrior(rng, prior = 'uniform-box') {
  if (prior && typeof prior === 'object') {
    if (prior.kind !== 'custom') throw new Error(`unknown prior object "${prior.kind}"`)
    const min = Number(prior.min)
    const max = Number(prior.max)
    if (!(min >= 0 && max >= min)) throw new Error('custom prior needs 0 <= min <= max')
    const mag = min + (max - min) * rng()
    return isotropic(rng).map((c) => c * mag)
  }
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

/**
 * The 8-way chunking used by scripts/surrogate/genData.mjs spawnPool() (CORES capped at 8 on the
 * reference machine): per = ceil(total / 8); chunk c covers [c·per, c·per + count) with its own
 * mulberry32(baseSeed + c·9973). The browser Monte Carlo uses this exact split regardless of the
 * local core count so that seed 777001, N = 1200, uniform-box reproduces capture.json.
 */
export const DATASET_CHUNKS = 8
export const CHUNK_SEED_STRIDE = 9973

export function planChunks(total, baseSeed, chunks = DATASET_CHUNKS) {
  const per = Math.ceil(total / chunks)
  const jobs = []
  for (let c = 0; c < chunks; c++) {
    const offset = c * per
    const count = Math.min(per, total - offset)
    if (count <= 0) break
    jobs.push({ chunk: c, seed: baseSeed + c * CHUNK_SEED_STRIDE, count, offset })
  }
  return jobs
}
