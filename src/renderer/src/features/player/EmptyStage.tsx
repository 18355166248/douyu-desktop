import { Icon } from '../../components/Icon';
import { AppLogo } from '../../components/AppLogo';
import { MAX_STREAMS } from './streamGridLayout';

interface EmptyStageProps {
  onPickExample: () => void;
}

export function EmptyStage({ onPickExample }: EmptyStageProps): React.JSX.Element {
  return (
    <div className="empty-stage">
      <div className="empty-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <AppLogo className="empty-icon" size={88} />
      <span className="eyebrow">READY WHEN YOU ARE</span>
      <h2>把直播间放进来</h2>
      <p>
        输入斗鱼、B 站或虎牙真实房间号，最多 {MAX_STREAMS}{' '}
        路同屏。每路独立解析 FLV/HLS、独立处理错误，并接入实时弹幕；
        每路可独立静音，也可一键独奏，Cookie 只留在主进程。
      </p>
      <button type="button" className="btn subtle" onClick={onPickExample}>
        <Icon name="play" size={16} />
        试一下 9999
      </button>
      <div className="empty-hints">
        <span>最多 {MAX_STREAMS} 路同屏</span>
        <span>单路错误隔离</span>
        <span>实时弹幕</span>
        <span>一键独奏</span>
      </div>
    </div>
  );
}
