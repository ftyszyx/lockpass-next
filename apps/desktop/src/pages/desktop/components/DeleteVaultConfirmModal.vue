<script setup lang="ts">
import { AlertTriangle, Trash2, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  vaultName: string
  itemCount: number
  deleting: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40">
    <section class="w-[440px] max-w-[94vw] rounded-lg border border-rose-200 bg-white shadow-2xl">
      <div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4">
        <h3 class="font-bold">{{ t('vault.deleteTitle') }}</h3>
        <button class="icon-button" type="button" :disabled="deleting" @click="emit('close')"><X class="size-4" /></button>
      </div>
      <div class="grid gap-4 p-4">
        <div class="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">
          <AlertTriangle class="mt-0.5 size-5 shrink-0" />
          <div class="grid gap-1 text-sm leading-5">
            <strong>{{ t('vault.deleteSummary', { name: vaultName }) }}</strong>
            <span>{{ t('vault.deleteBody', { count: itemCount }) }}</span>
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-200 p-4">
        <button class="plain-button" type="button" :disabled="deleting" @click="emit('close')">{{ t('editor.cancel') }}</button>
        <button class="danger-button" type="button" :disabled="deleting" @click="emit('confirm')">
          <Trash2 class="size-4" />
          {{ deleting ? t('vault.deleting') : t('vault.deleteAction') }}
        </button>
      </div>
    </section>
  </div>
</template>
