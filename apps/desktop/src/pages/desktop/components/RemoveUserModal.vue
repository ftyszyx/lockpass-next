<script setup lang="ts">
import { AlertTriangle, Trash2, X } from '@lucide/vue'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  userName: string
  removing: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const { t } = useI18n()
const confirmed = ref(false)

watch(
  () => props.userName,
  () => {
    confirmed.value = false
  },
  { immediate: true }
)
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/40">
    <section class="w-[440px] max-w-[94vw] rounded-lg border border-rose-200 bg-white shadow-2xl">
      <div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4">
        <h3 class="font-bold">{{ t('settings.removeUserTitle') }}</h3>
        <button class="icon-button" type="button" :disabled="removing" @click="emit('close')"><X class="size-4" /></button>
      </div>
      <div class="grid gap-4 p-4">
        <div class="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">
          <AlertTriangle class="mt-0.5 size-5 shrink-0" />
          <div class="grid gap-1 text-sm leading-5">
            <strong>{{ t('settings.removeUserSummary', { name: userName }) }}</strong>
            <span>{{ t('settings.removeUserBody') }}</span>
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm font-bold text-slate-700">
          <input v-model="confirmed" type="checkbox" />
          {{ t('settings.removeUserConfirm') }}
        </label>
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-200 p-4">
        <button class="plain-button" type="button" :disabled="removing" @click="emit('close')">{{ t('editor.cancel') }}</button>
        <button class="danger-button" type="button" :disabled="!confirmed || removing" @click="emit('confirm')">
          <Trash2 class="size-4" />
          {{ removing ? t('settings.removeUserRemoving') : t('settings.removeUserAction') }}
        </button>
      </div>
    </section>
  </div>
</template>
