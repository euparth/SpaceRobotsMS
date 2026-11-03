# Research note — 2026-11

Branch `research/nov-2026`, base tag `validation-2026-11` = `0da6f6985d59467ff87709d93d339dd461a438dc`.
Reference report: `reports/validation_2026-11.md`. Raw outputs for every table below: `reports/raw/research/`.

| Item | Value |
| --- | --- |
| Machine | Apple M1, 8 cores, 8.0 GB, macOS 27.0.1, darwin arm64 |
| Node / npm | v18.20.8 / 10.8.2 |
| Date | 2026-11-03 (IST) |
| Reference dataset SHA-256 (unchanged throughout) | `capture.json 0734478b6f55eabbd65ef2df5316940d42cbba05824156386165368fda6503c5`, `strain.json 4375a5f65e210e465e23c5edbcab6bd1d71ffdfc0cfba85cb8190c7c91212fc7`, `trajectories.bin b794288469521126068c8311254ee438831257db058710147727b4425693e1d1`, `summary.json a01e8cded2a794b3acb6a0f08d83d5f2161dc079f99a7a0b463ebeeb3c5991e8`, `audit.json 50988afa017e35c4c5deb8b577098cb8de35df9e21af50b405d7bf8d66eba6cd`, `trajectories.meta.json 52156b234d541aa3eb9b3d26588d3b50659ba7062980f3c899a48f09596cb841` |
| `src/surrogate/weights.json` | not modified; SHA-256 `74ef6b184399d9f24c60759652a82219b83caadc6521ddbcf4db50709cdf0321` |

Commits on the branch (one per phase, preceded by one commit that adds the reference artifacts):

| Commit | Message |
| --- | --- |
| `9bfff91` | validation-2026-11 artifacts (reference state for research/nov-2026) |
| `f15c0bc` | PHASE 1 — Integrator verification |
| `4aef039` | PHASE 2 — Spin prior sensitivity |
| `8487b87` | PHASE 3 — Two-way net–body coupling |
| (HEAD) | PHASE 4 — Repository truth pass (this file) |

Working-tree files not part of this work and left unstaged: `src/components/Controls.jsx`, `src/components/GNCWorkbench.jsx`, `src/components/ui.jsx`, `tailwind.config.js`, `src/surrogate/metrics.json`, `surrogate_verification_log.txt`.

---

## Phase 1 — Integrator verification (rigid body only)

Script: `node scripts/research/phase1_integrator.mjs` → `reports/raw/research/phase1_integrator.txt`.
Spins: 50 rows of `capture.json` selected with `mulberry32(20261103)` (indices listed in the raw file; the first 20 equal the Task D timing spins of the validation report). Integrator: `rk4Step` from `src/physics/rigidBody.js`, damping 0, H = 1/3000 s. Ix = 0.479, Iy = 0.273, Iz = 0.464.

### 1a. Drift over 10 s at H (30,000 steps per run)

Drift = max over all steps of |X(t) − X(0)| / X(0); then max and median across the 50 runs.

| Quantity | Max | Median |
| --- | --- | --- |
| Relative drift of \|H\| | 2.3215137374052146e-14 | 6.7332657660996924e-15 |
| Relative drift of T | 4.5516287415555136e-14 | 1.4015808879954622e-14 |

### 1b. Convergence vs the H/8 run at t = 0.30 s and t = 0.55 s

Error = max over the 50 spins of |ω_h(t) − ω_{H/8}(t)| (Euclidean norm of the three body rates).

| Step | max \|Δω\| at t = 0.30 | max \|Δω\| at t = 0.55 |
| --- | --- | --- |
| H | 6.358079669841418e-14 | 1.0627682028332764e-13 |
| H/2 | 5.837197499550496e-14 | 1.0442236284636273e-13 |
| H/4 | 8.233873835987336e-14 | 1.209423784477881e-13 |

Observed order from these three levels: log2(e_H / e_{H/2}) = 0.123 (t = 0.30), 0.025 (t = 0.55); log2(e_{H/2} / e_{H/4}) = −0.496, −0.212. At H and below the error is at double-precision round-off (~1e-13), so the order of convergence is **not observable** from this set.

Supplementary coarse sweep (same 50 spins, same H/8 reference; multiples chosen so that 0.30 s = 900 H and 0.55 s = 1650 H are integer step counts):

| Step | max \|Δω\| t = 0.30 | max \|Δω\| t = 0.55 | order vs previous row, t = 0.30 | order, t = 0.55 |
| --- | --- | --- | --- | --- |
| 15 H (0.005 s) | 2.18742905519124e-10 | 3.607873258249057e-10 | — | — |
| 30 H (0.01 s) | 3.5031686307520833e-9 | 5.7752240147324e-9 | 4.0014 | 4.0007 |
| 75 H (0.025 s) | 1.3720746505305003e-7 | 2.2584592378888001e-7 | 4.0029 | 4.0012 |
| 150 H (0.05 s) | 2.204879714230919e-6 | 3.6200559812965396e-6 | 4.0063 | 4.0026 |

Order = log(e/e_prev) / log(h/h_prev). Observed order of convergence: 4.00 on the coarse sweep, consistent with RK4; at the production step the error is below round-off.

### 1c. Closed-form infinite-horizon bound on |ω_z|

Derivation (`scripts/research/closedForm.mjs`): with a = ω_x², b = ω_y², c = ω_z² ≥ 0, the two invariants
2T = Ix a + Iy b + Iz c and H² = Ix² a + Iy² b + Iz² c are linear in (a, b, c). Maximising c subject to a ≥ 0, b ≥ 0 is a one-dimensional linear programme whose optimum lies on a boundary a = 0 or b = 0:

- a = 0: c = (H² − 2T·Iy) / (Iz (Iz − Iy)), feasible if c ≥ 0 and b = (2T − Iz c)/Iy ≥ 0
- b = 0: c = (H² − 2T·Ix) / (Iz (Iz − Ix)), feasible if c ≥ 0 and a = (2T − Iz c)/Ix ≥ 0

Bound = max(|ω_z0|, √c over feasible candidates). Exactly one branch is feasible for a polhode that encircles the x- or y-axis. The implementation is independent of `rigidBody.polhodeEnvelope()`; max |difference| over the 1,200 rows = **0**.

Results over all 1,200 `capture.json` rows (window peak = `peakWzInContactWindow(ω, 0)`, the dataset label path; it matched the stored `peak0` field on every row):

| Count | Value |
| --- | --- |
| Rule SECURE (\|ω_z0\| ≤ 3) | 731 |
| Closed-form max > 3 | 809 |
| Physics-limited: rule SECURE and closed-form max > 3 | **340** |
| Window-limited: closed-form max > 3 and window peak ≤ 3 (would eject with a later arrival) | **99** |

Discrepancy checks:

| Check | Value |
| --- | --- |
| max(window peak − closed-form bound) over 1,200 rows | 0 (numeric never exceeds the bound) |
| Numeric peak over 20 s at H vs bound: max(longPeak − bound) | 4.3520742565306136e-14 |
| max(bound − longPeak) over 20 s | 1.5609692294304978e-7 |
| Rows with bound − longPeak > 1e-3 | 0 |
| bound − longPeak percentiles | p50 2.598e-10, p90 3.499e-9, p99 4.186e-8 |
| Time of the 20 s numeric peak | p50 9.3255 s, max 19.999 s |

The largest discrepancy that is not attributable to the finite 0.25 s window is 1.56e-7 rad/s, which is the sampling resolution of the peak (the trajectory is sampled every H and the true maximum falls between samples). Nothing else remains unexplained. Window-limited rows (99) are entirely attributable to the finite window: their bound is reached at a later time on the polhode (median time to peak 9.3 s vs a window ending at 0.55 s).

### 1d. Tests

`npm test` runs `node --test tests/`. `tests/integrator.test.mjs`: drift < 1e-12 over 10 s (1a); fine-step error < 1e-11 and coarse-step order in (3, 5) using 75 H / 150 H (1b); closed form equals `polhodeEnvelope` to 1e-12 and bounds the 20 s numeric peak within 1e-5 on four spins plus the S1–S4 presets (1c); candidate-feasibility check. Output: `reports/raw/research/phase1_npm_test.txt` (4/4 pass).

---

## Phase 2 — Spin prior sensitivity

### 2a. Current default sampling (quoted)

`scripts/surrogate/physicsLib.mjs`:

```js
export function sampleOmega(rng, max = MAX_RATE) {
  return [rng() * max, rng() * max, rng() * max]
}
```

with `MAX_RATE = 5.0` (`src/physics/constants.js`). Before this phase, `genData.mjs` called `sampleOmega(rng)` in the capture worker; it now calls `samplePrior(rng, OPTS.prior)` where `samplePrior(rng, 'uniform-box')` returns `sampleOmega(rng, MAX_RATE)` (same function, same rng draws). Each component is therefore uniform on [0, 5) rad/s, positive octant only. Measured on the reference set: mean |ω| 4.818759, min 0.488718, max 8.224481 rad/s.

New option (`node scripts/surrogate/genData.mjs --only capture --prior <name> --out <dir>`), implemented in `scripts/surrogate/priors.mjs`:

| Prior | |ω| | Direction |
| --- | --- | --- |
| `uniform-box` (default) | implied by the box | positive octant |
| `log-uniform-mag` | log-uniform on [0.05, 5] | isotropic (cos θ uniform on [−1, 1], φ uniform on [0, 2π)) |
| `slow` | uniform on [0, 1] | isotropic |
| `moderate` | uniform on [1, 3] | isotropic |

### 2b. Generation

`reports/raw/research/phase2_gen.txt`. Default path re-run first with the modified generator: all six reference files byte-identical (hashes above). Priors written to `scripts/surrogate/data/priors/<name>/` with the unchanged seeds (base 777001, per-worker offset 9973·c, 8 workers):

| Prior | capture.json SHA-256 |
| --- | --- |
| uniform-box | `0734478b…6503c5` (identical to the reference `capture.json`, verified with `cmp`) |
| log-uniform-mag | `b71f48fbeba3107c2fb502cec94b9d322a74a8ba456facb49f3f535527b0711b` |
| slow | `766eee0cecc6d9db801ff3cbb702cd59c6526864889eb9c9555b21c8e48b2754` |
| moderate | `5fb56177f459c966ff31dff8da4786a448ef26415720516e3fc3d00ff6fd536e` |

### 2c / 2d. Rule statistics, closed-form count, PINN agreement

`node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/research/phase2_priors.mjs` → `reports/raw/research/phase2_priors.txt`. Label: `fireNowSecure`. PINN: `runSurrogateInference(wx, wy, wz).fireNowSecure` from `src/surrogate/inference.js` with the committed weights, nothing tuned.

| Prior | n | Rule SECURE | False-secure | % of rule-SECURE | False-eject | Physics-limited (1c) | Physics SECURE | mean / min / max \|ω\| |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| uniform-box | 1200 | 731 | 245 | 33.5157 | 4 | 340 | 490 | 4.818759 / 0.488718 / 8.224481 |
| log-uniform-mag | 1200 | 1165 | 7 | 0.6009 | 4 | 26 | 1162 | 1.139777 / 0.050020 / 4.959560 |
| slow | 1200 | 1200 | 0 | 0.0000 | 0 | 0 | 1200 | 0.509823 / 0.000085 / 0.998237 |
| moderate | 1200 | 1200 | 0 | 0.0000 | 0 | 0 | 1200 | 2.019646 / 1.000170 / 2.996473 |

| Prior | PINN = physics label | PINN = naive rule | PINN false-secure | PINN false-eject |
| --- | --- | --- | --- | --- |
| uniform-box | 1134 (94.5000%) | 915 (76.2500%) | 11 | 55 |
| log-uniform-mag | 1177 (98.0833%) | 1180 (98.3333%) | 12 | 11 |
| slow | 1200 (100.0000%) | 1200 (100.0000%) | 0 | 0 |
| moderate | 1188 (99.0000%) | 1188 (99.0000%) | 0 | 12 |

Under `slow` and `moderate` every row is physics-SECURE (|ω| ≤ 3 implies |ω_z| ≤ 3 at all times), so the rule and the label cannot disagree; these priors measure only PINN false-ejects. The 12 `moderate` false-ejects occur at |ω| between 1.000170 and 2.996473 rad/s. For the 1,200-row `uniform-box` set, the 94.5% agreement differs from the 94.7% in `check.mjs` because the evaluation sets differ (1,200 training-distribution rows here vs 600 fresh spins there).

---

## Phase 3 — Two-way net–body coupling

### 3a. Where body→net contact is applied; absence of net→body force in the reference code

All line numbers refer to tag `validation-2026-11`.

| Location | What it does |
| --- | --- |
| `src/physics/netSolver.js:222` | `this.contactCount = this.released ? 0 : this.resolveContacts(h, body)` — contact is resolved once per net step, after the distance constraints. |
| `src/physics/netSolver.js:228–311` | `resolveContacts(h, body)`: each knot inside the margin-expanded box is projected to the nearest face (`:261–273`), the body surface velocity `bv + w × r` is used for Coulomb friction (`:285–302`), the knot position is overwritten (`:304–306`). Only `pos[]` and `contact[]` are written; `body` is read-only. |
| `scripts/surrogate/physicsLib.mjs:93` | `rk4Step(y, H, 0)` — the body is integrated with damping 0 and no external torque. |
| `scripts/surrogate/physicsLib.mjs:96–98` | `body.w = R · ω` and `body.R` are written from the body state; `body.p` and `body.v` are never updated (remain 0). |
| `scripts/surrogate/physicsLib.mjs:99` | `net.step(H, body)` — the net reads the body; nothing flows back. |
| `src/workers/physicsWorker.js:172,178` (bench) and `:265,270` (live) | Same pattern: `rk4Step(y, h, damping)` then `net.step(h, body)`. The live loop uses a viscous damping torque `−c·I·ω` after capture, not a contact force. |

No code path in the reference commit reads `NetSolver` state into the body ODE. Net→body force or torque: **absent**.

### 3b. Implementation (default unchanged)

| File (branch HEAD) | Change |
| --- | --- |
| `src/physics/rigidBody.js:11` | `eulerDerivative(y, damping, out, torque = null)`; `rk4Step(y, h, damping = 0, torque = null)`. With `torque === null` no arithmetic is added (test: 3,000 steps bit-identical to the 3-argument call). |
| `src/physics/netSolver.js:41` | `this.twoWay = false` plus `reactionImpulse[3]`, `reactionAngImpulse[3]` (world frame), reset at the start of `step()` (`:147`). |
| `src/physics/netSolver.js:316–335` | Inside `resolveContacts`, when `twoWay`: knot impulse J = m_k (x_final − x_pre)/h (includes the friction correction); body accumulates −J and −(x_start − p) × J, where x_start = `prev[k]` is the knot position at the start of the step (the lever arm for which Σ m x_n × v_{n+1} is the net's discrete angular momentum). |
| `scripts/surrogate/physicsLib.mjs:172` | `coupledImpactTwoWay(wx, wy, wz, opts)`; `coupledImpact(wx, wy, wz, { coupling: 'two-way' })` dispatches to it. Default `coupledImpact()` body is untouched. |

Schedule relative to RK4 (H = 1/3000 s unchanged): the reaction accumulated during net step n is applied during body step n+1. The world-frame angular impulse is converted with R_n to a body-frame torque τ = Rₙᵀ L/H and held constant across the four RK4 stages (zero-order hold); the linear impulse is applied as v += J/m followed by p += v·H (symplectic Euler) before the net step. One-substep lag (333 µs). After the loop the trailing reaction is applied once so the final momentum budget includes the last substep.

Stability: 0 non-finite results in 33 sweep configurations, 1,200 reference rows, and 60 budget runs (`unstable two-way runs 0`). Two-way coupling is stable at the current H; no step reduction was required (3f does not apply).

### 3c. Momentum budget (20 spins, seed 20261103)

`reports/raw/research/phase3_twoway.txt`. Total linear momentum P and angular momentum about the world origin L of body + net, taken at the first substep with t ≥ 0.28 s ("before") and after the trailing reaction at the end of the window ("after"). For spins whose first contact precedes 0.28 s (row 571: tContact ≈ 0.279 s) the "before" snapshot is just after first contact.

| Mode | max \|ΔP_total\| (N·s) | max \|P_before\| | max \|ΔL_total\| (N·m·s) | max \|L_before\| |
| --- | --- | --- | --- | --- |
| One-way kinematics (reactions accumulated, not applied) | 5.3940e+0 | 4.5429 | 2.5906e-2 | 3.2448 |
| Two-way, drawstring on (production schedule) | 4.8836e+0 | 4.5429 | 1.6788e-2 | 3.2448 |
| Two-way, drawstring off | **2.5312e-12** | 4.5429 | 3.2121e-2 | 3.2448 |

Per-spin rows (all 60) are in the raw file; example row 291 (ω = [2.8535, 2.5291, 2.9003]): two-way/drawstring off ΔP_body = +5.528366, ΔP_net = −5.528366 (|ΔP_total| 2.16e-12); ΔL_body 0.190085, ΔL_net 0.164797 (|ΔL_total| 3.013e-2).

What the anchors do to the budget: the drawstring (`NetSolver.step`, `drawstring && corner[n]`) is a spring–damper (K = 90 N/m, D = 9 N·s/m) pulling the four corner knots toward a point fixed relative to the body (`p − (max half + 0.12) ẑ`). It is an external force on the net with no reaction anywhere, so with it engaged |ΔP_total| ≈ 4.9 N·s of the net's incoming 5.4 N·s is removed from the system. One-way coupling removes the entire contact impulse (the body acts as an infinite-mass wall). With two-way coupling and the drawstring off, linear momentum closes to 2.5e-12.

Angular momentum residual with two-way coupling and drawstring off (3.2e-2, about 1% of |L|). Attribution, `node scripts/research/phase3_diag_angmom.mjs` → `reports/raw/research/phase3_diag_angmom.txt` (spin 291): the net's per-step ΔL was split into the XPBD distance-constraint part and the contact part. Cumulative at t = 0.55 s: distance constraints 3.040e-2; contact + body reaction 3.741e-3 (this remainder equals the body-translation term p × ΣJ, which is accounted in L_body). The residual is therefore the sequential (Gauss-Seidel) XPBD projection of the 264 distance constraints, which uses intermediate positions and does not conserve angular momentum exactly when corrections are large. Supporting check (same raw file, "3c supplement"): net alone in free flight with the body out of reach — |ΔL| 3.6e-15 while slack (0 → 0.28 s), 3.2e-6 after the net becomes taut (max segment strain 8.6e-2, 0.28 → 0.56 s). The constraint error is small unless the net is being stopped by the body. Changing the lever arm from x_final to x_start did not change the total (3.1646e-2 → 3.2121e-2 across the 20 spins).

### 3d. Verdict comparison

Single-axis sweep, net fired at t = 0, 33 configurations (`phase3_twoway.txt`, section "3d single-axis sweep"):

| axis | w | one-way verdict | one-way peak \|ω_z\| | two-way verdict | two-way peak \|ω_z\| | Δpeak | body \|v\| at end (m/s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| x | 0.1 | capture | 0.000000 | capture | 0.001349 | 1.349e-3 | 0.017687 |
| x | 0.5 | capture | 0.000000 | capture | 0.001318 | 1.318e-3 | 0.017558 |
| x | 1.0 | capture | 0.000000 | capture | 0.000772 | 7.723e-4 | 0.017403 |
| x | 1.5 | capture | 0.000000 | capture | 0.000629 | 6.286e-4 | 0.017043 |
| x | 2.0 | capture | 0.000000 | capture | 0.001138 | 1.138e-3 | 0.017165 |
| x | 2.5 | capture | 0.000000 | capture | 0.000886 | 8.857e-4 | 0.017049 |
| x | 3.0 | capture | 0.000000 | capture | 0.000824 | 8.242e-4 | 0.017230 |
| x | 3.5 | capture | 0.000000 | capture | 0.001254 | 1.254e-3 | 0.017460 |
| x | 4.0 | capture | 0.000000 | capture | 0.001143 | 1.143e-3 | 0.017288 |
| x | 4.5 | capture | 0.000000 | capture | 0.001486 | 1.486e-3 | 0.017312 |
| x | 5.0 | capture | 0.000000 | capture | 0.001730 | 1.730e-3 | 0.016739 |
| y | 0.1 | capture | 0.000000 | capture | 0.001288 | 1.288e-3 | 0.017645 |
| y | 0.5 | capture | 0.000000 | capture | 0.001074 | 1.074e-3 | 0.017459 |
| y | 1.0 | capture | 0.000000 | capture | 0.001212 | 1.212e-3 | 0.017198 |
| y | 1.5 | capture | 0.000000 | capture | 0.000673 | 6.729e-4 | 0.017489 |
| y | 2.0 | capture | 0.000000 | capture | 0.007488 | 7.488e-3 | 0.017265 |
| y | 2.5 | capture | 0.000000 | capture | 0.002513 | 2.513e-3 | 0.017178 |
| y | 3.0 | capture | 0.000000 | capture | 0.002360 | 2.360e-3 | 0.017214 |
| y | 3.5 | capture | 0.000000 | capture | 0.002364 | 2.364e-3 | 0.017182 |
| y | 4.0 | capture | 0.000000 | capture | 0.001370 | 1.370e-3 | 0.017178 |
| y | 4.5 | capture | 0.000000 | capture | 0.000897 | 8.971e-4 | 0.017035 |
| y | 5.0 | capture | 0.000000 | capture | 0.001359 | 1.359e-3 | 0.016833 |
| z | 0.1 | capture | 0.100000 | capture | 0.100471 | 4.706e-4 | 0.017750 |
| z | 0.5 | capture | 0.500000 | capture | 0.500000 | 0.000e+0 | 0.017562 |
| z | 1.0 | capture | 1.000000 | capture | 1.000000 | 0.000e+0 | 0.017627 |
| z | 1.5 | capture | 1.500000 | capture | 1.501694 | 1.694e-3 | 0.017182 |
| z | 2.0 | capture | 2.000000 | capture | 2.000154 | 1.539e-4 | 0.017291 |
| z | 2.5 | capture | 2.500000 | capture | 2.500000 | 0.000e+0 | 0.017218 |
| z | 3.0 | capture | 3.000000 | capture | 3.000000 | 0.000e+0 | 0.017031 |
| z | 3.5 | eject | 3.500000 | eject | 3.500000 | 0.000e+0 | 0.016947 |
| z | 4.0 | eject | 4.000000 | eject | 4.000000 | 0.000e+0 | 0.016991 |
| z | 4.5 | eject | 4.500000 | eject | 4.500000 | 0.000e+0 | 0.017412 |
| z | 5.0 | eject | 5.000000 | eject | 5.000000 | 0.000e+0 | 0.017299 |

Sweep verdict changes: **0**. One-way values are identical to the validation report Task B.

All 1,200 reference rows (`coupledImpact` one-way vs two-way, drawstring on):

| Quantity | Value |
| --- | --- |
| Verdict changes one-way → two-way | **3** (capture → eject 0; eject → capture 3) |
| Rows changed (i, one-way peak, two-way peak) | 123: 3.0038859295893525 → 2.945173176665561; 346: 3.000224924169298 → 2.947591051152266; 387: 3.0235383323169667 → 2.9669069124331147 |
| max \|Δ peak \|ω_z\|\| | 0.07113009817699822 |
| mean \|Δ peak \|ω_z\|\| | 0.019616713742854345 |
| Two-way verdict = dataset `fireNowSecure` label | 1188 of 1200 (one-way: 1191, validation Task C) |
| Unstable runs | 0 |

| Coupling | Rule SECURE | False-secure | % of 1,200 | % of rule-SECURE | False-eject | % of 1,200 |
| --- | --- | --- | --- | --- | --- | --- |
| One-way | 731 | 239 | 19.9167 | 32.6949 | 3 | 0.2500 |
| Two-way | 731 | 236 | 19.6667 | 32.2845 | 3 | 0.2500 |

### 3e. Timing (20 spins, seed 20261103, 1 warm-up each, 2 passes, same machine)

| Pass | Path | Mean (ms) | Median | Min | Max |
| --- | --- | --- | --- | --- | --- |
| 1 | one-way | 7.5431 | 7.2492 | 6.8045 | 10.7657 |
| 1 | two-way | 7.5817 | 7.5543 | 7.1167 | 8.9282 |
| 2 | one-way | 7.4256 | 7.3877 | 6.8998 | 8.4509 |
| 2 | two-way | 7.6761 | 7.6166 | 7.0056 | 8.6938 |

### 3f. Stability

Not triggered: two-way coupling produced finite results in every run at the production H. The default remains one-way.

Tests added (`tests/coupling.test.mjs`, 5 tests, all pass): default `coupledImpact()` reproduces validation Task B values (z 3.5 → peak 3.500000 eject; x 2.0 → tContact 0.279333, maxStrain 0.036925); `rk4Step` with `torque = null` is bit-identical; `NetSolver.twoWay` defaults to false with zero accumulators; two-way/drawstring-off |ΔP| < 1e-9 and finite on two spins; two-way z-axis verdict boundary (3.0 capture, 3.5 eject).

---

## Phase 4 — Repository truth pass

### 4a. CI

`.github/workflows/ci.yml`: on push and pull_request, Node 18, `npm ci`, `npm test`, `npm run build`. Local equivalent run in `reports/raw/research/phase4_repro.txt`: 9/9 tests pass, `vite build` exit 0 (built in 1.96 s). CI on GitHub: NOT MEASURED (no push performed in this session).

### 4b. README and source-string changes

Replacement made: `README.md` "~21%" → "20.8% (249/1,200 seeded rollouts; 15.0–22.6% across held-out splits)". Added section "Status and limitations" with the required statements (one-way default / rigid-body verdict; strain head R² = −0.049 excluded; optimal-delay MAE 703 ms; temporal finite-difference residual; ground truth is this solver; two-way experimental) plus the 17 ms speedup note. Added `npm test` to Development.

Sentences removed or rewritten because the claim is not in either report (line numbers refer to tag `validation-2026-11`):

| File:line | Original text | Action |
| --- | --- | --- |
| `README.md:34` | `aiSurrogateEngine.js PINN / MLP forward pass wrapper (measured latency & speedup)` | Rewritten: speedup baseline is the worker benchmark or the 17 ms fallback. |
| `README.md:48` | "A chaser flight computer cannot run the coupled RK4 + 144-node net at 60 Hz during a 10 m/s approach." | Removed (unmeasured; the measured one-way rollout is 6.7–7.5 ms). |
| `README.md:54` | "**Every HUD number is measured**: inference latency, coupled/rigid rollout baselines (worker `benchmark`), held-out fidelity, and speedup." | Removed (speedup uses the 17 ms fallback until the benchmark completes). |
| `README.md:54` | "…is wrong on ~21% of random spins…" | Replaced as specified. |
| `README.md:65` | "Energy and momentum drift are reported live (typically ~1e-14)." | Rewritten with the Phase 1a measured values (2.3215e-14, 4.5516e-14). |
| `README.md:77` | `S1 Cooperative \| 0, 0, 0 \| SECURE \| SECURED, 100% enclosure` | Row replaced with measured headless values (table below). |
| `README.md:78` | `S2 Stable tumble \| 1.5, 1.0, 0.5 \| SECURE (peak 1.66) \| SECURED, 100% enclosure` | Replaced. |
| `README.md:79` | `S3 High-spin Z \| 0, 0, 4.2 \| EJECT \| EJECTED, peak 4.200` | Replaced. |
| `README.md:80` | `S4 Coupled tumble \| 3.0, 3.0, 2.5 \| PHASE-DEP (peak 4.03) \| EJECTED, peak ≈3.98` | Replaced. |
| `src/components/TelemetryHUD.jsx:348` | `<Section title="Benchmark (measured)">` | → `Benchmark`. |
| `src/components/TelemetryHUD.jsx:358–359` | "Latency and speedup re-measured in-browser. Strain head withheld from demo (held-out R² not useful yet)." | Rewritten: latency measured; baselines from worker benchmark with 17 ms / 0.2 ms fallback; R² = −0.049. |
| `src/surrogate/inference.js:224` | `@returns measured fields — never hard-coded marketing numbers` | Rewritten to state the fallback chain. |
| `src/services/aiSurrogateEngine.js:3` | "Field names mirror the thesis brief; values are always measured." | Rewritten to state the fallback chain. |

Values used for the new README scenario table (`node scripts/research/phase4_presets.mjs` → `reports/raw/research/phase4_presets.txt`):

| id | ω₀ | closed-form max \|ω_z\| | `predictOutcome` | window peak (fire now) | coupled one-way peak / verdict | maxStrain | first secure delay (ms) | capture probability % |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | [0,0,0] | 0.000000 | SECURE | 0.000000 | 0.000000 / capture | 0.053478 | 0 | 100.0000 |
| S2 | [1.5,1,0.5] | 1.659865 | SECURE | 0.845196 | 0.833099 / capture | 0.035388 | 0 | 100.0000 |
| S3 | [0,0,4.2] | 4.200000 | EJECT | 4.200000 | 4.200000 / eject | 0.053462 | null | 0.0000 |
| S4 | [3,3,2.5] | 4.033684 | PHASE_DEPENDENT | 3.924574 | 3.908242 / eject | 0.049033 | 1080 | 32.0988 |

Live-worker end states ("SECURED, 100% enclosure", "EJECTED, peak ≈3.98"): NOT MEASURED (no browser/worker run in this session); removed from the README.

Strings seen but left unchanged because they are model descriptions rather than result claims: `src/components/GuidedTour.jsx:9` ("6-DOF Euler rotational equations" — the body model integrates 3 rotational DOF; translation is only integrated in the experimental two-way path), `:18` ("solved via 60Hz WebWorker RK4" — the net is XPBD, the body is RK4), `README.md:71` (ejection-speed formula), `src/components/TelemetryHUD.jsx:187` (same formula). `dist/` is a gitignored build artefact and was regenerated by `npm run build`.

### 4c. Default path reproduces the validation report

`reports/raw/research/phase4_repro.txt`, run at branch HEAD `8487b87` plus the Phase 4 working-tree edits:

| Item | Result |
| --- | --- |
| `npm run gen:surrogate` (default) | all six file hashes identical to the validation report Task F |
| `node scripts/validation/inertia.mjs` vs `reports/raw/taskA_inertia.txt` | `diff` empty |
| `node scripts/validation/axisSweep.mjs` vs `reports/raw/taskB_axis_sweep.txt` | `diff` empty |
| `node scripts/validation/misclass.mjs` vs `reports/raw/taskC_misclass.txt` | one line differs: `wall_s 8.246621458053589` → `9.595695165872574` (wall-clock) |
| `timing.mjs` vs `reports/raw/taskD_timing.txt` | only ms values and ratios differ (pass-1 ratio 16.237 → 16.708; pass-2 16.653 → 16.702); all non-timing lines identical |
| `npm run check:surrogate` | latency 0.392 ms, accuracy 94.7%, naive 83.8%, PASSED; same S1–S4 lines as the validation report; `metrics.json` restored afterwards |
| `npm test` | 9 pass, 0 fail |
| `npm run build` | exit 0 |

---

## Reproduction

```bash
git clone <repo-url> SpaceRobotsMS && cd SpaceRobotsMS
git checkout research/nov-2026
npm ci

# reference dataset (gitignored, byte-identical hashes listed at the top of this file; 8 worker threads)
npm run gen:surrogate

# Phase 1
node scripts/research/phase1_integrator.mjs
# Phase 2
for p in uniform-box log-uniform-mag slow moderate; do
  node scripts/surrogate/genData.mjs --only capture --prior $p --out scripts/surrogate/data/priors/$p
done
node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/research/phase2_priors.mjs
# Phase 3
node scripts/research/phase3_twoway.mjs
node scripts/research/phase3_diag_angmom.mjs
# Phase 4
node scripts/research/phase4_presets.mjs
node scripts/validation/inertia.mjs; node scripts/validation/axisSweep.mjs; node scripts/validation/misclass.mjs
node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/validation/timing.mjs

# all tests + build (what CI runs)
npm ci && npm test && npm run build
```
