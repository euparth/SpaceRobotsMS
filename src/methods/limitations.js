/**
 * README "Status and limitations", verbatim. tests/methods.test.mjs asserts that every string here
 * appears in README.md unchanged, so the page and the README cannot drift apart.
 */
export const README_LIMITATIONS = Object.freeze([
  'Shin et al. (2023) tested z-spin at 0.1, 0.5, 1, 2, 3 and 5 rad/s: capture succeeded at 0.1–1 rad/s, was incomplete at 2 and 3 rad/s, and failed at 5 rad/s, with nothing tested between 3 and 5 rad/s. The 3.0 rad/s limit is a modelling choice, not a threshold reported by Shin et al., and "secure" means no predicted rebound, not full encapsulation.',
  'One-way coupling is the default and the capture verdict is rigid-body only: the body is integrated torque-free and the net sees it as an infinite-mass wall; the dataset label (`fireNowSecure`) is peak |ωz| of the torque-free body over the 0.25 s window.',
  'Strain head R² = −0.049 on its held-out split and is excluded from verdicts.',
  'Optimal-delay MAE 703 ms (PINN fire-schedule vs physics, 500 spins).',
  'PINN physics residual uses temporal finite differences (central difference of the network output at ±0.02 s), not autodiff.',
  'Ground truth is this solver, not experiment. No hardware or published-experiment comparison has been run.',
  "Two-way coupling (`coupledImpact(..., { coupling: 'two-way' })`, `NetSolver.twoWay`) is experimental: it is off by default, changes 3 of 1,200 reference verdicts (eject → capture, all within 0.024 rad/s of the threshold), and the net's XPBD projection does not conserve angular momentum exactly during impact (`reports/research_2026-11.md`, Phase 3).",
  '`speedupVsCoupledEstimate` in `src/surrogate/metrics.json` divides a hardcoded 17 ms by the training-time latency; the measured one-way coupled rollout on an Apple M1 is 6.7–7.5 ms mean (`reports/validation_2026-11.md` Task D, `reports/research_2026-11.md` Phase 3e).',
])

/** Added for release 1.0 (not in the README list above). */
export const RELEASE_LIMITATIONS = Object.freeze([
  "XPBD angular-momentum residual: with two-way coupling and the drawstring off, |ΔL_total| of body + net over the contact window is 3.2e-2 N·m·s, about 1 % of |L| (max over 20 spins). Attribution on spin 291: 3.04e-2 from the sequential Gauss–Seidel projection of the 264 distance constraints, 3.7e-3 from contact plus body reaction. Linear momentum closes to 2.5e-12 N·s in the same runs.",
  'Dataset seeds depend on the 8-worker split: scripts/surrogate/genData.mjs assigns mulberry32(base + 9973·c) to chunk c of ⌈N / min(cores, 8)⌉ rows. The published hashes were produced with 8 workers; a machine with fewer cores assigns different seeds per worker and produces a different (but equally valid) dataset. The in-browser Monte Carlo always uses the fixed 8-way split so that it reproduces capture.json regardless of the client core count.',
  'The PINN first-secure-delay estimate (test MAE 703 ms) is displayed but not used for auto-fire; auto-fire uses the RK4 secure window computed in the worker.',
  'The ROS 2 topic view is an in-browser pub/sub graph with the same topic names and message types; the rosbridge v2 link (ros2 bridge connect ws://…) was implemented but has not been exercised against a live rosbridge_server in this release: NOT MEASURED. There is no Gazebo integration.',
])
