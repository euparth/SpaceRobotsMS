import { CAPTURE, CUBESAT, MAX_RATE, NET, SOLVER } from '../physics/constants.js'
import { budgetDelta, momentumBudget } from '../physics/momentum.js'
import { computeVerdicts } from '../physics/captureLabel.js'
import { NetSolver } from '../physics/netSolver.js'
import { IX, IY, IZ, kineticEnergy, nutationAngle, quatToMatrix, rk4Step } from '../physics/rigidBody.js'
import { runSurrogateInference } from '../surrogate/inference.js'
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
  launchAt: null, // sim-time absolute; fire when IDLE and t >= launchAt
  verdicts: null, // rule / envelope / numeric / pinn for the commanded ω0 (recomputed on set_spin and reset)
  solver: null, // live rollout verdict after decide() or miss()
  // PHASE 4 — net→body coupling. 'one-way' is the validated default (body is an infinite-mass wall);
  // 'two-way' applies the net's contact reaction to the body with the one-substep lag used by
  // scripts/surrogate/physicsLib.mjs coupledImpactTwoWay(). Drawstring servo on/off at contact.
  coupling: 'one-way',
  drawstring: true,
  momentumBefore: null, // budget snapshot at t = tLaunch + flight − 0.02 s (same instant as the research script)
  momentum: null, // budgetDelta(before, now), updated every substep after the snapshot
}
const tau = new Float64Array(3)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const f3 = (v) => v.toFixed(3)

/**
 * Four verdicts for the commanded ω0 (same code paths as the scripts):
 *   rule     |ωz0| ≤ 3                                   static threshold
 *   envelope closed-form max |ωz| ≤ 3                    src/physics/envelope.js
 *   pinn     runSurrogateInference(ω0).fireNowSecure     src/surrogate/inference.js, committed weights
 *   numeric  peakWzInContactWindow(ω0, 0) ≤ 3            dataset label path, plus the secure window
 * The solver verdict is attached after a live rollout reaches decide() or miss().
 */
function postVerdicts() {
  self.postMessage({ type: 'verdicts', verdicts: sim.verdicts, solver: sim.solver })
}

function recomputeVerdicts() {
  const w0 = [commanded[0], commanded[1], commanded[2]]
  const t0 = performance.now()
  const v = computeVerdicts(w0)
  const tPhysics = performance.now() - t0
  const p = runSurrogateInference(w0[0], w0[1], w0[2], { includeTrace: false })
  v.pinn = {
    verdict: p.fireNowSecure ? 'SECURE' : 'EJECT',
    peak: p.peakWzPred,
    optimalLaunchDelayMs: p.optimalLaunchDelayMs,
    firstSecureMs: p.firstSecureMs,
    captureProbability: p.captureProbability,
    inferenceLatencyMs: p.inferenceLatencyMs,
  }
  v.computeMs = { physics: tPhysics, pinn: p.inferenceLatencyMs }
  sim.verdicts = v
  sim.solver = null
  postVerdicts()
}

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
  sim.launchAt = null
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

function scheduleLaunch(delaySec) {
  if (sim.phase !== PHASE.IDLE) {
    emit('warn', 'launch_at rejected — net already deployed, reset first')
    return
  }
  const d = Math.max(0, Number(delaySec) || 0)
  sim.launchAt = sim.t + d
  emit('info', `AUTO-FIRE ARMED · launch in ${(d * 1000).toFixed(0)} ms sim (t=${sim.launchAt.toFixed(3)} s)`)
  if (d <= 1e-9) launch()
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
  sim.launchAt = null
  sim.tLaunch = 0
  sim.tContact = 0
  sim.momentumBefore = null
  sim.momentum = null
  net.twoWay = sim.coupling === 'two-way'
  captureReference()
  self.postMessage({ type: 'reset' })
  postDecision(null)
  recomputeVerdicts()
  emit('info', 'SIM RESET · target re-initialised at LVLH origin, net stowed')
}

/** Offline rigid-body contact-window peak timing (does not touch live state). */
function benchRigid(wx, wy, wz) {
  const h = SOLVER.substep
  const flight = NET.standoff / NET.approachSpeed
  const yb = new Float64Array([wx, wy, wz, 1, 0, 0, 0])
  const t0 = performance.now()
  for (let t = 0; t < flight - 1e-12; t += h) rk4Step(yb, h, 0)
  let peak = Math.abs(yb[2])
  for (let t = 0; t < CAPTURE.decisionWindow - 1e-12; t += h) {
    rk4Step(yb, h, 0)
    peak = Math.max(peak, Math.abs(yb[2]))
  }
  return { ms: performance.now() - t0, peak }
}

/** Offline coupled rigid+net impact timing (does not touch live state). */
function benchCoupled(wx, wy, wz) {
  const h = SOLVER.substep
  const yb = new Float64Array([wx, wy, wz, 1, 0, 0, 0])
  const b = {
    p: new Float64Array(3),
    v: new Float64Array(3),
    R: new Float64Array(9),
    w: new Float64Array(3),
    half: CUBESAT.dims.map((d) => d / 2),
  }
  const n = new NetSolver()
  n.launch()
  const flight = NET.standoff / NET.approachSpeed
  const limit = flight + CAPTURE.decisionWindow + 0.15
  let t = 0
  let tContact = -1
  let phase = 'flight'
  let maxStrain = 0
  let peakWz = 0
  const t0 = performance.now()
  while (t < limit) {
    rk4Step(yb, h, 0)
    quatToMatrix(yb[3], yb[4], yb[5], yb[6], b.R)
    const R = b.R
    b.w[0] = R[0] * yb[0] + R[1] * yb[1] + R[2] * yb[2]
    b.w[1] = R[3] * yb[0] + R[4] * yb[1] + R[5] * yb[2]
    b.w[2] = R[6] * yb[0] + R[7] * yb[1] + R[8] * yb[2]
    n.step(h, b)
    t += h
    if (phase === 'flight' && n.contactCount > 0) {
      phase = 'contact'
      tContact = t
      n.drawstring = true
    }
    if (phase === 'contact') {
      peakWz = Math.max(peakWz, Math.abs(yb[2]))
      if (Math.round(t / h) % 20 === 0) {
        n.measure()
        maxStrain = Math.max(maxStrain, n.maxStrain)
      }
      if (t - tContact >= CAPTURE.decisionWindow) break
    }
  }
  n.measure()
  maxStrain = Math.max(maxStrain, n.maxStrain)
  return { ms: performance.now() - t0, peakWz, maxStrain }
}

function runBenchmark(wx, wy, wz) {
  const w = [
    clamp(Number(wx) || 0, 0, MAX_RATE),
    clamp(Number(wy) || 0, 0, MAX_RATE),
    clamp(Number(wz) || 0, 0, MAX_RATE),
  ]
  // Warm + average a few passes
  let rigidMs = 0
  let coupledMs = 0
  const N = 3
  for (let i = 0; i < N; i++) {
    rigidMs += benchRigid(...w).ms
    coupledMs += benchCoupled(...w).ms
  }
  self.postMessage({
    type: 'benchmark_result',
    rigidMs: rigidMs / N,
    coupledMs: coupledMs / N,
    w,
  })
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
  sim.solver = {
    verdict: peak > limit ? 'EJECT' : 'SECURE',
    peakWz: peak,
    tLaunch: sim.tLaunch,
    tContact: sim.tContact,
    tDecision: sim.t,
    launchDelayMs: Math.round(sim.tLaunch * 1000),
    coupling: sim.coupling,
    drawstring: sim.drawstring,
    momentum: sim.momentum,
  }
  postVerdicts()
}

function miss() {
  sim.phase = PHASE.EJECTED
  const reason = `no contact within ${CAPTURE.missTimeout.toFixed(1)} s of flight`
  postDecision({ status: 'MISS', t: sim.t, peakWz: 0, limit: CAPTURE.wzLimit, excessEnergy: 0, ejectionSpeed: 0, reason })
  emit('error', `CAPTURE MISS · ${reason}`)
  sim.solver = {
    verdict: 'MISS',
    peakWz: null,
    tLaunch: sim.tLaunch,
    tContact: null,
    tDecision: sim.t,
    launchDelayMs: Math.round(sim.tLaunch * 1000),
    coupling: sim.coupling,
    drawstring: sim.drawstring,
    momentum: sim.momentum,
  }
  postVerdicts()
}

function substep(h) {
  if (sim.damping > 0) sim.energyAbsorbed += 2 * sim.damping * kineticEnergy(y[0], y[1], y[2]) * h
  if (net.twoWay) {
    // reaction accumulated during the previous net step → body-frame torque (zero-order hold over
    // the four RK4 stages) and a linear impulse, exactly as coupledImpactTwoWay()
    const R = body.R
    const Lx = net.reactionAngImpulse[0] / h
    const Ly = net.reactionAngImpulse[1] / h
    const Lz = net.reactionAngImpulse[2] / h
    tau[0] = R[0] * Lx + R[3] * Ly + R[6] * Lz
    tau[1] = R[1] * Lx + R[4] * Ly + R[7] * Lz
    tau[2] = R[2] * Lx + R[5] * Ly + R[8] * Lz
    rk4Step(y, h, sim.damping, tau)
    const m = CUBESAT.mass
    body.v[0] += net.reactionImpulse[0] / m
    body.v[1] += net.reactionImpulse[1] / m
    body.v[2] += net.reactionImpulse[2] / m
  } else {
    rk4Step(y, h, sim.damping)
  }
  body.p[0] += body.v[0] * h
  body.p[1] += body.v[1] * h
  body.p[2] += body.v[2] * h
  syncBody()
  if (sim.phase === PHASE.FLIGHT || sim.phase === PHASE.CONTACT) {
    const tBefore = sim.tLaunch + NET.standoff / NET.approachSpeed - 0.02
    if (sim.momentumBefore === null && sim.t + 1e-12 >= tBefore) sim.momentumBefore = momentumBudget(y, body, net)
  }
  net.step(h, body)
  sim.t += h
  if (sim.momentumBefore !== null && (sim.phase === PHASE.FLIGHT || sim.phase === PHASE.CONTACT)) {
    sim.momentum = budgetDelta(sim.momentumBefore, momentumBudget(y, body, net, true))
  }

  if (sim.launchAt != null && sim.phase === PHASE.IDLE && sim.t + 1e-12 >= sim.launchAt) {
    launch()
  }

  const wz = Math.abs(y[2])
  switch (sim.phase) {
    case PHASE.FLIGHT:
      if (net.contactCount > 0) {
        sim.phase = PHASE.CONTACT
        sim.tContact = sim.t
        sim.peakWz = wz
        net.drawstring = sim.drawstring
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
  buf[F.T_LAUNCH] = sim.phase === PHASE.IDLE ? NaN : sim.tLaunch
  buf[F.T_CONTACT] = sim.phase === PHASE.IDLE || sim.phase === PHASE.FLIGHT || !(sim.tContact > 0) ? NaN : sim.tContact
  buf[F.DP_TOTAL] = sim.momentum ? sim.momentum.dPTotal : NaN
  buf[F.DL_TOTAL] = sim.momentum ? sim.momentum.dLTotal : NaN
  buf[F.COUPLING] = (sim.coupling === 'two-way' ? 1 : 0) + (sim.drawstring ? 2 : 0)
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
        recomputeVerdicts()
      } else {
        emit('warn', 'ω₀ staged — net deployed, applies on reset')
      }
      break
    }
    case 'launch':
      launch()
      break
    case 'launch_at':
      scheduleLaunch(data.delaySec ?? (Number(data.delayMs) || 0) / 1000)
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
      } else if (data.key === 'coupling') {
        const mode = data.value === 'two-way' ? 'two-way' : 'one-way'
        if (mode !== sim.coupling) {
          sim.coupling = mode
          if (sim.phase === PHASE.IDLE) net.twoWay = mode === 'two-way'
          emit(
            'info',
            mode === 'two-way'
              ? 'NET→BODY COUPLING ← two-way (experimental) · contact reaction applied to the body, one-substep lag · applies on reset if a run is live'
              : 'NET→BODY COUPLING ← one-way (default) · body is an infinite-mass wall for the net',
          )
          if (sim.phase === PHASE.IDLE) postVerdicts()
        }
      } else if (data.key === 'drawstring') {
        const on = Boolean(data.value)
        if (on !== sim.drawstring) {
          sim.drawstring = on
          if (sim.phase === PHASE.CONTACT || sim.phase === PHASE.CLOSING) net.drawstring = on
          emit('info', on ? 'DRAWSTRING ← on · corner servo engages at contact (K 90 N/m, D 9 N·s/m)' : 'DRAWSTRING ← off · no external force on the net after contact')
          if (sim.phase === PHASE.IDLE) postVerdicts()
        }
      }
      break
    case 'benchmark': {
      const w = data.w ?? [commanded[0], commanded[1], commanded[2]]
      runBenchmark(w[0], w[1], w[2])
      break
    }
    default:
      break
  }
}

captureReference()
recomputeVerdicts()

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
