/** prefers-reduced-motion, read once and kept live. Used by Canvas3D (shader pulse, AI ring pulse). */
const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

export function reducedMotion() {
  return Boolean(query && query.matches)
}

export function onReducedMotionChange(cb) {
  if (!query) return () => {}
  const handler = () => cb(query.matches)
  query.addEventListener?.('change', handler)
  return () => query.removeEventListener?.('change', handler)
}
