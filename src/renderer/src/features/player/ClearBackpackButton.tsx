import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { errorMessage, unwrap } from '../../lib/api';
import { useDismissableLayer } from '../../lib/useDismissableLayer';
import {
  buildClearBackpackInput,
  CLEAR_BACKPACK_RESULT_MS,
  clearBackpackOutcome,
  describeClearBackpackPreview,
} from './clearBackpackAction';
import type { ClearBackpackOutcome, ClearBackpackPreview } from './clearBackpackAction';

interface ClearBackpackButtonProps {
  roomId: string;
  anchorName?: string;
  compact?: boolean;
}

/**
 * 直播卡片标题栏上的「清空背包」。
 *
 * 确认过程放在锚定按钮的浮层里，不往标题栏的横向流里塞文字，所以点击不会挤动布局。
 * 打开浮层先跑一次 dry-run 把「会送掉什么」列出来，再让用户决定要不要真的送出。
 */
export function ClearBackpackButton({
  roomId,
  anchorName,
  compact = false,
}: ClearBackpackButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ClearBackpackPreview | null>(null);
  const [outcome, setOutcome] = useState<ClearBackpackOutcome | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useDismissableLayer({
    open,
    onClose: () => setOpen(false),
    layerRef: popRef,
    triggerRef: buttonRef,
    restoreFocusRef: buttonRef,
  });

  useEffect(() => {
    if (!preview) return;
    // 焦点给「取消」而不是「确认送出」：送礼不可撤销，键盘用户不该连按两次 Enter 就送出去。
    popRef.current?.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.focus();
  }, [preview]);

  useEffect(() => {
    if (open || !outcome) return;
    const timer = window.setTimeout(() => setOutcome(null), CLEAR_BACKPACK_RESULT_MS);
    return () => window.clearTimeout(timer);
  }, [open, outcome]);

  async function runTask(dryRun: boolean): Promise<void> {
    setBusy(true);
    try {
      const result = unwrap(await window.api.tasks.run(buildClearBackpackInput(roomId, dryRun)));
      if (dryRun) {
        setPreview(describeClearBackpackPreview(result));
      } else {
        const next = clearBackpackOutcome(result);
        setOutcome(next);
        setOpen(false);
      }
    } catch (error) {
      const text = errorMessage(error);
      if (dryRun) {
        setPreview({ sendable: false, tone: 'failed', text });
      } else {
        setOutcome({ tone: 'failed', text });
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  function openPanel(): void {
    setOpen(true);
    setPreview(null);
    setOutcome(null);
    void runTask(true);
  }

  return (
    <div className="clear-backpack-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`icon-btn clear-backpack${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`清空背包，把礼物送给房间 ${roomId}`}
        title="把背包礼物全部送给这个直播间"
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          openPanel();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!open) openPanel();
        }}
      >
        <Icon name="gift" size={compact ? 15 : 17} />
        {outcome && !open ? (
          <i className={`clear-backpack-dot is-${outcome.tone}`} aria-hidden="true" />
        ) : null}
      </button>

      {open ? (
        <div
          className="clear-backpack-pop"
          role="dialog"
          aria-label={`清空背包，房间 ${roomId}`}
          ref={popRef}
        >
          <header className="clear-backpack-pop-head">
            <strong>清空背包</strong>
            <span>{anchorName ? `${anchorName} · 房间 ${roomId}` : `房间 ${roomId}`}</span>
          </header>

          {busy && !preview ? (
            <p className="clear-backpack-pop-text">
              <Icon name="loading" size={13} /> 正在读取背包…
            </p>
          ) : null}

          {preview ? (
            <p className={`clear-backpack-pop-text is-${preview.tone}`}>{preview.text}</p>
          ) : null}

          <p className="clear-backpack-pop-note">
            送出后无法撤回；礼物只送给这个直播间，可在任务记录里查看进度。
          </p>

          <div className="clear-backpack-pop-actions">
            <button
              type="button"
              data-action="cancel"
              className="btn subtle"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {preview?.sendable ? '取消' : '关闭'}
            </button>
            {preview?.sendable ? (
              <button
                type="button"
                data-action="confirm"
                className="btn danger"
                disabled={busy}
                onClick={() => void runTask(false)}
              >
                {busy ? '送出中…' : '确认送出'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
