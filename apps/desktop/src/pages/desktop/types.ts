import type { VaultColor, VaultItemField, VaultItemType } from '@lockpass/core'
import type { AttachmentDraft, SelectedType } from '@/stores/vault/types'

export type DrawerName = 'generator' | 'sync' | null
export type ManagementPageName = 'backup' | 'settings' | 'shortcuts' | 'logs' | 'system'
export type ModalName = 'item' | 'vault' | 'quick' | 'lock' | 'user' | 'userManagement' | 'recoveryKey' | 'removeUser' | 'switchUserConfirm' | 'deleteVaultConfirm' | null
export type ResizeTarget = 'sidebar' | 'itemList'
export type DetailTab = 'details' | 'history' | 'security'
export type ConnectionStatus = 'online' | 'offline' | 'serverUnavailable'

export interface ToastState {
  visible: boolean
  message: string
}

export interface OperationProgressState {
  visible: boolean
  title: string
  body: string
}

export interface AttachmentDraftBlock {
  id: string
  attachments: AttachmentDraft[]
}

export type AddMoreItemKind =
  | 'group'
  | 'text'
  | 'phone'
  | 'password'
  | 'date'
  | 'totp'
  | 'attachment'
  | 'note'

export interface AddMoreMenuItem {
  kind: AddMoreItemKind
  label: string
}

export interface ItemDraft {
  type: VaultItemType
  vaultId: string
  title: string
  notes: string
  fields: VaultItemField[]
  attachments: AttachmentDraft[]
  attachmentBlocks: AttachmentDraftBlock[]
}

export interface VaultDraft {
  name: string
  description: string
  color: VaultColor
  icon: string
}

export interface UserDraft {
  username: string
  password: string
  confirmPassword: string
}

export interface PasswordOptions {
  length: number
  lowercase: boolean
  uppercase: boolean
  numbers: boolean
  symbols: boolean
  symbolCount: number
  avoidAmbiguous: boolean
}

export const typeFilters = ['all', 'login', 'payment-card', 'secure-note'] as const satisfies readonly SelectedType[]
export const editorTypes = ['login', 'payment-card', 'secure-note'] as const satisfies readonly VaultItemType[]
export const detailTabs = ['details', 'history', 'security'] as const satisfies readonly DetailTab[]
