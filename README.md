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
  shaders/
    stressShader.js   GLSL strain-to-colour material (lines, knots, membrane)
  hooks/
    useSimulation.js  worker lifecycle, telemetry fan-out, command API
  components/         workbench UI (Canvas3D, Controls, TelemetryHUD, TopicMonitor,
                      InertiaTensor, TimeSeriesChart, CliTerminal, GNCWorkbench)
```

### Physics worker
- RK4 integration of the torque-free Euler equations plus `q̇ = ½ q ⊗ [0, ω]`, substep 333 µs.
- Energy and momentum drift are reported live (typically ~1e-14).
- The net is a tension-only XPBD cable lattice: threads resist stretch but go slack in compression, like a real net.
- Capture state machine: STANDBY → NET IN FLIGHT → CONTACT → (CLOSING → SECURED) or EJECTED.
- State is posted at 60 Hz as a transferable `Float32Array` (zero-copy).

### Instability law and prediction
During a 0.25 s contact window the worker tracks peak |ωz|. If it exceeds 3.0 rad/s the target twists out. The excess rotational energy ΔT_z = ½·Iz·(ωz² − 3²) gives an upper-bound ejection speed √(2ΔT_z/m).

Because Z is the intermediate axis, |ωz| can grow during a tumble. The workbench predicts the polhode peak |ωz| before launch:

| Scenario | ω₀ (rad/s) | Forecast | Result |
| --- | --- | --- | --- |
| S1 Cooperative | 0, 0, 0 | SECURE | SECURED, 100% enclosure |
| S2 Stable tumble | 1.5, 1.0, 0.5 | SECURE (peak 1.66) | SECURED, 100% enclosure |
| S3 High-spin Z | 0, 0, 4.2 | EJECT | EJECTED, peak 4.200 |
| S4 Coupled tumble | 3.0, 3.0, 2.5 | PHASE-DEP (peak 4.03) | EJECTED, peak ≈3.98 |

### ROS 2 topics
| Topic | Type | Rate |
| --- | --- | --- |
| `/space_debris/cube_sat/odom` | `nav_msgs/msg/Odometry` | 60 Hz |
| `/space_debris/net/tension_mesh` | `std_msgs/msg/Float32MultiArray` (144 nodal strains) | 30 Hz |
| `/space_debris/gnc/capture_status` | `std_msgs/msg/String` (transient-local) | on change |
| `/space_debris/gnc/angular_momentum` | `geometry_msgs/msg/Vector3Stamped` | 60 Hz |

The **ROS 2** tab shows live JSON, rates and QoS. Optional: connect to a real ROS 2 / Gazebo graph through `rosbridge_server` (default `ws://localhost:9090`).

### Stress shader
Per-knot strain drives the colour in the vertex shader: blue `#0284c7` below 5%, amber `#f59e0b` from 5–15%, crimson `#dc2626` (pulsing) above 15%.

## Using the workbench

- **Left panel**: body rates ω₀, scenarios S1–S4, time scale, net spec, Launch / Reset, Export JSON or CSV.
- **Viewport**: ISO / FRONT / SIDE / TOP / TRACK cameras; toggles for H·ω vectors (with herpolhode trace), body axes, grid, membrane.
- **Bottom dock**: live inertia tensor H = I·ω, energy plot (T, E_absorbed, J_net), and a switchable nutation / body-rate / quaternion plot.
- **Right panel**: State, ROS 2, Model, Log tabs.
- **Top bar LEDs**: GNC_ACTIVE, BUS_CONNECTED, ROSBRIDGE, CONTACT, EJECT_ALERT.

Keyboard: `L` launch · `R` reset · `Space` pause · `1–4` scenarios · `V` cycle view · `/` open CLI.

### CLI
```
set_spin --z 4.2          preset S3            launch_net
reset                     pause / resume        time_scale 0.5
predict                   status                set_param --eta 0.002
export_telemetry --format csv
show_topics               ros2 topic echo /space_debris/cube_sat/odom
ros2 topic hz <topic>     ros2 bridge connect ws://localhost:9090
view track                help                  clear
```

## Exported dataset
JSON (`ps-msc.debris-capture.telemetry/v3`) or CSV with timestamps, quaternion, body rates, angular momentum, energies, nutation, position/velocity, enclosure, strain and capture status, plus the full model metadata and capture outcome.

## Development
```bash
npm install
npm run dev            # http://localhost:5173
npm run build
npm run check:physics  # headless RK4 / polhode / net sanity check
```

## Modelling notes
- The net uses an equivalent woven-mesh axial stiffness E·A·η (η = 0.002) to represent knot slip and crimp straightening; yarn E = 120 GPa is reported in the HUD. η is adjustable with `set_param --eta`.
- After the instability law passes, a closure model drapes the mesh conformally over all six faces and a viscous restraint torque dissipates the spin (energy transfer).
- Approach is real-time scaled (default 0.2×) so the 0.3 s intercept is watchable.
