<script setup lang="ts">
import { KeyRound, LockKeyhole, LogIn, Pencil, Server, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { normalizeSelfHostServerUrl } from '@/services/extensionServer'
import type { ExtensionServerSettings } from '@/shared/models'

const props = defineProps<{
  signedOut: boolean
  requiresSecretKey: boolean
  serverSettings: ExtensionServerSettings
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  login: []
  register: []
  serverChange: [settings: ExtensionServerSettings]
  unlock: [input: { password: string; secretKey?: string }]
}>()

const { t } = useI18n()
const password = ref('')
const secretKey = ref('')
const serverDialogOpen = ref(false)
const serverUrlDraft = ref('')
const serverUrlError = ref('')
const canUnlock = computed(() => (
  !props.busy &&
  Boolean(password.value) &&
  (!props.requiresSecretKey || Boolean(secretKey.value.trim()))
))
const canAuthenticate = computed(() => (
  !props.busy &&
  (props.serverSettings.mode === 'official' || Boolean(props.serverSettings.selfHostUrl))
))

function selectServer(event: Event): void {
  const select = event.currentTarget as HTMLSelectElement
  const mode = select.value
  if (mode === 'official') {
    emit('serverChange', { mode: 'official', selfHostUrl: props.serverSettings.selfHostUrl })
    return
  }
  select.value = props.serverSettings.mode
  openServerDialog()
}

function openServerDialog(): void {
  serverUrlDraft.value = props.serverSettings.selfHostUrl
  serverUrlError.value = ''
  serverDialogOpen.value = true
}

function closeServerDialog(): void {
  if (props.busy) return
  serverDialogOpen.value = false
  serverUrlError.value = ''
}

function saveServer(): void {
  try {
    const selfHostUrl = normalizeSelfHostServerUrl(serverUrlDraft.value)
    emit('serverChange', { mode: 'selfhost', selfHostUrl })
    serverDialogOpen.value = false
    serverUrlError.value = ''
  } catch (cause) {
    serverUrlError.value = t(
      cause instanceof Error && cause.message === 'server-url-required'
        ? 'error.serverUrlRequired'
        : 'error.serverUrlInvalid'
    )
  }
}

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
        <label class="form-label server-selector">
          <span>{{ t('auth.server') }}</span>
          <select class="form-input" :value="serverSettings.mode" :disabled="busy" @change="selectServer">
            <option value="official">{{ t('auth.officialServer') }}</option>
            <option value="selfhost">{{ t('auth.selfHostedServer') }}</option>
          </select>
        </label>
        <button
          v-if="serverSettings.mode === 'selfhost'"
          class="server-summary"
          type="button"
          :disabled="busy"
          :title="t('auth.editServer')"
          @click="openServerDialog"
        >
          <Server />
          <span>{{ serverSettings.selfHostUrl }}</span>
          <Pencil />
        </button>
        <button class="primary-button wide-button" type="button" :disabled="!canAuthenticate" @click="emit('login')">
          <LogIn class="size-4" />
          {{ t('auth.login') }}
        </button>
        <button class="plain-button wide-button" type="button" :disabled="!canAuthenticate" @click="emit('register')">
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

    <div v-if="serverDialogOpen" class="server-dialog-backdrop" @pointerdown.self="closeServerDialog">
      <section class="server-dialog" role="dialog" aria-modal="true" :aria-label="t('auth.customServerTitle')">
        <header class="server-dialog-header">
          <strong>{{ t('auth.customServerTitle') }}</strong>
          <button class="icon-button" type="button" :title="t('auth.cancel')" @click="closeServerDialog">
            <X />
          </button>
        </header>
        <form class="server-dialog-form" @submit.prevent="saveServer">
          <label class="form-label">
            <span>{{ t('auth.customServerUrl') }}</span>
            <input
              v-model="serverUrlDraft"
              class="form-input"
              type="text"
              inputmode="url"
              autocomplete="url"
              spellcheck="false"
              autofocus
              :placeholder="t('auth.customServerPlaceholder')"
            />
          </label>
          <p v-if="serverUrlError" class="gate-error">{{ serverUrlError }}</p>
          <footer class="server-dialog-actions">
            <button class="plain-button" type="button" :disabled="busy" @click="closeServerDialog">
              {{ t('auth.cancel') }}
            </button>
            <button class="primary-button" type="submit" :disabled="busy">
              {{ t('auth.saveServer') }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </main>
</template>
