import { NODE_COUNT } from './netTopology.js'

export const PHASE = Object.freeze({
  IDLE: 0,
  FLIGHT: 1,
  CONTACT: 2,
  CLOSING: 3,
  SECURED: 4,
  EJECTED: 5,
})

export const PHASE_LABEL = Object.freeze([
  'STANDBY',
  'NET IN FLIGHT',
  'CONTACT',
  'CLOSING',
  'SECURED',
  'EJECTED',
])

export const CAPTURE_STATUS = Object.freeze([
  'STANDBY',
  'APPROACH',
  'CONTACT',
  'CLOSING',
  'SECURED',
  'EJECTED',
])

export const F = Object.freeze({
  T: 0,
  Q0: 1,
  Q1: 2,
  Q2: 3,
  Q3: 4,
  WX: 5,
  WY: 6,
  WZ: 7,
  HX: 8,
  HY: 9,
  HZ: 10,
  KE: 11,
  KE0: 12,
  E_NET: 13,
  E_ABS: 14,
  NUTATION: 15,
  PX: 16,
  PY: 17,
  PZ: 18,
  VX: 19,
  VY: 20,
  VZ: 21,
  ENCLOSURE: 22,
  PEAK_WZ: 23,
  KE_DRIFT: 24,
  H_DRIFT: 25,
  STRAIN_MAX: 26,
  CONTACTS: 27,
  PHASE: 28,
  RANGE: 29,
  SOLVER_MS: 30,
  TICK_HZ: 31,
  TIME_SCALE: 32,
  PAUSED: 33,
  SUBSTEPS: 34,
  ETA: 35,
  T_LAUNCH: 36, // NaN while IDLE
  T_CONTACT: 37, // NaN before first contact
})

export const HEADER_LENGTH = 40
export const NODE_POSITION_OFFSET = HEADER_LENGTH
export const NODE_STRAIN_OFFSET = NODE_POSITION_OFFSET + NODE_COUNT * 3
export const STATE_LENGTH = NODE_STRAIN_OFFSET + NODE_COUNT
