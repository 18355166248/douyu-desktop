# 多平台直播与弹幕

> 实测时间：2026-10-25。平台接口和风控会变化，以下结论用于排期，不代表永久可用。

## 结论

| 平台 | 直播流 | 弹幕 | 状态 |
| ---- | ------ | ---- | ---- |
| 斗鱼 | 已接入 | 已接入 | P2 可用，已修复实时弹幕回归 |
| B 站 | 已接入 | 已接入 | P3 已落地，支持登录态高画质请求 |
| 虎牙 | 接口可解析，CDN 分块不可直接播 | 未接入 | 登录扫码页已接入；P4 播放仍待专用代理/适配器 |

## 已落地：平台登录引导

- 斗鱼：登录窗直接加载 `https://www.douyu.com/member/login`，不再先打开首页；原有 `persist:douyu-account-*` 多账号体系不变。
- B 站：登录窗直接加载 `https://passport.bilibili.com/login`，使用独立分区 `persist:bilibili-login`。
  - 登录完成以 `SESSDATA` Cookie 存在，且 `https://api.bilibili.com/x/web-interface/nav` 返回 `data.isLogin=true` 为准。
  - 昵称/头像取自 `nav` 的 `uname` / `face`；`nav` 失败时登录轮询不会误判为成功。
  - B 站流解析复用该分区；主进程 HTTP 请求带 `credentials: 'include'`，因此登录后 API 才能收到 `SESSDATA`。弹幕 token 仍走匿名 `getConf`，不跟随登录态，避免 `uid: 0` 认证包与登录 token 不匹配。
- 虎牙：登录窗直接加载 `https://aq.huya.com/p/udb_login.html`，独立分区 `persist:huya-login`。
  - 这是虎牙 UDB SDK 实际加载的扫码页（标题“虎牙登录”），不是 `www.huya.com` 首页。
  - 登录态以 `udb_uid` Cookie 为准，昵称优先读取 `udb_nickname` / `username`，头像读取 `udb_avatar` / `avatar`。
  - 当前只保存登录态；虎牙播放和弹幕仍是 P4，UI 的播放按钮显示“适配中”并禁用，避免“播几秒就停”。
- 登录窗口只把 `PlatformLoginStatus`（平台、是否登录、昵称、头像、提示）返回 renderer；Cookie 不进入渲染层，也不能被 `window.api` 直接读取。

## 已落地：斗鱼弹幕

- WebSocket：`wss://danmuproxy.douyu.com:8502`（官方页面会在 8501–8505 间分配）
- 匿名 visitor 登录，不读取账号 Cookie：
  - `type@=loginreq/roomid@=<rid>/.../username@=visitor<id>/uid@=<uid>/ver@=20220825/aver@=218101901/ct@=0/`
- 登录成功后：
  - `type@=joingroup/rid@=<rid>/gid@`（`gid` 为空，不传 `-9999`）
  - `type@=mr`
  - `type@=sub/mt@=o`（订阅实时弹幕；缺少它时只能收到历史/房间状态）
- 心跳：每 20 秒 `type@=mr`（不是 `mrkl/`）
- 数据包：12 字节头（长度、长度、类型 689）+ UTF-8 STT 载荷，尾部 NUL
- 已解析：`chatmsg`、`uenter`、`dgb`；`hischatmsg` 是 `wsproxy` 的历史消息，不是实时聊天
- 设备 Cookie：主进程从 `userData/douyu-danmaku-device` 读取稳定 32 位 `dy_did`，通过 `onBeforeSendHeaders` 注入 `wss://danmuproxy.douyu.com` 握手；渲染层不接触账号凭据
- 断线 3 秒重连；10 秒连接超时；React StrictMode 已移除，避免开发模式重复连接/重复弹幕

实测应用连接 `24422`：20 秒收到 3 条 `chatmsg`、10 条 `uenter`、`subres`，界面正常渲染。

## 已落地：B 站（P3）

### 直播流

- 真实房间号：`https://api.live.bilibili.com/room/v1/Room/room_init?id=<rid>`
- 房间标题：`/room/v1/Room/get_info?room_id=<real>`
- 主播昵称：`/live_user/v1/UserInfo/get_anchor_in_room?roomid=<real>`
- 播放地址：`/xlive/web-room/v2/index/getRoomPlayInfo?...&qn=<quality>&platform=web`
- 实测短号 `room_id=6` 解析到真实房间 `7734200`，返回 FLV + HLS；`live_status=1`
- CDN 需要 `Referer: https://live.bilibili.com/`；主进程 `webRequest.onBeforeSendHeaders` 补 Referer
- CDN 返回 `Access-Control-Allow-Origin: *`；API 无 CORS，必须走主进程
- 画质：`80/150/250/400/10000`；匿名最高实际到 `250`，UI 会把实际画质同步回下拉
- 登录后解析仍走 `/xlive/web-room/v2/index/getRoomPlayInfo`，但 HTTP 客户端改用 `persist:bilibili-login` 分区并 `credentials: 'include'`；实际能拿到的档位由账号权限决定，不保证所有账号都到 `10000`

### 弹幕

- 配置：legacy `room/v1/Danmu/getConf?room_id=<real>&platform=pc&player=web`，匿名可用
- 不使用 `getDanmuInfo`：匿名会返回 `-352` 风控
- WS：`wss://<host_server>/sub`，16 字节包头
- 认证 op 7 + token，30 秒心跳 op 2，op 8 认证回复，op 5 消息
- 协议版本 2 为 zlib；渲染层用 `DecompressionStream('deflate')` 解压，兼容嵌套包
- 已解析：`DANMU_MSG`、`SEND_GIFT`、`INTERACT_WORD`、`SUPER_CHAT_MESSAGE`
- 高频房间沿用斗鱼的批处理、轨道上限和 120ms 刷新

## 虎牙（P4，播放未接入；登录已接入）

### 登录

- 官方 UDB SDK 的登录 iframe 地址为 `https://aq.huya.com/p/udb_login.html`（SDK 内部再加 `?v=<整点时间戳>` 缓存参数）。
- 应用直接打开该页面，用户扫码；成功后分区 `persist:huya-login` 中会出现 `udb_uid`。
- 昵称/头像优先读 `udb_nickname` / `username`、`udb_avatar` / `avatar`；读取不到时显示“虎牙用户”。
- 登录与播放解耦：登录按钮可用，播放按钮在虎牙平台下禁用并提示“适配中”。

### 直播流

- 接口：`https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=<rid>`
- 实测 `roomid=660000/13579` 返回 `liveStatus=ON`、主播/标题、6 条 FLV + HLS 线路
- FLV 直连返回 302 到 `*.bytefcdnrd.com`，`200` + `Connection: close`，但**每次只返回约 0.2–0.5 秒 / 0.4–1.4MB 的短块**就结束
- mpegts.js 把这当成有限流，播 2–7 秒即 `ended`；`curl` 直接请求也同样快速结束
- HLS 线路（`*.hls.huya.com`）无论带不带 Referer/Origin 都返回 403
- 需要专用分块代理、P2P SDK 或官方播放器内核才能连续播放；当前不把虎牙流暴露到 UI，避免“播几秒就停”

### 弹幕

- 地址：`wss://ws.api.huya.com`，私有 JCE/Taf 二进制
- 需要从房间页取 `lChannelId` / `lSubChannelId` 构造 `topSid/subSid`
- 参考实现 `uni-live` 的 `huya.ts` 约 5,790 行；协议、字段和风控都可能变化
- 结论：不作为当前阶段顺手项；需要独立适配器和真实房间回归

## 接入顺序

1. **P3 B 站**：已完成直播流、弹幕、平台选择、画质映射、历史隔离、登录态高画质请求
2. **P4 虎牙**：接口和字段已验证；登录扫码页已接入；播放仍阻塞在 FLV 短块/HLS 403，播放按钮暂不开放
3. **P5 统一体验**：平台标识、`${platform}:${roomId}` key、画质映射、登录态隔离已落地；虎牙/更多平台统一降级待 P4

## 架构注意

- `StreamPlayback.platform` 支持 `douyu | bilibili | huya`
- 直播流解析放 main，避免 B 站/虎牙 API CORS
- B 站媒体请求需要 session 级 Referer；不要用渲染进程伪造 Referer
- B 站/虎牙登录 Cookie 只存在各自 `persist:` 分区；renderer 只拿 `PlatformLoginStatus`
- 主进程 HTTP 统一 `credentials: 'include'`，B 站登录后 API 才会携带 `SESSDATA`
- 斗鱼弹幕 WebSocket 在 renderer，匿名只读；设备 Cookie 和账号 Cookie 只在 main
- B 站弹幕 token 由 main 解析后通过 IPC 交给 renderer
- 多平台房间 key 必须带平台前缀，不能只用数字 roomId
- 画质枚举按平台独立映射，不能复用斗鱼的 `0/3/4/8`
- React StrictMode 在开发模式会双挂载播放器/WS，已在 Electron 入口移除
