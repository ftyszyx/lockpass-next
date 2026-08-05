import { invoke } from '@tauri-apps/api/core'
import type { DesktopLogLevel } from '@/services/vaultRepository'

type WritableLogLevel = Exclude<DesktopLogLevel, 'off'>

const LOG_LEVEL_ORDER: Record<DesktopLogLevel, number> = {
  off: 0,
  error: 1,
  info: 2,
  debug: 3
}

let currentLogLevel: DesktopLogLevel = 'error'

export function configureLogger(level: DesktopLogLevel): void {
  currentLogLevel = normalizeLogLevel(level)
}

export function getConfiguredLogLevel(): DesktopLogLevel {
  return currentLogLevel
}

export async function logError(message: string, metadata?: Record<string, unknown>): Promise<void> {
  await writeLog('error', message, metadata)
}

export async function logInfo(message: string, metadata?: Record<string, unknown>): Promise<void> {
  await writeLog('info', message, metadata)
}

export async function logDebug(message: string, metadata?: Record<string, unknown>): Promise<void> {
  await writeLog('debug', message, metadata)
}

export async function openLogDir(): Promise<string | null> {
  if (!isTauriRuntime()) return null
  return invoke<string>('open_log_dir')
}

export async function readDesktopLog(maxBytes = 256 * 1024): Promise<string | null> {
  if (!isTauriRuntime()) return null
  return invoke<string>('read_desktop_log', { maxBytes })
}

async function writeLog(level: WritableLogLevel, message: string, metadata?: Record<string, unknown>): Promise<void> {
  if (!shouldWrite(level)) return

  const safeMetadata = metadata ? sanitizeMetadata(metadata) : undefined
  const payload = safeMetadata && Object.keys(safeMetadata).length > 0
    ? `${message} ${JSON.stringify(safeMetadata)}`
    : message

  if (!isTauriRuntime()) {
    writeBrowserLog(level, payload)
    return
  }

  try {
    await invoke('write_desktop_log', { level, message: payload })
  } catch (error) {
    writeBrowserLog('error', `failed to write desktop log: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function shouldWrite(level: WritableLogLevel): boolean {
  return LOG_LEVEL_ORDER[currentLogLevel] >= LOG_LEVEL_ORDER[level]
}

function normalizeLogLevel(level: string): DesktopLogLevel {
  return level === 'off' || level === 'error' || level === 'info' || level === 'debug' ? level : 'error'
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveKey(key)) {
      result[key] = '[redacted]'
      continue
    }
    result[key] = sanitizeValue(value)
  }
  return result
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return `[array:${value.length}]`
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeValue(value.message)
    }
  }
  if (typeof value === 'object') return '[object]'
  return String(value)
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return normalized.includes('password') ||
    normalized.includes('secretkey') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('vaultkey') ||
    normalized.includes('deviceunlockkey') ||
    normalized.includes('payload') ||
    normalized.includes('field')
}

function writeBrowserLog(level: WritableLogLevel, message: string): void {
  const formatted = `[lockpass:${level}] ${message}`
  if (level === 'error') {
    console.error(formatted)
  } else if (level === 'debug') {
    console.debug(formatted)
  } else {
    console.info(formatted)
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
