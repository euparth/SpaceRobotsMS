import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Build-time provenance shown in the header and on /methods. Falls back to the Vercel env, then 'unknown'. */
function git(cmd, fallback) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback
  } catch {
    return fallback
  }
}
const commit = git('git rev-parse --short=7 HEAD', (process.env.VERCEL_GIT_COMMIT_SHA || 'unknown').slice(0, 7))
const tag = git('git describe --tags --exact-match HEAD', process.env.VERCEL_GIT_COMMIT_REF || '')
/**
 * Dirty iff tracked file *content* differs from HEAD.
 * Refresh the index first: Vercel’s restored build cache can leave stale stat info that
 * makes `git status --porcelain` report a false dirty tree. If git is unavailable, clean.
 */
function gitDirty() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' })
  } catch {
    return false
  }
  try {
    execSync('git update-index -q --refresh', { stdio: 'ignore' })
  } catch {
    // Non-zero when some paths need a refresh; content check below decides dirty.
  }
  try {
    execSync('git diff-index --quiet HEAD --', { stdio: 'ignore' })
    return false
  } catch {
    try {
      const names = execSync('git diff-index --name-only HEAD --', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
      if (names) console.warn('[vite.config] __GIT_DIRTY__ files:\n' + names)
    } catch {
      /* ignore */
    }
    return true
  }
}
const dirty = gitDirty()

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_COMMIT__: JSON.stringify(commit),
    __GIT_TAG__: JSON.stringify(tag),
    __GIT_DIRTY__: JSON.stringify(dirty),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  server: {
    port: 5173,
    host: true,
  },
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
