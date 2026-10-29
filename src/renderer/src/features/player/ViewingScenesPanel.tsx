import { useEffect, useState } from 'react';
import { loadPlaybackPreferences, savePlaybackPreferences } from './playbackPreferences';
import type { PlaybackPreferences } from './playbackPreferences';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { loadScenes, saveScenes } from './viewingStorage';
import type { ViewingScene } from './viewingStorage';

interface Props {
  current: ViewingScene | null;
  last: ViewingScene | null;
  busy: boolean;
  autoRestore: boolean;
  onApplyQuality: (balanced: boolean) => Promise<void>;
  onAutoRestore: (value: boolean) => void;
  onRestore: (scene: ViewingScene) => void;
  onClose: () => void;
}

export function ViewingScenesPanel({
  current,
  last,
  busy,
  autoRestore,
  onAutoRestore,
  onApplyQuality,
  onRestore,
  onClose,
}: Props): React.JSX.Element {
  const [scenes, setScenes] = useState(loadScenes);
  const [preferences, setPreferences] = useState(loadPlaybackPreferences);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const panelRef = useDialogFocus();
  useEffect(() => {
    const refresh = (): void => {
      setScenes(loadScenes());
      setPreferences(loadPlaybackPreferences());
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  function update(next: ViewingScene[]): void {
    if (!saveScenes(next)) {
      setError('保存失败，请检查本地存储空间');
      return;
    }
    setScenes(next);
    setError(null);
  }
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
    <div
      className="viewing-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className="viewing-panel"
        role="dialog"
        aria-modal="true"
        aria-label="观看组合"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header>
          <h2>观看组合</h2>
          <button className="btn ghost" onClick={onClose} autoFocus>
            关闭
          </button>
        </header>
        <p>保存房间顺序、画质、音量和主画面。载入组合会替换当前窗口的直播间。</p>
        {error ? <p role="alert">{error}</p> : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!current || !name.trim() || busy) return;
            if (scenes.length >= 20) {
              setError('最多保存 20 个组合，请先删除不需要的组合');
              return;
            }
            update([...scenes, { ...current, id: crypto.randomUUID(), name: name.trim() }]);
            setName('');
          }}
        >
          <input
            value={name}
            maxLength={30}
            onChange={(event) => setName(event.target.value)}
            placeholder="组合名称，如比赛 / 日常"
            aria-label="组合名称"
          />
          <button
            className="btn primary"
            disabled={!current || !name.trim() || busy || scenes.length >= 20}
          >
            保存当前组合
          </button>
        </form>
        <label className="viewing-check">
          <input
            type="checkbox"
            checked={autoRestore}
            onChange={(event) => onAutoRestore(event.target.checked)}
          />
          启动时自动恢复上次观看（将按保存的音量播放）
        </label>
        {last ? (
          <button className="btn ghost" disabled={busy} onClick={() => onRestore(last)}>
            恢复上次观看 · {last.rooms.length} 路
          </button>
        ) : null}
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
            disabled={!current || busy}
            onClick={() => void onApplyQuality(preferences.balancedQuality)}
          >
            将画质策略应用到当前画面
          </button>
          <p>
            开启省流时，当前主画面请求原画，其余请求高清；关闭时全部请求原画。均分布局取首路，实际画质取决于平台。应用会重新加载，之后切换主画面不会自动切画质。
          </p>
        </fieldset>
        <div className="viewing-scene-list">
          {scenes.length ? (
            scenes.map((scene) => (
              <div className="viewing-scene" key={scene.id}>
                <div>
                  <strong>{scene.name}</strong>
                  <small>
                    {scene.rooms.length} 路 · {scene.layout === 'focus' ? '主画面' : '均分'} ·{' '}
                    {scene.rooms.map((room) => room.roomId).join('、')}
                  </small>
                </div>
                <button className="btn primary" disabled={busy} onClick={() => onRestore(scene)}>
                  载入
                </button>
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => update(scenes.filter((item) => item.id !== scene.id))}
                >
                  删除
                </button>
              </div>
            ))
          ) : (
            <p>先打开直播间，再为当前组合起个名字保存。</p>
          )}
        </div>
      </section>
    </div>
  );
}
