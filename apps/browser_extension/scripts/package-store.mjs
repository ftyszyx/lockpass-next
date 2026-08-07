import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'
import { loadEnv } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(root, 'dist')
const outputDir = resolve(root, '../../tools/dist/browser_extension')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const env = loadEnv('production', root, 'VITE_')

requireProductionUrl(
  process.env.VITE_LOCKPASS_OFFICIAL_SERVER_URL || env.VITE_LOCKPASS_OFFICIAL_SERVER_URL,
  'VITE_LOCKPASS_OFFICIAL_SERVER_URL'
)
requireProductionUrl(
  process.env.VITE_LOCKPASS_OFFICIAL_API_URL || env.VITE_LOCKPASS_OFFICIAL_API_URL,
  'VITE_LOCKPASS_OFFICIAL_API_URL'
)

const files = await collectFiles(distDir)
const entries = {}
for (const file of files) {
  const archivePath = relative(distDir, file).split(sep).join('/')
  entries[archivePath] = new Uint8Array(await readFile(file))
}

const archive = zipSync(entries, { level: 9 })
const unpacked = unzipSync(archive)
if (!unpacked['manifest.json']) throw new Error('archive root must contain manifest.json')
if (Object.keys(unpacked).some((file) => file.startsWith('dist/'))) {
  throw new Error('archive must not contain an outer dist directory')
}

const manifest = JSON.parse(new TextDecoder().decode(unpacked['manifest.json']))
if (manifest.version !== packageJson.version) {
  throw new Error('archive manifest version does not match package version')
}

await mkdir(outputDir, { recursive: true })
const outputPath = resolve(
  outputDir,
  `lockpass-browser-extension-v${packageJson.version}.zip`
)
await rm(outputPath, { force: true })
await writeFile(outputPath, archive)

console.log(`Chrome Web Store package created: ${outputPath}`)
console.log(`Files: ${Object.keys(unpacked).length}; bytes: ${archive.byteLength}`)

async function collectFiles(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) result.push(...await collectFiles(path))
    else if (entry.isFile()) result.push(path)
  }
  return result.sort()
}

function requireProductionUrl(value, name) {
  if (!value) throw new Error(`${name} is required in .env.production`)
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error(`${name} must use https for store packaging`)
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`${name} must not point to a local development server`)
  }
}
