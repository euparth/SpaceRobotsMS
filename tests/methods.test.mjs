import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CUBESAT, PRESET_S5, PRESETS } from '../src/physics/constants.js'
import { omegaZMax } from '../src/physics/envelope.js'
import { peakWzInContactWindow } from '../src/physics/captureLabel.js'
import { predictOutcome } from '../src/physics/rigidBody.js'
import { README_LIMITATIONS } from '../src/methods/limitations.js'
import { INERTIA_BOX, PRESET_TABLE, PRIOR_TABLE, MISCLASS, CLOSED_FORM, TWO_WAY } from '../src/methods/measured.js'

const README = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8')

test('5d: every README "Status and limitations" bullet quoted on /methods is present verbatim in README.md', () => {
  const section = README.slice(README.indexOf('## Status and limitations'))
  for (const line of README_LIMITATIONS) assert.ok(section.includes(`- ${line}`), `missing: ${line.slice(0, 60)}…`)
  // and the section has exactly these bullets (nothing silently dropped from the page)
  const bullets = section
    .split('\n## ')[0]
    .split('\n')
    .filter((l) => l.startsWith('- '))
  assert.equal(bullets.length, README_LIMITATIONS.length)
})

test('5c: README carries the required sentence about the 20.75 % disagreement', () => {
  assert.ok(README.includes('The 20.75 % disagreement on the default dataset is a property of its prior and is not an operational failure rate.'))
})

test('5a: quoted inertia of the uniform box recomputes from mass and dimensions', () => {
  const [x, y, z] = CUBESAT.dims
  const m = CUBESAT.mass
  assert.equal((m / 12) * (y * y + z * z), INERTIA_BOX.ix)
  assert.equal((m / 12) * (x * x + z * z), INERTIA_BOX.iy)
  assert.equal((m / 12) * (x * x + y * y), INERTIA_BOX.iz)
})

test('5c: quoted preset table recomputes (closed-form max, predictOutcome, window peak) for S1–S5', () => {
  const all = [...PRESETS, PRESET_S5]
  for (const row of PRESET_TABLE) {
    const p = all.find((q) => q.id === row.id)
    assert.deepEqual(p.w, row.w)
    assert.equal(omegaZMax(CUBESAT.inertia, p.w).toFixed(6), row.envMax.toFixed(6))
    assert.equal(predictOutcome(p.w).verdict, row.predict)
    assert.equal(peakWzInContactWindow(...p.w, 0).toFixed(6), row.windowPeak.toFixed(6))
  }
})

test('5c: quoted counts are mutually consistent (uniform-box row equals Task C; two-way changed rows all within 0.024 of 3.0)', () => {
  const ub = PRIOR_TABLE.find((r) => r.prior === 'uniform-box')
  assert.equal(ub.ruleSecure, MISCLASS.ruleSecure)
  assert.equal(ub.falseSecure, MISCLASS.falseSecure)
  assert.equal(ub.falseEject, MISCLASS.falseEject)
  assert.equal(ub.physicsLimited, CLOSED_FORM.physicsLimited)
  assert.equal(ub.physicsSecure, MISCLASS.physicsSecure)
  assert.equal(MISCLASS.falseSecure + MISCLASS.falseEject, MISCLASS.disagreements)
  assert.equal(MISCLASS.histogram.reduce((n, [, c]) => n + c, 0), MISCLASS.falseSecure)
  for (const r of TWO_WAY.changedRows) assert.ok(r.oneWay > 3 && r.oneWay - 3 < 0.024 && r.twoWay <= 3)
})
