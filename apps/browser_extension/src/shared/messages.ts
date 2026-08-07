import type {
  CredentialMatchSummary,
  ExtensionItemSaveInput,
  ExtensionLocale,
  ExtensionPanelState,
  ExtensionServerSettings,
  FillCredentialPayload
} from './models'

export const EXTENSION_MESSAGE_VERSION = 1 as const

interface VersionedMessage {
  version: typeof EXTENSION_MESSAGE_VERSION
}

export type ExtensionRequest =
  | (VersionedMessage & { type: 'panel.state.get' })
  | (VersionedMessage & { type: 'panel.selection.set'; vaultId?: 'all' | string; itemId?: string | null })
  | (VersionedMessage & { type: 'panel.item.save'; item: ExtensionItemSaveInput })
  | (VersionedMessage & { type: 'panel.unlock'; password: string; secretKey?: string })
  | (VersionedMessage & { type: 'panel.lock' })
  | (VersionedMessage & { type: 'panel.locale.set'; locale: ExtensionLocale })
  | (VersionedMessage & { type: 'panel.server.set'; settings: ExtensionServerSettings })
  | (VersionedMessage & { type: 'panel.web.open'; page: 'login' | 'register' })
  | (VersionedMessage & { type: 'panel.siteAccess.changed'; enabled: boolean })
  | (VersionedMessage & { type: 'content.popup.open'; origin: string })
  | (VersionedMessage & { type: 'content.locale.get' })
  | (VersionedMessage & { type: 'content.menu.get'; origin: string })
  | (VersionedMessage & { type: 'content.credential.get'; origin: string; itemId: string })

export type ExtensionResponse =
  | { ok: true; state: ExtensionPanelState }
  | { ok: true; matches: CredentialMatchSummary[]; locked: boolean }
  | { ok: true; locale: ExtensionLocale }
  | { ok: true; credential: FillCredentialPayload }
  | { ok: true }
  | { ok: false; error: string }

export function request<T extends ExtensionRequest['type']>(
  type: T,
  payload: Omit<Extract<ExtensionRequest, { type: T }>, 'type' | 'version'>
): Extract<ExtensionRequest, { type: T }> {
  return {
    version: EXTENSION_MESSAGE_VERSION,
    type,
    ...payload
  } as Extract<ExtensionRequest, { type: T }>
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<ExtensionRequest>
  return message.version === EXTENSION_MESSAGE_VERSION && typeof message.type === 'string'
}
