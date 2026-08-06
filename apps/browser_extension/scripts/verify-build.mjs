import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const requiredFiles = [
  'dist/manifest.json',
  'dist/popup.html',
  'dist/background.js',
  'dist/content.js',
  'dist/icons/icon.png',
  'dist/_locales/zh_CN/messages.json',
  'dist/_locales/en/messages.json'
]

await Promise.all(requiredFiles.map((file) => access(resolve(root, file))))

const manifest = JSON.parse(await readFile(resolve(root, 'dist/manifest.json'), 'utf8'))
if (manifest.manifest_version !== 3) throw new Error('manifest must use version 3')
if (manifest.action?.default_popup !== 'popup.html') throw new Error('popup entry is missing')
if (manifest.background?.service_worker !== 'background.js') throw new Error('background worker entry is missing')

const popupHtml = await readFile(resolve(root, 'dist/popup.html'), 'utf8')
const popupStylesheet = popupHtml.match(/href="\.\/(assets\/popup-[^"]+\.css)"/)?.[1]
if (!popupStylesheet) throw new Error('popup stylesheet entry is missing')

const popupCss = await readFile(resolve(root, 'dist', popupStylesheet), 'utf8')
for (const selector of [
  'lp-vault-search-input',
  'extension-workspace',
  'extension-vault-nav',
  'extension-item-editor'
]) {
  if (!popupCss.includes(selector)) throw new Error(`popup shared UI selector is missing: ${selector}`)
}
for (const obsoleteSelector of ['vault-filter-strip', 'vault-list-toolbar']) {
  if (popupCss.includes(obsoleteSelector)) {
    throw new Error(`obsolete popup layout is still bundled: ${obsoleteSelector}`)
  }
}

console.log('browser extension build verified')
