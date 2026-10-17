import * as THREE from 'three'
import { STRAIN_BANDS } from '../physics/constants.js'

export const STRESS_PALETTE = Object.freeze({
  nominal: '#0284c7',
  elastic: '#f59e0b',
  yield: '#dc2626',
})

const vertexShader = /* glsl */ `
  attribute float aStrain;

  uniform float uElastic;
  uniform float uYield;
  uniform float uTime;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform vec3 uNominalColor;
  uniform vec3 uElasticColor;
  uniform vec3 uYieldColor;

  varying vec3 vColor;
  varying float vYield;

  vec3 stressColor(float s) {
    float withinNominal = clamp(s / uElastic, 0.0, 1.0);
    vec3 nominal = mix(uNominalColor * 0.62, uNominalColor, withinNominal);
    float toElastic = smoothstep(uElastic * 0.92, uElastic * 1.08, s);
    float toYield = smoothstep(uYield * 0.95, uYield * 1.05, s);
    return mix(mix(nominal, uElasticColor, toElastic), uYieldColor, toYield);
  }

  void main() {
    float s = max(aStrain, 0.0);
    vYield = smoothstep(uYield * 0.95, uYield * 1.05, s);
    float pulse = 1.0 + 0.35 * vYield * (0.5 + 0.5 * sin(uTime * 18.0));
    vColor = stressColor(s) * pulse;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    #ifdef STRESS_POINTS
      gl_PointSize = uPointSize * uPixelRatio * (1.0 + 0.6 * vYield) / max(-mvPosition.z, 0.1);
    #endif
  }
`

const fragmentShader = /* glsl */ `
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vYield;

  void main() {
    float alpha = uOpacity;

    #ifdef STRESS_POINTS
      vec2 c = gl_PointCoord - 0.5;
      float r = length(c);
      if (r > 0.5) discard;
      alpha *= smoothstep(0.5, 0.15, r);
    #endif

    #ifdef STRESS_SURFACE
      alpha *= 1.0 + vYield * 1.5;
    #endif

    gl_FragColor = vec4(vColor, alpha);
    #include <colorspace_fragment>
  }
`

/**
 * Strain-mapped Kevlar weave material. One shader, three variants sharing the same
 * per-knot `aStrain` attribute: thread lines, knot sprites and a faint membrane.
 */
export function createStressMaterial({ variant = 'line', opacity = 1, pointSize = 3.2 } = {}) {
  const defines = {}
  if (variant === 'points') defines.STRESS_POINTS = ''
  if (variant === 'surface') defines.STRESS_SURFACE = ''

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines,
    transparent: true,
    depthWrite: variant === 'line',
    side: variant === 'surface' ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      uElastic: { value: STRAIN_BANDS.elastic },
      uYield: { value: STRAIN_BANDS.yield },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uPointSize: { value: pointSize * 10 },
      uPixelRatio: { value: 1 },
      uNominalColor: { value: new THREE.Color(STRESS_PALETTE.nominal) },
      uElasticColor: { value: new THREE.Color(STRESS_PALETTE.elastic) },
      uYieldColor: { value: new THREE.Color(STRESS_PALETTE.yield) },
    },
  })
}
