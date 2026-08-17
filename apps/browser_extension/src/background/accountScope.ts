const SERVER_ACCOUNT_SCOPE_VERSION = 'server-account-v1'

export function canonicalAccountServerUrl(serverUrl: string): string {
  const url = new URL(serverUrl.trim())
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

export function serverAccountStorageScope(serverUrl: string, accountId: string): string {
  return [
    SERVER_ACCOUNT_SCOPE_VERSION,
    encodeURIComponent(canonicalAccountServerUrl(serverUrl)),
    encodeURIComponent(accountId.trim())
  ].join(':')
}
