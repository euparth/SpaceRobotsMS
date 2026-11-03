/**
 * Phase 3 — two-way net–body coupling: momentum budget, single-axis sweep, 1200-row relabel, timing.
 * Usage: node scripts/research/phase3_twoway.mjs
 */
import { readFileSync } from 'fs'
import { cpus } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { coupledImpact, coupledImpactTwoWay, mulberry32, WZ_LIMIT, H } from '../surrogate/physicsLib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rows = JSON.parse(readFileSync(join(__dirname, '../surrogate/data/capture.json'), 'utf8'))
const pick = (n, seed) => {
  const rng = mulberry32(seed)
  const s = new Set()
  while (s.size < n) s.add(Math.floor(rng() * rows.length))
  return [...s]
}
const norm = (v) => Math.hypot(...v)
const sub = (a, b) => a.map((x, i) => x - b[i])
const f = (x, d = 6) => (Number.isFinite(x) ? x.toFixed(d) : String(x))
const stats = (a) => {
  const s = [...a].sort((p, q) => p - q)
  const mean = a.reduce((x, y) => x + y, 0) / a.length
  const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  return `mean ${mean.toFixed(4)} median ${med.toFixed(4)} min ${s[0].toFixed(4)} max ${s[s.length - 1].toFixed(4)}`
}

console.log(`H=${H} WZ_LIMIT=${WZ_LIMIT} cpu ${cpus()[0].model} node ${process.version}`)

// ---- 3c momentum budget, 20 spins
console.log('=== 3c momentum budget (20 spins, seed 20261103): |ΔP_total| and |ΔL_total| from t=0.28 s to end of window ===')
const idx20 = pick(20, 20261103)
console.log('idx | wx wy wz | mode | |P_before| | |ΔP_total| | |ΔP_body| | |ΔP_net| | |L_before| | |ΔL_total| | |ΔL_body| | |ΔL_net| | peak|wz| | unstable | maxF N | maxτ N·m')
const modes = [
  ['one-way kinematics (no feedback)', { bodyFeedback: false, drawstring: true }],
  ['two-way, drawstring on', { bodyFeedback: true, drawstring: true }],
  ['two-way, drawstring off', { bodyFeedback: true, drawstring: false }],
]
const agg = {}
for (const i of idx20) {
  const w = [rows[i].wx, rows[i].wy, rows[i].wz]
  for (const [name, o] of modes) {
    const r = coupledImpactTwoWay(...w, { ...o, momentum: true })
    const b = r.momentum.before
    const a = r.momentum.after
    const dP = norm(sub(a.total.P, b.total.P))
    const dL = norm(sub(a.total.L, b.total.L))
    const dPb = norm(sub(a.body.P, b.body.P))
    const dPn = norm(sub(a.net.P, b.net.P))
    const dLb = norm(sub(a.body.L, b.body.L))
    const dLn = norm(sub(a.net.L, b.net.L))
    ;(agg[name] ??= { dP: [], dL: [], P0: [], L0: [] })
    agg[name].dP.push(dP)
    agg[name].dL.push(dL)
    agg[name].P0.push(norm(b.total.P))
    agg[name].L0.push(norm(b.total.L))
    console.log(
      `${i} | ${w.map((v) => f(v, 4)).join(' ')} | ${name} | ${f(norm(b.total.P))} | ${dP.toExponential(3)} | ${f(dPb)} | ${f(dPn)} | ${f(norm(b.total.L))} | ${dL.toExponential(3)} | ${f(dLb)} | ${f(dLn)} | ${f(r.peakWz)} | ${r.unstable} | ${f(r.maxReactionForceN, 3)} | ${f(r.maxReactionTorqueNm, 4)}`,
    )
  }
}
for (const [name, a] of Object.entries(agg)) {
  const mx = (x) => Math.max(...x)
  console.log(`summary ${name}: max|ΔP| ${mx(a.dP).toExponential(4)} (max |P0| ${mx(a.P0).toFixed(4)}), max|ΔL| ${mx(a.dL).toExponential(4)} (max |L0| ${mx(a.L0).toFixed(4)})`)
}

// ---- 3c supplement: net alone in free flight (body moved out of reach) — isolates XPBD distance-constraint non-conservation
console.log('=== 3c supplement: net-only free flight 0 → 0.28 s, body at z=-100 (no contact possible), drawstring off ===')
{
  const { NetSolver } = await import('../../src/physics/netSolver.js')
  const { CUBESAT } = await import('../../src/physics/constants.js')
  const net = new NetSolver()
  const body = { p: new Float64Array([0, 0, -100]), v: new Float64Array(3), R: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), w: new Float64Array(3), half: CUBESAT.dims.map((d) => d / 2) }
  const budget = () => {
    const P = [0, 0, 0]
    const L = [0, 0, 0]
    for (let n = 0; n < net.invMass.length; n++) {
      const mk = 1 / net.invMass[n]
      const k = n * 3
      const [x, yy, z] = [net.pos[k], net.pos[k + 1], net.pos[k + 2]]
      const [vx, vy, vz] = [mk * net.vel[k], mk * net.vel[k + 1], mk * net.vel[k + 2]]
      P[0] += vx; P[1] += vy; P[2] += vz
      L[0] += yy * vz - z * vy; L[1] += z * vx - x * vz; L[2] += x * vy - yy * vx
    }
    return { P, L }
  }
  net.launch()
  net.step(H, body)
  const b0 = budget()
  let steps = 1
  let maxContacts = 0
  let maxStrain = 0
  const marks = [0.28, 0.4, 0.56]
  let mi = 0
  console.log('t | steps | max contactCount so far | max segment strain so far | |ΔP| | |ΔL|  (|P| start ' + norm(b0.P) + ', |L| start ' + norm(b0.L) + ')')
  for (let t = H; t < 0.56 + 1e-9; t += H) {
    net.step(H, body)
    steps++
    maxContacts = Math.max(maxContacts, net.contactCount)
    if (steps % 10 === 0) {
      net.measure()
      maxStrain = Math.max(maxStrain, net.maxStrain)
    }
    if (mi < marks.length && t >= marks[mi] - 1e-9) {
      const b1 = budget()
      console.log(`${t.toFixed(4)} | ${steps} | ${maxContacts} | ${maxStrain.toExponential(3)} | ${norm(sub(b1.P, b0.P)).toExponential(4)} | ${norm(sub(b1.L, b0.L)).toExponential(4)}`)
      mi++
    }
  }
  console.log('interpretation: distance constraints are inactive while the net is slack (C <= 0 skipped); conservation after the net becomes taut isolates the XPBD Gauss-Seidel projection error')
}

// ---- 3d single-axis sweep one-way vs two-way
console.log('=== 3d single-axis sweep, net fired at t=0: one-way vs two-way (drawstring on, production schedule) ===')
console.log('axis | w | one-way verdict | one-way peak|wz| | two-way verdict | two-way peak|wz| | Δpeak | two-way body |v| end m/s | unstable')
let changed = 0
for (const axis of ['x', 'y', 'z']) {
  for (const w of [0.1, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]) {
    const om = [axis === 'x' ? w : 0, axis === 'y' ? w : 0, axis === 'z' ? w : 0]
    const a = coupledImpact(...om)
    const b = coupledImpact(...om, { coupling: 'two-way' })
    if (a.eject !== b.eject) changed++
    console.log(
      `${axis} | ${w.toFixed(1)} | ${a.eject ? 'eject' : 'capture'} | ${f(a.peakWz)} | ${b.eject ? 'eject' : 'capture'} | ${f(b.peakWz)} | ${(b.peakWz - a.peakWz).toExponential(3)} | ${f(norm(b.bodyV))} | ${b.unstable}`,
    )
  }
}
console.log('sweep verdict changes:', changed)

// ---- 3d all 1200 rows two-way
console.log('=== 3d all 1200 reference rows: two-way coupledImpact vs one-way coupledImpact and vs dataset label ===')
let t0 = performance.now()
let cap2ej = 0
let ej2cap = 0
let unstable = 0
let ruleSecure = 0
let fs1 = 0
let fe1 = 0
let fs2 = 0
let fe2 = 0
let labelAgree2 = 0
let maxDpeak = 0
let sumAbsDpeak = 0
const changes = []
for (const r of rows) {
  const w = [r.wx, r.wy, r.wz]
  const a = coupledImpact(...w)
  const b = coupledImpact(...w, { coupling: 'two-way' })
  if (b.unstable) unstable++
  const rs = Math.abs(r.wz) <= WZ_LIMIT
  if (rs) ruleSecure++
  if (rs && a.eject) fs1++
  if (!rs && !a.eject) fe1++
  if (rs && b.eject) fs2++
  if (!rs && !b.eject) fe2++
  if (!b.eject === r.fireNowSecure) labelAgree2++
  if (!a.eject && b.eject) cap2ej++
  if (a.eject && !b.eject) ej2cap++
  if (a.eject !== b.eject) changes.push({ i: r.i, w, oneWayPeak: a.peakWz, twoWayPeak: b.peakWz })
  const d = Math.abs(b.peakWz - a.peakWz)
  maxDpeak = Math.max(maxDpeak, d)
  sumAbsDpeak += d
}
console.log('wall_s', (performance.now() - t0) / 1000)
console.log('unstable two-way runs', unstable)
console.log('verdict changes one-way→two-way: capture→eject', cap2ej, 'eject→capture', ej2cap, 'total', cap2ej + ej2cap)
console.log('max |Δ peak|wz||', maxDpeak, 'mean |Δ peak|wz||', sumAbsDpeak / rows.length)
console.log('two-way verdict == dataset fireNowSecure label', labelAgree2, 'of', rows.length)
console.log('rule_secure', ruleSecure)
console.log(`one-way: false_secure ${fs1} (${((100 * fs1) / rows.length).toFixed(4)}% of all, ${((100 * fs1) / ruleSecure).toFixed(4)}% of rule-SECURE) false_eject ${fe1} (${((100 * fe1) / rows.length).toFixed(4)}%)`)
console.log(`two-way: false_secure ${fs2} (${((100 * fs2) / rows.length).toFixed(4)}% of all, ${((100 * fs2) / ruleSecure).toFixed(4)}% of rule-SECURE) false_eject ${fe2} (${((100 * fe2) / rows.length).toFixed(4)}%)`)
for (const c of changes) console.log('  change', JSON.stringify(c))

// ---- 3e timing
console.log('=== 3e timing, 20 spins (seed 20261103), 1 warm-up each, 2 passes ===')
coupledImpact(1.5, 1.0, 0.5)
coupledImpact(1.5, 1.0, 0.5, { coupling: 'two-way' })
for (let pass = 1; pass <= 2; pass++) {
  const one = []
  const two = []
  for (const i of idx20) {
    const w = [rows[i].wx, rows[i].wy, rows[i].wz]
    let s = performance.now()
    coupledImpact(...w)
    one.push(performance.now() - s)
    s = performance.now()
    coupledImpact(...w, { coupling: 'two-way' })
    two.push(performance.now() - s)
  }
  console.log(`pass ${pass} one-way ms ${stats(one)}`)
  console.log(`pass ${pass} two-way ms ${stats(two)}`)
}
