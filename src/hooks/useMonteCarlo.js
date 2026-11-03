import { useCallback, useEffect, useRef, useState } from 'react'
import { planChunks, DATASET_CHUNKS } from '../physics/priors.js'
import { summarize } from '../physics/monteCarloStats.js'

export const MC_MIN_N = 100
export const MC_MAX_N = 2000
export const MC_DEFAULT = Object.freeze({ prior: 'uniform-box', n: 1200, seed: 777001, customMin: 0, customMax: 5 })

/**
 * Runs the Monte Carlo in a pool of Web Workers. The sampling split is always the dataset's
 * 8-way split (planChunks), independent of navigator.hardwareConcurrency, so seeds reproduce
 * scripts/surrogate/genData.mjs; the pool only decides how many chunks run concurrently.
 */
export function useMonteCarlo() {
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { rows, summary, config, elapsedMs }
  const [error, setError] = useState(null)
  const workersRef = useRef([])

  const terminate = useCallback(() => {
    for (const w of workersRef.current) w.terminate()
    workersRef.current = []
  }, [])

  useEffect(() => terminate, [terminate])

  const run = useCallback(
    (config) => {
      terminate()
      const n = Math.max(MC_MIN_N, Math.min(MC_MAX_N, Math.round(Number(config.n) || MC_DEFAULT.n)))
      const seed = Math.round(Number(config.seed)) >>> 0
      const prior =
        config.prior === 'custom' ? { kind: 'custom', min: Number(config.customMin), max: Number(config.customMax) } : config.prior
      const jobs = planChunks(n, seed)
      const concurrency = Math.max(1, Math.min(jobs.length, navigator.hardwareConcurrency || 4))
      const t0 = performance.now()
      const chunks = new Array(jobs.length)
      const doneByJob = new Array(jobs.length).fill(0)
      let finished = 0
      setStatus('running')
      setError(null)
      setResult(null)
      setProgress({ done: 0, total: n })

      let next = 0
      const spawn = () => {
        if (next >= jobs.length) return
        const job = jobs[next++]
        const worker = new Worker(new URL('../workers/monteCarloWorker.js', import.meta.url), { type: 'module' })
        workersRef.current.push(worker)
        worker.onmessage = (e) => {
          const m = e.data
          doneByJob[job.chunk] = m.done
          setProgress({ done: doneByJob.reduce((a, b) => a + b, 0), total: n })
          if (m.type === 'done') {
            chunks[job.chunk] = m.rows
            finished++
            worker.terminate()
            workersRef.current = workersRef.current.filter((w) => w !== worker)
            if (finished === jobs.length) {
              const rows = chunks.flat()
              setResult({
                rows,
                summary: summarize(rows),
                config: { prior, n, seed, chunks: jobs.length, split: DATASET_CHUNKS, concurrency },
                elapsedMs: performance.now() - t0,
              })
              setStatus('done')
            } else spawn()
          }
        }
        worker.onerror = (ev) => {
          setError(ev.message || 'worker error')
          setStatus('error')
          terminate()
        }
        worker.postMessage({ id: job.chunk, ...job, prior })
      }
      for (let k = 0; k < concurrency; k++) spawn()
    },
    [terminate],
  )

  const cancel = useCallback(() => {
    terminate()
    setStatus('idle')
  }, [terminate])

  return { status, progress, result, error, run, cancel }
}
