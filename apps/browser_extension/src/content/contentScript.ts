import { generatePassword } from '@lockpass/core'
import { fillCredentialFromField, fillGeneratedPasswordFromField } from './credentialFiller'
import { classifyLoginField, descriptorForInput } from './fieldClassifier'
import { contentLabels } from './contentLocale'
import { request, type ExtensionResponse } from '@/shared/messages'

declare global {
  interface Window {
    __lockpassContentScriptReady?: boolean
  }
}

if (!window.__lockpassContentScriptReady) {
  window.__lockpassContentScriptReady = true
  startFieldOverlay()
}

function startFieldOverlay(): void {
  let labels = contentLabels()
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;'
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${overlayStyles()}</style><div class="markers"></div><div class="menu" hidden></div>`
  document.documentElement.appendChild(host)

  const markersRoot = shadow.querySelector<HTMLDivElement>('.markers')!
  const menu = shadow.querySelector<HTMLDivElement>('.menu')!
  const markers = new Map<HTMLInputElement, HTMLButtonElement>()
  let activeField: HTMLInputElement | null = null
  let layoutQueued = false

  const observer = new MutationObserver(scheduleScan)
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'autocomplete', 'disabled', 'readonly'] })
  window.addEventListener('resize', scheduleLayout)
  window.addEventListener('scroll', scheduleLayout, true)
  document.addEventListener('pointerdown', (event) => {
    if (!event.composedPath().includes(host)) hideMenu()
  }, true)
  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === 'local') void refreshLabels()
  })

  scanFields()
  void refreshLabels()

  async function refreshLabels(): Promise<void> {
    const response = await sendMessage(request('content.locale.get', {}))
    if (!response?.ok || !('locale' in response)) return
    labels = contentLabels(response.locale)
    for (const marker of markers.values()) {
      marker.title = labels.openQuickPanel
      marker.setAttribute('aria-label', labels.openQuickPanel)
    }
    if (!menu.hidden) hideMenu()
  }

  function scheduleScan(): void {
    window.requestAnimationFrame(() => {
      scanFields()
      scheduleLayout()
    })
  }

  function scanFields(): void {
    const eligible = new Set(
      Array.from(document.querySelectorAll<HTMLInputElement>('input'))
        .filter((input) => classifyLoginField(descriptorForInput(input)) !== 'ignored')
    )

    for (const [input, marker] of markers) {
      if (eligible.has(input) && input.isConnected) continue
      marker.remove()
      markers.delete(input)
    }

    for (const input of eligible) {
      if (markers.has(input)) continue
      const marker = document.createElement('button')
      marker.className = 'marker'
      marker.type = 'button'
      marker.title = labels.openQuickPanel
      marker.setAttribute('aria-label', labels.openQuickPanel)
      marker.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon.png')}" alt="" />`
      marker.addEventListener('pointerdown', (event) => event.preventDefault())
      marker.addEventListener('click', () => void showMenu(input, marker))
      markersRoot.appendChild(marker)
      markers.set(input, marker)
    }
  }

  function scheduleLayout(): void {
    if (layoutQueued) return
    layoutQueued = true
    window.requestAnimationFrame(() => {
      layoutQueued = false
      for (const [input, marker] of markers) positionMarker(input, marker)
      if (activeField && !menu.hidden) positionMenu(activeField)
    })
  }

  async function showMenu(input: HTMLInputElement, marker: HTMLButtonElement): Promise<void> {
    activeField = input
    menu.hidden = false
    menu.innerHTML = `<div class="menu-loading">${escapeHtml(labels.loading)}</div>`
    positionMenu(input)
    marker.focus({ preventScroll: true })

    const response = await sendMessage(request('content.menu.get', { origin: location.origin }))
    if (!response?.ok || !('matches' in response)) {
      renderMenuMessage(labels.unavailable)
      return
    }

    if (response.locked) {
      renderMenuAction(labels.unlock, () => void openPanel())
      return
    }

    if (!response.matches.length) {
      menu.innerHTML = `<div class="menu-empty">${escapeHtml(labels.noMatches)}</div>`
      if (classifyLoginField(descriptorForInput(input)) === 'newPassword') appendGeneratePasswordButton()
      appendOpenVaultButton()
      return
    }

    menu.innerHTML = ''
    for (const match of response.matches) {
      const button = document.createElement('button')
      button.className = 'credential'
      button.type = 'button'
      button.innerHTML = `<span class="credential-icon">${escapeHtml(match.title.slice(0, 1).toUpperCase())}</span><span class="credential-copy"><strong>${escapeHtml(match.title)}</strong><small>${escapeHtml(match.subtitle)}</small></span>`
      button.addEventListener('click', () => void fillCredential(match.id))
      menu.appendChild(button)
    }
    appendOpenVaultButton()
    positionMenu(input)
  }

  async function fillCredential(itemId: string): Promise<void> {
    if (!activeField) return
    const response = await sendMessage(request('content.credential.get', { origin: location.origin, itemId }))
    if (!response?.ok || !('credential' in response)) {
      renderMenuMessage(labels.unavailable)
      return
    }
    fillCredentialFromField(activeField, response.credential)
    hideMenu()
  }

  function renderMenuMessage(message: string): void {
    menu.innerHTML = `<div class="menu-empty">${escapeHtml(message)}</div>`
    appendOpenVaultButton()
  }

  function renderMenuAction(label: string, action: () => void): void {
    menu.innerHTML = ''
    const button = document.createElement('button')
    button.className = 'primary-action'
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', action)
    menu.appendChild(button)
  }

  function appendOpenVaultButton(): void {
    const button = document.createElement('button')
    button.className = 'open-vault'
    button.type = 'button'
    button.textContent = labels.openVault
    button.addEventListener('click', () => void openPanel())
    menu.appendChild(button)
  }

  function appendGeneratePasswordButton(): void {
    const button = document.createElement('button')
    button.className = 'generate-password'
    button.type = 'button'
    button.textContent = labels.generatePassword
    button.addEventListener('click', () => {
      if (!activeField) return
      fillGeneratedPasswordFromField(activeField, generatePassword())
      hideMenu()
    })
    menu.appendChild(button)
  }

  async function openPanel(): Promise<void> {
    await sendMessage(request('content.popup.open', { origin: location.origin }))
    hideMenu()
  }

  function hideMenu(): void {
    menu.hidden = true
    menu.innerHTML = ''
    activeField = null
  }

  function positionMarker(input: HTMLInputElement, marker: HTMLButtonElement): void {
    const rect = input.getBoundingClientRect()
    const visible = rect.width >= 80 && rect.height >= 26 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth
    marker.hidden = !visible
    if (!visible) return
    marker.style.left = `${Math.max(4, rect.right - 32)}px`
    marker.style.top = `${Math.max(4, rect.top + (rect.height - 26) / 2)}px`
  }

  function positionMenu(input: HTMLInputElement): void {
    const rect = input.getBoundingClientRect()
    const width = Math.min(320, Math.max(240, rect.width))
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.left))
    const below = rect.bottom + 6
    const estimatedHeight = Math.min(280, menu.scrollHeight || 120)
    const top = below + estimatedHeight <= window.innerHeight - 8
      ? below
      : Math.max(8, rect.top - estimatedHeight - 6)
    menu.style.width = `${width}px`
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }
}

async function sendMessage(message: ReturnType<typeof request>): Promise<ExtensionResponse | null> {
  try {
    return await chrome.runtime.sendMessage(message) as ExtensionResponse
  } catch {
    return null
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]!)
}

function overlayStyles(): string {
  return `
    :host { all: initial; color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    button { font: inherit; }
    .marker { position: fixed; display: grid; width: 26px; height: 26px; place-items: center; padding: 3px; border: 1px solid transparent; border-radius: 6px; background: rgba(255,255,255,.92); box-shadow: 0 1px 4px rgba(15,23,42,.16); cursor: pointer; pointer-events: auto; transition: border-color .12s ease, box-shadow .12s ease, transform .12s ease; }
    .marker:hover, .marker:focus-visible { border-color: #8fc4bd; box-shadow: 0 0 0 3px rgba(8,123,114,.14), 0 2px 6px rgba(15,23,42,.16); outline: none; transform: translateY(-1px); }
    .marker[hidden] { display: none; }
    .marker img { display: block; width: 20px; height: 20px; object-fit: contain; }
    .menu { position: fixed; max-height: 280px; overflow: auto; border: 1px solid #b8c6d3; border-radius: 8px; background: #fff; color: #172334; box-shadow: 0 14px 36px rgba(15,23,42,.24); padding: 5px; pointer-events: auto; }
    .menu[hidden] { display: none; }
    .menu-loading, .menu-empty { padding: 11px 10px; color: #506278; font-size: 13px; line-height: 1.4; }
    .credential { display: grid; width: 100%; min-height: 48px; grid-template-columns: 32px minmax(0,1fr); align-items: center; gap: 9px; border: 0; border-radius: 6px; background: transparent; color: inherit; padding: 6px; text-align: left; cursor: pointer; }
    .credential:hover, .credential:focus-visible { background: #e8f4f1; outline: none; }
    .credential-icon { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 7px; background: #d9ece8; color: #075e58; font-size: 13px; font-weight: 800; }
    .credential-copy { display: grid; min-width: 0; gap: 2px; }
    .credential-copy strong, .credential-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .credential-copy strong { font-size: 13px; }
    .credential-copy small { color: #64748b; font-size: 11px; }
    .open-vault, .primary-action, .generate-password { display: flex; width: 100%; min-height: 36px; align-items: center; justify-content: center; border-radius: 6px; padding: 0 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
    .open-vault { margin-top: 4px; border: 1px solid #dbe3ea; background: #f8fafc; color: #34465a; }
    .open-vault:hover { background: #eef3f6; }
    .primary-action, .generate-password { border: 1px solid #05635d; background: #087b72; color: white; }
    .primary-action:hover, .generate-password:hover { background: #05635d; }
  `
}
