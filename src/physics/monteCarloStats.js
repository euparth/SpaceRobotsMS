/**
 * Aggregation of Monte Carlo rows (confusion tables, false-secure histogram, summary, CSV).
 * Kept free of the surrogate import so the UI thread can use it without loading the weights;
 * src/physics/monteCarlo.js re-exports everything here.
 */
export function confusion(rows, key) {
  const c = { secureSecure: 0, falseSecure: 0, falseEject: 0, ejectEject: 0 }
  for (const r of rows) {
    const p = r[key]
    if (p && r.label) c.secureSecure++
    else if (p && !r.label) c.falseSecure++
    else if (!p && r.label) c.falseEject++
    else c.ejectEject++
  }
  c.n = rows.length
  c.agree = c.secureSecure + c.ejectEject
  c.predictedSecure = c.secureSecure + c.falseSecure
  return c
}

export const HISTOGRAM_BIN = 0.5

/** |ω0| histogram (bin 0.5 rad/s, as in validation_2026-11 §…) of rows where predictor is SECURE but the label is EJECT. */
export function falseSecureHistogram(rows, key, bin = HISTOGRAM_BIN) {
  const sel = rows.filter((r) => r[key] && !r.label)
  if (sel.length === 0) return { bins: [], count: 0, min: null, max: null }
  let min = Infinity
  let max = -Infinity
  for (const r of sel) {
    if (r.mag < min) min = r.mag
    if (r.mag > max) max = r.mag
  }
  const first = Math.floor(min / bin)
  const last = Math.floor(max / bin)
  const bins = []
  for (let b = first; b <= last; b++) bins.push({ lo: b * bin, hi: (b + 1) * bin, count: 0 })
  for (const r of sel) bins[Math.floor(r.mag / bin) - first].count++
  return { bins, count: sel.length, min, max }
}

export function summarize(rows) {
  const labelSecure = rows.reduce((n, r) => n + (r.label ? 1 : 0), 0)
  return {
    n: rows.length,
    labelSecure,
    rule: confusion(rows, 'rule'),
    envelope: confusion(rows, 'envelope'),
    pinn: confusion(rows, 'pinn'),
    // research_2026-11 §2c: rule SECURE and closed-form max > 3 → no fire delay can help
    physicsLimited: rows.reduce((n, r) => n + (r.rule && !r.envelope ? 1 : 0), 0),
    // research_2026-11 §1c: closed-form max > 3 but the 0.25 s window peak ≤ 3 → would eject with a later arrival
    windowLimited: rows.reduce((n, r) => n + (!r.envelope && r.label ? 1 : 0), 0),
    histogram: {
      rule: falseSecureHistogram(rows, 'rule'),
      envelope: falseSecureHistogram(rows, 'envelope'),
      pinn: falseSecureHistogram(rows, 'pinn'),
    },
  }
}

export const CSV_COLUMNS = ['i', 'wx', 'wy', 'wz', 'mag', 'peak0', 'envelopeMax', 'branch', 'pinnPeak', 'label', 'rule', 'envelope', 'pinn']

export function rowsToCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')]
  for (const r of rows) {
    lines.push(
      CSV_COLUMNS.map((k) => {
        const v = r[k]
        if (typeof v === 'boolean') return v ? 'SECURE' : 'EJECT'
        if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(17)
        return v == null ? '' : String(v)
      }).join(','),
    )
  }
  return lines.join('\n') + '\n'
}
