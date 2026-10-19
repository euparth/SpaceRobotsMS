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
    // Arm S2 tumble on load; net auto-fire waits until the guided tour is finished
    // (handled in GNCWorkbench) so the modals are not interrupted mid-approach.
    if (autoStartFired.current) return
    autoStartFired.current = true
    api.applyPreset('S2')
  }, [api])

  const wrappedSim = useMemo(
    () => ({
      ...sim,
      api: wrappedApi,
      // Exposed so the workbench can honour the same "user interrupted" gate
      wasUserInterrupted: () => userInterrupted.current,
    }),
    [sim, wrappedApi],
  )

  return <GNCWorkbench sim={wrappedSim} />
}
