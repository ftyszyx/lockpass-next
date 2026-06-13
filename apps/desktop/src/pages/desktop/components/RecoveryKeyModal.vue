<script setup lang="ts">
import { Copy, KeyRound, QrCode as QrCodeIcon, Save, X } from '@lucide/vue'
import QRCode from 'qrcode'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
  revealPassword: string
  revealedRecoveryKey: string
  revealError: string
  revealIssue: 'missing' | 'unsupported' | ''
  savingToDevice: boolean
}>()

const emit = defineEmits<{
  close: []
  copyValue: [value: string]
  updateRevealPassword: [value: string]
  revealRecoveryKey: []
  saveRecoveryKeyToDevice: [recoveryKey: string]
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
const recoveryKeyQrDataUrl = ref('')
const recoveryKeyToSave = ref('')
const canSaveRecoveryKeyToDevice = computed(() => props.revealIssue === 'missing' && !props.revealedRecoveryKey)

watch(
  () => props.revealedRecoveryKey,
  async (recoveryKey) => {
    recoveryKeyQrDataUrl.value = ''
    if (!recoveryKey) return

    try {
      recoveryKeyQrDataUrl.value = await QRCode.toDataURL(recoveryKey, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 176,
        color: {
          dark: '#111827',
          light: '#ffffff'
        }
      })
    } catch {
      recoveryKeyQrDataUrl.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => props.revealedRecoveryKey,
  (recoveryKey) => {
    if (recoveryKey) recoveryKeyToSave.value = ''
  }
)
</script>

<template>
  <div class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40 p-4">
    <button class="absolute inset-0 cursor-default" :aria-label="t('editor.cancel')" @click="emit('close')"></button>
    <section class="relative grid w-[520px] max-w-[94vw] gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" :class="{ 'pt-11': revealedRecoveryKey }">
      <button class="icon-button absolute right-3 top-3 z-10" type="button" @click="emit('close')"><X class="size-4" /></button>

      <form v-if="!revealedRecoveryKey" class="grid gap-4" @submit.prevent="emit('revealRecoveryKey')">
        <div class="grid gap-1 pr-10">
          <div class="flex items-center gap-2 font-bold text-slate-950">
            <KeyRound class="size-4" />
            {{ t('settings.recoveryKeyTitle') }}
          </div>
          <p class="text-sm leading-6 text-slate-500">{{ t('settings.recoveryKeyBody') }}</p>
        </div>

        <input
          class="form-input"
          type="password"
          autocomplete="current-password"
          :disabled="!vaultStore.unlocked"
          :value="revealPassword"
          :placeholder="t('settings.recoveryKeyPasswordPlaceholder')"
          @input="emit('updateRevealPassword', ($event.target as HTMLInputElement).value)"
        />
        <button class="plain-button justify-self-start" type="submit" :disabled="!vaultStore.unlocked">
          <KeyRound class="size-4" />
          {{ t('settings.recoveryKeyReveal') }}
        </button>

        <p v-if="revealError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ revealError }}</p>

        <div v-if="canSaveRecoveryKeyToDevice" class="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <textarea
            v-model="recoveryKeyToSave"
            class="form-input min-h-24 resize-y font-mono text-sm"
            :placeholder="t('settings.recoveryKeyBindPlaceholder')"
            autocomplete="off"
            spellcheck="false"
          ></textarea>
          <button
            class="plain-button justify-self-start"
            type="button"
            :disabled="savingToDevice || !recoveryKeyToSave.trim()"
            @click="emit('saveRecoveryKeyToDevice', recoveryKeyToSave)"
          >
            <Save class="size-4" />
            {{ t('settings.recoveryKeySaveToDevice') }}
          </button>
        </div>
      </form>

      <div v-if="revealedRecoveryKey" class="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <code class="break-words font-mono text-sm leading-6">{{ revealedRecoveryKey }}</code>
          <div class="grid aspect-square place-items-center rounded-lg border border-amber-300 bg-white text-amber-900">
            <img v-if="recoveryKeyQrDataUrl" class="size-full rounded-lg" :src="recoveryKeyQrDataUrl" :alt="t('settings.recoveryKeyQrAlt')" />
            <div v-else class="grid place-items-center gap-1 text-xs font-bold">
              <QrCodeIcon class="size-10" />
              <span>QR</span>
            </div>
          </div>
        </div>
        <p class="text-xs text-amber-800">{{ t('settings.recoveryKeyQrHint') }}</p>
        <button class="plain-button justify-self-start" type="button" @click="emit('copyValue', revealedRecoveryKey)">
          <Copy class="size-4" />
          {{ t('quick.copy') }}
        </button>
      </div>
    </section>
  </div>
</template>
