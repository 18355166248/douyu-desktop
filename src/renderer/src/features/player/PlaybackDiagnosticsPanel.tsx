import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { StreamPlayback } from '@shared/contracts/stream';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { useDismissableLayer } from '../../lib/useDismissableLayer';
import { bufferedAhead } from './playbackDiagnostics';

export function PlaybackDiagnostics({
  videoRef,
  playback,
  status,
  reconnects,
  reparses,
  lastError,
  onClose,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  playback: StreamPlayback;
  status: string;
  reconnects: number;
  reparses: number;
  lastError: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const panelRef = useDialogFocus();
  const [sample, setSample] = useState({ buffer: 0, width: 0, height: 0 });
  useDismissableLayer({ open: true, modal: true, layerRef: panelRef, onClose });
  useEffect(() => {
    const sampleVideo = (): void => {
      const video = videoRef.current;
      if (!video) return;
      setSample({
        buffer: bufferedAhead(video),
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
    sampleVideo();
    const timer = window.setInterval(sampleVideo, 1_000);
    return () => window.clearInterval(timer);
  }, [videoRef, playback]);

  return createPortal(
    <div className="viewing-backdrop">
      <section
        ref={panelRef}
        className="viewing-panel playback-diagnostics"
        role="dialog"
        aria-modal="true"
        aria-label="播放诊断"
      >
        <header>
          <h2>播放诊断</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            关闭
          </button>
        </header>
        <p>
          房间 {playback.roomId} · {playback.anchorName || playback.title || '直播间'}
        </p>
        <dl className="playback-diagnostics-grid selectable">
          <div>
            <dt>当前状态</dt>
            <dd>{status}</dd>
          </div>
          <div>
            <dt>播放协议</dt>
            <dd>{playback.format.toUpperCase()}</dd>
          </div>
          <div>
            <dt>实际画质</dt>
            <dd>{playback.quality}</dd>
          </div>
          <div>
            <dt>画面尺寸</dt>
            <dd>
              {sample.width && sample.height ? `${sample.width} × ${sample.height}` : '等待画面'}
            </dd>
          </div>
          <div>
            <dt>可播放缓冲</dt>
            <dd>{sample.buffer.toFixed(1)} 秒</dd>
          </div>
          <div>
            <dt>内部重连</dt>
            <dd>{reconnects} 次</dd>
          </div>
          <div>
            <dt>播放源更新</dt>
            <dd>{reparses} 次</dd>
          </div>
          <div>
            <dt>最近播放异常</dt>
            <dd>{lastError || '暂无'}</dd>
          </div>
        </dl>
        <p>
          缓冲仅表示当前播放位置之后已下载的连续内容。重连与播放源更新次数从本次打开房间开始累计。
        </p>
      </section>
    </div>,
    document.body,
  );
}
