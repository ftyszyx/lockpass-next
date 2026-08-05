<script setup lang="ts">
import type {
  VaultItem,
} from "@lockpass/core";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useDesktopPageContext } from "../desktopPageContext";
import ItemDetailPane from "./ItemDetailPane.vue";
import ItemListPane from "./ItemListPane.vue";
import ManagementPage from "./ManagementPage.vue";
import ResizeHandle from "./ResizeHandle.vue";
import VaultSidebar from "./VaultSidebar.vue";

const { t } = useI18n();
const page = useDesktopPageContext();
const mainGrid = ref<HTMLElement | null>(null);
const mainGridElement = computed(() => mainGrid.value);

defineExpose({ mainGridElement });
</script>

<template>
  <main
    ref="mainGrid"
    class="grid min-h-0"
    :style="page.activeManagementPage ? undefined : page.mainGridStyle"
  >
    <ManagementPage
      v-if="page.activeManagementPage"
      :active-page="page.activeManagementPage"
      :backup-busy="page.backupBusy"
      @close="page.closeManagement"
      @update-page="page.updateManagementPage"
      @copy-value="page.copyValue"
      @change-locale="page.changeLocale"
      @change-log-level="page.changeLogLevel"
      @change-security-settings="page.changeSecuritySettings"
      @change-shortcut="page.changeShortcut"
      @reset-shortcuts="page.resetShortcuts"
      @open-log-dir="page.openDesktopLogDir"
      @system-toast="page.showToast"
      @create-backup="page.createBackup"
      @restore-backup="page.restoreBackup"
      @import-csv="page.importCsv"
      @export-csv="page.exportCsv"
      @import-legacy-backup="page.importLegacyBackup"
      @not-ready="page.notReady"
    />

    <template v-else>
      <VaultSidebar
        :active-user-name="page.activeUserName"
        :active-user-initials="page.activeUserInitials"
        :connection-status="page.connectionStatus"
        @create-vault="page.openNewVault"
        @delete-vault="page.requestDeleteVault"
        @manage-users="page.openUserManagement"
        @open-management="page.openManagement"
        @show-secret-key="page.openSecretKeyModal"
        @sign-out-current-user="page.openSignOutCurrentUserModal"
        @lock="page.lockApp"
      />

      <ResizeHandle
        :active="page.resizingTarget === 'sidebar'"
        :label="t('layout.resizeSidebar')"
        target="sidebar"
        @resize-keydown="page.onResizeHandleKeydown($event, 'sidebar')"
        @resize-start="page.startColumnResize($event, 'sidebar')"
      />

      <ItemListPane
        :items="page.filteredItems as VaultItem[]"
        :selected-item="page.selectedItem"
        :has-items="page.visibleItemsCount > 0"
        @select-item="page.selectItem"
        @create-item="page.openNewItem()"
        @import-csv="page.openManagement('backup')"
        @quick-search="page.openQuickSearch"
      />

      <ResizeHandle
        :active="page.resizingTarget === 'itemList'"
        :label="t('layout.resizeItemList')"
        target="itemList"
        @resize-keydown="page.onResizeHandleKeydown($event, 'itemList')"
        @resize-start="page.startColumnResize($event, 'itemList')"
      />

      <ItemDetailPane
        :key="page.sensitiveViewKey"
        :active-tab="page.activeTab"
        :show-sensitive="page.showSensitive"
        :selected-item="page.selectedItem"
        :attachments="page.selectedItemAttachments"
        :vault-session-id="page.vaultSessionId"
        :key-id="page.keyId"
        @update:active-tab="page.updateActiveTab"
        @update:show-sensitive="page.updateShowSensitive"
        @edit="page.openEditItem"
        @copy-value="page.copyValue"
        @security-check="page.securityChecked"
      />
    </template>
  </main>
</template>
