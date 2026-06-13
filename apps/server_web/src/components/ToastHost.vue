<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  message: string | null
}>()

const visible = computed(() => Boolean(props.message))
</script>

<template>
  <Transition
    enter-active-class="transition duration-150"
    enter-from-class="translate-y-2 opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="translate-y-2 opacity-0"
  >
    <div
      v-if="visible"
      class="fixed bottom-4 right-4 z-50 rounded-lg border border-teal-100 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-xl shadow-slate-900/10"
    >
      {{ message }}
    </div>
  </Transition>
</template>
