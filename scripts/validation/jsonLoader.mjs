/**
 * Node 18 ESM loader: serve bare `import x from './file.json'` (Vite style) as a JS module,
 * so src/surrogate/inference.js can run unmodified under Node.
 * Usage: node --experimental-loader ./scripts/validation/jsonLoader.mjs <script>
 */
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.json')) {
    const text = await readFile(fileURLToPath(url), 'utf8')
    return { format: 'module', source: `export default ${text}`, shortCircuit: true }
  }
  return nextLoad(url, context)
}
