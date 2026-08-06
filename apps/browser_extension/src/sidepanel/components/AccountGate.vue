<script setup lang="ts">
import { KeyRound, LockKeyhole, LogIn } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  signedOut: boolean
  requiresSecretKey: boolean
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  login: []
  register: []
  unlock: [input: { password: string; secretKey?: string }]
}>()

const { t } = useI18n()
const password = ref('')
const secretKey = ref('')
const canUnlock = computed(() => (
  !props.busy &&
  Boolean(password.value) &&
  (!props.requiresSecretKey || Boolean(secretKey.value.trim()))
))

function submitUnlock(): void {
  if (!canUnlock.value) return
  emit('unlock', {
    password: password.value,
    secretKey: props.requiresSecretKey ? secretKey.value.trim() : undefined
  })
}
</script>

<template>
  <main class="gate-view">
    <div class="gate-content">
      <span class="gate-icon">
        <KeyRound v-if="signedOut" class="size-7" />
        <LockKeyhole v-else class="size-7" />
      </span>
      <div class="gate-copy">
        <h1>{{ t(signedOut ? 'auth.signedOutTitle' : 'auth.lockedTitle') }}</h1>
        <p>{{ t(signedOut ? 'auth.signedOutBody' : requiresSecretKey ? 'auth.firstUnlockBody' : 'auth.lockedBody') }}</p>
      </div>

      <template v-if="signedOut">
        <button class="primary-button wide-button" type="button" :disabled="busy" @click="emit('login')">
          <LogIn class="size-4" />
          {{ t('auth.login') }}
        </button>
        <button class="plain-button wide-button" type="button" :disabled="busy" @click="emit('register')">
          {{ t('auth.createAccount') }}
        </button>
      </template>

      <form v-else class="gate-form" @submit.prevent="submitUnlock">
        <label class="form-label">
          <span>{{ t('auth.masterPassword') }}</span>
          <input
            v-model="password"
            class="form-input"
            type="password"
            autocomplete="current-password"
            autofocus
          />
        </label>
        <label v-if="requiresSecretKey" class="form-label">
          <span>{{ t('auth.secretKey') }}</span>
          <input
            v-model="secretKey"
            class="form-input"
            type="password"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :placeholder="t('auth.secretKeyPlaceholder')"
          />
        </label>
        <button class="primary-button wide-button" type="submit" :disabled="!canUnlock">
          {{ busy ? t('auth.unlocking') : t('auth.unlock') }}
        </button>
      </form>

      <p v-if="error" class="gate-error">{{ error }}</p>
    </div>
  </main>
</template>
