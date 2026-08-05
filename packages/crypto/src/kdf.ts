import { argon2idAsync } from '@noble/hashes/argon2.js'
import { concatBytes, lengthPrefix, randomBytes, utf8ToBytes, base64urlToBytes, bytesToBase64url } from './encoding.js'
import { decodeSecretKey } from './secretKey.js'
import type { KdfParams } from './types.js'

const UNLOCK_PURPOSE = 'lockpass unlock v1'
const KEY_BYTES = 32
const SALT_BYTES = 16
const ARGON2_MEMORY_KIB = 32_768
const ARGON2_ITERATIONS = 2
const ARGON2_PARALLELISM = 1

export function createKdfParams(): KdfParams {
  return {
    version: 1,
    name: 'argon2id',
    memoryKiB: ARGON2_MEMORY_KIB,
    iterations: ARGON2_ITERATIONS,
    parallelism: ARGON2_PARALLELISM,
    salt: bytesToBase64url(randomBytes(SALT_BYTES)),
    keyLengthBytes: KEY_BYTES,
    inputEncoding: 'domain-tagged-length-prefixed-utf8',
    passwordNormalization: 'NFKC',
    purpose: UNLOCK_PURPOSE
  }
}

export async function deriveUnlockKey(password: string, secretKey: string, params: KdfParams): Promise<Uint8Array> {
  assertSupportedKdf(params)
  const input = encodeUnlockInput(password, secretKey)

  try {
    return await argon2idAsync(input, base64urlToBytes(params.salt), {
      t: params.iterations,
      m: params.memoryKiB,
      p: params.parallelism,
      dkLen: params.keyLengthBytes,
      asyncTick: 10,
      maxmem: 256 * 1024 * 1024
    })
  } finally {
    input.fill(0)
  }
}

function encodeUnlockInput(password: string, secretKey: string): Uint8Array {
  const domain = utf8ToBytes(UNLOCK_PURPOSE)
  const passwordBytes = utf8ToBytes(password.normalize('NFKC'))
  const secretKeyBytes = decodeSecretKey(secretKey)
  const input = concatBytes(domain, lengthPrefix(passwordBytes), passwordBytes, lengthPrefix(secretKeyBytes), secretKeyBytes)
  passwordBytes.fill(0)
  secretKeyBytes.fill(0)
  return input
}

function assertSupportedKdf(params: KdfParams): void {
  if (
    params.version !== 1 ||
    params.name !== 'argon2id' ||
    params.memoryKiB !== ARGON2_MEMORY_KIB ||
    params.iterations !== ARGON2_ITERATIONS ||
    params.parallelism !== ARGON2_PARALLELISM ||
    params.keyLengthBytes !== KEY_BYTES ||
    params.inputEncoding !== 'domain-tagged-length-prefixed-utf8' ||
    params.passwordNormalization !== 'NFKC' ||
    params.purpose !== UNLOCK_PURPOSE
  ) {
    throw new Error('Unsupported or weak KDF parameters')
  }
}
