import { Icon } from '../../components/Icon';
import { useDanmakuSettings } from './DanmakuSettingsContext';
import type { DanmakuArea } from './danmakuSettings';

interface DanmakuSettingsPanelProps {
  onClose: () => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: SliderRowProps): React.JSX.Element {
  return (
    <label className="ds-field">
      <span className="ds-field-head">
        <span>{label}</span>
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps): React.JSX.Element {
  return (
    <div className="ds-toggle-row">
      <div>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`ds-switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

const AREA_OPTIONS: Array<{ value: DanmakuArea; label: string }> = [
  { value: 'full', label: '全屏' },
  { value: 'quarter', label: '1/4 屏' },
  { value: 'top', label: '上半屏' },
  { value: 'bottom', label: '下半屏' },
];

const BLOCK_OPTIONS: Array<{
  key: 'blockLarge' | 'blockTop' | 'blockBottom' | 'blockRole';
  label: string;
}> = [
  { key: 'blockLarge', label: '大号' },
  { key: 'blockTop', label: '顶部' },
  { key: 'blockBottom', label: '底部' },
  { key: 'blockRole', label: '角色' },
];

export function DanmakuSettingsPanel({ onClose }: DanmakuSettingsPanelProps): React.JSX.Element {
  const { settings, update, reset, clearAll } = useDanmakuSettings();

  return (
    <section className="danmaku-settings-panel" role="dialog" aria-label="弹幕设置">
      <header className="ds-header">
        <div>
          <strong>弹幕设置</strong>
          <small>所有画面同步生效</small>
        </div>
        <div className="ds-header-actions">
          <button type="button" className="ds-text-button" onClick={reset}>
            恢复默认
          </button>
          <button type="button" className="ds-close" onClick={onClose} aria-label="关闭弹幕设置">
            <Icon name="close" size={14} />
          </button>
        </div>
      </header>

      <div className="ds-body">
        <div className="ds-toggle-group">
          <ToggleRow
            label="显示弹幕"
            description="关闭后停止渲染，连接保持"
            checked={settings.visible}
            onChange={(visible) => update({ visible })}
          />
          <ToggleRow
            label="暂停弹幕"
            description="暂停画面上的飞行弹幕"
            checked={settings.paused}
            onChange={(paused) => update({ paused })}
          />
        </div>

        <div className="ds-section">
          <SliderRow
            label="弹幕速度"
            value={settings.speed}
            min={50}
            max={200}
            step={5}
            suffix="%"
            onChange={(speed) => update({ speed })}
          />
          <SliderRow
            label="不透明度"
            value={settings.opacity}
            min={0}
            max={100}
            step={5}
            suffix="%"
            onChange={(opacity) => update({ opacity })}
          />
          <SliderRow
            label="弹幕字号"
            value={settings.fontScale}
            min={60}
            max={180}
            step={5}
            suffix="%"
            onChange={(fontScale) => update({ fontScale })}
          />
          <SliderRow
            label="同屏密度"
            value={settings.density}
            min={1}
            max={10}
            step={1}
            suffix=""
            onChange={(density) => update({ density })}
          />
        </div>

        <div className="ds-section">
          <div className="ds-section-head">
            <span>弹幕位置</span>
            <small>限制弹幕出现的画面区域</small>
          </div>
          <div className="ds-segments" role="group" aria-label="弹幕位置">
            {AREA_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`ds-segment${settings.area === option.value ? ' is-on' : ''}`}
                aria-pressed={settings.area === option.value}
                onClick={() => update({ area: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ds-section">
          <div className="ds-section-head">
            <span>弹幕屏蔽</span>
            <small>选中的类型不再显示</small>
          </div>
          <div className="ds-chips">
            {BLOCK_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`ds-chip${settings[option.key] ? ' is-on' : ''}`}
                aria-pressed={settings[option.key]}
                onClick={() => update({ [option.key]: !settings[option.key] })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <ToggleRow
            label="屏蔽超级留言弹幕"
            checked={settings.blockSuper}
            onChange={(blockSuper) => update({ blockSuper })}
          />
          <ToggleRow
            label="精简弹幕"
            description="过滤无 dms 标记的机器人弹幕"
            checked={settings.simplified}
            onChange={(simplified) => update({ simplified })}
          />
        </div>

        <div className="ds-section">
          <div className="ds-section-head">
            <span>显示内容</span>
            <small>控制飞行弹幕携带的信息</small>
          </div>
          <ToggleRow
            label="粉丝牌"
            checked={settings.showBadges}
            onChange={(showBadges) => update({ showBadges })}
          />
          <ToggleRow
            label="昵称"
            checked={settings.showNickname}
            onChange={(showNickname) => update({ showNickname })}
          />
          <ToggleRow
            label="进场提示"
            checked={settings.showEnter}
            onChange={(showEnter) => update({ showEnter })}
          />
          <ToggleRow
            label="礼物提示"
            checked={settings.showGift}
            onChange={(showGift) => update({ showGift })}
          />
        </div>
      </div>

      <footer className="ds-footer">
        <button type="button" className="ds-clear" onClick={clearAll}>
          清屏
        </button>
        <span>设置会自动保存</span>
      </footer>
    </section>
  );
}
