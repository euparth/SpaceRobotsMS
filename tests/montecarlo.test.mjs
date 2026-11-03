import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { planChunks, mulberry32, samplePrior, DATASET_CHUNKS } from '../src/physics/priors.js'
import { monteCarloChunk, summarize, rowsToCsv, CSV_COLUMNS } from '../src/physics/monteCarlo.js'

const CAPTURE = fileURLToPath(new URL('../scripts/surrogate/data/capture.json', import.meta.url))

test('3c: planChunks reproduces the genData.mjs 8-way split (per = ceil(N/8), seed + 9973·c)', () => {
  const jobs = planChunks(1200, 777001)
  assert.equal(DATASET_CHUNKS, 8)
  assert.equal(jobs.length, 8)
  assert.deepEqual(
    jobs.map((j) => [j.seed, j.count, j.offset]),
    [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [777001 + 9973 * c, 150, 150 * c]),
  )
  // N not divisible by 8: last chunk is short, no empty chunks
  const j100 = planChunks(100, 1)
  assert.deepEqual(
    j100.map((j) => j.count),
    [13, 13, 13, 13, 13, 13, 13, 9],
  )
})

test('3c: browser Monte Carlo path (uniform-box, N=1200, seed 777001) reproduces capture.json rows and gives 731 / 245 / 4', () => {
  const ref = JSON.parse(readFileSync(CAPTURE, 'utf8'))
  const rows = planChunks(1200, 777001).flatMap((j) => monteCarloChunk({ ...j, prior: 'uniform-box' }))
  assert.equal(rows.length, 1200)
  for (let i = 0; i < 1200; i++) {
    assert.equal(rows[i].wx, ref[i].wx, `row ${i} wx`)
    assert.equal(rows[i].wy, ref[i].wy, `row ${i} wy`)
    assert.equal(rows[i].wz, ref[i].wz, `row ${i} wz`)
    assert.equal(rows[i].peak0, ref[i].peak0, `row ${i} peak0`)
    assert.equal(rows[i].label, ref[i].fireNowSecure, `row ${i} label`)
    assert.equal(rows[i].rule, !ref[i].naiveEject, `row ${i} rule`)
  }
  const s = summarize(rows)
  assert.equal(s.rule.predictedSecure, 731, 'rule-secure')
  assert.equal(s.rule.falseSecure, 245, 'false-secure')
  assert.equal(s.rule.falseEject, 4, 'false-eject')
  // research_2026-11 §1c / §2c
  assert.equal(s.labelSecure, 490)
  assert.equal(s.physicsLimited, 340)
  assert.equal(s.windowLimited, 99)
  assert.equal(s.envelope.falseSecure, 0, 'the closed-form bound never under-predicts the window peak')
  assert.equal(s.pinn.agree, 1134)
  assert.equal(s.pinn.falseSecure, 11)
  assert.equal(s.pinn.falseEject, 55)
  // validation_2026-11: false-secure |ω0| range
  assert.equal(s.histogram.rule.count, 245)
  assert.equal(s.histogram.rule.min, 3.3052840457427126)
  assert.equal(s.histogram.rule.max, 7.2059289283353)
})

test('3a: every prior is deterministic in the seed and custom |ω| range is honoured', () => {
  for (const prior of ['uniform-box', 'log-uniform-mag', 'slow', 'moderate', { kind: 'custom', min: 2, max: 2.5 }]) {
    const a = Array.from({ length: 50 }, (_, k) => samplePrior(mulberry32(42 + k), prior))
    const b = Array.from({ length: 50 }, (_, k) => samplePrior(mulberry32(42 + k), prior))
    assert.deepEqual(a, b)
    if (typeof prior === 'object') {
      for (const w of a) {
        const m = Math.hypot(...w)
        assert.ok(m >= 2 - 1e-12 && m <= 2.5 + 1e-12, `custom |ω| ${m}`)
      }
    }
  }
})

test('3b: CSV export has one header and one line per row with verdict strings', () => {
  const rows = monteCarloChunk({ seed: 1, count: 5, offset: 0, prior: 'slow' })
  const csv = rowsToCsv(rows)
  const lines = csv.trimEnd().split('\n')
  assert.equal(lines[0], CSV_COLUMNS.join(','))
  assert.equal(lines.length, 6)
  assert.match(lines[1], /,(SECURE|EJECT),(SECURE|EJECT),(SECURE|EJECT),(SECURE|EJECT)$/)
  // round-trips the sampled ω exactly (17 significant digits)
  assert.equal(Number(lines[1].split(',')[1]), rows[0].wx)
})
