import { useCallback, useEffect, useMemo, useState } from 'react'
import { CAPTURE, PRESETS, STRAIN_BANDS } from '../physics/constants.js'
import { predictOutcome } from '../physics/rigidBody.js'
import { PHASE, PHASE_LABEL } from '../physics/stateLayout.js'
import { executeCommand } from '../services/cliCommands.js'
import { TOPICS } from '../services/rosTelemetryNode.js'
import { STRESS_PALETTE } from '../shaders/stressShader.js'
import Canvas3D, { VIEW_PRESETS } from './Canvas3D.jsx'
import CliTerminal from './CliTerminal.jsx'
import Controls from './Controls.jsx'
import GuidedTour, { TOUR_STEPS, shouldShowTourOnFirstVisit } from './GuidedTour.jsx'
import InertiaTensor from './InertiaTensor.jsx'
import TelemetryHUD from './TelemetryHUD.jsx'
import TimeSeriesChart from './TimeSeriesChart.jsx'
import { Button, Kbd, Label, Led, Segmented, cx, fmt } from './ui.jsx'

const VIEW_IDS = Object.keys(VIEW_PRESETS)
const VIEW_OPTIONS = VIEW_IDS.map((id) => ({ id, label: VIEW_PRESETS[id].label }))
const LAYER_OPTIONS = [
  { id: 'vectors', label: 'H · ω', title: 'Angular momentum, body-rate vector and herpolhode trace' },
  { id: 'axes', label: 'AXES', title: 'Body frame triad' },
  { id: 'grid', label: 'GRID', title: 'LVLH reference grid and line of sight' },
  { id: 'membrane', label: 'MESH', title: 'Strain-shaded membrane between threads' },
]

const ENERGY_SERIES = Object.freeze([
  { key: 'ke', label: 'T', color: '#38bdf8', axis: 'left' },
  { key: 'eAbs', label: 'E_abs', color: '#a78bfa', axis: 'left', dashed: true },
  { key: 'eNet', label: 'J_net →', color: '#f59e0b', axis: 'right' },
])
const RATE_SERIES = Object.freeze([
  { key: 'wx', label: 'ωx', color: '#f87171' },
  { key: 'wy', label: 'ωy', color: '#4ade80' },
  { key: 'wz', label: 'ωz', color: '#60a5fa' },
])
const RATE_THRESHOLDS = Object.freeze([
  { value: CAPTURE.wzLimit, label: `+${CAPTURE.wzLimit.toFixed(1)} twist-out`, color: '#ef4444' },
  { value: -CAPTURE.wzLimit, label: '', color: '#ef4444' },
])
const NUTATION_SERIES = Object.freeze([{ key: 'nutation', label: 'θ = ∠(H, ẑ_b)', color: '#e2e8f0' }])
const NUTATION_RANGE = Object.freeze([0, 180])
const QUATERNION_SERIES = Object.freeze([
  { key: 'q0', label: 'q0', color: '#e2e8f0' },
  { key: 'q1', label: 'q1', color: '#f87171' },
  { key: 'q2', label: 'q2', color: '#4ade80' },
  { key: 'q3', label: 'q3', color: '#60a5fa' },
])
const QUATERNION_RANGE = Object.freeze([-1.05, 1.05])

const DYNAMICS_PLOTS = Object.freeze({
  nutation: { label: 'NUTATION', hint: 'deg', series: NUTATION_SERIES, props: { fixedRange: NUTATION_RANGE } },
  rates: { label: 'RATES', hint: 'rad/s', series: RATE_SERIES, props: { thresholds: RATE_THRESHOLDS, symmetric: true } },
  attitude: { label: 'QUAT', hint: 'body→LVLH', series: QUATERNION_SERIES, props: { fixedRange: QUATERNION_RANGE } },
})
const DYNAMICS_OPTIONS = Object.keys(DYNAMICS_PLOTS).map((id) => ({ id, label: DYNAMICS_PLOTS[id].label }))

const BOOT_LINES = [
  { kind: 'dim', text: "Parth's MS Thesis · GNC digital twin · /cli" },
  { kind: 'dim', text: "type 'help' for commands — e.g. set_spin --z 4.2 · launch_net · export_telemetry --format csv" },
]

const pad = (n, w = 2) => String(n).padStart(w, '0')
function formatMet(t) {
  const v = Number.isFinite(t) ? Math.max(0, t) : 0
  const ms = Math.floor((v % 1) * 1000)
  const s = Math.floor(v) % 60
  const m = Math.floor(v / 60) % 60
  const h = Math.floor(v / 3600)
  return `T+${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`
}

const levelKind = (level) => ({ warn: 'warn', error: 'err', ok: 'ok' })[level] ?? 'event'
const trim = (lines) => (lines.length > 500 ? lines.slice(-500) : lines)

function Mark() {
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7 shrink-0" aria-hidden>
      <rect x="0.5" y="0.5" width="27" height="27" rx="3" fill="#0b0f15" stroke="#2a3542" />
      <ellipse cx="14" cy="14" rx="10" ry="4.2" fill="none" stroke="#475569" strokeWidth="1" transform="rotate(-24 14 14)" />
      <rect x="11" y="10.5" width="6" height="7" rx="0.6" fill="#cbd5e1" transform="rotate(-24 14 14)" />
      <circle cx="22.4" cy="9.6" r="1.6" fill="#38bdf8" />
    </svg>
  )
}

function ChartCard({ title, hint, legend, tabs, highlighted, children }) {
  return (
    <div
      className={cx(
        'flex min-h-[230px] shrink-0 flex-col border-b border-ink-700 lg:min-h-0 lg:min-w-[260px] lg:flex-1 lg:shrink lg:border-b-0 lg:border-r lg:last:border-r-0 transition-all duration-300',
        highlighted && 'ring-2 ring-cyan-400/80 border-cyan-400 bg-cyan-950/20 shadow-[0_0_24px_rgba(34,211,238,0.35)]',
      )}
    >
      <div className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5 lg:h-8 lg:flex-nowrap lg:py-0">
        <div className="flex min-w-0 items-center gap-2">
          {tabs ?? <Label className="whitespace-nowrap">{title}</Label>}
          {hint && <span className="num truncate text-[10px] text-slate-600">{hint}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {legend.map((s) => (
            <span key={s.key} className="num flex items-center gap-1 text-[10px] text-slate-400">
              <span className={cx('inline-block h-[2px] w-2.5', s.dashed && 'opacity-70')} style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1 px-1 pb-1.5">{children}</div>
    </div>
  )
}

function StressLegend({ strainMax }) {
  const scaleMax = STRAIN_BANDS.yield * 1.6
  const at = (v) => `${(Math.min(v, scaleMax) / scaleMax) * 100}%`
  return (
    <div className="w-[196px] border border-ink-700 bg-ink-950/80 px-2.5 pb-2 pt-1.5 backdrop-blur-sm sm:w-[236px]">
      <div className="flex items-center justify-between">
        <Label className="whitespace-nowrap text-[9.5px]">
          <span className="sm:hidden">
            Net strain <span className="normal-case">ε</span>
          </span>
          <span className="hidden sm:inline">
            Kevlar strain <span className="normal-case">ε</span> · GLSL
          </span>
        </Label>
        <span className="num text-[10px] text-slate-300">max {fmt((strainMax ?? 0) * 100, 1)}%</span>
      </div>
      <div className="relative mt-1.5 flex h-[5px]">
        <span style={{ width: at(STRAIN_BANDS.elastic), background: `linear-gradient(90deg, ${STRESS_PALETTE.nominal}99, ${STRESS_PALETTE.nominal})` }} />
        <span style={{ width: `calc(${at(STRAIN_BANDS.yield)} - ${at(STRAIN_BANDS.elastic)})`, background: STRESS_PALETTE.elastic }} />
        <span className="flex-1" style={{ background: STRESS_PALETTE.yield }} />
        <span className="absolute top-[-3px] h-[11px] w-[2px] bg-white shadow-[0_0_6px_white]" style={{ left: at(strainMax ?? 0) }} />
      </div>
      <div className="num relative mt-1 h-3 text-[9px] text-slate-500">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: at(STRAIN_BANDS.elastic) }}>5%</span>
        <span className="absolute -translate-x-1/2" style={{ left: at(STRAIN_BANDS.yield) }}>15%</span>
      </div>
      <div className="mt-1 hidden grid-cols-3 text-[9.5px] text-slate-400 sm:grid">
        <span>Nominal</span>
        <span className="text-center">Elastic load</span>
        <span className="text-right">Yield</span>
      </div>
    </div>
  )
}

const MOBILE_TABS = Object.freeze([
  { id: 'control', label: 'Control' },
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'plots', label: 'Plots' },
])

const PHASE_TONE = Object.freeze({
  [PHASE.IDLE]: 'text-slate-200',
  [PHASE.FLIGHT]: 'text-sky-300',
  [PHASE.CONTACT]: 'text-amber-300',
  [PHASE.CLOSING]: 'text-emerald-300',
  [PHASE.SECURED]: 'text-emerald-400',
  [PHASE.EJECTED]: 'text-red-400',
})

function MobileActionBar({ snapshot, api }) {
  const phase = snapshot?.phase ?? PHASE.IDLE
  const label = phase === PHASE.EJECTED ? 'FAILED — EJECTED' : PHASE_LABEL[phase]
  return (
    <div className="flex shrink-0 items-center gap-2 border-y border-ink-700 bg-ink-925 px-3 py-2 lg:hidden">
      <div className="min-w-0 flex-1 leading-tight">
        <div className="num truncate text-[10px] text-slate-500">
          {formatMet(snapshot?.t)} · {fmt(snapshot?.timeScale ?? 0, 2)}×
        </div>
        <div className={cx('num truncate text-[13px] font-medium tracking-[0.03em]', PHASE_TONE[phase])}>{label}</div>
      </div>
      <Button variant="primary" className="h-9 px-4" disabled={phase !== PHASE.IDLE} onClick={api.launch}>
        Launch
      </Button>
      <Button variant="ghost" className="h-9" onClick={api.reset}>
        Reset
      </Button>
    </div>
  )
}

function TopBar({ snapshot, commanded, bridge, busHz, onTakeTour }) {
  const phase = snapshot?.phase ?? PHASE.IDLE
  const forecast = predictOutcome(commanded).verdict
  const gncTone = !snapshot ? 'off' : snapshot.paused ? 'warn' : snapshot.tickHz > 30 ? 'ok' : 'warn'
  const busTone = busHz > 1 ? 'ok' : 'off'
  const bridgeTone = { connected: 'info', connecting: 'warn', error: 'alert' }[bridge.status] ?? 'off'
  let ejectTone = 'off'
  if (phase === PHASE.EJECTED) ejectTone = 'alert'
  else if (phase === PHASE.IDLE && forecast !== 'SECURE') ejectTone = 'warn'
  else if (phase === PHASE.CONTACT && Math.abs(snapshot?.w[2] ?? 0) > CAPTURE.wzLimit) ejectTone = 'warn'
  let contactTone = 'off'
  if (phase === PHASE.SECURED) contactTone = 'ok'
  else if (phase === PHASE.CONTACT || phase === PHASE.CLOSING) contactTone = 'info'
  else if (phase === PHASE.EJECTED && (snapshot?.contacts ?? 0) > 0) contactTone = 'warn'

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-700 bg-ink-925 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:h-12 lg:flex-nowrap lg:py-0">
      <div className="flex min-w-0 items-center gap-3">
        <Mark />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-medium text-slate-100">
            Parth&apos;s MS Thesis
            <span className="hidden sm:inline">
              {' '}
              <span className="text-slate-600">/</span> Space Debris Capture Digital Twin
            </span>
          </div>
          <div className="num truncate text-[10.5px] text-slate-500">
            <span className="sm:hidden">Debris capture digital twin · GNC v3</span>
            <span className="hidden sm:inline">GNC workbench v3 · 12U CubeSat · Kevlar 49 net · LEO</span>
          </div>
        </div>
      </div>

      <div className="num ml-auto hidden h-8 items-stretch divide-x divide-ink-700 border border-ink-700 text-[11px] xl:flex">
        <div className="flex items-center gap-2 px-3">
          <span className="text-[9.5px] tracking-[0.12em] text-slate-500">MET</span>
          <span className="text-slate-100">{formatMet(snapshot?.t)}</span>
        </div>
        <div className="flex items-center gap-2 px-3">
          <span className="text-[9.5px] tracking-[0.12em] text-slate-500">RATE</span>
          <span className="text-slate-100">{fmt(snapshot?.timeScale ?? 0, 2)}×</span>
        </div>
        <div className="flex items-center gap-2 px-3">
          <span className="text-[9.5px] tracking-[0.12em] text-slate-500">WORKER</span>
          <span className="text-slate-100">
            {fmt(snapshot?.tickHz ?? 0, 0)} Hz · {fmt(snapshot?.solverMs ?? 0, 2)} ms
          </span>
        </div>
      </div>

      <div className="scroll-thin flex w-full items-center justify-between gap-3 overflow-x-auto sm:justify-start sm:gap-4 lg:ml-auto lg:w-auto xl:ml-0">
        <button
          type="button"
          onClick={onTakeTour}
          className="num flex h-7 shrink-0 items-center gap-1.5 rounded-[3px] border border-cyan-500/50 bg-cyan-950/60 px-2.5 text-[11px] font-medium tracking-wide text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)] transition-all hover:border-cyan-400 hover:bg-cyan-500/20 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.4)] active:scale-95"
          title="Replay interactive 3-step guided tour"
        >
          <svg className="h-3.5 w-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
          </svg>
          <span>Take Tour</span>
        </button>
        <Led label="GNC_ACTIVE" short="GNC" tone={gncTone} title="Physics worker integrating at publish rate" />
        <Led label="BUS_CONNECTED" short="BUS" tone={busTone} title={`ROS 2 bus · odom ${busHz.toFixed(1)} Hz`} />
        <Led label="ROSBRIDGE" short="BRIDGE" tone={bridgeTone} title={bridge.url ?? 'rosbridge offline'} />
        <Led label="CONTACT" short="CONTACT" tone={contactTone} title={`Net knots in contact with target · ${snapshot?.contacts ?? 0}`} />
        <Led label="EJECT_ALERT" short="EJECT" tone={ejectTone} title="Twist-out ejection / instability forecast" />
      </div>
    </header>
  )
}

export default function GNCWorkbench({ sim }) {
  const { api, snapshot, decision, events, commanded } = sim
  const [view, setView] = useState('iso')
  const [layers, setLayers] = useState({ vectors: true, axes: true, grid: true, membrane: true })
  const [plot, setPlot] = useState('nutation')
  const [mobileTab, setMobileTab] = useState('control')
  const [cliOpen, setCliOpen] = useState(false)
  const [cliLines, setCliLines] = useState(BOOT_LINES)
  const [bridge, setBridge] = useState(() => api.graph.bridgeState())

  // Guided Tour and Mobile Viewport State
  const [isTourActive, setIsTourActive] = useState(() => shouldShowTourOnFirstVisit())
  const [currentStep, setCurrentStep] = useState(0)
  const [panelsCollapsed, setPanelsCollapsed] = useState(false)
  const tourHighlight = isTourActive ? TOUR_STEPS[currentStep]?.highlightKey : null

  const handleStepChange = useCallback((step) => {
    setCurrentStep(step)
    if (step === 0 || step === 2) {
      setMobileTab('control')
    } else if (step === 1) {
      setMobileTab('plots')
    }
  }, [])

  const handleTakeTour = useCallback(() => {
    setIsTourActive(true)
    setCurrentStep(0)
    setPanelsCollapsed(false)
    setMobileTab('control')
  }, [])

  useEffect(() => api.graph.subscribe(() => setBridge(api.graph.bridgeState())), [api.graph])

  useEffect(
    () =>
      api.subscribeEvents((e) =>
        setCliLines((prev) => trim([...prev, { kind: levelKind(e.level), text: `[${fmt(e.t, 3)}s] ${e.text}` }])),
      ),
    [api],
  )

  const runCommand = useCallback(
    (line) => {
      const result = executeCommand(line, { sim: api, setView, views: VIEW_IDS })
      setCliLines((prev) => (result.clear ? [] : trim([...prev, { kind: 'input', text: line }, ...result.lines])))
    },
    [api],
  )

  const handleExport = useCallback(
    (format) => {
      const result = api.exportTelemetry(format)
      setCliLines((prev) =>
        trim([
          ...prev,
          result.ok
            ? { kind: 'ok', text: `exported ${result.samples} samples → ${result.filename}` }
            : { kind: 'warn', text: result.message },
        ]),
      )
    },
    [api],
  )

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return
      const snap = api.getSnapshot()
      if (e.key === '/' || e.key === '`') {
        e.preventDefault()
        setCliOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setCliOpen(false)
      } else if (e.key === 'l' || e.key === 'L') {
        api.launch()
      } else if (e.key === 'r' || e.key === 'R') {
        api.reset()
      } else if (e.key === ' ') {
        e.preventDefault()
        if (snap?.paused) api.resume()
        else api.pause()
      } else if (/^[1-4]$/.test(e.key)) {
        if ((snap?.phase ?? PHASE.IDLE) === PHASE.IDLE) api.applyPreset(PRESETS[Number(e.key) - 1].id)
      } else if (e.key === 'v' || e.key === 'V') {
        setView((v) => VIEW_IDS[(VIEW_IDS.indexOf(v) + 1) % VIEW_IDS.length])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api])

  const activeLayers = useMemo(() => Object.keys(layers).filter((k) => layers[k]), [layers])
  const toggleLayer = useCallback((id) => setLayers((l) => ({ ...l, [id]: !l[id] })), [])
  const busHz = api.graph.topic(TOPICS.ODOM)?.rate() ?? 0
  const ejected = snapshot?.phase === PHASE.EJECTED && decision?.status === 'EJECTED'

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-ink-950 text-slate-100">
      <TopBar snapshot={snapshot} commanded={commanded} bridge={bridge} busHz={busHz} onTakeTour={handleTakeTour} />

      <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[296px_minmax(0,1fr)_376px] lg:grid-rows-[minmax(0,1fr)_228px]">
        <section
          className={cx(
            'relative shrink-0 overflow-hidden bg-ink-950 transition-all duration-300 lg:col-start-2 lg:row-start-1 lg:h-auto lg:min-h-0',
            panelsCollapsed ? 'h-full min-h-0 flex-1' : 'h-[42dvh] min-h-[240px]',
          )}
        >
          <Canvas3D stateRef={api.stateRef} view={view} layers={layers} tourHighlight={tourHighlight} />

          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute left-2 right-2 top-2 flex items-start justify-between gap-2 lg:left-3 lg:right-auto lg:top-3">
              <div className="scroll-thin pointer-events-auto flex min-w-0 items-center gap-2 overflow-x-auto">
                <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} className="shrink-0" />
                <Segmented options={LAYER_OPTIONS} value={activeLayers} onChange={toggleLayer} className="hidden shrink-0 md:flex" />
              </div>
              <button
                type="button"
                onClick={() => setCliOpen((o) => !o)}
                className="num pointer-events-auto flex h-7 shrink-0 items-center gap-1.5 rounded-[3px] border border-ink-600 bg-ink-950/80 px-2 text-[10.5px] text-slate-300 lg:hidden"
              >
                <span className="text-emerald-400">›_</span> CLI
              </button>
            </div>
            <div
              className={cx(
                'absolute left-2 top-11 transition-all duration-300 lg:left-auto lg:right-3 lg:top-3',
                tourHighlight === 'step2' && 'ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)] animate-pulse',
              )}
            >
              <StressLegend strainMax={snapshot?.strainMax} />
            </div>

            {ejected && (
              <div className="absolute inset-x-2 bottom-2 border border-red-500/60 bg-red-950/90 px-3 py-2 shadow-[0_0_40px_rgba(239,68,68,0.25)] backdrop-blur-sm lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-14 lg:-translate-x-1/2 lg:px-4">
                <div className="num flex items-start gap-2.5 text-[10.5px] leading-snug tracking-[0.04em] text-red-100 lg:items-center lg:text-[12px] lg:tracking-[0.06em]">
                  <span className="mt-1 h-2 w-2 shrink-0 animate-blink rounded-[1px] bg-red-500 lg:mt-0" />
                  CRITICAL INSTABILITY: Z-SPIN &gt; 3.0 RAD/S (TWIST-OUT EJECTION)
                </div>
                <div className="num mt-0.5 hidden pl-[18px] text-[10.5px] text-red-300/80 sm:block">
                  peak |ωz| {fmt(decision.peakWz)} rad/s · ΔT_z {fmt(decision.excessEnergy)} J · v_eject ≤ {fmt(decision.ejectionSpeed)} m/s
                </div>
              </div>
            )}

            <div className="num absolute bottom-3 right-3 hidden items-center gap-1.5 text-[10.5px] text-slate-500 lg:flex">
              <Kbd>L</Kbd> launch <Kbd>R</Kbd> reset <Kbd>Space</Kbd> pause <Kbd>V</Kbd> view
              <button
                type="button"
                onClick={() => setCliOpen((o) => !o)}
                className="pointer-events-auto ml-1.5 flex h-6 items-center gap-1.5 rounded-[3px] border border-ink-600 bg-ink-950/80 px-2 text-slate-300 hover:border-slate-400"
              >
                <span className="text-emerald-400">›_</span> CLI <Kbd>/</Kbd>
              </button>
            </div>
            <div className="num absolute bottom-[100px] left-[18px] hidden text-[9px] tracking-[0.12em] text-slate-600 lg:block">LVLH</div>
          </div>

          <CliTerminal open={cliOpen} lines={cliLines} onSubmit={runCommand} onClose={() => setCliOpen(false)} />
        </section>

        {!panelsCollapsed && <MobileActionBar snapshot={snapshot} api={api} />}

        <div className={cx(panelsCollapsed ? 'hidden lg:contents' : 'min-h-0 flex-1 lg:contents')}>
          <section
            className={cx(
              mobileTab === 'plots' ? 'flex' : 'hidden',
              'scroll-thin h-full flex-col overflow-y-auto bg-ink-925 lg:col-start-2 lg:row-start-2 lg:flex lg:h-auto lg:flex-row lg:overflow-x-auto lg:overflow-y-hidden lg:border-t lg:border-ink-700',
            )}
          >
            <InertiaTensor snapshot={snapshot} />
            <ChartCard title="Energy" hint="J" legend={ENERGY_SERIES} highlighted={tourHighlight === 'step2'}>
              <TimeSeriesChart history={api.history} series={ENERGY_SERIES} />
            </ChartCard>
            <ChartCard
              tabs={<Segmented options={DYNAMICS_OPTIONS} value={plot} onChange={setPlot} className="h-6" />}
              hint={DYNAMICS_PLOTS[plot].hint}
              legend={DYNAMICS_PLOTS[plot].series}
            >
              <TimeSeriesChart key={plot} history={api.history} series={DYNAMICS_PLOTS[plot].series} {...DYNAMICS_PLOTS[plot].props} />
            </ChartCard>
          </section>

          <div className={cx(mobileTab === 'control' ? 'block' : 'hidden', 'h-full lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block lg:min-h-0')}>
            <Controls api={api} commanded={commanded} snapshot={snapshot} onExport={handleExport} tourHighlight={tourHighlight} />
          </div>
          <div className={cx(mobileTab === 'telemetry' ? 'block' : 'hidden', 'h-full lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:block lg:min-h-0')}>
            <TelemetryHUD snapshot={snapshot} decision={decision} events={events} graph={api.graph} />
          </div>
        </div>
      </main>

      <nav
        className={cx(
          'flex shrink-0 border-t border-ink-700 bg-ink-925 pb-[env(safe-area-inset-bottom)] lg:hidden',
          panelsCollapsed && 'hidden',
        )}
        aria-label="Panels"
      >
        {MOBILE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMobileTab(t.id)}
            aria-current={mobileTab === t.id ? 'page' : undefined}
            className={cx(
              'relative h-12 flex-1 text-[12.5px] font-medium tracking-[0.02em] transition-colors',
              mobileTab === t.id ? 'text-slate-100' : 'text-slate-500',
            )}
          >
            {t.label}
            {mobileTab === t.id && <span className="absolute inset-x-8 top-0 h-px bg-slate-200" />}
          </button>
        ))}
      </nav>

      {/* Floating Toggle Panels button on viewports < 768px (md:hidden) */}
      <button
        type="button"
        onClick={() => setPanelsCollapsed((p) => !p)}
        className="num fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-cyan-500/60 bg-ink-950/90 px-3.5 py-2 text-[11px] font-medium text-cyan-300 shadow-[0_0_20px_rgba(0,0,0,0.8),0_0_12px_rgba(34,211,238,0.25)] backdrop-blur-md transition-all active:scale-95 md:hidden hover:border-cyan-400 hover:text-white"
        aria-label={panelsCollapsed ? 'Show HUD panels' : 'Hide HUD panels'}
      >
        <span className={cx('flex h-2 w-2 rounded-full', panelsCollapsed ? 'bg-cyan-400 animate-pulse' : 'bg-slate-400')} />
        <span>{panelsCollapsed ? 'Show Panels' : 'Toggle Panels'}</span>
      </button>

      {/* Guided Tour Modal */}
      <GuidedTour
        isTourActive={isTourActive}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onClose={() => setIsTourActive(false)}
      />
    </div>
  )
}
