import { Activity, AlertTriangle, Gauge, Shield, Waves } from 'lucide-react'

function Meter({ label, value, unit, accent = 'bg-cyan-400' }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">
          {pct.toFixed(0)}
          {unit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${accent} transition-all duration-200`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function SpinReadout({ label, value, hot }) {
  return (
    <div className={`rounded-lg border p-2 ${hot ? 'border-rose-500/70 bg-rose-950/40' : 'border-slate-700/70 bg-slate-950/50'}`}>
      <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`font-display text-xl font-semibold ${hot ? 'text-rose-300' : 'text-cyan-200'}`}>
        {value.toFixed(2)}
      </p>
      <p className="text-[10px] text-slate-500">rad/s</p>
    </div>
  )
}

export default function TelemetryHUD({ telemetry }) {
  const t = telemetry
  const enclosurePct = (t.enclosure * 100).toFixed(0)
  const secured = t.status === 'SECURED'
  const failed = t.critical

  return (
    <aside className="glass-panel hud-scan pointer-events-auto max-h-[calc(100vh-7rem)] w-[20rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl p-4 shadow-hud">
      <div className="mb-4 flex items-center justify-between border-b border-slate-700/60 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          <p className="font-display text-lg font-semibold tracking-wide">Telemetry</p>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">
          T+{t.elapsed.toFixed(1)}s
        </span>
      </div>

      {t.critical && (
        <div className="mb-3 animate-pulse rounded-xl border border-rose-500/80 bg-rose-950/80 p-3 text-rose-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-display text-sm font-semibold tracking-wide">
                CRITICAL INSTABILITY
              </p>
              <p className="mt-1 text-[11px] leading-snug">
                Z-SPIN &gt; 3.0 RAD/S (TWIST-OUT EJECTION)
              </p>
            </div>
          </div>
        </div>
      )}

      {!t.critical && t.warning && t.phase === 'idle' && (
        <div className="mb-3 rounded-xl border border-amber-500/50 bg-amber-950/50 p-2.5 text-[11px] text-amber-200">
          Predicted twist-out: ωz exceeds net tensile restraint.
        </div>
      )}

      <div
        className={`mb-3 rounded-xl border px-3 py-2 font-display text-sm tracking-wide ${
          secured
            ? 'border-emerald-400/60 bg-emerald-950/40 text-emerald-300'
            : failed
              ? 'border-rose-400/60 bg-rose-950/40 text-rose-300'
              : 'border-cyan-400/40 bg-slate-950/50 text-cyan-200'
        }`}
      >
        <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Status</p>
        <p>{t.status}</p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <SpinReadout label="ωx" value={t.wx} />
        <SpinReadout label="ωy" value={t.wy} />
        <SpinReadout label="ωz" value={t.wz} hot={t.wz > 3} />
      </div>

      <div className="mb-4 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400">
            <Shield className="h-3.5 w-3.5 text-amber-300" />
            Enclosure
          </span>
          <span className="font-display text-2xl font-semibold text-amber-300">{enclosurePct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all ${failed ? 'bg-rose-500' : 'bg-amber-400'}`}
            style={{ width: `${enclosurePct}%` }}
          />
        </div>
      </div>

      <div className="mb-4 space-y-3 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400">
          <Gauge className="h-3.5 w-3.5 text-cyan-300" />
          Energy transfer
        </div>
        <Meter label="Net absorption" value={t.energyTransfer} unit="%" accent="bg-cyan-400" />
        <Meter
          label="Sat rotational KE"
          value={Math.min(1, t.keSat / 80)}
          unit=" idx"
          accent="bg-fuchsia-400"
        />
        <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] text-slate-400">
          <p>
            KE<sub>sat</sub> {t.keSat.toFixed(1)} J
          </p>
          <p>
            E<sub>net</sub> {t.keNet.toFixed(1)} J
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3 text-[10px] text-slate-400">
        <div className="mb-2 flex items-center gap-1.5 uppercase tracking-widest">
          <Waves className="h-3.5 w-3.5 text-amber-300" />
          Kevlar 49 mesh
        </div>
        <div className="grid grid-cols-2 gap-y-1">
          <span>E = 120 GPa</span>
          <span>ρ = 1440 kg/m³</span>
          <span>μ = 0.20</span>
          <span>12×12 nodes</span>
          <span>Mass 30.0 kg</span>
          <span>12U 227×366×240 mm</span>
        </div>
      </div>
    </aside>
  )
}
