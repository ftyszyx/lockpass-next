export * from './types.js'
export * from './secretKey.js'
export * from './provider.js'

export function serverUuidFromLocalId(id: string): string | null {
  const match = id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  return match ? match[0].toLowerCase() : null
}

export function requireServerUuidFromLocalId(id: string): string {
  const uuid = serverUuidFromLocalId(id)
  if (!uuid) throw new Error('syncUnsupportedId')
  return uuid
}
