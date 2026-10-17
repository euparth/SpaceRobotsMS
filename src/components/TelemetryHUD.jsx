import { useState } from 'react'
import { CAPTURE, CUBESAT, NET, SOLVER, STRAIN_BANDS } from '../physics/constants.js'
import { NET_MASS, NODE_MASS, REST_LENGTH, SEGMENT_COUNT } from '../physics/netTopology.js'
import { IZ, principalAxes } from '../physics/rigidBody.js'
import { PHASE, STATE_LENGTH } from '../physics/stateLayout.js'
import TopicMonitor from './TopicMonitor.jsx'
import { Label, Metric, Readout, Section, cx, fmt } from './ui.jsx'

const TABS = Object.freeze([
  { id: 'state', label: 'State' },
  { id: 'ros', label: 'ROS 2' },
  { id: 'model', label: 'Model' },
  { id: 'log', label: 'Log' },
])

const PHASE_VIEW = Object.freeze({
  [PHASE.IDLE]: { text: 'STANDBY', tone: 'text-slate-200', band: '' },
  [PHASE.FLIGHT]: { text: 'NET IN FLIGHT', tone: 'text-sky-300', band: 'bg-sky-400/[0.04]' },
  [PHASE.CONTACT]: { text: 'CONTACT', tone: 'text-amber-300', band: 'bg-amber-400/[0.05]' },
  [PHASE.CLOSING]: { text: 'CLOSING', tone: 'text-emerald-300', band: 'bg-emerald-400/[0.04]' },
  [PHASE.SECURED]: { text: 'SECURED', tone: 'text-emerald-400', band: 'bg-emerald-400/[0.06]' },
  [PHASE.EJECTED]: { text: 'FAILED — TARGET EJECTED', tone: 'text-red-400', band: 'bg-red-500/[0.07]' },
})

function phaseReason(snapshot, decision) {
  if (decision?.reason && snapshot.phase >= PHASE.CLOSING) return decision.reason
  switch (snapshot.phase) {
    case PHASE.IDLE:
      return `Net stowed at ${NET.standoff.toFixed(2)} m standoff · awaiting launch_net`
    case PHASE.FLIGHT:
      return `Closing at ${NET.approachSpeed.toFixed(1)} m/s · corner masses deploying the mesh`
    case PHASE.CONTACT:
      return `Evaluating |ωz| over a ${CAPTURE.decisionWindow.toFixed(2)} s contact window · peak ${fmt(snapshot.peakWz)} rad/s`
    default:
      return ''
  }
}

function SignedBar({ value, max, limit }) {
  const pct = Math.max(-1, Math.min(1, (value || 0) / max))
  const over = limit != null && Math.abs(value) > limit
  return (
    <div className="relative h-[3px] bg-ink-700/80">
      <span className="absolute left-1/2 top-[-2px] h-[7px] w-px bg-ink-500" />
      {limit != null &&
        [limit, -limit].map((l) => (
          <span key={l} className="absolute top-[-2px] h-[7px] w-px bg-red-500/70" style={{ left: `${50 + (l / max) * 50}%` }} />
        ))}
      <span
        className={cx('absolute top-0 h-full', over ? 'bg-red-400' : 'bg-slate-300')}
        style={{ left: pct >= 0 ? '50%' : `${50 + pct * 50}%`, width: `${Math.abs(pct) * 50}%` }}
      />
    </div>
  )
}

function VectorRow({ label, value, max, limit, digits = 4, unit }) {
  const over = limit != null && Math.abs(value) > limit
  return (
    <div className="grid h-[22px] grid-cols-[44px_minmax(0,1fr)_82px] items-center gap-2.5">
      <span className="num text-[11px] text-slate-400">{label}</span>
      <SignedBar value={value} max={max} limit={limit} />
      <span className={cx('num text-right text-[12px]', over ? 'text-red-300' : 'text-slate-100')}>
        {fmt(value, digits, { sign: true })}
        {unit && <span className="ml-1 text-[10px] text-slate-600">{unit}</span>}
      </span>
    </div>
  )
}

function StateTab({ snapshot, decision }) {
  if (!snapshot) return <div className="p-4 text-[12px] text-slate-500">Connecting to physics worker…</div>
  const view = PHASE_VIEW[snapshot.phase]
  const transfer = snapshot.ke0 > 1e-6 ? snapshot.eAbs / snapshot.ke0 : null
  const enclosureTone = snapshot.phase === PHASE.SECURED ? 'ok' : snapshot.phase === PHASE.EJECTED ? 'alert' : 'default'
  const peakTone = snapshot.peakWz > CAPTURE.wzLimit ? 'alert' : 'default'
  const ppm = (v) => (Number.isFinite(v) ? fmt(v * 1e6, 4, { sign: true }) : 'damped')

  return (
    <>
      <div className={cx('border-b border-ink-700 px-3 pb-3 pt-2.5', view.band)}>
        <div className="flex items-center justify-between">
          <Label>Capture status</Label>
          <span className="num text-[10px] text-slate-600">/gnc/capture_status</span>
        </div>
        <div className={cx('num mt-1.5 text-[21px] font-medium leading-tight tracking-[0.03em]', view.tone)}>{view.text}</div>
        <p className="mt-1 min-h-[30px] text-[11.5px] leading-snug text-slate-400">{phaseReason(snapshot, decision)}</p>
        <div className="mt-2.5 grid grid-cols-2 gap-px border border-ink-700 bg-ink-700">
          <Metric label="Enclosure" value={fmt(snapshot.enclosure * 100, 1)} unit="%" tone={enclosureTone} fill={snapshot.enclosure} />
          <Metric
            label="Energy transfer"
            value={transfer == null ? 'n/a' : fmt(Math.min(1, transfer) * 100, 1)}
            unit={transfer == null ? '' : '%'}
            fill={transfer == null ? 0 : transfer}
          />
          <Metric label="Peak |ωz| contact" value={fmt(snapshot.peakWz)} unit="rad/s" tone={peakTone} />
          <Metric label="Net range" value={fmt(snapshot.range)} unit="m" />
        </div>
      </div>

      <Section title="Attitude q · body→LVLH" aside={<span className="num text-[10px] text-slate-600">scalar-first</span>}>
        {snapshot.q.map((v, i) => (
          <VectorRow key={i} label={`q${i}`} value={v} max={1} digits={5} />
        ))}
      </Section>

      <Section
        title={
          <>
            Body rates <span className="normal-case">ω</span>
          </>
        }
        aside={<span className="num text-[10px] text-slate-600">rad/s</span>}>
        <VectorRow label="ωx" value={snapshot.w[0]} max={5} />
        <VectorRow label="ωy" value={snapshot.w[1]} max={5} />
        <VectorRow label="ωz" value={snapshot.w[2]} max={5} limit={CAPTURE.wzLimit} />
      </Section>

      <Section title="Angular momentum H · LVLH" aside={<span className="num text-[10px] text-slate-600">N·m·s</span>}>
        <VectorRow label="Hx" value={snapshot.h[0]} max={2.5} />
        <VectorRow label="Hy" value={snapshot.h[1]} max={2.5} />
        <VectorRow label="Hz" value={snapshot.h[2]} max={2.5} />
        <Readout label="|H|" value={fmt(snapshot.hMag, 4)} unit="N·m·s" />
      </Section>

      <Section title="Energy">
        <Readout label="Rotational T = ½ωᵀIω" value={fmt(snapshot.ke, 4)} unit="J" />
        <Readout label="Net strain energy J" value={fmt(snapshot.eNet, 4)} unit="J" />
        <Readout label="Absorbed by restraint" value={fmt(snapshot.eAbs, 4)} unit="J" />
        <Readout label="Nutation θ (H ∠ ẑ_b)" value={fmt(snapshot.nutation, 2)} unit="deg" />
      </Section>

      <Section title="Integrator health" aside={<span className="num text-[10px] text-slate-600">RK4</span>}>
        <Readout label="ΔT / T₀" value={ppm(snapshot.keDrift)} unit={Number.isFinite(snapshot.keDrift) ? 'ppm' : ''} />
        <Readout label="|ΔH| / |H₀|" value={ppm(snapshot.hDrift)} unit={Number.isFinite(snapshot.hDrift) ? 'ppm' : ''} />
        <Readout label="Substeps / tick" value={snapshot.substeps} />
        <Readout label="Solver time" value={fmt(snapshot.solverMs, 2)} unit="ms" />
        <Readout label="Net ε_max · contacts" value={`${fmt(snapshot.strainMax * 100, 2)}% · ${snapshot.contacts}`} />
      </Section>
    </>
  )
}

function ModelTab() {
  const axes = principalAxes()
  const ea = NET.youngsModulus * NET.threadArea
  return (
    <>
      <Section title="Principal axes" aside={<span className="num text-[10px] text-slate-600">kg·m²</span>}>
        <div className="num grid grid-cols-[28px_64px_minmax(0,1fr)_auto] gap-y-1.5 text-[11.5px]">
          <span className="text-[9.5px] uppercase tracking-[0.1em] text-slate-600">Axis</span>
          <span className="text-[9.5px] uppercase tracking-[0.1em] text-slate-600">I</span>
          <span className="text-[9.5px] uppercase tracking-[0.1em] text-slate-600">Role</span>
          <span className="text-[9.5px] uppercase tracking-[0.1em] text-slate-600">Free spin</span>
          {axes.map((a) => (
            <div key={a.axis} className="contents">
              <span className="text-slate-300">{a.axis}</span>
              <span className="text-slate-100">{a.I.toFixed(3)}</span>
              <span className="text-slate-400">{a.role}</span>
              <span className={a.stable ? 'text-emerald-400' : 'text-amber-400'}>{a.stable ? 'stable' : 'Dzhanibekov'}</span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-snug text-slate-500">
          I_y &lt; I_z &lt; I_x, so Z is the intermediate axis. Spin about Z is unstable and flips under small perturbations.
        </p>
      </Section>

      <Section title="Equations of motion">
        <pre className="num whitespace-pre text-[11px] leading-[18px] text-slate-300">
          {`Ix·ω̇x + (Iz − Iy)·ωy·ωz = τx
Iy·ω̇y + (Ix − Iz)·ωz·ωx = τy
Iz·ω̇z + (Iy − Ix)·ωx·ωy = τz
q̇ = ½ · q ⊗ [0, ω]     H = I·ω
τ = −I·ω / τ_r   (net restraint, post-closure)`}
        </pre>
      </Section>

      <Section title="Instability law">
        <Readout label="Twist-out threshold" value={`|ωz| > ${CAPTURE.wzLimit.toFixed(1)}`} unit="rad/s" tone="alert" />
        <Readout label="Z energy at limit ½·Iz·ω²" value={fmt(0.5 * IZ * CAPTURE.wzLimit ** 2, 3)} unit="J" />
        <Readout label="Contact decision window" value={CAPTURE.decisionWindow.toFixed(2)} unit="s" />
        <Readout label="Closure duration" value={CAPTURE.closureDuration.toFixed(2)} unit="s" />
        <Readout label="Restraint time constant τ_r" value={CAPTURE.restraintTimeConstant.toFixed(1)} unit="s" />
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Rotational energy above the restraint level converts to an upper-bound ejection speed v ≤ √(2·ΔT_z / m).
        </p>
      </Section>

      <Section title="Target · 12U CubeSat">
        <Readout label="Envelope" value={CUBESAT.dims.map((d) => d.toFixed(3)).join(' × ')} unit="m" />
        <Readout label="Mass" value={CUBESAT.mass.toFixed(1)} unit="kg" />
      </Section>

      <Section title="Net · Kevlar 49 cable lattice">
        <Readout label="Threads · rest length" value={`${SEGMENT_COUNT} · ${(REST_LENGTH * 1000).toFixed(1)}`} unit="mm" />
        <Readout label="Yarn axial stiffness EA" value={(ea / 1000).toFixed(1)} unit="kN" />
        <Readout label="Woven efficiency η" value={NET.wovenEfficiency} />
        <Readout label="Effective EA·η" value={(ea * NET.wovenEfficiency).toFixed(1)} unit="N" />
        <Readout label="Mesh / knot mass" value={`${(NET_MASS * 1000).toFixed(1)} g / ${(NODE_MASS * 1e6).toFixed(0)} mg`} />
        <Readout label="Strain bands" value={`${STRAIN_BANDS.elastic * 100}% / ${STRAIN_BANDS.yield * 100}%`} />
      </Section>

      <Section title="Solver pipeline">
        <Readout label="Rigid body" value="RK4" />
        <Readout label="Substep h" value={(SOLVER.substep * 1e6).toFixed(0)} unit="µs" />
        <Readout label="Net" value="XPBD · tension-only" />
        <Readout label="Contact" value="OBB + Coulomb μ" />
        <Readout label="Publish" value={`${SOLVER.publishHz} Hz · ${(STATE_LENGTH * 4) / 1000} kB`} />
        <Readout label="Transport" value="Transferable Float32Array" />
      </Section>
    </>
  )
}

const LEVEL_CLASS = Object.freeze({ info: 'text-slate-300', ok: 'text-emerald-400', warn: 'text-amber-400', error: 'text-red-400' })

function LogTab({ events }) {
  if (!events.length) return <div className="p-4 text-[12px] text-slate-500">No events yet.</div>
  return (
    <ol className="num divide-y divide-ink-800 text-[11px]">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="grid grid-cols-[62px_minmax(0,1fr)] gap-2 px-3 py-2">
          <span className="text-slate-600">{fmt(e.t, 3)}s</span>
          <span className={cx('leading-snug', LEVEL_CLASS[e.level] ?? 'text-slate-300')}>{e.text}</span>
        </li>
      ))}
    </ol>
  )
}

export default function TelemetryHUD({ snapshot, decision, events, graph }) {
  const [tab, setTab] = useState('state')
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-ink-700 bg-ink-925">
      <nav className="flex h-9 shrink-0 items-stretch border-b border-ink-700 px-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              'relative px-3 text-[11.5px] font-medium tracking-[0.02em] transition-colors',
              tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {t.label}
            {t.id === 'log' && events.length > 0 && <span className="num ml-1.5 text-[10px] text-slate-600">{events.length}</span>}
            {tab === t.id && <span className="absolute inset-x-2 bottom-[-1px] h-px bg-slate-200" />}
          </button>
        ))}
      </nav>
      <div className={cx('min-h-0 flex-1', tab === 'ros' ? 'flex flex-col' : 'scroll-thin overflow-y-auto')}>
        {tab === 'state' && <StateTab snapshot={snapshot} decision={decision} />}
        {tab === 'ros' && <TopicMonitor graph={graph} />}
        {tab === 'model' && <ModelTab />}
        {tab === 'log' && <LogTab events={events} />}
      </div>
    </aside>
  )
}
