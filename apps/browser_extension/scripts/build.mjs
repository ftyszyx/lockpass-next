import { cp, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, loadEnv } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(root, 'dist')
const env = loadEnv('production', root, 'VITE_')

requireHttpUrl(env.VITE_LOCKPASS_OFFICIAL_SERVER_URL, 'VITE_LOCKPASS_OFFICIAL_SERVER_URL')
requireHttpUrl(env.VITE_LOCKPASS_OFFICIAL_API_URL, 'VITE_LOCKPASS_OFFICIAL_API_URL')

await build({ configFile: resolve(root, 'vite.config.ts') })

await buildWorker('background', resolve(root, 'src/background/serviceWorker.ts'), 'es')
await buildWorker('content', resolve(root, 'src/content/contentScript.ts'), 'iife')

await mkdir(resolve(distDir, 'icons'), { recursive: true })
await cp(
  resolve(root, '../desktop/src-tauri/icons/icon.png'),
  resolve(distDir, 'icons/icon.png')
)

async function buildWorker(name, entry, format) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    build: {
      target: 'chrome114',
      outDir: distDir,
      emptyOutDir: false,
      minify: false,
      lib: {
        entry,
        formats: [format],
        name: `LockPass${name}`,
        fileName: () => `${name}.js`
      }
    }
  })
}

function requireHttpUrl(value, name) {
  if (!value) throw new Error(`${name} is required. Copy .env.example to .env and configure it.`)
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use http or https.`)
  }
}
