<script setup lang="ts">
import { ChevronDown, Copy, QrCode as QrCodeIcon, Save, X } from '@lucide/vue'
import QRCode from 'qrcode'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@/stores/vault'

const props = defineProps<{
  revealedSecretKey: string
  revealError: string
  revealIssue: 'missing' | 'unsupported' | ''
  savingToDevice: boolean
}>()

const emit = defineEmits<{
  close: []
  copyValue: [value: string]
  saveSecretKeyToDevice: [secretKey: string]
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
const secretKeyQrDataUrl = ref('')
const secretKeyToSave = ref('')
const detailsOpen = ref(false)
const canSaveSecretKeyToDevice = computed(() => props.revealIssue === 'missing' && !props.revealedSecretKey)
const activeUser = computed(() => vaultStore.activeUser)
const accountLabel = computed(() => activeUser.value?.sync?.accountLabel || activeUser.value?.displayName || activeUser.value?.username || '')
const serverLabel = computed(() => {
  const sync = activeUser.value?.sync ?? vaultStore.settings.sync
  return sync.serverUrl || t('settings.accountDetailUnavailable')
})
const maskedSecretKey = computed(() => props.revealedSecretKey ? '••••••••••••••••' : '')

watch(
  () => props.revealedSecretKey,
  async (secretKey) => {
    secretKeyQrDataUrl.value = ''
    if (!secretKey) return

    try {
      secretKeyQrDataUrl.value = await QRCode.toDataURL(secretKey, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 236,
        color: {
          dark: '#111827',
          light: '#ffffff'
        }
      })
    } catch {
      secretKeyQrDataUrl.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => props.revealedSecretKey,
  (secretKey) => {
    if (secretKey) secretKeyToSave.value = ''
  }
)
</script>

<template>
  <div class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40 p-4">
    <button class="absolute inset-0 cursor-default" :aria-label="t('editor.cancel')" @click="emit('close')"></button>
    <section class="relative grid w-[680px] max-w-[94vw] gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
      <div class="flex items-start justify-between gap-4">
        <h2 class="text-xl font-black text-slate-950">{{ t('settings.setupAnotherDeviceTitle') }}</h2>
        <button class="icon-button" type="button" @click="emit('close')"><X class="size-4" /></button>
      </div>

      <div v-if="revealedSecretKey" class="grid gap-4">
        <div class="grid gap-5 md:grid-cols-[260px_minmax(0,1fr)] md:items-center">
          <div class="mx-auto grid size-[260px] place-items-center rounded-lg border border-slate-200 bg-white p-3 text-slate-700">
            <img v-if="secretKeyQrDataUrl" class="size-full rounded-md" :src="secretKeyQrDataUrl" :alt="t('settings.secretKeyQrAlt')" />
            <div v-else class="grid place-items-center gap-1 text-xs font-bold">
              <QrCodeIcon class="size-12" />
              <span>QR</span>
            </div>
          </div>
          <div class="grid content-center gap-4">
            <h3 class="text-base font-black text-slate-950">{{ t('settings.setupAnotherDeviceQrTitle') }}</h3>
            <ol class="grid gap-3 text-sm leading-6 text-slate-600">
              <li class="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
                <span class="grid size-6 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">1</span>
                <span>{{ t('settings.setupAnotherDeviceStepOne') }}</span>
              </li>
              <li class="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
                <span class="grid size-6 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">2</span>
                <span>{{ t('settings.setupAnotherDeviceStepTwo') }}</span>
              </li>
              <li class="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
                <span class="grid size-6 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">3</span>
                <span>{{ t('settings.setupAnotherDeviceStepThree') }}</span>
              </li>
            </ol>
          </div>
        </div>

        <button
          class="plain-button justify-center"
          type="button"
          @click="detailsOpen = !detailsOpen"
        >
          {{ detailsOpen ? t('settings.hideAccountDetails') : t('settings.showAccountDetails') }}
          <ChevronDown class="size-4" :class="{ 'rotate-180': detailsOpen }" />
        </button>

        <div v-if="detailsOpen" class="overflow-hidden rounded-lg border border-slate-200">
          <div class="grid border-b border-slate-200 px-4 py-3">
            <span class="text-xs font-semibold text-violet-700">{{ t('settings.loginAddress') }}</span>
            <span class="truncate text-sm font-medium text-slate-900">{{ serverLabel || t('settings.accountDetailUnavailable') }}</span>
          </div>
          <div class="grid border-b border-slate-200 px-4 py-3">
            <span class="text-xs font-semibold text-violet-700">{{ t('settings.emailAddress') }}</span>
            <span class="truncate text-sm font-medium text-slate-900">{{ accountLabel || t('settings.accountDetailUnavailable') }}</span>
          </div>
          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center bg-blue-50">
            <div class="min-w-0 px-4 py-3">
              <span class="block text-xs font-semibold text-violet-700">{{ t('user.secretKey') }}</span>
              <span class="block truncate font-mono text-sm font-bold tracking-wide text-slate-900">{{ maskedSecretKey }}</span>
            </div>
            <button
              class="flex h-full min-h-12 items-center gap-2 border-l border-blue-100 px-4 text-sm font-bold text-slate-800 hover:bg-blue-100"
              type="button"
              @click="emit('copyValue', revealedSecretKey)"
            >
              <Copy class="size-4" />
              {{ t('quick.copy') }}
            </button>
          </div>
        </div>
      </div>

      <div v-else class="grid gap-4">
        <p v-if="revealError" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ revealError }}</p>

        <div v-if="canSaveSecretKeyToDevice" class="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <textarea
            v-model="secretKeyToSave"
            class="form-input min-h-24 resize-y font-mono text-sm"
            :placeholder="t('settings.secretKeyBindPlaceholder')"
            autocomplete="off"
            spellcheck="false"
          ></textarea>
          <button
            class="plain-button justify-self-start"
            type="button"
            :disabled="savingToDevice || !secretKeyToSave.trim()"
            @click="emit('saveSecretKeyToDevice', secretKeyToSave)"
          >
            <Save class="size-4" />
            {{ t('settings.secretKeySaveToDevice') }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
