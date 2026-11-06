export function anchoredPanelPosition(
  anchor: { left: number; right: number; top: number; bottom: number },
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number; maxHeight: number } {
  const margin = 8;
  const below = Math.max(0, viewport.height - anchor.bottom - margin * 2);
  const above = Math.max(0, anchor.top - margin * 2);
  const upwards = panel.height > below && above > below;
  const maxHeight = Math.max(0, upwards ? above : below);
  const height = Math.min(panel.height, maxHeight);
  return {
    left: Math.max(
      margin,
      Math.min(anchor.right - panel.width, viewport.width - panel.width - margin),
    ),
    top: upwards ? Math.max(margin, anchor.top - margin - height) : anchor.bottom + margin,
    maxHeight,
  };
}
