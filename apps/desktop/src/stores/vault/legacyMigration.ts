import type { VaultAttachment } from '@lockpass/core'
import type { DesktopVaultPayload } from '@/services/masterPassword'
import {
  deleteAttachmentBlobRef,
  migrateLegacyAttachmentBlob
} from '@/services/vaultRepository'

export async function migrateLegacyPayload(
  userId: string,
  payload: DesktopVaultPayload,
  vaultKey: Uint8Array,
  keyId: string
): Promise<{ payload: DesktopVaultPayload; cleanupRefs: Array<{ ref: string; attachmentId: string }> }> {
  const attachments: VaultAttachment[] = []
  const cleanupRefs: Array<{ ref: string; attachmentId: string }> = []
  const now = new Date().toISOString()

  for (const attachment of payload.attachments ?? []) {
    if (!attachment.encryptedBlobRef) {
      attachments.push(markAttachmentMissing(attachment, now))
      continue
    }

    try {
      const migrated = await migrateLegacyAttachmentBlob(
        userId,
        attachment.id,
        attachment.fileName,
        attachment.encryptedBlobRef,
        vaultKey,
        keyId
      )
      if (attachment.encryptedBlobRef !== migrated.encryptedBlobRef) {
        cleanupRefs.push({ ref: attachment.encryptedBlobRef, attachmentId: attachment.id })
      }

      attachments.push({
        ...attachment,
        checksumSha256: attachment.checksumSha256 || migrated.checksumSha256,
        encryptedBlobRef: migrated.encryptedBlobRef,
        state: 'available',
        updatedAt: now,
        sync: {
          ...attachment.sync,
          revision: (attachment.sync?.revision ?? 0) + 1,
          baseRevision: attachment.sync?.revision ?? 0,
          state: 'dirty'
        }
      })
    } catch {
      attachments.push(markAttachmentMissing(attachment, now))
    }
  }

  return {
    payload: {
      vaults: payload.vaults,
      items: payload.items,
      attachments
    },
    cleanupRefs
  }
}

function markAttachmentMissing(attachment: VaultAttachment, now: string): VaultAttachment {
  return {
    ...attachment,
    encryptedBlobRef: '',
    state: 'missing',
    updatedAt: now,
    sync: {
      ...attachment.sync,
      revision: (attachment.sync?.revision ?? 0) + 1,
      baseRevision: attachment.sync?.revision ?? 0,
      state: 'dirty'
    }
  }
}

export async function cleanupLegacyAttachmentRefs(refs: Array<{ ref: string; attachmentId: string }>): Promise<void> {
  for (const { ref, attachmentId } of refs) {
    try {
      await deleteAttachmentBlobRef(ref, attachmentId)
    } catch {
      // The encrypted payload is already persisted; stale legacy blobs are best-effort cleanup.
    }
  }
}

export async function cleanupLocalAttachmentRefs(refs: Array<{ ref: string; attachmentId: string }>): Promise<void> {
  for (const { ref, attachmentId } of refs) {
    await deleteAttachmentBlobRef(ref, attachmentId)
  }
}
