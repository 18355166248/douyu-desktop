export interface LayerEntry {
  node: () => Node | null;
}

// 子浮层优先于父弹窗；独立浮层按打开顺序取最后一个，避免一次 Escape 关闭多层。
export function topLayer<T extends LayerEntry>(layers: readonly T[]): T | undefined {
  return layers.reduce<T | undefined>((top, next) => {
    if (!top) return next;
    const topNode = top.node();
    const nextNode = next.node();
    if (topNode && nextNode && nextNode.contains(topNode)) return top;
    return next;
  }, undefined);
}
