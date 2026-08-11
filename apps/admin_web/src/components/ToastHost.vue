<script setup lang="ts">
import { CircleCheck } from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{
  message: string | null
}>()

const visible = computed(() => Boolean(props.message))
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="-translate-y-2 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="-translate-y-2 opacity-0"
  >
    <div
      v-if="visible"
      class="pointer-events-none fixed left-1/2 top-5 z-[100] flex min-h-10 max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-slate-100 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-xl shadow-slate-900/15"
      role="status"
      aria-live="polite"
    >
      <CircleCheck class="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
      <span>{{ message }}</span>
    </div>
  </Transition>
</template>
