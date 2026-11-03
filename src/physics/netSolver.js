import { CAPTURE, NET } from './constants.js'
import {
  CORNER_NODES,
  GRID,
  NODE_COUNT,
  NODE_MASS,
  REST_LENGTH,
  SEGMENTS,
  SEGMENT_COUNT,
} from './netTopology.js'

const MODE = Object.freeze({ STOWED: 0, FREE: 1, DRAPE: 2, WELDED: 3 })

/**
 * Kevlar 49 capture net as a tension-only XPBD cable lattice (12×12 knots, 264 threads).
 * Thread compliance comes from E·A of a Ø1 mm yarn scaled by the woven-mesh efficiency η,
 * which represents knot slip and crimp straightening in the low-load toe region.
 * Contact is resolved against the oriented CubeSat box with Coulomb friction (μ = 0.20).
 */
export class NetSolver {
  constructor() {
    const n3 = NODE_COUNT * 3
    this.pos = new Float64Array(n3)
    this.prev = new Float64Array(n3)
    this.vel = new Float64Array(n3)
    this.drapeLocal = new Float64Array(n3)
    this.invMass = new Float64Array(NODE_COUNT)
    this.corner = new Uint8Array(NODE_COUNT)
    this.contact = new Uint8Array(NODE_COUNT)
    this.nodeStrain = new Float32Array(NODE_COUNT)
    for (const c of CORNER_NODES) this.corner[c] = 1
    for (let n = 0; n < NODE_COUNT; n++) {
      this.invMass[n] = 1 / (NODE_MASS + (this.corner[n] ? NET.cornerMass : 0))
    }
    this.setWovenEfficiency(NET.wovenEfficiency)
    /**
     * Experimental two-way coupling (default off). When true, resolveContacts() accumulates the
     * equal-and-opposite contact impulse on the body: reactionImpulse (N·s, world frame) and
     * reactionAngImpulse (N·m·s, world frame, about body.p). Reset at the start of every step().
     */
    this.twoWay = false
    this.reactionImpulse = new Float64Array(3)
    this.reactionAngImpulse = new Float64Array(3)
    this.stow(NET.standoff)
  }

  setWovenEfficiency(eta) {
    this.wovenEfficiency = eta
    this.axialStiffness = NET.youngsModulus * NET.threadArea * eta
    this.segmentStiffness = this.axialStiffness / REST_LENGTH
    this.compliance = 1 / this.segmentStiffness
  }

  stow(standoff) {
    const half = NET.stowedHalfWidth
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const k = (j * GRID + i) * 3
        this.pos[k] = ((i / (GRID - 1)) * 2 - 1) * half
        this.pos[k + 1] = ((j / (GRID - 1)) * 2 - 1) * half
        this.pos[k + 2] = standoff + ((i + j) % 2) * 0.004
      }
    }
    this.prev.set(this.pos)
    this.vel.fill(0)
    this.contact.fill(0)
    this.nodeStrain.fill(0)
    this.mode = MODE.STOWED
    this.drawstring = false
    this.released = false
    this.contactCount = 0
    this.maxStrain = 0
    this.strainEnergy = 0
  }

  get deployed() {
    return this.mode !== MODE.STOWED
  }

  launch() {
    const rate = NET.deploymentRate
    for (let n = 0; n < NODE_COUNT; n++) {
      const k = n * 3
      this.vel[k] = this.pos[k] * rate
      this.vel[k + 1] = this.pos[k + 1] * rate
      this.vel[k + 2] = -NET.approachSpeed
    }
    this.mode = MODE.FREE
  }

  /** Conformal closure targets, built in a frame aligned with the approach direction. */
  beginDrape(body, tau) {
    const R = body.R
    const margin = CAPTURE.contactMargin * 1.5
    const ex = body.half[0] + margin
    const ey = body.half[1] + margin
    const ez = body.half[2] + margin
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const u = (i / (GRID - 1)) * 2 - 1
        const v = (j / (GRID - 1)) * 2 - 1
        const rn = Math.min(1, Math.hypot(u, v) / Math.SQRT2)
        const phi = rn * Math.PI * 0.97
        const theta = Math.atan2(v, u)
        const fx = Math.sin(phi) * Math.cos(theta)
        const fy = Math.sin(phi) * Math.sin(theta)
        const fz = Math.cos(phi)
        const bx = R[0] * fx + R[3] * fy + R[6] * fz
        const by = R[1] * fx + R[4] * fy + R[7] * fz
        const bz = R[2] * fx + R[5] * fy + R[8] * fz
        const s = 1 / Math.max(Math.abs(bx) / ex, Math.abs(by) / ey, Math.abs(bz) / ez)
        const k = (j * GRID + i) * 3
        this.drapeLocal[k] = bx * s
        this.drapeLocal[k + 1] = by * s
        this.drapeLocal[k + 2] = bz * s
      }
    }
    this.drapeTau = tau
    this.drawstring = false
    this.mode = MODE.DRAPE
  }

  weld() {
    this.mode = MODE.WELDED
    this.drawstring = false
  }

  /** Twist-out: the target slips through the weave and knots in contact are flung at the surface velocity. */
  release(body) {
    this.mode = MODE.FREE
    this.drawstring = false
    this.released = true
    const { p, w } = body
    for (let n = 0; n < NODE_COUNT; n++) {
      if (!this.contact[n]) continue
      const k = n * 3
      const rx = this.pos[k] - p[0]
      const ry = this.pos[k + 1] - p[1]
      const rz = this.pos[k + 2] - p[2]
      this.vel[k] += w[1] * rz - w[2] * ry
      this.vel[k + 1] += w[2] * rx - w[0] * rz
      this.vel[k + 2] += w[0] * ry - w[1] * rx
    }
  }

  step(h, body) {
    if (this.twoWay) {
      this.reactionImpulse.fill(0)
      this.reactionAngImpulse.fill(0)
    }
    if (this.mode === MODE.STOWED) return
    const { pos, prev, vel, invMass } = this
    const R = body.R
    const p = body.p
    const w = body.w
    const bv = body.v

    if (this.mode === MODE.WELDED) {
      for (let n = 0; n < NODE_COUNT; n++) {
        const k = n * 3
        const lx = this.drapeLocal[k]
        const ly = this.drapeLocal[k + 1]
        const lz = this.drapeLocal[k + 2]
        const rx = R[0] * lx + R[1] * ly + R[2] * lz
        const ry = R[3] * lx + R[4] * ly + R[5] * lz
        const rz = R[6] * lx + R[7] * ly + R[8] * lz
        pos[k] = p[0] + rx
        pos[k + 1] = p[1] + ry
        pos[k + 2] = p[2] + rz
        vel[k] = bv[0] + w[1] * rz - w[2] * ry
        vel[k + 1] = bv[1] + w[2] * rx - w[0] * rz
        vel[k + 2] = bv[2] + w[0] * ry - w[1] * rx
      }
      this.contactCount = NODE_COUNT
      return
    }

    const closeX = p[0]
    const closeY = p[1]
    const closeZ = p[2] - (Math.max(...body.half) + 0.12)
    const K = NET.drawstringStiffness
    const D = NET.drawstringDamping
    for (let n = 0; n < NODE_COUNT; n++) {
      const k = n * 3
      if (this.drawstring && this.corner[n]) {
        vel[k] += (K * (closeX - pos[k]) - D * vel[k]) * h
        vel[k + 1] += (K * (closeY - pos[k + 1]) - D * vel[k + 1]) * h
        vel[k + 2] += (K * (closeZ - pos[k + 2]) - D * vel[k + 2]) * h
      }
      prev[k] = pos[k]
      prev[k + 1] = pos[k + 1]
      prev[k + 2] = pos[k + 2]
      pos[k] += vel[k] * h
      pos[k + 1] += vel[k + 1] * h
      pos[k + 2] += vel[k + 2] * h
    }

    const alpha = this.compliance / (h * h)
    for (let s = 0; s < SEGMENT_COUNT; s++) {
      const a = SEGMENTS[2 * s]
      const b = SEGMENTS[2 * s + 1]
      const ka = a * 3
      const kb = b * 3
      const dx = pos[kb] - pos[ka]
      const dy = pos[kb + 1] - pos[ka + 1]
      const dz = pos[kb + 2] - pos[ka + 2]
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const C = len - REST_LENGTH
      if (C <= 0 || len < 1e-9) continue
      const wa = invMass[a]
      const wb = invMass[b]
      const scale = -C / (wa + wb + alpha) / len
      pos[ka] -= wa * scale * dx
      pos[ka + 1] -= wa * scale * dy
      pos[ka + 2] -= wa * scale * dz
      pos[kb] += wb * scale * dx
      pos[kb + 1] += wb * scale * dy
      pos[kb + 2] += wb * scale * dz
    }

    if (this.mode === MODE.DRAPE) {
      const blend = 1 - Math.exp(-h / this.drapeTau)
      for (let n = 0; n < NODE_COUNT; n++) {
        const k = n * 3
        const lx = this.drapeLocal[k]
        const ly = this.drapeLocal[k + 1]
        const lz = this.drapeLocal[k + 2]
        pos[k] += (p[0] + R[0] * lx + R[1] * ly + R[2] * lz - pos[k]) * blend
        pos[k + 1] += (p[1] + R[3] * lx + R[4] * ly + R[5] * lz - pos[k + 1]) * blend
        pos[k + 2] += (p[2] + R[6] * lx + R[7] * ly + R[8] * lz - pos[k + 2]) * blend
      }
    }

    this.contactCount = this.released ? 0 : this.resolveContacts(h, body)

    const invH = 1 / h
    for (let k = 0; k < NODE_COUNT * 3; k++) vel[k] = (pos[k] - prev[k]) * invH
  }

  resolveContacts(h, body) {
    const { pos, prev, contact } = this
    const R = body.R
    const p = body.p
    const w = body.w
    const bv = body.v
    const m = CAPTURE.contactMargin
    const ex = body.half[0] + m
    const ey = body.half[1] + m
    const ez = body.half[2] + m
    const mu = NET.friction
    let count = 0

    for (let n = 0; n < NODE_COUNT; n++) {
      const k = n * 3
      const dx = pos[k] - p[0]
      const dy = pos[k + 1] - p[1]
      const dz = pos[k + 2] - p[2]
      let lx = R[0] * dx + R[3] * dy + R[6] * dz
      let ly = R[1] * dx + R[4] * dy + R[7] * dz
      let lz = R[2] * dx + R[5] * dy + R[8] * dz
      const ax = ex - Math.abs(lx)
      const ay = ey - Math.abs(ly)
      const az = ez - Math.abs(lz)
      if (ax <= 0 || ay <= 0 || az <= 0) {
        contact[n] = 0
        continue
      }

      let nlx = 0
      let nly = 0
      let nlz = 0
      let depth
      if (ax <= ay && ax <= az) {
        depth = ax
        nlx = lx >= 0 ? 1 : -1
        lx = nlx * ex
      } else if (ay <= az) {
        depth = ay
        nly = ly >= 0 ? 1 : -1
        ly = nly * ey
      } else {
        depth = az
        nlz = lz >= 0 ? 1 : -1
        lz = nlz * ez
      }

      const rx = R[0] * lx + R[1] * ly + R[2] * lz
      const ry = R[3] * lx + R[4] * ly + R[5] * lz
      const rz = R[6] * lx + R[7] * ly + R[8] * lz
      const nx = R[0] * nlx + R[1] * nly + R[2] * nlz
      const ny = R[3] * nlx + R[4] * nly + R[5] * nlz
      const nz = R[6] * nlx + R[7] * nly + R[8] * nlz
      let px = p[0] + rx
      let py = p[1] + ry
      let pz = p[2] + rz

      const svx = bv[0] + w[1] * rz - w[2] * ry
      const svy = bv[1] + w[2] * rx - w[0] * rz
      const svz = bv[2] + w[0] * ry - w[1] * rx
      const relx = px - prev[k] - svx * h
      const rely = py - prev[k + 1] - svy * h
      const relz = pz - prev[k + 2] - svz * h
      const rn = relx * nx + rely * ny + relz * nz
      const tx = relx - rn * nx
      const ty = rely - rn * ny
      const tz = relz - rn * nz
      const tl = Math.sqrt(tx * tx + ty * ty + tz * tz)
      if (tl > 1e-12) {
        const limit = mu * depth
        const s = tl <= limit ? 1 : limit / tl
        px -= tx * s
        py -= ty * s
        pz -= tz * s
      }

      if (this.twoWay) {
        // Knot impulse from this contact correction: J = m_k (x_final − x_pre) / h.
        // Body receives −J. Lever arm = knot position at the start of the step (prev) minus body.p:
        // with v_{n+1} = (x_{n+1} − x_n)/h the net's discrete angular momentum is Σ m x_n × v_{n+1},
        // so x_n is the lever arm that closes the body+net budget exactly (using x_{n+1} leaves an
        // O(|v| h) residual).
        const mk = 1 / this.invMass[n]
        const jx = (mk * (px - pos[k])) / h
        const jy = (mk * (py - pos[k + 1])) / h
        const jz = (mk * (pz - pos[k + 2])) / h
        const ax = prev[k] - p[0]
        const ay = prev[k + 1] - p[1]
        const az = prev[k + 2] - p[2]
        this.reactionImpulse[0] -= jx
        this.reactionImpulse[1] -= jy
        this.reactionImpulse[2] -= jz
        this.reactionAngImpulse[0] -= ay * jz - az * jy
        this.reactionAngImpulse[1] -= az * jx - ax * jz
        this.reactionAngImpulse[2] -= ax * jy - ay * jx
      }
      pos[k] = px
      pos[k + 1] = py
      pos[k + 2] = pz
      contact[n] = 1
      count++
    }
    return count
  }

  measure() {
    const { pos, nodeStrain } = this
    nodeStrain.fill(0)
    let maxStrain = 0
    let energy = 0
    const k = this.segmentStiffness
    for (let s = 0; s < SEGMENT_COUNT; s++) {
      const a = SEGMENTS[2 * s]
      const b = SEGMENTS[2 * s + 1]
      const ka = a * 3
      const kb = b * 3
      const len = Math.hypot(pos[kb] - pos[ka], pos[kb + 1] - pos[ka + 1], pos[kb + 2] - pos[ka + 2])
      const ext = len - REST_LENGTH
      if (ext <= 0) continue
      const strain = ext / REST_LENGTH
      energy += 0.5 * k * ext * ext
      if (strain > nodeStrain[a]) nodeStrain[a] = strain
      if (strain > nodeStrain[b]) nodeStrain[b] = strain
      if (strain > maxStrain) maxStrain = strain
    }
    this.maxStrain = maxStrain
    this.strainEnergy = energy
  }

  /** Area-weighted fraction of the six CubeSat faces with mesh knots lying on them. */
  enclosure(body) {
    if (this.mode === MODE.STOWED || this.released) return 0
    if (this.mode === MODE.WELDED) return 1
    const R = body.R
    const p = body.p
    const hx = body.half[0]
    const hy = body.half[1]
    const hz = body.half[2]
    const half = [hx, hy, hz]
    const counts = [0, 0, 0, 0, 0, 0]
    const band = 0.05
    const lateral = 0.03
    const local = [0, 0, 0]
    for (let n = 0; n < NODE_COUNT; n++) {
      const k = n * 3
      const dx = this.pos[k] - p[0]
      const dy = this.pos[k + 1] - p[1]
      const dz = this.pos[k + 2] - p[2]
      local[0] = R[0] * dx + R[3] * dy + R[6] * dz
      local[1] = R[1] * dx + R[4] * dy + R[7] * dz
      local[2] = R[2] * dx + R[5] * dy + R[8] * dz
      for (let a = 0; a < 3; a++) {
        const b = (a + 1) % 3
        const c = (a + 2) % 3
        if (Math.abs(local[b]) > half[b] + lateral || Math.abs(local[c]) > half[c] + lateral) continue
        const d = Math.abs(local[a]) - half[a]
        if (d >= -0.01 && d <= band) counts[a * 2 + (local[a] >= 0 ? 0 : 1)]++
      }
    }
    let covered = 0
    let total = 0
    for (let a = 0; a < 3; a++) {
      const area = 4 * half[(a + 1) % 3] * half[(a + 2) % 3]
      for (let s = 0; s < 2; s++) {
        covered += area * Math.min(1, counts[a * 2 + s] / 2)
        total += area
      }
    }
    return covered / total
  }

  centroid(out) {
    let x = 0
    let y = 0
    let z = 0
    for (let n = 0; n < NODE_COUNT; n++) {
      x += this.pos[n * 3]
      y += this.pos[n * 3 + 1]
      z += this.pos[n * 3 + 2]
    }
    out[0] = x / NODE_COUNT
    out[1] = y / NODE_COUNT
    out[2] = z / NODE_COUNT
    return out
  }
}
