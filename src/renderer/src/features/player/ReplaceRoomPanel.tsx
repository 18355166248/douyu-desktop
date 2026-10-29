import { useDismissableLayer } from '../../lib/useDismissableLayer';
import { useState } from 'react';
import type { StreamPlatform } from '@shared/contracts/stream';
import { PlatformPicker } from '../../components/PlatformPicker';
import { useDialogFocus } from '../../lib/useDialogFocus';

export function ReplaceRoomPanel({
  platform,
  onReplace,
  onClose,
}: {
  platform: StreamPlatform;
  onReplace: (input: string, platform: StreamPlatform) => Promise<string | null>;
  onClose: () => void;
}): React.JSX.Element {
  const [selected, setSelected] = useState(platform);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useDialogFocus();
  useDismissableLayer({
    modal: true,
    open: true,
    onClose,
    layerRef: panelRef,
    closeOnPointerDown: !busy,
    closeOnEscape: !busy,
  });
  return (
    <div className="viewing-backdrop">
      <section
        ref={panelRef}
        className="viewing-panel"
        role="dialog"
        aria-modal="true"
        aria-label="替换直播间"
      >
        <header>
          <h2>替换这一路</h2>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            关闭
          </button>
        </header>
        <p>保留画面位置；新房间解析失败时保留原来的直播间。</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !input.trim()) return;
            setBusy(true);
            void onReplace(input, selected)
              .then((message) => {
                if (message) {
                  setError(message);
                  setBusy(false);
                } else onClose();
              })
              .catch(() => {
                setError('替换失败，请重试');
                setBusy(false);
              });
          }}
        >
          <PlatformPicker value={selected} onChange={setSelected} />
          <input
            autoFocus
            aria-label="替换房间号或链接"
            placeholder="房间号或直播间链接"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={busy}
          />
          <button className="btn primary" disabled={busy || !input.trim()}>
            {busy ? '解析中…' : '替换'}
          </button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
