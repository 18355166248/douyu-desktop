import { useEffect, useRef, useState } from 'react';
import type { StreamPlatform } from '@shared/contracts/stream';
import { observeRoomPreview, type PreviewStatus } from './roomPreviewSession';

interface RoomHoverPreviewProps {
  platform: StreamPlatform;
  roomId: string;
}

export function RoomHoverPreview({ platform, roomId }: RoomHoverPreviewProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<PreviewStatus>('waiting');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    return observeRoomPreview(video, platform, roomId, setStatus);
  }, [platform, roomId]);

  return (
    <span className={`home-room-preview is-${status}`} aria-hidden="true">
      <video ref={videoRef} muted playsInline disablePictureInPicture tabIndex={-1} />
      {status !== 'waiting' ? (
        <span className="home-preview-status">
          {status === 'loading'
            ? '正在加载预览…'
            : status === 'playing'
              ? '静音预览 · 点击进入'
              : '暂时无法预览 · 点击进入'}
        </span>
      ) : null}
    </span>
  );
}
