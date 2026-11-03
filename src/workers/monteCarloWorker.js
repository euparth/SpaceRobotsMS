/**
 * Monte Carlo chunk worker. One message in: { id, seed, count, offset, prior, limit } — the same
 * workerData shape as scripts/surrogate/genData.mjs — one message out with the rows.
 * Rows are posted in blocks so the panel can show progress without waiting for the chunk.
 */
import { monteCarloChunk } from '../physics/monteCarlo.js'

const BLOCK = 25

self.onmessage = (e) => {
  const job = e.data
  const total = job.count
  const rows = []
  // Sampling must be sequential over the whole chunk; compute in blocks but keep one rng by
  // delegating to monteCarloChunk for the whole chunk and posting progress from inside its loop.
  let done = 0
  const chunk = monteCarloChunk({
    ...job,
    onRow: () => {
      done++
      if (done % BLOCK === 0) self.postMessage({ type: 'progress', id: job.id, done, total })
    },
  })
  rows.push(...chunk)
  self.postMessage({ type: 'done', id: job.id, rows, done: total, total })
}
