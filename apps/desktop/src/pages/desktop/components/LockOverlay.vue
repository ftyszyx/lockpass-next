<script setup lang="ts">
import { ArrowLeft, Cloud, RotateCcw, Unlock, UserPlus } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
  activeUserName: string
  activeUserInitials: string
  authError: string
  password: string
  recoveryKey: string
  unlocking: boolean
}>()

const emit = defineEmits<{
  unlock: []
  useSavedRecoveryKey: []
  createNewUser: []
  clearAuthError: []
  switchUser: [userId: string]
  'update:password': [value: string]
  'update:recoveryKey': [value: string]
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
const unlockStep = ref<'password' | 'choice' | 'recovery'>('password')
const canUsePasswordlessUnlock = computed(() => Boolean(vaultStore.passwordlessUnlockSupported && vaultStore.activeUser?.crypto?.fastUnlock))

watch(
  () => props.activeUserName,
  () => {
    unlockStep.value = 'password'
    emit('update:recoveryKey', '')
  }
)

function clearErrorAndRecoveryKey(): void {
  emit('clearAuthError')
  emit('update:recoveryKey', '')
}

function showRecoveryChoice(): void {
  clearErrorAndRecoveryKey()
  unlockStep.value = 'choice'
}

function showRecoveryInput(): void {
  clearErrorAndRecoveryKey()
  unlockStep.value = 'recovery'
}

function backToPassword(): void {
  clearErrorAndRecoveryKey()
  unlockStep.value = 'password'
}

function backToChoice(): void {
  clearErrorAndRecoveryKey()
  unlockStep.value = 'choice'
}

function createNewUser(): void {
  clearErrorAndRecoveryKey()
  emit('createNewUser')
}

function submitUnlock(): void {
  if (unlockStep.value === 'recovery') {
    emit('unlock')
    return
  }

  if (unlockStep.value === 'choice') return

  emit('useSavedRecoveryKey')
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-teal-50/90 backdrop-blur">
    <form class="grid w-[400px] max-w-[94vw] gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-2xl" @submit.prevent="submitUnlock">
      <div v-if="unlockStep === 'choice'" class="grid gap-3">
        <button class="plain-button justify-self-start" type="button" @click="backToPassword">
          <ArrowLeft class="size-4" />
          {{ t('lock.backToUnlock') }}
        </button>
        <button class="grid min-h-20 gap-1 rounded-lg border border-teal-200 bg-teal-50 p-4 text-left hover:border-teal-400" type="button" @click="createNewUser">
          <span class="flex items-center gap-2 font-bold text-teal-950"><UserPlus class="size-4" />{{ t('lock.newUserTitle') }}</span>
          <span class="text-sm text-teal-800">{{ t('lock.newUserBody') }}</span>
        </button>
        <button class="grid min-h-20 gap-1 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-slate-400" type="button" @click="showRecoveryInput">
          <span class="flex items-center gap-2 font-bold"><Cloud class="size-4" />{{ t('lock.existingUserTitle') }}</span>
          <span class="text-sm text-slate-500">{{ t('lock.existingUserBody') }}</span>
        </button>
      </div>
      <div v-else-if="unlockStep === 'recovery'" class="grid gap-3">
        <button class="plain-button justify-self-start" type="button" @click="backToChoice">
          <ArrowLeft class="size-4" />
          {{ t('lock.backToChoice') }}
        </button>
        <input
          :value="password"
          class="form-input"
          autocomplete="current-password"
          type="password"
          :placeholder="t('lock.passwordPlaceholder')"
          @input="emit('update:password', ($event.target as HTMLInputElement).value)"
        />
        <textarea
          :value="recoveryKey"
          class="form-input min-h-24 font-mono text-sm"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('lock.recoveryKeyPlaceholder')"
          @input="emit('update:recoveryKey', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <p v-if="authError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ authError }}</p>
        <button class="primary-button" type="submit" :disabled="unlocking">
          <Unlock class="size-4" />
          {{ unlocking ? t('lock.unlocking') : t('lock.unlockWithRecoveryKey') }}
        </button>
      </div>
      <template v-else>
        <div class="flex items-center gap-3 font-bold">
          <span class="grid size-9 place-items-center rounded-lg bg-[#10201e] text-white">{{ activeUserInitials }}</span>
          <span>{{ activeUserName }}<small class="block text-xs text-slate-500">{{ t('app.locked') }}</small></span>
        </div>
        <h2 class="text-2xl font-black">{{ t('lock.title') }}</h2>
        <p class="text-sm text-slate-500">{{ canUsePasswordlessUnlock ? t('lock.fastUnlockBody') : t('lock.body') }}</p>
        <select
          v-if="vaultStore.users.length > 1"
          class="form-input"
          :value="vaultStore.activeUserId ?? ''"
          @change="emit('switchUser', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="user in vaultStore.users" :key="user.id" :value="user.id">{{ user.displayName }}</option>
        </select>
        <input
          v-if="!canUsePasswordlessUnlock"
          :value="password"
          class="form-input"
          autocomplete="current-password"
          type="password"
          :placeholder="t('lock.passwordPlaceholder')"
          @input="emit('update:password', ($event.target as HTMLInputElement).value)"
        />
        <button class="plain-button justify-self-start" type="button" @click="showRecoveryChoice">
          <RotateCcw class="size-4" />
          {{ t('lock.useRecoveryKey') }}
        </button>
        <p v-if="authError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ authError }}</p>
        <button class="primary-button" type="submit" :disabled="unlocking">
          <Unlock class="size-4" />
          {{ unlocking ? t('lock.unlocking') : canUsePasswordlessUnlock ? t('lock.fastUnlock') : t('app.unlock') }}
        </button>
      </template>
    </form>
  </div>
</template>
