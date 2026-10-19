/**
 * Minimal Float32 MLP with Adam, tanh activations, for offline PINN training.
 * No external dependencies.
 */

export function zeros(n) {
  return new Float32Array(n)
}

export function randn(n, scale = 0.1, rng = Math.random) {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    // Box-Muller
    const u = Math.max(1e-12, rng())
    const v = rng()
    a[i] = scale * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return a
}

/** Dense layers: sizes = [in, h1, ..., out]. Weights stored as flat arrays. */
export function createMlp(sizes, rng = Math.random) {
  const layers = []
  for (let L = 0; L < sizes.length - 1; L++) {
    const nin = sizes[L]
    const nout = sizes[L + 1]
    const scale = Math.sqrt(2 / (nin + nout))
    layers.push({
      nin,
      nout,
      W: randn(nin * nout, scale, rng),
      b: zeros(nout),
      dW: zeros(nin * nout),
      db: zeros(nout),
      mW: zeros(nin * nout),
      vW: zeros(nin * nout),
      mb: zeros(nout),
      vb: zeros(nout),
    })
  }
  return { sizes, layers }
}

export function cloneMlp(net) {
  return {
    sizes: [...net.sizes],
    layers: net.layers.map((L) => ({
      nin: L.nin,
      nout: L.nout,
      W: new Float32Array(L.W),
      b: new Float32Array(L.b),
      dW: zeros(L.W.length),
      db: zeros(L.b.length),
      mW: zeros(L.W.length),
      vW: zeros(L.b.length),
      mb: zeros(L.b.length),
      vb: zeros(L.b.length),
    })),
  }
}

function tanh(x) {
  return Math.tanh(x)
}
function dtanh(y) {
  return 1 - y * y
}

/**
 * Forward: returns { y, cache } where cache holds pre/post activations for backprop.
 * Last layer is linear (no activation) for regression.
 */
export function forward(net, x) {
  const cache = [{ a: Float32Array.from(x) }]
  let a = cache[0].a
  for (let L = 0; L < net.layers.length; L++) {
    const layer = net.layers[L]
    const z = zeros(layer.nout)
    const out = zeros(layer.nout)
    const last = L === net.layers.length - 1
    for (let j = 0; j < layer.nout; j++) {
      let s = layer.b[j]
      const off = j * layer.nin
      for (let i = 0; i < layer.nin; i++) s += layer.W[off + i] * a[i]
      z[j] = s
      out[j] = last ? s : tanh(s)
    }
    cache.push({ z, a: out })
    a = out
  }
  return { y: a, cache }
}

/** Backprop from dL/dy. Accumulates into layer.dW / layer.db. */
export function backward(net, cache, dy) {
  let delta = Float32Array.from(dy)
  for (let L = net.layers.length - 1; L >= 0; L--) {
    const layer = net.layers[L]
    const aPrev = cache[L].a
    const aCur = cache[L + 1].a
    const last = L === net.layers.length - 1
    if (!last) {
      for (let j = 0; j < layer.nout; j++) delta[j] *= dtanh(aCur[j])
    }
    for (let j = 0; j < layer.nout; j++) {
      layer.db[j] += delta[j]
      const off = j * layer.nin
      for (let i = 0; i < layer.nin; i++) layer.dW[off + i] += delta[j] * aPrev[i]
    }
    if (L === 0) break
    const prev = zeros(layer.nin)
    for (let i = 0; i < layer.nin; i++) {
      let s = 0
      for (let j = 0; j < layer.nout; j++) s += layer.W[j * layer.nin + i] * delta[j]
      prev[i] = s
    }
    delta = prev
  }
}

export function zeroGrads(net) {
  for (const L of net.layers) {
    L.dW.fill(0)
    L.db.fill(0)
  }
}

export function adamStep(net, lr = 1e-3, beta1 = 0.9, beta2 = 0.999, eps = 1e-8, t = 1) {
  for (const L of net.layers) {
    for (let i = 0; i < L.W.length; i++) {
      L.mW[i] = beta1 * L.mW[i] + (1 - beta1) * L.dW[i]
      L.vW[i] = beta2 * L.vW[i] + (1 - beta2) * L.dW[i] * L.dW[i]
      const m = L.mW[i] / (1 - beta1 ** t)
      const v = L.vW[i] / (1 - beta2 ** t)
      L.W[i] -= (lr * m) / (Math.sqrt(v) + eps)
    }
    for (let i = 0; i < L.b.length; i++) {
      L.mb[i] = beta1 * L.mb[i] + (1 - beta1) * L.db[i]
      L.vb[i] = beta2 * L.vb[i] + (1 - beta2) * L.db[i] * L.db[i]
      const m = L.mb[i] / (1 - beta1 ** t)
      const v = L.vb[i] / (1 - beta2 ** t)
      L.b[i] -= (lr * m) / (Math.sqrt(v) + eps)
    }
  }
}

export function serializeMlp(net) {
  return {
    sizes: net.sizes,
    layers: net.layers.map((L) => ({
      nin: L.nin,
      nout: L.nout,
      W: Array.from(L.W),
      b: Array.from(L.b),
    })),
  }
}

export function loadMlp(obj) {
  return {
    sizes: obj.sizes,
    layers: obj.layers.map((L) => ({
      nin: L.nin,
      nout: L.nout,
      W: Float32Array.from(L.W),
      b: Float32Array.from(L.b),
      dW: zeros(L.W.length),
      db: zeros(L.b.length),
      mW: zeros(L.W.length),
      vW: zeros(L.W.length),
      mb: zeros(L.b.length),
      vb: zeros(L.b.length),
    })),
  }
}

/** Inference-only forward without cache (faster). */
export function predict(net, x) {
  let a = x
  for (let L = 0; L < net.layers.length; L++) {
    const layer = net.layers[L]
    const out = new Float32Array(layer.nout)
    const last = L === net.layers.length - 1
    for (let j = 0; j < layer.nout; j++) {
      let s = layer.b[j]
      const off = j * layer.nin
      for (let i = 0; i < layer.nin; i++) s += layer.W[off + i] * a[i]
      out[j] = last ? s : Math.tanh(s)
    }
    a = out
  }
  return a
}
