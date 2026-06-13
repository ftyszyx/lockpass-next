<script setup lang="ts">
import { LogIn, UsersRound, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  fromUserName: string
  toUserName: string
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40">
    <section class="w-[420px] max-w-[94vw] rounded-lg border border-slate-200 bg-white shadow-2xl">
      <div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4">
        <h3 class="font-bold">{{ t('user.switchUserConfirmTitle') }}</h3>
        <button class="icon-button" type="button" @click="emit('close')"><X class="size-4" /></button>
      </div>
      <div class="grid gap-3 p-4">
        <div class="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <UsersRound class="mt-0.5 size-5 shrink-0" />
          <p class="text-sm leading-6">{{ t('user.switchUserConfirmBody', { from: fromUserName, to: toUserName }) }}</p>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-200 p-4">
        <button class="plain-button" type="button" @click="emit('close')">{{ t('editor.cancel') }}</button>
        <button class="primary-button" type="button" @click="emit('confirm')">
          <LogIn class="size-4" />
          {{ t('user.switchUserConfirmAction') }}
        </button>
      </div>
    </section>
  </div>
</template>
