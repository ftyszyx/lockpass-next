import { bytesToBase64url, randomBytes, toArrayBuffer, utf8ToBytes } from './encoding.js'
import { importAesKey } from './envelope.js'

export interface ActiveVaultSession {
  sessionId: string
  userId: string
  keyId: string
  vaultKeyBytes: Uint8Array
  vaultKey: CryptoKey
  verifierSalt: string | null
  verifierHash: Uint8Array | null
  locked: boolean
}

export class VaultSessionStore {
  private readonly sessions = new Map<string, ActiveVaultSession>()
  private readonly userSessions = new Map<string, string>()

  async open(userId: string, keyId: string, vaultKey: Uint8Array, password?: string): Promise<string> {
    const sessionId = `session-${crypto.randomUUID()}`
    const verifierSalt = password ? bytesToBase64url(randomBytes(16)) : null
    const verifierHash = password && verifierSalt
      ? await passwordVerifier(password, verifierSalt, userId, keyId)
      : null
    const session: ActiveVaultSession = {
      sessionId,
      userId,
      keyId,
      vaultKeyBytes: new Uint8Array(vaultKey),
      vaultKey: await importAesKey(vaultKey),
      verifierSalt,
      verifierHash,
      locked: false
    }

    const previousSessionId = this.userSessions.get(userId)
    if (previousSessionId) await this.close(previousSessionId)
    this.sessions.set(sessionId, session)
    this.userSessions.set(userId, sessionId)
    return sessionId
  }

  requireUnlocked(sessionId: string, keyId: string): ActiveVaultSession {
    const session = this.require(sessionId)
    if (session.locked) throw new Error('Vault crypto session is locked')
    if (session.keyId !== keyId) throw new Error('Vault crypto session key does not match')
    return session
  }

  async softLock(sessionId: string): Promise<void> {
    this.require(sessionId).locked = true
  }

  async resume(sessionId: string, password: string): Promise<boolean> {
    const session = this.require(sessionId)
    if (!session.verifierSalt || !session.verifierHash) return false
    const verifier = await passwordVerifier(password, session.verifierSalt, session.userId, session.keyId)
    const valid = timingSafeEqual(verifier, session.verifierHash)
    verifier.fill(0)
    if (valid) session.locked = false
    return valid
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.vaultKeyBytes.fill(0)
    session.verifierHash?.fill(0)
    this.sessions.delete(sessionId)
    if (this.userSessions.get(session.userId) === sessionId) this.userSessions.delete(session.userId)
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.close(sessionId)))
  }

  private require(sessionId: string): ActiveVaultSession {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Vault crypto session is not available')
    return session
  }
}

async function passwordVerifier(password: string, salt: string, userId: string, keyId: string): Promise<Uint8Array> {
  const input = utf8ToBytes(`lockpass session unlock v1\0${userId}\0${keyId}\0${salt}\0${password.normalize('NFKC')}`)
  try {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(input)))
  } finally {
    input.fill(0)
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false
  let difference = 0
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}
