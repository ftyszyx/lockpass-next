<script setup lang="ts">
import type {
  VaultItem,
} from "@lockpass/core";
import { useDesktopPageContext } from "../desktopPageContext";
import BackupSavedModal from "./BackupSavedModal.vue";
import ChangeMasterPasswordModal from "./ChangeMasterPasswordModal.vue";
import DeleteVaultConfirmModal from "./DeleteVaultConfirmModal.vue";
import DesktopDrawer from "./DesktopDrawer.vue";
import ItemEditorModal from "./ItemEditorModal.vue";
import LockOverlay from "./LockOverlay.vue";
import ProgressModal from "./ProgressModal.vue";
import QuickSearchModal from "./QuickSearchModal.vue";
import SecretKeyModal from "./SecretKeyModal.vue";
import RemoveUserModal from "./RemoveUserModal.vue";
import ServerAccountModal from "./ServerAccountModal.vue";
import SwitchUserConfirmModal from "./SwitchUserConfirmModal.vue";
import ToastNotice from "./ToastNotice.vue";
import UserManagementModal from "./UserManagementModal.vue";
import UserSetupModal from "./UserSetupModal.vue";
import VaultModal from "./VaultModal.vue";

const page = useDesktopPageContext();
</script>

<template>
  <DesktopDrawer
    v-if="page.activeDrawer === 'generator'"
    :generated-password="page.generatedPassword"
    :password-options="page.passwordOptions"
    :can-use-password="page.canUseGeneratedPassword"
    @close="page.closeDrawer"
    @copy-value="page.copyValue"
    @regenerate="page.regeneratePassword"
    @use-password="page.useGeneratedPassword"
  />

  <ServerAccountModal
    v-if="page.activeDrawer === 'sync'"
    @close="page.closeDrawer"
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
    :vault-session-id="page.vaultSessionId"
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
      page.generatedSecretKey
    "
    :draft="page.userDraft"
    :auth-error="page.authError"
    :creating="page.creatingUser"
    :is-adding="page.activeModal === 'user'"
    :is-legacy-import="page.hasLegacyImport"
    :secret-key="page.generatedSecretKey"
    :created-user-name="page.createdUserName"
    :server-first="page.serverFirst"
    :server-connected="page.serverConnected"
    :server-account-label="page.serverAccountLabel"
    :server-mode="page.serverMode"
    :server-url="page.serverUrl"
    :server-busy="page.serverBusy"
    @close="page.closeUserSetup"
    @generate-secret-key="page.prepareUserSecretKey"
    @back-to-new-user="page.backToUserDraftFromSecretKey"
    @restore-existing="page.restoreExistingServerAccount"
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
    @copy-value="page.copyQuickDetailValue"
  />

  <UserManagementModal
    v-if="page.activeModal === 'userManagement'"
    @close="page.closeActiveModal"
    @switch-user="page.requestSwitchUser"
    @add-user="page.openAddUserFromManagement"
  />

  <SecretKeyModal
    v-if="page.activeModal === 'secretKey'"
    :revealed-secret-key="page.revealedSecretKey"
    :reveal-error="page.revealError"
    :reveal-issue="page.revealSecretKeyIssue"
    :saving-to-device="page.savingSecretKeyToDevice"
    @close="page.closeSecretKeyModal"
    @copy-value="page.copyValue"
    @save-secret-key-to-device="page.saveSecretKeyToDevice"
  />

  <ChangeMasterPasswordModal
    v-if="page.activeModal === 'changeMasterPassword'"
    :busy="page.changingMasterPassword"
    :error="page.changeMasterPasswordError"
    @close="page.closeChangeMasterPassword"
    @submit="page.submitMasterPasswordChange"
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
    :secret-key="page.unlockSecretKey"
    :secret-key-required="page.unlockRequiresSecretKey"
    :full-unlock-required="page.fullUnlockRequired"
    :active-user-name="page.activeUserName"
    :active-user-initials="page.activeUserInitials"
    :auth-error="page.authError"
    :unlocking="page.unlockingVault"
    @update:password="page.updateUnlockPassword"
    @update:secretKey="page.updateUnlockSecretKey"
    @unlock="page.unlockApp"
    @add-account="page.openAddUserFromLock"
    @use-saved-secret-key="page.useSavedSecretKey"
    @unlock-selected-user="page.unlockSelectedUser"
    @clear-auth-error="page.clearAuthError"
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
