import { useEffect, useState } from 'react';
import { loadPlaybackPreferences, savePlaybackPreferences } from '../player/playbackPreferences';
import type { PlaybackPreferences } from '../player/playbackPreferences';
export function PlaybackSettings({
  busy,
  hasRooms,
  onApplyQuality,
}: {
  busy: boolean;
  hasRooms: boolean;
  onApplyQuality: (balanced: boolean) => Promise<void>;
}): React.JSX.Element {
  const [preferences, setPreferences] = useState(loadPlaybackPreferences);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setPreferences(loadPlaybackPreferences());
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  function updatePreferences(patch: Partial<PlaybackPreferences>): void {
    const next = { ...preferences, ...patch };
    if (!savePlaybackPreferences(next)) {
      setError('无法保存播放偏好，请检查本地存储空间');
      return;
    }
    setPreferences(next);
    setError(null);
  }
  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <fieldset className="playback-preferences" disabled={busy}>
        <legend>播放偏好</legend>
        <label className="viewing-check">
          <input
            type="checkbox"
            checked={preferences.balancedQuality}
            onChange={(event) => updatePreferences({ balancedQuality: event.target.checked })}
          />
          多路省流：首路原画，后续新增房间高清
        </label>
        <label className="viewing-check">
          <input
            type="checkbox"
            checked={preferences.muteNewRooms}
            onChange={(event) => updatePreferences({ muteNewRooms: event.target.checked })}
          />
          新增 / 替换房间默认静音
        </label>
        <label className="viewing-check">
          默认音量 {Math.round(preferences.volume * 100)}%
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            aria-label="默认音量"
            value={Math.round(preferences.volume * 100)}
            onChange={(event) => updatePreferences({ volume: Number(event.target.value) / 100 })}
          />
        </label>
        <p>已有房间沿用记忆的画质和音量；组合恢复按组合配置播放。虎牙保持当前唯一画质。</p>
        <button
          type="button"
          className="btn ghost"
          disabled={!hasRooms || busy}
          onClick={() => void onApplyQuality(preferences.balancedQuality)}
        >
          将画质策略应用到当前画面
        </button>
        <p>
          开启省流时，当前主画面请求原画，其余请求高清；关闭时全部请求原画。均分布局取首路，实际画质取决于平台。应用会重新加载，之后切换主画面不会自动切画质。
        </p>
      </fieldset>
    </>
  );
}
