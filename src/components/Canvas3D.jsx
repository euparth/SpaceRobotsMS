import { reducedMotion } from '../motion.js'
import { VIEW_PRESETS } from './viewPresets.js'
import { memo, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CUBESAT, NET } from '../physics/constants.js'
import { CORNER_NODES, NODE_COUNT, SEGMENTS, TRIANGLES } from '../physics/netTopology.js'
import { F, NODE_POSITION_OFFSET, NODE_STRAIN_OFFSET } from '../physics/stateLayout.js'
import { createStressMaterial } from '../shaders/stressShader.js'
import { cx } from './ui.jsx'

export { VIEW_PRESETS } from './viewPresets.js'

/**
 * Runs `build` (which returns a dispose function) one task after mount, so the panels and
 * dialogs paint before the WebGL context, PMREM environment and geometry are created
 * (release 1.0, 6b). The physics worker does not depend on this and is already running.
 */
function deferred(build) {
  let dispose = null
  let cancelled = false
  const schedule = window.requestIdleCallback ? (cb) => window.requestIdleCallback(cb, { timeout: 250 }) : (cb) => setTimeout(cb, 0)
  schedule(() => {
    if (!cancelled) dispose = build()
  })
  return () => {
    cancelled = true
    if (dispose) dispose()
  }
}

const TRAIL_LENGTH = 360
const GIZMO_SIZE = 84

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d'), width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function solarPanelTexture() {
  return canvasTexture(512, 768, (ctx, w, h) => {
    ctx.fillStyle = '#0b1017'
    ctx.fillRect(0, 0, w, h)
    const cols = 4
    const rows = 6
    const pad = 20
    const gap = 6
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols
    const ch = (h - pad * 2 - gap * (rows - 1)) / rows
    const clip = 9
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = pad + c * (cw + gap)
        const y = pad + r * (ch + gap)
        const g = ctx.createLinearGradient(x, y, x + cw, y + ch)
        g.addColorStop(0, '#22315d')
        g.addColorStop(0.55, '#152250')
        g.addColorStop(1, '#0c1533')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.moveTo(x + clip, y)
        ctx.lineTo(x + cw - clip, y)
        ctx.lineTo(x + cw, y + clip)
        ctx.lineTo(x + cw, y + ch - clip)
        ctx.lineTo(x + cw - clip, y + ch)
        ctx.lineTo(x + clip, y + ch)
        ctx.lineTo(x, y + ch - clip)
        ctx.lineTo(x, y + clip)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.05)'
        ctx.lineWidth = 1
        for (let f = y + 6; f < y + ch; f += 6) {
          ctx.beginPath()
          ctx.moveTo(x + 2, f)
          ctx.lineTo(x + cw - 2, f)
          ctx.stroke()
        }
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.32)'
        for (const bx of [0.33, 0.66]) {
          ctx.beginPath()
          ctx.moveTo(x + cw * bx, y + 3)
          ctx.lineTo(x + cw * bx, y + ch - 3)
          ctx.stroke()
        }
      }
    }
    ctx.strokeStyle = '#9aa4af'
    ctx.lineWidth = 12
    ctx.strokeRect(6, 6, w - 12, h - 12)
  })
}

function endPlateTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#717b86'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 260; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.03})`
      const y = Math.random() * h
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y + (Math.random() - 0.5) * 4)
      ctx.stroke()
    }
    ctx.fillStyle = '#1d232b'
    ctx.beginPath()
    ctx.arc(w * 0.33, h * 0.5, 62, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#a7b0ba'
    ctx.lineWidth = 6
    ctx.stroke()
    const lens = ctx.createRadialGradient(w * 0.31, h * 0.48, 4, w * 0.33, h * 0.5, 48)
    lens.addColorStop(0, '#3b4c6b')
    lens.addColorStop(1, '#05070a')
    ctx.fillStyle = lens
    ctx.beginPath()
    ctx.arc(w * 0.33, h * 0.5, 44, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2a3038'
    ctx.fillRect(w * 0.62, h * 0.3, 110, 34)
    ctx.fillRect(w * 0.62, h * 0.62, 70, 26)
    ctx.fillStyle = '#c9d1da'
    ctx.font = '600 22px "IBM Plex Mono", monospace'
    ctx.fillText('PS-MSC · 12U', w * 0.58, h * 0.88)
    ctx.strokeStyle = '#4b535d'
    ctx.lineWidth = 10
    ctx.strokeRect(5, 5, w - 10, h - 10)
  })
}

function buildCubeSat() {
  const [w, h, d] = CUBESAT.dims
  const group = new THREE.Group()
  const solar = new THREE.MeshStandardMaterial({ map: solarPanelTexture(), metalness: 0.45, roughness: 0.32 })
  const plate = new THREE.MeshStandardMaterial({ map: endPlateTexture(), metalness: 0.75, roughness: 0.38 })
  group.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [solar, solar, plate, plate, solar, solar]))

  const rail = new THREE.MeshStandardMaterial({ color: 0xb7bec7, metalness: 0.9, roughness: 0.28 })
  const railGeometry = new THREE.BoxGeometry(0.0085, h + 0.012, 0.0085)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(railGeometry, rail)
      m.position.set((sx * w) / 2, 0, (sz * d) / 2)
      group.add(m)
    }
  }

  const tape = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.7, roughness: 0.3 })
  for (const sx of [-1, 1]) {
    const whip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.0008, 0.006), tape)
    whip.position.set(sx * (w / 2 + 0.085), h / 2 - 0.012, 0)
    group.add(whip)
  }

  const patch = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.004, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.25 }),
  )
  patch.position.set(0.045, h / 2 + 0.002, -0.05)
  group.add(patch)

  const baffle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.024, 0.04, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x15191f, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide }),
  )
  baffle.position.set(-0.05, -h / 2 - 0.02, 0.05)
  group.add(baffle)

  const axisGeometry = new THREE.BufferGeometry()
  axisGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0, 0.36, 0, 0, 0, 0, 0, 0, 0.3], 3),
  )
  axisGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute([1, 0.36, 0.36, 1, 0.36, 0.36, 0.3, 0.86, 0.5, 0.3, 0.86, 0.5, 0.38, 0.6, 1, 0.38, 0.6, 1], 3),
  )
  const axes = new THREE.LineSegments(
    axisGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }),
  )
  axes.renderOrder = 10
  group.add(axes)

  return { group, axes }
}

function buildDeployer() {
  const group = new THREE.Group()
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x1b2129, metalness: 0.5, roughness: 0.55 }),
  )
  hull.position.z = NET.standoff + 0.6
  group.add(hull)
  const mli = new THREE.Mesh(
    new THREE.BoxGeometry(0.505, 0.18, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xb8902c, metalness: 0.85, roughness: 0.35 }),
  )
  mli.position.set(0, 0.12, NET.standoff + 0.62)
  group.add(mli)
  const canister = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.26, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }),
  )
  canister.rotation.x = Math.PI / 2
  canister.position.z = NET.standoff + 0.17
  group.add(canister)
  return group
}

function buildStars() {
  const group = new THREE.Group()
  for (const [count, size, opacity] of [
    [4200, 1.0, 0.75],
    [500, 1.9, 0.95],
  ]) {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 120 + Math.random() * 120
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)
      const warm = Math.random()
      colors[i * 3] = 0.82 + warm * 0.18
      colors[i * 3 + 1] = 0.85 + warm * 0.1
      colors[i * 3 + 2] = 1
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    group.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity, depthWrite: false }),
      ),
    )
  }
  return group
}

function buildEarth() {
  const group = new THREE.Group()
  const radius = 110
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 64),
    new THREE.MeshStandardMaterial({ color: 0x061322, roughness: 1, metalness: 0, emissive: 0x01040a }),
  )
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.022, 64, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 4.0);
          gl_FragColor = vec4(vec3(0.2, 0.48, 1.0) * rim * 0.85, rim * 0.8);
          #include <colorspace_fragment>
        }
      `,
    }),
  )
  group.add(globe, atmosphere)
  return group
}

function buildReference() {
  const group = new THREE.Group()
  const polar = new THREE.PolarGridHelper(3.2, 16, 8, 96, 0x2b3644, 0x1a222d)
  polar.position.set(0, -0.6, 1.3)
  polar.material.transparent = true
  polar.material.opacity = 0.55
  group.add(polar)

  const los = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, NET.standoff)]),
    new THREE.LineDashedMaterial({ color: 0x64748b, dashSize: 0.05, gapSize: 0.04, transparent: true, opacity: 0.6 }),
  )
  los.computeLineDistances()
  group.add(los)
  return group
}

function buildNet() {
  const position = new THREE.BufferAttribute(new Float32Array(NODE_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const strain = new THREE.BufferAttribute(new Float32Array(NODE_COUNT), 1).setUsage(THREE.DynamicDrawUsage)

  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute('position', position)
  lineGeometry.setAttribute('aStrain', strain)
  lineGeometry.setIndex(new THREE.BufferAttribute(new Uint16Array(SEGMENTS), 1))

  const surfaceGeometry = new THREE.BufferGeometry()
  surfaceGeometry.setAttribute('position', position)
  surfaceGeometry.setAttribute('aStrain', strain)
  surfaceGeometry.setIndex(new THREE.BufferAttribute(new Uint16Array(TRIANGLES), 1))

  const knotGeometry = new THREE.BufferGeometry()
  knotGeometry.setAttribute('position', position)
  knotGeometry.setAttribute('aStrain', strain)

  const materials = [
    createStressMaterial({ variant: 'line', opacity: 0.95 }),
    createStressMaterial({ variant: 'points', opacity: 0.95, pointSize: 3.4 }),
    createStressMaterial({ variant: 'surface', opacity: 0.07 }),
  ]
  const lines = new THREE.LineSegments(lineGeometry, materials[0])
  const knots = new THREE.Points(knotGeometry, materials[1])
  const membrane = new THREE.Mesh(surfaceGeometry, materials[2])
  for (const obj of [lines, knots, membrane]) obj.frustumCulled = false
  knots.renderOrder = 2
  membrane.renderOrder = 1

  const cornerMaterial = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.85, roughness: 0.3 })
  const cornerGeometry = new THREE.SphereGeometry(0.022, 20, 20)
  const corners = CORNER_NODES.map(() => new THREE.Mesh(cornerGeometry, cornerMaterial))

  return { position, strain, lines, knots, membrane, corners, materials }
}

function labelSprite(text, color) {
  const texture = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = color
    ctx.font = '600 40px "IBM Plex Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 32, 34)
  })
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }))
  sprite.scale.setScalar(0.55)
  return sprite
}

function buildGizmo() {
  const scene = new THREE.Scene()
  const axes = [
    ['X', 0xf87171, '#f87171', [1, 0, 0]],
    ['Y', 0x4ade80, '#4ade80', [0, 1, 0]],
    ['Z', 0x60a5fa, '#60a5fa', [0, 0, 1]],
  ]
  for (const [label, hex, css, dir] of axes) {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(...dir).multiplyScalar(0.85)])
    scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: hex, depthTest: false })))
    const sprite = labelSprite(label, css)
    sprite.position.set(...dir.map((v) => v * 1.12))
    scene.add(sprite)
  }
  const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10)
  return { scene, camera }
}

function arrow(color) {
  const a = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.3, color, 0.05, 0.026)
  a.line.material.depthTest = false
  a.cone.material.depthTest = false
  a.line.material.transparent = true
  a.cone.material.transparent = true
  a.renderOrder = 11
  return a
}

function disposeScene(root) {
  root.traverse((obj) => {
    obj.geometry?.dispose()
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
    for (const m of mats) {
      m.map?.dispose()
      m.dispose()
    }
  })
}

function Canvas3D({ stateRef, view, layers, tourHighlight, aiRef }) {
  const hostRef = useRef(null)
  const reticleRef = useRef(null)
  const reticleBoxRef = useRef(null)
  const reticleLabelRef = useRef(null)
  const viewRef = useRef(view)
  const layersRef = useRef(layers)
  const aiOverlayRef = useRef(aiRef)
  const apiRef = useRef(null)

  useEffect(() => {
    aiOverlayRef.current = aiRef
  }, [aiRef])

  useEffect(() => deferred(() => {
    const host = hostRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.autoClear = false
    renderer.setClearColor(0x05070a, 1)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    // Backdrop (stars, Earth) and the PMREM environment are added in later idle tasks so the
    // first frame with the target and net appears sooner and no single task exceeds ~50 ms.
    let pmrem = null
    let environment = null
    const earth = new THREE.Group()
    earth.position.set(-40, -220, -160)
    scene.add(earth)
    const laterTasks = []
    const later = (fn) => {
      const id = window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 16)
      laterTasks.push(id)
    }
    const cancelLater = () => {
      for (const id of laterTasks) (window.cancelIdleCallback ?? clearTimeout)(id)
    }
    later(() => scene.add(buildStars()))
    later(() => {
      const built = buildEarth()
      earth.add(...built.children)
    })
    later(() => {
      pmrem = new THREE.PMREMGenerator(renderer)
      environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      scene.environment = environment
      scene.environmentIntensity = 0.16
    })

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 600)
    camera.position.fromArray(VIEW_PRESETS.iso.position)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 0.6
    controls.maxDistance = 18
    controls.target.fromArray(VIEW_PRESETS.iso.target)

    scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x0b0f14, 0.32))
    const sun = new THREE.DirectionalLight(0xfff3df, 2.7)
    sun.position.set(5, 6, 3)
    scene.add(sun)
    const earthshine = new THREE.DirectionalLight(0x3b6ea8, 0.55)
    earthshine.position.set(0, -6, -2)
    scene.add(earthshine)
    const rim = new THREE.DirectionalLight(0x9ec5ff, 0.6)
    rim.position.set(-4, 2, -5)
    scene.add(rim)

    const reference = buildReference()
    scene.add(reference)
    scene.add(buildDeployer())

    const { group: sat, axes: bodyAxes } = buildCubeSat()
    scene.add(sat)

    const net = buildNet()
    scene.add(net.membrane, net.lines, net.knots, ...net.corners)

    const hArrow = arrow(0xe2e8f0)
    const wArrow = arrow(0xe879f9)
    scene.add(hArrow, wArrow)

    const trailRel = new Float32Array(TRAIL_LENGTH * 3)
    const trailGeometry = new THREE.BufferGeometry()
    const trailPositions = new THREE.BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3).setUsage(THREE.DynamicDrawUsage)
    trailGeometry.setAttribute('position', trailPositions)
    trailGeometry.setDrawRange(0, 0)
    const trail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({ color: 0xe879f9, transparent: true, opacity: 0.45, depthTest: false }),
    )
    trail.frustumCulled = false
    trail.renderOrder = 9
    scene.add(trail)
    let trailCount = 0
    let lastT = -1

    // AI surrogate overlays: approach neural line + contact ring on +Z face
    const neuralGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, NET.standoff),
      new THREE.Vector3(0, 0, 0),
    ])
    const neuralMat = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
    })
    const neuralLine = new THREE.Line(neuralGeom, neuralMat)
    neuralLine.renderOrder = 12
    neuralLine.visible = false
    scene.add(neuralLine)

    const ringGeom = new THREE.RingGeometry(0.12, 0.16, 48)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthTest: false,
    })
    const contactRing = new THREE.Mesh(ringGeom, ringMat)
    contactRing.rotation.x = Math.PI / 2
    contactRing.visible = false
    contactRing.renderOrder = 13
    scene.add(contactRing)

    const gizmo = buildGizmo()

    const desiredPosition = new THREE.Vector3().fromArray(VIEW_PRESETS.iso.position)
    const desiredTarget = new THREE.Vector3().fromArray(VIEW_PRESETS.iso.target)
    const trackOffset = new THREE.Vector3().fromArray(VIEW_PRESETS.track.offset)
    let tweening = false

    const applyView = (id) => {
      const preset = VIEW_PRESETS[id]
      if (!preset) return
      if (id === 'track') {
        trackOffset.fromArray(preset.offset)
      } else {
        desiredPosition.fromArray(preset.position)
        desiredTarget.fromArray(preset.target)
      }
      tweening = true
    }
    controls.addEventListener('start', () => {
      if (viewRef.current !== 'track') tweening = false
    })
    controls.addEventListener('end', () => {
      if (viewRef.current === 'track') trackOffset.copy(camera.position).sub(controls.target)
    })

    const applyLayers = (l) => {
      hArrow.visible = l.vectors
      wArrow.visible = l.vectors
      trail.visible = l.vectors
      bodyAxes.visible = l.axes
      reference.visible = l.grid
      net.membrane.visible = l.membrane
      const aiOn = !!l.ai
      neuralLine.visible = aiOn
      contactRing.visible = aiOn
    }
    applyLayers(layersRef.current)
    apiRef.current = { applyView, applyLayers }

    let width = 1
    let height = 1
    const resize = () => {
      const rect = host.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      renderer.setSize(width, height, false)
      renderer.domElement.style.width = `${width}px`
      renderer.domElement.style.height = `${height}px`
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      for (const m of net.materials) m.uniforms.uPixelRatio.value = renderer.getPixelRatio()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const wBody = new THREE.Vector3()
    const wInertial = new THREE.Vector3()
    const hInertial = new THREE.Vector3()
    const dir = new THREE.Vector3()
    const projected = new THREE.Vector3()
    const edge = new THREE.Vector3()
    const camRight = new THREE.Vector3()
    let frame = 0
    let lastFrame = performance.now()
    let raf = 0

    const applyState = (buf) => {
      sat.position.set(buf[F.PX], buf[F.PY], buf[F.PZ])
      sat.quaternion.set(buf[F.Q1], buf[F.Q2], buf[F.Q3], buf[F.Q0])
      net.position.array.set(buf.subarray(NODE_POSITION_OFFSET, NODE_POSITION_OFFSET + NODE_COUNT * 3))
      net.strain.array.set(buf.subarray(NODE_STRAIN_OFFSET, NODE_STRAIN_OFFSET + NODE_COUNT))
      net.position.needsUpdate = true
      net.strain.needsUpdate = true
      CORNER_NODES.forEach((n, i) => {
        const k = NODE_POSITION_OFFSET + n * 3
        net.corners[i].position.set(buf[k], buf[k + 1], buf[k + 2])
      })

      wBody.set(buf[F.WX], buf[F.WY], buf[F.WZ])
      wInertial.copy(wBody).applyQuaternion(sat.quaternion)
      hInertial.set(buf[F.HX], buf[F.HY], buf[F.HZ])
      const wMag = wInertial.length()
      const hMag = hInertial.length()
      hArrow.position.copy(sat.position)
      wArrow.position.copy(sat.position)

      // Neural line from deployer standoff to target; ring on +Z face toward net
      if (layersRef.current.ai) {
        const pred = aiOverlayRef.current?.current
        const secure = pred?.fireNowSecure
        const col = secure ? 0x34d399 : pred?.captureProbability < 1 ? 0xf43f5e : 0xfbbf24
        neuralMat.color.setHex(col)
        ringMat.color.setHex(col)
        neuralGeom.setFromPoints([
          new THREE.Vector3(0, 0, NET.standoff),
          sat.position.clone(),
        ])
        neuralGeom.attributes.position.needsUpdate = true
        // Face toward net: body +Z in LVLH via sat quaternion
        const face = new THREE.Vector3(0, 0, CUBESAT.dims[2] / 2 + 0.02).applyQuaternion(sat.quaternion)
        contactRing.position.copy(sat.position).add(face)
        contactRing.quaternion.copy(sat.quaternion)
        contactRing.rotateX(Math.PI / 2)
        const pulse = reducedMotion() ? 0.7 : 0.55 + 0.35 * Math.sin(performance.now() * 0.006)
        ringMat.opacity = pulse
        neuralMat.opacity = 0.35 + 0.25 * pulse
        neuralLine.visible = true
        contactRing.visible = true
      } else {
        neuralLine.visible = false
        contactRing.visible = false
      }

      hArrow.visible = layersRef.current.vectors && hMag > 1e-4
      wArrow.visible = layersRef.current.vectors && wMag > 1e-4
      if (hMag > 1e-4) {
        hArrow.setDirection(dir.copy(hInertial).divideScalar(hMag))
        hArrow.setLength(0.28 + 0.16 * Math.min(hMag, 3), 0.05, 0.026)
      }
      if (wMag > 1e-4) {
        const len = 0.26 + 0.05 * Math.min(wMag, 8)
        wArrow.setDirection(dir.copy(wInertial).divideScalar(wMag))
        wArrow.setLength(len, 0.045, 0.024)
      }

      const t = buf[F.T]
      if (t < lastT) trailCount = 0
      if (t !== lastT && wMag > 1e-4) {
        const len = 0.26 + 0.05 * Math.min(wMag, 8)
        trailRel.copyWithin(0, 3)
        trailRel[TRAIL_LENGTH * 3 - 3] = (wInertial.x / wMag) * len
        trailRel[TRAIL_LENGTH * 3 - 2] = (wInertial.y / wMag) * len
        trailRel[TRAIL_LENGTH * 3 - 1] = (wInertial.z / wMag) * len
        trailCount = Math.min(TRAIL_LENGTH, trailCount + 1)
      }
      lastT = t
      const start = TRAIL_LENGTH - trailCount
      const arr = trailPositions.array
      for (let i = start; i < TRAIL_LENGTH; i++) {
        arr[(i - start) * 3] = trailRel[i * 3] + sat.position.x
        arr[(i - start) * 3 + 1] = trailRel[i * 3 + 1] + sat.position.y
        arr[(i - start) * 3 + 2] = trailRel[i * 3 + 2] + sat.position.z
      }
      trailPositions.needsUpdate = true
      trailGeometry.setDrawRange(0, trailCount)
      return buf[F.RANGE]
    }

    const updateCamera = (dt) => {
      const k = 1 - Math.exp(-dt * 5)
      if (viewRef.current === 'track') {
        controls.target.lerp(sat.position, k)
        if (tweening) {
          camera.position.lerp(edge.copy(sat.position).add(trackOffset), k)
          if (camera.position.distanceTo(edge) < 0.01) tweening = false
        } else {
          camera.position.copy(controls.target).add(trackOffset)
        }
      } else if (tweening) {
        camera.position.lerp(desiredPosition, k)
        controls.target.lerp(desiredTarget, k)
        if (camera.position.distanceTo(desiredPosition) < 0.004) tweening = false
      }
    }

    const updateReticle = (range) => {
      const el = reticleRef.current
      if (!el) return
      projected.copy(sat.position).project(camera)
      if (projected.z > 1 || Math.abs(projected.x) > 1.2 || Math.abs(projected.y) > 1.2) {
        el.style.opacity = '0'
        return
      }
      const x = (projected.x * 0.5 + 0.5) * width
      const y = (-projected.y * 0.5 + 0.5) * height
      camRight.setFromMatrixColumn(camera.matrixWorld, 0)
      edge.copy(sat.position).addScaledVector(camRight, 0.24).project(camera)
      const r = Math.abs((edge.x - projected.x) * 0.5 * width)
      const size = Math.min(180, Math.max(34, r * 2 + 18))
      el.style.opacity = '1'
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      if (reticleBoxRef.current) {
        reticleBoxRef.current.style.width = `${size}px`
        reticleBoxRef.current.style.height = `${size}px`
      }
      if (reticleLabelRef.current) {
        reticleLabelRef.current.style.transform = `translate(${size / 2 + 8}px, ${-size / 2}px)`
        if (frame % 6 === 0) {
          reticleLabelRef.current.textContent = `TGT 12U · NET RNG ${Number.isFinite(range) ? range.toFixed(2) : '—'} m`
        }
      }
    }

    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - lastFrame) / 1000)
      lastFrame = now
      frame++
      const buf = stateRef.current
      const range = buf ? applyState(buf) : NaN
      // uTime drives only the yield pulse in the strain shader; freezing it keeps the colour scale unchanged
      if (!reducedMotion()) for (const m of net.materials) m.uniforms.uTime.value = now / 1000
      earth.rotation.y += dt * 0.004
      updateCamera(dt)
      controls.update()

      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, width, height)
      renderer.clear()
      renderer.render(scene, camera)

      gizmo.camera.position.set(0, 0, 4).applyQuaternion(camera.quaternion)
      gizmo.camera.quaternion.copy(camera.quaternion)
      renderer.clearDepth()
      renderer.setScissorTest(true)
      renderer.setScissor(12, 12, GIZMO_SIZE, GIZMO_SIZE)
      renderer.setViewport(12, 12, GIZMO_SIZE, GIZMO_SIZE)
      renderer.render(gizmo.scene, gizmo.camera)
      renderer.setScissorTest(false)

      updateReticle(range)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      disposeScene(scene)
      disposeScene(gizmo.scene)
      cancelLater()
      environment?.dispose()
      pmrem?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      apiRef.current = null
    }
  }), [stateRef])

  useEffect(() => {
    viewRef.current = view
    apiRef.current?.applyView(view)
  }, [view])

  useEffect(() => {
    layersRef.current = layers
    apiRef.current?.applyLayers(layers)
  }, [layers])

  const isTargetHighlight = tourHighlight === 'step1'

  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="absolute inset-0" />
      <div ref={reticleRef} className="pointer-events-none absolute left-0 top-0 opacity-0 will-change-transform">
        <div
          ref={reticleBoxRef}
          className={cx(
            'absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300',
            isTargetHighlight && 'ring-2 ring-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.8)] border border-cyan-400 animate-pulse',
          )}
          style={{ width: 60, height: 60 }}
        >
          <span className={cx('absolute left-0 top-0 h-2.5 w-2.5 border-l border-t', isTargetHighlight ? 'border-cyan-400' : 'border-slate-300/70')} />
          <span className={cx('absolute right-0 top-0 h-2.5 w-2.5 border-r border-t', isTargetHighlight ? 'border-cyan-400' : 'border-slate-300/70')} />
          <span className={cx('absolute bottom-0 left-0 h-2.5 w-2.5 border-b border-l', isTargetHighlight ? 'border-cyan-400' : 'border-slate-300/70')} />
          <span className={cx('absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r', isTargetHighlight ? 'border-cyan-400' : 'border-slate-300/70')} />
        </div>
        <div
          ref={reticleLabelRef}
          className={cx(
            'num absolute left-0 top-0 whitespace-nowrap text-[10px] tracking-[0.04em] transition-colors',
            isTargetHighlight ? 'text-cyan-300 font-semibold' : 'text-slate-300/90',
          )}
        />
      </div>
    </div>
  )
}

export default memo(Canvas3D)
