const DATABASE_NAME = 'lockpass-extension-secrets'
const DATABASE_VERSION = 1
const KEY_STORE = 'keys'
const SECRET_STORE = 'secrets'

interface StoredCryptoKey {
  id: string
  key: CryptoKey
}

interface StoredEncryptedSecret {
  id: string
  accountId: string
  iv: number[]
  ciphertext: number[]
}

export interface EncryptedSecretLocator {
  accountId: string
  keyId: string
  secretId: string
  additionalData: string
}

let databasePromise: Promise<IDBDatabase> | null = null

export async function saveEncryptedSecret(locator: EncryptedSecretLocator, value: string): Promise<void> {
  const key = await getOrCreateKey(locator.keyId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(value)
  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode(locator.additionalData)
      },
      key,
      plaintext
    )
    const database = await openDatabase()
    const transaction = database.transaction(SECRET_STORE, 'readwrite')
    const completed = transactionCompleted(transaction)
    transaction.objectStore(SECRET_STORE).put({
      id: locator.secretId,
      accountId: locator.accountId,
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertext))
    } satisfies StoredEncryptedSecret)
    await completed
  } finally {
    plaintext.fill(0)
  }
}

export async function loadEncryptedSecret(locator: EncryptedSecretLocator): Promise<string | null> {
  const records = await readSecretRecords(locator)
  if (!records) return null

  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(records.secret.iv),
      additionalData: new TextEncoder().encode(locator.additionalData)
    },
    records.key,
    new Uint8Array(records.secret.ciphertext)
  ))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
  } finally {
    plaintext.fill(0)
  }
}

async function readSecretRecords(
  locator: EncryptedSecretLocator
): Promise<{ key: CryptoKey; secret: StoredEncryptedSecret } | null> {
  const database = await openDatabase()
  const transaction = database.transaction([KEY_STORE, SECRET_STORE], 'readonly')
  const completed = transactionCompleted(transaction)
  const [keyRecord, secretRecord] = await Promise.all([
    requestResult<StoredCryptoKey | undefined>(transaction.objectStore(KEY_STORE).get(locator.keyId)),
    requestResult<StoredEncryptedSecret | undefined>(transaction.objectStore(SECRET_STORE).get(locator.secretId))
  ])
  await completed
  if (!keyRecord?.key || !secretRecord || secretRecord.accountId !== locator.accountId) return null
  return { key: keyRecord.key, secret: secretRecord }
}

async function getOrCreateKey(keyId: string): Promise<CryptoKey> {
  const database = await openDatabase()
  const readTransaction = database.transaction(KEY_STORE, 'readonly')
  const readCompleted = transactionCompleted(readTransaction)
  const stored = await requestResult<StoredCryptoKey | undefined>(
    readTransaction.objectStore(KEY_STORE).get(keyId)
  )
  await readCompleted
  if (stored?.key) return stored.key

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  const writeTransaction = database.transaction(KEY_STORE, 'readwrite')
  const writeCompleted = transactionCompleted(writeTransaction)
  writeTransaction.objectStore(KEY_STORE).put({ id: keyId, key } satisfies StoredCryptoKey)
  await writeCompleted
  return key
}

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(SECRET_STORE)) database.createObjectStore(SECRET_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb-open-failed'))
  })
  return databasePromise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb-request-failed'))
  })
}

function transactionCompleted(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb-transaction-failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb-transaction-aborted'))
  })
}
