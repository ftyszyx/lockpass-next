<script setup lang="ts">
defineProps<{
  tone?: 'ok' | 'warn' | 'danger' | 'neutral'
}>()
</script>

<template>
  <span
    class="lp-pill"
    :class="{
      'lp-pill-ok': tone === 'ok',
      'lp-pill-warn': tone === 'warn',
      'lp-pill-danger': tone === 'danger'
    }"
  >
    <slot />
  </span>
</template>
