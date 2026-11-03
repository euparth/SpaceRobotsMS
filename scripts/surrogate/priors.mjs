/**
 * Spin priors for capture-label generation. The implementation moved unchanged to
 * src/physics/priors.js (release 1.0) so the browser Monte Carlo samples the same draws;
 * `uniform-box` remains the historical default and the default dataset is unchanged.
 */
export { PRIORS, samplePrior } from '../../src/physics/priors.js'
