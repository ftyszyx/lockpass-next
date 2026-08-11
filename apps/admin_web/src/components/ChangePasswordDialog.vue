<script setup lang="ts">
import { X } from '@lucide/vue'
import { PasswordInput } from '@lockpass/ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { t } from '@/i18n'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  close: []
  saved: []
}>()

const session = useSessionStore()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const validationError = ref('')
const currentPasswordInput = ref<InstanceType<typeof PasswordInput> | null>(null)
const errorMessage = computed(() => validationError.value || session.error || '')

watch(
  () => props.open,
  async (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (!open) return
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    validationError.value = ''
    session.clearError()
    await nextTick()
    currentPasswordInput.value?.focus()
  }
)

watch([currentPassword, newPassword, confirmPassword], () => {
  validationError.value = ''
  session.clearError()
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})

function close() {
  if (session.loading) return
  emit('close')
}

async function submit() {
  validationError.value = validate()
  if (validationError.value) return

  try {
    await session.changePassword(currentPassword.value, newPassword.value)
    emit('saved')
  } catch {
    // The session store exposes a localized request error.
  }
}

function validate(): string {
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    return t('changePassword.required')
  }
  if (newPassword.value.length < 8) {
    return t('changePassword.minimumLength')
  }
  if (newPassword.value === currentPassword.value) {
    return t('changePassword.unchanged')
  }
  if (newPassword.value !== confirmPassword.value) {
    return t('changePassword.mismatch')
  }
  return ''
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="t('changePassword.title')"
      @pointerdown.self="close"
      @keydown.esc="close"
    >
      <form class="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl" @submit.prevent="submit">
        <header class="flex min-h-14 items-center justify-between border-b border-slate-200 px-5">
          <h2 class="m-0 text-base font-black text-slate-950">{{ t('changePassword.title') }}</h2>
          <button
            class="lp-icon-button"
            type="button"
            :aria-label="t('changePassword.close')"
            :disabled="session.loading"
            @click="close"
          >
            <X class="size-4" />
          </button>
        </header>

        <div class="grid gap-4 p-5">
          <label class="lp-label">
            {{ t('changePassword.currentPassword') }}
            <PasswordInput
              ref="currentPasswordInput"
              v-model="currentPassword"
              class="lp-input"
              autocomplete="current-password"
              :disabled="session.loading"
              :show-label="t('common.showPassword')"
              :hide-label="t('common.hidePassword')"
            />
          </label>
          <label class="lp-label">
            {{ t('changePassword.newPassword') }}
            <PasswordInput
              v-model="newPassword"
              class="lp-input"
              autocomplete="new-password"
              :disabled="session.loading"
              :show-label="t('common.showPassword')"
              :hide-label="t('common.hidePassword')"
            />
          </label>
          <label class="lp-label">
            {{ t('changePassword.confirmPassword') }}
            <PasswordInput
              v-model="confirmPassword"
              class="lp-input"
              autocomplete="new-password"
              :disabled="session.loading"
              :show-label="t('common.showPassword')"
              :hide-label="t('common.hidePassword')"
            />
          </label>

          <p v-if="errorMessage" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {{ errorMessage }}
          </p>
        </div>

        <footer class="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button class="lp-button" type="button" :disabled="session.loading" @click="close">
            {{ t('changePassword.cancel') }}
          </button>
          <button class="lp-button-primary" type="submit" :disabled="session.loading">
            {{ session.loading ? t('common.processing') : t('changePassword.submit') }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>
