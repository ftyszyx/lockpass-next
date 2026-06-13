<script setup lang="ts">
import { BriefcaseBusiness, CreditCard, FolderLock, House, KeyRound, Save, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { VaultDraft } from '../types'

defineProps<{
  draft: VaultDraft
}>()

const emit = defineEmits<{
  close: []
  save: []
}>()

const { t } = useI18n()

const iconOptions = [
  { value: 'folder-lock', labelKey: 'vault.folder', icon: FolderLock },
  { value: 'briefcase-business', labelKey: 'vault.work', icon: BriefcaseBusiness },
  { value: 'home', labelKey: 'vault.home', icon: House },
  { value: 'credit-card', labelKey: 'vault.finance', icon: CreditCard },
  { value: 'key-round', labelKey: 'vault.key', icon: KeyRound }
] as const
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/40">
    <section class="w-[460px] rounded-lg border border-slate-200 bg-white shadow-2xl">
      <div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4">
        <h3 class="font-bold">{{ t('vault.newTitle') }}</h3>
        <button class="icon-button" @click="emit('close')"><X class="size-4" /></button>
      </div>
      <div class="grid gap-3 p-4">
        <label class="form-label">{{ t('vault.name') }}<input v-model="draft.name" class="form-input" /></label>
        <label class="form-label">{{ t('vault.description') }}<input v-model="draft.description" class="form-input" /></label>
        <div class="form-label">
          {{ t('vault.icon') }}
          <div class="grid grid-cols-5 gap-2">
            <button
              v-for="option in iconOptions"
              :key="option.value"
              class="grid min-h-16 place-items-center gap-1 rounded-lg border px-2 py-2 text-xs font-bold transition"
              :class="draft.icon === option.value ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'"
              type="button"
              :title="t(option.labelKey)"
              @click="draft.icon = option.value"
            >
              <component :is="option.icon" class="size-5" />
              <span class="max-w-full truncate">{{ t(option.labelKey) }}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-200 p-4">
        <button class="plain-button" @click="emit('close')">{{ t('editor.cancel') }}</button>
        <button class="primary-button" @click="emit('save')"><Save class="size-4" />{{ t('editor.save') }}</button>
      </div>
    </section>
  </div>
</template>
