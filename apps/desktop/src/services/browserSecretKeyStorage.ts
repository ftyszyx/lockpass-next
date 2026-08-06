import {
  createBrowserDeviceKeyRecord,
  decryptBrowserSecretKey,
  encryptBrowserSecretKey,
  isBrowserDeviceKeyRecord,
  isBrowserSecretKeyRecord,
  isInvalidBrowserSecretKeyCiphertext,
  type BrowserDeviceKeyRecord,
  type BrowserSecretKeyRecord
} from './browserSecretKeyEnvelope'

const DATABASE_NAME = 'lockpass-next-trusted-browser'
const DATABASE_VERSION = 1
const DEVICE_KEY_STORE = 'deviceKeys'
const SECRET_KEY_STORE = 'secretKeys'

export type BrowserSecretKeyStorageResult =
  | { status: 'saved' }
  | { status: 'loaded'; secretKey: string }
  | { status: 'missing' }
  | { status: 'deleted' }
  | { status: 'unsupported' }

class BrowserSecretKeyStorageUnavailableError extends Error {}

export async function saveBrowserSecretKey(
  accountId: string,
  secretKey: string
): Promise<BrowserSecretKeyStorageResult> {
  if (!isBrowserSecretKeyStorageSupported()) return { status: 'unsupported' }

  try {
    return await withDatabase(async (database) => {
      const existingKey = await readDeviceKey(database, accountId)
      const keyRecord = existingKey ?? await createBrowserDeviceKeyRecord(accountId)
      const secretRecord = await encryptBrowserSecretKey(keyRecord, secretKey)
      await writeSecretKeyRecords(database, keyRecord, secretRecord)
      return { status: 'saved' }
    })
  } catch (error) {
    if (isStorageUnavailableError(error)) return { status: 'unsupported' }
    throw error
  }
}

export async function loadBrowserSecretKey(
  accountId: string
): Promise<BrowserSecretKeyStorageResult> {
  if (!isBrowserSecretKeyStorageSupported()) return { status: 'unsupported' }

  try {
    return await withDatabase(async (database) => {
      const { keyRecord, secretRecord } = await readSecretKeyRecords(database, accountId)
      if (
        !isBrowserDeviceKeyRecord(accountId, keyRecord) ||
        !isBrowserSecretKeyRecord(accountId, secretRecord) ||
        keyRecord.keyId !== secretRecord.keyId
      ) {
        return { status: 'missing' }
      }

      try {
        const secretKey = await decryptBrowserSecretKey(keyRecord, secretRecord)
        return secretKey ? { status: 'loaded', secretKey } : { status: 'missing' }
      } catch (error) {
        if (!isInvalidBrowserSecretKeyCiphertext(error)) throw error
        await deleteBrowserSecretKeyRecords(database, accountId)
        return { status: 'missing' }
      }
    })
  } catch (error) {
    if (isStorageUnavailableError(error)) return { status: 'unsupported' }
    throw error
  }
}

export async function deleteBrowserSecretKey(
  accountId: string
): Promise<BrowserSecretKeyStorageResult> {
  if (!isBrowserSecretKeyStorageSupported()) return { status: 'unsupported' }

  try {
    await withDatabase((database) => deleteBrowserSecretKeyRecords(database, accountId))
    return { status: 'deleted' }
  } catch (error) {
    if (isStorageUnavailableError(error)) return { status: 'unsupported' }
    throw error
  }
}

function isBrowserSecretKeyStorageSupported(): boolean {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    Boolean(crypto.subtle)
  )
}

async function withDatabase<T>(task: (database: IDBDatabase) => Promise<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await task(database)
  } finally {
    database.close()
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DEVICE_KEY_STORE)) {
        database.createObjectStore(DEVICE_KEY_STORE, { keyPath: 'accountId' })
      }
      if (!database.objectStoreNames.contains(SECRET_KEY_STORE)) {
        database.createObjectStore(SECRET_KEY_STORE, { keyPath: 'accountId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(
      request.error ?? new BrowserSecretKeyStorageUnavailableError('failed to open trusted browser storage')
    )
    request.onblocked = () => reject(
      new BrowserSecretKeyStorageUnavailableError('trusted browser storage upgrade is blocked')
    )
  })
}

async function readDeviceKey(
  database: IDBDatabase,
  accountId: string
): Promise<BrowserDeviceKeyRecord | undefined> {
  const transaction = database.transaction(DEVICE_KEY_STORE, 'readonly')
  const done = transactionDone(transaction)
  const record = await requestResult<BrowserDeviceKeyRecord | undefined>(
    transaction.objectStore(DEVICE_KEY_STORE).get(accountId)
  )
  await done
  return isBrowserDeviceKeyRecord(accountId, record) ? record : undefined
}

async function readSecretKeyRecords(
  database: IDBDatabase,
  accountId: string
): Promise<{
  keyRecord: BrowserDeviceKeyRecord | undefined
  secretRecord: BrowserSecretKeyRecord | undefined
}> {
  const transaction = database.transaction([DEVICE_KEY_STORE, SECRET_KEY_STORE], 'readonly')
  const done = transactionDone(transaction)
  const [keyRecord, secretRecord] = await Promise.all([
    requestResult<BrowserDeviceKeyRecord | undefined>(
      transaction.objectStore(DEVICE_KEY_STORE).get(accountId)
    ),
    requestResult<BrowserSecretKeyRecord | undefined>(
      transaction.objectStore(SECRET_KEY_STORE).get(accountId)
    )
  ])
  await done
  return { keyRecord, secretRecord }
}

async function writeSecretKeyRecords(
  database: IDBDatabase,
  keyRecord: BrowserDeviceKeyRecord,
  secretRecord: BrowserSecretKeyRecord
): Promise<void> {
  const transaction = database.transaction([DEVICE_KEY_STORE, SECRET_KEY_STORE], 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore(DEVICE_KEY_STORE).put(keyRecord)
  transaction.objectStore(SECRET_KEY_STORE).put(secretRecord)
  await done
}

async function deleteBrowserSecretKeyRecords(
  database: IDBDatabase,
  accountId: string
): Promise<void> {
  const transaction = database.transaction([DEVICE_KEY_STORE, SECRET_KEY_STORE], 'readwrite')
  const done = transactionDone(transaction)
  transaction.objectStore(DEVICE_KEY_STORE).delete(accountId)
  transaction.objectStore(SECRET_KEY_STORE).delete(accountId)
  await done
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(
      request.error ?? new BrowserSecretKeyStorageUnavailableError('trusted browser storage request failed')
    )
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(
      transaction.error ?? new BrowserSecretKeyStorageUnavailableError('trusted browser storage transaction failed')
    )
    transaction.onabort = () => reject(
      transaction.error ?? new BrowserSecretKeyStorageUnavailableError('trusted browser storage transaction was aborted')
    )
  })
}

function isStorageUnavailableError(error: unknown): boolean {
  return (
    error instanceof BrowserSecretKeyStorageUnavailableError ||
    (typeof DOMException !== 'undefined' && error instanceof DOMException)
  )
}
