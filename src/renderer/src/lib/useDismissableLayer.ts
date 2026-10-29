import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { topLayer } from './dismissableLayers';
import type { LayerEntry } from './dismissableLayers';

const layers: LayerEntry[] = [];
const handledEvents = new WeakSet<Event>();

export interface UseDismissableLayerOptions {
  open: boolean;
  modal?: boolean;
  onClose: () => void;
  layerRef?: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  closeOnPointerDown?: boolean;
  closeOnEscape?: boolean;
}

/**
 * Closes a floating layer when the user presses Escape or pointer-downs
 * outside both the layer and its trigger. The hook is intentionally DOM
 * focused so the same behavior can back menus, panels and popovers.
 */
export function useDismissableLayer({
  open,
  modal = false,
  onClose,
  layerRef,
  triggerRef,
  restoreFocusRef,
  closeOnPointerDown = true,
  closeOnEscape = true,
}: UseDismissableLayerOptions): void {
  const onCloseRef = useRef(onClose);
  const policyRef = useRef({ closeOnPointerDown, closeOnEscape });
  policyRef.current = { closeOnPointerDown, closeOnEscape };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const entry = { node: () => layerRef?.current ?? null };
    layers.push(entry);
    const claim = (event: Event): boolean => {
      if (handledEvents.has(event) || topLayer(layers) !== entry) return false;
      handledEvents.add(event);
      return true;
    };

    const isOutside = (event: Event): boolean => {
      const target = event.target;
      return (
        target instanceof Node &&
        !layerRef?.current?.contains(target) &&
        !triggerRef?.current?.contains(target)
      );
    };
    let startedOutside = false;
    const handlePointerDown = (event: PointerEvent): void => {
      if (modal) {
        // 子层可能已在同一次 pointerdown 中卸载，仍不能让父层接管随后的 click。
        startedOutside =
          !handledEvents.has(event) && topLayer(layers) === entry && isOutside(event);
        return;
      }
      if (!claim(event) || !policyRef.current.closeOnPointerDown || !isOutside(event)) return;
      onCloseRef.current();
    };
    const handleClick = (event: MouseEvent): void => {
      if (!modal || !startedOutside || !isOutside(event) || !claim(event)) return;
      // 模态遮罩等 click 完成再卸载，并消费点击，避免底下的播放/删除按钮被顺带触发。
      // 从弹窗内拖动滑块或选中文字到外部，不视为外部点击。
      event.preventDefault();
      event.stopPropagation();
      if (policyRef.current.closeOnPointerDown) onCloseRef.current();
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || !claim(event)) return;
      // 顶层禁止关闭时仍消费 Escape，不能穿透关闭父弹窗或退出沉浸。
      event.preventDefault();
      event.stopPropagation();
      if (!policyRef.current.closeOnEscape) return;
      const active = document.activeElement;
      const shouldRestoreFocus =
        active instanceof Node &&
        ((layerRef?.current?.contains(active) ?? false) ||
          (triggerRef?.current?.contains(active) ?? false));
      onCloseRef.current();
      if (shouldRestoreFocus) restoreFocusRef?.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('click', handleClick, true);
    return () => {
      const index = layers.indexOf(entry);
      if (index >= 0) layers.splice(index, 1);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('click', handleClick, true);
    };
  }, [open, modal, layerRef, triggerRef, restoreFocusRef]);
}
