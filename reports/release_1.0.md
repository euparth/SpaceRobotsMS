# Release 1.0 — 2026-11-03

Candidate tag: `v1.0.0-rc1`. Ground truth for quoted physics numbers remains `reports/validation_2026-11.md` (V) and `reports/research_2026-11.md` (R). This file records what was added on `main` after those notes, and the Phase 7 re-run of the default path.

| Item | Value |
| --- | --- |
| Machine | Apple M1, 8 cores, 8.0 GB, macOS 27.0.1 (26A434), darwin arm64 |
| Node / npm | v18.20.8 / 10.8.2 |
| Date | 2026-11-03 (IST) |
| Branch | `main` |
| Phase 6 commit | `8717248` |
| Phase 7 commit | this file |
| `src/surrogate/weights.json` | not modified; SHA-256 `74ef6b184399d9f24c60759652a82219b83caadc6521ddbcf4db50709cdf0321` |
| Dataset generation defaults / physics constants | not modified |
| Raw outputs of this re-run | `reports/raw/release/` |

Commits on `main` after the research note (one per phase):

| Commit | Message |
| --- | --- |
| `dc3da72` | PHASE 1 — Envelope criterion in the product path |
| `bda1c1b` | PHASE 2 — Polhode view |
| `725fa9b` | PHASE 3 — In-browser Monte Carlo |
| `de8bc06` | PHASE 4 — Two-way coupling in the UI |
| `d919d52` | PHASE 5 — Methods & verification page |
| `8717248` | PHASE 6 — Engineering quality |
| (HEAD) | PHASE 7 — Release check |

---

## Phase 1 — Envelope criterion in the product path

The closed-form max |ωz| on the polhode (`src/physics/envelope.js`, LP branches a=0 / b=0, identical to `scripts/research/closedForm.mjs`) is a column on the Verdicts panel next to the static |ωz0| rule, the PINN, and the RK4 contact-window label.

Commands:

```bash
npm test                 # tests/envelope.test.mjs
node scripts/research/phase1_integrator.mjs
```

Measured (R Phase 1c, 1,200 `capture.json` rows; `tests/envelope.test.mjs` S4 row):

| Quantity | Value |
| --- | --- |
| S4 ω₀ | [3.00, 3.00, 2.50] rad/s |
| Static rule | SECURE, \|ωz0\| = 2.500 |
| Closed-form max \|ωz\| | 4.033684 rad/s → EJECT |
| Window peak, fire now | 3.924574 rad/s → EJECT |
| Rule SECURE / false-secure / false-eject on the default dataset | 731 / 245 / 4 |
| Physics-limited (rule SECURE, envelope EJECT) | 340 |
| Window-limited (envelope EJECT, window peak ≤ 3) | 99 |
| Envelope false-secure vs window label | 0 |
| Closed-form vs 20 s numeric peak, max bound − numeric | 1.5609692294304978e-7 rad/s |

---

## Phase 2 — Polhode view

3D angular-momentum curve on the energy ellipsoid and a 2D chart with the ±3 rad/s band. Presets S1–S4 unchanged; S5 added.

Commands:

```bash
node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/release/findS5.mjs
npm test                 # tests/polhode.test.mjs
```

Measured (`reports/raw/release/phase2_s5.txt`, identical to `reports/raw/release/phase2_s5.txt` from the findS5 run and to `src/methods/measured.js` PRESET_TABLE S5):

| Quantity | Value |
| --- | --- |
| S5 name | Envelope boundary |
| S5 ω₀ | [2.09, 1.00, 2.00] rad/s |
| Closed-form max \|ωz\| | 2.9771537468964078 rad/s (branch a=0) |
| \|3 − max\| | 0.02284625310359223 |
| Window peak, fire now | 2.4276012357102745 rad/s |
| Coupled one-way peak \|ωz\| | 2.4176005711025916 rad/s, eject false |
| max strain | 0.04531678694288943 |
| Curve sampling | `CURVE_SECONDS=20`, `CURVE_STEP=1/300`, 2400 points (`src/physics/polhode.js`) |

S1–S4 ω₀ vectors are unchanged from `src/physics/constants.js` PRESETS.

---

## Phase 3 — In-browser Monte Carlo

Priors `uniform-box`, `log-uniform-mag`, `slow`, `moderate`, plus custom |ω| range with isotropic direction. N ∈ [100, 2000], seed. Worker pool uses `planChunks` with a **fixed 8-way split** (`DATASET_CHUNKS=8`, `CHUNK_SEED_STRIDE=9973`), the same assignment as `genData.mjs` on a machine with ≥ 8 cores, regardless of `navigator.hardwareConcurrency`. Confusion tables for static rule, envelope, PINN vs solver label; histogram of |ω0| for false-secure rows, bin 0.5 rad/s; CSV export.

Commands:

```bash
npm test                 # tests/montecarlo.test.mjs
npx playwright test      # e2e/smoke.spec.js Monte Carlo case
```

Measured, uniform-box, N = 1200, seed 777001 (node:test and Playwright, both exact):

| Quantity | Value |
| --- | --- |
| Rule predicted SECURE / false-secure / false-eject | 731 / 245 / 4 |
| Label SECURE | 490 |
| Physics-limited / window-limited | 340 / 99 |
| Envelope false-secure | 0 |
| PINN agree / false-secure / false-eject | 1134 / 11 / 55 |
| False-secure \|ω0\| min / max | 3.3052840457427126 / 7.2059289283353 |

The 20.75 % disagreement (249/1200) on the default dataset is a property of its prior and is not an operational failure rate.

---

## Phase 4 — Two-way coupling in the UI

Toggle “Net→body coupling: one-way (default) / two-way (experimental)”, drawstring on/off, ΔP_total and ΔL_total of body+net over the contact window. Experimental badge links to `/methods#two-way`. Live readout uses `momentumBudget(..., includePending=true)` so the pending one-substep reaction is credited.

Commands:

```bash
npm test                 # tests/momentum.test.mjs
node scripts/research/phase3_twoway.mjs
```

Headless S2 ω₀ = [1.5, 1.0, 0.5] rad/s, this session (`coupledImpactTwoWay`):

| Mode | ΔP_total (N·s) | ΔL_total (N·m·s) | ΔL / \|L\| |
| --- | --- | --- | --- |
| one-way, drawstring on | 5.284077592893101 | 0.012084349138560449 | 0.01503888047442194 |
| two-way, drawstring off | 1.6463489980784453e-12 | 0.022393115562529674 | 0.02789136348361208 |
| two-way, drawstring on | 4.777553146125424 | 0.0026290464728578535 | 0.003274564032804079 |

Browser workbench, same S2, measured 2026-11-03 during the Phase 4 UI check (worker snapshot at tLaunch+0.28 s): one-way/on ΔP = 5.32 N·s; two-way/off ΔP = 9.8e-13–1.8e-12 N·s, ΔL = 2.3e-2 N·m·s; two-way/on ΔP = 4.81 N·s.

R Phase 3c (20 spins, seed 20261103, two-way drawstring off): |ΔP_total| = 2.5312e-12 N·s, |ΔL_total| = 3.2121e-2 N·m·s (~1 % of |L|). Three of 1,200 reference verdicts change (eject → capture), all within 0.024 rad/s of the threshold.

---

## Phase 5 — Methods & verification page

Route `/methods` (`src/components/MethodsPage.jsx`, values in `src/methods/measured.js`). Sections: model, verification (drift 2.3215137374052146e-14 / 4.5516287415555136e-14, order 4.00 table, closed-form 1.56e-7, single-axis table, two-way results, timing table with machine + Node), results (four-prior table, physics-limited 340, window-limited 99, the 20.75 % sentence), limitations (README “Status and limitations” verbatim plus XPBD residual and 8-worker seed dependence), provenance (October–November 2026; 2023 M.Sc. thesis at TH OWL reviewed Shin et al.; this simulator is an independent re-implementation), build-time git commit/tag in the footer and workbench header (`vite.config.js` define).

Commands:

```bash
npm test                 # tests/methods.test.mjs
npm run build && npx vite preview --host 127.0.0.1 --port 4173
# open /methods
```

Playwright: `/methods` heading “Methods and verification”; the 20.75 % sentence is present; `samplePrior` source is quoted; the three.js chunk is not requested.

---

## Phase 6 — Engineering quality

### 6a Playwright smoke test

`e2e/smoke.spec.js`, `playwright.config.js` (`vite preview` on 127.0.0.1:4173), `npm run test:e2e`, CI job `browser-smoke` in `.github/workflows/ci.yml`.

```bash
npm run build
npx playwright install chromium
npx playwright test
```

Measured: 3 passed in 18.7 s (workspace) and 34.6 s (clean clone `/tmp/SpaceRobotsMS-rc1`). Cases: workbench loads with no console errors; S4 cells 2.500 / 4.034 / EJECT peak 3.925 / solver EJECT after launch; Monte Carlo N=100 completes and N=1200 seed 777001 uniform-box shows 731 / 245 / 4; `/methods` does not load `three-*.js`.

GitHub-hosted CI (after `scripts/surrogate/data/capture.json` was tracked): **measured**, run
https://github.com/euparth/SpaceRobotsMS/actions/runs/41608110911 — `test-build` success, `browser-smoke` success (3 Playwright tests, 42.0 s). First push of `v1.0.0-rc1` / `b27c595` failed with ENOENT on gitignored `capture.json` (run 41607831627); fixed in `55ba005`.

### 6b Lighthouse (mobile) and bundle

Lighthouse 12.8.2, Chrome 156.0.0.0, `--form-factor=mobile --screenEmulation.mobile`, throttle `{rttMs:150, throughputKbps:1638.4, cpuSlowdownMultiplier:4}`. Command:

```bash
npx lighthouse "http://127.0.0.1:4173/" --form-factor=mobile --screenEmulation.mobile \
  --only-categories=performance,accessibility \
  --chrome-flags="--headless=new --no-sandbox"
```

Workbench `/` (three consecutive runs after the CLS placeholder and lazy `inference` chunk):

| Run | Performance | Accessibility | LCP | TBT | CLS | FCP | Speed index |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 72 | 100 | 3.5 s | 670 ms | 0 | 2.1 s | 2.1 s |
| 2 | 74 | 100 | 3.3 s | 700 ms | 0 | 2.0 s | 2.0 s |
| 3 | 84 | 100 | 3.1 s | 360 ms | 0 | 2.0 s | 2.0 s |

Target performance ≥ 85 was not met on this machine under that throttle. Long tasks are dominated by `Canvas3D` / `three-*.js` WebGL setup (bootup-time for `Canvas3D-*.js` ~1083–1174 ms scripting on the better run). Accessibility 100 after slate-500/600 contrast override (`tailwind.config.js`), `:focus-visible` (`src/index.css:142`), tour progress `role="group"` with 24 px targets (`GuidedTour.jsx`).

`/methods` (same flags):

| Run | Performance | Accessibility | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- |
| 1 | 97 | 100 | 2.2 s | 60 ms | 0 |
| 2 | 99 | 100 | 1.7 s | 20 ms | 0 |

Production bundle (`npm run build` at `8717248`, Vite 6.4.4):

| Chunk | Raw kB | gzip kB |
| --- | --- | --- |
| three-*.js | 487.63 | 123.13 |
| physicsWorker | 152.17 | — |
| react | 141.74 | 45.48 |
| monteCarloWorker | 133.16 | — |
| inference (lazy weights) | 129.85 | 59.45 |
| GNCWorkbench | 117.01 | 37.38 |
| MethodsPage | 40.17 | 14.92 |
| index.css | 43.08 | 8.30 |
| index.js | 24.56 | 10.57 |
| OrbitControls | 18.93 | 4.31 |
| Canvas3D | 18.05 | 7.26 |
| PolhodeView | 7.11 | 3.34 |

three.js is not loaded on `/methods` (Playwright assertion). Surrogate `weights.json` is a dynamic `import()` from `src/services/aiSurrogateEngine.js` (`loadSurrogate()`), so it is not in the GNCWorkbench chunk.

### 6c Keyboard and reduced motion

- `:focus-visible` outline 2 px `#7dd3fc` (`src/index.css:142`).
- `@media (prefers-reduced-motion: reduce)` (`src/index.css:130`); JS helper `src/motion.js` used by Canvas3D for the ring pulse and shader `uTime`.
- `aria-label` / `ariaLabel` on Segmented controls, Monte Carlo prior/N/seed, tour progress, 3D Suspense fallback, TimeSeriesChart `role="img"`.
- Accessible-name audit during Phase 6: 0 unnamed controls on desktop, mobile, and `/methods`.

### 6d Docs

| File | Content |
| --- | --- |
| `LICENSE` | MIT, Copyright (c) 2026 Parth Sharma. Confirmed by Parth Sharma before the v1.0.0 tag (2026-11-05). |
| `CITATION.cff` | author Parth Sharma, version 1.0.0, repository `https://github.com/euparth/SpaceRobotsMS` |
| `CHANGELOG.md` | 1.0.0-rc1 |
| `CONTRIBUTING.md` | test policy (`npm test`, `test:e2e`) and verification policy (do not invent numbers; do not retrain weights) |
| `README.md` | architecture diagram (UI, physicsWorker, netSolver, surrogate, telemetry bus, Monte Carlo workers) |
| `package.json` | `"license": "MIT"`, `"author": "Parth Sharma <euparth@gmail.com>"` |

### 6e Copy grep

Searched the repo and site copy for: `thesis scenario`, `MS thesis`, `AI-powered`, `every number`, `revolution`, `cutting`, `state-of-the-art`, `proves`, `Gazebo`, `ROS 2`.

Remaining `ROS 2` uses are the in-browser topic-bus UI and the rosbridge client, all marked **NOT MEASURED** against a live server. There is no Gazebo integration.

Changes (file:line after Phase 6):

| File:line | Change |
| --- | --- |
| `index.html:7` | description no longer “Parth's MS Thesis — GNC digital twin…” |
| `index.html:9` | title “Space Debris Capture Simulator” |
| `src/components/GNCWorkbench.jsx:71` | CLI hint no longer “Parth's MS Thesis · GNC digital twin” |
| `src/components/GNCWorkbench.jsx:239–242` | header “Space Debris Capture Simulator / tumbling 12U CubeSat · Kevlar 49 net” |
| `src/components/GNCWorkbench.jsx:304` | LED title “in-browser ROS 2-style topic bus” |
| `src/components/GuidedTour.jsx:9–10` | 3 rotational DOF, RK4 H=1/3000 s; stored Ix,Iy,Iz; z intermediate |
| `src/components/GuidedTour.jsx:18–19` | XPBD lattice 144 knots, GLSL strain colours |
| `src/components/GuidedTour.jsx:27–28` | verdict = max \|ωz\| over 0.25 s; S4 \|ωz0\|=2.5 still ejects |
| `src/components/TopicMonitor.jsx:131` | rosbridge “NOT MEASURED”; Gazebo claim removed |
| `src/services/rosTelemetryNode.js:107` | same; Gazebo claim removed |
| `src/services/cliCommands.js:9` | “Load scenario S1–S5” (was “thesis scenario”) |
| `src/services/cliCommands.js:19` | rosbridge NOT MEASURED |
| `src/services/telemetryExporter.js:110` | project string without “MS Thesis” |
| `src/hooks/useSurrogate.js:17` | “Default ON.” (was “per thesis brief”) |
| `src/services/aiSurrogateEngine.js:3` | “thesis brief” sentence removed |
| `README.md:1` | title without “Parth's MS Thesis” |
| `README.md:5` | in-browser ROS 2-style bus; no ROS 2 process |
| `README.md:145` | rosbridge NOT MEASURED; “There is no Gazebo integration.” |
| `src/methods/limitations.js:20` | same limitation on `/methods` |

Grep hits that are policy/docs, not product claims: `CONTRIBUTING.md` (forbidden-phrase list), `CHANGELOG.md` (records the Gazebo removal), `reports/validation_2026-11.md` (historical Task E table).

---

## Phase 7 — Release check

### 7a Clean clone and default-path reproduction

```bash
git clone <this-repo> /tmp/SpaceRobotsMS-rc1 && cd /tmp/SpaceRobotsMS-rc1
# at 8717248
npm ci
npm test
npm run build
```

| Step | Result |
| --- | --- |
| `npm ci` | 137 packages, exit 0 |
| `npm test` on a clone with no `scripts/surrogate/data/` (gitignored) | 32 pass, 1 fail: `tests/montecarlo.test.mjs` ENOENT on `capture.json` (`reports/raw/release/clone_npm_test_nodata.txt`) |
| copy `scripts/surrogate/data/` from the generating machine, then `npm test` | 33 pass, 0 fail, 984 ms |
| `npm run build` | exit 0, 1.65 s |
| `npx playwright test` | 3 passed, 34.6 s (`reports/raw/release/clone_e2e.txt`) |

Re-run vs `reports/raw/` (this workspace, same machine). Command pattern: redirect stdout and `diff`, ignoring `wall_s` lines and the Node `--experimental-loader` warning.

| Script | vs committed raw | Diff after stripping timing |
| --- | --- | --- |
| `node scripts/validation/inertia.mjs` | `taskA_inertia.txt` | identical |
| `node scripts/validation/axisSweep.mjs` | `taskB_axis_sweep.txt` | identical |
| `node scripts/validation/misclass.mjs` | `taskC_misclass.txt` | identical; `wall_s` 8.2466 → 8.5135 |
| `node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/validation/timing.mjs` | `taskD_timing.txt` | spin indices identical; ms and ratios differ (pass 1 mean coupled 7.3091 → 7.5351; pass 2 6.7118 → 7.0706) |
| `node scripts/research/phase1_integrator.mjs` | `research/phase1_integrator.txt` | identical; `wall_s` 9.1980 → 9.5431 |
| `node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/research/phase2_priors.mjs` | `research/phase2_priors.txt` | identical (loader warning only) |
| `node scripts/research/phase3_twoway.mjs` | `research/phase3_twoway.txt` | physics identical; 3e timing lines differ (one-way pass 1 mean 7.5431 → 6.7333 ms) |
| `node scripts/research/phase3_diag_angmom.mjs` | `research/phase3_diag_angmom.txt` | identical |
| `node scripts/research/phase4_presets.mjs` | `research/phase4_presets.txt` | identical |
| `node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/release/findS5.mjs` | `release/phase2_s5.txt` | identical |

Dataset regeneration (`npm run gen:surrogate` in the clone, 8 threads):

```
b794288469521126068c8311254ee438831257db058710147727b4425693e1d1  trajectories.bin
52156b234d541aa3eb9b3d26588d3b50659ba7062980f3c899a48f09596cb841  trajectories.meta.json
4375a5f65e210e465e23c5edbcab6bd1d71ffdfc0cfba85cb8190c7c91212fc7  strain.json
0734478b6f55eabbd65ef2df5316940d42cbba05824156386165368fda6503c5  capture.json
50988afa017e35c4c5deb8b577098cb8de35df9e21af50b405d7bf8d66eba6cd  audit.json
a01e8cded2a794b3acb6a0f08d83d5f2161dc079f99a7a0b463ebeeb3c5991e8  summary.json
```

Byte-identical to V Task F / R header. Alternative priors:

| Prior | SHA-256 of capture.json |
| --- | --- |
| uniform-box | `0734478b…6503c5` (same as default) |
| log-uniform-mag | `b71f48fb…b0711b` |
| slow | `766eee0c…8b2754` |
| moderate | `5fb56177…fd536e` |

`npm run check:surrogate` (committed weights, then `metrics.json` restored): latency 0.599 ms (budget 2 ms), accuracy 94.7 %, naive 83.8 %, PASSED (`reports/raw/release/check_run.txt`).

### 7b Deploy preview

Measured with Vercel CLI 65.10.0, account `euparth-9805`, scope `team_mIxmsWgggY2eGiFYVESFvzQ2`, project `space-debris-sim` (`prj_n1HuVSHk0yun8JAEQQBlF9DbO33a`):

```bash
vercel --scope team_mIxmsWgggY2eGiFYVESFvzQ2 deploy --yes
```

| Item | Value |
| --- | --- |
| Deployment id | `dpl_DnKiNJDeSHviRqruoExtVESuYtmS` (earlier READY deploy `dpl_5jUFfyvhRy7uaaEh5BKSfUrEL87s`) |
| Preview URL | https://space-debris-c1k2ilvo2-euparth-9805s-projects.vercel.app |
| Inspect | https://vercel.com/euparth-9805s-projects/space-debris-sim/DnKiNJDeSHviRqruoExtVESuYtmS |
| readyState | READY |
| `/` and `/methods` via `vercel curl` | HTTP/2 200 |
| Deployment Protection | Vercel Authentication (preview is not public without login or a bypass token) |
| Production URL | NOT MEASURED in this step (`vercel deploy --prod` not run; live README URL remains https://space-debris-sim.vercel.app) |

### Tag

```bash
git tag v1.0.0-rc1
```

Originally on Phase 7 commit `b27c595`. After CI required tracking `capture.json`, the tag was moved to the tip that includes that fix and this report update (see `git show v1.0.0-rc1`).

---

## Pre-v1.0.0 items (2026-11-05)

- **MIT licence**: confirmed by Parth Sharma. The “confirm with Parth Sharma” notes were removed from `README.md` and this report; `LICENSE` remains MIT.
- **AI assistance disclosure** (wording for Parth to check before release): added to `README.md` (Methods and verification · Provenance) and `/methods` §5: “Developed with AI coding assistance (Cursor). The author specified the research questions and reviewed the results; numbers come from the committed scripts and tests.”
- **gitleaks** 8.30.1 over full history (`gitleaks detect --source . --log-opts="--all"`): 24 commits scanned, ~1.29 MB, **no leaks found** (exit 0). Raw: `reports/raw/release/gitleaks.txt`, `reports/raw/release/gitleaks.json`.
- Git history and `Co-authored-by` trailers were not rewritten. Repository visibility was not changed.

## 1.0.0 final

Items for the v1.0.0 tag (one commit each). Tag and GitHub Release are **not** created here; Parth will publicise the repo and enable Zenodo first.

### 1. Clean production build

- Added `surrogate_verification_log.txt` to `.gitignore`.
- `vite.config.js`: `__GIT_DIRTY__` is forced false when `VERCEL` is set so GitHub→Vercel builds never stamp `+dirty`.
- Production deploys only via the GitHub→Vercel integration (no `vercel deploy --prod` from a dirty local tree).
- Commit: `a6188b3`.
- Production `/methods` after deploy `dpl_3Km1j3AL4mpog6P9kCZ9X5BxNXPo` (alias https://space-debris-sim.vercel.app):
  - footer build label: `main · a6188b3` (no `+dirty`)
  - full footer: `Space Debris Capture Simulator · build main · a6188b3 · 2026-11-05 · https://github.com/euparth/SpaceRobotsMS`
  - intro “Build shown”: `main · a6188b3 (2026-11-05)`

### 2. Rename GNC workbench v3 → v1.0

- `README.md:1`: title `(v1.0)`.
- `GNCWorkbench.jsx` header subtitle: `v1.0` (mobile and desktop).
- Telemetry schema id `ps-msc.debris-capture.telemetry/v3` left unchanged (`src/services/telemetryExporter.js`); no test asserted the “GNC v3” UI string.

### 3. CITATION.cff

- Abstract: replaced “MLP surrogate for the fire-now decision” with “closed-form spin-envelope criterion for the fire-now decision; MLP surrogate retained for comparison”.
- Added a `preferred-citation` block (`type: software`, author Parth Sharma, version 1.0.0, same repository URL).


### 4. VerdictsPanel envelope wording

- Replaced the rule/envelope footnote with: “The static rule reads the initial state only. The envelope bounds |ωz| for all time, so ENVELOPE SECURE is a conservative (sufficient) condition for firing at any delay; it can hold spins the 0.25 s window would have cleared (99 of 1,200 on the default prior).” (`src/components/VerdictsPanel.jsx`)


### 5. Scenario cards use envelope verdict

- Scenario list badges show envelope SECURE/EJECT (S4 → EJECT), not `PHASE-DEP`.
- When |ωz0| rule and envelope disagree, a second line `rule: SECURE` (or `rule: EJECT`) is shown (S4: envelope EJECT, `rule: SECURE`).
- `predictOutcome()` still returns `PHASE_DEPENDENT` for the live Forecast badge and for `tests/methods.test.mjs` / research tables; no test asserted the old scenario-card label.


### 6. MobilePredict BEST DELAY uses RK4 window

- `BEST DELAY` metric now uses `autoFirePlan(verdicts)` (RK4 `numeric.firstSecureDelayMs`, same source as auto-fire).
- PINN delay is shown only as a secondary `PINN est.` line under the metrics (matches desktop AI tab).


### 7. Lighthouse (no further work)

Final measured scores from Phase 6b (Lighthouse 12.8.2, Chrome 156, mobile Slow 4G / 4× CPU). No further optimisation attempted for v1.0.0.

| Page | Run | Performance | Accessibility | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| `/` workbench | 1 | 72 | 100 | 3.5 s | 670 ms | 0 |
| `/` workbench | 2 | 74 | 100 | 3.3 s | 700 ms | 0 |
| `/` workbench | 3 | 84 | 100 | 3.1 s | 360 ms | 0 |
| `/methods` | 1 | 97 | 100 | 2.2 s | 60 ms | 0 |
| `/methods` | 2 | 99 | 100 | 1.7 s | 20 ms | 0 |

Workbench performance target ≥ 85 was not met (WebGL / three.js long tasks under throttle).


### 8. Final verification, push, CI, gitleaks

- Local: `npm ci` → `npm test` (33 pass) → `npm run build` (exit 0) → `npx playwright test` (3 pass, 21.5 s).
- Pushed `main` through this tip. GitHub Actions and production `/methods` build string recorded below after deploy.
- gitleaks 8.30.1 (`gitleaks detect --source . --log-opts="--all"`): **32 commits scanned**, ~1.30 MB, **no leaks found** (exit 0). Raw: `reports/raw/release/gitleaks_final.txt`, `reports/raw/release/gitleaks_final.json`.
- `v1.0.0` tag / GitHub Release / visibility: not changed.

| Item | Commit |
| --- | --- |
| 1 Clean production build | `a6188b3` |
| 2 Rename to v1.0 | `6b37807` |
| 3 CITATION.cff | `2ed266b` |
| 4 VerdictsPanel wording | `f7ae4fe` |
| 5 Scenario cards envelope | `fdc035f` |
| 6 Mobile BEST DELAY (incl. JSX fragment fix) | `e46cbe3`, `db897f3` |
| 7 Lighthouse scores recorded | included in `db897f3` (report §7) |
| 8 Final verify + gitleaks | *(this commit)* |

- CI run URL: *(filled after push)*
- Production build string after this push: *(filled after deploy)*

## Not done / confirm

- AI assistance disclosure wording: Parth to check before release.
- Lighthouse mobile performance ≥ 85 on `/`: not reached (72 / 74 / 84). See §1.0.0 final item 7 for the recorded scores.
- Preview Deployment Protection: URL requires Vercel login (or a share / bypass token); public anonymous access NOT MEASURED.
- rosbridge vs a live `rosbridge_server`: **NOT MEASURED**.
- Gazebo: no integration.
- Comparison with Shin et al.: **NOT MEASURED**.
- `src/surrogate/weights.json`: not retrained.
- Repository visibility: left unchanged; Parth will set it.
- `v1.0.0` tag / GitHub Release: not created in this pass.
