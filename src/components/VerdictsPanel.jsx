import { Section, cx, fmt } from './ui.jsx'

const BADGE = Object.freeze({
  SECURE: 'border-emerald-500/40 text-emerald-300',
  EJECT: 'border-red-500/50 text-red-300',
  MISS: 'border-amber-500/50 text-amber-300',
  PENDING: 'border-ink-600 text-slate-500',
})

function Badge({ verdict, disagree }) {
  const v = verdict ?? 'PENDING'
  return (
    <span
      className={cx(
        'num inline-block rounded-[2px] border px-1.5 text-[10px] leading-[18px] tracking-[0.08em]',
        BADGE[v] ?? BADGE.PENDING,
        disagree && 'bg-amber-500/15 ring-1 ring-amber-400/70',
      )}
      title={disagree ? 'Disagrees with the reference verdict' : undefined}
    >
      {v === 'PENDING' ? '—' : v}
    </span>
  )
}

function Cell({ name, def, verdict, quantity, unit, qLabel, title, disagree, children }) {
  return (
    <div
      className={cx('flex min-w-0 flex-col gap-1 border border-ink-700 bg-ink-950/60 px-2 py-1.5', disagree && 'border-amber-500/50')}
      role="group"
      aria-label={`${name} verdict`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">{name}</span>
        <Badge verdict={verdict} disagree={disagree} />
      </div>
      <div className="num text-[13px] leading-none text-slate-100" title={title}>
        {quantity == null ? '—' : fmt(quantity, 3)}
        {quantity != null && unit && <span className="ml-1 text-[10px] text-slate-500">{unit}</span>}
        {title && <span className="ml-1 cursor-help text-[10px] text-slate-500" aria-hidden>ⓘ</span>}
      </div>
      <div className="text-[9.5px] leading-tight text-slate-500">{qLabel}</div>
      <div className="text-[9.5px] leading-tight text-slate-600">{def}</div>
      {children}
    </div>
  )
}

export function envelopeTooltip(env) {
  if (!env) return undefined
  const branch = env.branch == null ? 'none (equilibrium spin or rest)' : env.branch === 'a=0' ? 'a = 0 (ωx vanishes at the peak)' : 'b = 0 (ωy vanishes at the peak)'
  const lines = [
    `2T = Ix ωx² + Iy ωy² + Iz ωz² = ${env.twoT.toPrecision(7)} J`,
    `H² = Ix² ωx² + Iy² ωy² + Iz² ωz² = ${env.h2.toPrecision(7)} (N·m·s)²`,
    `active branch: ${branch}`,
  ]
  for (const c of env.candidates ?? []) {
    lines.push(`${c.name}: c = ${c.c.toPrecision(6)}, other = ${c.other.toPrecision(6)} → ${c.feasible ? 'feasible' : 'infeasible'}`)
  }
  return lines.join('\n')
}

/**
 * Four verdicts side by side for the commanded ω0. Reference for disagreement highlighting:
 * the solver verdict once a rollout has reached a decision, else the numeric fire-now label.
 */
export default function VerdictsPanel({ verdicts, compact = false }) {
  if (!verdicts) return <div className="p-3 text-[12px] text-slate-500">Computing verdicts…</div>
  const { rule, envelope, pinn, numeric, solver, limit } = verdicts
  const reference = solver && solver.verdict !== 'MISS' ? solver.verdict : numeric.verdict
  const dis = (v) => v != null && v !== 'MISS' && v !== reference
  const solverVerdict = solver?.verdict ?? null
  const ttt = numeric.timeToThresholdS
  return (
    <Section
      title="Verdicts"
      aside={
        <span className="num text-[10px] text-slate-600">
          ω₀ [{verdicts.w0.map((v) => fmt(v, 2)).join(', ')}] · limit {fmt(limit, 1)} rad/s
        </span>
      }
    >
      <div className={cx('grid gap-1.5', compact ? 'grid-cols-2' : 'grid-cols-2 min-[1700px]:grid-cols-4')}>
        <Cell
          name="Static rule"
          verdict={rule.verdict}
          disagree={dis(rule.verdict)}
          quantity={rule.wz0}
          unit="rad/s"
          qLabel="|ωz0| at t = 0"
          def="SECURE iff |ωz0| ≤ 3.0. Ignores the polhode."
        />
        <Cell
          name="Envelope"
          verdict={envelope.verdict}
          disagree={dis(envelope.verdict)}
          quantity={envelope.max}
          unit="rad/s"
          qLabel="ωz,max closed-form (any time)"
          def="Max |ωz| on the energy-ellipsoid ∩ momentum-sphere curve. SECURE iff ≤ 3.0."
          title={envelopeTooltip(envelope)}
        />
        <Cell
          name="PINN"
          verdict={pinn?.verdict ?? null}
          disagree={dis(pinn?.verdict)}
          quantity={pinn?.peak}
          unit="rad/s"
          qLabel="predicted window peak, fire now"
          def="MLP surrogate (committed weights). SECURE iff predicted peak ≤ 3.0."
        />
        <Cell
          name="Solver"
          verdict={solverVerdict}
          disagree={dis(solverVerdict)}
          quantity={solver?.peakWz ?? null}
          unit="rad/s"
          qLabel={solver ? `measured peak, launched at t = ${fmt(solver.tLaunch, 3)} s` : 'peak |ωz| over the 0.25 s contact window'}
          def={solver ? (solver.verdict === 'MISS' ? 'No contact within the miss timeout.' : 'Live worker rollout (RK4 body + XPBD net).') : 'Awaiting a rollout (press L or arm auto-fire).'}
        />
      </div>
      <div className="num mt-2 grid grid-cols-1 gap-y-0.5 text-[10.5px] text-slate-400">
        <div className="flex justify-between gap-2">
          <span>Numeric label, fire now (RK4 body, no net; dataset path)</span>
          <span className={numeric.verdict === 'SECURE' ? 'text-emerald-300' : 'text-red-300'}>
            {numeric.verdict} · peak {fmt(numeric.windowPeakNow, 3)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span>First secure fire delay (resolution {(numeric.resolutionS * 1000).toFixed(2)} ms, scan 0–{numeric.scanHorizonS} s)</span>
          <span>{numeric.firstSecureDelayMs == null ? 'none' : `${numeric.firstSecureDelayMs} ms`}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Time to |ωz| &gt; {fmt(limit, 1)} on the trajectory (≤ 20 s)</span>
          <span>{ttt == null ? 'never' : `${fmt(ttt, 4)} s`}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>PINN estimate of first secure delay (test MAE 703 ms)</span>
          <span>{pinn?.firstSecureMs == null ? (pinn?.verdict === 'SECURE' ? '0 ms' : 'none') : `${pinn.firstSecureMs} ms`}</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-slate-600">
        Highlighted cells disagree with the reference ({solver && solver.verdict !== 'MISS' ? 'solver' : 'numeric label'}). The rule and the envelope
        are not fire-now predictors: the rule reads the initial state only; the envelope bounds |ωz| for all time.
      </p>
    </Section>
  )
}
