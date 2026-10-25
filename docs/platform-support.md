# 多平台直播与弹幕

> 实测时间：2026-10-25。平台接口和风控会变化，以下结论用于排期，不代表永久可用。

## 结论

| 平台 | 直播流                         | 弹幕   | 状态                                |
| ---- | ------------------------------ | ------ | ----------------------------------- |
| 斗鱼 | 已接入                         | 已接入 | P2 可用，已修复实时弹幕回归         |
| B 站 | 已接入                         | 已接入 | P3 已落地，支持登录态高画质请求     |
| 虎牙 | 已接入（HLS 本地滚动列表代理） | 未接入 | P4 播放已接入；登录可选，弹幕待后续 |

## 已落地：平台登录引导

- 斗鱼：登录窗直接加载 `https://www.douyu.com/member/login`，不再先打开首页；原有 `persist:douyu-account-*` 多账号体系不变。
- B 站：登录窗直接加载 `https://passport.bilibili.com/login`，使用独立分区 `persist:bilibili-login`。
  - 登录完成以 `SESSDATA` Cookie 存在，且 `https://api.bilibili.com/x/web-interface/nav` 返回 `data.isLogin=true` 为准。
  - 昵称/头像取自 `nav` 的 `uname` / `face`；`nav` 失败时登录轮询不会误判为成功。
  - B 站流解析复用该分区；主进程 HTTP 请求带 `credentials: 'include'`，因此登录后 API 才能收到 `SESSDATA`。弹幕 token 仍走匿名 `getConf`，不跟随登录态，避免 `uid: 0` 认证包与登录 token 不匹配。
- 虎牙：登录窗加载 `https://www.huya.com/`，页面加载后自动点击顶部“登录”，使用首页内嵌的 UDB 登录 iframe（`aq.huya.com/p/udb_login.html?v=...`）；独立分区 `persist:huya-login`。
  - 不能直接把 `https://aq.huya.com/p/udb_login.html` 当顶层页面打开：它是 UDB SDK 的 iframe 内页，加载后向父窗口发送 `_loginPageOnload` 等初始化消息；没有父页面时 SDK 返回 `190152 内部格式错误`，二维码区域保持空白。
  - 自动点“登录”后等待 iframe 实际可见再显示登录窗；用户看到的是官方首页上的登录弹层，二维码正常渲染。
  - 登录态以 `udb_uid` Cookie 为准，昵称优先读取 `udb_nickname` / `username`，头像读取 `udb_avatar` / `avatar`。
  - 登录与播放解耦：匿名也能播放 HLS；登录只保存账号状态，当前不改变画质。
- 登录窗口只把 `PlatformLoginStatus`（平台、是否登录、昵称、头像、提示）返回 renderer；Cookie 不进入渲染层，也不能被 `window.api` 直接读取。

## 已落地：统一账号入口

- 顶栏账号入口不再随左侧平台选择切换；左侧平台选择只决定房间解析和播放平台。
- 未登录时点击“登录”，或账号菜单里的“登录 / 添加账号”，先弹出平台选择：斗鱼 / B 站 / 虎牙；选中后才进入对应扫码登录。
- 账号菜单固定包含“斗鱼账号”和“平台账号”两区：斗鱼保留多账号切换，B 站/虎牙显示已登录昵称、登录/退出操作。
- 顶栏优先显示当前斗鱼活跃账号；没有斗鱼账号时，依次显示已登录的 B 站、虎牙账号，方便确认登录结果。

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

## 虎牙（P4，播放已接入；弹幕待后续）

### 登录

- 官方 UDB SDK 的登录 iframe 地址为 `https://aq.huya.com/p/udb_login.html`（SDK 内部再加 `?v=<整点时间戳>` 缓存参数）；它是内页，不能顶层直接打开。
- 应用加载 `https://www.huya.com/` 后自动点“登录”，由首页创建并初始化该 iframe；成功后才显示登录窗，避免白屏和首页裸奔。
- 昵称/头像优先读 `udb_nickname` / `username`、`udb_avatar` / `avatar`；读取不到时显示“虎牙用户”。
- 登录不是播放前置条件；账号入口仍独立于左侧平台选择。

### 直播流

- 接口：`https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=<rid>`
- 返回 `liveStatus=ON`、主播/标题、FLV + HLS 多线路；`baseSteamInfoList` 里每个 CDN 给出 `sStreamName` / `sHlsUrl` / `sHlsAntiCode`，`hls.multiLine` 作为兜底。
- HLS URL 按网页播放器的方式构造：`sHlsUrl + '/' + sStreamName + '.m3u8?ratio=2000&' + sHlsAntiCode`；实测 `HS`/`HS24` 可用，`TX`/`AL` 视房间而定。
- FLV 直连每次只返回约 0.2–0.5 秒短块，mpegts.js 会当成有限流播几秒结束；不使用 FLV。
- HLS master URL 是**一次性签名**：同一 URL 第二次请求返回 403；API 每次会给新的 antiCode，但 CDN 对高频 master 解析有明显限流（连续请求约 4 次后 403）。
- `HuyaHlsProxy`（仅 main，绑定 `127.0.0.1` 随机端口）：
  - renderer 拿到稳定本地地址 `http://127.0.0.1:<port>/huya/<roomId>/playlist.m3u8`；
  - 首次只拉一次 master，从第一段 URL 解析 CDN 前缀、序号、`YYYYMMDDTHHMMSS` 时间戳和 antiCode；
  - 后续本地列表按 4 秒步进滚动生成 4 段，序号/时间戳与虎牙切片命名一致；不再每次刷新 master；
  - 首次请求依次试候选线路，成功后记住该线路（比较 host+path），后续只刷新同一条，避免不同 CDN 的 media sequence 跳变；该线路失效/403 时清空偏好，下次重新探测；
  - 切片 404（刚生成）最多等 4 秒重试；403 清空模板，下一次列表请求重新解析 antiCode；
  - 模板 30 分钟有效；切片仍只允许 `*.huya.com` / `*.huyacdn.com` / `*.bytefcdnrd.com`，避免成为任意 URL 代理；
  - 预热的首次列表与 hls.js 首屏请求合并，避免重复解析。
- 画质默认 `ratio=2000`（超清，实测 1280×720）；当前只有一个“自动”选项，高画质/登录画质未接入。
- HLS 和切片带 `Access-Control-Allow-Origin: *`；代理自身也返回 CORS 头，CSP 的 `connect-src` 放行 `http://127.0.0.1:*`。
- hls.js 遇到致命网络错误会重新 `loadSource`（最多 3 次），避免首屏 502 后永久停在“正在连接”。
- 实测房间 `660000`：连续 60 秒、1280×720，`currentTime` 18.2s→59.1s（duration 72.1s），滚动列表 4 段、序号连续推进，列表/切片全部 200，无错误条。

### 弹幕

- 地址：`wss://ws.api.huya.com`，私有 JCE/Taf 二进制
- 需要从房间页取 `lChannelId` / `lSubChannelId` 构造 `topSid/subSid`
- 参考实现 `uni-live` 的 `huya.ts` 约 5,790 行；协议、字段和风控都可能变化
- 结论：不作为当前阶段顺手项；需要独立适配器和真实房间回归

## 接入顺序

1. **P3 B 站**：已完成直播流、弹幕、平台选择、画质映射、历史隔离、登录态高画质请求
2. **P4 虎牙**：登录与 HLS 播放已接入；FLV 短块不使用，HLS 由本地滚动列表代理续播；弹幕仍待独立适配器
3. **P5 统一体验**：平台标识、`${platform}:${roomId}` key、画质映射、登录态隔离已落地；虎牙弹幕/更多平台统一降级待后续

## 架构注意

- `StreamPlayback.platform` 支持 `douyu | bilibili | huya`
- 直播流解析放 main，避免 B 站/虎牙 API CORS
- 虎牙 HLS 一次性签名由 main 的 `127.0.0.1` 代理滚动生成后续列表；renderer 只接触本地稳定 URL，代理只允许虎牙 CDN host，不能成为任意 URL 代理
- B 站媒体请求需要 session 级 Referer；不要用渲染进程伪造 Referer
- B 站/虎牙登录 Cookie 只存在各自 `persist:` 分区；renderer 只拿 `PlatformLoginStatus`
- 主进程 HTTP 统一 `credentials: 'include'`，B 站登录后 API 才会携带 `SESSDATA`
- 斗鱼弹幕 WebSocket 在 renderer，匿名只读；设备 Cookie 和账号 Cookie 只在 main
- B 站弹幕 token 由 main 解析后通过 IPC 交给 renderer
- 多平台房间 key 必须带平台前缀，不能只用数字 roomId
- 画质枚举按平台独立映射，不能复用斗鱼的 `0/3/4/8`
- React StrictMode 在开发模式会双挂载播放器/WS，已在 Electron 入口移除

## 直播间统计与活跃榜（2026-10-25）

每路播放器标题下方显示平台统计，每分钟刷新，也可手动刷新。数值缩写为万/亿时，悬停可查看精确值；平台返回 `9999+` 等封顶数据时保留 `+`。无法获取的值显示 `—`，真实零值显示 `0`；整体刷新失败保留并标注旧数据。

| 平台 | 已接入的统计                                                     | 说明                                                   |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| 斗鱼 | 贵宾、钻石粉丝；日活跃、周活跃、总活跃榜的用户及贡献值           | 活跃榜以浮层展开，不改变播放器布局；不将榜单前 10 名的条数当作活跃人数 |
| B 站 | 高能榜人数、大航海人数、关注数、人气；综合接口可用时显示看过人数 | 高能榜、累计看过、关注和人气均不是实时在线观众总数     |
| 虎牙 | 订阅人数、人气                                                   | 官网贵宾统计协议已定位，当前尚未接入，显示 `—`         |

### 数据来源与验证

- 斗鱼：`POST /lapi/live/gateway/web/<rid>?isH5=1` 返回 `data.wss`；通过匿名 Gateway 短连接读取 `oni.un`（贵宾）、`dfnum.dfc`（钻粉），以及 `dayrk/weekrk/totalrk.list`。榜单采用官方 `gold / 100` 转换贡献值，保留排名并匿名展示隐身用户。网关快照完成或超时即关闭，统计刷新不依赖视频和弹幕连接重建。
- 斗鱼官方页面的服务端 HTML 中贵宾/钻粉初始 `0` 是占位，不能用于统计。真实聊天榜单代码来自 `live-next-player-aside-master`；活跃榜单只提供排名用户，不能推导房间总活跃人数。
- B 站：优先 `/xlive/web-room/v1/index/getInfoByRoom`，匿名实测出现 `-352` 时回退 `/room/v1/Room/get_info` 的 `attention` 和 `online`，再使用真实房间号与主播 UID 读取 `/xlive/general-interface/v1/rank/getOnlineGoldRank` 的 `onlineNum/onlineNumText` 和 `/xlive/app-room/v2/guardTab/topList` 的 `info.num`。不以当前分页的列表长度推断总人数。
- 虎牙：`profileRoom` 的 `profileInfo.activityCount`（回退 `liveData.activityCount`）与官网 `subscribe-count#activityCount` 一致，用于订阅人数；`liveData.totalCount` 只展示为人气热度。
- 虎牙贵宾后续可接普通官网 WUP `liveui/getVipBarListStat` 的 `iTotalNum`。现有弹幕依赖里的旧 `iTotal` 字段不能未经实测直接等同；这也不同于开放平台小程序的贵宾事件授权。

人数、贡献值和热度分别保留平台口径，不跨平台合并计算。统计接口和数值可能受平台风控、登录状态与房间配置影响。
