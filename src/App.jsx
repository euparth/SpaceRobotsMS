import { useEffect, useMemo, useRef } from 'react'
import GNCWorkbench from './components/GNCWorkbench.jsx'
import { useSimulation } from './hooks/useSimulation.js'

export default function App() {
  const sim = useSimulation()
  const { api } = sim
  const autoStartFired = useRef(false)
  const userInterrupted = useRef(false)

  // Track any manual user interaction to avoid interrupting user adjustments
  const wrappedApi = useMemo(
    () => ({
      ...api,
      setSpin: (w) => {
        userInterrupted.current = true
        return api.setSpin(w)
      },
      applyPreset: (id, isAuto = false) => {
        if (!isAuto) userInterrupted.current = true
        return api.applyPreset(id)
      },
      reset: () => {
        userInterrupted.current = true
        return api.reset()
      },
      launch: () => {
        userInterrupted.current = true
        return api.launch()
      },
      launchAt: (delayMs) => {
        userInterrupted.current = true
        return api.launchAt(delayMs)
      },
      pause: () => {
        userInterrupted.current = true
        return api.pause()
      },
    }),
    [api],
  )

  useEffect(() => {
    // Ensure the auto-start loop only fires once on initial component mount
    if (autoStartFired.current) return
    autoStartFired.current = true

    // 1. Set simulation state to Scenario S2 (Stable Tumble): wx = 1.5, wy = 1.0, wz = 0.5 rad/s
    // 2. Start 6-DOF CubeSat Euler rotational dynamics immediately
    api.applyPreset('S2')

    // 3. Set a 2000ms timer to automatically trigger launch
    const timer = setTimeout(() => {
      const snap = api.getSnapshot()
      const commanded = api.getCommanded()
      const isStillS2 =
        commanded &&
        Math.abs(commanded[0] - 1.5) < 1e-3 &&
        Math.abs(commanded[1] - 1.0) < 1e-3 &&
        Math.abs(commanded[2] - 0.5) < 1e-3

      // Only launch if still idle (phase 0), rates have not been altered, and user has not manually reset
      if (!userInterrupted.current && (!snap || snap.phase === 0) && isStillS2) {
        api.launch()
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [api])

  const wrappedSim = useMemo(
    () => ({
      ...sim,
      api: wrappedApi,
    }),
    [sim, wrappedApi],
  )

  return <GNCWorkbench sim={wrappedSim} />
}
