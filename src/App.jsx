import { Suspense, lazy, useEffect, useMemo, useRef } from 'react'
import { useSimulation } from './hooks/useSimulation.js'

// Both routes are lazy so that /methods never downloads three.js or the physics worker.
const GNCWorkbench = lazy(() => import('./components/GNCWorkbench.jsx'))
const MethodsPage = lazy(() => import('./components/MethodsPage.jsx'))

export const ROUTES = Object.freeze({ workbench: '/', methods: '/methods' })

function routeFor(pathname) {
  return pathname.replace(/\/+$/, '') === ROUTES.methods ? 'methods' : 'workbench'
}

export default function App() {
  const route = routeFor(window.location.pathname)
  if (route === 'methods') {
    return (
      <Suspense fallback={<div className="p-6 text-[13px] text-slate-400">Loading methods…</div>}>
        <MethodsPage />
      </Suspense>
    )
  }
  return <Workbench />
}

function Workbench() {
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

  return (
    <Suspense fallback={<div className="p-6 text-[13px] text-slate-400">Loading workbench…</div>}>
      <GNCWorkbench sim={wrappedSim} />
    </Suspense>
  )
}
