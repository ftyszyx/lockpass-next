<script setup lang="ts">
import { Check, ChevronRight, Plus, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@/stores/vault'

const emit = defineEmits<{
  close: []
  switchUser: [userId: string]
  addUser: []
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()

function userDisplayName(user: { displayName: string; username: string }): string {
  return user.displayName || user.username || t('user.currentUser')
}

function userAccountLabel(user: {
  username: string
  sync?: { accountLabel: string | null; serverUrl: string } | null
}): string {
  const accountLabel = user.sync?.accountLabel || user.username
  if (!user.sync?.serverUrl || !user.sync.accountLabel) return accountLabel

  try {
    return `${accountLabel} · ${new URL(user.sync.serverUrl).host}`
  } catch {
    return `${accountLabel} · ${user.sync.serverUrl}`
  }
}

function userInitial(user: { displayName: string; username: string }): string {
  return userDisplayName(user).trim().slice(0, 1).toUpperCase() || 'L'
}
</script>

<template>
  <div class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40 p-4">
    <button class="absolute inset-0 cursor-default" :aria-label="t('editor.cancel')" @click="emit('close')"></button>
    <section class="relative grid w-[620px] max-w-[94vw] gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-xl font-black text-slate-950">{{ t('user.manageUsers') }}</h2>
        <button class="icon-button" type="button" :aria-label="t('editor.close')" @click="emit('close')">
          <X class="size-4" />
        </button>
      </div>

      <div class="grid gap-2">
        <button
          v-for="user in vaultStore.users"
          :key="user.id"
          class="grid min-h-16 w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 text-left hover:bg-teal-50"
          :class="{ 'bg-blue-50 hover:bg-blue-50': user.id === vaultStore.activeUserId }"
          type="button"
          @click="emit('switchUser', user.id)"
        >
          <span class="grid size-10 place-items-center rounded-lg bg-slate-900 text-sm font-black text-white">{{ userInitial(user) }}</span>
          <span class="min-w-0">
            <strong class="block truncate text-sm text-slate-950">{{ userDisplayName(user) }}</strong>
            <small class="block truncate text-sm text-slate-500">{{ userAccountLabel(user) }}</small>
          </span>
          <Check v-if="user.id === vaultStore.activeUserId" class="size-4 text-teal-700" />
          <ChevronRight v-else class="size-4 text-slate-500" />
        </button>
      </div>

      <div class="flex justify-end border-t border-slate-100 pt-4">
        <button class="primary-button" type="button" @click="emit('addUser')">
          <Plus class="size-4" />
          {{ t('user.addAccount') }}
        </button>
      </div>
    </section>
  </div>
</template>
