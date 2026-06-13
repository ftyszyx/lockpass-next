import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import type { DesktopLayoutSettings } from '@/services/vaultRepository'
import type { ResizeTarget } from './types'

const RESIZE_HANDLE_WIDTH = 6
const MIN_SIDEBAR_WIDTH = 190
const MAX_SIDEBAR_WIDTH = 360
const MIN_ITEM_LIST_WIDTH = 260
const MAX_ITEM_LIST_WIDTH = 560
const MIN_DETAIL_WIDTH = 420

interface LayoutStore {
  settings: {
    layout: DesktopLayoutSettings
  }
  setLayout(layout: Partial<DesktopLayoutSettings>, options?: { persist?: boolean }): Promise<void>
}

export function useColumnResize(vaultStore: LayoutStore, mainGrid: Ref<HTMLElement | null>) {
  const resizingTarget = ref<ResizeTarget | null>(null)

  const mainGridStyle = computed(() => ({
    gridTemplateColumns: `${vaultStore.settings.layout.sidebarWidth}px ${RESIZE_HANDLE_WIDTH}px ${vaultStore.settings.layout.itemListWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(${MIN_DETAIL_WIDTH}px, 1fr)`
  }))

  function startColumnResize(event: PointerEvent, target: ResizeTarget): void {
    event.preventDefault()
    resizingTarget.value = target
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', resizeColumn)
    window.addEventListener('pointerup', stopColumnResize, { once: true })
  }

  function resizeColumn(event: PointerEvent): void {
    const target = resizingTarget.value
    const grid = mainGrid.value
    if (!target || !grid) return

    const rect = grid.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const layout = vaultStore.settings.layout

    if (target === 'sidebar') {
      const maxWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        rect.width - RESIZE_HANDLE_WIDTH * 2 - MIN_ITEM_LIST_WIDTH - MIN_DETAIL_WIDTH
      )
      void vaultStore.setLayout(
        {
          sidebarWidth: clamp(pointerX, MIN_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, maxWidth))
        },
        { persist: false }
      )
      return
    }

    const listStart = layout.sidebarWidth + RESIZE_HANDLE_WIDTH
    const maxWidth = Math.min(
      MAX_ITEM_LIST_WIDTH,
      rect.width - layout.sidebarWidth - RESIZE_HANDLE_WIDTH * 2 - MIN_DETAIL_WIDTH
    )
    void vaultStore.setLayout(
      {
        itemListWidth: clamp(pointerX - listStart, MIN_ITEM_LIST_WIDTH, Math.max(MIN_ITEM_LIST_WIDTH, maxWidth))
      },
      { persist: false }
    )
  }

  function resizeColumnByKeyboard(target: ResizeTarget, delta: number): void {
    const layout = vaultStore.settings.layout
    if (target === 'sidebar') {
      void vaultStore.setLayout({
        sidebarWidth: clamp(layout.sidebarWidth + delta, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH)
      })
      return
    }

    void vaultStore.setLayout({
      itemListWidth: clamp(layout.itemListWidth + delta, MIN_ITEM_LIST_WIDTH, MAX_ITEM_LIST_WIDTH)
    })
  }

  function onResizeHandleKeydown(event: KeyboardEvent, target: ResizeTarget): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    event.preventDefault()
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    resizeColumnByKeyboard(target, direction * (event.shiftKey ? 32 : 12))
  }

  function stopColumnResize(): void {
    if (!resizingTarget.value) return

    window.removeEventListener('pointermove', resizeColumn)
    window.removeEventListener('pointerup', stopColumnResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    resizingTarget.value = null
    void vaultStore.setLayout(vaultStore.settings.layout)
  }

  onBeforeUnmount(stopColumnResize)

  return {
    mainGridStyle,
    resizingTarget,
    startColumnResize,
    onResizeHandleKeydown,
    stopColumnResize
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)))
}
