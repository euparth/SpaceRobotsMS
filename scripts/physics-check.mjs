import { CAPTURE, CUBESAT, NET } from '../src/physics/constants.js'
import { NetSolver } from '../src/physics/netSolver.js'
import { kineticEnergy, predictOutcome, quatToMatrix, rk4Step } from '../src/physics/rigidBody.js'
import { NET_MASS, NODE_MASS } from '../src/physics/netTopology.js'

console.log('net mass', NET_MASS.toFixed(4), 'node mass', NODE_MASS.toExponential(3))

for (const w of [[0, 0, 0], [1.5, 1, 0.5], [0, 0, 4.2], [3, 3, 2.5]]) {
  const p = predictOutcome(w)
  const y = new Float64Array([...w, 1, 0, 0, 0])
  const T0 = kineticEnergy(...w)
  let peak = 0
  for (let i = 0; i < 30000; i++) { rk4Step(y, 1 / 3000, 0); peak = Math.max(peak, Math.abs(y[2])) }
  const drift = T0 > 0 ? (kineticEnergy(y[0], y[1], y[2]) - T0) / T0 : 0
  console.log(JSON.stringify(w), 'predict', p.verdict, p.peak.toFixed(3), 'sim peak(10s)', peak.toFixed(3), 'drift', drift.toExponential(2))
}

function run(w) {
  const y = new Float64Array([...w, 1, 0, 0, 0])
  const body = { p: new Float64Array(3), v: new Float64Array(3), R: new Float64Array(9), w: new Float64Array(3), half: CUBESAT.dims.map((d) => d / 2) }
  const net = new NetSolver()
  net.launch()
  const h = 1 / 3000
  let t = 0, contactT = -1, maxStrain = 0, phase = 'flight', maxStrainAfter = 0
  for (let i = 0; i < 3000 * 1.2; i++) {
    rk4Step(y, h, 0)
    quatToMatrix(y[3], y[4], y[5], y[6], body.R)
    const R = body.R
    body.w[0] = R[0] * y[0] + R[1] * y[1] + R[2] * y[2]
    body.w[1] = R[3] * y[0] + R[4] * y[1] + R[5] * y[2]
    body.w[2] = R[6] * y[0] + R[7] * y[1] + R[8] * y[2]
    net.step(h, body)
    t += h
    if (phase === 'flight' && net.contactCount > 0) { phase = 'contact'; contactT = t; net.drawstring = true }
    if (phase === 'contact' && t - contactT > CAPTURE.decisionWindow) { phase = 'closing'; net.beginDrape(body, CAPTURE.closureDuration / 4) }
    if (i % 50 === 0) {
      net.measure()
      if (phase === 'flight' || phase === 'contact') maxStrain = Math.max(maxStrain, net.maxStrain)
      else maxStrainAfter = Math.max(maxStrainAfter, net.maxStrain)
    }
  }
  net.measure()
  console.log('run', JSON.stringify(w), 'contactT', contactT.toFixed(3), 'maxStrain pre-close', (maxStrain * 100).toFixed(1) + '%', 'post', (maxStrainAfter * 100).toFixed(1) + '%', 'enclosure', net.enclosure(body).toFixed(2))
}
run([0, 0, 0])
run([0, 0, 4.2])
