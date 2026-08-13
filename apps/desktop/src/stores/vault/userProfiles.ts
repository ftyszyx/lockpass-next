import type { DesktopUserProfile } from '@/services/vaultRepository'

let serverAccountSetupQueue: Promise<void> = Promise.resolve()
const serverAccountSetupTasks = new Map<string, Promise<unknown>>()

export function withServerAccountSetupLock<T>(
  accountId: string,
  operationName: 'create' | 'restore',
  task: () => Promise<T>,
): Promise<T> {
  const operationKey = `${accountId}:${operationName}`
  const existing = serverAccountSetupTasks.get(operationKey)
  if (existing) return existing as Promise<T>

  const operation = serverAccountSetupQueue.then(task, task)
  serverAccountSetupTasks.set(operationKey, operation)
  serverAccountSetupQueue = operation.then(() => undefined, () => undefined)
  void operation.finally(() => {
    if (serverAccountSetupTasks.get(operationKey) === operation) {
      serverAccountSetupTasks.delete(operationKey)
    }
  }).catch(() => undefined)
  return operation
}

export function deduplicateUserProfiles(users: DesktopUserProfile[]): DesktopUserProfile[] {
  const result: DesktopUserProfile[] = []
  const indexById = new Map<string, number>()

  for (const user of users) {
    const existingIndex = indexById.get(user.id)
    if (existingIndex === undefined) {
      indexById.set(user.id, result.length)
      result.push(user)
      continue
    }

    result[existingIndex] = user
  }

  return result
}

export function findServerAccountUser(
  users: DesktopUserProfile[],
  accountId: string,
): DesktopUserProfile | null {
  return users.find(
    (user) => user.id === accountId || user.sync?.accountId === accountId,
  ) ?? null
}

export function upsertServerAccountUser(
  users: DesktopUserProfile[],
  user: DesktopUserProfile,
): DesktopUserProfile[] {
  const accountId = user.sync?.accountId ?? user.id
  const existing = findServerAccountUser(users, accountId)
  const existingIndex = existing ? users.indexOf(existing) : -1
  const next = users.filter(
    (candidate) =>
      candidate.id !== user.id &&
      candidate.id !== existing?.id &&
      candidate.sync?.accountId !== accountId,
  )
  const nextUser = existing
    ? { ...user, createdAt: existing.createdAt }
    : user

  if (existingIndex < 0) {
    next.push(nextUser)
  } else {
    next.splice(Math.min(existingIndex, next.length), 0, nextUser)
  }

  return deduplicateUserProfiles(next)
}
