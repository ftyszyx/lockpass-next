<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'

defineProps<{
  visible: boolean
  title: string
  body: string
}>()
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 px-4">
    <section
      class="grid w-[420px] max-w-full gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      aria-busy="true"
    >
      <div class="flex items-start gap-3">
        <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <RefreshCw class="size-5 animate-spin" />
        </div>
        <div class="grid min-w-0 gap-1">
          <h3 class="text-base font-bold text-slate-950">{{ title }}</h3>
          <p class="text-sm leading-6 text-slate-500">{{ body }}</p>
        </div>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" :aria-valuetext="title">
        <div class="operation-progress-bar h-full rounded-full bg-teal-600"></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.operation-progress-bar {
  width: 42%;
  animation: operation-progress-slide 1.1s ease-in-out infinite;
}

@keyframes operation-progress-slide {
  0% {
    transform: translateX(-110%);
  }

  50% {
    transform: translateX(80%);
  }

  100% {
    transform: translateX(240%);
  }
}
</style>
