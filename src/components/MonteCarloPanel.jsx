import { useState } from 'react'
import { PRIORS, PRIOR_DESCRIPTION } from '../physics/priors.js'
import { rowsToCsv } from '../physics/monteCarloStats.js'
import { MC_DEFAULT, MC_MAX_N, MC_MIN_N, useMonteCarlo } from '../hooks/useMonteCarlo.js'
import { Button, Label, Section, cx } from './ui.jsx'

const PRIOR_OPTIONS = [...PRIORS, 'custom']

const INPUT =
  'num h-7 w-full rounded-[3px] border border-ink-600 bg-ink-950 px-2 text-[12px] text-slate-100 outline-none transition-colors focus:border-slate-400 disabled:opacity-50'

function pct(num, den) {
  return den ? `${((100 * num) / den).toFixed(2)} %` : '—'
}

function ConfusionTable({ id, title, c, note }) {
  const rows = [
    ['Predicted SECURE', c.secureSecure, c.falseSecure],
    ['Predicted EJECT', c.falseEject, c.ejectEject],
  ]
  return (
    <div className="bg-ink-900 p-2.5" data-confusion={id}>
      <div className="flex items-baseline justify-between">
        <Label className="text-[9.5px]">{title}</Label>
        <span className="num text-[10.5px] text-slate-400">
          agree {c.agree} / {c.n} · {pct(c.agree, c.n)}
        </span>
      </div>
      <table className="num mt-1.5 w-full text-[11.5px]">
        <thead>
          <tr className="text-[9.5px] uppercase tracking-[0.08em] text-slate-600">
            <th className="text-left font-medium"> </th>
            <th className="text-right font-medium">label SECURE</th>
            <th className="text-right font-medium">label EJECT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, a, b], k) => (
            <tr key={name} className="text-slate-200">
              <td className="py-[2px] text-left text-slate-400">{name}</td>
              <td className={cx('py-[2px] text-right', k === 1 && a > 0 && 'text-amber-300')}>{a}</td>
              <td className={cx('py-[2px] text-right', k === 0 && b > 0 && 'text-red-300')}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-[10.5px] text-slate-500">
        predicted SECURE {c.predictedSecure} · false-secure <span className="text-red-300">{c.falseSecure}</span> ({pct(c.falseSecure, c.predictedSecure)} of predicted SECURE)
        {' · '}false-eject <span className="text-amber-300">{c.falseEject}</span>
        {note && <span> · {note}</span>}
      </div>
    </div>
  )
}

function Histogram({ h, title }) {
  if (!h || h.count === 0) {
    return (
      <div className="bg-ink-900 p-2.5">
        <Label className="text-[9.5px]">{title}</Label>
        <div className="mt-1 text-[11px] text-slate-500">No false-secure rows.</div>
      </div>
    )
  }
  const max = Math.max(...h.bins.map((b) => b.count))
  return (
    <div className="bg-ink-900 p-2.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-[9.5px]">{title}</Label>
        <span className="num text-[10.5px] text-slate-400">
          {h.count} rows · |ω0| {h.min.toFixed(3)}–{h.max.toFixed(3)} rad/s
        </span>
      </div>
      <div className="mt-2 flex h-20 items-end gap-[2px]" role="img" aria-label={`Histogram of initial spin magnitude for ${h.count} false-secure rows, bin 0.5 rad/s`}>
        {h.bins.map((b) => (
          <div key={b.lo} className="flex flex-1 flex-col items-center justify-end" title={`${b.lo.toFixed(1)}–${b.hi.toFixed(1)} rad/s: ${b.count}`}>
            <span className="num text-[9px] text-slate-500">{b.count || ''}</span>
            <div className="w-full bg-red-400/70" style={{ height: `${(100 * b.count) / max}%`, minHeight: b.count ? 2 : 0 }} />
          </div>
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[9.5px] text-slate-600">
        <span>{h.bins[0].lo.toFixed(1)}</span>
        <span>|ω0| rad/s, bin 0.5</span>
        <span>{h.bins[h.bins.length - 1].hi.toFixed(1)}</span>
      </div>
    </div>
  )
}

function downloadCsv(result) {
  const csv = rowsToCsv(result.rows)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const p = typeof result.config.prior === 'string' ? result.config.prior : `custom_${result.config.prior.min}-${result.config.prior.max}`
  a.href = url
  a.download = `montecarlo_${p}_N${result.config.n}_seed${result.config.seed}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function MonteCarloPanel() {
  const [cfg, setCfg] = useState(MC_DEFAULT)
  const [histKey, setHistKey] = useState('rule')
  const { status, progress, result, error, run, cancel } = useMonteCarlo()
  const running = status === 'running'
  const set = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.value }))
  const s = result?.summary

  return (
    <div className="flex flex-col">
      <Section title="Monte Carlo over a spin prior" aside={<span className="text-[10px] text-slate-600">same sampler as genData.mjs</span>}>
        <form
          className="flex flex-col gap-2 px-3 pb-3"
          onSubmit={(e) => {
            e.preventDefault()
            run(cfg)
          }}
        >
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            Prior
            <select className={INPUT} value={cfg.prior} onChange={set('prior')} disabled={running} aria-label="Spin prior">
              {PRIOR_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <span className="text-[10.5px] text-slate-500">{PRIOR_DESCRIPTION[cfg.prior]}</span>
          </label>
          {cfg.prior === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                |ω| min (rad/s)
                <input className={INPUT} inputMode="decimal" value={cfg.customMin} onChange={set('customMin')} disabled={running} aria-label="custom prior minimum spin magnitude" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                |ω| max (rad/s)
                <input className={INPUT} inputMode="decimal" value={cfg.customMax} onChange={set('customMax')} disabled={running} aria-label="custom prior maximum spin magnitude" />
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-slate-400">
              N ({MC_MIN_N}–{MC_MAX_N})
              <input className={INPUT} type="number" min={MC_MIN_N} max={MC_MAX_N} step={1} value={cfg.n} onChange={set('n')} disabled={running} aria-label="number of samples" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-slate-400">
              Seed
              <input className={INPUT} type="number" min={0} step={1} value={cfg.seed} onChange={set('seed')} disabled={running} aria-label="random seed" />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={running} className="h-7 px-3 text-[11.5px]">
              {running ? 'Running…' : 'Run'}
            </Button>
            {running && (
              <Button onClick={cancel} className="h-7 px-3 text-[11.5px]">
                Cancel
              </Button>
            )}
            {running && (
              <span className="num text-[11px] text-slate-400" role="status" aria-live="polite">
                {progress.done} / {progress.total}
              </span>
            )}
            {result && (
              <Button onClick={() => downloadCsv(result)} className="ml-auto h-7 px-3 text-[11.5px]" aria-label="Export all rows as CSV">
                Export CSV
              </Button>
            )}
          </div>
          {error && <div className="text-[11px] text-red-300">{error}</div>}
          <p className="text-[10.5px] leading-snug text-slate-500">
            Rows are drawn with mulberry32(seed + 9973·c) over a fixed 8-way split (per chunk ⌈N/8⌉), the split used by{' '}
            <code>scripts/surrogate/genData.mjs</code> on the 8-thread reference machine, so uniform-box · N 1200 · seed 777001 reproduces{' '}
            <code>capture.json</code>. Label = RK4 contact-window peak ≤ 3.0 rad/s at zero fire delay.
          </p>
        </form>
      </Section>

      {s && (
        <>
          <Section
            title="Confusion vs solver label"
            aside={
              <span className="num whitespace-nowrap text-[10px] text-slate-500">
                N {s.n} · {(result.elapsedMs / 1000).toFixed(2)} s
              </span>
            }
          >
            <div className="num px-3 pb-2 text-[10.5px] text-slate-500">
              label SECURE {s.labelSecure} · label EJECT {s.n - s.labelSecure} · {result.config.chunks} chunks of ⌈N/8⌉ · {result.config.concurrency} workers
            </div>
            <div className="grid grid-cols-1 gap-px bg-ink-700/60 px-3 pb-3">
              <ConfusionTable id="rule" title="Static rule |ωz0| ≤ 3.0" c={s.rule} />
              <ConfusionTable id="envelope" title="Envelope ωz,max ≤ 3.0 (closed form)" c={s.envelope} note={`physics-limited ${s.physicsLimited} · window-limited ${s.windowLimited}`} />
              <ConfusionTable id="pinn" title="PINN fireNowSecure" c={s.pinn} />
            </div>
            <div className="px-3 pb-3 text-[10.5px] leading-snug text-slate-500">
              physics-limited = rule SECURE and closed-form ωz,max &gt; 3 (no fire delay can help); window-limited = closed-form ωz,max &gt; 3 but
              the 0.25 s window peak ≤ 3 (would eject with a later arrival).
            </div>
          </Section>
          <Section
            title="|ω0| of false-secure cases"
            aside={
              <div className="flex gap-1" role="group" aria-label="false-secure predictor">
                {['rule', 'envelope', 'pinn'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={histKey === k}
                    onClick={() => setHistKey(k)}
                    className={cx('rounded-[2px] px-1.5 text-[10px] uppercase tracking-[0.06em]', histKey === k ? 'bg-ink-700 text-slate-100' : 'text-slate-500 hover:text-slate-300')}
                  >
                    {k}
                  </button>
                ))}
              </div>
            }
          >
            <div className="px-3 pb-3">
              <Histogram h={s.histogram[histKey]} title={`${histKey} SECURE, label EJECT`} />
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
