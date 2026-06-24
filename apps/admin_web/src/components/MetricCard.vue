<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  hint?: string
}>()
</script>

<template>
  <div class="grid min-h-24 gap-2 rounded-lg border border-slate-200 bg-white p-4">
    <span class="text-xs font-bold text-slate-500">{{ label }}</span>
    <strong class="text-2xl text-slate-950">{{ value }}</strong>
    <small v-if="hint" class="text-xs text-slate-500">{{ hint }}</small>
  </div>
</template>
