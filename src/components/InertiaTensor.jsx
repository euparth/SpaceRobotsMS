import { memo } from 'react'
import { IX, IY, IZ, principalAxes } from '../physics/rigidBody.js'
import { Label, cx, fmt } from './ui.jsx'

const TENSOR = [
  [IX, 0, 0],
  [0, IY, 0],
  [0, 0, IZ],
]
const ROLE_SHORT = { major: 'MAJ', intermediate: 'INT', minor: 'MIN' }
const ROLES = principalAxes().map((a) => ROLE_SHORT[a.role])

function Bracket({ children, className }) {
  return (
    <div className={cx('relative px-1.5 py-1', className)}>
      <span className="absolute inset-y-0 left-0 w-1 rounded-l-[2px] border-y border-l border-slate-500/70" />
      <span className="absolute inset-y-0 right-0 w-1 rounded-r-[2px] border-y border-r border-slate-500/70" />
      {children}
    </div>
  )
}

function Column({ values, digits, tone }) {
  return (
    <Bracket>
      <div className="grid gap-y-0.5">
        {values.map((v, i) => (
          <span key={i} className={cx('num w-[52px] text-right text-[11.5px] leading-[18px]', tone?.(v, i) ?? 'text-slate-100')}>
            {fmt(v, digits, { sign: true })}
          </span>
        ))}
      </div>
    </Bracket>
  )
}

function InertiaTensor({ snapshot }) {
  const w = snapshot?.w ?? [0, 0, 0]
  const hb = [IX * w[0], IY * w[1], IZ * w[2]]

  return (
    <div className="flex w-[322px] shrink-0 flex-col border-r border-ink-700 px-3 pb-2.5 pt-2">
      <div className="flex items-baseline justify-between">
        <Label>Inertia tensor · body frame</Label>
        <span className="num text-[10px] text-slate-600">H_b = I · ω</span>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        <Bracket>
          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
            {TENSOR.flatMap((row, r) =>
              row.map((v, c) => (
                <span
                  key={`${r}${c}`}
                  className={cx('num w-[38px] text-right text-[11.5px] leading-[18px]', r === c ? 'text-slate-100' : 'text-slate-600')}
                >
                  {r === c ? v.toFixed(3) : '0'}
                </span>
              )),
            )}
          </div>
        </Bracket>
        <span className="num text-[12px] text-slate-500">·</span>
        <Column values={w} digits={2} tone={(v, i) => (i === 2 && Math.abs(v) > 3 ? 'text-red-300' : 'text-slate-100')} />
        <span className="num text-[12px] text-slate-500">=</span>
        <Column values={hb} digits={3} />
      </div>

      <div className="mt-1 flex items-center gap-1.5 pl-1.5">
        <div className="grid w-[138px] grid-cols-3 gap-x-2">
          {ROLES.map((r, i) => (
            <span key={i} className={cx('num w-[38px] text-right text-[9px] tracking-[0.08em]', r === 'INT' ? 'text-amber-400/90' : 'text-slate-600')}>
              {r}
            </span>
          ))}
        </div>
        <span className="num w-[70px] text-center text-[9px] tracking-[0.08em] text-slate-600">rad/s</span>
        <span className="num w-[64px] text-right text-[9px] tracking-[0.08em] text-slate-600">N·m·s</span>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-px border border-ink-700 bg-ink-700">
        <div className="bg-ink-900 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-[0.12em] text-slate-500">T</div>
          <div className="num text-[12px] text-slate-100">{fmt(snapshot?.ke, 3)} <span className="text-[9.5px] text-slate-500">J</span></div>
        </div>
        <div className="bg-ink-900 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-[0.12em] text-slate-500">|H|</div>
          <div className="num text-[12px] text-slate-100">{fmt(snapshot?.hMag, 3)}</div>
        </div>
        <div className="bg-ink-900 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-[0.12em] text-slate-500">θ nut</div>
          <div className="num text-[12px] text-slate-100">{fmt(snapshot?.nutation, 1)}°</div>
        </div>
      </div>
    </div>
  )
}

export default memo(InertiaTensor)
