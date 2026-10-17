import { useCallback, useState } from 'react'
import { Radio } from 'lucide-react'
import Canvas3D from './components/Canvas3D.jsx'
import Controls from './components/Controls.jsx'
import TelemetryHUD from './components/TelemetryHUD.jsx'

const INITIAL_OMEGA = { wx: 0, wy: 0, wz: 0 }

const INITIAL_TELEM = {
  wx: 0,
  wy: 0,
  wz: 0,
  enclosure: 0,
  energyTransfer: 0,
  keSat: 0,
  keNet: 0,
  status: 'STANDBY',
  phase: 'idle',
  contact: false,
  warning: false,
  critical: false,
  elapsed: 0,
}

export default function App() {
  const [omega, setOmega] = useState(INITIAL_OMEGA)
  const [launched, setLaunched] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [telemetry, setTelemetry] = useState(INITIAL_TELEM)

  const onTelemetry = useCallback((t) => {
    setTelemetry(t)
  }, [])

  const handleLaunch = () => {
    if (launched) return
    setLaunched(true)
  }

  const handleReset = () => {
    setLaunched(false)
    setTelemetry(INITIAL_TELEM)
    setEpoch((e) => e + 1)
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <Canvas3D omega={omega} launched={launched} epoch={epoch} onTelemetry={onTelemetry} />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/50" />

      <header className="glass-panel pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-center justify-between rounded-2xl px-5 py-3">
        <div>
          <p className="font-display text-xl font-semibold tracking-wide text-slate-100 md:text-2xl">
            Parth's MS Thesis — 3D Space Debris Capture Simulator
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-slate-400">
            LEO · Non-cooperative 12U CubeSat · Deployable Kevlar 49 net
          </p>
        </div>
        <div className="hidden items-center gap-2 text-[10px] uppercase tracking-widest text-cyan-300 sm:flex">
          <Radio className="h-4 w-4" />
          Live WebGL
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-3 top-24 bottom-3 z-20 flex flex-wrap items-start justify-between gap-3 overflow-y-auto">
        <div className="pointer-events-auto">
          <Controls
            omega={omega}
            setOmega={setOmega}
            launched={launched}
            onLaunch={handleLaunch}
            onReset={handleReset}
          />
        </div>
        <div className="pointer-events-auto">
          <TelemetryHUD telemetry={telemetry} />
        </div>
      </div>
    </div>
  )
}
