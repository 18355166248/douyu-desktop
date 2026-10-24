# 多平台直播与弹幕可行性

> 实测时间：2026-10-24。平台接口和风控会变化，以下结论用于排期，不代表永久可用。

## 结论

| 平台 | 直播流 | 弹幕     | 建议         |
| ---- | ------ | -------- | ------------ |
| 斗鱼 | 已接入 | 已接入   | P2 可用      |
| B 站 | 高可行 | 中高可行 | 下一阶段优先 |
| 虎牙 | 中可行 | 高成本   | 后续独立适配 |

## 已落地：斗鱼弹幕

- WebSocket：`wss://danmuproxy.douyu.com:8502` ~ `8505`
- 匿名连接，不携带账号 Cookie
- 登录包：`type@=loginreq/roomid@=<rid>`
- 入组包：`type@=joingroup/rid@=<rid>/gid@=-9999/`
- 心跳：每 40 秒发送 `type@=mrkl/`
- 数据包：12 字节头（长度、长度、类型 689）+ UTF-8 STT 载荷
- 已解析：`chatmsg`、`uenter`、`dgb`
- 断线 3 秒重连；10 秒连接超时；每路最多保留 30 条；120ms 批量刷新

实测 `node scripts/probe-danmaku.mjs 9999` 在 12 秒内收到 90 个包，包含 `chatmsg`、`uenter`、`dgb`、`pingreq` 等。

## B 站

### 直播流

- 真实房间号：`https://api.live.bilibili.com/room/v1/Room/room_init?id=<rid>`
- 播放地址：`https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?...`
- 实测 `room_id=6` 会解析到 `7734200`，返回 FLV + HLS，`live_status=1`
- CDN 需要 `Referer: https://live.bilibili.com/`，否则 403；带 Referer 后 FLV 返回 200
- CDN 带 `Access-Control-Allow-Origin: *`，但 API 本身没有暴露 CORS 头

结论：**流解析必须放主进程**（避开 CORS），播放前在 Electron session 层补 Referer；FLV/HLS 都能接。

### 弹幕

- 地址：`wss://broadcastlv.chat.bilibili.com/sub`，实测握手 101
- 16 字节包头，认证包 + 30 秒心跳；消息体可能是 JSON、zlib 或 brotli
- 参考项目 `uni-live` 已使用 `bilibili-live-ws@6.2.0` 的 browser 入口
- 需要处理 `DANMU_MSG`、`SEND_GIFT`、`INTERACT_WORD` 等消息
- 高流量房间消息量大，需要批处理和上限

结论：**可行，优先级最高**。协议成熟、依赖现成，主要工作量在房间号/流解析和 UI 平台选择。

## 虎牙

### 直播流

- 接口：`https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=<rid>`
- 实测 `roomid=660000` 返回 `liveStatus=ON` 和 5 条 FLV 线路
- API 返回的 FLV 是 `http://`；把协议替换为 `https://` 后实测 200，可正常取流
- HLS 线路实测 403，当前不建议作为主线路
- CDN 返回 `Access-Control-Allow-Origin: *`
- API 没有暴露 CORS 头

结论：**直播流可接**，解析放主进程，FLV 统一升级 HTTPS。

### 弹幕

- 地址：`ws://ws.api.huya.com:80`，实测握手 101
- 协议是虎牙私有 JCE/Taf 二进制：注册、Wup 请求、心跳、消息推送
- 需要先从房间页取 `lChannelId` / `lSubChannelId`，再构造 `topSid/subSid`
- 参考实现 `uni-live/src/lib/danmaku/huya.ts` 约 5,790 行，包含完整 JCE 编解码和消息结构
- 没有稳定的公开文档；协议、字段和风控都可能变化

结论：**技术可行但成本最高**。不建议在当前弹幕阶段顺手做；应作为独立适配器，配真实房间回归测试。

## 建议的接入顺序

1. **P3 B 站**：平台选择器 → 主进程真实房间号/流解析 → session Referer → `bilibili-live-ws` → 统一弹幕 Overlay
2. **P4 虎牙**：主进程频道号/FLV 解析 → HTTPS 升级 → 独立 Huya 弹幕适配器 → 协议回归测试
3. **P5 统一体验**：平台标识、房间 key `${platform}:${roomId}`、画质映射、登录态隔离、失败降级

## 架构注意

- `StreamPlayback.platform` 已预留 `douyu | bilibili | huya`
- 直播流解析放 main，避免 B 站/虎牙 API CORS
- B 站媒体请求需要 session 级 Referer；不要用渲染进程伪造 Referer
- 弹幕 WebSocket 可以留在 renderer（匿名、只读），也可以后续迁到 main；高频消息必须批处理
- 多平台房间 key 必须带平台前缀，不能只用数字 roomId
- 画质枚举不能复用斗鱼的 `0/3/4/8`，每个平台单独映射
