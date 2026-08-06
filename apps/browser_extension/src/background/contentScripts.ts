const CONTENT_SCRIPT_ID = 'lockpass-login-fields'
const CONTENT_MATCHES = ['http://*/*', 'https://*/*']

export async function syncContentScriptRegistration(): Promise<void> {
  const allowed = await chrome.permissions.contains({ origins: CONTENT_MATCHES })
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] })

  if (!allowed) {
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] })
    return
  }

  if (registered.length) return
  await chrome.scripting.registerContentScripts([{
    id: CONTENT_SCRIPT_ID,
    js: ['content.js'],
    matches: CONTENT_MATCHES,
    allFrames: true,
    persistAcrossSessions: true,
    runAt: 'document_idle'
  }])

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const tabId = tabs[0]?.id
  if (!tabId) return
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['content.js']
  }).catch(() => undefined)
}
