/**
 * Task A: principal moments of the CubeSat body model used by the solver.
 * Usage: node scripts/validation/inertia.mjs
 */
import { CUBESAT } from '../../src/physics/constants.js'
import { IX, IY, IZ, principalAxes } from '../../src/physics/rigidBody.js'

const [a, b, c] = CUBESAT.dims
const m = CUBESAT.mass
const box = [(m / 12) * (b * b + c * c), (m / 12) * (a * a + c * c), (m / 12) * (a * a + b * b)]

console.log('designation', CUBESAT.designation)
console.log('mass_kg', m)
console.log('dims_m [x,y,z]', JSON.stringify(CUBESAT.dims))
console.log('solver inertia source: CUBESAT.inertia in src/physics/constants.js -> IX,IY,IZ in src/physics/rigidBody.js')
console.log('solver Ix_kgm2', IX)
console.log('solver Iy_kgm2', IY)
console.log('solver Iz_kgm2', IZ)
console.log('uniform-box Ix_kgm2', box[0])
console.log('uniform-box Iy_kgm2', box[1])
console.log('uniform-box Iz_kgm2', box[2])
console.log('abs diff solver-box', JSON.stringify([IX - box[0], IY - box[1], IZ - box[2]]))

const sorted = [
  { axis: 'x', I: IX },
  { axis: 'y', I: IY },
  { axis: 'z', I: IZ },
].sort((p, q) => p.I - q.I)
console.log('ascending', sorted.map((s) => `${s.axis}=${s.I}`).join(' < '))
console.log('min_axis', sorted[0].axis, 'intermediate_axis', sorted[1].axis, 'max_axis', sorted[2].axis)
console.log('z_is_intermediate', sorted[1].axis === 'z')
console.log('principalAxes() from rigidBody.js', JSON.stringify(principalAxes()))
