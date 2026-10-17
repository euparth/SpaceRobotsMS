export const CUBESAT = Object.freeze({
  designation: '12U CubeSat',
  dims: Object.freeze([0.227, 0.366, 0.24]),
  mass: 30.0,
  inertia: Object.freeze([0.479, 0.273, 0.464]),
})

const THREAD_DIAMETER = 1.0e-3

export const NET = Object.freeze({
  material: 'Kevlar 49',
  size: 2.0,
  grid: 12,
  youngsModulus: 120e9,
  density: 1440,
  friction: 0.2,
  approachSpeed: 10.0,
  threadDiameter: THREAD_DIAMETER,
  threadArea: Math.PI * (THREAD_DIAMETER / 2) ** 2,
  cornerMass: 0.1,
  wovenEfficiency: 0.002,
  standoff: 3.0,
  stowedHalfWidth: 0.12,
  deploymentRate: 26,
  drawstringStiffness: 90,
  drawstringDamping: 9,
})

export const CAPTURE = Object.freeze({
  wzLimit: 3.0,
  decisionWindow: 0.25,
  closureDuration: 0.35,
  restraintTimeConstant: 1.6,
  contactMargin: 0.008,
  missTimeout: 1.2,
})

export const STRAIN_BANDS = Object.freeze({ elastic: 0.05, yield: 0.15 })

export const SOLVER = Object.freeze({
  substep: 1 / 3000,
  publishHz: 60,
  maxSubsteps: 120,
  defaultTimeScale: 0.2,
})

export const MAX_RATE = 5.0

export const PRESETS = Object.freeze([
  { id: 'S1', name: 'Cooperative', w: [0, 0, 0], note: 'Inert target, zero body rates' },
  { id: 'S2', name: 'Stable tumble', w: [1.5, 1.0, 0.5], note: 'Polhode about the minor axis' },
  { id: 'S3', name: 'High-spin Z', w: [0, 0, 4.2], note: 'Pure intermediate-axis spin' },
  { id: 'S4', name: 'Coupled tumble', w: [3.0, 3.0, 2.5], note: 'Latent |ωz| growth along the polhode' },
])
