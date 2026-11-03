/**
 * Task D: wall-clock timing of the coupled rollout vs the production PINN inference path.
 * Usage: node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/validation/timing.mjs
 */
import { readFileSync } from 'fs'
import { cpus, totalmem } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { coupledImpact, mulberry32 } from '../surrogate/physicsLib.mjs'
import { runSurrogateInference } from '../../src/surrogate/inference.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rows = JSON.parse(readFileSync(join(__dirname, '../surrogate/data/capture.json'), 'utf8'))

const SEED = 20261103
const N = 20
const rng = mulberry32(SEED)
const picked = new Set()
while (picked.size < N) picked.add(Math.floor(rng() * rows.length))
const idx = [...picked]
const spins = idx.map((i) => [rows[i].wx, rows[i].wy, rows[i].wz])

const stats = (a) => {
  const s = [...a].sort((p, q) => p - q)
  const mean = a.reduce((x, y) => x + y, 0) / a.length
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  return { mean, median, min: s[0], max: s[s.length - 1] }
}
const fmt = (o) => `mean ${o.mean.toFixed(4)} median ${o.median.toFixed(4)} min ${o.min.toFixed(4)} max ${o.max.toFixed(4)}`

console.log('cpu', cpus()[0].model, 'cores', cpus().length, 'mem_GB', (totalmem() / 2 ** 30).toFixed(1))
console.log('node', process.version, 'platform', process.platform, process.arch)
console.log('spin selection: mulberry32 seed', SEED, 'capture.json indices', JSON.stringify(idx))
console.log('coupled path: coupledImpact() in scripts/surrogate/physicsLib.mjs (RK4 + XPBD net, H=1/3000, ends at tContact+0.25 s)')
console.log("PINN path: runSurrogateInference(wx,wy,wz,{includeTrace:true}) in src/surrogate/inference.js (as called by src/services/aiSurrogateEngine.js)")
console.log('warm-up: 1 untimed call per path with [1.5,1.0,0.5]; then one timed call per spin; 2 passes')

coupledImpact(1.5, 1.0, 0.5)
runSurrogateInference(1.5, 1.0, 0.5, { includeTrace: true })

const results = []
for (let pass = 1; pass <= 2; pass++) {
  const coupled = []
  const pinn = []
  for (const w of spins) {
    let t0 = performance.now()
    coupledImpact(...w)
    coupled.push(performance.now() - t0)
    t0 = performance.now()
    runSurrogateInference(...w, { includeTrace: true })
    pinn.push(performance.now() - t0)
  }
  const c = stats(coupled)
  const p = stats(pinn)
  results.push({ c, p })
  console.log(`pass ${pass} coupled_ms ${fmt(c)}`)
  console.log(`pass ${pass} pinn_ms    ${fmt(p)}`)
  console.log(`pass ${pass} ratio mean(coupled)/mean(pinn) ${(c.mean / p.mean).toFixed(3)}  median/median ${(c.median / p.median).toFixed(3)}`)
  if (pass === 1) {
    console.log('pass 1 per-spin ms [index, wx, wy, wz, coupled, pinn]:')
    spins.forEach((w, k) =>
      console.log(`  ${idx[k]} ${w.map((v) => v.toFixed(4)).join(' ')} ${coupled[k].toFixed(4)} ${pinn[k].toFixed(4)}`),
    )
  }
}
