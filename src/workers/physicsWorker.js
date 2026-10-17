import { CAPTURE, CUBESAT, MAX_RATE, NET, SOLVER } from '../physics/constants.js'
import { NetSolver } from '../physics/netSolver.js'
import { IX, IY, IZ, kineticEnergy, nutationAngle, quatToMatrix, rk4Step } from '../physics/rigidBody.js'
import {
  F,
  NODE_POSITION_OFFSET,
  NODE_STRAIN_OFFSET,
  PHASE,
  STATE_LENGTH,
} from '../physics/stateLayout.js'

const y = new Float64Array([0, 0, 0, 1, 0, 0, 0])
const commanded = new Float64Array(3)
const body = {
  p: new Float64Array(3),
  v: new Float64Array(3),
  R: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  w: new Float64Array(3),
  half: CUBESAT.dims.map((d) => d / 2),
}
const net = new NetSolver()
const h0 = new Float64Array(3)
const hNow = new Float64Array(3)
const centroid = new Float64Array(3)

const sim = {
  phase: PHASE.IDLE,
  t: 0,
  tLaunch: 0,
  tContact: 0,
  tDecision: 0,
  timeScale: SOLVER.defaultTimeScale,
  paused: false,
  damping: 0,
  energyAbsorbed: 0,
  ke0: 0,
  h0Mag: 0,
  peakWz: 0,
  substeps: 0,
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const f3 = (v) => v.toFixed(3)

function syncBody() {
  quatToMatrix(y[3], y[4], y[5], y[6], body.R)
  const R = body.R
  const wx = y[0]
  const wy = y[1]
  const wz = y[2]
  body.w[0] = R[0] * wx + R[1] * wy + R[2] * wz
  body.w[1] = R[3] * wx + R[4] * wy + R[5] * wz
  body.w[2] = R[6] * wx + R[7] * wy + R[8] * wz
}

function inertialMomentum(out) {
  const R = body.R
  const hx = IX * y[0]
  const hy = IY * y[1]
  const hz = IZ * y[2]
  out[0] = R[0] * hx + R[1] * hy + R[2] * hz
  out[1] = R[3] * hx + R[4] * hy + R[5] * hz
  out[2] = R[6] * hx + R[7] * hy + R[8] * hz
  return out
}

function captureReference() {
  syncBody()
  sim.ke0 = kineticEnergy(y[0], y[1], y[2])
  inertialMomentum(h0)
  sim.h0Mag = Math.hypot(h0[0], h0[1], h0[2])
}

function emit(level, text) {
  self.postMessage({ type: 'event', level, text, t: sim.t })
}

function postDecision(decision) {
  self.postMessage({ type: 'decision', decision })
}

function launch() {
  if (sim.phase !== PHASE.IDLE) {
    emit('warn', 'launch_net rejected — net already deployed, reset first')
    return
  }
  captureReference()
  sim.tLaunch = sim.t
  sim.peakWz = 0
  sim.energyAbsorbed = 0
  net.launch()
  sim.phase = PHASE.FLIGHT
  emit(
    'info',
    `NET FIRED · v_rel ${NET.approachSpeed.toFixed(1)} m/s · standoff ${NET.standoff.toFixed(2)} m · ω [${f3(y[0])}, ${f3(y[1])}, ${f3(y[2])}] rad/s`,
  )
}

function reset() {
  y[0] = commanded[0]
  y[1] = commanded[1]
  y[2] = commanded[2]
  y[3] = 1
  y[4] = 0
  y[5] = 0
  y[6] = 0
  body.p.fill(0)
  body.v.fill(0)
  net.stow(NET.standoff)
  sim.phase = PHASE.IDLE
  sim.t = 0
  sim.damping = 0
  sim.energyAbsorbed = 0
  sim.peakWz = 0
  captureReference()
  self.postMessage({ type: 'reset' })
  postDecision(null)
  emit('info', 'SIM RESET · target re-initialised at LVLH origin, net stowed')
}

function decide() {
  sim.tDecision = sim.t
  const limit = CAPTURE.wzLimit
  const peak = sim.peakWz
  if (peak > limit) {
    sim.phase = PHASE.EJECTED
    const excess = 0.5 * IZ * (peak * peak - limit * limit)
    const speed = Math.sqrt((2 * excess) / CUBESAT.mass)
    const lx = body.w[1]
    const ly = -body.w[0]
    const l = Math.hypot(lx, ly)
    let dx = l > 1e-6 ? (0.55 * lx) / l : 0.55
    let dy = l > 1e-6 ? (0.55 * ly) / l : 0
    let dz = -1
    const dn = Math.hypot(dx, dy, dz)
    dx /= dn
    dy /= dn
    dz /= dn
    body.v[0] = dx * speed
    body.v[1] = dy * speed
    body.v[2] = dz * speed
    net.release(body)
    const reason = `peak |ωz| ${f3(peak)} > ${f3(limit)} rad/s — ΔT_z ${f3(excess)} J overpowers net tensile restraint · v_eject ≤ ${f3(speed)} m/s`
    postDecision({ status: 'EJECTED', t: sim.t, peakWz: peak, limit, excessEnergy: excess, ejectionSpeed: speed, reason })
    emit('error', `TWIST-OUT EJECTION · ${reason}`)
  } else {
    sim.phase = PHASE.CLOSING
    net.beginDrape(body, CAPTURE.closureDuration / 4)
    sim.damping = 1 / CAPTURE.restraintTimeConstant
    const reason = `peak |ωz| ${f3(peak)} ≤ ${f3(limit)} rad/s — net tensile restraint holds, closing mechanism engaged`
    postDecision({ status: 'SECURED', t: sim.t, peakWz: peak, limit, excessEnergy: 0, ejectionSpeed: 0, reason })
    emit('ok', `CAPTURE LAW SATISFIED · ${reason}`)
  }
}

function miss() {
  sim.phase = PHASE.EJECTED
  const reason = `no contact within ${CAPTURE.missTimeout.toFixed(1)} s of flight`
  postDecision({ status: 'MISS', t: sim.t, peakWz: 0, limit: CAPTURE.wzLimit, excessEnergy: 0, ejectionSpeed: 0, reason })
  emit('error', `CAPTURE MISS · ${reason}`)
}

function substep(h) {
  if (sim.damping > 0) sim.energyAbsorbed += 2 * sim.damping * kineticEnergy(y[0], y[1], y[2]) * h
  rk4Step(y, h, sim.damping)
  body.p[0] += body.v[0] * h
  body.p[1] += body.v[1] * h
  body.p[2] += body.v[2] * h
  syncBody()
  net.step(h, body)
  sim.t += h

  const wz = Math.abs(y[2])
  switch (sim.phase) {
    case PHASE.FLIGHT:
      if (net.contactCount > 0) {
        sim.phase = PHASE.CONTACT
        sim.tContact = sim.t
        sim.peakWz = wz
        net.drawstring = true
        emit('info', `CONTACT · |ωz| ${f3(wz)} rad/s · evaluating instability law over ${CAPTURE.decisionWindow.toFixed(2)} s`)
      } else if (sim.t - sim.tLaunch > CAPTURE.missTimeout) {
        miss()
      }
      break
    case PHASE.CONTACT:
      sim.peakWz = Math.max(sim.peakWz, wz)
      if (sim.t - sim.tContact >= CAPTURE.decisionWindow) decide()
      break
    case PHASE.CLOSING:
      if (sim.t - sim.tDecision >= CAPTURE.closureDuration) {
        net.weld()
        sim.phase = PHASE.SECURED
        emit('ok', 'NET CLOSED · mesh conformal on all six faces · target SECURED')
      }
      break
    default:
      break
  }
}

function publish(solverMs, tickHz) {
  net.measure()
  const buf = new Float32Array(STATE_LENGTH)
  const wx = y[0]
  const wy = y[1]
  const wz = y[2]
  const ke = kineticEnergy(wx, wy, wz)
  inertialMomentum(hNow)
  const torqueFree = sim.damping === 0

  buf[F.T] = sim.t
  buf[F.Q0] = y[3]
  buf[F.Q1] = y[4]
  buf[F.Q2] = y[5]
  buf[F.Q3] = y[6]
  buf[F.WX] = wx
  buf[F.WY] = wy
  buf[F.WZ] = wz
  buf[F.HX] = hNow[0]
  buf[F.HY] = hNow[1]
  buf[F.HZ] = hNow[2]
  buf[F.KE] = ke
  buf[F.KE0] = sim.ke0
  buf[F.E_NET] = net.strainEnergy
  buf[F.E_ABS] = sim.energyAbsorbed
  buf[F.NUTATION] = nutationAngle(wx, wy, wz)
  buf[F.PX] = body.p[0]
  buf[F.PY] = body.p[1]
  buf[F.PZ] = body.p[2]
  buf[F.VX] = body.v[0]
  buf[F.VY] = body.v[1]
  buf[F.VZ] = body.v[2]
  buf[F.ENCLOSURE] = net.enclosure(body)
  buf[F.PEAK_WZ] = sim.peakWz
  buf[F.KE_DRIFT] = torqueFree && sim.ke0 > 1e-9 ? (ke - sim.ke0) / sim.ke0 : NaN
  buf[F.H_DRIFT] =
    torqueFree && sim.h0Mag > 1e-9
      ? Math.hypot(hNow[0] - h0[0], hNow[1] - h0[1], hNow[2] - h0[2]) / sim.h0Mag
      : NaN
  buf[F.STRAIN_MAX] = net.maxStrain
  buf[F.CONTACTS] = net.deployed ? net.contactCount : 0
  buf[F.PHASE] = sim.phase
  net.centroid(centroid)
  buf[F.RANGE] = Math.hypot(centroid[0] - body.p[0], centroid[1] - body.p[1], centroid[2] - body.p[2])
  buf[F.SOLVER_MS] = solverMs
  buf[F.TICK_HZ] = tickHz
  buf[F.TIME_SCALE] = sim.timeScale
  buf[F.PAUSED] = sim.paused ? 1 : 0
  buf[F.SUBSTEPS] = sim.substeps
  buf[F.ETA] = net.wovenEfficiency
  buf.set(net.pos, NODE_POSITION_OFFSET)
  buf.set(net.nodeStrain, NODE_STRAIN_OFFSET)
  self.postMessage({ type: 'state', buffer: buf.buffer }, [buf.buffer])
}

self.onmessage = ({ data }) => {
  switch (data.type) {
    case 'set_spin': {
      const w = data.w.map((v) => clamp(Number(v) || 0, 0, MAX_RATE))
      commanded.set(w)
      if (sim.phase === PHASE.IDLE) {
        y[0] = w[0]
        y[1] = w[1]
        y[2] = w[2]
        captureReference()
      } else {
        emit('warn', 'ω₀ staged — net deployed, applies on reset')
      }
      break
    }
    case 'launch':
      launch()
      break
    case 'reset':
      reset()
      break
    case 'time_scale':
      sim.timeScale = clamp(Number(data.value) || SOLVER.defaultTimeScale, 0.02, 1)
      break
    case 'pause':
      sim.paused = true
      emit('info', 'SIM PAUSED')
      break
    case 'resume':
      sim.paused = false
      emit('info', 'SIM RESUMED')
      break
    case 'set_param':
      if (data.key === 'eta') {
        net.setWovenEfficiency(clamp(Number(data.value), 1e-4, 0.1))
        emit('info', `η_weave ← ${net.wovenEfficiency} · EA_eff ${net.axialStiffness.toFixed(1)} N`)
      }
      break
    default:
      break
  }
}

captureReference()

let last = performance.now()
let tickHz = SOLVER.publishHz
setInterval(() => {
  const now = performance.now()
  const dtWall = Math.min(0.05, (now - last) / 1000)
  last = now
  if (dtWall > 0) tickHz = tickHz * 0.92 + (1 / dtWall) * 0.08
  const started = performance.now()
  if (!sim.paused && dtWall > 0) {
    const simDt = dtWall * sim.timeScale
    const n = Math.min(SOLVER.maxSubsteps, Math.max(1, Math.ceil(simDt / SOLVER.substep)))
    const h = simDt / n
    for (let i = 0; i < n; i++) substep(h)
    sim.substeps = n
  } else {
    sim.substeps = 0
  }
  publish(performance.now() - started, tickHz)
}, 1000 / SOLVER.publishHz)
