# Parth's MS Thesis — Space Debris Capture Digital Twin (GNC Workbench v3)

Live: https://space-debris-sim.vercel.app

A browser-based GNC (guidance, navigation and control) workbench that simulates a non-cooperative, tumbling **12U CubeSat** in LEO being captured by a deployable **Kevlar 49 net**. Physics runs in a WebWorker, telemetry is published on a ROS 2-style topic bus, and the net is rendered with a custom GLSL strain shader.

## Physical ground truth

| Item | Value |
| --- | --- |
| Target | 12U CubeSat, 0.227 × 0.366 × 0.240 m, 30.0 kg |
| Inertia | Ix = 0.479, Iy = 0.273, Iz = 0.464 kg·m² (Z is the intermediate axis) |
| Net | 2.0 × 2.0 m Kevlar 49, 12 × 12 knots, E = 120 GPa, ρ = 1440 kg/m³, μ = 0.20 |
| Approach | 10.0 m/s relative, 3.0 m standoff |
| Instability law | \|ωz\| > 3.0 rad/s during contact ⇒ twist-out ejection |

## Architecture

```
src/
  physics/            pure, framework-free model code (shared by worker and UI)
    constants.js      thesis constants, presets, solver settings
    rigidBody.js      Euler equations, RK4, quaternion kinematics, polhode envelope
    netSolver.js      XPBD tension-only cable lattice, OBB contact, Coulomb friction
    netTopology.js    12×12 lattice, threads, triangles, masses
    stateLayout.js    Float32Array state schema shared by worker and main thread
  workers/
    physicsWorker.js  60 Hz loop, adaptive substeps, capture state machine
  services/
    rosTelemetryNode.js  ROS 2 pub/sub graph, QoS, rate estimation, rosbridge v2 link
    telemetryHistory.js  ring buffer feeding the canvas plots
    telemetryExporter.js JSON / CSV dataset export
    cliCommands.js       /cli command interpreter
    aiSurrogateEngine.js PINN / MLP forward pass wrapper (latency measured in-browser; speedup baseline from worker benchmark, 17 ms fallback until it completes)
  surrogate/
    mlp.js / inference.js / weights.json / metrics.json   browser Float32 surrogate
  shaders/
    stressShader.js   GLSL strain-to-colour material (lines, knots, membrane)
  hooks/
    useSimulation.js  worker lifecycle, telemetry fan-out, command API
    useSurrogate.js   ~10 Hz PINN inference + auto-fire arming
  components/         workbench UI (Canvas3D, Controls, TelemetryHUD, TopicMonitor,
                      InertiaTensor, TimeSeriesChart, CliTerminal, GNCWorkbench)
  scripts/surrogate/  offline dataset gen + pure-JS Adam training + check gate
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

### ROS 2 topics
| Topic | Type | Rate |
| --- | --- | --- |
| `/space_debris/cube_sat/odom` | `nav_msgs/msg/Odometry` | 60 Hz |
| `/space_debris/net/tension_mesh` | `std_msgs/msg/Float32MultiArray` (144 nodal strains) | 30 Hz |
| `/space_debris/gnc/capture_status` | `std_msgs/msg/String` (transient-local) | on change |
| `/space_debris/gnc/angular_momentum` | `geometry_msgs/msg/Vector3Stamped` | 60 Hz |
| `/space_debris/ai/surrogate` | `std_msgs/msg/String` (JSON payload) | on change (~10 Hz) |

The **ROS 2** tab shows live JSON, rates and QoS. Optional: connect to a real ROS 2 / Gazebo graph through `rosbridge_server` (default `ws://localhost:9090`).

### Stress shader
Per-knot strain drives the colour in the vertex shader: blue `#0284c7` below 5%, amber `#f59e0b` from 5–15%, crimson `#dc2626` (pulsing) above 15%.

## Using the workbench

- **Left panel**: body rates ω₀, scenarios S1–S4, time scale, net spec, Launch / Reset, Export JSON or CSV.
- **Viewport**: ISO / FRONT / SIDE / TOP / TRACK cameras; toggles for H·ω vectors (with herpolhode trace), body axes, grid, membrane.
- **Bottom dock**: live inertia tensor H = I·ω, energy plot (T, E_absorbed, J_net), and a switchable nutation / body-rate / quaternion plot.
- **Right panel**: AI, State, ROS 2, Model, Log tabs.
- **Top bar**: AI PREDICTOR ON/OFF; LEDs GNC_ACTIVE, BUS_CONNECTED, ROSBRIDGE, CONTACT, EJECT_ALERT, AI_SURROGATE.

Keyboard: `L` launch · `R` reset · `Space` pause · `1–4` scenarios · `V` cycle view · `/` open CLI.

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

## Exported dataset
JSON (`ps-msc.debris-capture.telemetry/v3`) or CSV with timestamps, quaternion, body rates, angular momentum, energies, nutation, position/velocity, enclosure, strain and capture status, plus AI prediction columns (`ai_*`) and the full model metadata / capture outcome.

## Status and limitations

- One-way coupling is the default and the capture verdict is rigid-body only: the body is integrated torque-free and the net sees it as an infinite-mass wall; the dataset label (`fireNowSecure`) is peak |ωz| of the torque-free body over the 0.25 s window.
- Strain head R² = −0.049 on its held-out split and is excluded from verdicts.
- Optimal-delay MAE 703 ms (PINN fire-schedule vs physics, 500 spins).
- PINN physics residual uses temporal finite differences (central difference of the network output at ±0.02 s), not autodiff.
- Ground truth is this solver, not experiment. No hardware or published-experiment comparison has been run.
- Two-way coupling (`coupledImpact(..., { coupling: 'two-way' })`, `NetSolver.twoWay`) is experimental: it is off by default, changes 3 of 1,200 reference verdicts (eject → capture, all within 0.024 rad/s of the threshold), and the net's XPBD projection does not conserve angular momentum exactly during impact (`reports/research_2026-11.md`, Phase 3).
- `speedupVsCoupledEstimate` in `src/surrogate/metrics.json` divides a hardcoded 17 ms by the training-time latency; the measured one-way coupled rollout on an Apple M1 is 6.7–7.5 ms mean (`reports/validation_2026-11.md` Task D, `reports/research_2026-11.md` Phase 3e).

## Development
```bash
npm install
npm run dev              # http://localhost:5173
npm run build
npm test                 # node:test — integrator, closed-form bound, coupling (tests/)
npm run check:physics    # headless RK4 / polhode / net sanity check
npm run check:surrogate  # latency < 2 ms + accuracy beats naive |ωz|>3 rule
# offline retrain (optional):
npm run gen:surrogate && npm run train:surrogate && npm run check:surrogate
```

## Modelling notes
- The net uses an equivalent woven-mesh axial stiffness E·A·η (η = 0.002) to represent knot slip and crimp straightening; yarn E = 120 GPa is reported in the HUD. η is adjustable with `set_param --eta`.
- After the instability law passes, a closure model drapes the mesh conformally over all six faces and a viscous restraint torque dissipates the spin (energy transfer).
- Approach is real-time scaled (default 0.2×) so the 0.3 s intercept is watchable.
