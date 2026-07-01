export interface MenuRect {
  left: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MenuPositionInput {
  triggerRect: MenuRect;
  panelRect: Pick<MenuRect, "width" | "height">;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  viewportPadding?: number;
}

export interface MenuPosition {
  left: number;
  top: number;
  maxHeight: number;
}

export function calculateAddMoreMenuPosition(
  input: MenuPositionInput,
): MenuPosition {
  const gap = input.gap ?? 6;
  const viewportPadding = input.viewportPadding ?? 12;
  const availableAbove = input.triggerRect.top - viewportPadding - gap;
  const availableBelow =
    input.viewportHeight - input.triggerRect.bottom - viewportPadding - gap;
  const opensBelow = availableBelow >= input.panelRect.height
    || (availableAbove < input.panelRect.height && availableBelow >= availableAbove);
  const availableHeight = Math.max(
    0,
    opensBelow ? availableBelow : availableAbove,
  );
  const maxHeight = Math.min(input.panelRect.height, availableHeight);
  const left = clamp(
    input.triggerRect.left,
    viewportPadding,
    input.viewportWidth - input.panelRect.width - viewportPadding,
  );
  const rawTop = opensBelow
    ? input.triggerRect.bottom + gap
    : input.triggerRect.top - maxHeight - gap;
  const top = clamp(
    rawTop,
    viewportPadding,
    input.viewportHeight - maxHeight - viewportPadding,
  );

  return {
    left,
    top,
    maxHeight,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
