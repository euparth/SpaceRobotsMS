# Contributing

This repository is a physics simulator with a published verification trail. A change that
alters a number on screen is a change to the paper trail in `reports/`. Please keep them
together.

## Test policy

- `npm test` runs `node --test tests/`. Every physics-facing feature (integrator, closed-form
  envelope, capture label, priors / chunk split, polhode curve, Monte Carlo parity, momentum
  budget, methods-page quoted numbers) has a test in that directory. Add or extend a test in
  the same pull request as the feature.
- `npm run test:e2e` is the Playwright smoke test against `vite preview`. It checks that the
  workbench loads, S4 shows the measured verdicts, Monte Carlo N = 100 completes, and `/methods`
  renders without loading three.js. Run it after a UI change that could break those paths.
- `npm run test:all` is `npm test && npm run build && npm run test:e2e`.
- Do not skip, disable, or loosen a test to make a change pass. If a measured value moves, say
  so in `reports/` and update the quoted number in `src/methods/measured.js` (and the test
  assertion) in the same change.

## Verification policy

- Ground truth for this project is `reports/validation_2026-11.md` and
  `reports/research_2026-11.md`. Numbers quoted in the UI, `/methods`, and the README are
  copied from those files (or from `reports/release_1.0.md` for this release). Do not invent
  a number, round it into a nicer figure, or describe an unrun experiment as measured.
- Do not modify `src/surrogate/weights.json` or retrain unless the change is an explicit
  retrain with a new report. Do not change dataset-generation defaults (`scripts/surrogate/genData.mjs`)
  or the physics constants in `src/physics/constants.js` without a corresponding report.
- Dataset hashes depend on an 8-worker seed split (`planChunks` in `src/physics/priors.js`).
  Reproduce them on a machine with at least 8 cores, or the hashes will differ.
- `npm run check:surrogate` rewrites `src/surrogate/metrics.json`. Restore that file if you
  did not intend to update it.
- Wall-clock timing lines (`wall_s`, Lighthouse, bundle parse times) are allowed to differ
  across machines. Physics outputs are not.

## Language

Do not add marketing copy. Forbidden examples: "revolutionary", "cutting-edge", "AI-powered",
"state-of-the-art", "proves", "every number is measured". If a claim is not in `reports/`,
write **NOT MEASURED** and name what was not run.

The ROS 2 tab is an in-browser topic bus. The rosbridge v2 client is **NOT MEASURED** against
a live server. There is no Gazebo integration; do not claim one.

## Pull requests

Keep a change small enough that a reviewer can check the physics, the test, and the quoted
number. One commit per coherent change is enough; this release used one commit per phase.
