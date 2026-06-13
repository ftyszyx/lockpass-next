<script setup lang="ts">
import type { ResizeTarget } from '../types'

const props = defineProps<{
  active: boolean
  label: string
  target: ResizeTarget
}>()

const emit = defineEmits<{
  resizeKeydown: [event: KeyboardEvent, target: ResizeTarget]
  resizeStart: [event: PointerEvent, target: ResizeTarget]
}>()
</script>

<template>
  <button
    type="button"
    class="resize-handle"
    :aria-label="label"
    :data-active="active"
    :title="label"
    @keydown="emit('resizeKeydown', $event, props.target)"
    @pointerdown="emit('resizeStart', $event, props.target)"
  ></button>
</template>
