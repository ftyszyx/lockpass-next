<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  modelValue?: string | null
  showLabel: string
  hideLabel: string
  disabled?: boolean
  readonly?: boolean
  containerClass?: string
}>(), {
  disabled: false,
  readonly: false,
  containerClass: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const input = ref<HTMLInputElement | null>(null)
const visible = ref(false)

function updateValue(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function focus(options?: FocusOptions): void {
  input.value?.focus(options)
}

function select(): void {
  input.value?.select()
}

defineExpose({ focus, select })
</script>

<template>
  <span class="lp-password-input" :class="containerClass">
    <input
      ref="input"
      v-bind="$attrs"
      :value="modelValue ?? ''"
      :type="visible ? 'text' : 'password'"
      :disabled="disabled"
      :readonly="readonly"
      @input="updateValue"
    />
    <button
      class="lp-password-input-toggle"
      type="button"
      :title="visible ? hideLabel : showLabel"
      :aria-label="visible ? hideLabel : showLabel"
      :aria-pressed="visible"
      :disabled="disabled"
      @pointerdown.prevent
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" aria-hidden="true" />
      <Eye v-else aria-hidden="true" />
    </button>
  </span>
</template>

<style scoped>
.lp-password-input {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
}

.lp-password-input :deep(input) {
  padding-right: 2.75rem !important;
}

/* WebView2/Edge can add a second native password reveal button. */
.lp-password-input :deep(input::-ms-reveal),
.lp-password-input :deep(input::-ms-clear) {
  display: none;
}

.lp-password-input-toggle {
  position: absolute;
  top: 50%;
  right: 0.375rem;
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: #64748b;
  background: transparent;
  border: 0;
  border-radius: 0.375rem;
  cursor: pointer;
  transform: translateY(-50%);
}

.lp-password-input-toggle:hover:not(:disabled) {
  color: #0f766e;
  background: rgb(15 118 110 / 8%);
}

.lp-password-input-toggle:focus-visible {
  outline: 2px solid #0f766e;
  outline-offset: 1px;
}

.lp-password-input-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.lp-password-input-toggle svg {
  width: 1rem;
  height: 1rem;
}
</style>
