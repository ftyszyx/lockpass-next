export function isEventOutsideElement(
  event: Pick<Event, "target">,
  element: { contains(target: EventTarget | null): boolean } | null,
): boolean {
  return Boolean(element && event.target && !element.contains(event.target));
}
