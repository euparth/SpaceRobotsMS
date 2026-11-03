import { useCallback, useEffect, useRef, useState } from 'react'
import { PHASE } from '../physics/stateLayout.js'
import {
  clearSurrogateCache,
  getBenchmarkBaselines,
  getSurrogateMetrics,
  runPINNInference,
  setBenchmarkBaselines,
} from '../services/aiSurrogateEngine.js'

const INFER_HZ = 10
const INFER_MS = 1000 / INFER_HZ

/**
 * Runs PINN inference ~10 Hz off the render path, using the live snapshot ω.
 * Default ON per thesis brief.
 */
export function useSurrogate(simApi, snapshot) {
  const [enabled, setEnabled] = useState(true)
  const [prediction, setPrediction] = useState(null)
  const [autoFireArmed, setAutoFireArmed] = useState(false)
  const [benchmark, setBenchmark] = useState(getBenchmarkBaselines())
  const metrics = getSurrogateMetrics()
  const enabledRef = useRef(enabled)
  const predRef = useRef(null)
  const pendingBenchmark = useRef(null)

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) {
      setPrediction(null)
      predRef.current = null
      clearSurrogateCache()
    }
  }, [enabled])

  // Subscribe to worker benchmark results via events isn't enough — hook into worker messages
  useEffect(() => {
    if (!simApi?.subscribeBenchmark) return undefined
    return simApi.subscribeBenchmark((result) => {
      setBenchmarkBaselines({ coupledMs: result.coupledMs, rigidMs: result.rigidMs })
      setBenchmark({ coupledMs: result.coupledMs, rigidMs: result.rigidMs })
      pendingBenchmark.current?.(result)
      pendingBenchmark.current = null
      clearSurrogateCache()
    })
  }, [simApi])

  // Periodic inference from live snapshot
  useEffect(() => {
    const id = setInterval(() => {
      if (!enabledRef.current) return
      const snap = simApi?.getSnapshot?.() ?? snapshot
      if (!snap) return
      // Prefer commanded ω while IDLE so predictions match the armed spin, not mid-polhode drift
      // once the target has been tumbling for a while; use live ω after launch or when tumbling.
      const w =
        snap.phase === PHASE.IDLE ? simApi.getCommanded?.() ?? snap.w : snap.w
      const [wx, wy, wz] = w
      const result = runPINNInference(wx, wy, wz, 10)
      const base = getBenchmarkBaselines()
      result.coupledRolloutMs = base.coupledMs
      result.rigidRolloutMs = base.rigidMs
      result.solverSpeedupFactor = base.coupledMs / Math.max(result.inferenceLatencyMs, 1e-6)
      predRef.current = result
      simApi.setSurrogatePrediction?.(result)
      setPrediction(result)
    }, INFER_MS)
    return () => clearInterval(id)
  }, [simApi, snapshot])

  const toggle = useCallback(() => setEnabled((v) => !v), [])

  /**
   * Auto-fire uses the numeric secure window from the worker's RK4 trajectory
   * (verdicts.numeric.firstSecureDelayMs), not the PINN delay. The PINN delay stays visible in
   * the HUD as an estimate (test MAE 703 ms).
   */
  const armAutoFire = useCallback(() => {
    const n = simApi?.getVerdicts?.()?.numeric
    if (!n || !simApi?.launchAt) return false
    const delayMs = n.fireNowSecure ? 0 : n.firstSecureDelayMs
    if (delayMs == null) return false
    simApi.launchAt(delayMs)
    setAutoFireArmed(true)
    return true
  }, [simApi])

  const runBenchmark = useCallback(() => {
    if (!simApi?.benchmark) return Promise.reject(new Error('benchmark unavailable'))
    return new Promise((resolve) => {
      pendingBenchmark.current = resolve
      const w = simApi.getCommanded?.() ?? [3, 3, 2.5]
      simApi.benchmark(w)
      setTimeout(() => {
        if (pendingBenchmark.current) {
          pendingBenchmark.current = null
          resolve(getBenchmarkBaselines())
        }
      }, 15000)
    })
  }, [simApi])

  // Kick a benchmark once on mount so HUD speedup is live
  useEffect(() => {
    if (!simApi?.benchmark) return undefined
    const t = setTimeout(() => {
      simApi.benchmark(simApi.getCommanded?.() ?? [3, 3, 2.5])
    }, 800)
    return () => clearTimeout(t)
  }, [simApi])

  useEffect(() => {
    if (!autoFireArmed) return undefined
    const snap = snapshot
    if (snap && snap.phase !== PHASE.IDLE) setAutoFireArmed(false)
    return undefined
  }, [snapshot, autoFireArmed])

  return {
    enabled,
    setEnabled,
    toggle,
    prediction,
    predictionRef: predRef,
    metrics,
    benchmark,
    autoFireArmed,
    armAutoFire,
    runBenchmark,
  }
}
