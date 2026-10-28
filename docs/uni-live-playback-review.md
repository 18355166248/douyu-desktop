# uni-live 播放与弹幕对照

核对日期：2026-10-28。参考仓库提交：`7cfce1f3ae6cb3d0987ab931c328bfa41f478e0f`。

## 源码确认

- [PlayerAdapter](https://github.com/qianjiachun/uni-live/blob/7cfce1f3ae6cb3d0987ab931c328bfa41f478e0f/src/features/video/PlayerAdapter.tsx) 使用 react-player 2.16.0，选择 HLS/FLV；包装层没有自定义卡顿监测、音画偏移监测或重试策略。底层库可能存在自身恢复行为，不能据此声称没有任何恢复能力。
- [VideoTile](https://github.com/qianjiachun/uni-live/blob/7cfce1f3ae6cb3d0987ab931c328bfa41f478e0f/src/features/free-layout/VideoTile.tsx) 没有向 PlayerAdapter 传 onError；[LiveRoomClient](https://github.com/qianjiachun/uni-live/blob/7cfce1f3ae6cb3d0987ab931c328bfa41f478e0f/src/components/live/LiveRoomClient.tsx) 有按视频隔离的手动刷新锁，但刷新得到相同地址时不递增 playbackKey，不能作为强制重建播放器的参考。
- [DanmakuEngine](https://github.com/qianjiachun/uni-live/blob/7cfce1f3ae6cb3d0987ab931c328bfa41f478e0f/src/features/danmaku/DanmakuEngine.ts) 限制在屏弹幕 60 条、超过 40 条积压时保留最新 24 条、等待超过 2.5 秒丢弃，使用单调时钟计算等待时间。它解决渲染积压和负载，没有按视频时间轴调度弹幕。
- LiveRoomClient 收到消息后直接 push 到弹幕层，没有视频 PTS 与弹幕时间戳映射。未发现可直接复用的精确音画或弹幕同步方案。

## 本项目本轮优化

1. 借鉴弹幕限流思路：在屏最多 60 条，积压超过 40 条保留最新 24 条；保留最新批次的先后顺序，不倒序弹出。已有的 2.5 秒过期清理改用入队时的单调时钟，避免系统时间调整影响。
2. 暂停后继续播放时，如果落后最新已缓存位置超过 3 秒，跳到最后连续缓冲末尾前 2 秒；缓冲不足时不跳。此处针对本地缓存积压，不代表测得真实端到端直播延迟。
3. 原生视频错误和 HLS/FLV 错误共用有限恢复流程，避免组件层先重新解析而打断播放器内部恢复。
4. 内部视频重连时清空/暂停弹幕展示，保留健康的弹幕连接；手动重新解析仍可重建弹幕连接。弹幕自身的无响应重连保留。

## 验证边界

覆盖队列削减与顺序、在屏数量限制、系统时间回拨、清空队列、暂停恢复缓冲位置、原生解码错误及重复错误合并的自动测试。类型、Lint、模块边界及生产构建另行验证。

未完成真实直播长时间或网络故障注入验证。未声称修复上游音画时间戳错误，也不保证弹幕与画面逐帧同步。
