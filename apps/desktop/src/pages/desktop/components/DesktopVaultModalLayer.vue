<script setup lang="ts">
import type {
  VaultItem,
} from "@lockpass/core";
import { useDesktopPageContext } from "../desktopPageContext";
import BackupSavedModal from "./BackupSavedModal.vue";
import DeleteVaultConfirmModal from "./DeleteVaultConfirmModal.vue";
import DesktopDrawer from "./DesktopDrawer.vue";
import ItemEditorModal from "./ItemEditorModal.vue";
import LockOverlay from "./LockOverlay.vue";
import ProgressModal from "./ProgressModal.vue";
import QuickSearchModal from "./QuickSearchModal.vue";
import RecoveryKeyModal from "./RecoveryKeyModal.vue";
import RemoveUserModal from "./RemoveUserModal.vue";
import SwitchUserConfirmModal from "./SwitchUserConfirmModal.vue";
import ToastNotice from "./ToastNotice.vue";
import UserManagementModal from "./UserManagementModal.vue";
import UserSetupModal from "./UserSetupModal.vue";
import VaultModal from "./VaultModal.vue";

const page = useDesktopPageContext();
</script>

<template>
  <DesktopDrawer
    v-if="page.activeDrawer"
    :active-drawer="page.activeDrawer"
    :generated-password="page.generatedPassword"
    :password-options="page.passwordOptions"
    :can-use-password="page.canUseGeneratedPassword"
    @close="page.closeDrawer"
    @copy-value="page.copyValue"
    @regenerate="page.regeneratePassword"
    @use-password="page.useGeneratedPassword"
    @sync-toast="page.showToast"
    @operation-start="page.showOperationProgress"
    @operation-end="page.hideOperationProgress"
  />

  <ItemEditorModal
    v-if="page.activeModal === 'item'"
    :editing-item-id="page.editingItemId"
    :picking-type="page.pickingItemType"
    :draft="page.itemDraft"
    :uploading-files="page.uploadingFiles"
    :error="page.itemError"
    :vault-key="page.vaultKey"
    :key-id="page.activeKeyId"
    @close="page.closeActiveModal"
    @save="page.saveItem"
    @pick-type="page.startNewItem"
    @import-choice="page.openImportFromItemPicker"
    @back-to-types="page.backToItemTypePicker"
    @files-selected="page.onFilesSelected"
    @remove-attachment="page.removeDraftAttachment"
    @remove-attachment-block="page.removeDraftAttachmentBlock"
    @remove-field="page.removeDraftField"
    @remove-group-child="page.removeDraftGroupChild"
    @toggle-group="page.toggleDraftGroup"
    @generate-field="page.openPasswordGenerator"
    @add-website="page.addWebsiteField"
    @add-extra="page.addDraftExtra"
    @add-group-child="page.addDraftGroupChild"
  />

  <VaultModal
    v-if="page.activeModal === 'vault'"
    :draft="page.vaultDraft"
    @close="page.closeActiveModal"
    @save="page.saveVault"
  />

  <UserSetupModal
    v-if="
      (page.vaultHydrated && page.vaultNeedsUserSetup) ||
      page.activeModal === 'user' ||
      page.generatedRecoveryKey
    "
    :draft="page.userDraft"
    :auth-error="page.authError"
    :creating="page.creatingUser"
    :is-adding="page.activeModal === 'user'"
    :is-legacy-import="page.hasLegacyImport"
    :recovery-key="page.generatedRecoveryKey"
    :created-user-name="page.recoveryUserName"
    :initial-mode="page.userSetupInitialMode"
    :server-first="page.serverFirst"
    :server-connected="page.serverConnected"
    :server-account-label="page.serverAccountLabel"
    :server-mode="page.serverMode"
    :server-url="page.serverUrl"
    :server-busy="page.serverBusy"
    @close="page.closeActiveModal"
    @generate-recovery-key="page.prepareUserRecoveryKey"
    @back-to-new-user="page.backToUserDraftFromRecoveryKey"
    @restore-existing="page.restoreExistingServerAccount"
    @scan-recovery-qr="page.showUnavailableRecoveryQr"
    @submit="page.createUser"
    @update-server-mode="page.updateSetupServerMode"
    @update-server-url="page.updateSetupServerUrl"
    @open-server-login="page.openInitialServerLogin"
  />

  <QuickSearchModal
    v-if="page.activeModal === 'quick'"
    :query="page.quickQuery"
    :items="page.visibleItems as VaultItem[]"
    :attachments="page.visibleAttachments"
    @update:query="page.updateQuickQuery"
    @close="page.closeActiveModal"
    @select-and-copy="page.selectQuickResult"
  />

  <UserManagementModal
    v-if="page.activeModal === 'userManagement'"
    @close="page.closeActiveModal"
    @switch-user="page.requestSwitchUser"
    @add-user="page.openAddUserFromManagement"
  />

  <RecoveryKeyModal
    v-if="page.activeModal === 'recoveryKey'"
    :revealed-recovery-key="page.revealedRecoveryKey"
    :reveal-error="page.revealError"
    :reveal-issue="page.revealRecoveryKeyIssue"
    :saving-to-device="page.savingRecoveryKeyToDevice"
    @close="page.closeRecoveryKeyModal"
    @copy-value="page.copyValue"
    @save-recovery-key-to-device="page.saveRecoveryKeyToDevice"
  />

  <RemoveUserModal
    v-if="page.activeModal === 'removeUser'"
    :user-name="page.activeUserName"
    :busy="page.signingOutCurrentUser"
    @close="page.closeActiveModal"
    @confirm="page.signOutCurrentUser"
  />

  <SwitchUserConfirmModal
    v-if="page.activeModal === 'switchUserConfirm'"
    :from-user-name="page.activeUserName"
    :to-user-name="page.pendingSwitchUserName"
    @close="page.closeSwitchUserConfirm"
    @confirm="page.confirmSwitchUser"
  />

  <DeleteVaultConfirmModal
    v-if="page.activeModal === 'deleteVaultConfirm' && page.pendingDeleteVault"
    :vault-name="page.pendingDeleteVault.name"
    :item-count="page.pendingDeleteVaultItemCount"
    :deleting="page.deletingVault"
    @close="page.closeActiveModal"
    @confirm="page.confirmDeleteVault"
  />

  <LockOverlay
    v-if="
      page.activeModal === 'lock' ||
      (!page.activeModal &&
        page.vaultHydrated &&
        page.vaultHasUsers &&
        !page.vaultNeedsUserSetup &&
        !page.vaultUnlocked)
    "
    :password="page.unlockPassword"
    :recovery-key="page.unlockRecoveryKey"
    :active-user-name="page.activeUserName"
    :active-user-initials="page.activeUserInitials"
    :auth-error="page.authError"
    :unlocking="page.unlockingVault"
    @update:password="page.updateUnlockPassword"
    @update:recoveryKey="page.updateUnlockRecoveryKey"
    @unlock="page.unlockApp"
    @use-saved-recovery-key="page.useSavedRecoveryKey"
    @create-new-user="page.createNewUserFromLock"
    @clear-auth-error="page.clearAuthError"
    @switch-user="page.requestSwitchUser"
  />

  <ProgressModal
    :visible="page.operationProgress.visible"
    :title="page.operationProgress.title"
    :body="page.operationProgress.body"
  />

  <BackupSavedModal
    v-if="page.savedBackupResult"
    :result="page.savedBackupResult"
    @close="page.closeSavedBackup"
    @copy-path="page.copySavedBackupPath"
    @open-directory="page.openSavedBackupDirectory"
  />

  <ToastNotice :visible="page.toast.visible" :message="page.toast.message" />
</template>
