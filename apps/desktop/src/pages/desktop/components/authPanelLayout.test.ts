import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const componentNames = [
  'LockOverlay.vue',
  'UserSetupModal.vue',
  'ServerAccountModal.vue',
]

for (const componentName of componentNames) {
  const source = readFileSync(new URL(`./${componentName}`, import.meta.url), 'utf8')

  assert.doesNotMatch(
    source,
    /ShieldCheck|class="auth-mark"/,
    `${componentName} should not show a decorative shield above its content`,
  )
}

const setupSource = readFileSync(
  new URL('./UserSetupModal.vue', import.meta.url),
  'utf8',
)

assert.doesNotMatch(
  setupSource,
  /inline-flex size-10[\s\S]*?<KeyRound/,
  'the Secret Key step should not show a separate decorative icon above its content',
)

console.log('auth panel layout tests passed')
