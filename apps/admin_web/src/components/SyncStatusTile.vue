<script setup lang="ts">
import type { Component } from 'vue'
import StatusPill from '@/components/StatusPill.vue'

defineProps<{
  icon: Component
  title: string
  description: string
  status: string
  tone?: 'ok' | 'warn' | 'danger' | 'neutral'
}>()
</script>

<template>
  <div class="grid min-h-32 grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-lg border border-slate-200 bg-white p-4">
    <div class="flex items-start justify-between gap-3">
      <span class="lp-icon-tile shrink-0">
        <component :is="icon" class="size-4" />
      </span>
      <StatusPill :tone="tone">{{ status }}</StatusPill>
    </div>
    <div class="grid content-end gap-1">
      <strong class="text-sm text-slate-950">{{ title }}</strong>
      <p class="m-0 text-sm leading-6 text-slate-500">{{ description }}</p>
    </div>
  </div>
</template>
