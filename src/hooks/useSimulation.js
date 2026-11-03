import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MAX_RATE, UI_PRESETS as PRESETS } from '../physics/constants.js'
import { NODE_COUNT } from '../physics/netTopology.js'
import { F, NODE_STRAIN_OFFSET, PHASE, PHASE_LABEL } from '../physics/stateLayout.js'
import { createTwinTelemetryNode, rosGraph } from '../services/rosTelemetryNode.js'
import { TelemetryHistory } from '../services/telemetryHistory.js'
import { TelemetryRecorder, buildDataset, downloadText, toCSV } from '../services/telemetryExporter.js'

const RAD2DEG = 180 / Math.PI
const UI_REFRESH_MS = 100
const clampRate = (v) => Math.min(MAX_RATE, Math.max(0, Number.isFinite(v) ? v : 0))

export function readSnapshot(b) {
  const phase = Math.round(b[F.PHASE])
  const h = [b[F.HX], b[F.HY], b[F.HZ]]
  return {
    t: b[F.T],
    q: [b[F.Q0], b[F.Q1], b[F.Q2], b[F.Q3]],
    w: [b[F.WX], b[F.WY], b[F.WZ]],
    h,
    hMag: Math.hypot(h[0], h[1], h[2]),
    ke: b[F.KE],
    ke0: b[F.KE0],
    eNet: b[F.E_NET],
    eAbs: b[F.E_ABS],
    nutation: b[F.NUTATION] * RAD2DEG,
    p: [b[F.PX], b[F.PY], b[F.PZ]],
    v: [b[F.VX], b[F.VY], b[F.VZ]],
    enclosure: b[F.ENCLOSURE],
    peakWz: b[F.PEAK_WZ],
    keDrift: b[F.KE_DRIFT],
    hDrift: b[F.H_DRIFT],
    strainMax: b[F.STRAIN_MAX],
    contacts: Math.round(b[F.CONTACTS]),
    phase,
    phaseLabel: PHASE_LABEL[phase],
    range: b[F.RANGE],
    solverMs: b[F.SOLVER_MS],
    tickHz: b[F.TICK_HZ],
    timeScale: b[F.TIME_SCALE],
    paused: b[F.PAUSED] > 0.5,
    substeps: Math.round(b[F.SUBSTEPS]),
    eta: b[F.ETA],
    tLaunch: b[F.T_LAUNCH],
    tContact: b[F.T_CONTACT],
    dPTotal: b[F.DP_TOTAL],
    dLTotal: b[F.DL_TOTAL],
    twoWay: (b[F.COUPLING] & 1) === 1,
    drawstring: (b[F.COUPLING] & 2) === 2,
  }
}

export function useSimulation() {
  const workerRef = useRef(null)
  const stateRef = useRef(null)
  const snapshotRef = useRef(null)
  const decisionRef = useRef(null)
  const commandedRef = useRef([0, 0, 0])
  const eventListeners = useRef(new Set())
  const benchmarkListeners = useRef(new Set())
  const surrogateRef = useRef(null)
  const history = useMemo(() => new TelemetryHistory(3600), [])
  const recorder = useMemo(() => new TelemetryRecorder(), [])

  const [snapshot, setSnapshot] = useState(null)
  const [decision, setDecision] = useState(null)
  const verdictsRef = useRef(null)
  const [verdicts, setVerdicts] = useState(null)
  const [events, setEvents] = useState([])
  const [commanded, setCommanded] = useState([0, 0, 0])

  const pushEvent = useCallback((event) => {
    const entry = { ...event, id: `${performance.now().toFixed(3)}-${Math.random().toString(36).slice(2, 7)}` }
    setEvents((prev) => [...prev.slice(-299), entry])
    eventListeners.current.forEach((fn) => fn(entry))
  }, [])

  useEffect(() => {
    const worker = new Worker(new URL('../workers/physicsWorker.js', import.meta.url), { type: 'module' })
    const telemetry = createTwinTelemetryNode(rosGraph)
    let lastUi = 0
    workerRef.current = worker

    worker.onmessage = ({ data }) => {
      switch (data.type) {
        case 'state': {
          const buffer = new Float32Array(data.buffer)
          const snap = readSnapshot(buffer)
          stateRef.current = buffer
          snapshotRef.current = snap
          history.push(snap)
          recorder.record(snap, surrogateRef.current)
          telemetry.publish(
            snap,
            buffer.subarray(NODE_STRAIN_OFFSET, NODE_STRAIN_OFFSET + NODE_COUNT),
            surrogateRef.current,
          )
          const now = performance.now()
          if (now - lastUi >= UI_REFRESH_MS) {
            lastUi = now
            setSnapshot(snap)
          }
          break
        }
        case 'decision':
          decisionRef.current = data.decision
          setDecision(data.decision)
          break
        case 'verdicts': {
          const v = data.verdicts ? { ...data.verdicts, solver: data.solver ?? null } : null
          verdictsRef.current = v
          setVerdicts(v)
          break
        }
        case 'reset':
          history.clear()
          recorder.clear()
          break
        case 'event':
          pushEvent(data)
          break
        case 'benchmark_result':
          benchmarkListeners.current.forEach((fn) => fn(data))
          break
        default:
          break
      }
    }
    worker.onerror = (err) => pushEvent({ level: 'error', text: `physics worker fault: ${err.message}`, t: 0 })
    worker.postMessage({ type: 'set_spin', w: commandedRef.current })

    return () => {
      worker.terminate()
      telemetry.destroy()
      workerRef.current = null
    }
  }, [history, recorder, pushEvent])

  const post = useCallback((message) => workerRef.current?.postMessage(message), [])

  const setSpin = useCallback(
    (w) => {
      const next = w.map(clampRate)
      commandedRef.current = next
      setCommanded(next)
      post({ type: 'set_spin', w: next })
      return { armed: (snapshotRef.current?.phase ?? PHASE.IDLE) === PHASE.IDLE, w: next }
    },
    [post],
  )

  const applyPreset = useCallback(
    (id) => {
      const preset = PRESETS.find((p) => p.id.toLowerCase() === String(id).toLowerCase())
      if (!preset) return null
      setSpin(preset.w)
      return preset
    },
    [setSpin],
  )

  const launch = useCallback(() => post({ type: 'launch' }), [post])
  const launchAt = useCallback(
    (delayMs) => post({ type: 'launch_at', delayMs: Number(delayMs) || 0 }),
    [post],
  )
  const reset = useCallback(() => post({ type: 'reset' }), [post])
  const pause = useCallback(() => post({ type: 'pause' }), [post])
  const resume = useCallback(() => post({ type: 'resume' }), [post])
  const setTimeScale = useCallback((value) => post({ type: 'time_scale', value }), [post])
  const setParam = useCallback((key, value) => post({ type: 'set_param', key, value }), [post])
  const benchmark = useCallback((w) => post({ type: 'benchmark', w }), [post])
  const setSurrogatePrediction = useCallback((p) => {
    surrogateRef.current = p
  }, [])

  const exportTelemetry = useCallback(
    (format = 'json') => {
      const rows = recorder.rows
      if (!rows.length) return { ok: false, message: 'no telemetry recorded yet' }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const base = `ps-msc-debris-capture_${stamp}`
      if (format === 'csv') {
        const filename = `${base}.csv`
        downloadText(filename, toCSV(rows), 'text/csv')
        return { ok: true, filename, samples: rows.length }
      }
      const filename = `${base}.json`
      const dataset = buildDataset(rows, {
        decision: decisionRef.current,
        eta: snapshotRef.current?.eta,
        surrogate: surrogateRef.current,
      })
      downloadText(filename, JSON.stringify(dataset, null, 2), 'application/json')
      return { ok: true, filename, samples: rows.length }
    },
    [recorder],
  )

  const subscribeEvents = useCallback((fn) => {
    eventListeners.current.add(fn)
    return () => {
      eventListeners.current.delete(fn)
    }
  }, [])

  const subscribeBenchmark = useCallback((fn) => {
    benchmarkListeners.current.add(fn)
    return () => {
      benchmarkListeners.current.delete(fn)
    }
  }, [])

  const api = useMemo(
    () => ({
      stateRef,
      history,
      graph: rosGraph,
      setSpin,
      applyPreset,
      launch,
      launchAt,
      reset,
      pause,
      resume,
      setTimeScale,
      setParam,
      benchmark,
      setSurrogatePrediction,
      exportTelemetry,
      subscribeEvents,
      subscribeBenchmark,
      getSnapshot: () => snapshotRef.current,
      getCommanded: () => commandedRef.current,
      getSurrogate: () => surrogateRef.current,
      getVerdicts: () => verdictsRef.current,
    }),
    [
      history,
      setSpin,
      applyPreset,
      launch,
      launchAt,
      reset,
      pause,
      resume,
      setTimeScale,
      setParam,
      benchmark,
      setSurrogatePrediction,
      exportTelemetry,
      subscribeEvents,
      subscribeBenchmark,
    ],
  )

  return { api, snapshot, decision, verdicts, events, commanded }
}
