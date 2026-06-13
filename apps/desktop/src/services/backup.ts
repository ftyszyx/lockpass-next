import { invoke } from '@tauri-apps/api/core'
import type { VaultItemFieldKind, VaultItemType } from '@lockpass/core'
import type { EncryptedObjectRecord } from '@/services/vaultRepository'
import type { DesktopUserProfile } from '@/services/vaultRepository'

export interface BackupAttachmentBlob {
  attachmentId: string
  fileName: string
  encryptedBlobRef: string
  bytesBase64: string
}

export interface LockPassBackupPackageV1 {
  format: 'lockpass-next-backup'
  version: 1
  exportedAt: string
  user: DesktopUserProfile
  encryptedObjects: EncryptedObjectRecord[]
  attachments: BackupAttachmentBlob[]
}

export interface ImportFieldLabelMap {
  username: string
  password: string
  url: string
  note: string
  cardholder: string
  cardNumber: string
  expiry: string
  cvv: string
}

export interface ExternalImportField {
  kind: VaultItemFieldKind
  label: string
  value: string
  sensitive: boolean
}

export interface ExternalImportItem {
  type: VaultItemType
  title: string
  notes: string
  urls: string[]
  fields: ExternalImportField[]
}

export interface ExternalImportVault {
  name: string
  items: ExternalImportItem[]
}

interface LegacySecretUser {
  uid: number
  key: string
  validData: string
}

interface LegacyUserRow {
  id: number
  username: string
  nickname: string | null
  userSet: string | null
}

interface LegacyVaultRow {
  id: number
  userId: number
  name: string
  icon: string | null
  info: string | null
}

interface LegacyVaultItemRow {
  id: number
  userId: number
  vaultId: number
  vaultItemType: string
  icon: string
  name: string
  info: string | null
  remarks: string | null
  pics: string | null
  createTime: number
  lastUseTime: number
}

interface LegacyLockPassExport {
  users: LegacyUserRow[]
  secretUsers: LegacySecretUser[]
  vaults: LegacyVaultRow[]
  vaultItems: LegacyVaultItemRow[]
}

interface LegacyDecodedUser {
  user: LegacyUserRow
  keyBytes: Uint8Array
}

const BACKUP_FORMAT = 'lockpass-next-backup'

export function assertBackupPackage(value: unknown): LockPassBackupPackageV1 {
  const backup = value as Partial<LockPassBackupPackageV1> | null
  if (
    !backup ||
    backup.format !== BACKUP_FORMAT ||
    backup.version !== 1 ||
    !backup.user ||
    !Array.isArray(backup.encryptedObjects) ||
    !Array.isArray(backup.attachments)
  ) {
    throw new Error('invalid-backup-file')
  }

  return backup as LockPassBackupPackageV1
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return window.btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export type TextFileSaveResult =
  | { target: 'tauri'; path: string }
  | { target: 'browser'; fileName: string }

export async function downloadTextFile(fileName: string, text: string, mimeType = 'application/json'): Promise<TextFileSaveResult> {
  if (isTauriRuntime()) {
    const path = await invoke<string>('save_text_file_to_downloads', { fileName, text })
    return { target: 'tauri', path }
  }

  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { target: 'browser', fileName }
}

export async function openSavedFileDirectory(path: string): Promise<boolean> {
  if (!isTauriRuntime()) return false
  await invoke('open_file_parent_dir', { path })
  return true
}

export function backupFileName(now = new Date()): string {
  return `lockpass-backup-${formatDateStamp(now)}.lpbackup.json`
}

export function csvFileName(now = new Date()): string {
  return `lockpass-export-${formatDateStamp(now)}.csv`
}

export function exportItemsToCsv(items: ExternalImportItem[]): string {
  const rows = [
    ['type', 'title', 'url', 'username', 'password', 'notes', 'cardholder', 'cardNumber', 'expiry', 'cvv'],
    ...items.map((item) => [
      item.type,
      item.title,
      item.urls[0] ?? '',
      fieldValue(item, 'username'),
      fieldValue(item, 'password'),
      item.notes || fieldValue(item, 'note'),
      fieldValue(item, 'cardholder'),
      fieldValue(item, 'card-number'),
      fieldValue(item, 'expiry'),
      fieldValue(item, 'cvv')
    ])
  ]

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}

export function parseCsvImport(text: string, labels: ImportFieldLabelMap): ExternalImportItem[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []

  const headers = rows[0].map(normalizeHeader)
  return rows.slice(1)
    .map((row) => rowToRecord(headers, row))
    .map((record) => csvRecordToImportItem(record, labels))
    .filter((item): item is ExternalImportItem => Boolean(item))
}

export async function readLegacyLockPassBackup(
  file: File,
  password: string,
  labels: ImportFieldLabelMap,
  fallbackVaultName = 'Legacy LockPass'
): Promise<{ vaults: ExternalImportVault[] }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const legacy = await invoke<LegacyLockPassExport>('read_legacy_lockpass_backup', { backupBytes: Array.from(bytes) })
  const decodedUser = await findLegacyUserForPassword(legacy, password)
  const sourceVaults = legacy.vaults.filter((vault) => vault.userId === decodedUser.user.id)
  const sourceVaultIds = new Set(sourceVaults.map((vault) => vault.id))
  const sourceItems = legacy.vaultItems.filter((item) => item.userId === decodedUser.user.id)
  const itemsByVaultId = new Map<number, LegacyVaultItemRow[]>()

  for (const item of sourceItems) {
    itemsByVaultId.set(item.vaultId, [...(itemsByVaultId.get(item.vaultId) ?? []), item])
  }

  const vaultGroups = sourceVaults.map((vault) => ({
    name: vault.name?.trim() || fallbackVaultName,
    rows: itemsByVaultId.get(vault.id) ?? []
  }))
  const orphanItems = sourceItems.filter((item) => !sourceVaultIds.has(item.vaultId))

  if (orphanItems.length > 0) {
    vaultGroups.push({
      name: fallbackVaultName,
      rows: orphanItems
    })
  }

  const vaults = await Promise.all(
    vaultGroups.map(async (vault) => {
      const items = await Promise.all(
        vault.rows.map((item) => legacyItemToImportItem(item, decodedUser.keyBytes, labels))
      )
      return {
        name: vault.name,
        items: items.filter((item): item is ExternalImportItem => Boolean(item))
      }
    })
  )

  return {
    vaults
  }
}

function fieldValue(item: ExternalImportItem, kind: VaultItemFieldKind): string {
  return item.fields.find((field) => field.kind === kind)?.value ?? ''
}

function formatDateStamp(value: Date): string {
  return value.toISOString().slice(0, 19).replace(/[-:T]/g, '')
}

function escapeCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  row.push(cell)
  rows.push(row)
  return rows.filter((candidate) => candidate.some((value) => value.trim()))
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((header, index) => {
    record[header] = row[index]?.trim() ?? ''
  })
  return record
}

function csvRecordToImportItem(record: Record<string, string>, labels: ImportFieldLabelMap): ExternalImportItem | null {
  const title = pick(record, 'title', 'name')
  const url = pick(record, 'url', 'website', 'uri')
  const username = pick(record, 'username', 'loginusername', 'account')
  const password = pick(record, 'password')
  const notes = pick(record, 'notes', 'note')
  const type = normalizeItemType(pick(record, 'type'))

  if (!title && !url && !username && !password && !notes) return null

  if (type === 'payment-card') {
    return {
      type,
      title: title || pick(record, 'cardholder') || pick(record, 'cardnumber') || 'Payment card',
      notes,
      urls: [],
      fields: compactFields([
        makeImportField('cardholder', labels.cardholder, pick(record, 'cardholder'), false),
        makeImportField('card-number', labels.cardNumber, pick(record, 'cardnumber', 'card'), true),
        makeImportField('expiry', labels.expiry, pick(record, 'expiry', 'expires'), false),
        makeImportField('cvv', labels.cvv, pick(record, 'cvv', 'cvc'), true)
      ])
    }
  }

  if (type === 'secure-note') {
    return {
      type,
      title: title || notes.slice(0, 48) || 'Secure note',
      notes,
      urls: [],
      fields: compactFields([makeImportField('note', labels.note, notes, false)])
    }
  }

  return {
    type: 'login',
    title: title || url || username || 'Imported login',
    notes,
    urls: url ? [url] : [],
    fields: compactFields([
      makeImportField('url', labels.url, url, false),
      makeImportField('username', labels.username, username, false),
      makeImportField('password', labels.password, password, true),
      makeImportField('note', labels.note, notes, false)
    ])
  }
}

function pick(record: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[normalizeHeader(key)]
    if (value) return value
  }
  return ''
}

function normalizeItemType(value: string): VaultItemType {
  if (value === 'payment-card' || value === 'card') return 'payment-card'
  if (value === 'secure-note' || value === 'note') return 'secure-note'
  if (value === 'identity') return 'identity'
  if (value === 'recovery-code') return 'recovery-code'
  if (value === 'attachment') return 'attachment'
  return 'login'
}

function makeImportField(kind: VaultItemFieldKind, label: string, value: string, sensitive: boolean): ExternalImportField | null {
  return value ? { kind, label, value, sensitive } : null
}

function compactFields(fields: Array<ExternalImportField | null>): ExternalImportField[] {
  return fields.filter((field): field is ExternalImportField => Boolean(field))
}

async function findLegacyUserForPassword(legacy: LegacyLockPassExport, password: string): Promise<LegacyDecodedUser> {
  for (const secret of legacy.secretUsers) {
    const user = legacy.users.find((candidate) => candidate.id === secret.uid)
    if (!user) continue

    const keyBytes = await legacyPasswordKey(secret.key, password)
    try {
      const validText = await decryptLegacyText(secret.validData, keyBytes)
      const valid = JSON.parse(validText) as { username?: unknown; id?: unknown }
      if (valid.username === user.username && Number(valid.id) === user.id) {
        return { user, keyBytes }
      }
    } catch {
      // Try the next user; old backups can contain multiple local users.
    }
  }

  throw new Error('legacy-password-invalid')
}

async function legacyPasswordKey(secretKey: string, password: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(`${secretKey}-${password}`)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input))
}

async function legacyItemToImportItem(
  item: LegacyVaultItemRow,
  keyBytes: Uint8Array,
  labels: ImportFieldLabelMap
): Promise<ExternalImportItem | null> {
  const [infoText, remarksText] = await Promise.all([
    decryptLegacyOptionalText(item.info, keyBytes),
    decryptLegacyOptionalText(item.remarks, keyBytes)
  ])
  const info = parseJsonObject(infoText)
  const remarks = remarksText.trim()

  if (item.vaultItemType === 'card') {
    return {
      type: 'payment-card',
      title: item.name || textValue(info.card_company) || textValue(info.card_holder) || 'Payment card',
      notes: remarks,
      urls: [],
      fields: compactFields([
        makeImportField('cardholder', labels.cardholder, textValue(info.card_holder), false),
        makeImportField('card-number', labels.cardNumber, textValue(info.card_number), true),
        makeImportField('expiry', labels.expiry, textValue(info.card_valid_time), false),
        makeImportField('cvv', labels.cvv, textValue(info.card_cvc), true),
        makeImportField('password', labels.password, textValue(info.card_password), true)
      ])
    }
  }

  if (item.vaultItemType === 'note') {
    const noteText = textValue(info.note_text) || remarks
    return {
      type: 'secure-note',
      title: item.name || noteText.slice(0, 48) || 'Secure note',
      notes: noteText,
      urls: [],
      fields: compactFields([makeImportField('note', labels.note, noteText, false)])
    }
  }

  const urls = arrayValue(info.urls)
  return {
    type: 'login',
    title: item.name || urls[0] || textValue(info.username) || 'Imported login',
    notes: remarks,
    urls,
    fields: compactFields([
      makeImportField('url', labels.url, urls[0] ?? '', false),
      makeImportField('username', labels.username, textValue(info.username), false),
      makeImportField('password', labels.password, textValue(info.password), true),
      makeImportField('note', labels.note, remarks, false)
    ])
  }
}

async function decryptLegacyOptionalText(value: string | null, keyBytes: Uint8Array): Promise<string> {
  if (!value) return ''
  return decryptLegacyText(value, keyBytes)
}

async function decryptLegacyText(value: string, keyBytes: Uint8Array): Promise<string> {
  const [cipherText, ivText] = value.split('|')
  if (!cipherText || !ivText) throw new Error('legacy-ciphertext-invalid')

  const key = await crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), 'AES-CBC', false, ['decrypt'])
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: toArrayBuffer(base64UrlToBytes(ivText)) },
    key,
    toArrayBuffer(base64UrlToBytes(cipherText))
  )
  return new TextDecoder().decode(decrypted)
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return base64ToBytes(padded)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean)
  const text = textValue(value)
  return text ? [text] : []
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
