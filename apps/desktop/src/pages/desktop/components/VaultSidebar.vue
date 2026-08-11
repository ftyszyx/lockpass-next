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
import { VaultAccountSummary } from "@lockpass/ui";
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
  showSecretKey: [];
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
  return t("app.serverConnected");
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

function showSecretKey(): void {
  closeUserMenu();
  emit("showSecretKey");
}

function requestDeleteVault(event: MouseEvent, vaultId: string): void {
  event.stopPropagation();
  emit("deleteVault", vaultId);
}
</script>

<template>
  <aside class="app-sidebar flex min-h-0 flex-col border-r">
    <div class="relative px-2.5 py-2">
      <VaultAccountSummary
        :name="activeUserName"
        :initials="activeUserInitials"
        :status-label="accountStatusLabel()"
        :status-tone="connectionStatus === 'online' ? 'success' : 'warning'"
        interactive
        @activate="userMenuOpen = !userMenuOpen"
      >
        <template #trailing>
          <ChevronDown
            class="size-4 text-[var(--app-muted)]"
            :class="{ 'rotate-180': userMenuOpen }"
          />
        </template>
      </VaultAccountSummary>

      <button
        v-if="userMenuOpen"
        class="fixed inset-0 z-30 cursor-default"
        :aria-label="t('editor.close')"
        @click="closeUserMenu"
      ></button>
      <div
        v-if="userMenuOpen"
        class="floating-panel absolute left-2.5 right-2.5 top-[58px] z-40 overflow-hidden rounded-md border"
      >
        <div class="grid gap-1 p-1">
          <div class="grid gap-1">
            <button
              class="menu-item"
              @click="manageUsers"
            >
              <Users class="size-4" />
              <span>{{ t("user.manageUsers") }}</span>
            </button>
            <button
              class="menu-item"
              @click="showSecretKey"
            >
              <QrCode class="size-4" />
              <span class="truncate">{{
                t("settings.setupAnotherDeviceTitle")
              }}</span>
            </button>
          </div>

          <div class="border-t border-slate-100 pt-1">
            <button
              class="menu-item"
              @click="openManagement"
            >
              <Settings class="size-4" />
              <span class="truncate">{{ t("nav.settings") }}</span>
            </button>
          </div>

          <div class="grid gap-1 border-t border-slate-100 pt-1">
            <button
              class="menu-item"
              @click="signOutCurrentUser"
            >
              <LogOut class="size-4" />
              <span class="truncate">{{
                t("settings.signOutCurrentUser")
              }}</span>
            </button>
            <button
              class="menu-item"
              @click="lock"
            >
              <Lock class="size-4" />
              <span>{{ t("app.lock") }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <nav class="px-2.5 py-1.5">
      <div class="mb-2 flex items-center justify-between px-1">
        <span class="text-xs font-semibold text-[var(--app-muted)]">{{
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
        :class="{ 'nav-button-active': vaultStore.selectedVaultId === 'all' }"
        @click="vaultStore.selectVault('all')"
      >
        <span class="inline-flex items-center gap-2"
          ><LayoutGrid class="size-4" />{{ t("nav.allItems") }}</span
        >
        <span class="text-xs text-[var(--app-muted)]">{{
          vaultStore.vaultCount("all")
        }}</span>
      </button>
      <div
        v-for="vault in vaultStore.visibleVaults"
        :key="vault.id"
        class="group relative"
      >
        <button
          class="nav-button group w-full pr-8"
          :class="{ 'nav-button-active': vaultStore.selectedVaultId === vault.id }"
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
          <span class="text-xs text-[var(--app-muted)] transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">{{
            vaultStore.vaultCount(vault.id)
          }}</span>
        </button>
        <button
          class="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 opacity-0 hover:bg-rose-50 hover:text-rose-700 group-hover:opacity-100 group-focus-within:opacity-100"
          type="button"
          :title="t('vault.delete')"
          :aria-label="t('vault.delete')"
          @click="requestDeleteVault($event, vault.id)"
        >
          <Trash2 class="size-3.5" />
        </button>
      </div>
    </nav>

    <div class="mt-auto border-t border-[var(--app-sidebar-border)] p-2.5">
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
