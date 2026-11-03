/**
 * Phase 3 diagnostic: split the net's per-step angular-momentum change into the XPBD distance-constraint
 * part and the contact part (+ body reaction), spin [2.8535, 2.5291, 2.9003] (capture.json row 291), two-way,
 * drawstring off. Usage: node scripts/research/phase3_diag_angmom.mjs
 */
import { NetSolver } from '../../src/physics/netSolver.js'
import { CUBESAT } from '../../src/physics/constants.js'
import { rk4Step, quatToMatrix } from '../../src/physics/rigidBody.js'
const H = 1 / 3000
class Probe extends NetSolver {
  L(h) { // Σ m x_n × (x − prev)/h  with x = current pos (discrete angular momentum, lever = start-of-step pos)
    const L = [0, 0, 0]
    for (let n = 0; n < this.invMass.length; n++) {
      const mk = 1 / this.invMass[n]; const k = n * 3
      const x = this.prev[k], y = this.prev[k + 1], z = this.prev[k + 2]
      const vx = mk * (this.pos[k] - this.prev[k]) / h, vy = mk * (this.pos[k + 1] - this.prev[k + 1]) / h, vz = mk * (this.pos[k + 2] - this.prev[k + 2]) / h
      L[0] += y * vz - z * vy; L[1] += z * vx - x * vz; L[2] += x * vy - y * vx
    }
    return L
  }
  resolveContacts(h, body) {
    this.Lpre = this.L(h)
    const c = super.resolveContacts(h, body)
    this.Lpost = this.L(h)
    return c
  }
}
const w0 = [2.8535, 2.5291, 2.9003]
const y = new Float64Array([...w0, 1, 0, 0, 0])
const body = { p: new Float64Array(3), v: new Float64Array(3), R: new Float64Array(9), w: new Float64Array(3), half: CUBESAT.dims.map((d) => d / 2) }
const net = new Probe(); net.twoWay = true; net.launch()
quatToMatrix(y[3], y[4], y[5], y[6], body.R)
let t = 0, cumC = [0,0,0], cumK = [0,0,0], step = 0
// L of net at end of previous step with lever prev: Σ m x_{n-1} × v_n  — equals Σ m x_n × v_n (identity). Use that as start-of-step reference.
const Lstart = () => { const L=[0,0,0]; for (let n=0;n<net.invMass.length;n++){const mk=1/net.invMass[n];const k=n*3;const x=net.pos[k],yy=net.pos[k+1],z=net.pos[k+2];const vx=mk*net.vel[k],vy=mk*net.vel[k+1],vz=mk*net.vel[k+2];L[0]+=yy*vz-z*vy;L[1]+=z*vx-x*vz;L[2]+=x*vy-yy*vx} return L }
while (t < 0.56) {
  const R = body.R
  const tau = [0,0,0]
  const Lx = net.reactionAngImpulse[0]/H, Ly = net.reactionAngImpulse[1]/H, Lz = net.reactionAngImpulse[2]/H
  tau[0] = R[0]*Lx + R[3]*Ly + R[6]*Lz; tau[1] = R[1]*Lx + R[4]*Ly + R[7]*Lz; tau[2] = R[2]*Lx + R[5]*Ly + R[8]*Lz
  rk4Step(y, H, 0, tau)
  body.v[0] += net.reactionImpulse[0]/30; body.v[1] += net.reactionImpulse[1]/30; body.v[2] += net.reactionImpulse[2]/30
  body.p[0] += body.v[0]*H; body.p[1] += body.v[1]*H; body.p[2] += body.v[2]*H
  quatToMatrix(y[3], y[4], y[5], y[6], body.R)
  body.w[0] = R[0]*y[0]+R[1]*y[1]+R[2]*y[2]; body.w[1] = R[3]*y[0]+R[4]*y[1]+R[5]*y[2]; body.w[2] = R[6]*y[0]+R[7]*y[1]+R[8]*y[2]
  const L0 = Lstart()
  net.step(H, body)
  const dK = net.Lpre.map((v,i)=>v-L0[i])        // constraints (+ free advance, which is zero)
  const dC = net.Lpost.map((v,i)=>v-net.Lpre[i]) // contact
  const react = [...net.reactionAngImpulse]
  for (let i=0;i<3;i++){ cumK[i]+=dK[i]; cumC[i]+=dC[i]+react[i] }
  t += H; step++
  if (net.contactCount > 0 && step % 75 === 0) console.log(`t=${t.toFixed(4)} contacts=${net.contactCount} cum|ΔL_constraints|=${Math.hypot(...cumK).toExponential(3)} cum|ΔL_contact+reaction|=${Math.hypot(...cumC).toExponential(3)}`)
}
