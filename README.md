# Parth's MS Thesis — 3D Space Debris Capture Simulator

Interactive WebGL simulator of a **non-cooperative tumbling 12U CubeSat** in Low Earth Orbit being captured by a **deployable Kevlar 49 space net**. Built with Vite, React, Three.js, and Tailwind CSS.

## Research question modeled

Can a planar Kevlar 49 net wrap and restrain a 12U debris target whose body-rate vector is user-specified? The simulator encodes a **twist-out instability rule** on the Z-axis spin:

- If **ωz ≤ 3.0 rad/s**, the net wraps conformally around all edges. Status becomes **SECURED** and enclosure reaches **100%**.
- If **ωz > 3.0 rad/s**, rotational kinetic energy overpowers net tensile restraint. The satellite twists out of the weave and is ejected. Status becomes **FAILED - TARGET EJECTED**, with a critical HUD banner: `CRITICAL INSTABILITY: Z-SPIN > 3.0 RAD/S (TWIST-OUT EJECTION)`.

## Target and net specifications

**12U CubeSat (debris target)**

- Dimensions: 0.227 m × 0.366 m × 0.240 m (visually scaled for the viewport)
- Mass: 30.0 kg
- Real-time rigid-body tumble from Euler rates **ωx, ωy, ωz** in **[0.0, 5.0] rad/s**
- Rotational kinetic energy uses a box inertia tensor for the 30 kg body

**Kevlar 49 capture net**

- Planar grid **2.0 m × 2.0 m**, **12×12 mass-spring nodes**, four corner lumped masses
- Displayed as golden/yellow wireframe mesh
- Material labels: Young’s modulus **E = 120 GPa**, density **ρ = 1440 kg/m³**, friction **μ = 0.20**
- Relative launch / approach speed **10.0 m/s** toward the target (time-dilated for visualization)

## How a capture run works

1. Operator sets body rates with sliders or a preset, then clicks **Launch Capture Net**.
2. Corner masses expand the mesh toward 2 m × 2 m while the sheet flies at the CubeSat.
3. On contact, nodes drape around the rigid box. If ωz is within the 3.0 rad/s envelope, the net cinches and locks to the satellite (SECURED). If ωz is above the limit, spin kicks the weave off and the target translates away (FAILED).
4. **Reset** remounts the scene and restores STANDBY.

Presets:

- Cooperative (0 rad/s)
- Stable Tumbling (X=1.5, Y=1.0, Z=0.5)
- Unstable High-Spin (Z=4.2 rad/s)

## User interface

- Full-screen Three.js viewport: starfield, Earth limb, chaser craft, tumbling CubeSat, deforming net
- Left glassmorphic **Capture Control** panel: ω sliders, presets, launch, reset, material/approach readout
- Right **Telemetry** HUD: live spin rates, enclosure %, energy-transfer meters, Kevlar 49 spec card, critical instability banner
- Dark space styling: `backdrop-blur-md bg-slate-900/80 border border-slate-700/50`

## Project structure

```
index.html
src/main.jsx
src/App.jsx                      Root state: rates, launch, reset, telemetry
src/index.css                    Tailwind + dark-space HUD styles
src/components/Canvas3D.jsx      Lighting, skybox, CubeSat, mass-spring net, capture physics
src/components/Controls.jsx      Left control panel
src/components/TelemetryHUD.jsx  Right telemetry HUD
```

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL (default `http://localhost:5173/`).

```bash
npm run build    # production bundle
npm run preview  # preview the build
```

## Implementation notes

- Net dynamics: mass-spring cloth (structural + shear springs) with box collision and a wrap/drape mapping onto the CubeSat after contact.
- Stiffness used in the real-time integrator is scaled down from 120 GPa so the 144-node mesh stays stable at interactive frame rates; HUD still reports the physical Kevlar 49 constants.
- Approach is time-dilated so a 10 m/s intercept is watchable in a few seconds.
- OrbitControls allow inspecting the capture from any angle.
