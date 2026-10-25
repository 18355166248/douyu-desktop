import { useEffect, useId, useRef, useState } from 'react';
import type { StreamPlatform } from '@shared/contracts/stream';
import { useDismissableLayer } from '../lib/useDismissableLayer';
import { platformLabel } from '../lib/streamIdentity';
import { Icon } from './Icon';

const PLATFORM_OPTIONS: ReadonlyArray<{ value: StreamPlatform; label: string }> = [
  { value: 'douyu', label: '斗鱼' },
  { value: 'bilibili', label: 'B站' },
  { value: 'huya', label: '虎牙' },
];

export interface PlatformPickerProps {
  value: StreamPlatform;
  onChange: (value: StreamPlatform) => void;
}

export function PlatformPicker({ value, onChange }: PlatformPickerProps): React.JSX.Element {
  const [isOpen, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useDismissableLayer({
    open: isOpen,
    onClose: () => setOpen(false),
    layerRef: rootRef,
    triggerRef: buttonRef,
    restoreFocusRef: buttonRef,
  });

  useEffect(() => {
    if (!isOpen) return;
    const selected = listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    selected?.focus();
  }, [isOpen]);

  const choose = (next: StreamPlatform): void => {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const moveFocus = (direction: 1 | -1): void => {
    const items = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []),
    ];
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = current < 0 ? 0 : (current + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const items = [
        ...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []),
      ];
      (event.key === 'Home' ? items[0] : items[items.length - 1])?.focus();
    }
  };

  const handleRootBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (!isOpen) return;
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) {
      return;
    }
    setOpen(false);
  };

  return (
    <div className="platform-picker" ref={rootRef} onBlur={handleRootBlur}>
      <button
        ref={buttonRef}
        type="button"
        className={`titlebar-platform${isOpen ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={`直播平台：${platformLabel(value)}`}
        title="选择直播平台"
        onClick={() => setOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{platformLabel(value)}</span>
        <Icon name="chevron" size={12} />
      </button>

      {isOpen ? (
        <div
          ref={listRef}
          id={listboxId}
          className="platform-menu"
          role="listbox"
          aria-label="选择直播平台"
          onKeyDown={handleListKeyDown}
        >
          {PLATFORM_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                className={`platform-option${selected ? ' is-selected' : ''}`}
                onClick={() => choose(option.value)}
              >
                <span>{option.label}</span>
                {selected ? <Icon name="check" size={13} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
