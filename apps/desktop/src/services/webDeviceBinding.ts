import { configuredOfficialApiUrl } from '@/services/appConfig'
import { normalizeSyncServerUrl, type SyncDeviceBindCallbackPayload } from '@/services/syncClient'

const WEB_DEVICE_BINDING_STORAGE_KEY = 'lockpass.web.device.binding'

export function loadWebDeviceBinding(): SyncDeviceBindCallbackPayload | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(WEB_DEVICE_BINDING_STORAGE_KEY)
  if (!raw) return null

  try {
    const decoded = JSON.parse(raw) as SyncDeviceBindCallbackPayload
    if (
      (decoded.mode !== 'official' && decoded.mode !== 'selfhost') ||
      !decoded.serverUrl ||
      !decoded.deviceToken ||
      !decoded.account?.id ||
      !decoded.device?.id
    ) {
      throw new Error('invalid-web-device-binding')
    }
    return {
      ...decoded,
      serverUrl: decoded.mode === 'official'
        ? configuredOfficialApiUrl()
        : normalizeSyncServerUrl(decoded.serverUrl)
    }
  } catch {
    localStorage.removeItem(WEB_DEVICE_BINDING_STORAGE_KEY)
    return null
  }
}
