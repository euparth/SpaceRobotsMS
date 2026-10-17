import { NET } from './constants.js'

export const GRID = NET.grid
export const NODE_COUNT = GRID * GRID
export const REST_LENGTH = NET.size / (GRID - 1)
export const nodeIndex = (i, j) => j * GRID + i

export const CORNER_NODES = Object.freeze([
  nodeIndex(0, 0),
  nodeIndex(GRID - 1, 0),
  nodeIndex(0, GRID - 1),
  nodeIndex(GRID - 1, GRID - 1),
])

function buildSegments() {
  const out = []
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      if (i + 1 < GRID) out.push(nodeIndex(i, j), nodeIndex(i + 1, j))
      if (j + 1 < GRID) out.push(nodeIndex(i, j), nodeIndex(i, j + 1))
    }
  }
  return Uint16Array.from(out)
}

function buildTriangles() {
  const out = []
  for (let j = 0; j + 1 < GRID; j++) {
    for (let i = 0; i + 1 < GRID; i++) {
      const a = nodeIndex(i, j)
      const b = nodeIndex(i + 1, j)
      const c = nodeIndex(i, j + 1)
      const d = nodeIndex(i + 1, j + 1)
      out.push(a, b, d, a, d, c)
    }
  }
  return Uint16Array.from(out)
}

export const SEGMENTS = buildSegments()
export const SEGMENT_COUNT = SEGMENTS.length / 2
export const TRIANGLES = buildTriangles()
export const THREAD_LENGTH = SEGMENT_COUNT * REST_LENGTH
export const NET_MASS = NET.density * NET.threadArea * THREAD_LENGTH
export const NODE_MASS = NET_MASS / NODE_COUNT
