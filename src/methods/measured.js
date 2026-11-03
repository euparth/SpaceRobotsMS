/**
 * Measured values quoted on the /methods page. Every entry names the report and the raw file it
 * was read from; nothing here is computed at render time. tests/methods.test.mjs recomputes the
 * entries that are cheap enough to recompute (closed-form envelope, uniform-box inertia, S5) and
 * asserts they still match.
 *
 * Sources:
 *   V = reports/validation_2026-11.md   (commit 0da6f69, 2026-11-03, Apple M1, Node v18.20.8)
 *   R = reports/research_2026-11.md     (branch research/nov-2026, same machine and day)
 *   REL = reports/release_1.0.md        (this release)
 */

export const MACHINE = Object.freeze({
  cpu: 'Apple M1, 8 cores, 8.0 GB',
  os: 'macOS 27.0.1 (26A434), darwin arm64',
  node: 'v18.20.8',
  npm: '10.8.2',
  date: '2026-11-03 (IST)',
})

// V Task A
export const INERTIA_BOX = Object.freeze({
  ix: 0.47889000000000004,
  iy: 0.2728225,
  iz: 0.4637125,
  delta: Object.freeze([0.00011, 0.0001775, 0.0002875]),
})

// R Phase 1a — 50 seeded spins, 30,000 steps at H
export const DRIFT = Object.freeze({
  hMax: 2.3215137374052146e-14,
  hMedian: 6.7332657660996924e-15,
  tMax: 4.5516287415555136e-14,
  tMedian: 1.4015808879954622e-14,
  spins: 50,
  seed: 20261103,
  raw: 'reports/raw/research/phase1_integrator.txt',
})

// R Phase 1b — coarse sweep vs H/8 reference
export const CONVERGENCE = Object.freeze([
  { step: '15 H (0.005 s)', e030: 2.18742905519124e-10, e055: 3.607873258249057e-10, order030: null, order055: null },
  { step: '30 H (0.01 s)', e030: 3.5031686307520833e-9, e055: 5.7752240147324e-9, order030: 4.0014, order055: 4.0007 },
  { step: '75 H (0.025 s)', e030: 1.3720746505305003e-7, e055: 2.2584592378888001e-7, order030: 4.0029, order055: 4.0012 },
  { step: '150 H (0.05 s)', e030: 2.204879714230919e-6, e055: 3.6200559812965396e-6, order030: 4.0063, order055: 4.0026 },
])
export const CONVERGENCE_FINE = Object.freeze([
  { step: 'H', e030: 6.358079669841418e-14, e055: 1.0627682028332764e-13 },
  { step: 'H/2', e030: 5.837197499550496e-14, e055: 1.0442236284636273e-13 },
  { step: 'H/4', e030: 8.233873835987336e-14, e055: 1.209423784477881e-13 },
])

// R Phase 1c — closed form vs 20 s numeric peak, 1,200 rows
export const CLOSED_FORM = Object.freeze({
  maxNumericOverBound: 4.3520742565306136e-14,
  maxBoundOverNumeric: 1.5609692294304978e-7,
  rowsOver1e3: 0,
  p50: 2.598e-10,
  p90: 3.499e-9,
  p99: 4.186e-8,
  peakTimeP50S: 9.3255,
  ruleSecure: 731,
  boundOver3: 809,
  physicsLimited: 340,
  windowLimited: 99,
  raw: 'reports/raw/research/phase1_integrator.txt',
})

// V Task B — single-axis sweep, net fired at t = 0 (one-way); also R 3d two-way columns
export const SINGLE_AXIS = Object.freeze([
  { axis: 'x', w: 0.1, verdict: 'capture', peakWz: 0.0, tContact: 0.287333, maxStrain: 0.052727, twoWayPeak: 0.001349 },
  { axis: 'x', w: 0.5, verdict: 'capture', peakWz: 0.0, tContact: 0.286, maxStrain: 0.049661, twoWayPeak: 0.001318 },
  { axis: 'x', w: 1.0, verdict: 'capture', peakWz: 0.0, tContact: 0.284333, maxStrain: 0.045917, twoWayPeak: 0.000772 },
  { axis: 'x', w: 1.5, verdict: 'capture', peakWz: 0.0, tContact: 0.282, maxStrain: 0.041696, twoWayPeak: 0.000629 },
  { axis: 'x', w: 2.0, verdict: 'capture', peakWz: 0.0, tContact: 0.279333, maxStrain: 0.036925, twoWayPeak: 0.001138 },
  { axis: 'x', w: 2.5, verdict: 'capture', peakWz: 0.0, tContact: 0.281333, maxStrain: 0.040303, twoWayPeak: 0.000886 },
  { axis: 'x', w: 3.0, verdict: 'capture', peakWz: 0.0, tContact: 0.282667, maxStrain: 0.042985, twoWayPeak: 0.000824 },
  { axis: 'x', w: 3.5, verdict: 'capture', peakWz: 0.0, tContact: 0.283333, maxStrain: 0.043767, twoWayPeak: 0.001254 },
  { axis: 'x', w: 4.0, verdict: 'capture', peakWz: 0.0, tContact: 0.283333, maxStrain: 0.04384, twoWayPeak: 0.001143 },
  { axis: 'x', w: 4.5, verdict: 'capture', peakWz: 0.0, tContact: 0.283, maxStrain: 0.044219, twoWayPeak: 0.001486 },
  { axis: 'x', w: 5.0, verdict: 'capture', peakWz: 0.0, tContact: 0.279333, maxStrain: 0.034303, twoWayPeak: 0.00173 },
  { axis: 'y', w: 0.1, verdict: 'capture', peakWz: 0.0, tContact: 0.287333, maxStrain: 0.052707, twoWayPeak: 0.001288 },
  { axis: 'y', w: 0.5, verdict: 'capture', peakWz: 0.0, tContact: 0.286, maxStrain: 0.050082, twoWayPeak: 0.001074 },
  { axis: 'y', w: 1.0, verdict: 'capture', peakWz: 0.0, tContact: 0.288333, maxStrain: 0.055187, twoWayPeak: 0.001212 },
  { axis: 'y', w: 1.5, verdict: 'capture', peakWz: 0.0, tContact: 0.290333, maxStrain: 0.058824, twoWayPeak: 0.000673 },
  { axis: 'y', w: 2.0, verdict: 'capture', peakWz: 0.0, tContact: 0.290667, maxStrain: 0.059264, twoWayPeak: 0.007488 },
  { axis: 'y', w: 2.5, verdict: 'capture', peakWz: 0.0, tContact: 0.291, maxStrain: 0.060019, twoWayPeak: 0.002513 },
  { axis: 'y', w: 3.0, verdict: 'capture', peakWz: 0.0, tContact: 0.291, maxStrain: 0.060319, twoWayPeak: 0.00236 },
  { axis: 'y', w: 3.5, verdict: 'capture', peakWz: 0.0, tContact: 0.290667, maxStrain: 0.060029, twoWayPeak: 0.002364 },
  { axis: 'y', w: 4.0, verdict: 'capture', peakWz: 0.0, tContact: 0.289333, maxStrain: 0.057422, twoWayPeak: 0.00137 },
  { axis: 'y', w: 4.5, verdict: 'capture', peakWz: 0.0, tContact: 0.286, maxStrain: 0.050783, twoWayPeak: 0.000897 },
  { axis: 'y', w: 5.0, verdict: 'capture', peakWz: 0.0, tContact: 0.286667, maxStrain: 0.051161, twoWayPeak: 0.001359 },
  { axis: 'z', w: 0.1, verdict: 'capture', peakWz: 0.1, tContact: 0.287667, maxStrain: 0.053476, twoWayPeak: 0.100471 },
  { axis: 'z', w: 0.5, verdict: 'capture', peakWz: 0.5, tContact: 0.287667, maxStrain: 0.053469, twoWayPeak: 0.5 },
  { axis: 'z', w: 1.0, verdict: 'capture', peakWz: 1.0, tContact: 0.287667, maxStrain: 0.053464, twoWayPeak: 1.0 },
  { axis: 'z', w: 1.5, verdict: 'capture', peakWz: 1.5, tContact: 0.287667, maxStrain: 0.053436, twoWayPeak: 1.501694 },
  { axis: 'z', w: 2.0, verdict: 'capture', peakWz: 2.0, tContact: 0.287667, maxStrain: 0.053243, twoWayPeak: 2.000154 },
  { axis: 'z', w: 2.5, verdict: 'capture', peakWz: 2.5, tContact: 0.287667, maxStrain: 0.053137, twoWayPeak: 2.5 },
  { axis: 'z', w: 3.0, verdict: 'capture', peakWz: 3.0, tContact: 0.287667, maxStrain: 0.053118, twoWayPeak: 3.0 },
  { axis: 'z', w: 3.5, verdict: 'eject', peakWz: 3.5, tContact: 0.287667, maxStrain: 0.05318, twoWayPeak: 3.5 },
  { axis: 'z', w: 4.0, verdict: 'eject', peakWz: 4.0, tContact: 0.287667, maxStrain: 0.053301, twoWayPeak: 4.0 },
  { axis: 'z', w: 4.5, verdict: 'eject', peakWz: 4.5, tContact: 0.287667, maxStrain: 0.053463, twoWayPeak: 4.5 },
  { axis: 'z', w: 5.0, verdict: 'eject', peakWz: 5.0, tContact: 0.287667, maxStrain: 0.05346, twoWayPeak: 5.0 },
])

// R Phase 3c — momentum budget, 20 spins, seed 20261103
export const TWO_WAY = Object.freeze({
  budget: Object.freeze([
    { mode: 'One-way kinematics (reactions accumulated, not applied)', dP: 5.394, pBefore: 4.5429, dL: 2.5906e-2, lBefore: 3.2448 },
    { mode: 'Two-way, drawstring on (production schedule)', dP: 4.8836, pBefore: 4.5429, dL: 1.6788e-2, lBefore: 3.2448 },
    { mode: 'Two-way, drawstring off', dP: 2.5312e-12, pBefore: 4.5429, dL: 3.2121e-2, lBefore: 3.2448 },
  ]),
  angMomAttribution: Object.freeze({ distanceConstraints: 3.04e-2, contactAndReaction: 3.741e-3, spin: 291 }),
  verdictChanges: 3,
  changedRows: Object.freeze([
    { i: 123, oneWay: 3.0038859295893525, twoWay: 2.945173176665561 },
    { i: 346, oneWay: 3.000224924169298, twoWay: 2.947591051152266 },
    { i: 387, oneWay: 3.0235383323169667, twoWay: 2.9669069124331147 },
  ]),
  maxDeltaPeak: 0.07113009817699822,
  meanDeltaPeak: 0.019616713742854345,
  agreeWithLabel: Object.freeze({ oneWay: 1191, twoWay: 1188 }),
  sweepVerdictChanges: 0,
  unstableRuns: 0,
  raw: 'reports/raw/research/phase3_twoway.txt',
})

// V Task D and R Phase 3e timing (same machine)
export const TIMING = Object.freeze({
  spins: 20,
  seed: 20261103,
  rows: Object.freeze([
    { source: 'V Task D', pass: 1, path: 'Coupled one-way (coupledImpact)', mean: 7.3091, median: 6.8949, min: 6.6234, max: 15.032 },
    { source: 'V Task D', pass: 1, path: 'PINN (runSurrogateInference)', mean: 0.4502, median: 0.4294, min: 0.3982, max: 0.6056 },
    { source: 'V Task D', pass: 2, path: 'Coupled one-way (coupledImpact)', mean: 6.7118, median: 6.6696, min: 6.449, max: 7.0991 },
    { source: 'V Task D', pass: 2, path: 'PINN (runSurrogateInference)', mean: 0.403, median: 0.3915, min: 0.3777, max: 0.4971 },
    { source: 'R 3e', pass: 1, path: 'one-way', mean: 7.5431, median: 7.2492, min: 6.8045, max: 10.7657 },
    { source: 'R 3e', pass: 1, path: 'two-way', mean: 7.5817, median: 7.5543, min: 7.1167, max: 8.9282 },
    { source: 'R 3e', pass: 2, path: 'one-way', mean: 7.4256, median: 7.3877, min: 6.8998, max: 8.4509 },
    { source: 'R 3e', pass: 2, path: 'two-way', mean: 7.6761, median: 7.6166, min: 7.0056, max: 8.6938 },
  ]),
  ratios: Object.freeze([
    { pass: 1, meanRatio: 16.237, medianRatio: 16.058 },
    { pass: 2, meanRatio: 16.653, medianRatio: 17.036 },
  ]),
  checkLatencyMs: 0.375,
  metricsCoupledEstimateMs: 17,
})

// R Phase 2c — four priors, 1,200 rows each
export const PRIOR_TABLE = Object.freeze([
  { prior: 'uniform-box', n: 1200, ruleSecure: 731, falseSecure: 245, pctRuleSecure: 33.5157, falseEject: 4, physicsLimited: 340, physicsSecure: 490, mag: '4.818759 / 0.488718 / 8.224481', pinnAgree: 1134, pinnAgreePct: 94.5, pinnRule: 915, pinnFalseSecure: 11, pinnFalseEject: 55 },
  { prior: 'log-uniform-mag', n: 1200, ruleSecure: 1165, falseSecure: 7, pctRuleSecure: 0.6009, falseEject: 4, physicsLimited: 26, physicsSecure: 1162, mag: '1.139777 / 0.050020 / 4.959560', pinnAgree: 1177, pinnAgreePct: 98.0833, pinnRule: 1180, pinnFalseSecure: 12, pinnFalseEject: 11 },
  { prior: 'slow', n: 1200, ruleSecure: 1200, falseSecure: 0, pctRuleSecure: 0, falseEject: 0, physicsLimited: 0, physicsSecure: 1200, mag: '0.509823 / 0.000085 / 0.998237', pinnAgree: 1200, pinnAgreePct: 100, pinnRule: 1200, pinnFalseSecure: 0, pinnFalseEject: 0 },
  { prior: 'moderate', n: 1200, ruleSecure: 1200, falseSecure: 0, pctRuleSecure: 0, falseEject: 0, physicsLimited: 0, physicsSecure: 1200, mag: '2.019646 / 1.000170 / 2.996473', pinnAgree: 1188, pinnAgreePct: 99, pinnRule: 1188, pinnFalseSecure: 0, pinnFalseEject: 12 },
])

// V Task C
export const MISCLASS = Object.freeze({
  ruleSecure: 731,
  ruleEject: 469,
  physicsSecure: 490,
  physicsEject: 710,
  falseSecure: 245,
  falseEject: 4,
  disagreements: 249,
  disagreementPct: 20.75,
  falseSecurePctOfRuleSecure: 33.515731874145004,
  histogram: Object.freeze([
    ['[3.0, 3.5)', 5],
    ['[3.5, 4.0)', 13],
    ['[4.0, 4.5)', 22],
    ['[4.5, 5.0)', 39],
    ['[5.0, 5.5)', 43],
    ['[5.5, 6.0)', 62],
    ['[6.0, 6.5)', 42],
    ['[6.5, 7.0)', 15],
    ['[7.0, 7.5)', 4],
  ]),
  coupledFalseSecure: 239,
  coupledFalseEject: 3,
  coupledAgree: 1191,
  raw: 'reports/raw/taskC_misclass.txt',
})

// V Task F — dataset hashes (8 worker threads)
export const DATASET_HASHES = Object.freeze([
  { file: 'trajectories.bin', bytes: 10819200, sha256: 'b794288469521126068c8311254ee438831257db058710147727b4425693e1d1' },
  { file: 'trajectories.meta.json', bytes: 102, sha256: '52156b234d541aa3eb9b3d26588d3b50659ba7062980f3c899a48f09596cb841' },
  { file: 'strain.json', bytes: 739674, sha256: '4375a5f65e210e465e23c5edbcab6bd1d71ffdfc0cfba85cb8190c7c91212fc7' },
  { file: 'capture.json', bytes: 310012, sha256: '0734478b6f55eabbd65ef2df5316940d42cbba05824156386165368fda6503c5' },
  { file: 'audit.json', bytes: 1065, sha256: '50988afa017e35c4c5deb8b577098cb8de35df9e21af50b405d7bf8d66eba6cd' },
  { file: 'summary.json', bytes: 1348, sha256: 'a01e8cded2a794b3acb6a0f08d83d5f2161dc079f99a7a0b463ebeeb3c5991e8' },
])
export const WEIGHTS_SHA256 = '74ef6b184399d9f24c60759652a82219b83caadc6521ddbcf4db50709cdf0321'
export const PRIOR_HASHES = Object.freeze([
  { prior: 'log-uniform-mag', sha256: 'b71f48fbeba3107c2fb502cec94b9d322a74a8ba456facb49f3f535527b0711b' },
  { prior: 'slow', sha256: '766eee0cecc6d9db801ff3cbb702cd59c6526864889eb9c9555b21c8e48b2754' },
  { prior: 'moderate', sha256: '5fb56177f459c966ff31dff8da4786a448ef26415720516e3fc3d00ff6fd536e' },
])

// R Phase 4 presets table + REL Phase 2 S5
export const PRESET_TABLE = Object.freeze([
  { id: 'S1', w: [0, 0, 0], envMax: 0.0, predict: 'SECURE', windowPeak: 0.0, coupledPeak: 0.0, coupledVerdict: 'capture', maxStrain: 0.053478, firstSecureMs: 0, captureProb: 100.0 },
  { id: 'S2', w: [1.5, 1.0, 0.5], envMax: 1.659865, predict: 'SECURE', windowPeak: 0.845196, coupledPeak: 0.833099, coupledVerdict: 'capture', maxStrain: 0.035388, firstSecureMs: 0, captureProb: 100.0 },
  { id: 'S3', w: [0, 0, 4.2], envMax: 4.2, predict: 'EJECT', windowPeak: 4.2, coupledPeak: 4.2, coupledVerdict: 'eject', maxStrain: 0.053462, firstSecureMs: null, captureProb: 0.0 },
  { id: 'S4', w: [3.0, 3.0, 2.5], envMax: 4.033684, predict: 'PHASE_DEPENDENT', windowPeak: 3.924574, coupledPeak: 3.908242, coupledVerdict: 'eject', maxStrain: 0.049033, firstSecureMs: 1080, captureProb: 32.0988 },
  { id: 'S5', w: [2.09, 1.0, 2.0], envMax: 2.9771537468964078, predict: 'SECURE', windowPeak: 2.4276012357102745, coupledPeak: 2.4176005711025916, coupledVerdict: 'capture', maxStrain: 0.04531678694288943, firstSecureMs: 0, captureProb: null },
])

// src/surrogate/metrics.json (committed; trainedAt 2026-10-19)
export const PINN_METRICS = Object.freeze({
  captureAccuracy: 0.9466666666666667,
  naiveAccuracy: 0.8383333333333334,
  optimalDelayMaeMs: 703.52,
  strainR2: -0.04850946819284463,
  nTestCapture: 600,
  nTestPinn: 500,
  latencyMs: 0.36225471993287406,
  weightsBytes: 124846,
})
