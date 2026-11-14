# When to fire a capture net at a tumbling 12U CubeSat: a closed-form spin-envelope criterion

**Parth Sharma** — Technical note, November 2026. Not peer reviewed.
Code: github.com/euparth/SpaceRobotsMS, release v1.0.1 (this note is archived with that release). Earlier archive, v1.0.0: https://doi.org/10.5281/zenodo.23973368

## Abstract

Shin et al. (2023) simulated a 2 m net capturing a 12U CubeSat spinning about one axis at a time. Spin about the net-facing z-axis was captured at 0.1–1 rad/s, incompletely captured at 2 and 3 rad/s, and failed at 5 rad/s; spin about x or y did not prevent capture. Taking 3 rad/s as a working limit gives a simple rule: fire if |ωz| ≤ 3 rad/s now. For this body z is the intermediate principal axis, so in a multi-axis tumble |ωz| changes between firing and net arrival. This note gives the exact largest |ωz| a torque-free tumble can reach, from the two rigid-body invariants, and checks it against an RK4 integrator to 1.6 × 10⁻⁷ rad/s. Under a wide uniform prior the simple rule is unsafe on 33.5 % of the spins it clears; under a log-uniform prior, 0.6 %. The closed-form criterion has no false-secure cases at any limit tested.

## 1. Context

The author's 2023 Master's thesis [2] reviewed Shin et al.'s finite-element study [1]. In October–November 2026 the scenario was re-implemented independently as a browser simulator [3] to ask one question: does a single-axis z-spin limit survive multi-axis tumbling?

## 2. Model

**Body.** 12U CubeSat, 30 kg, 0.227 × 0.366 × 0.240 m, principal moments Ix = 0.479, Iy = 0.273, Iz = 0.464 kg m². Since Iy < Iz < Ix, the net-facing z-axis is the intermediate axis. Torque-free Euler equations are integrated by classical RK4 at a step of 1/3000 s.

**Net and verdict.** A 144-knot XPBD cable lattice reaches the body after 0.3 s. The verdict is *eject* if |ωz| exceeds 3.0 rad/s during the 0.25 s contact window, otherwise *capture*. The 3.0 rad/s limit is a modelling choice, not a threshold reported by Shin et al.: they tested 0.1, 0.5, 1, 2, 3 and 5 rad/s and nothing between 3 and 5. "Capture" here means no predicted rebound, not full encapsulation.

**Dataset.** 1,200 seeded spins, each component of ω₀ uniform on [0, 5) rad/s, plus three isotropic priors of 1,200 spins each.

## 3. Closed-form envelope

Write a = ωx², b = ωy², c = ωz². Kinetic energy and angular momentum are conserved and linear in (a, b, c):

2T = Ix a + Iy b + Iz c,  H² = Ix² a + Iy² b + Iz² c.

The largest c with a, b ≥ 0 lies where a = 0 or b = 0:

- a = 0: c = (H² − 2T Iy) / (Iz (Iz − Iy)), valid if c ≥ 0 and (2T − Iz c)/Iy ≥ 0
- b = 0: c = (H² − 2T Ix) / (Iz (Iz − Ix)), valid if c ≥ 0 and (2T − Iz c)/Ix ≥ 0

ωz,max is the larger of |ωz(0)| and √c over the valid branches. **Criterion: fire only if ωz,max ≤ 3.0 rad/s.** It needs no integration and no trained model. It is conservative, because it bounds |ωz| for all time and not only for the contact window.

## 4. Results

**Verification.** Over 10 s on 50 spins, the relative drift of |H| and of kinetic energy is at most 2.3 × 10⁻¹⁴ and 4.6 × 10⁻¹⁴. A step sweep gives an observed order of 4.00. Over 20 s on 1,200 spins the numerical peak never exceeds the closed-form bound, and falls short of it by at most 1.56 × 10⁻⁷ rad/s.

**Single-axis check.** For pure x, y or z spin at 0.1–5.0 rad/s (33 runs), x and y capture at every rate; z captures up to 3.0 and ejects from 3.5 rad/s. This follows from the imposed limit and checks the implementation only. It matches Shin et al. on x, y and on failure at 5 rad/s, but the model has no incomplete-capture category, so it does not reproduce their result at 2 and 3 rad/s.

**When the simple rule fails.** "False-secure" means the rule clears a spin that then exceeds the limit during contact.

| Prior on ω₀ (n = 1,200 each) | Rule says secure | False-secure | % of rule-secure | False-eject |
|---|---|---|---|---|
| Uniform [0, 5)³, positive octant (default) | 731 | 245 | 33.5 % | 4 |
| Isotropic, \|ω\| log-uniform [0.05, 5] | 1,165 | 7 | 0.6 % | 4 |
| Isotropic, \|ω\| uniform [0, 1] | 1,200 | 0 | 0 | 0 |
| Isotropic, \|ω\| uniform [1, 3] | 1,200 | 0 | 0 | 0 |

The failure needs |ω₀| > 3 rad/s with |ωz(0)| below the limit; it cannot occur for slower tumbles. The 33.5 % figure is a property of the wide default prior, not an operational failure rate.

**Sensitivity to the limit.** Because Shin et al. report no threshold, the default dataset was recomputed with only the limit changed.

| Limit (rad/s) | Rule says secure | Rule false-secure | % of rule-secure | Criterion says secure | Criterion false-secure | Criterion false-eject |
|---|---|---|---|---|---|---|
| 1.0 | 251 | 179 | 71.3 % | 46 | 0 | 26 |
| 2.0 | 487 | 240 | 49.3 % | 185 | 0 | 63 |
| 3.0 | 731 | 245 | 33.5 % | 391 | 0 | 99 |
| 4.0 | 972 | 228 | 23.5 % | 644 | 0 | 106 |

The criterion is never unsafe, as a bound must be. Its cost is caution: it holds some spins that would have stayed under the limit during the contact window.

**Two-way coupling.** Feeding the net's contact impulses back to the body changes 3 of 1,200 verdicts, all eject to capture, for spins whose one-way peak was within 0.024 rad/s above the limit. A rigid-body criterion is therefore adequate for this net mass.

**Learned surrogate.** A small neural network trained on the same labels agrees with the solver on 94.7 % of 600 held-out spins, against 83.8 % for the simple rule. For the fire-now decision the closed form supersedes it; it is kept for comparison only.

## 5. Limitations

- Ground truth is this solver, not experiment or the published finite-element results. No numerical comparison with Shin et al. has been made.
- All counts depend on the chosen limit; the table above gives them at four limits.
- The verdict is a limit applied to rigid-body motion, not an outcome of net dynamics. Net coupling is one-way by default.
- The criterion assumes the spin and the inertia are known exactly.
- The network's strain output has no predictive value (R² = −0.049) and its fire-delay estimate (mean error 703 ms) is not used for any decision.
- The net solver leaves an angular-momentum residual of about 1 % during impact.
- The dataset regenerates byte-identically only on a machine with 8 or more cores.

## 6. Code and data

Repository: https://github.com/euparth/SpaceRobotsMS, tag `v1.0.1`, MIT licence. Reproduce with `npm ci && npm test && npm run build`. Scripts are under `scripts/validation/` and `scripts/research/`, raw outputs under `reports/raw/`. Methods page: https://space-debris-sim.vercel.app/methods

**AI assistance.** Developed with AI assistance. Cursor was the coding and testing partner; Gemini was used for background research and other secondary tasks; Claude was used for review, the project landing page, the limit-sensitivity script, and drafting documentation, including this note. The author specified the research questions and reviewed the results; numbers come from the committed scripts and tests.

## References

[1] Shin, H.-C., Jang, M., Hwang, U.-J., Sim, C.-H., & Park, J.-S. (2023). Capture simulation using space-nets for space debris in various motions. *International Journal of Aeronautical and Space Sciences*, 24, 547–558. https://doi.org/10.1007/s42405-022-00540-w

[2] Sharma, P. (2023). *Space entrepreneurship – Problem statement: Space Debris*. M.Sc. thesis, TH OWL, Lemgo. https://doi.org/10.5281/zenodo.23974801

[3] Sharma, P. (2026). *Space Debris Capture Simulator: tumbling 12U CubeSat captured by a Kevlar 49 net* [Software]. https://github.com/euparth/SpaceRobotsMS
