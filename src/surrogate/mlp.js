/**
 * Dependency-free Float32 MLP forward pass (tanh hidden, linear output).
 * Shared by browser runtime and Node check scripts via the weights.json schema.
 */

export function loadMlp(obj) {
  return {
    sizes: obj.sizes,
    layers: obj.layers.map((L) => ({
      nin: L.nin,
      nout: L.nout,
      W: Float32Array.from(L.W),
      b: Float32Array.from(L.b),
    })),
  }
}

export function predict(net, x) {
  let a = x instanceof Float32Array ? x : Float32Array.from(x)
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
