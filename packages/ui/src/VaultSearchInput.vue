<script setup lang="ts">
import { Search } from '@lucide/vue'

defineProps<{
  modelValue: string
  placeholder: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="lp-vault-search">
    <Search class="lp-vault-search-icon" aria-hidden="true" />
    <input
      class="lp-vault-search-input"
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
