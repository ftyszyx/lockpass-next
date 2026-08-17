export function moveQuickSearchSelection(
  currentIndex: number,
  itemCount: number,
  delta: -1 | 1,
): number {
  if (itemCount <= 0) return -1

  const validIndex = currentIndex >= 0 && currentIndex < itemCount
  const startIndex = validIndex ? currentIndex : delta > 0 ? -1 : 0
  return (startIndex + delta + itemCount) % itemCount
}

export function retainQuickSearchSelection(
  selectedItemId: string | null,
  itemIds: string[],
): string | null {
  if (!itemIds.length) return null
  return selectedItemId && itemIds.includes(selectedItemId)
    ? selectedItemId
    : itemIds[0]
}
