import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./LockOverlay.vue', import.meta.url),
  'utf8',
)

assert.doesNotMatch(
  source,
  /ShieldCheck|class="auth-mark"/,
  'the unlock card should not show a separate decorative shield icon',
)
assert.match(
  source,
  /class="plain-button shrink-0 px-2\.5"[\s\S]*?<ArrowLeft class="size-4" \/>[\s\S]*?t\("lock\.backToAccounts"\)/,
  'the account return action should use a visible icon and localized text label',
)
assert.match(
  source,
  /type="button"[\s\S]*?emit\('addAccount'\)[\s\S]*?<UserPlus class="size-4" \/>[\s\S]*?t\("lock\.addAccount"\)/,
  'the account picker should offer a visible add-account action',
)

console.log('lock overlay layout tests passed')
