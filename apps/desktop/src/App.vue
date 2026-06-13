<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef } from 'vue'
import { Download, RefreshCw, RotateCcw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import {
  checkForDesktopUpdate,
  downloadAndInstallDesktopUpdate,
  isForceDesktopUpdate,
  isDesktopUpdateSupported,
  relaunchDesktopApp,
  type DesktopUpdate,
  type DesktopUpdateDownloadEvent
} from '@/services/appUpdater'
import { logError, logInfo } from '@/services/logger'

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'installing' | 'error'

const STARTUP_UPDATE_CHECK_DELAY_MS = 3_000

const { t } = useI18n()

const updateState = reactive<{
  visible: boolean
  status: UpdateStatus
  currentVersion: string
  version: string
  force: boolean
  downloadedBytes: number
  totalBytes: number | null
  error: string
}>({
  visible: false,
  status: 'idle',
  currentVersion: '',
  version: '',
  force: false,
  downloadedBytes: 0,
  totalBytes: null,
  error: ''
})

const pendingUpdate = shallowRef<DesktopUpdate | null>(null)

const canDismissUpdateModal = computed(() => (updateState.status === 'available' && !updateState.force) || updateState.status === 'error')

const updateTitle = computed(() => {
  if (updateState.status === 'downloading') return t('update.downloadingTitle')
  if (updateState.status === 'installing') return t('update.installingTitle')
  if (updateState.status === 'error') return t('update.failedTitle')
  if (updateState.force) return t('update.forceTitle')
  return t('update.availableTitle')
})

const updateBody = computed(() => {
  if (updateState.status === 'downloading') return t('update.downloadingBody')
  if (updateState.status === 'installing') return t('update.installingBody')
  if (updateState.status === 'error') return t('update.failedBody')
  return t(updateState.force ? 'update.forceBody' : 'update.availableBody', {
    version: updateState.version,
    currentVersion: updateState.currentVersion
  })
})

const updateProgressPercent = computed(() => {
  if (!updateState.totalBytes || updateState.totalBytes <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((updateState.downloadedBytes / updateState.totalBytes) * 100)))
})

const updateProgressText = computed(() => {
  if (updateState.status === 'installing') return t('update.installingProgress')
  if (!updateState.totalBytes) return t('update.downloadingProgressUnknown')
  return t('update.downloadingProgress', { percent: updateProgressPercent.value })
})

onMounted(() => {
  window.setTimeout(() => {
    void checkStartupUpdate()
  }, STARTUP_UPDATE_CHECK_DELAY_MS)
})

async function checkStartupUpdate(): Promise<void> {
  if (!isDesktopUpdateSupported() || updateState.status !== 'idle') return

  try {
    const update = await checkForDesktopUpdate()
    if (!update) return

    pendingUpdate.value = update
    updateState.currentVersion = update.currentVersion
    updateState.version = update.version
    updateState.force = isForceDesktopUpdate(update.currentVersion, update.version)
    updateState.visible = true
    updateState.status = 'available'
    await logInfo('desktop update available', {
      currentVersion: update.currentVersion,
      version: update.version,
      force: updateState.force
    })
  } catch (error) {
    await logError('desktop update check failed', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

async function installUpdate(): Promise<void> {
  if (!pendingUpdate.value || updateState.status === 'downloading' || updateState.status === 'installing') return

  updateState.status = 'downloading'
  updateState.downloadedBytes = 0
  updateState.totalBytes = null
  updateState.error = ''

  try {
    await downloadAndInstallDesktopUpdate(pendingUpdate.value, handleUpdateDownloadEvent)
    updateState.status = 'installing'
    await logInfo('desktop update installed', { version: updateState.version })
    await relaunchDesktopApp()
  } catch (error) {
    updateState.status = 'error'
    updateState.error = error instanceof Error ? error.message : String(error)
    await logError('desktop update install failed', { error: updateState.error })
  }
}

function handleUpdateDownloadEvent(event: DesktopUpdateDownloadEvent): void {
  if (event.event === 'Started') {
    updateState.downloadedBytes = 0
    updateState.totalBytes = event.data.contentLength ?? null
    return
  }

  if (event.event === 'Progress') {
    updateState.downloadedBytes += event.data.chunkLength
    return
  }

  updateState.status = 'installing'
}

function dismissUpdateModal(): void {
  if (!canDismissUpdateModal.value) return
  updateState.visible = false
  updateState.status = 'idle'
  pendingUpdate.value = null
  updateState.currentVersion = ''
  updateState.version = ''
  updateState.force = false
  updateState.error = ''
  updateState.downloadedBytes = 0
  updateState.totalBytes = null
}

async function retryUpdateCheck(): Promise<void> {
  if (updateState.status !== 'error') return
  updateState.visible = false
  updateState.status = 'idle'
  pendingUpdate.value = null
  updateState.currentVersion = ''
  updateState.version = ''
  updateState.force = false
  updateState.error = ''
  await checkStartupUpdate()
}
</script>

<template>
  <RouterView v-if="!updateState.force || !updateState.visible" />

  <div v-if="updateState.visible" class="fixed inset-0 z-[95] grid place-items-center bg-slate-950/40 px-4">
    <button
      class="absolute inset-0"
      type="button"
      :aria-label="t('editor.close')"
      :disabled="!canDismissUpdateModal"
      @click="dismissUpdateModal"
    ></button>
    <section
      class="relative grid w-[440px] max-w-full gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
      role="dialog"
      aria-modal="true"
      :aria-label="updateTitle"
      :aria-busy="updateState.status === 'downloading' || updateState.status === 'installing'"
    >
      <div class="flex items-start gap-3">
        <div class="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <RefreshCw v-if="updateState.status === 'downloading' || updateState.status === 'installing'" class="size-5 animate-spin" />
          <Download v-else class="size-5" />
        </div>
        <div class="grid min-w-0 gap-1">
          <h3 class="text-base font-bold text-slate-950">{{ updateTitle }}</h3>
          <p class="text-sm leading-6 text-slate-500">{{ updateBody }}</p>
          <p v-if="updateState.error" class="break-words text-xs leading-5 text-rose-600">{{ updateState.error }}</p>
        </div>
      </div>

      <div v-if="updateState.status === 'downloading' || updateState.status === 'installing'" class="grid gap-2">
        <div class="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" :aria-valuetext="updateProgressText">
          <div
            v-if="updateState.totalBytes"
            class="h-full rounded-full bg-teal-600 transition-[width]"
            :style="{ width: `${updateProgressPercent}%` }"
          ></div>
          <div v-else class="operation-progress-bar h-full rounded-full bg-teal-600"></div>
        </div>
        <span class="text-xs font-semibold text-slate-500">{{ updateProgressText }}</span>
      </div>

      <div class="flex justify-end gap-2">
        <button
          v-if="updateState.status === 'available' && !updateState.force"
          class="plain-button"
          type="button"
          @click="dismissUpdateModal"
        >
          {{ t('update.later') }}
        </button>
        <button
          v-if="updateState.status === 'available'"
          class="primary-button"
          type="button"
          @click="installUpdate"
        >
          <Download class="size-4" />
          {{ t('update.install') }}
        </button>
        <button
          v-if="updateState.status === 'error'"
          class="plain-button"
          type="button"
          @click="dismissUpdateModal"
        >
          {{ t('editor.close') }}
        </button>
        <button
          v-if="updateState.status === 'error'"
          class="primary-button"
          type="button"
          @click="retryUpdateCheck"
        >
          <RotateCcw class="size-4" />
          {{ t('app.retry') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.operation-progress-bar {
  width: 42%;
  animation: operation-progress-slide 1.1s ease-in-out infinite;
}

@keyframes operation-progress-slide {
  0% {
    transform: translateX(-110%);
  }

  50% {
    transform: translateX(80%);
  }

  100% {
    transform: translateX(240%);
  }
}
</style>
