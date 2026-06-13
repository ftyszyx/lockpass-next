<script setup lang="ts">
import { Inbox } from '@lucide/vue'

defineProps<{
  title: string
  body?: string
}>()
</script>

<template>
  <div class="grid min-h-40 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
    <div class="grid gap-2 justify-items-center">
      <Inbox class="size-8 text-slate-400" />
      <strong class="text-sm text-slate-800">{{ title }}</strong>
      <p v-if="body" class="m-0 max-w-sm text-sm text-slate-500">{{ body }}</p>
    </div>
  </div>
</template>
