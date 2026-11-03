/* global __GIT_COMMIT__, __GIT_TAG__, __GIT_DIRTY__, __BUILD_DATE__ */
/** Injected by vite.config.js `define` at build time (git rev-parse / git describe). */
export const BUILD = Object.freeze({
  commit: typeof __GIT_COMMIT__ === 'string' ? __GIT_COMMIT__ : 'dev',
  tag: typeof __GIT_TAG__ === 'string' ? __GIT_TAG__ : '',
  dirty: typeof __GIT_DIRTY__ === 'boolean' ? __GIT_DIRTY__ : false,
  date: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '',
  repository: 'https://github.com/euparth/SpaceRobotsMS',
})

export function buildLabel() {
  const parts = []
  if (BUILD.tag) parts.push(BUILD.tag)
  parts.push(BUILD.commit + (BUILD.dirty ? '+dirty' : ''))
  return parts.join(' · ')
}
