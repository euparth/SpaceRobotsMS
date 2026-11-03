# Validation note — 2026-11

## Environment

| Item | Value |
| --- | --- |
| Git commit | `0da6f6985d59467ff87709d93d339dd461a438dc` (`0da6f69`, 2026-10-19 11:59:38 +0530) |
| Working tree vs HEAD | `src/physics/`, `scripts/surrogate/`, `src/surrogate/weights.json` identical to HEAD. Modified, not touched by this note: `src/components/Controls.jsx`, `src/components/GNCWorkbench.jsx`, `src/components/ui.jsx`, `tailwind.config.js`, `src/surrogate/metrics.json` (rewritten by the 2026-11-02 `train`/`check` run). |
| Machine | Apple M1, 8 cores, 8.0 GB, macOS 27.0.1 (26A434), darwin arm64 |
| Node / npm | v18.20.8 / 10.8.2 |
| Date run | 2026-11-03 (IST) |
| Raw outputs | `reports/raw/*.txt` |
| Scripts added | `scripts/validation/inertia.mjs`, `axisSweep.mjs`, `misclass.mjs`, `timing.mjs`, `jsonLoader.mjs` |

No physics parameter, model weight, or dataset-generation file was edited. `npm run check:surrogate` rewrites `src/surrogate/metrics.json`; that file was copied before the run and restored afterwards (SHA-256 `d5d1429c…9b869ebf` before and after, `reports/raw/check_run.txt`).

---

## Task A — Principal moments of inertia

Source: `CUBESAT` in `src/physics/constants.js`, read into `IX, IY, IZ` by `src/physics/rigidBody.js` (line 3). The moments are stored constants; they are not computed from mass and dimensions at runtime. Raw: `reports/raw/taskA_inertia.txt`.

| Quantity | Value |
| --- | --- |
| Designation | 12U CubeSat |
| Mass | 30 kg |
| Dimensions [x, y, z] | [0.227, 0.366, 0.24] m |
| Ix (solver) | 0.479 kg·m² |
| Iy (solver) | 0.273 kg·m² |
| Iz (solver) | 0.464 kg·m² |
| Ix, uniform box m/12·(y²+z²) | 0.47889000000000004 kg·m² |
| Iy, uniform box m/12·(x²+z²) | 0.2728225 kg·m² |
| Iz, uniform box m/12·(x²+y²) | 0.4637125 kg·m² |
| Solver − box | [0.00011, 0.0001775, 0.0002875] kg·m² |

Ordering: Iy = 0.273 < Iz = 0.464 < Ix = 0.479.

- Minimum-moment axis: y. Intermediate axis: **z**. Maximum-moment axis: x.
- The body z-axis is the intermediate axis: **yes** (`z_is_intermediate true`; `principalAxes()` returns z as `"intermediate"`, `stable: false`).

The same three constants are also hardcoded separately in `src/surrogate/inference.js` (lines 9–11) and `scripts/surrogate/check.mjs` (lines 26–28).

---

## Task B — Single-axis calibration sweep (net fired at t = 0)

Solver path: the rollout loop of `coupledImpact()` in `scripts/surrogate/physicsLib.mjs` (RK4 rigid body + `NetSolver` XPBD net, H = 1/3000 s), run through `scripts/validation/axisSweep.mjs`. That script copies the loop with read-only observers added, and every configuration is cross-checked against `coupledImpact()` itself. Raw: `reports/raw/taskB_axis_sweep.txt`.

Run parameters: FLIGHT_TIME = 0.3 s, CONTACT_WINDOW = 0.25 s, WZ_LIMIT = 3 rad/s, 144 net knots.

Verdict logic (same as `coupledImpact`, used for `strain.json`): `eject = max |ω_z| (body frame) over [tContact, tContact + 0.25 s] > 3.0`. Otherwise "capture".

- **"partial" category: does not exist in the solver.** The verdict is binary. The nearest available metrics are reported below: knots in contact at the end of the window (out of 144), peak knots in contact during the window, and `NetSolver.enclosure()` at the end of the window (area-weighted fraction of the six faces with knots on them).
- **Coupling direction:** `coupledImpact` integrates the body with `rk4Step(y, H, 0)` (damping 0). No net force or torque is applied to the body ODE. Body ω evolves torque-free during contact.
- **Seed / stochasticity:** the code path contains no random-number call (`NetSolver` stows on a fixed grid; `Math.random` appears in `src/` only in `Canvas3D.jsx` and `useSimulation.js`, which are not on this path). Each configuration was run twice with identical output: non-repeatable runs = 0 of 33. Mismatches against `coupledImpact()` = 0 of 33.
- `rigid secure` = the `capture.json` label rule (`peakWzInContactWindow(ω, 0) ≤ 3`, torque-free, no net), for comparison.

| axis | w (rad/s) | verdict | peak \|ω\| contact (rad/s) | peak \|ω_z\| contact (rad/s) | tContact (s) | knots in contact, end | peak knots | enclosure, end | max strain | rigid secure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| x | 0.1 | capture | 0.100000 | 0.000000 | 0.287333 | 12/144 | 12/144 | 1.0000 | 0.052727 | true |
| x | 0.5 | capture | 0.500000 | 0.000000 | 0.286000 | 12/144 | 12/144 | 1.0000 | 0.049661 | true |
| x | 1.0 | capture | 1.000000 | 0.000000 | 0.284333 | 15/144 | 16/144 | 1.0000 | 0.045917 | true |
| x | 1.5 | capture | 1.500000 | 0.000000 | 0.282000 | 18/144 | 19/144 | 0.8051 | 0.041696 | true |
| x | 2.0 | capture | 2.000000 | 0.000000 | 0.279333 | 16/144 | 16/144 | 0.8051 | 0.036925 | true |
| x | 2.5 | capture | 2.500000 | 0.000000 | 0.281333 | 16/144 | 18/144 | 0.9396 | 0.040303 | true |
| x | 3.0 | capture | 3.000000 | 0.000000 | 0.282667 | 18/144 | 18/144 | 1.0000 | 0.042985 | true |
| x | 3.5 | capture | 3.500000 | 0.000000 | 0.283333 | 20/144 | 20/144 | 1.0000 | 0.043767 | true |
| x | 4.0 | capture | 4.000000 | 0.000000 | 0.283333 | 17/144 | 17/144 | 1.0000 | 0.043840 | true |
| x | 4.5 | capture | 4.500000 | 0.000000 | 0.283000 | 17/144 | 17/144 | 1.0000 | 0.044219 | true |
| x | 5.0 | capture | 5.000000 | 0.000000 | 0.279333 | 15/144 | 17/144 | 1.0000 | 0.034303 | true |
| y | 0.1 | capture | 0.100000 | 0.000000 | 0.287333 | 12/144 | 12/144 | 1.0000 | 0.052707 | true |
| y | 0.5 | capture | 0.500000 | 0.000000 | 0.286000 | 12/144 | 12/144 | 1.0000 | 0.050082 | true |
| y | 1.0 | capture | 1.000000 | 0.000000 | 0.288333 | 12/144 | 12/144 | 0.8791 | 0.055187 | true |
| y | 1.5 | capture | 1.500000 | 0.000000 | 0.290333 | 12/144 | 12/144 | 1.0000 | 0.058824 | true |
| y | 2.0 | capture | 2.000000 | 0.000000 | 0.290667 | 10/144 | 11/144 | 0.9396 | 0.059264 | true |
| y | 2.5 | capture | 2.500000 | 0.000000 | 0.291000 | 8/144 | 8/144 | 0.8791 | 0.060019 | true |
| y | 3.0 | capture | 3.000000 | 0.000000 | 0.291000 | 8/144 | 8/144 | 0.8791 | 0.060319 | true |
| y | 3.5 | capture | 3.500000 | 0.000000 | 0.290667 | 9/144 | 10/144 | 0.8791 | 0.060029 | true |
| y | 4.0 | capture | 4.000000 | 0.000000 | 0.289333 | 12/144 | 12/144 | 0.8791 | 0.057422 | true |
| y | 4.5 | capture | 4.500000 | 0.000000 | 0.286000 | 12/144 | 12/144 | 0.8791 | 0.050783 | true |
| y | 5.0 | capture | 5.000000 | 0.000000 | 0.286667 | 10/144 | 12/144 | 0.8791 | 0.051161 | true |
| z | 0.1 | capture | 0.100000 | 0.100000 | 0.287667 | 12/144 | 12/144 | 1.0000 | 0.053476 | true |
| z | 0.5 | capture | 0.500000 | 0.500000 | 0.287667 | 12/144 | 12/144 | 0.8791 | 0.053469 | true |
| z | 1.0 | capture | 1.000000 | 1.000000 | 0.287667 | 12/144 | 12/144 | 0.7870 | 0.053464 | true |
| z | 1.5 | capture | 1.500000 | 1.500000 | 0.287667 | 12/144 | 12/144 | 0.8791 | 0.053436 | true |
| z | 2.0 | capture | 2.000000 | 2.000000 | 0.287667 | 12/144 | 12/144 | 1.0000 | 0.053243 | true |
| z | 2.5 | capture | 2.500000 | 2.500000 | 0.287667 | 12/144 | 12/144 | 1.0000 | 0.053137 | true |
| z | 3.0 | capture | 3.000000 | 3.000000 | 0.287667 | 9/144 | 12/144 | 0.8791 | 0.053118 | true |
| z | 3.5 | eject | 3.500000 | 3.500000 | 0.287667 | 10/144 | 12/144 | 0.8791 | 0.053180 | false |
| z | 4.0 | eject | 4.000000 | 4.000000 | 0.287667 | 10/144 | 12/144 | 0.8791 | 0.053301 | false |
| z | 4.5 | eject | 4.500000 | 4.500000 | 0.287667 | 12/144 | 12/144 | 1.0000 | 0.053463 | false |
| z | 5.0 | eject | 5.000000 | 5.000000 | 0.287667 | 12/144 | 12/144 | 0.6949 | 0.053460 | false |

**Comparison to Shin et al. 2023: NOT MEASURED.** The repository contains no data, table, or reference values from Shin et al. 2023, so no side-by-side comparison was computed. The table above is the model-side half of that comparison.

---

## Task C — Conditional misclassification analysis

Dataset: `scripts/surrogate/data/capture.json`, 1,200 rows, regenerated in this session with `npm run gen:surrogate` (fixed seeds in `genData.mjs`: trajectories `20260419`, strain base `424242`, capture base `777001`, per-worker offset `+9973·c`, 8 workers). SHA-256 before and after regeneration: identical for all six files (Task F; `reports/raw/regen.txt`). `trajectories.bin`, `capture.json` and `strain.json` are also byte-identical (`cmp`) to the 2026-11-02 snapshot.

Physics label in the dataset: `fireNowSecure = peakWzInContactWindow(wx, wy, wz, 0) ≤ 3.0`, i.e. torque-free RK4 for 0.3 s of flight then max |ω_z| over the 0.25 s window, with no net in the loop. Rule: `|wz(0)| ≤ 3.0 ⇒ SECURE`. The rule matches the stored `naiveEject` field on 1,200 of 1,200 rows. Raw: `reports/raw/taskC_misclass.txt`.

| Count | Value |
| --- | --- |
| Rule SECURE | 731 |
| Rule EJECT | 469 |
| Physics SECURE | 490 |
| Physics EJECT | 710 |

| Case | Count | % of 1,200 | % of rule-SECURE (731) | % of rule-EJECT (469) |
| --- | --- | --- | --- | --- |
| False-secure (rule SECURE, physics EJECT) | 245 | 20.416666666666668 | 33.515731874145004 | — |
| False-eject (rule EJECT, physics CAPTURE) | 4 | 0.3333333333333333 | 0.5471956224350205 | 0.8528784648187633 |
| Total disagreements | 249 | 20.75 | — | — |

- False-eject cases are, by definition, outside the rule-SECURE subset. Column (b) for false-eject is computed as requested; the rule-EJECT denominator is added for reference.
- **249 / 1,200 reproduces: yes.**

Histogram of initial |ω| = √(wx² + wy² + wz²) for the 245 false-secure rows (bin 0.5 rad/s; min 3.3052840457427126, max 7.2059289283353):

```
[3.0, 3.5)    5 #####
[3.5, 4.0)   13 #############
[4.0, 4.5)   22 ######################
[4.5, 5.0)   39 #######################################
[5.0, 5.5)   43 ###########################################
[5.5, 6.0)   62 ##############################################################
[6.0, 6.5)   42 ##########################################
[6.5, 7.0)   15 ###############
[7.0, 7.5)    4 ####
```

Secondary check, same rule vs the coupled-rollout verdict (`coupledImpact().eject`) on all 1,200 rows (wall time 8.246621458053589 s for 1,200 rollouts, as logged in `taskC_misclass.txt`):

| Case | Count | % of 1,200 | % of rule-SECURE | % of rule-EJECT |
| --- | --- | --- | --- | --- |
| False-secure | 239 | 19.916666666666668 | 32.69493844049248 | — |
| False-eject | 3 | 0.25 | 0.4103967168262654 | 0.6396588486140725 |
| Total disagreements | 242 | — | — | — |

Coupled verdict equals the dataset `fireNowSecure` label on 1,191 of 1,200 rows.

---

## Task D — Coupled solver vs PINN timing

Raw: `reports/raw/taskD_timing.txt`. CPU Apple M1 (8 cores, 8.0 GB), Node v18.20.8, darwin arm64. No other Node workload from this session was running.

- Spins: 20 rows of `capture.json` drawn with `mulberry32(20261103)`. Indices: 291, 655, 935, 588, 571, 1043, 74, 882, 528, 594, 1083, 23, 518, 977, 249, 928, 116, 1174, 562, 741.
- Coupled path: `coupledImpact()` (`scripts/surrogate/physicsLib.mjs`). RK4 + XPBD net, H = 1/3000 s, launch at t = 0, ends at tContact + 0.25 s (loop cap 0.7 s).
- PINN path: `runSurrogateInference(wx, wy, wz, { includeTrace: true })` (`src/surrogate/inference.js`), the call made by `src/services/aiSurrogateEngine.js`. Loaded unmodified via `scripts/validation/jsonLoader.mjs`, which serves the Vite-style JSON imports to Node.
- Method: 1 untimed warm-up call per path with [1.5, 1.0, 0.5], then one `performance.now()`-timed call per spin per path, in 2 passes.

| Pass | Path | Mean (ms) | Median (ms) | Min (ms) | Max (ms) |
| --- | --- | --- | --- | --- | --- |
| 1 | Coupled | 7.3091 | 6.8949 | 6.6234 | 15.0320 |
| 1 | PINN | 0.4502 | 0.4294 | 0.3982 | 0.6056 |
| 2 | Coupled | 6.7118 | 6.6696 | 6.4490 | 7.0991 |
| 2 | PINN | 0.4030 | 0.3915 | 0.3777 | 0.4971 |

| Pass | mean(coupled) / mean(PINN) | median(coupled) / median(PINN) |
| --- | --- | --- |
| 1 | 16.237 | 16.058 |
| 2 | 16.653 | 17.036 |

The pass-1 coupled maximum (15.0320 ms) is the first timed spin (index 291). Per-spin values are in the raw file.

Related values measured in this session:

- `npm run check:surrogate` latency line: 0.375 ms (`reports/raw/check_run.txt`). This times `check.mjs`'s own `runFull()`, not `runSurrogateInference`.
- The value in `src/surrogate/metrics.json`, `coupledRolloutMsEstimate: 17`, is a literal set at `scripts/surrogate/train.mjs:508`. Measured coupled mean on this machine: 7.3091 ms (pass 1) and 6.7118 ms (pass 2).
- In the browser, `useSurrogate.js` replaces the `17` with the worker's `benchCoupled()` timing once a `benchmark_result` arrives (`useSurrogate.js:40–45`, benchmark kicked 800 ms after mount, `:98–105`). Before that result arrives, the fallback `17` is used (`aiSurrogateEngine.js:15`, `inference.js:251`). Browser timing: NOT MEASURED (no browser run in this session).

### Speedup and latency claim locations

Search: ripgrep, case-insensitive fixed strings, `--no-ignore` (so gitignored `dist/` and `.vercel/` are included). Excluded: `node_modules/`, `.git/`, `reports/`, `scripts/validation/`, `surrogate_verification_log.txt`. Raw: `reports/raw/taskD_grep.txt`.

Patterns with **no hits**: `14x`, `14×`, `40 ms`, `40ms`, `<2 ms vs`, `< 2 ms vs`, `17 ms`, `17ms`, `x faster`.

| File:line | Text |
| --- | --- |
| `scripts/surrogate/train.mjs:508` | `const coupledMsEstimate = 17` |
| `scripts/surrogate/train.mjs:535` | `latencyBudgetMs: 2,` |
| `scripts/surrogate/train.mjs:537` | `coupledRolloutMsEstimate: coupledMsEstimate,` |
| `scripts/surrogate/train.mjs:539` | `speedupVsCoupledEstimate: coupledMsEstimate / Math.max(latencyMs, 1e-6),` |
| `src/surrogate/metrics.json:26` | `"latencyBudgetMs": 2,` |
| `src/surrogate/metrics.json:28` | `"coupledRolloutMsEstimate": 17,` |
| `src/surrogate/metrics.json:30` | `"speedupVsCoupledEstimate": 1.5787365244858496,` (working tree; HEAD value `2.5506882082323443`) |
| `src/surrogate/inference.js:251` | `const coupledMs = opts.coupledMs ?? metricsJson.coupledRolloutMsEstimate ?? 17` |
| `src/surrogate/inference.js:253` | `const speedup = coupledMs / Math.max(latencyMs, 1e-6)` |
| `src/surrogate/inference.js:274` | `solverSpeedupFactor: speedup,` |
| `src/services/aiSurrogateEngine.js:15` | `let coupledMs = METRICS.coupledRolloutMsEstimate ?? 17` |
| `src/hooks/useSurrogate.js:64` | `result.solverSpeedupFactor = base.coupledMs / Math.max(result.inferenceLatencyMs, 1e-6)` |
| `src/hooks/useSurrogate.js:98` | `// Kick a benchmark once on mount so HUD speedup is live` |
| `src/services/cliCommands.js:257` | `` `speedup ${f3(p.solverSpeedupFactor)}× vs coupled ${f3(p.coupledRolloutMs)} ms (rigid ${f3(p.rigidRolloutMs)} ms)` `` |
| `src/services/telemetryExporter.js:43` | `['ai_speedup', '-'],` |
| `src/services/telemetryExporter.js:100` | `ai_speedup: ai ? r6(ai.solverSpeedupFactor) : '',` |
| `src/services/telemetryExporter.js:157` | `speedup_vs_coupled: surrogate.solverSpeedupFactor,` |
| `src/services/rosTelemetryNode.js:359` | `solver_speedup: r6(ai.solverSpeedupFactor),` |
| `src/components/TelemetryHUD.jsx:353` | `` <Metric label="SPEEDUP" value={`${fmt(p.solverSpeedupFactor, 1)}×`} /> `` |
| `src/components/TelemetryHUD.jsx:358–359` | "Held-out capture accuracy vs naive \|ωz₀\|>3 rule (…%). Latency and speedup re-measured in-browser. Strain head withheld from demo (held-out R² not useful yet)." |
| `README.md:34` | `aiSurrogateEngine.js PINN / MLP forward pass wrapper (measured latency & speedup)` |
| `README.md:54` | "**Every HUD number is measured**: inference latency, coupled/rigid rollout baselines (worker `benchmark`), held-out fidelity, and speedup. The naive “initial \|ωz\| > 3 ⇒ eject” rule is wrong on ~21% of random spins …" |
| `README.md:58` | `\| Latency \| full forward pass &lt; 2 ms \|` |
| `README.md:127` | `npm run check:surrogate  # latency < 2 ms + accuracy beats naive \|ωz\|>3 rule` |
| `scripts/surrogate/check.mjs:2` | ` * Gate: latency < 2 ms and held-out capture accuracy beats the naive \|ωz\|>3 rule.` |
| `scripts/surrogate/check.mjs:158` | `` console.log(`latency ${latencyMs.toFixed(3)} ms  budget 2 ms  ok=${latencyOk}`) `` |
| `scripts/surrogate/nn.mjs:177` | `/** Inference-only forward without cache (faster). */` |
| `dist/assets/index-CEHtkxbA.js:9` | Minified build of `metrics.json` fields (`coupledRolloutMsEstimate`, `speedupVsCoupledEstimate`, `latencyBudgetMs`) and `?? 17` fallbacks (gitignored build output, 2026-10-23) |
| `dist/assets/index-CEHtkxbA.js:10` | Minified `` `speedup ${…}× vs coupled ${…} ms (rigid …` `` (CLI string) |
| `dist/assets/index-CEHtkxbA.js:90` | Minified HUD `SPEEDUP` metric and "Latency and speedup re-measured in-browser." |

---

## Task E — Stale-claim scan

Same search settings and exclusions as Task D. Raw: `reports/raw/taskE_grep.txt`.

| Pattern | Hits |
| --- | --- |
| `21.1` | none |
| `ABAQUS` | none |
| `thesis simulation` | none |
| `my thesis` | none |
| `discovered` | none |
| `14x` | none |
| `40 ms` | none |
| `15+` | 1 |
| `published` | 1 |

| File:line | Surrounding text |
| --- | --- |
| `dist/assets/index-CEHtkxbA.js:69` | `` t.strokeStyle=`rgba(255,255,255,${.015+Math.random()*.03})` `` (minified canvas code; matches the substring `15+` in `.015+`) |
| `README.md:5` | "Physics runs in a WebWorker, telemetry is published on a ROS 2-style topic bus, and the net is rendered with a custom GLSL strain shader." |

---

## Task F — Reproducibility

### Dataset file hashes (SHA-256, `scripts/surrogate/data/`)

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `trajectories.bin` | 10819200 | `b794288469521126068c8311254ee438831257db058710147727b4425693e1d1` |
| `trajectories.meta.json` | 102 | `52156b234d541aa3eb9b3d26588d3b50659ba7062980f3c899a48f09596cb841` |
| `strain.json` | 739674 | `4375a5f65e210e465e23c5edbcab6bd1d71ffdfc0cfba85cb8190c7c91212fc7` |
| `capture.json` | 310012 | `0734478b6f55eabbd65ef2df5316940d42cbba05824156386165368fda6503c5` |
| `audit.json` | 1065 | `50988afa017e35c4c5deb8b577098cb8de35df9e21af50b405d7bf8d66eba6cd` |
| `summary.json` | 1348 | `a01e8cded2a794b3acb6a0f08d83d5f2161dc079f99a7a0b463ebeeb3c5991e8` |

Other hashes: `src/surrogate/weights.json` `74ef6b184399d9f24c60759652a82219b83caadc6521ddbcf4db50709cdf0321`.

Hashes were produced with 8 worker threads. `genData.mjs` splits the strain and capture rows by `os.cpus().length` (capped at 8), so a machine with a different core count assigns different seeds per worker. Byte-identity on such a machine: NOT MEASURED.

### Commands from a clean clone

```bash
git clone <repo-url> SpaceRobotsMS && cd SpaceRobotsMS
git checkout 0da6f6985d59467ff87709d93d339dd461a438dc   # then add scripts/validation/ from this note
npm ci                                                   # Node v18.20.8 used here

# Dataset (writes scripts/surrogate/data/, gitignored)
npm run gen:surrogate
(cd scripts/surrogate/data && shasum -a 256 trajectories.bin trajectories.meta.json strain.json capture.json audit.json summary.json)

# Surrogate gate (rewrites src/surrogate/metrics.json; uses committed weights.json)
npm run check:surrogate

# Task A
node scripts/validation/inertia.mjs
# Task B
node scripts/validation/axisSweep.mjs
# Task C (requires the dataset above)
node scripts/validation/misclass.mjs
# Task D timing (requires the dataset above)
node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/validation/timing.mjs
```

Validation script hashes (SHA-256):

| File | SHA-256 |
| --- | --- |
| `scripts/validation/inertia.mjs` | `e035942f446e609a70defc626067522e4cdf7fd69a2023f5f214fd769e31e042` |
| `scripts/validation/axisSweep.mjs` | `7c3f3cd2d3d5f9bb02152b590b087c17781b6fac6aa28dfb2314c94f1889a964` |
| `scripts/validation/misclass.mjs` | `26403fa2795cd61cc0b17aa6345738a3f307b979585d43c75880fbf43e1df143` |
| `scripts/validation/timing.mjs` | `6b8fd0d99cb1e9728f6abaa42f3ab48a2fb45ad5c6a71553ea324dd328403506` |
| `scripts/validation/jsonLoader.mjs` | `0e5ec70fa6c1f20441a107f9b57b3163ea47307dfff8090f1df17103f6330813` |

Not part of the commands above: `npm run train:surrogate` was not re-run in this session. The committed `weights.json` was used for all PINN numbers.
