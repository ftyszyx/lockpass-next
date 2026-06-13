<script setup lang="ts">
import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CreditCard,
  FolderLock,
  House,
  KeyRound,
  LayoutGrid,
  Lock,
  Plus,
  RefreshCw,
  ServerCog,
  Trash2,
  UserPlus
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@/stores/vault'
import type { DrawerName } from '../types'

defineProps<{
  activeUserName: string
  activeUserInitials: string
}>()

const emit = defineEmits<{
  createVault: []
  deleteVault: [vaultId: string]
  openDrawer: [drawer: Exclude<DrawerName, null>]
  openManagement: [page: 'conflicts']
  syncNow: []
  syncUnavailable: []
  switchUser: [userId: string]
  addUser: []
  showRecoveryKey: []
  lock: []
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
const userMenuOpen = ref(false)
const syncState = computed<'offline' | 'needsSync' | 'conflicted' | 'synced'>(() => {
  if (!vaultStore.syncConnected) return 'offline'
  if (vaultStore.syncConflictCount > 0) return 'conflicted'
  if (!vaultStore.settings.sync.lastSyncAt || vaultStore.syncLocalChangeCount > 0) return 'needsSync'
  return 'synced'
})
const syncStatusLabel = computed(() => {
  if (syncState.value === 'offline') return t('sync.offline')
  if (syncState.value === 'conflicted') return t('sync.conflicted')
  if (syncState.value === 'needsSync') return t('sync.needsSync')
  return t('sync.synced')
})
const syncCardClass = computed(() => {
  if (syncState.value === 'offline') return 'border-rose-200 bg-rose-50'
  if (syncState.value === 'conflicted') return 'border-rose-200 bg-rose-50'
  if (syncState.value === 'needsSync') return 'border-amber-200 bg-amber-50'
  return 'border-emerald-200 bg-emerald-50'
})
const syncPillClass = computed(() => {
  if (syncState.value === 'offline') return 'border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200'
  if (syncState.value === 'conflicted') return 'border-rose-300 bg-rose-100 text-rose-800 hover:bg-rose-200'
  if (syncState.value === 'needsSync') return 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
})
const syncDotClass = computed(() => {
  if (syncState.value === 'offline') return 'bg-rose-500'
  if (syncState.value === 'conflicted') return 'bg-rose-500'
  if (syncState.value === 'needsSync') return 'bg-amber-500'
  return 'bg-emerald-500'
})
const syncDetailLabel = computed(() => {
  if (!vaultStore.syncConnected) return t('sync.configureHint')
  if (syncState.value === 'conflicted') return t('sync.conflictCount', { count: vaultStore.syncConflictCount })
  if (vaultStore.syncLocalChangeCount > 0) return t('sync.localChangesCount', { count: vaultStore.syncLocalChangeCount })
  if (vaultStore.settings.sync.lastSyncAt) {
    return t('sync.lastSyncedAt', {
      time: new Date(vaultStore.settings.sync.lastSyncAt).toLocaleString(vaultStore.settings.locale)
    })
  }
  return t('sync.neverSynced')
})

function userDisplayName(user: { displayName: string; username: string }): string {
  return user.displayName || user.username || t('user.currentUser')
}

function closeUserMenu(): void {
  userMenuOpen.value = false
}

function switchUser(userId: string): void {
  closeUserMenu()
  emit('switchUser', userId)
}

function addUser(): void {
  closeUserMenu()
  emit('addUser')
}

function lock(): void {
  closeUserMenu()
  emit('lock')
}

function showRecoveryKey(): void {
  closeUserMenu()
  emit('showRecoveryKey')
}

function openSyncSettings(): void {
  emit('openDrawer', 'sync')
}

function openSyncDetail(): void {
  if (syncState.value === 'conflicted') {
    emit('openManagement', 'conflicts')
    return
  }

  openSyncSettings()
}

function requestSyncNow(): void {
  if (!vaultStore.syncConnected) {
    emit('syncUnavailable')
    return
  }

  emit('syncNow')
}

function requestDeleteVault(event: MouseEvent, vaultId: string): void {
  event.stopPropagation()
  emit('deleteVault', vaultId)
}
</script>

<template>
  <aside class="flex min-h-0 flex-col border-r border-slate-200 bg-[#f1f5f4]">
    <div class="relative px-3 py-3">
      <button class="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/80" @click="userMenuOpen = !userMenuOpen">
        <span class="grid size-9 place-items-center rounded-lg bg-slate-900 font-bold text-white">{{ activeUserInitials }}</span>
        <span class="min-w-0">
          <strong class="block truncate leading-tight">{{ activeUserName }}</strong>
          <span class="text-xs text-slate-500">{{ !vaultStore.unlocked ? t('app.locked') : t('app.unlocked') }}</span>
        </span>
        <ChevronDown class="size-4 text-slate-500" :class="{ 'rotate-180': userMenuOpen }" />
      </button>

      <button v-if="userMenuOpen" class="fixed inset-0 z-30 cursor-default" aria-label="Close user menu" @click="closeUserMenu"></button>
      <div v-if="userMenuOpen" class="absolute left-3 right-3 top-[66px] z-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
        <div class="border-b border-slate-100 px-3 py-2 text-xs font-bold text-slate-500">{{ t('user.switchUser') }}</div>
        <button
          v-for="user in vaultStore.users"
          :key="user.id"
          class="grid min-h-10 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left text-sm hover:bg-teal-50"
          @click="switchUser(user.id)"
        >
          <span class="truncate font-semibold">{{ userDisplayName(user) }}</span>
          <Check v-if="user.id === vaultStore.activeUserId" class="size-4 text-teal-700" />
        </button>
        <div class="border-t border-slate-100 p-1">
          <button class="grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-teal-50" @click="addUser">
            <UserPlus class="size-4" />
            <span>{{ t('user.add') }}</span>
          </button>
          <button class="grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-teal-50" @click="showRecoveryKey">
            <KeyRound class="size-4" />
            <span class="truncate">{{ t('settings.recoveryKeyTitle') }}</span>
          </button>
          <button class="grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-teal-50" @click="lock">
            <Lock class="size-4" />
            <span>{{ t('app.lock') }}</span>
          </button>
        </div>
      </div>
    </div>

    <nav class="px-3 py-2">
      <div class="mb-2 flex items-center justify-between px-1">
        <span class="text-xs font-bold text-slate-500">{{ t('nav.vaults') }}</span>
        <button class="mini-button" :title="t('nav.addVault')" @click="emit('createVault')">
          <Plus class="size-4" />
        </button>
      </div>
      <button
        class="nav-button"
        :class="{ 'bg-white': vaultStore.selectedVaultId === 'all' }"
        @click="vaultStore.selectVault('all')"
      >
        <span class="inline-flex items-center gap-2"><LayoutGrid class="size-4" />{{ t('nav.allItems') }}</span>
        <span class="text-xs text-slate-500">{{ vaultStore.vaultCount('all') }}</span>
      </button>
      <button
        v-for="vault in vaultStore.visibleVaults"
        :key="vault.id"
        class="nav-button group"
        :class="{ 'bg-white': vaultStore.selectedVaultId === vault.id }"
        @click="vaultStore.selectVault(vault.id)"
      >
        <span class="inline-flex min-w-0 items-center gap-2">
          <BriefcaseBusiness v-if="vault.icon.includes('briefcase')" class="size-4" />
          <House v-else-if="vault.icon.includes('home')" class="size-4" />
          <CreditCard v-else-if="vault.icon.includes('credit')" class="size-4" />
          <KeyRound v-else-if="vault.icon.includes('key')" class="size-4" />
          <FolderLock v-else class="size-4" />
          <span class="truncate">{{ vault.name }}</span>
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="text-xs text-slate-500">{{ vaultStore.vaultCount(vault.id) }}</span>
          <button
            class="inline-flex size-6 items-center justify-center rounded-md text-slate-400 opacity-0 hover:bg-rose-50 hover:text-rose-700 group-hover:opacity-100 group-focus-within:opacity-100"
            type="button"
            :title="t('vault.delete')"
            :aria-label="t('vault.delete')"
            @click="requestDeleteVault($event, vault.id)"
          >
            <Trash2 class="size-3.5" />
          </button>
        </span>
      </button>
    </nav>

    <div class="mt-auto border-t border-slate-200 p-3">
      <div class="mb-3 grid gap-2 rounded-lg border p-2" :class="syncCardClass">
        <div class="flex items-center justify-between gap-2">
          <strong class="text-xs text-slate-600">{{ t('sync.title') }}</strong>
          <button
            class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold transition"
            type="button"
            :class="syncPillClass"
            :title="t('sync.settings')"
            @click="openSyncSettings"
          >
            <span class="size-1.5 rounded-full" :class="syncDotClass"></span>
            {{ syncStatusLabel }}
          </button>
        </div>
        <div class="grid gap-2">
          <button
            class="min-w-0 truncate text-left text-xs font-medium text-slate-600 hover:text-slate-950"
            type="button"
            @click="openSyncDetail"
          >
            {{ syncDetailLabel }}
          </button>
          <div class="grid grid-cols-[minmax(0,1fr)_32px] gap-2">
            <button
              class="inline-flex h-8 min-w-0 items-center justify-center gap-2 rounded-lg border border-teal-700 bg-teal-700 px-3 text-xs font-bold text-white shadow-sm shadow-teal-900/10 hover:bg-teal-800"
              type="button"
              :title="t('sync.syncNow')"
              @click="requestSyncNow"
            >
              <RefreshCw class="size-4" />
              <span>{{ t('sync.syncNow') }}</span>
            </button>
            <button class="mini-button size-8 bg-white/70" type="button" :title="t('sync.settings')" :aria-label="t('sync.settings')" @click="openSyncSettings">
              <ServerCog class="size-4" />
            </button>
          </div>
        </div>
      </div>
      <div v-if="vaultStore.storageError" class="min-w-0 px-1 text-xs text-rose-700">
        <small class="block font-semibold">{{ t('app.storageSaveError') }}</small>
        <small class="block break-words">{{ vaultStore.storageError }}</small>
      </div>
    </div>
  </aside>
</template>
