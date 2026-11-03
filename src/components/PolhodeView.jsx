import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CAPTURE, CUBESAT } from '../physics/constants.js'
import { invariants } from '../physics/envelope.js'
import { CURVE_SECONDS, polhodeCurve } from '../physics/polhode.js'
import { F } from '../physics/stateLayout.js'
import { Segmented, cx, fmt } from './ui.jsx'

const [IX, IY, IZ] = CUBESAT.inertia
const I = CUBESAT.inertia
const LIMIT = CAPTURE.wzLimit
function textSprite(text, color, scale = 0.26) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.font = '500 30px "IBM Plex Mono", ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
  sprite.scale.set(scale * 4, scale, 1)
  sprite.renderOrder = 20
  return sprite
}

function disposeObject(root) {
  root.traverse((obj) => {
    obj.geometry?.dispose()
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
    for (const m of mats) {
      m.map?.dispose()
      m.dispose()
    }
  })
}

/** Builds the static geometry for one ω0: momentum sphere, energy ellipsoid, polhode, planes, axes. */
function buildScene(w0) {
  const group = new THREE.Group()
  const { twoT, h2 } = invariants(I, w0)
  const H = Math.sqrt(h2)
  if (!(H > 1e-9)) return { group, H: 0, twoT, degenerate: true }

  // momentum sphere |H| = H
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(H, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
  )
  const sphereWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(H, 24, 16)),
    new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.18 }),
  )
  group.add(sphere, sphereWire)

  // energy ellipsoid Σ Hi²/Ii = 2T → semi-axes sqrt(2T·Ii)
  const ell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 40),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  )
  ell.scale.set(Math.sqrt(twoT * IX), Math.sqrt(twoT * IY), Math.sqrt(twoT * IZ))
  const ellWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 32, 20)),
    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22 }),
  )
  ellWire.scale.copy(ell.scale)
  group.add(ell, ellWire)

  // polhode (numeric trajectory, 0–20 s)
  const curveGeom = new THREE.BufferGeometry()
  curveGeom.setAttribute('position', new THREE.BufferAttribute(polhodeCurve(w0), 3))
  const curve = new THREE.Line(curveGeom, new THREE.LineBasicMaterial({ color: 0xfbbf24, depthTest: false, transparent: true, opacity: 0.95 }))
  curve.renderOrder = 10
  group.add(curve)

  // planes ωz = ±3 ⇔ Hz = ±3·Iz
  const side = Math.max(1.5 * H, 0.5)
  for (const s of [1, -1]) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(side, side),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }),
    )
    plane.position.z = s * LIMIT * IZ
    group.add(plane)
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-side / 2, -side / 2, 0),
        new THREE.Vector3(side / 2, -side / 2, 0),
        new THREE.Vector3(side / 2, side / 2, 0),
        new THREE.Vector3(-side / 2, side / 2, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.6 }),
    )
    edge.position.z = s * LIMIT * IZ
    group.add(edge)
    const lbl = textSprite(`ωz = ${s > 0 ? '+' : '−'}${LIMIT.toFixed(1)}`, '#f87171', 0.11 * Math.max(H, 0.6))
    lbl.position.set(side / 2, side / 2, s * LIMIT * IZ)
    group.add(lbl)
  }

  // axes with inertia labels
  const L = 1.35 * Math.max(H, 0.4)
  const axes = [
    ['x', 0xf87171, '#f87171', [1, 0, 0], IX],
    ['y', 0x4ade80, '#4ade80', [0, 1, 0], IY],
    ['z', 0x60a5fa, '#60a5fa', [0, 0, 1], IZ],
  ]
  for (const [name, hex, css, dir, Ii] of axes) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...dir).multiplyScalar(-L),
      new THREE.Vector3(...dir).multiplyScalar(L),
    ])
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.55 }))
    group.add(line)
    const lbl = textSprite(`I${name} = ${Ii.toFixed(3)}`, css, 0.11 * Math.max(H, 0.6))
    lbl.position.set(...dir.map((v) => v * L * 1.08))
    group.add(lbl)
  }
  return { group, H, twoT, degenerate: false }
}

function PolhodeView({ stateRef, commanded, verdicts, className }) {
  const hostRef = useRef(null)
  const [frame, setFrame] = useState('body')
  const frameRef = useRef(frame)
  const apiRef = useRef(null)
  const w0Key = commanded.map((v) => v.toFixed(4)).join(',')
  const w0 = useMemo(() => commanded.map(Number), [w0Key]) // eslint-disable-line react-hooks/exhaustive-deps
  const inv = useMemo(() => invariants(I, w0), [w0])
  const degenerate = !(inv.h2 > 1e-18)

  useEffect(() => {
    frameRef.current = frame
  }, [frame])

  useEffect(() => {
    const host = hostRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x05070a, 1)
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08

    const root = new THREE.Group()
    scene.add(root)
    let built = null
    const point = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xe879f9, depthTest: false }))
    point.renderOrder = 15
    scene.add(point)
    const hArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0xe2e8f0, 0.08, 0.04)
    hArrow.line.material.depthTest = false
    hArrow.cone.material.depthTest = false
    scene.add(hArrow)

    const rebuild = (w) => {
      if (built) {
        root.remove(built.group)
        disposeObject(built.group)
      }
      built = buildScene(w)
      root.add(built.group)
      const H = Math.max(built.H, 0.5)
      point.scale.setScalar(0.03 * H)
      camera.position.set(2.6 * H, 1.6 * H, 2.4 * H)
      camera.near = 0.01 * H
      camera.far = 100 * H
      camera.updateProjectionMatrix()
      controls.target.set(0, 0, 0)
      controls.minDistance = 0.8 * H
      controls.maxDistance = 12 * H
    }
    rebuild(w0)
    apiRef.current = { rebuild }

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
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const q = new THREE.Quaternion()
    const hBody = new THREE.Vector3()
    const tick = () => {
      const buf = stateRef.current
      if (buf) {
        hBody.set(IX * buf[F.WX], IY * buf[F.WY], IZ * buf[F.WZ])
        q.set(buf[F.Q1], buf[F.Q2], buf[F.Q3], buf[F.Q0])
        if (frameRef.current === 'inertial') {
          root.quaternion.copy(q)
          point.position.copy(hBody).applyQuaternion(q)
        } else {
          root.quaternion.identity()
          point.position.copy(hBody)
        }
        const len = point.position.length()
        hArrow.visible = len > 1e-4
        if (len > 1e-4) {
          hArrow.setDirection(point.position.clone().divideScalar(len))
          hArrow.setLength(len, 0.06 * len, 0.03 * len)
        }
      }
      controls.update()
      renderer.render(scene, camera)
    }
    renderer.setAnimationLoop(tick)

    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      controls.dispose()
      if (built) disposeObject(built.group)
      disposeObject(point)
      renderer.dispose()
      renderer.domElement.remove()
      apiRef.current = null
    }
  }, [stateRef]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiRef.current?.rebuild(w0)
  }, [w0])

  const env = verdicts?.envelope
  const branchText = env?.branch == null ? 'none' : env.branch === 'a=0' ? 'a = 0 (ωx → 0 at the peak)' : 'b = 0 (ωy → 0 at the peak)'

  return (
    <div className={cx('absolute inset-0', className)} role="img" aria-label="Polhode view: energy ellipsoid, momentum sphere and the live angular momentum point in the body frame">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute right-2 top-11 lg:right-3 lg:top-3">
        <Segmented options={FRAME_OPTIONS} value={frame} onChange={setFrame} className="pointer-events-auto" ariaLabel="Polhode reference frame" />
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 hidden sm:block lg:bottom-3 lg:left-3">
        <div className="num pointer-events-auto border border-ink-700 bg-ink-950/85 px-2.5 py-2 text-[10.5px] leading-[16px] text-slate-300 backdrop-blur-sm">
          <div className="text-[9.5px] uppercase tracking-[0.12em] text-slate-500">H-space · body frame axes</div>
          <div>
            <span className="text-sky-300">■</span> energy ellipsoid Σ Hi²/Ii = 2T, 2T = {fmt(inv.twoT, 4)} J
          </div>
          <div>
            <span className="text-slate-400">■</span> momentum sphere |H| = {fmt(Math.sqrt(inv.h2), 4)} N·m·s
          </div>
          <div>
            <span className="text-amber-300">—</span> polhode = their intersection (RK4 trajectory, 0–{CURVE_SECONDS} s)
          </div>
          <div>
            <span className="text-fuchsia-300">●</span> H(t) = I·ω(t) from the worker · <span className="text-red-400">■</span> planes ωz = ±{LIMIT.toFixed(1)} (Hz = ±{fmt(LIMIT * IZ, 3)})
          </div>
          {env && (
            <div className="text-slate-400">
              ωz,max closed-form {fmt(env.max, 4)} rad/s · branch {branchText}
            </div>
          )}
          {degenerate && <div className="text-amber-300">ω₀ = 0: both surfaces degenerate to the origin.</div>}
        </div>
      </div>
    </div>
  )
}

export default memo(PolhodeView)
