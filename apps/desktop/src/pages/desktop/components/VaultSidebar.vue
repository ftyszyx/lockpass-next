<script setup lang="ts">
import {
  BriefcaseBusiness,
  ChevronDown,
  CreditCard,
  FolderLock,
  House,
  KeyRound,
  LayoutGrid,
  LogOut,
  Lock,
  Plus,
  QrCode,
  Settings,
  Trash2,
  Users,
} from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useVaultStore } from "@/stores/vault";

const props = defineProps<{
  activeUserName: string;
  activeUserInitials: string;
  connectionStatus: "online" | "offline" | "serverUnavailable";
}>();

const emit = defineEmits<{
  createVault: [];
  deleteVault: [vaultId: string];
  manageUsers: [];
  openManagement: [];
  showRecoveryKey: [];
  signOutCurrentUser: [];
  lock: [];
}>();

const vaultStore = useVaultStore();
const userMenuOpen = ref(false);
const { t } = useI18n();

function accountStatusLabel(): string {
  if (props.connectionStatus === "offline") return t("app.offline");
  if (props.connectionStatus === "serverUnavailable")
    return t("app.serverUnavailable");
  return !vaultStore.unlocked ? t("app.locked") : t("app.unlocked");
}

function closeUserMenu(): void {
  userMenuOpen.value = false;
}

function manageUsers(): void {
  closeUserMenu();
  emit("manageUsers");
}

function openManagement(): void {
  closeUserMenu();
  emit("openManagement");
}

function signOutCurrentUser(): void {
  closeUserMenu();
  emit("signOutCurrentUser");
}

function lock(): void {
  closeUserMenu();
  emit("lock");
}

function showRecoveryKey(): void {
  closeUserMenu();
  emit("showRecoveryKey");
}

function requestDeleteVault(event: MouseEvent, vaultId: string): void {
  event.stopPropagation();
  emit("deleteVault", vaultId);
}
</script>

<template>
  <aside class="flex min-h-0 flex-col border-r border-slate-200 bg-[#f1f5f4]">
    <div class="relative px-3 py-3">
      <button
        class="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/80"
        @click="userMenuOpen = !userMenuOpen"
      >
        <span
          class="grid size-9 place-items-center rounded-lg bg-slate-900 font-bold text-white"
          >{{ activeUserInitials }}</span
        >
        <span class="min-w-0">
          <strong class="block truncate leading-tight">{{
            activeUserName
          }}</strong>
          <span
            class="inline-flex min-h-5 max-w-full items-center rounded px-1.5 text-xs font-semibold leading-none"
            :class="
              connectionStatus === 'online'
                ? 'pl-0 text-slate-500'
                : 'border border-rose-200 bg-rose-50 text-rose-700'
            "
          >
            <span class="truncate">{{ accountStatusLabel() }}</span>
          </span>
        </span>
        <ChevronDown
          class="size-4 text-slate-500"
          :class="{ 'rotate-180': userMenuOpen }"
        />
      </button>

      <button
        v-if="userMenuOpen"
        class="fixed inset-0 z-30 cursor-default"
        aria-label="Close user menu"
        @click="closeUserMenu"
      ></button>
      <div
        v-if="userMenuOpen"
        class="absolute left-3 right-3 top-[66px] z-40 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
      >
        <div class="grid gap-1 p-1">
          <div class="grid gap-1">
            <button
              class="grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-teal-50"
              @click="manageUsers"
            >
              <Users class="size-4" />
              <span>{{ t("user.manageUsers") }}</span>
            </button>
            <button
              class="grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-teal-50"
              @click="showRecoveryKey"
            >
              <QrCode class="size-4" />
              <span class="truncate">{{
                t("settings.setupAnotherDeviceTitle")
              }}</span>
            </button>
          </div>

          <div class="border-t border-slate-100 pt-1">
            <button
              class="grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-teal-50"
              @click="openManagement"
            >
              <Settings class="size-4" />
              <span class="truncate">{{ t("nav.settings") }}</span>
            </button>
          </div>

          <div class="grid gap-1 border-t border-slate-100 pt-1">
            <button
              class="grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-teal-50"
              @click="signOutCurrentUser"
            >
              <LogOut class="size-4" />
              <span class="truncate">{{
                t("settings.signOutCurrentUser")
              }}</span>
            </button>
            <button
              class="grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-teal-50"
              @click="lock"
            >
              <Lock class="size-4" />
              <span>{{ t("app.lock") }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <nav class="px-3 py-2">
      <div class="mb-2 flex items-center justify-between px-1">
        <span class="text-xs font-bold text-slate-500">{{
          t("nav.vaults")
        }}</span>
        <button
          class="mini-button"
          :title="t('nav.addVault')"
          @click="emit('createVault')"
        >
          <Plus class="size-4" />
        </button>
      </div>
      <button
        class="nav-button"
        :class="{ 'bg-white': vaultStore.selectedVaultId === 'all' }"
        @click="vaultStore.selectVault('all')"
      >
        <span class="inline-flex items-center gap-2"
          ><LayoutGrid class="size-4" />{{ t("nav.allItems") }}</span
        >
        <span class="text-xs text-slate-500">{{
          vaultStore.vaultCount("all")
        }}</span>
      </button>
      <button
        v-for="vault in vaultStore.visibleVaults"
        :key="vault.id"
        class="nav-button group"
        :class="{ 'bg-white': vaultStore.selectedVaultId === vault.id }"
        @click="vaultStore.selectVault(vault.id)"
      >
        <span class="inline-flex min-w-0 items-center gap-2">
          <BriefcaseBusiness
            v-if="vault.icon.includes('briefcase')"
            class="size-4"
          />
          <House v-else-if="vault.icon.includes('home')" class="size-4" />
          <CreditCard
            v-else-if="vault.icon.includes('credit')"
            class="size-4"
          />
          <KeyRound v-else-if="vault.icon.includes('key')" class="size-4" />
          <FolderLock v-else class="size-4" />
          <span class="truncate">{{ vault.name }}</span>
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="text-xs text-slate-500">{{
            vaultStore.vaultCount(vault.id)
          }}</span>
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
      <div
        v-if="vaultStore.storageError"
        class="min-w-0 px-1 text-xs text-rose-700"
      >
        <small class="block font-semibold">{{
          t("app.storageSaveError")
        }}</small>
        <small class="block break-words">{{ vaultStore.storageError }}</small>
      </div>
    </div>
  </aside>
</template>
