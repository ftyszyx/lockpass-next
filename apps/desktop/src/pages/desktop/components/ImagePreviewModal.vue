<script setup lang="ts">
import { X } from '@lucide/vue'

defineProps<{
  visible: boolean
  title: string
  url: string
  loading: boolean
  error: string
  loadingText: string
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[120] grid place-items-center bg-slate-950/75 p-6" @pointerdown.self="emit('close')">
      <section class="flex max-h-[92vh] w-[min(980px,94vw)] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
        <div class="flex min-h-12 items-center justify-between gap-3 border-b border-white/10 px-4 text-white">
          <strong class="truncate">{{ title }}</strong>
          <button class="icon-button border-white/10 bg-white/5 text-white hover:bg-white/10" @click="emit('close')">
            <X class="size-4" />
          </button>
        </div>
        <div class="grid min-h-[260px] place-items-center overflow-auto bg-slate-900 p-4">
          <span v-if="loading" class="text-sm font-semibold text-slate-300">{{ loadingText }}</span>
          <span v-else-if="error" class="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100">
            {{ error }}
          </span>
          <img v-else-if="url" class="max-h-[78vh] max-w-full rounded-md object-contain" :src="url" :alt="title" />
        </div>
      </section>
    </div>
  </Teleport>
</template>
