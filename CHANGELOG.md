# Changelog

All notable changes to this project are documented here. Numbers quoted are measured values from
`reports/`; the file and section they come from is named next to each.

## [1.0.0-rc1] — 2026-11-03

Release candidate prepared for academic review. One commit per phase on `main`.

### Added
- **Envelope criterion in the product path** (`src/physics/envelope.js`, Verdicts panel): closed-form
  maximum |ωz| on the polhode compared with the 3.0 rad/s limit, shown next to the static rule, the
  RK4 window verdict and the surrogate verdict for every ω₀.
- **Polhode view** (`src/components/PolhodeView.jsx`, `src/physics/polhode.js`): angular-momentum
  curve on the energy ellipsoid in 3D, 2D chart with the ±3 rad/s band, presets S1–S4 and the new
  **S5 "Envelope boundary"** (ω₀ = [2.09, 1.00, 2.00] rad/s, closed-form ωz,max = 2.977154).
- **In-browser Monte Carlo** (`src/components/MonteCarloPanel.jsx`, `src/workers/monteCarloWorker.js`):
  spin prior selector (uniform-box, log-uniform-mag, slow, moderate, custom |ω| range), N = 100–2000,
  seed, confusion tables for the static rule, the envelope and the surrogate against the solver
  label, histogram of |ω₀| for false-secure rows, CSV export. Uses the same `mulberry32` /
  `samplePrior` / fixed 8-way chunk split as `scripts/surrogate/genData.mjs`; uniform-box, N = 1200,
  seed 777001 reproduces the committed dataset (731 rule-secure / 245 false-secure / 4 false-eject).
- **Two-way net→body coupling in the UI** (`src/physics/momentum.js`, Controls section "Net→body
  coupling"): one-way (default) / two-way (experimental), drawstring on/off, ΔP_total and ΔL_total
  of body + net over the contact window.
- **Methods & verification page** `/methods` (`src/components/MethodsPage.jsx`, `src/methods/`):
  model, verification runs, results, limitations, provenance, reproduction commands; build-time git
  commit and tag in the footer and in the workbench header (`vite.config.js`).
- Playwright smoke test (`e2e/smoke.spec.js`) in CI; `npm run test:e2e`, `npm run test:all`.
- Keyboard focus outlines, accessible names on all controls, `prefers-reduced-motion` support.
- `LICENSE` (MIT), `CITATION.cff`, `CONTRIBUTING.md`, architecture diagram in the README.
- Tests under `tests/` for every physics-facing feature above (`npm test`).

### Changed
- three.js, the 3D view, the polhode view and the surrogate weights are loaded lazily; `/methods`
  does not load three.js.
- Site copy and README: removed marketing language and unsupported integration claims; rosbridge
  client marked NOT MEASURED; no Gazebo integration exists and none is claimed.
- Shared physics helpers moved from `scripts/surrogate/physicsLib.mjs` into `src/physics/`
  (`priors.js`, `captureLabel.js`, `momentum.js`); the scripts re-export them. Regenerated datasets
  are byte-identical (hashes in `reports/release_1.0.md`).

### Unchanged (by rule)
- `src/surrogate/weights.json` (not retrained), dataset-generation defaults, physics constants.

## [0.3.x] — October 2026

- 3D simulator, GNC workbench v3, phone layout, guided tour, MLP surrogate and mobile Predict tab
  (commits 57bd526 … 0da6f69).
- November validation and research passes: integrator verification, spin-prior sensitivity, two-way
  coupling study, repository truth pass (`reports/validation_2026-11.md`, `reports/research_2026-11.md`).
