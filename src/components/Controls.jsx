import {
  Crosshair,
  Play,
  RotateCcw,
  Satellite,
  SlidersHorizontal,
  Zap,
} from 'lucide-react'

const PRESETS = [
  {
    id: 'coop',
    label: 'Cooperative (0 rad/s)',
    omega: { wx: 0, wy: 0, wz: 0 },
  },
  {
    id: 'stable',
    label: 'Stable Tumbling (X=1.5, Y=1.0, Z=0.5)',
    omega: { wx: 1.5, wy: 1.0, wz: 0.5 },
  },
  {
    id: 'unstable',
    label: 'Unstable High-Spin (Z=4.2 rad/s)',
    omega: { wx: 0.8, wy: 0.4, wz: 4.2 },
  },
]

function AxisSlider({ axis, value, disabled, onChange }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-400">
        <span>ω{axis}</span>
        <span className="font-mono text-cyan-300">{value.toFixed(2)} rad/s</span>
      </div>
      <input
        type="range"
        min="0"
        max="5"
        step="0.05"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function Controls({ omega, setOmega, launched, onLaunch, onReset }) {
  const locked = launched
  const wzUnsafe = omega.wz > 3

  return (
    <aside className="glass-panel hud-scan pointer-events-auto max-h-[calc(100vh-7rem)] w-[20rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl p-4 shadow-hud">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-700/60 pb-3">
        <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
        <div>
          <p className="font-display text-lg font-semibold leading-none tracking-wide text-slate-100">
            Capture Control
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Non-cooperative 12U target
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-700/70 bg-slate-950/50 p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400">
          <Satellite className="h-3.5 w-3.5 text-amber-300" />
          Target angular velocity
        </div>
        <div className="space-y-3">
          <AxisSlider
            axis="x"
            value={omega.wx}
            disabled={locked}
            onChange={(wx) => setOmega((o) => ({ ...o, wx }))}
          />
          <AxisSlider
            axis="y"
            value={omega.wy}
            disabled={locked}
            onChange={(wy) => setOmega((o) => ({ ...o, wy }))}
          />
          <AxisSlider
            axis="z"
            value={omega.wz}
            disabled={locked}
            onChange={(wz) => setOmega((o) => ({ ...o, wz }))}
          />
        </div>
        <p className={`mt-3 text-[10px] ${wzUnsafe ? 'text-rose-400' : 'text-emerald-400/80'}`}>
          {wzUnsafe
            ? 'WARNING: Z-spin exceeds 3.0 rad/s twist-out threshold'
            : 'Z-spin within tensile restraint envelope (≤ 3.0 rad/s)'}
        </p>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-400">Presets</p>
        <div className="space-y-2">
          {PRESETS.map((p) => {
            const active =
              omega.wx === p.omega.wx && omega.wy === p.omega.wy && omega.wz === p.omega.wz
            return (
              <button
                key={p.id}
                disabled={locked}
                onClick={() => setOmega(p.omega)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                  active
                    ? 'border-cyan-400/70 bg-cyan-400/10 text-cyan-100'
                    : 'border-slate-700/80 bg-slate-950/40 text-slate-300 hover:border-slate-500'
                } disabled:opacity-40`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
        <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-2">
          <p className="uppercase tracking-widest text-slate-500">Net</p>
          <p className="mt-1 font-display text-sm text-amber-300">Kevlar 49</p>
          <p>2.0 m × 2.0 m · 12×12</p>
        </div>
        <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-2">
          <p className="uppercase tracking-widest text-slate-500">Approach</p>
          <p className="mt-1 font-display text-sm text-cyan-300">10.0 m/s</p>
          <p>μ = 0.20 · E = 120 GPa</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onLaunch}
          disabled={locked}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-2.5 font-display text-sm font-semibold tracking-wide text-slate-950 shadow-[0_0_24px_rgba(234,179,8,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play className="h-4 w-4" />
          Launch Capture Net
        </button>
        <button
          onClick={onReset}
          aria-label="Reset simulation"
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2.5 text-slate-200 transition hover:border-cyan-400/60"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-slate-500">
        <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
        Corner masses expand the mesh to 2 m × 2 m. Capture holds if ωz ≤ 3.0 rad/s; higher Z-spin
        ejects the target.
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-amber-200/70">
        <Zap className="h-3.5 w-3.5" />
        Time-dilated LEO visualization of 10 m/s relative intercept.
      </div>
    </aside>
  )
}
