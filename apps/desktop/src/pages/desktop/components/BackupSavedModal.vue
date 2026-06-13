<script setup lang="ts">
import { CheckCircle2, Copy, FolderOpen, X } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TextFileSaveResult } from '@/services/backup'

const props = defineProps<{
  result: TextFileSaveResult
}>()

const emit = defineEmits<{
  close: []
  copyPath: [value: string]
  openDirectory: [path: string]
}>()

const { t } = useI18n()

const fileName = computed(() => {
  if (props.result.target === 'browser') return props.result.fileName
  const normalized = props.result.path.replace(/\\/g, '/')
  return normalized.split('/').pop() || props.result.path
})

const savedPath = computed(() => props.result.target === 'tauri' ? props.result.path : '')
</script>

<template>
  <div class="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 px-4">
    <section class="grid w-[520px] max-w-full gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true">
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
            <CheckCircle2 class="size-5" />
          </div>
          <div class="grid min-w-0 gap-1">
            <h3 class="text-base font-bold text-slate-950">{{ t('backup.savedTitle') }}</h3>
            <p class="text-sm leading-6 text-slate-500">{{ t('backup.savedBody') }}</p>
          </div>
        </div>
        <button class="icon-button" type="button" :title="t('editor.close')" :aria-label="t('editor.close')" @click="emit('close')">
          <X class="size-4" />
        </button>
      </div>

      <div class="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div class="grid gap-1">
          <span class="text-xs font-bold text-slate-500">{{ t('backup.savedFileName') }}</span>
          <code class="break-all font-mono text-xs text-slate-800">{{ fileName }}</code>
        </div>
        <div class="grid gap-1">
          <span class="text-xs font-bold text-slate-500">{{ t('backup.savedLocation') }}</span>
          <code class="break-all font-mono text-xs text-slate-800">
            {{ savedPath || t('backup.browserDownloadLocation') }}
          </code>
        </div>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <button v-if="savedPath" class="plain-button" type="button" @click="emit('copyPath', savedPath)">
          <Copy class="size-4" />
          {{ t('backup.copyPath') }}
        </button>
        <button v-if="savedPath" class="primary-button" type="button" @click="emit('openDirectory', savedPath)">
          <FolderOpen class="size-4" />
          {{ t('backup.openDirectory') }}
        </button>
        <button class="plain-button" type="button" @click="emit('close')">{{ t('editor.close') }}</button>
      </div>
    </section>
  </div>
</template>
