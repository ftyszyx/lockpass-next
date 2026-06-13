<script setup lang="ts">
defineProps<{
  visible: boolean
  message: string
}>()
</script>

<template>
  <div v-if="visible" class="fixed bottom-4 right-4 z-[80] min-w-56 rounded-lg border border-teal-100 bg-white px-4 py-3 shadow-2xl">
    {{ message }}
  </div>
</template>
