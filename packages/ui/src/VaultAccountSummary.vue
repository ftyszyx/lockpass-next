<script setup lang="ts">
withDefaults(defineProps<{
  name: string
  initials: string
  statusLabel: string
  statusTone?: 'normal' | 'warning'
  countLabel?: string
  interactive?: boolean
}>(), {
  statusTone: 'normal',
  countLabel: '',
  interactive: false
})

const emit = defineEmits<{
  activate: []
}>()
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="lp-account-summary"
    :class="{ 'lp-account-summary-interactive': interactive }"
    :type="interactive ? 'button' : undefined"
    @click="interactive && emit('activate')"
  >
    <span class="lp-account-avatar">{{ initials }}</span>
    <span class="lp-account-copy">
      <strong>{{ name }}</strong>
      <span class="lp-account-status" :class="`lp-account-status-${statusTone}`">
        <span v-if="statusTone === 'normal'" class="lp-status-dot" aria-hidden="true"></span>
        <span>{{ statusLabel }}</span>
      </span>
    </span>
    <span v-if="countLabel || $slots.trailing" class="lp-account-trailing">
      <slot name="trailing">{{ countLabel }}</slot>
    </span>
  </component>
</template>
