import type { ExtensionDeviceAuthorization } from '@/shared/models'

export function parseExtensionAuthorizationCallback(
  callbackValue: string,
  expectedRedirectValue: string
): ExtensionDeviceAuthorization {
  const callback = new URL(callbackValue)
  const expectedRedirect = new URL(expectedRedirectValue)
  if (callback.origin !== expectedRedirect.origin || callback.pathname !== expectedRedirect.pathname) {
    throw new Error('authorization-callback-mismatch')
  }

  const payloadText = callback.searchParams.get('payload')
  if (!payloadText) throw new Error('authorization-payload-missing')

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadText))) as ExtensionDeviceAuthorization
    validateAuthorization(payload)
    return payload
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('authorization-')) throw error
    throw new Error('authorization-payload-invalid')
  }
}

function validateAuthorization(value: ExtensionDeviceAuthorization): void {
  if (value.mode !== 'official' && value.mode !== 'selfhost') throw new Error('authorization-payload-invalid')
  const serverUrl = new URL(value.serverUrl)
  if (serverUrl.protocol !== 'http:' && serverUrl.protocol !== 'https:') {
    throw new Error('authorization-payload-invalid')
  }
  if (
    !value.account?.id ||
    !value.account.displayName ||
    !value.device?.id ||
    !value.device.name ||
    !value.deviceToken ||
    !value.tokenType
  ) {
    throw new Error('authorization-payload-invalid')
  }
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
