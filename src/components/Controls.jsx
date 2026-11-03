import { useEffect, useRef, useState } from 'react'
import { CAPTURE, MAX_RATE, NET, UI_PRESETS as PRESETS, SOLVER } from '../physics/constants.js'
import { NET_MASS, NODE_COUNT } from '../physics/netTopology.js'
import { predictOutcome, principalAxes } from '../physics/rigidBody.js'
import { PHASE } from '../physics/stateLayout.js'
import { Button, Kbd, Label, Readout, Section, cx, fmt } from './ui.jsx'

const AXES = principalAxes()

const VERDICT = Object.freeze({
  SECURE: { label: 'SECURE', className: 'border-emerald-500/30 text-emerald-400' },
  EJECT: { label: 'EJECT', className: 'border-red-500/40 text-red-400' },
  PHASE_DEPENDENT: { label: 'PHASE-DEP', className: 'border-amber-500/40 text-amber-400' },
})

function RateRow({ axis, role, value, disabled, onCommit }) {
  const [draft, setDraft] = useState(value.toFixed(2))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(value.toFixed(2))
  }, [value, focused])

  const commit = () => {
    const v = parseFloat(draft)
    if (Number.isFinite(v)) onCommit(Math.min(MAX_RATE, Math.max(0, v)))
    else setDraft(value.toFixed(2))
  }

  const isZ = axis === 'z'
  const over = isZ && value > CAPTURE.wzLimit
  const pct = (value / MAX_RATE) * 100

  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_60px] items-center gap-3 py-[5px]">
      <div className="leading-none">
        <div className="num text-[12.5px] text-slate-200">
          ω<sub className="text-[9px]">{axis}</sub>
        </div>
        <div className="mt-1 text-[8.5px] uppercase tracking-[0.12em] text-slate-600">{role}</div>
      </div>
      <div className="relative">
        <input
          type="range"
          className="range"
          min={0}
          max={MAX_RATE}
          step={0.01}
          value={value}
          disabled={disabled}
          aria-label={`omega ${axis}`}
          onChange={(e) => onCommit(Number(e.target.value))}
          style={{ '--pct': `${pct}%`, '--fill': over ? '#f87171' : '#cbd5e1' }}
        />
        {isZ && (
          <span
            className="pointer-events-none absolute top-[3px] h-[10px] w-px bg-red-500/80"
            style={{ left: `${(CAPTURE.wzLimit / MAX_RATE) * 100}%` }}
          />
        )}
      </div>
      <input
        className={cx(
          'num h-7 w-full rounded-[3px] border bg-ink-950 px-2 text-right text-[12px] outline-none transition-colors disabled:opacity-50',
          over ? 'border-red-500/50 text-red-300' : 'border-ink-600 text-slate-100 focus:border-slate-400',
        )}
        value={draft}
        disabled={disabled}
        inputMode="decimal"
        spellCheck={false}
        aria-label={`omega ${axis} value`}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          commit()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </div>
  )
}

export default function Controls({ api, commanded, snapshot, onExport, tourHighlight }) {
  const phase = snapshot?.phase ?? PHASE.IDLE
  const armed = phase === PHASE.IDLE
  const paused = snapshot?.paused ?? false
  const prediction = predictOutcome(commanded)
  const verdict = VERDICT[prediction.verdict]
  const [timeScale, setTimeScale] = useState(SOLVER.defaultTimeScale)
  const sentScale = useRef(SOLVER.defaultTimeScale)
  // Follow the worker's rate when it changes from elsewhere (CLI `time_scale`), but not
  // mid-drag, where a lagging snapshot would yank the thumb back.
  const workerScale = snapshot?.timeScale
  useEffect(() => {
    if (!Number.isFinite(workerScale) || Math.abs(workerScale - sentScale.current) < 1e-4) return
    sentScale.current = workerScale
    setTimeScale(workerScale)
  }, [workerScale])

  const setAxis = (i, v) => {
    const next = [...commanded]
    next[i] = v
    api.setSpin(next)
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-ink-700 bg-ink-925">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <Section
          className={cx(
            'transition-all duration-300',
            tourHighlight === 'step1' && 'ring-2 ring-cyan-400/80 bg-cyan-950/25 shadow-[0_0_24px_rgba(34,211,238,0.35)]',
          )}
          title={
            <>
              Initial body rates <span className="normal-case">ω₀</span>
            </>
          }
          aside={<span className="num text-[10px] text-slate-600">rad/s · body</span>}
        >
          {AXES.map((a, i) => (
            <RateRow
              key={a.axis}
              axis={a.axis}
              role={a.role}
              value={commanded[i]}
              disabled={!armed}
              onCommit={(v) => setAxis(i, v)}
            />
          ))}
          <div className="mt-2.5 border border-ink-700 bg-ink-950/60 px-2.5 py-1.5">
            <Readout
              label="|ωz| commanded"
              value={fmt(Math.abs(commanded[2]))}
              unit="rad/s"
              tone={Math.abs(commanded[2]) > CAPTURE.wzLimit ? 'alert' : 'default'}
            />
            <Readout
              label="Polhode peak |ωz|"
              value={fmt(prediction.peak)}
              unit="rad/s"
              tone={prediction.peak > CAPTURE.wzLimit ? 'warn' : 'default'}
            />
            <Readout label="Twist-out limit" value={fmt(CAPTURE.wzLimit)} unit="rad/s" tone="muted" />
            <div className="flex h-[26px] items-center justify-between">
              <span className="text-[11.5px] text-slate-400">Forecast</span>
              <span className={cx('num rounded-[2px] border px-1.5 text-[10px] leading-[18px] tracking-[0.08em]', verdict.className)}>
                {verdict.label}
              </span>
            </div>
          </div>
          {!armed && (
            <p className="mt-2 text-[11px] leading-snug text-slate-500">Rates are locked while the net is deployed. Reset to re-arm.</p>
          )}
        </Section>

        <Section title="Scenarios" aside={<span className="num text-[10px] text-slate-600">ωx · ωy · ωz</span>} bodyClassName="px-0 pb-1">
          {PRESETS.map((preset, index) => {
            const p = predictOutcome(preset.w)
            const v = VERDICT[p.verdict]
            const active = preset.w.every((x, i) => Math.abs(x - commanded[i]) < 1e-6)
            const isS3Pulse = preset.id === 'S3' && tourHighlight === 'step3'
            return (
              <button
                key={preset.id}
                type="button"
                disabled={!armed}
                onClick={() => api.applyPreset(preset.id)}
                title={preset.note}
                className={cx(
                  'grid w-full grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-[7px] text-left transition-all disabled:cursor-not-allowed disabled:opacity-50',
                  active ? 'bg-ink-800' : 'hover:bg-ink-850',
                  isS3Pulse && 'ring-2 ring-cyan-400 border border-cyan-400 bg-cyan-950/70 shadow-[0_0_20px_rgba(34,211,238,0.6)] animate-pulse',
                )}
              >
                <span className={cx('num text-[10.5px]', active ? 'text-slate-200' : 'text-slate-500')}>{preset.id}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-slate-200">{preset.name}</span>
                  <span className="num block text-[10.5px] text-slate-500">{preset.w.map((x) => x.toFixed(2)).join(' · ')}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={cx('num rounded-[2px] border px-1 text-[9px] leading-[16px] tracking-[0.08em]', v.className)}>{v.label}</span>
                  <Kbd className="hidden lg:inline-flex">{index + 1}</Kbd>
                </span>
              </button>
            )
          })}
        </Section>

        <Section title="Simulation clock" aside={<span className="num text-[10px] text-slate-600">t_sim / t_wall</span>}>
          <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-3">
            <input
              type="range"
              className="range"
              min={0.05}
              max={1}
              step={0.05}
              value={timeScale}
              aria-label="time scale"
              onChange={(e) => {
                const v = Number(e.target.value)
                sentScale.current = v
                setTimeScale(v)
                api.setTimeScale(v)
              }}
              style={{ '--pct': `${((timeScale - 0.05) / 0.95) * 100}%` }}
            />
            <span className="num text-right text-[12px] text-slate-100">{timeScale.toFixed(2)}×</span>
          </div>
          <p className="mt-1.5 hidden text-[11px] leading-snug text-slate-500 lg:block">
            A {NET.approachSpeed.toFixed(1)} m/s intercept over {NET.standoff.toFixed(1)} m lasts {(NET.standoff / NET.approachSpeed).toFixed(2)} s of sim time.
          </p>
          <Button variant="ghost" className="mt-2.5 w-full" onClick={paused ? api.resume : api.pause}>
            {paused ? 'Resume integration' : 'Pause integration'}
            <Kbd className="hidden lg:inline-flex">Space</Kbd>
          </Button>
        </Section>

        {/* Full net spec is desktop/reference — on phones it buries S1–S4 and the forecast */}
        <Section title="Net payload" className="hidden lg:block">
          <Readout label="Material" value={NET.material} />
          <Readout label="Mesh" value={`${NET.size.toFixed(1)} × ${NET.size.toFixed(1)} m`} />
          <Readout label="Lattice" value={`${Math.sqrt(NODE_COUNT)} × ${Math.sqrt(NODE_COUNT)} knots`} />
          <Readout label="Young's modulus E" value="120" unit="GPa" />
          <Readout label="Density ρ" value="1 440" unit="kg/m³" />
          <Readout label="Friction μ" value={NET.friction.toFixed(2)} />
          <Readout label="Approach v_rel" value={NET.approachSpeed.toFixed(1)} unit="m/s" />
          <Readout label="Thread Ø" value={(NET.threadDiameter * 1000).toFixed(1)} unit="mm" />
          <Readout label="Mesh mass" value={(NET_MASS * 1000).toFixed(1)} unit="g" />
          <Readout label="Corner masses" value={`4 × ${(NET.cornerMass * 1000).toFixed(0)}`} unit="g" />
          <Readout label="η weave" value={fmt(snapshot?.eta ?? NET.wovenEfficiency, 4)} tone="muted" />
        </Section>
      </div>

      {/* Desktop only: Launch lives in the mobile action bar; export is not a phone demo action */}
      <div className="hidden border-t border-ink-700 bg-ink-900 p-3 lg:block">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Button variant="primary" disabled={!armed} onClick={api.launch}>
            Launch capture net
            <span className="num rounded-[2px] border border-ink-950/20 px-1 text-[10px] leading-[16px]">L</span>
          </Button>
          <Button variant="ghost" onClick={api.reset} title="Reset (R)">
            Reset
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Label>Export dataset</Label>
          <div className="flex gap-1.5">
            <Button variant="ghost" className="h-7 px-2.5" onClick={() => onExport('json')}>
              JSON
            </Button>
            <Button variant="ghost" className="h-7 px-2.5" onClick={() => onExport('csv')}>
              CSV
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
