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
      <p>输入斗鱼真实房间号，解析 FLV 或 HLS 流。登录后可运行房间签到，Cookie 只留在主进程。</p>
      <button type="button" className="btn subtle" onClick={onPickExample}>
        <Icon name="play" size={16} />
        试一下 9999
      </button>
      <div className="empty-hints">
        <span>1 路播放</span>
        <span>4 / 9 宫格预留</span>
        <span>任务中心同屏</span>
      </div>
    </div>
  );
}
