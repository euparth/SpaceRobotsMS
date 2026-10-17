import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const GRID = 12
const NET_SIZE = 2.0
const SAT_SCALE = 1.55
const SAT = {
  w: 0.227 * SAT_SCALE,
  h: 0.366 * SAT_SCALE,
  d: 0.240 * SAT_SCALE,
  mass: 30.0,
}
const NODE_MASS = 0.045
const CORNER_MASS = 0.85
const STIFFNESS = 220
const SHEAR_STIFFNESS = 70
const DAMPING = 0.55
const REST = NET_SIZE / (GRID - 1)
const APPROACH_SPEED = 10.0
const TIME_DILATION = 0.22
const WZ_LIMIT = 3.0
const MU = 0.2
const YOUNG_E = 120e9
const DENSITY = 1440

function inertiaTensor() {
  const { w, h, d, mass } = SAT
  return {
    ix: (mass / 12) * (h * h + d * d),
    iy: (mass / 12) * (w * w + d * d),
    iz: (mass / 12) * (w * w + h * h),
  }
}

function makeSolarTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#071018'
  ctx.fillRect(0, 0, 512, 512)
  const cols = 6
  const rows = 8
  const pad = 10
  const gw = (512 - pad * 2) / cols
  const gh = (512 - pad * 2) / rows
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = pad + i * gw
      const y = pad + j * gh
      const g = ctx.createLinearGradient(x, y, x + gw, y + gh)
      g.addColorStop(0, '#0b3a5c')
      g.addColorStop(0.45, '#165d86')
      g.addColorStop(1, '#0a2a44')
      ctx.fillStyle = g
      ctx.fillRect(x + 3, y + 3, gw - 6, gh - 6)
      ctx.strokeStyle = '#7dd3fc'
      ctx.globalAlpha = 0.28
      ctx.strokeRect(x + 3, y + 3, gw - 6, gh - 6)
      ctx.globalAlpha = 1
    }
  }
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, 504, 504)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeMliTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 256, 256)
  g.addColorStop(0, '#8a6a22')
  g.addColorStop(0.4, '#e8c547')
  g.addColorStop(0.7, '#b8860b')
  g.addColorStop(1, '#6b4f12')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  ctx.globalAlpha = 0.18
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = i % 2 ? '#fff3c4' : '#5a430c'
    ctx.beginPath()
    ctx.moveTo(0, i * 14)
    ctx.lineTo(256, i * 14 + 40)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeStarfield(count = 2800) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 40 + Math.random() * 180
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    pos[i * 3 + 2] = r * Math.cos(phi)
    const t = Math.random()
    col[i * 3] = 0.75 + t * 0.25
    col[i * 3 + 1] = 0.8 + t * 0.15
    col[i * 3 + 2] = 1
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
  return new THREE.Points(geo, mat)
}

function buildCubeSat() {
  const group = new THREE.Group()
  const solar = makeSolarTexture()
  const mli = makeMliTexture()
  const { w, h, d } = SAT

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    [
      new THREE.MeshStandardMaterial({ map: solar, metalness: 0.35, roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ map: solar, metalness: 0.35, roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ map: mli, metalness: 0.7, roughness: 0.28 }),
      new THREE.MeshStandardMaterial({ map: mli, metalness: 0.7, roughness: 0.28 }),
      new THREE.MeshStandardMaterial({ map: solar, metalness: 0.35, roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ map: solar, metalness: 0.35, roughness: 0.45 }),
    ],
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const railMat = new THREE.MeshStandardMaterial({
    color: 0xc9d2dc,
    metalness: 0.85,
    roughness: 0.22,
  })
  const railT = 0.012
  const edges = [
    [w / 2, h / 2, 0, railT, railT, d + 0.02],
    [-w / 2, h / 2, 0, railT, railT, d + 0.02],
    [w / 2, -h / 2, 0, railT, railT, d + 0.02],
    [-w / 2, -h / 2, 0, railT, railT, d + 0.02],
  ]
  edges.forEach(([x, y, z, sx, sy, sz]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), railMat)
    m.position.set(x, y, z)
    group.add(m)
  })

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.28, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.8, roughness: 0.2 }),
  )
  antenna.position.set(0, h / 2 + 0.14, 0)
  group.add(antenna)

  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(0.035, 0.04, 16),
    new THREE.MeshStandardMaterial({ color: 0xf5d76e, metalness: 0.6, roughness: 0.3 }),
  )
  dish.rotation.x = Math.PI
  dish.position.set(0.04, -h / 2 - 0.02, 0.02)
  group.add(dish)

  const label = makeLabelTexture('12U TARGET')
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.04),
    new THREE.MeshBasicMaterial({ map: label, transparent: true }),
  )
  badge.position.set(0, 0.02, d / 2 + 0.001)
  group.add(badge)

  group.userData.half = new THREE.Vector3(w / 2, h / 2, d / 2)
  return group
}

function makeLabelTexture(text) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const ctx = c.getContext('2d')
  ctx.fillStyle = 'rgba(2,6,23,0.85)'
  ctx.fillRect(0, 0, 256, 64)
  ctx.strokeStyle = '#22d3ee'
  ctx.strokeRect(4, 4, 248, 56)
  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(text, 128, 42)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function buildChaser() {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.22, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.55, roughness: 0.4 }),
  )
  g.add(body)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.012, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0e7490, emissiveIntensity: 0.6 }),
  )
  ring.position.z = -0.28
  g.add(ring)
  const boom = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.04, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.3 }),
  )
  boom.position.z = -0.48
  g.add(boom)
  g.position.set(0, 0, 3.55)
  return g
}

function createNetState(startZ) {
  const nodes = []
  const compact = 0.55
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const u = i / (GRID - 1)
      const v = j / (GRID - 1)
      const corner =
        (i === 0 || i === GRID - 1) && (j === 0 || j === GRID - 1)
      nodes.push({
        i,
        j,
        corner,
        mass: corner ? CORNER_MASS : NODE_MASS,
        p: new THREE.Vector3(
          (u - 0.5) * NET_SIZE * compact,
          (v - 0.5) * NET_SIZE * compact,
          startZ + (Math.random() - 0.5) * 0.02,
        ),
        v: new THREE.Vector3(),
        f: new THREE.Vector3(),
        lockedLocal: null,
      })
    }
  }

  const springs = []
  const idx = (i, j) => j * GRID + i
  const add = (a, b, k, restScale = 1) => {
    springs.push({ a, b, k, rest: nodes[a].p.distanceTo(nodes[b].p) * restScale })
  }
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      if (i + 1 < GRID) add(idx(i, j), idx(i + 1, j), STIFFNESS)
      if (j + 1 < GRID) add(idx(i, j), idx(i, j + 1), STIFFNESS)
      if (i + 1 < GRID && j + 1 < GRID) add(idx(i, j), idx(i + 1, j + 1), SHEAR_STIFFNESS)
      if (i + 1 < GRID && j - 1 >= 0) add(idx(i, j), idx(i + 1, j - 1), SHEAR_STIFFNESS)
    }
  }

  springs.forEach((s) => {
    s.rest = REST * (s.k === SHEAR_STIFFNESS ? Math.SQRT2 : 1)
  })

  return { nodes, springs, startZ }
}

function buildNetMeshes(nodes) {
  const positions = new Float32Array(nodes.length * 3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const segs = []
  const idx = (i, j) => j * GRID + i
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      if (i + 1 < GRID) segs.push(idx(i, j), idx(i + 1, j))
      if (j + 1 < GRID) segs.push(idx(i, j), idx(i, j + 1))
    }
  }
  geo.setIndex(segs)

  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0xe8b923,
      transparent: true,
      opacity: 0.92,
    }),
  )

  const pts = new THREE.Points(
    geo.clone(),
    new THREE.PointsMaterial({
      color: 0xffe08a,
      size: 0.028,
      transparent: true,
      opacity: 0.85,
    }),
  )

  const cornerMeshes = nodes
    .filter((n) => n.corner)
    .map(() => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 16, 16),
        new THREE.MeshStandardMaterial({
          color: 0xb45309,
          metalness: 0.4,
          roughness: 0.35,
          emissive: 0x7c2d12,
          emissiveIntensity: 0.25,
        }),
      )
      return m
    })

  return { lines, pts, cornerMeshes }
}

function syncNetGeometry(nodes, lines, pts, cornerMeshes) {
  const arr = lines.geometry.attributes.position.array
  const arr2 = pts.geometry.attributes.position.array
  let c = 0
  for (let n = 0; n < nodes.length; n++) {
    const p = nodes[n].p
    arr[n * 3] = p.x
    arr[n * 3 + 1] = p.y
    arr[n * 3 + 2] = p.z
    arr2[n * 3] = p.x
    arr2[n * 3 + 1] = p.y
    arr2[n * 3 + 2] = p.z
    if (nodes[n].corner) {
      cornerMeshes[c].position.copy(p)
      c++
    }
  }
  lines.geometry.attributes.position.needsUpdate = true
  pts.geometry.attributes.position.needsUpdate = true
  lines.geometry.computeBoundingSphere()
}

const _drape = new THREE.Vector3()
function drapeTarget(i, j, sat, amount, out = _drape) {
  const u = (i / (GRID - 1)) * 2 - 1
  const v = (j / (GRID - 1)) * 2 - 1
  const r = Math.hypot(u, v)
  const rn = Math.min(1, r / Math.SQRT2)
  const phi = rn * Math.PI * amount
  const theta = Math.atan2(v, u)
  const rx = SAT.w * 0.5 + 0.07
  const ry = SAT.h * 0.5 + 0.07
  const rz = SAT.d * 0.5 + 0.07
  const s = r < 1e-6 ? 0 : 1
  out.set(
    rx * Math.sin(phi) * Math.cos(theta) * s,
    ry * Math.sin(phi) * Math.sin(theta) * s,
    rz * Math.cos(phi),
  )
  out.applyQuaternion(sat.quaternion)
  out.add(sat.position)
  return out
}

function collideNodeWithBox(node, sat, omega, dt, contacting) {
  const half = sat.userData.half
  const local = sat.worldToLocal(node.p.clone())
  const hx = half.x + 0.02
  const hy = half.y + 0.02
  const hz = half.z + 0.02
  const inside =
    Math.abs(local.x) < hx && Math.abs(local.y) < hy && Math.abs(local.z) < hz
  if (!inside) return false

  const dx = hx - Math.abs(local.x)
  const dy = hy - Math.abs(local.y)
  const dz = hz - Math.abs(local.z)
  if (dx <= dy && dx <= dz) local.x = Math.sign(local.x || 1) * hx
  else if (dy <= dz) local.y = Math.sign(local.y || 1) * hy
  else local.z = Math.sign(local.z || 1) * hz

  const world = sat.localToWorld(local)
  const r = world.clone().sub(sat.position)
  const surfaceVel = new THREE.Vector3().copy(omega).cross(r)
  const incoming = node.v.clone()
  const nrm = world.clone().sub(node.p)
  if (nrm.lengthSq() < 1e-8) nrm.set(0, 0, 1)
  nrm.normalize()
  const rel = incoming.clone().sub(surfaceVel)
  const vn = rel.dot(nrm)
  if (vn < 0) rel.addScaledVector(nrm, -1.15 * vn)
  const tan = rel.clone().addScaledVector(nrm, -rel.dot(nrm))
  tan.multiplyScalar(Math.max(0, 1 - MU * 1.8))
  node.p.copy(world)
  node.v.copy(surfaceVel).add(tan).addScaledVector(nrm, 0.08)
  contacting.push({ node, r, nrm })
  return true
}

function computeEnclosure(nodes, sat) {
  const oct = new Array(8).fill(0)
  let near = 0
  const center = sat.position
  const reach = SAT.w + SAT.h + 0.35
  nodes.forEach((n) => {
    const d = n.p.distanceTo(center)
    if (d < reach) {
      near++
      const dx = n.p.x >= center.x ? 1 : 0
      const dy = n.p.y >= center.y ? 1 : 0
      const dz = n.p.z >= center.z ? 1 : 0
      oct[dx + dy * 2 + dz * 4]++
    }
  })
  const occupied = oct.filter((v) => v > 3).length
  const coverage = occupied / 8
  const density = Math.min(1, near / (nodes.length * 0.55))
  return Math.max(0, Math.min(1, coverage * 0.7 + density * 0.3))
}

function kineticEnergy(omega) {
  const I = inertiaTensor()
  return 0.5 * (I.ix * omega.x ** 2 + I.iy * omega.y ** 2 + I.iz * omega.z ** 2)
}

function netEnergy(nodes, springs) {
  let e = 0
  const tmp = new THREE.Vector3()
  springs.forEach((s) => {
    tmp.copy(nodes[s.b].p).sub(nodes[s.a].p)
    const stretch = tmp.length() - s.rest
    e += 0.5 * s.k * stretch * stretch
  })
  nodes.forEach((n) => {
    e += 0.5 * n.mass * n.v.lengthSq()
  })
  return e
}

export default function Canvas3D({ omega, launched, epoch, onTelemetry }) {
  const mountRef = useRef(null)
  const omegaRef = useRef(omega)
  const launchedRef = useRef(launched)
  const telemetryRef = useRef(onTelemetry)

  useEffect(() => {
    omegaRef.current = omega
  }, [omega])
  useEffect(() => {
    launchedRef.current = launched
  }, [launched])
  useEffect(() => {
    telemetryRef.current = onTelemetry
  }, [onTelemetry])

  useEffect(() => {
    const mount = mountRef.current
    const width = mount.clientWidth
    const height = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.shadowMap.enabled = true
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.setClearColor(0x020617, 1)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x020617, 0.012)

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.05, 400)
    camera.position.set(2.05, 1.15, 3.55)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.maxDistance = 12
    controls.minDistance = 1.4
    controls.target.set(0, 0, 0.25)

    scene.add(new THREE.AmbientLight(0x6b7c99, 0.35))
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.65)
    sun.position.set(6, 8, 4)
    sun.castShadow = true
    scene.add(sun)
    const rim = new THREE.DirectionalLight(0x67e8f9, 0.55)
    rim.position.set(-5, 1, -4)
    scene.add(rim)
    const fill = new THREE.PointLight(0x38bdf8, 0.4, 20)
    fill.position.set(0, 2, 3)
    scene.add(fill)

    scene.add(makeStarfield())

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(28, 48, 48),
      new THREE.MeshPhongMaterial({
        color: 0x16324f,
        emissive: 0x04101c,
        shininess: 12,
        specular: 0x224466,
      }),
    )
    earth.position.set(-8, -32, -18)
    scene.add(earth)
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(29.2, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.08,
        side: THREE.BackSide,
      }),
    )
    atmo.position.copy(earth.position)
    scene.add(atmo)

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(7.5, 0.004, 8, 128),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.18 }),
    )
    orbit.rotation.x = Math.PI / 2.4
    scene.add(orbit)

    const sat = buildCubeSat()
    scene.add(sat)
    const chaser = buildChaser()
    scene.add(chaser)

    const netStartZ = 2.35
    let net = createNetState(netStartZ)
    const netMeshes = buildNetMeshes(net.nodes)
    scene.add(netMeshes.lines)
    scene.add(netMeshes.pts)
    netMeshes.cornerMeshes.forEach((m) => scene.add(m))
    syncNetGeometry(net.nodes, netMeshes.lines, netMeshes.pts, netMeshes.cornerMeshes)

    const tmp = new THREE.Vector3()
    const omegaVec = new THREE.Vector3()
    const satVel = new THREE.Vector3()
    const qDot = new THREE.Quaternion()

    let phase = 'idle'
    let wrapT = 0
    let failT = 0
    let initialKe = 0
    let fired = false
    let elapsed = 0
    let last = performance.now()
    let raf = 0
    const frozenOmega = new THREE.Vector3()

    const launchNet = () => {
      if (fired) return
      fired = true
      phase = 'flight'
      const visualSpeed = APPROACH_SPEED * TIME_DILATION
      net.nodes.forEach((n) => {
        const outward = new THREE.Vector3(n.p.x, n.p.y, 0)
        if (outward.lengthSq() > 1e-6) outward.normalize()
        n.v.set(
          outward.x * (n.corner ? 1.15 : 0.45),
          outward.y * (n.corner ? 1.15 : 0.45),
          -visualSpeed,
        )
      })
      frozenOmega.set(omegaRef.current.wx, omegaRef.current.wy, omegaRef.current.wz)
      omegaVec.copy(frozenOmega)
      initialKe = kineticEnergy(omegaVec)
    }

    const resetLocal = () => {
      phase = 'idle'
      fired = false
      wrapT = 0
      failT = 0
      sat.position.set(0, 0, 0)
      sat.quaternion.identity()
      satVel.set(0, 0, 0)
      net = createNetState(netStartZ)
      syncNetGeometry(net.nodes, netMeshes.lines, netMeshes.pts, netMeshes.cornerMeshes)
    }

    const stepNet = (dt) => {
      const nodes = net.nodes
      const springs = net.springs
      nodes.forEach((n) => n.f.set(0, 0, 0))

      if (phase === 'flight' || phase === 'failed') {
        springs.forEach((s) => {
          const a = nodes[s.a]
          const b = nodes[s.b]
          tmp.copy(b.p).sub(a.p)
          const dist = tmp.length() || 1e-6
          const stretch = dist - s.rest
          tmp.multiplyScalar((s.k * stretch) / dist)
          a.f.add(tmp)
          b.f.sub(tmp)
        })
      }

      if (phase === 'flight') {
        nodes.forEach((n) => {
          n.f.z -= n.mass * 1.6
        })
      }

      const contacting = []
      const wrapAmount =
        phase === 'secured'
          ? 1
          : phase === 'failed'
            ? Math.max(0.18, 0.7 - failT * 0.55)
            : Math.min(frozenOmega.z > WZ_LIMIT ? 0.64 : 1, wrapT / 1.2)

      nodes.forEach((n) => {
        if (n.lockedLocal && phase === 'secured') {
          n.p.copy(n.lockedLocal).applyQuaternion(sat.quaternion).add(sat.position)
          n.v.set(0, 0, 0)
          return
        }

        if (phase === 'wrap' || phase === 'secured') {
          drapeTarget(n.i, n.j, sat, wrapAmount, tmp)
          n.p.lerp(tmp, 1 - Math.exp(-dt * 5.2))
          n.v.set(0, 0, 0)
          collideNodeWithBox(n, sat, omegaVec, dt, contacting)
        } else if (phase === 'failed') {
          const r = tmp.copy(n.p).sub(sat.position)
          n.v.add(new THREE.Vector3().copy(omegaVec).cross(r).multiplyScalar(dt * 0.45))
          n.v.addScaledVector(n.f, dt / n.mass)
          n.v.multiplyScalar(Math.exp(-0.35 * dt))
          n.p.addScaledVector(n.v, dt)
        } else {
          n.v.addScaledVector(n.f, dt / n.mass)
          n.v.multiplyScalar(Math.exp(-DAMPING * dt))
          n.p.addScaledVector(n.v, dt)
          collideNodeWithBox(n, sat, omegaVec, dt, contacting)
        }
      })

      if (phase === 'flight') {
        const mid = nodes[(Math.floor(GRID / 2) * GRID) + Math.floor(GRID / 2)]
        const reached =
          contacting.length > 2 ||
          mid.p.z < SAT.d * 0.5 + 0.18 ||
          mid.p.distanceTo(sat.position) < 0.42
        if (reached) phase = 'wrap'
      }
      return contacting.length
    }

    const lockNet = () => {
      net.nodes.forEach((n) => {
        drapeTarget(n.i, n.j, sat, 1, tmp)
        n.p.copy(tmp)
        n.lockedLocal = n.p.clone().sub(sat.position).applyQuaternion(sat.quaternion.clone().invert())
        n.v.set(0, 0, 0)
      })
      phase = 'secured'
    }

    const ejectTarget = () => {
      phase = 'failed'
      failT = 0
      const spin = Math.max(omegaVec.z, 0.5)
      satVel.set(0.35 * spin, 0.12 * spin, -1.15)
      net.nodes.forEach((n) => {
        const r = n.p.clone().sub(sat.position)
        const kick = new THREE.Vector3().copy(omegaVec).cross(r).multiplyScalar(0.55)
        n.v.copy(kick)
        n.v.x += (Math.random() - 0.5) * 1.1
        n.v.y += 0.35 + Math.random() * 0.4
        n.lockedLocal = null
      })
    }

    const tick = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      elapsed += dt

      if (launchedRef.current && phase === 'idle') launchNet()
      if (!launchedRef.current && phase !== 'idle' && !fired) resetLocal()

      if (phase === 'idle') {
        omegaVec.set(omegaRef.current.wx, omegaRef.current.wy, omegaRef.current.wz)
      } else if (phase === 'flight' || phase === 'wrap') {
        omegaVec.copy(frozenOmega)
      }

      if (phase !== 'idle') {
        const steps = 3
        const h = dt / steps
        for (let s = 0; s < steps; s++) stepNet(h)
      }

      if (phase === 'wrap') {
        wrapT += dt
        if (frozenOmega.z > WZ_LIMIT) {
          if (wrapT > 1.05) ejectTarget()
        } else if (wrapT > 1.35) {
          lockNet()
        }
      }

      if (phase === 'failed') failT += dt

      if (phase === 'secured') {
        omegaVec.multiplyScalar(Math.max(0.12, 1 - dt * 0.9))
        satVel.multiplyScalar(0.9)
      }

      if (phase !== 'idle') {
        const w = omegaVec.length()
        if (w > 1e-6) {
          qDot.setFromAxisAngle(omegaVec.clone().normalize(), w * dt)
          sat.quaternion.premultiply(qDot)
        }
        sat.position.addScaledVector(satVel, dt)
      } else {
        const live = omegaRef.current
        omegaVec.set(live.wx, live.wy, live.wz)
        const w = omegaVec.length()
        if (w > 1e-6) {
          qDot.setFromAxisAngle(omegaVec.clone().normalize(), w * dt)
          sat.quaternion.premultiply(qDot)
        }
      }

      earth.rotation.y += dt * 0.02
      chaser.position.y = Math.sin(elapsed * 0.7) * 0.03
      if (phase === 'idle') {
        net.nodes.forEach((n) => {
          n.p.x += Math.sin(elapsed * 1.4 + n.i) * 0.00015
          n.p.y += Math.cos(elapsed * 1.1 + n.j) * 0.00015
        })
      }

      syncNetGeometry(net.nodes, netMeshes.lines, netMeshes.pts, netMeshes.cornerMeshes)
      controls.update()
      renderer.render(scene, camera)

      const enclosureRaw = computeEnclosure(net.nodes, sat)
      let enclosure = 0
      let status = 'STANDBY'
      let critical = false
      if (phase === 'idle') {
        enclosure = 0
        status = 'STANDBY'
      } else if (phase === 'flight') {
        enclosure = enclosureRaw * 12
        status = 'NET IN FLIGHT'
      } else if (phase === 'wrap') {
        enclosure = Math.min(0.92, 0.28 + wrapT * 0.4 + enclosureRaw * 0.5)
        status = omegaVec.z > WZ_LIMIT ? 'UNSTABLE CONTACT' : 'ENVELOPING TARGET'
      } else if (phase === 'secured') {
        enclosure = 1
        status = 'SECURED'
      } else if (phase === 'failed') {
        enclosure = Math.max(0.06, 0.58 - failT * 0.45)
        status = 'FAILED - TARGET EJECTED'
        critical = true
      }
      const ke = kineticEnergy(omegaVec)
      const ne = phase === 'idle' ? 0 : netEnergy(net.nodes, net.springs)
      let transfer = 0
      if (phase === 'secured') transfer = 1
      else if (phase === 'failed') transfer = Math.min(0.42, ne / (initialKe + ne + 1e-6))
      else if (initialKe > 1e-4) transfer = Math.min(0.95, Math.max(0, (initialKe - ke) / initialKe) * enclosure + (ne / (initialKe + 80)) * 0.15)
      else if (phase === 'wrap' || phase === 'flight') transfer = enclosure * 0.35

      telemetryRef.current?.({
        wx: omegaVec.x,
        wy: omegaVec.y,
        wz: omegaVec.z,
        enclosure: Math.max(0, Math.min(1, enclosure)),
        energyTransfer: Math.max(0, Math.min(1, transfer)),
        keSat: ke,
        keNet: ne,
        status,
        phase,
        contact: phase === 'wrap' || phase === 'secured' || phase === 'failed',
        warning: omegaRef.current.wz > WZ_LIMIT,
        critical,
        approach: APPROACH_SPEED,
        youngE: YOUNG_E,
        density: DENSITY,
        mu: MU,
        elapsed,
        material: 'Kevlar 49',
      })

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    const onResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [epoch])

  return <div ref={mountRef} className="absolute inset-0 h-full w-full" />
}
