import { Icon } from '../../components/Icon';

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
      </div>
      <div className="empty-icon">
        <Icon name="live" size={30} />
      </div>
      <span className="eyebrow">READY WHEN YOU ARE</span>
      <h2>把直播间放进来</h2>
      <p>
        输入斗鱼真实房间号，最多 4 路同屏。每路独立解析 FLV/HLS、独立处理错误，并接入实时弹幕；
        同一时间只保留一路声音，Cookie 只留在主进程。
      </p>
      <button type="button" className="btn subtle" onClick={onPickExample}>
        <Icon name="play" size={16} />
        试一下 9999
      </button>
      <div className="empty-hints">
        <span>最多 4 路同屏</span>
        <span>单路错误隔离</span>
        <span>实时弹幕</span>
        <span>一路声音</span>
      </div>
    </div>
  );
}
