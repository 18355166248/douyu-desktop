import { describe, expect, it } from 'vitest';
import { topLayer } from './dismissableLayers';
import type { LayerEntry } from './dismissableLayers';
function node(children: Node[] = []): Node {
  return { contains: (other: Node) => children.includes(other) } as unknown as Node;
}
const entry = (value: Node | null): LayerEntry => ({ node: () => value });
describe('topLayer', () => {
  it('selects the latest independent layer and returns nothing when empty', () => {
    const a = entry(node());
    const b = entry(node());
    expect(topLayer([])).toBeUndefined();
    expect(topLayer([a, b])).toBe(b);
    expect(topLayer([a])).toBe(a);
  });
  it('keeps a nested picker above its parent regardless of effect registration order', () => {
    const childNode = node();
    const parentNode = node([childNode]);
    const child = entry(childNode);
    const parent = entry(parentNode);
    expect(topLayer([child, parent])).toBe(child);
    expect(topLayer([parent, child])).toBe(child);
  });
  it('allows a newer independent modal to cover a nested picker', () => {
    const childNode = node();
    const child = entry(childNode);
    const parent = entry(node([childNode]));
    const modal = entry(node());
    expect(topLayer([child, parent, modal])).toBe(modal);
  });
});
