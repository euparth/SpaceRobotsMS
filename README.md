# Space Debris Capture Simulator (v1.0)

Live: https://space-debris-sim.vercel.app

DOI (concept, always the latest version): [10.5281/zenodo.23973367](https://doi.org/10.5281/zenodo.23973367)

A browser-based GNC (guidance, navigation and control) workbench that simulates a non-cooperative, tumbling **12U CubeSat** in LEO being captured by a deployable **Kevlar 49 net**. Physics runs in a Web Worker, telemetry is published on an in-browser ROS 2-style topic bus (same topic names and message types; no ROS 2 process is involved), and the net is rendered with a GLSL strain shader.

## Physical ground truth

| Item | Value |
| --- | --- |
| Target | 12U CubeSat, 0.227 × 0.366 × 0.240 m, 30.0 kg |
| Inertia | Ix = 0.479, Iy = 0.273, Iz = 0.464 kg·m² (Z is the intermediate axis) |
| Net | 2.0 × 2.0 m Kevlar 49, 12 × 12 knots, E = 120 GPa, ρ = 1440 kg/m³, μ = 0.20 |
| Approach | 10.0 m/s relative, 3.0 m standoff |
| Instability law | \|ωz\| > 3.0 rad/s during contact ⇒ twist-out ejection (modelling choice; see Status and limitations) |

## Architecture

Data flow between the five parts (one browser tab, no server):

```
                 commands (set_param, launch, preset, coupling …)
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  ▼
┌─┴──────────────┐  Float32Array state, 60 Hz, transferable  ┌──────────────────────┐
│  UI (React)    │◄──────────────────────────────────────────│  physicsWorker.js    │
│  GNCWorkbench  │                                           │  RK4 torque-free     │
│  Canvas3D      │                                           │  Euler + quaternion  │
│  Controls/HUD  │                                           │  capture state       │
│  Polhode / MC  │                                           │  machine, verdicts   │
│  MethodsPage   │                                           └──────────┬───────────┘
└─┬───────┬──────┘                                                      │ per substep
  │       │ ω₀ at 10 Hz (main thread, weights loaded lazily)            ▼
  │       ▼                                                   ┌──────────────────────┐
  │  ┌──────────────────────┐                                 │  netSolver.js        │
  │  │  surrogate/          │   same weights.json, same       │  XPBD tension-only   │
  │  │  inference.js (MLP)  │◄── runSurrogateInference ───────│  lattice, OBB        │
  │  └──────────────────────┘   in worker (verdict "PINN")    │  contact, friction,  │
  │                                                           │  one-/two-way        │
  │  telemetry snapshots                                      │  reaction            │
  ▼                                                           └──────────────────────┘
┌────────────────────────────────┐        ┌───────────────────────────────────────────┐
│  rosTelemetryNode.js           │        │  monteCarloWorker.js × min(8, cores)      │
│  in-browser topic bus          │        │  priors.js → captureLabel.js → envelope   │
│  (/debris/*, QoS, rates),      │        │  → inference.js; fixed 8-way chunk split  │
│  telemetryHistory ring buffer, │        │  identical to scripts/surrogate/genData   │
│  telemetryExporter JSON/CSV    │        └───────────────────────────────────────────┘
└────────────────────────────────┘
```

The physics modules under `src/physics/` are pure and framework-free; the worker, the Monte Carlo
workers, the Node validation scripts and the tests import the same files, so a number shown in the
UI and a number in `reports/` come from one code path.

```
src/
  physics/            pure model code (shared by workers, UI, scripts and tests)
    constants.js      body, net, capture and solver constants; presets S1–S5
    rigidBody.js      Euler equations, RK4, quaternion kinematics
    envelope.js       closed-form max |ωz| on the polhode (LP branches a=0 / b=0)
    polhode.js        sampled polhode curve for the 3D/2D view
    captureLabel.js   peakWzInContactWindow — the dataset label path
    priors.js         mulberry32, spin priors, planChunks (8-way dataset split)
    monteCarlo.js     per-row verdicts (rule / envelope / PINN vs label)
    monteCarloStats.js confusion tables, histogram, summary, CSV
    momentum.js       body + net momentum budget (two-way coupling check)
    netSolver.js      XPBD tension-only cable lattice, OBB contact, Coulomb friction
    netTopology.js    12×12 lattice, threads, triangles, masses
    stateLayout.js    Float32Array state schema shared by worker and main thread
  workers/
    physicsWorker.js    60 Hz loop, adaptive substeps, capture state machine
    monteCarloWorker.js one chunk of the in-browser Monte Carlo
  services/
    rosTelemetryNode.js  in-browser ROS 2-style pub/sub graph, QoS, rate estimation; rosbridge v2 client (NOT MEASURED)
    telemetryHistory.js  ring buffer feeding the canvas plots
    telemetryExporter.js JSON / CSV dataset export
    cliCommands.js       /cli command interpreter
    aiSurrogateEngine.js MLP forward-pass wrapper for the UI thread (weights loaded on demand)
  surrogate/
    mlp.js / inference.js / weights.json / metrics.json   browser Float32 surrogate
  methods/
    measured.js / limitations.js   values quoted on /methods, each with its source report
  shaders/
    stressShader.js   GLSL strain-to-colour material (lines, knots, membrane)
  hooks/
    useSimulation.js  worker lifecycle, telemetry fan-out, command API
    useSurrogate.js   ~10 Hz inference + auto-fire arming
    useMonteCarlo.js  worker pool over planChunks
  components/         workbench UI (Canvas3D, Controls, TelemetryHUD, VerdictsPanel, PolhodeView,
                      MonteCarloPanel, TopicMonitor, CliTerminal, MethodsPage, GNCWorkbench)
scripts/
  surrogate/          dataset generation (genData.mjs), pure-JS Adam training, check gate
  validation/         inertia, axis sweep, misclassification, timing   → reports/validation_2026-11.md
  research/           integrator drift, priors, two-way coupling, presets → reports/research_2026-11.md
tests/                node:test suites run by `npm test`
e2e/                  Playwright smoke test run by `npm run test:e2e`
```

### PINN AI surrogate
The workbench ships a small **physics-informed MLP** (no ONNX, no torch) that answers, for the live ω₀:

1. Will a net fired **now** secure the target or lose it to twist-out?
2. How hard is the net loaded at impact (peak strain % + tension N)?
3. What is the best fire delay (nutation-sync)?

Training uses RK4 trajectories (data + Euler residual + energy/|H| conservation) plus a peak-|ωz| head and a strain head. Labels come from the same physics modules as the live worker. The naive “initial |ωz| > 3 ⇒ eject” rule is wrong on 20.8% (249/1,200 seeded rollouts; 15.0–22.6% across held-out splits) of random spins (Z is intermediate, so |ωz| can grow — S4 starts at 2.5 and ejects); the surrogate must beat that baseline (`npm run check:surrogate`). Measured values: `reports/validation_2026-11.md`, `reports/research_2026-11.md`.

| Gate | Criterion |
| --- | --- |
| Latency | full forward pass &lt; 2 ms |
| Fidelity | held-out fire-now accuracy &gt; naive |ωz₀|&gt;3 rule |

UI: **AI** tab (feasibility, Arm auto-fire, strain band, ωz(t) chart, benchmark), top-bar **AI PREDICTOR ON/OFF** + `AI_SURROGATE` LED, viewport neural line + contact ring (AI layer), CLI `ai status | fire | toggle`.

### Physics worker
- RK4 integration of the torque-free Euler equations plus `q̇ = ½ q ⊗ [0, ω]`, substep 333 µs.
- Energy and |H| drift are reported live. Measured offline over 10 s at H = 1/3000 s on 50 seeded spins: max relative drift 2.3215e-14 (|H|) and 4.5516e-14 (T) (`reports/research_2026-11.md`, Phase 1a).
- The net is a tension-only XPBD cable lattice: threads resist stretch but go slack in compression, like a real net.
- Capture state machine: STANDBY → NET IN FLIGHT → CONTACT → (CLOSING → SECURED) or EJECTED.
- State is posted at 60 Hz as a transferable `Float32Array` (zero-copy).

### Instability law and prediction
During a 0.25 s contact window the worker tracks peak |ωz|. If it exceeds 3.0 rad/s the target twists out. The excess rotational energy ΔT_z = ½·Iz·(ωz² − 3²) gives an upper-bound ejection speed √(2ΔT_z/m).

Because Z is the intermediate axis, |ωz| can grow during a tumble. The workbench predicts the polhode peak |ωz| before launch. Headless values (`node scripts/research/phase4_presets.mjs`, `reports/research_2026-11.md` Phase 4):

| Scenario | ω₀ (rad/s) | Closed-form max \|ωz\| | `predictOutcome` | Window peak \|ωz\|, fire now | Coupled rollout (one-way) |
| --- | --- | --- | --- | --- | --- |
| S1 Cooperative | 0, 0, 0 | 0.000000 | SECURE | 0.000000 | capture, peak 0.000000 |
| S2 Stable tumble | 1.5, 1.0, 0.5 | 1.659865 | SECURE | 0.845196 | capture, peak 0.833099 |
| S3 High-spin Z | 0, 0, 4.2 | 4.200000 | EJECT | 4.200000 | eject, peak 4.200000 |
| S4 Coupled tumble | 3.0, 3.0, 2.5 | 4.033684 | PHASE_DEPENDENT | 3.924574 | eject, peak 3.908242 |

Live-worker end states (SECURED / EJECTED, enclosure after closure) are not produced by the headless scripts and are not reported here.

### ROS 2-style topics
| Topic | Type | Rate |
| --- | --- | --- |
| `/space_debris/cube_sat/odom` | `nav_msgs/msg/Odometry` | 60 Hz |
| `/space_debris/net/tension_mesh` | `std_msgs/msg/Float32MultiArray` (144 nodal strains) | 30 Hz |
| `/space_debris/gnc/capture_status` | `std_msgs/msg/String` (transient-local) | on change |
| `/space_debris/gnc/angular_momentum` | `geometry_msgs/msg/Vector3Stamped` | 60 Hz |
| `/space_debris/ai/surrogate` | `std_msgs/msg/String` (JSON payload) | on change (~10 Hz) |

The **ROS 2** tab shows live JSON, rates and QoS of the in-browser graph. A rosbridge v2 client (`ros2 bridge connect ws://localhost:9090`, or the Connect button on the tab) advertises and publishes these topics with the rosbridge_suite protocol. **NOT MEASURED**: it has not been run against a live `rosbridge_server` in this release, so interoperability with a real ROS 2 graph is unverified. There is no Gazebo integration.

### Stress shader
Per-knot strain drives the colour in the vertex shader: blue `#0284c7` below 5%, amber `#f59e0b` from 5–15%, crimson `#dc2626` (pulsing) above 15%.

## Using the workbench

- **Left panel**: body rates ω₀, scenarios S1–S5, time scale, net→body coupling (one-way default / two-way experimental, drawstring on/off, ΔP and ΔL readouts), net spec, Launch / Reset, Export JSON or CSV.
- **Viewport**: ISO / FRONT / SIDE / TOP / TRACK cameras; toggles for H·ω vectors (with herpolhode trace), body axes, grid, membrane.
- **Bottom dock**: live inertia tensor H = I·ω, energy plot (T, E_absorbed, J_net), and a switchable nutation / body-rate / quaternion plot.
- **Right panel**: Verdicts, PINN, MC (Monte Carlo), State, ROS 2, Model, Log tabs.
- **Top bar**: AI PREDICTOR ON/OFF; LEDs GNC_ACTIVE, BUS_CONNECTED, ROSBRIDGE, CONTACT, EJECT_ALERT, AI_SURROGATE.

Keyboard: `L` launch · `R` reset · `Space` pause · `1–5` scenarios · `V` cycle view (ISO / FRONT / SIDE / TOP / TRACK / POLHODE) · `/` open CLI.

### CLI
```
set_spin --z 4.2          preset S3            launch_net
reset                     pause / resume        time_scale 0.5
predict                   status                set_param --eta 0.002
ai status | fire | toggle
export_telemetry --format csv
show_topics               ros2 topic echo /space_debris/cube_sat/odom
ros2 topic hz <topic>     ros2 bridge connect ws://localhost:9090
view track                help                  clear
```

## Methods and verification

The in-app page [`/methods`](https://space-debris-sim.vercel.app/methods) (source `src/components/MethodsPage.jsx`, values in `src/methods/measured.js`) states the model, the verification runs, the results, the limitations and the reproduction commands, each with the report and raw file it was read from. Summary:

- **Model**: torque-free Euler equations + quaternion kinematics, RK4 at H = 1/3000 s; Ix = 0.479, Iy = 0.273, Iz = 0.464 kg·m² (z intermediate); tension-only XPBD net, 12 × 12 knots, 264 constraints, EA·η with η = 0.002, μ = 0.20; verdict = max |ωz| over the 0.25 s contact window ≤ 3.0 rad/s. Dataset: 1,200 `capture.json` rows, seeds 777001 + 9973·c over 8 workers, SHA-256 `0734478b…6503c5`. Prior: `uniform-box`, each component uniform on [0, 5) rad/s (`src/physics/priors.js`).
- **Verification** (`reports/research_2026-11.md`): relative drift over 10 s at H ≤ 2.3215e-14 (|H|) and 4.5516e-14 (T) on 50 spins; observed order of convergence 4.00 on the coarse sweep (15 H → 150 H), round-off at H; closed-form bound vs 20 s numeric peak within 1.56e-7 rad/s with no row over 1e-3; single-axis sweep z 3.0 capture / 3.5 eject; two-way coupling with the drawstring off closes |ΔP_total| to 2.5e-12 N·s and leaves |ΔL_total| 3.2e-2 N·m·s; coupled rollout 6.7–7.5 ms mean, PINN 0.40–0.45 ms (Apple M1, Node v18.20.8).
- **Results**: four-prior table (uniform-box 731 rule-secure / 245 false-secure / 4 false-eject; log-uniform-mag 1165 / 7 / 4; slow and moderate 1200 / 0 / 0), physics-limited 340 and window-limited 99 rows. The 20.75 % disagreement on the default dataset is a property of its prior and is not an operational failure rate.
- **Limitations**: the "Status and limitations" list below, plus the XPBD angular-momentum residual (≈1 % of |L|) and the 8-worker seed dependence of the dataset.
- **Provenance**: built October–November 2026. The author's 2023 M.Sc. thesis (TH OWL) reviewed Shin et al.'s ABAQUS net-capture study; this simulator is an independent re-implementation of that scenario. The git commit and tag are injected at build time (`vite.config.js`) and shown in the header and on `/methods`. Concept DOI (always the latest version): [10.5281/zenodo.23973367](https://doi.org/10.5281/zenodo.23973367). Developed with AI assistance. Cursor was the coding and testing partner; Gemini was used for background research and other secondary tasks; Claude was used for review, the project landing page, and drafting documentation. The author specified the research questions and reviewed the results; numbers come from the committed scripts and tests.

See `LICENSE` (MIT, confirmed by Parth Sharma), `CITATION.cff`, `CHANGELOG.md`, and `CONTRIBUTING.md`.

## Exported dataset
JSON (`ps-msc.debris-capture.telemetry/v3`) or CSV with timestamps, quaternion, body rates, angular momentum, energies, nutation, position/velocity, enclosure, strain and capture status, plus AI prediction columns (`ai_*`) and the full model metadata / capture outcome.

## Status and limitations

- Shin et al. (2023) tested z-spin at 0.1, 0.5, 1, 2, 3 and 5 rad/s: capture succeeded at 0.1–1 rad/s, was incomplete at 2 and 3 rad/s, and failed at 5 rad/s, with nothing tested between 3 and 5 rad/s. The 3.0 rad/s limit is a modelling choice, not a threshold reported by Shin et al., and "secure" means no predicted rebound, not full encapsulation.
- One-way coupling is the default and the capture verdict is rigid-body only: the body is integrated torque-free and the net sees it as an infinite-mass wall; the dataset label (`fireNowSecure`) is peak |ωz| of the torque-free body over the 0.25 s window.
- Strain head R² = −0.049 on its held-out split and is excluded from verdicts.
- Optimal-delay MAE 703 ms (PINN fire-schedule vs physics, 500 spins).
- PINN physics residual uses temporal finite differences (central difference of the network output at ±0.02 s), not autodiff.
- Ground truth is this solver, not experiment. No hardware or published-experiment comparison has been run.
- Two-way coupling (`coupledImpact(..., { coupling: 'two-way' })`, `NetSolver.twoWay`) is experimental: it is off by default, changes 3 of 1,200 reference verdicts (eject → capture, all within 0.024 rad/s of the threshold), and the net's XPBD projection does not conserve angular momentum exactly during impact (`reports/research_2026-11.md`, Phase 3).
- `speedupVsCoupledEstimate` in `src/surrogate/metrics.json` divides a hardcoded 17 ms by the training-time latency; the measured one-way coupled rollout on an Apple M1 is 6.7–7.5 ms mean (`reports/validation_2026-11.md` Task D, `reports/research_2026-11.md` Phase 3e).

Sensitivity of the default dataset (n = 1,200) to the limit, with only the limit changed (`scripts/research/limit_sensitivity.mjs`, raw `reports/raw/research/limit_sensitivity.txt`):

| Limit (rad/s) | Label secure | Rule secure | Rule false-secure | % of rule-secure | Rule false-eject | Envelope secure | Envelope false-secure | Envelope false-eject |
|---|---|---|---|---|---|---|---|---|
| 1.0 | 72 | 251 | 179 | 71.3147 | 0 | 46 | 0 | 26 |
| 2.0 | 248 | 487 | 240 | 49.2813 | 1 | 185 | 0 | 63 |
| 3.0 | 490 | 731 | 245 | 33.5157 | 4 | 391 | 0 | 99 |
| 4.0 | 750 | 972 | 228 | 23.4568 | 6 | 644 | 0 | 106 |

## Development
```bash
npm install
npm run dev              # http://localhost:5173
npm run build
npm test                 # node:test — integrator, closed-form bound, polhode, Monte Carlo parity, coupling, methods (tests/)
npm run test:e2e         # Playwright smoke test against `vite preview` (needs `npx playwright install chromium`)
npm run check:physics    # headless RK4 / polhode / net sanity check
npm run check:surrogate  # latency < 2 ms + accuracy beats naive |ωz|>3 rule
# offline retrain (optional):
npm run gen:surrogate && npm run train:surrogate && npm run check:surrogate
```

## Modelling notes
- The net uses an equivalent woven-mesh axial stiffness E·A·η (η = 0.002) to represent knot slip and crimp straightening; yarn E = 120 GPa is reported in the HUD. η is adjustable with `set_param --eta`.
- After the instability law passes, a closure model drapes the mesh conformally over all six faces and a viscous restraint torque dissipates the spin (energy transfer).
- Approach is real-time scaled (default 0.2×) so the 0.3 s intercept is watchable.
