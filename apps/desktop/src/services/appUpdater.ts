import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type DesktopUpdate = Update
export type DesktopUpdateDownloadEvent = DownloadEvent

type SemanticVersion = {
  major: number
  minor: number
  patch: number
}

export function isDesktopUpdateSupported(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isForceDesktopUpdate(currentVersion: string, nextVersion: string): boolean {
  const current = parseSemanticVersion(currentVersion)
  const next = parseSemanticVersion(nextVersion)
  if (!current || !next) return false
  return current.major !== next.major || current.minor !== next.minor
}

export async function checkForDesktopUpdate(): Promise<DesktopUpdate | null> {
  if (!isDesktopUpdateSupported()) return null
  return check({ timeout: 15_000 })
}

export async function downloadAndInstallDesktopUpdate(
  update: DesktopUpdate,
  onEvent: (event: DesktopUpdateDownloadEvent) => void
): Promise<void> {
  await update.downloadAndInstall(onEvent, { timeout: 120_000 })
}

export async function relaunchDesktopApp(): Promise<void> {
  await relaunch()
}

function parseSemanticVersion(version: string): SemanticVersion | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}
