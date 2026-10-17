import { CAPTURE, CUBESAT, NET, SOLVER, STRAIN_BANDS } from '../physics/constants.js'
import { NET_MASS, NODE_COUNT, NODE_MASS, REST_LENGTH } from '../physics/netTopology.js'
import { CAPTURE_STATUS } from '../physics/stateLayout.js'

export const DATASET_SCHEMA = 'ps-msc.debris-capture.telemetry/v3'

export const COLUMNS = Object.freeze([
  ['t_sim', 's'],
  ['t_wall', 'ISO-8601'],
  ['phase', '-'],
  ['capture_status', '-'],
  ['q0', '-'],
  ['q1', '-'],
  ['q2', '-'],
  ['q3', '-'],
  ['wx', 'rad/s'],
  ['wy', 'rad/s'],
  ['wz', 'rad/s'],
  ['Hx', 'N·m·s'],
  ['Hy', 'N·m·s'],
  ['Hz', 'N·m·s'],
  ['H_mag', 'N·m·s'],
  ['T_rot', 'J'],
  ['E_net_strain', 'J'],
  ['E_absorbed', 'J'],
  ['nutation', 'deg'],
  ['px', 'm'],
  ['py', 'm'],
  ['pz', 'm'],
  ['vx', 'm/s'],
  ['vy', 'm/s'],
  ['vz', 'm/s'],
  ['enclosure', '-'],
  ['strain_max', '-'],
  ['contacts', '-'],
])

const r6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null)

export class TelemetryRecorder {
  constructor(limit = 60000) {
    this.limit = limit
    this.rows = []
    this.lastT = -1
  }

  clear() {
    this.rows = []
    this.lastT = -1
  }

  record(s) {
    if (s.t === this.lastT) return
    this.lastT = s.t
    if (this.rows.length >= this.limit) this.rows.splice(0, this.rows.length - this.limit + 1)
    this.rows.push({
      t_sim: r6(s.t),
      t_wall: new Date().toISOString(),
      phase: s.phaseLabel,
      capture_status: CAPTURE_STATUS[s.phase],
      q0: r6(s.q[0]),
      q1: r6(s.q[1]),
      q2: r6(s.q[2]),
      q3: r6(s.q[3]),
      wx: r6(s.w[0]),
      wy: r6(s.w[1]),
      wz: r6(s.w[2]),
      Hx: r6(s.h[0]),
      Hy: r6(s.h[1]),
      Hz: r6(s.h[2]),
      H_mag: r6(s.hMag),
      T_rot: r6(s.ke),
      E_net_strain: r6(s.eNet),
      E_absorbed: r6(s.eAbs),
      nutation: r6(s.nutation),
      px: r6(s.p[0]),
      py: r6(s.p[1]),
      pz: r6(s.p[2]),
      vx: r6(s.v[0]),
      vy: r6(s.v[1]),
      vz: r6(s.v[2]),
      enclosure: r6(s.enclosure),
      strain_max: r6(s.strainMax),
      contacts: s.contacts,
    })
  }
}

export function buildDataset(rows, { decision, eta }) {
  return {
    schema: DATASET_SCHEMA,
    generated_at: new Date().toISOString(),
    source: {
      project: "Parth's MS Thesis — Space Debris Capture Digital Twin",
      engine: 'GNC Workbench v3',
      integrator: 'RK4 · Euler rigid-body equations + quaternion kinematics',
      net_solver: 'XPBD tension-only cable lattice · OBB contact · Coulomb friction',
      substep_s: SOLVER.substep,
      frames: {
        attitude: 'q = body → LVLH, scalar-first (q0, q1, q2, q3)',
        body_rates: 'body frame',
        angular_momentum: 'LVLH inertial frame',
        position: 'LVLH, origin at initial target centre of mass',
      },
    },
    model: {
      target: {
        designation: CUBESAT.designation,
        dims_m: CUBESAT.dims,
        mass_kg: CUBESAT.mass,
        inertia_kg_m2: { Ixx: CUBESAT.inertia[0], Iyy: CUBESAT.inertia[1], Izz: CUBESAT.inertia[2] },
      },
      net: {
        material: NET.material,
        size_m: NET.size,
        nodes: NODE_COUNT,
        rest_length_m: REST_LENGTH,
        youngs_modulus_pa: NET.youngsModulus,
        density_kg_m3: NET.density,
        friction: NET.friction,
        approach_speed_m_s: NET.approachSpeed,
        thread_diameter_m: NET.threadDiameter,
        woven_efficiency: eta,
        net_mass_kg: NET_MASS,
        node_mass_kg: NODE_MASS,
        corner_mass_kg: NET.cornerMass,
        strain_bands: STRAIN_BANDS,
      },
      capture_law: {
        rule: '|ωz| > wz_limit during the contact window ⇒ twist-out ejection',
        wz_limit_rad_s: CAPTURE.wzLimit,
        decision_window_s: CAPTURE.decisionWindow,
      },
    },
    outcome: decision,
    columns: COLUMNS.map(([name, unit]) => ({ name, unit })),
    sample_count: rows.length,
    samples: rows,
  }
}

export function toCSV(rows) {
  const header = COLUMNS.map(([name]) => name).join(',')
  const body = rows.map((row) => COLUMNS.map(([name]) => row[name] ?? '').join(','))
  return [header, ...body].join('\n')
}

export function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
