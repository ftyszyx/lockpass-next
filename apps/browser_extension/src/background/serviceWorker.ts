import { syncContentScriptRegistration } from './contentScripts'
import { authorizeAccount } from './accountAuthorization'
import { saveExtensionVaultItem } from './itemMutations'
import { closeExtensionVaultSession, unlockExtensionVault } from './vaultUnlock'
import {
  credentialMatches,
  loadFillCredential,
  loadPanelState,
  lockExtension,
  setActiveOrigin,
  updateSelection
} from './repository'
import { isExtensionRequest, type ExtensionRequest, type ExtensionResponse } from '@/shared/messages'

void initializeExtension()

chrome.runtime.onInstalled.addListener(() => {
  void initializeExtension()
})

chrome.runtime.onStartup.addListener(() => {
  void initializeExtension()
})

chrome.permissions.onAdded.addListener(() => {
  void syncContentScriptRegistration()
})

chrome.permissions.onRemoved.addListener(() => {
  void syncContentScriptRegistration()
})

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isExtensionRequest(message)) return false
  void handleRequest(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) } satisfies ExtensionResponse))
  return true
})

async function initializeExtension(): Promise<void> {
  await syncContentScriptRegistration()
}

async function handleRequest(message: ExtensionRequest, sender: chrome.runtime.MessageSender): Promise<ExtensionResponse> {
  switch (message.type) {
    case 'panel.state.get':
      assertExtensionPageSender(sender)
      return { ok: true, state: await loadPanelState() }
    case 'panel.selection.set':
      assertExtensionPageSender(sender)
      await updateSelection({ vaultId: message.vaultId, itemId: message.itemId })
      return { ok: true }
    case 'panel.item.save':
      assertExtensionPageSender(sender)
      return { ok: true, state: await saveExtensionVaultItem(message.item) }
    case 'panel.unlock':
      assertExtensionPageSender(sender)
      return {
        ok: true,
        state: await unlockExtensionVault({
          password: message.password,
          secretKey: message.secretKey
        })
      }
    case 'panel.lock':
      assertExtensionPageSender(sender)
      await closeExtensionVaultSession()
      await lockExtension()
      return { ok: true, state: await loadPanelState() }
    case 'panel.web.open':
      assertExtensionPageSender(sender)
      return { ok: true, state: await authorizeAccount(message.page) }
    case 'panel.siteAccess.changed':
      assertExtensionPageSender(sender)
      await syncContentScriptRegistration()
      return { ok: true, state: await loadPanelState() }
    case 'content.popup.open': {
      assertPageSender(sender, message.origin)
      await setActiveOrigin(message.origin)
      await chrome.action.openPopup()
      return { ok: true }
    }
    case 'content.menu.get': {
      assertPageSender(sender, message.origin)
      const result = await credentialMatches(message.origin)
      return { ok: true, ...result }
    }
    case 'content.credential.get': {
      assertPageSender(sender, message.origin)
      const credential = await loadFillCredential(message.itemId, message.origin)
      if (!credential) return { ok: false, error: 'credential unavailable' }
      return { ok: true, credential }
    }
  }
}

function assertExtensionPageSender(sender: chrome.runtime.MessageSender): void {
  if (!sender.url || new URL(sender.url).origin !== new URL(chrome.runtime.getURL('/')).origin) {
    throw new Error('extension page sender is invalid')
  }
}

function assertPageSender(sender: chrome.runtime.MessageSender, claimedOrigin: string): void {
  if (!sender.tab?.id || !sender.url) throw new Error('page sender is missing')
  const senderOrigin = new URL(sender.url).origin
  if (senderOrigin !== claimedOrigin) throw new Error('page origin mismatch')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
