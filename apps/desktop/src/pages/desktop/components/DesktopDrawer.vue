<script setup lang="ts">
import {
  Copy,
  RefreshCw,
  Save,
  X
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { PasswordOptions } from '../types'

const props = defineProps<{
  generatedPassword: string
  passwordOptions: PasswordOptions
  canUsePassword: boolean
}>()

const emit = defineEmits<{
  close: []
  copyValue: [value: string]
  regenerate: []
  usePassword: []
}>()

const { t } = useI18n()

function regenerateAfterSymbolToggle(): void {
  if (props.passwordOptions.symbols && props.passwordOptions.symbolCount < 1) {
    props.passwordOptions.symbolCount = 1
  }
  emit('regenerate')
}

function updateSymbolCount(): void {
  const maxCount = Math.max(1, props.passwordOptions.length)
  const nextCount = Math.trunc(Number(props.passwordOptions.symbolCount) || 1)
  props.passwordOptions.symbolCount = Math.min(Math.max(1, nextCount), maxCount)
  emit('regenerate')
}

function updatePasswordLength(): void {
  if (props.passwordOptions.symbols) {
    props.passwordOptions.symbolCount = Math.min(
      props.passwordOptions.symbolCount,
      props.passwordOptions.length
    )
  }
  emit('regenerate')
}
</script>

<template>
  <div class="fixed inset-0 z-[70]">
    <button class="absolute inset-0 bg-slate-950/40" aria-label="Close" @click="emit('close')"></button>
    <aside class="absolute right-0 top-0 flex h-[100dvh] w-[420px] max-w-[94vw] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl">
      <div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4">
        <h3 class="font-bold">
          {{ t('drawer.passwordGenerator') }}
        </h3>
        <button class="icon-button" @click="emit('close')"><X class="size-4" /></button>
      </div>

      <div class="grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
          <code class="break-words font-mono">{{ generatedPassword }}</code>
          <button class="icon-button" @click="emit('copyValue', generatedPassword)"><Copy class="size-4" /></button>
        </div>
        <label class="grid gap-2 text-sm font-bold text-slate-500">
          {{ t('drawer.length') }}
          <div class="grid grid-cols-[1fr_42px] items-center gap-2">
            <input v-model.number="passwordOptions.length" type="range" min="8" max="32" @input="updatePasswordLength" />
            <strong class="text-slate-950">{{ passwordOptions.length }}</strong>
          </div>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="check"><input v-model="passwordOptions.uppercase" type="checkbox" @change="emit('regenerate')" />{{ t('drawer.uppercase') }}</label>
          <label class="check"><input v-model="passwordOptions.numbers" type="checkbox" @change="emit('regenerate')" />{{ t('drawer.numbers') }}</label>
          <label class="grid min-h-9 grid-cols-[minmax(0,1fr)_64px] items-center gap-2 rounded-lg border border-slate-200 px-2 text-sm">
            <span class="inline-flex items-center gap-2">
              <input v-model="passwordOptions.symbols" type="checkbox" @change="regenerateAfterSymbolToggle" />
              {{ t('drawer.symbols') }}
            </span>
            <input
              v-model.number="passwordOptions.symbolCount"
              class="h-7 rounded-md border border-slate-200 bg-white px-2 text-right text-sm font-bold text-slate-900 outline-none focus:border-sky-300"
              type="number"
              min="1"
              :max="passwordOptions.length"
              :aria-label="t('drawer.symbolCount')"
              :disabled="!passwordOptions.symbols"
              @change="updateSymbolCount"
            />
          </label>
          <label class="check"><input v-model="passwordOptions.avoidAmbiguous" type="checkbox" @change="emit('regenerate')" />{{ t('drawer.readable') }}</label>
        </div>
        <button class="primary-button" @click="emit('regenerate')">
          <RefreshCw class="size-4" />
          {{ t('drawer.regenerate') }}
        </button>
        <button v-if="canUsePassword" class="plain-button" @click="emit('usePassword')">
          <Save class="size-4" />
          {{ t('drawer.usePassword') }}
        </button>
      </div>

    </aside>
  </div>
</template>
