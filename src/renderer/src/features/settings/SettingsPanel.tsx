import { useDismissableLayer } from '../../lib/useDismissableLayer';
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/Icon';
import { KeyboardHelp } from '../../components/KeyboardHelp';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { DanmakuSettingsPanel } from '../danmaku/DanmakuSettingsPanel';
import { PlaybackSettings } from './PlaybackSettings';

export type SettingsSection = 'general' | 'playback' | 'danmaku' | 'shortcuts';
const sections: Array<{ id: SettingsSection; label: string; icon: IconName }> = [
  { id: 'general', label: '通用', icon: 'settings' },
  { id: 'playback', label: '播放与声音', icon: 'volume' },
  { id: 'danmaku', label: '弹幕', icon: 'danmaku' },
  { id: 'shortcuts', label: '快捷键', icon: 'keyboard' },
];
interface Props {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  autoRestore: boolean;
  onAutoRestore: (value: boolean) => boolean;
  busy: boolean;
  hasRooms: boolean;
  onApplyQuality: (balanced: boolean) => Promise<void>;
  onClose: () => void;
}
export function SettingsPanel({
  section,
  onSectionChange,
  autoRestore,
  onAutoRestore,
  busy,
  hasRooms,
  onApplyQuality,
  onClose,
}: Props): React.JSX.Element {
  const ref = useDialogFocus();
  const [error, setError] = useState<string | null>(null);
  const [keywordsDirty, setKeywordsDirty] = useState(false);
  useDismissableLayer({
    modal: true,
    open: true,
    onClose,
    layerRef: ref,
    closeOnPointerDown: !keywordsDirty,
  });
  return (
    <div className="viewing-backdrop">
      <section
        ref={ref}
        className="viewing-panel app-settings"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        <header className="settings-header">
          <div>
            <h2>
              <Icon name="settings" size={22} />
              设置
            </h2>
            <p>基础偏好与常用操作</p>
          </div>
          <button
            className="settings-close"
            onClick={onClose}
            aria-label="关闭设置"
            title="关闭（Esc）"
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="settings-layout">
          <nav aria-label="设置分类">
            {sections.map((item) => (
              <button
                type="button"
                className={`btn ghost${section === item.id ? ' is-active' : ''}`}
                aria-current={section === item.id ? 'page' : undefined}
                key={item.id}
                onClick={() => onSectionChange(item.id)}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {/* 各分类保持挂载，切换时保留未应用的关键词草稿；仍由原有存储和 Context 管理配置。 */}
            <section hidden={section !== 'general'} aria-label="通用设置">
              <h3>通用</h3>
              <p className="settings-intro">管理应用启动时的观看体验。</p>
              <div className="settings-card">
                <h4>启动与恢复</h4>
                <label className="viewing-check">
                  <input
                    type="checkbox"
                    checked={autoRestore}
                    onChange={(event) =>
                      setError(
                        onAutoRestore(event.target.checked)
                          ? null
                          : '无法保存自动恢复设置，请检查本地存储空间',
                      )
                    }
                  />
                  启动时自动恢复上次观看
                </label>
                <p>主窗口启动时恢复房间、布局和已保存的声音设置。副屏窗口不自动恢复。</p>
                {error ? <p role="alert">{error}</p> : null}
              </div>
            </section>
            <section hidden={section !== 'playback'} aria-label="播放与声音设置">
              <h3>播放与声音</h3>
              <p className="settings-intro">设置新房间的默认画质与声音。</p>
              <PlaybackSettings busy={busy} hasRooms={hasRooms} onApplyQuality={onApplyQuality} />
            </section>
            <section hidden={section !== 'danmaku'} aria-label="弹幕配置">
              <DanmakuSettingsPanel embedded onClose={onClose} onDirtyChange={setKeywordsDirty} />
            </section>
            <section hidden={section !== 'shortcuts'} aria-label="快捷键说明">
              <h3>快捷键</h3>
              <KeyboardHelp />
            </section>
          </div>
        </div>
        <footer className="settings-footer">
          <span>
            <Icon name="check" size={14} />
            偏好保存在本机 · 修改后自动保存
          </span>
          <span>
            {keywordsDirty ? '关键词尚未应用 · 应用后可点击外部关闭' : '关键词需点击应用'}
          </span>
        </footer>
      </section>
    </div>
  );
}
