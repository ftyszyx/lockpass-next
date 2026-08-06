import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildScript = resolve(root, 'scripts/build.mjs')
const watchTargets = [
  resolve(root, 'src'),
  resolve(root, 'public'),
  resolve(root, 'popup.html'),
  resolve(root, 'vite.config.ts'),
  resolve(root, '../desktop/src/theme.css'),
  resolve(root, '../desktop/src-tauri/icons/icon.png')
]

let building = false
let rebuildPending = false
let rebuildTimer
let activeBuild
const watchers = []

await runBuild()
console.log('[lockpass] Watching browser extension sources. Load apps/browser_extension/dist in Chrome.')

for (const target of watchTargets) {
  const targetStat = await stat(target)
  const watcher = watch(target, { recursive: targetStat.isDirectory() }, () => scheduleBuild())
  watcher.on('error', (error) => console.error(`[lockpass] Watch failed for ${target}:`, error))
  watchers.push(watcher)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function scheduleBuild() {
  clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => void runBuild(), 180)
}

async function runBuild() {
  if (building) {
    rebuildPending = true
    return
  }

  building = true
  rebuildPending = false
  const exitCode = await new Promise((resolveExitCode) => {
    activeBuild = spawn(process.execPath, [buildScript], {
      cwd: root,
      stdio: 'inherit'
    })
    activeBuild.once('exit', (code) => resolveExitCode(code ?? 1))
  })
  activeBuild = undefined
  building = false

  if (exitCode === 0) {
    console.log('[lockpass] Extension build updated. Reload it from chrome://extensions.')
  } else {
    console.error(`[lockpass] Extension build failed with exit code ${exitCode}.`)
  }

  if (rebuildPending) await runBuild()
}

function shutdown() {
  clearTimeout(rebuildTimer)
  for (const watcher of watchers) watcher.close()
  activeBuild?.kill()
  process.exit()
}
