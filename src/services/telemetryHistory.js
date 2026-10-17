export const HISTORY_KEYS = Object.freeze([
  't',
  'ke',
  'eNet',
  'eAbs',
  'nutation',
  'wx',
  'wy',
  'wz',
  'hMag',
  'strainMax',
  'q0',
  'q1',
  'q2',
  'q3',
])

/** Fixed-capacity columnar ring buffer read directly by the canvas charts. */
export class TelemetryHistory {
  constructor(capacity = 3600) {
    this.capacity = capacity
    this.series = {}
    for (const key of HISTORY_KEYS) this.series[key] = new Float64Array(capacity)
    this.head = 0
    this.count = 0
    this.version = 0
  }

  push(s) {
    if (this.count > 0) {
      const lastT = this.latest('t')
      if (s.t === lastT) return
      if (s.t < lastT) this.clear()
    }
    const i = this.head
    const d = this.series
    d.t[i] = s.t
    d.ke[i] = s.ke
    d.eNet[i] = s.eNet
    d.eAbs[i] = s.eAbs
    d.nutation[i] = s.nutation
    d.wx[i] = s.w[0]
    d.wy[i] = s.w[1]
    d.wz[i] = s.w[2]
    d.hMag[i] = s.hMag
    d.strainMax[i] = s.strainMax
    d.q0[i] = s.q[0]
    d.q1[i] = s.q[1]
    d.q2[i] = s.q[2]
    d.q3[i] = s.q[3]
    this.head = (i + 1) % this.capacity
    this.count = Math.min(this.count + 1, this.capacity)
    this.version++
  }

  clear() {
    this.head = 0
    this.count = 0
    this.version++
  }

  index(k) {
    return (this.head - this.count + k + this.capacity) % this.capacity
  }

  get(key, k) {
    return this.series[key][this.index(k)]
  }

  latest(key) {
    return this.count ? this.series[key][(this.head - 1 + this.capacity) % this.capacity] : NaN
  }
}
