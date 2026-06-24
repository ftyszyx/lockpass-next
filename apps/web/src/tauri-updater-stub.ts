export interface DownloadEvent {
  event: string
  data?: {
    contentLength?: number
    chunkLength?: number
  }
}

export interface Update {
  version: string
  currentVersion: string
  downloadAndInstall(onEvent?: (event: DownloadEvent) => void): Promise<void>
}

export async function check(): Promise<Update | null> {
  return null
}
