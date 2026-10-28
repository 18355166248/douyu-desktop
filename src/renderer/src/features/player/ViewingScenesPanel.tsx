import { useEffect, useState } from 'react';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { loadScenes, saveScenes } from './viewingStorage';
import type { ViewingScene } from './viewingStorage';

interface Props {
  current: ViewingScene | null;
  last: ViewingScene | null;
  busy: boolean;
  autoRestore: boolean;
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
  onRestore,
  onClose,
}: Props): React.JSX.Element {
  const [scenes, setScenes] = useState(loadScenes);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const panelRef = useDialogFocus();
  useEffect(() => {
    const refresh = (): void => setScenes(loadScenes());
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
