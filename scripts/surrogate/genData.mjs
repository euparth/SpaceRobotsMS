/**
 * Offline dataset generation for the PINN surrogate.
 * Produces:
 *   scripts/surrogate/data/trajectories.bin  — RK4 ω(t) samples
 *   scripts/surrogate/data/strain.json       — coupled-impact peak strain labels
 *   scripts/surrogate/data/capture.json      — contact-window / fire-schedule labels
 *   scripts/surrogate/data/audit.json        — strain smoothness audit
 *
 * Usage: node scripts/surrogate/genData.mjs
 *        node scripts/surrogate/genData.mjs --only capture --prior <name> --out <dir>
 *   --prior  spin prior for the capture set (see priors.mjs); default uniform-box = historical behaviour
 *   --out    output directory; default scripts/surrogate/data
 *   --only capture   skip trajectories + strain and write only capture.json / summary.json
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import {
  sampleTrajectory,
  coupledImpact,
  peakWzInContactWindow,
  fireSchedule,
  mulberry32,
  sampleOmega,
  HORIZON,
  WZ_LIMIT,
  FLIGHT_TIME,
  CONTACT_WINDOW,
  PRESETS,
} from './physicsLib.mjs'
import { samplePrior, PRIORS } from './priors.mjs'

function parseArgs(argv) {
  const opts = { prior: 'uniform-box', out: null, only: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--prior') opts.prior = argv[++i]
    else if (argv[i] === '--out') opts.out = argv[++i]
    else if (argv[i] === '--only') opts.only = argv[++i]
    else throw new Error(`unknown argument ${argv[i]}`)
  }
  if (!PRIORS.includes(opts.prior)) throw new Error(`--prior must be one of ${PRIORS.join(', ')}`)
  if (opts.only && opts.only !== 'capture') throw new Error('--only accepts only "capture"')
  return opts
}
const OPTS = isMainThread ? parseArgs(process.argv.slice(2)) : { prior: workerData.prior ?? 'uniform-box' }

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = isMainThread && OPTS.out ? OPTS.out : join(__dirname, 'data')
const N_TRAJ = 2400
const N_STRAIN = 4000
const N_CAPTURE = 1200
const DT = 0.02
const CORES = Math.max(1, Math.min(8, (await import('os')).default.cpus().length))

if (!isMainThread) {
  const { kind, seed, count, offset } = workerData
  const rng = mulberry32(seed)
  const rows = []
  if (kind === 'strain') {
    for (let i = 0; i < count; i++) {
      const [wx, wy, wz] = sampleOmega(rng)
      const r = coupledImpact(wx, wy, wz)
      rows.push({
        i: offset + i,
        wx,
        wy,
        wz,
        maxStrain: r.maxStrain,
        peakWz: r.peakWz,
        eject: r.eject,
        tContact: r.tContact,
      })
    }
  } else if (kind === 'capture') {
    for (let i = 0; i < count; i++) {
      const [wx, wy, wz] = samplePrior(rng, OPTS.prior)
      const peak0 = peakWzInContactWindow(wx, wy, wz, 0)
      const sched = fireSchedule(wx, wy, wz, HORIZON, 0.04)
      rows.push({
        i: offset + i,
        wx,
        wy,
        wz,
        peak0,
        fireNowSecure: peak0 <= WZ_LIMIT,
        naiveEject: Math.abs(wz) > WZ_LIMIT,
        ...sched,
      })
    }
  }
  parentPort.postMessage(rows)
  process.exit(0)
}

function spawnPool(kind, total, baseSeed) {
  const per = Math.ceil(total / CORES)
  const jobs = []
  for (let c = 0; c < CORES; c++) {
    const offset = c * per
    const count = Math.min(per, total - offset)
    if (count <= 0) break
    jobs.push(
      new Promise((resolve, reject) => {
        const w = new Worker(fileURLToPath(import.meta.url), {
          workerData: { kind, seed: baseSeed + c * 9973, count, offset, prior: OPTS.prior },
        })
        w.on('message', resolve)
        w.on('error', reject)
        w.on('exit', (code) => {
          if (code !== 0) reject(new Error(`worker exit ${code}`))
        })
      }),
    )
  }
  return Promise.all(jobs).then((chunks) => chunks.flat())
}

function writeTrajectories() {
  console.log(`Generating ${N_TRAJ} RK4 trajectories (dt=${DT}, H=${HORIZON}s)…`)
  const rng = mulberry32(20260419)
  const nPts = Math.floor(HORIZON / DT) + 1
  // Record: wx0,wy0,wz0,t,wx,wy,wz  (7 floats)
  const stride = 7
  const buf = Buffer.allocUnsafe(N_TRAJ * nPts * stride * 4)
  let o = 0
  const t0 = performance.now()
  for (let i = 0; i < N_TRAJ; i++) {
    const [wx0, wy0, wz0] = i < PRESETS.length ? PRESETS[i].w : sampleOmega(rng)
    const tr = sampleTrajectory(wx0, wy0, wz0, HORIZON, DT)
    for (let k = 0; k < nPts; k++) {
      buf.writeFloatLE(wx0, o); o += 4
      buf.writeFloatLE(wy0, o); o += 4
      buf.writeFloatLE(wz0, o); o += 4
      buf.writeFloatLE(tr.t[k], o); o += 4
      buf.writeFloatLE(tr.wx[k], o); o += 4
      buf.writeFloatLE(tr.wy[k], o); o += 4
      buf.writeFloatLE(tr.wz[k], o); o += 4
    }
    if ((i + 1) % 400 === 0) console.log(`  traj ${i + 1}/${N_TRAJ}`)
  }
  writeFileSync(join(DATA, 'trajectories.bin'), buf)
  writeFileSync(
    join(DATA, 'trajectories.meta.json'),
    JSON.stringify({ nTraj: N_TRAJ, nPts, dt: DT, horizon: HORIZON, stride, bytes: buf.length }, null, 2),
  )
  console.log(`  wrote trajectories.bin (${(buf.length / 1e6).toFixed(1)} MB) in ${(performance.now() - t0).toFixed(0)} ms`)
}

function auditStrain(rows) {
  // Smoothness: neighbour correlation in ω-space via kNN residual variance
  const n = rows.length
  const k = 8
  let sumRes2 = 0
  let sumVar = 0
  const mean = rows.reduce((s, r) => s + r.maxStrain, 0) / n
  const varY = rows.reduce((s, r) => s + (r.maxStrain - mean) ** 2, 0) / n

  for (let i = 0; i < Math.min(n, 800); i++) {
    const a = rows[i]
    const dists = []
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const b = rows[j]
      const d =
        (a.wx - b.wx) ** 2 + (a.wy - b.wy) ** 2 + (a.wz - b.wz) ** 2
      dists.push({ d, s: b.maxStrain })
    }
    dists.sort((u, v) => u.d - v.d)
    const nn = dists.slice(0, k)
    const pred = nn.reduce((s, x) => s + x.s, 0) / nn.length
    sumRes2 += (a.maxStrain - pred) ** 2
  }
  const knnMse = sumRes2 / Math.min(n, 800)
  const knnR2 = 1 - knnMse / varY

  // Band class distribution
  const bands = { elastic: 0, yield: 0, plastic: 0 }
  for (const r of rows) {
    if (r.maxStrain < 0.05) bands.elastic++
    else if (r.maxStrain < 0.15) bands.yield++
    else bands.plastic++
  }

  // Preset spot-checks
  const presets = PRESETS.map((p) => {
    const hit = coupledImpact(...p.w)
    return { id: p.id, w: p.w, maxStrain: hit.maxStrain, peakWz: hit.peakWz, eject: hit.eject }
  })

  return {
    n,
    meanStrain: mean,
    stdStrain: Math.sqrt(varY),
    knnR2,
    knnMse,
    bands,
    presets,
    smoothEnough: knnR2 > 0.35,
    note:
      knnR2 > 0.35
        ? 'ω alone explains a usable fraction of strain — train continuous head'
        : 'strain labels noisy in ω — prefer yield-band classifier',
  }
}

async function main() {
  mkdirSync(DATA, { recursive: true })
  let audit = null
  if (OPTS.only !== 'capture') {
    writeTrajectories()

    console.log(`Generating ${N_STRAIN} coupled strain labels on ${CORES} threads…`)
    const tS = performance.now()
    const strain = await spawnPool('strain', N_STRAIN, 424242)
    writeFileSync(join(DATA, 'strain.json'), JSON.stringify(strain))
    console.log(`  strain done in ${((performance.now() - tS) / 1000).toFixed(1)} s`)

    audit = auditStrain(strain)
    writeFileSync(join(DATA, 'audit.json'), JSON.stringify(audit, null, 2))
    console.log(`  audit knnR2=${audit.knnR2.toFixed(3)} smoothEnough=${audit.smoothEnough}`)
    console.log('  presets:', audit.presets.map((p) => `${p.id}:${(100 * p.maxStrain).toFixed(1)}%`).join(' '))
  }

  console.log(`Generating ${N_CAPTURE} capture/fire-schedule labels on ${CORES} threads (prior ${OPTS.prior})…`)
  const tC = performance.now()
  const capture = await spawnPool('capture', N_CAPTURE, 777001)
  writeFileSync(join(DATA, 'capture.json'), JSON.stringify(capture))
  console.log(`  capture done in ${((performance.now() - tC) / 1000).toFixed(1)} s`)

  // Naive threshold baseline on capture set
  let naiveCorrect = 0
  let truthSecure = 0
  for (const r of capture) {
    if (r.fireNowSecure) truthSecure++
    const naiveSecure = !r.naiveEject
    if (naiveSecure === r.fireNowSecure) naiveCorrect++
  }
  const summary = {
    nCapture: capture.length,
    truthSecureRate: truthSecure / capture.length,
    naiveAccuracy: naiveCorrect / capture.length,
    flightTime: FLIGHT_TIME,
    contactWindow: CONTACT_WINDOW,
    wzLimit: WZ_LIMIT,
    audit,
  }
  if (OPTS.prior !== 'uniform-box') summary.prior = OPTS.prior
  writeFileSync(join(DATA, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(`  naive accuracy ${(100 * summary.naiveAccuracy).toFixed(1)}% (must beat this)`)
  console.log('Done.')
}

if (isMainThread) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
