const RECORD_VERSION = 1
const AAD_PURPOSE = 'lockpass browser secret key v1'

export interface BrowserDeviceKeyRecord {
  accountId: string
  keyId: string
  version: 1
  key: CryptoKey
  createdAt: string
}

export interface BrowserSecretKeyRecord {
  accountId: string
  keyId: string
  version: 1
  algorithm: 'AES-GCM'
  iv: string
  ciphertext: string
  updatedAt: string
}

export async function createBrowserDeviceKeyRecord(
  accountId: string
): Promise<BrowserDeviceKeyRecord> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  ) as CryptoKey

  return {
    accountId,
    keyId: crypto.randomUUID(),
    version: RECORD_VERSION,
    key,
    createdAt: new Date().toISOString()
  }
}

export async function encryptBrowserSecretKey(
  keyRecord: BrowserDeviceKeyRecord,
  secretKey: string
): Promise<BrowserSecretKeyRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(secretKey)
  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: secretKeyAad(keyRecord.accountId, keyRecord.keyId),
        tagLength: 128
      },
      keyRecord.key,
      toArrayBuffer(plaintext)
    )
    return {
      accountId: keyRecord.accountId,
      keyId: keyRecord.keyId,
      version: RECORD_VERSION,
      algorithm: 'AES-GCM',
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      updatedAt: new Date().toISOString()
    }
  } finally {
    plaintext.fill(0)
  }
}

export async function decryptBrowserSecretKey(
  keyRecord: BrowserDeviceKeyRecord,
  secretRecord: BrowserSecretKeyRecord
): Promise<string> {
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64ToBytes(secretRecord.iv)),
      additionalData: secretKeyAad(keyRecord.accountId, keyRecord.keyId),
      tagLength: 128
    },
    keyRecord.key,
    toArrayBuffer(base64ToBytes(secretRecord.ciphertext))
  ))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
  } finally {
    plaintext.fill(0)
  }
}

export function isBrowserDeviceKeyRecord(
  accountId: string,
  record: BrowserDeviceKeyRecord | undefined
): record is BrowserDeviceKeyRecord {
  return Boolean(
    record &&
    record.accountId === accountId &&
    record.version === RECORD_VERSION &&
    record.keyId &&
    record.key &&
    record.key.type === 'secret' &&
    record.key.extractable === false &&
    record.key.algorithm.name === 'AES-GCM' &&
    record.key.usages.includes('encrypt') &&
    record.key.usages.includes('decrypt')
  )
}

export function isBrowserSecretKeyRecord(
  accountId: string,
  record: BrowserSecretKeyRecord | undefined
): record is BrowserSecretKeyRecord {
  return Boolean(
    record &&
    record.accountId === accountId &&
    record.version === RECORD_VERSION &&
    record.algorithm === 'AES-GCM' &&
    record.keyId &&
    record.iv &&
    record.ciphertext
  )
}

export function isInvalidBrowserSecretKeyCiphertext(error: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'OperationError' || error.name === 'DataError')
  )
}

function secretKeyAad(accountId: string, keyId: string): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(
    JSON.stringify({ purpose: AAD_PURPOSE, version: RECORD_VERSION, accountId, keyId })
  ))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
