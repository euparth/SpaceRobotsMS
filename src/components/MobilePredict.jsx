import { useState } from 'react'
import { CAPTURE, MAX_RATE, UI_PRESETS as PRESETS } from '../physics/constants.js'
import { predictOutcome, principalAxes } from '../physics/rigidBody.js'
import { PHASE } from '../physics/stateLayout.js'
import { Button, Metric, cx, fmt } from './ui.jsx'
import { WzChart, autoFirePlan } from './TelemetryHUD.jsx'
import VerdictsPanel from './VerdictsPanel.jsx'

const AXES = principalAxes()

const CHIP_NOTE = Object.freeze({
  S1: 'Coop',
  S2: 'Stable',
  S3: 'High-Z',
  S4: 'Coupled',
  S5: 'Boundary',
})

function RateRow({ axis, role, value, disabled, onCommit }) {
  const isZ = axis === 'z'
  const over = isZ && value > CAPTURE.wzLimit
  const pct = (value / MAX_RATE) * 100
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_52px] items-center gap-2 py-1">
      <div className="leading-none">
        <div className="num text-[12px] text-slate-200">
          ω<sub className="text-[9px]">{axis}</sub>
        </div>
        <div className="mt-0.5 text-[8px] uppercase tracking-[0.1em] text-slate-600">{role}</div>
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
      <span className={cx('num text-right text-[12px]', over ? 'text-red-300' : 'text-slate-100')}>{fmt(value, 2)}</span>
    </div>
  )
}

function VerdictBanner({ prediction }) {
  if (!prediction) {
    return <div className="border border-ink-700 bg-ink-950/60 px-3 py-2 text-[12px] text-slate-500">Warming up surrogate…</div>
  }
  const never = prediction.firstSecureMs == null && !prediction.fireNowSecure
  const tone = prediction.fireNowSecure ? 'ok' : never ? 'alert' : 'warn'
  return (
    <div
      className={cx(
        'border px-3 py-2 text-[12px] leading-snug',
        tone === 'ok' && 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200',
        tone === 'warn' && 'border-amber-500/50 bg-amber-950/40 text-amber-100',
        tone === 'alert' && 'border-rose-500/50 bg-rose-950/40 text-rose-100',
      )}
    >
      <div className="font-medium tracking-wide">{prediction.statusText}</div>
      <div className="num mt-1 text-[10.5px] opacity-80">
        peak |ωz|̂ {fmt(prediction.peakWzPred)} rad/s
        {never
          ? ' · no secure launch phase in horizon'
          : prediction.fireNowSecure
            ? ` · ≤ ${fmt(CAPTURE.wzLimit)} limit`
            : ` · secure in ${fmt(prediction.captureProbability, 0)}% of phases`}
      </div>
    </div>
  )
}

/**
 * Design B — mobile-first Predict panel.
 * Select a scenario → see AI capture verdict, ωz(t) evidence, and arm auto-fire on one screen.
 */
export default function MobilePredict({
  api,
  commanded,
  snapshot,
  aiEnabled,
  prediction,
  metrics,
  onArmAutoFire,
  autoFireArmed,
  verdicts,
  tourHighlight,
  onScroll,
}) {
  const [ratesOpen, setRatesOpen] = useState(false)
  const phase = snapshot?.phase ?? PHASE.IDLE
  const armed = phase === PHASE.IDLE
  const polhode = predictOutcome(commanded)
  const plan = autoFirePlan(verdicts)

  const activeId = PRESETS.find((p) => p.w.every((x, i) => Math.abs(x - commanded[i]) < 1e-6))?.id

  const setAxis = (i, v) => {
    const next = [...commanded]
    next[i] = v
    api.setSpin(next)
  }

  const canArm = plan.ready && !plan.never && !autoFireArmed

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-ink-700 bg-ink-925 lg:hidden">
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain" onScroll={onScroll}>
        {!aiEnabled && (
          <div className="border-b border-ink-700 px-3 py-2 text-[12px] text-slate-500">
            AI predictor is off — toggle <span className="text-slate-300">AI ON</span> in the action bar.
          </div>
        )}

        <div className="border-b border-ink-700 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Scenario</span>
            <span className="num text-[10px] text-slate-600">tap → AI verdict</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Scenario presets">
            {PRESETS.map((preset) => {
              const active = preset.id === activeId
              const isS3 = preset.id === 'S3' && tourHighlight === 'step3'
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!armed}
                  onClick={() => api.applyPreset(preset.id)}
                  aria-pressed={active}
                  title={preset.note}
                  className={cx(
                    'flex h-11 flex-col items-center justify-center rounded-[3px] border text-[12px] transition-colors disabled:opacity-50',
                    active
                      ? 'border-cyan-500/60 bg-cyan-950/50 text-slate-100'
                      : 'border-ink-600 bg-ink-900 text-slate-400 hover:border-slate-500',
                    isS3 && 'animate-pulse border-cyan-400 bg-cyan-950/70 ring-2 ring-cyan-400',
                  )}
                >
                  <span className="num font-medium">{preset.id}</span>
                  <span className="text-[9px] text-slate-500">{CHIP_NOTE[preset.id]}</span>
                </button>
              )
            })}
          </div>
        </div>

        <VerdictsPanel verdicts={verdicts} compact />

        <div className="border-b border-ink-700 px-3 py-2.5">
          <VerdictBanner prediction={aiEnabled ? prediction : null} />
          {aiEnabled && prediction && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <Metric
                label="PEAK |ωz|̂"
                value={fmt(prediction.peakWzPred, 2)}
                unit="rad/s"
                tone={prediction.peakWzPred > CAPTURE.wzLimit ? 'alert' : 'ok'}
              />
              <Metric label="PHASES" value={`${fmt(prediction.captureProbability, 0)}%`} />
              <Metric
                label="BEST DELAY"
                value={
                  prediction.firstSecureMs == null && !prediction.fireNowSecure
                    ? 'none'
                    : prediction.fireNowSecure
                      ? 'now'
                      : `+${prediction.optimalLaunchDelayMs}`
                }
                unit={prediction.fireNowSecure || prediction.firstSecureMs == null ? undefined : 'ms'}
              />
            </div>
          )}
        </div>

        {aiEnabled && prediction && (
          <div className="border-b border-ink-700 px-2 py-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">ωz(t) vs twist-out</span>
              <span className="num text-[10px] text-slate-600">physics-informed MLP</span>
            </div>
            <WzChart prediction={prediction} commanded={commanded} />
            {metrics && (
              <div className="num px-1 pt-1 text-[10px] text-slate-500">
                held-out {(100 * (metrics.captureAccuracy ?? metrics.fidelityScore ?? 0)).toFixed(0)}% vs naive{' '}
                {(100 * (metrics.naiveAccuracy ?? 0)).toFixed(0)}% · {fmt(prediction.inferenceLatencyMs, 2)} ms
              </div>
            )}
          </div>
        )}

        <div className="border-b border-ink-700">
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between px-3 text-left"
            onClick={() => setRatesOpen((o) => !o)}
            aria-expanded={ratesOpen}
          >
            <span className="num text-[12px] text-slate-300">
              ω₀ · [{commanded.map((v) => fmt(v, 1)).join(' · ')}]
              <span className="ml-2 text-[10px] text-slate-500">
                polhode peak {fmt(polhode.peak)} · {polhode.verdict.replace('_', '-')}
              </span>
            </span>
            <span className="num text-[10px] text-slate-500">{ratesOpen ? 'Hide ▴' : 'Edit ▾'}</span>
          </button>
          {ratesOpen && (
            <div className="px-3 pb-3">
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
              {!armed && (
                <p className="mt-1 text-[11px] text-slate-500">Rates locked while net is deployed — Reset to re-arm.</p>
              )}
            </div>
          )}
        </div>

        <div className="px-3 py-3">
          <Button
            variant="ghost"
            className={cx(
              'h-9 w-full border text-[12px]',
              autoFireArmed
                ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-300'
                : canArm
                  ? 'border-cyan-500/50 bg-cyan-950/40 text-cyan-200'
                  : 'border-ink-600 text-slate-500',
            )}
            disabled={!canArm || !armed}
            onClick={() => {
              if (plan.delayMs === 0) api.launch()
              else onArmAutoFire()
            }}
          >
            {autoFireArmed
              ? 'AUTO-FIRE ARMED'
              : !plan.ready
                ? 'Waiting for verdicts…'
                : plan.never
                  ? 'No secure window in 0–3.2 s — cannot arm'
                  : plan.delayMs === 0
                    ? 'Launch now — RK4 window secure'
                    : `Arm auto-fire · +${plan.delayMs} ms (RK4 window)`}
          </Button>
          {aiEnabled && prediction && (
            <p className="num mt-1.5 text-[10px] text-slate-500">
              PINN estimate (test MAE 703 ms): {prediction.firstSecureMs == null ? (prediction.fireNowSecure ? '0 ms' : 'none') : `${prediction.firstSecureMs} ms`}
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}
