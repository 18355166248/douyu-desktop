# 斗鱼多屏（douyu-desktop）

Windows 桌面端斗鱼多直播间客户端。当前是 **P2 多路播放 + 飞行弹幕**：登录斗鱼、最多 4 路同屏、每路实时弹幕、单路重载/关闭、房间签到。

多平台评估见 [docs/platform-support.md](docs/platform-support.md)：B 站可行且优先，虎牙直播可行但弹幕协议成本高。

## 技术栈

- Electron 38 + electron-vite 6
- React 19 + TypeScript 5.9
- hls.js / mpegts.js（本地打包，不用 ReactPlayer）
- TanStack Query
- Zod（IPC 边界校验）
- Vitest

## 运行

```bash
npm install
npm run dev
```

检查：

```bash
npm run typecheck
npm run lint
npm run check:boundaries
npm run test
```

构建：

```bash
npm run build
```

打包 Windows：

```bash
npm run package:dir   # release/win-unpacked，可直接运行
npm run package       # NSIS 安装包
```

如果 Windows 占用了 `release/win-unpacked`，先关闭正在运行的 app，或换输出目录：

```bash
npx electron-builder --win nsis --config.directories.output=release-nsis
```

## 当前范围（P2）

- [x] 深色桌面壳 + 单路播放器
- [x] 最多 4 路同屏，1/2/3/4 路自适应布局
- [x] 每路独立解析、独立重载、独立关闭、独立错误条
- [x] 同一时间只允许一路有声音，切换自动静音其他路
- [x] 解析中/路数上限/重复房间/空输入的状态保护
- [x] 斗鱼登录窗（独立 `persist:` 分区）
- [x] 读取 `acf_*` Cookie，拼 `dyToken`（只在 main）
- [x] 斗鱼 `getEncryption` + `getH5PlayV1` 流解析
- [x] FLV/HLS 播放（HLS 不可用时自动回退 FLV）
- [x] 房间标题/主播名补全（`betard`，失败不影响播放）
- [x] 每路斗鱼实时弹幕：聊天/进场/礼物、颜色、粉丝牌、贵族/房管标识
- [x] 右向左轨道飞行弹幕：按文本宽度选择空闲轨道，避免重叠，字号/密度变化自动重排
- [x] 弹幕设置面板：速度、不透明度、字号、位置（全屏/1/4/上半/下半）、屏蔽类型、超级留言、精简弹幕
- [x] 弹幕显示/隐藏、暂停/继续、清屏；设置全局同步并持久化
- [x] 进场提示默认关闭，避免高流量房间被“进入了直播间”刷屏
- [x] 断线重连、连接超时、错误状态提示
- [x] 房间签到任务（手动触发、dry-run、限速、逐房间结果）
- [x] typed preload + IPC `Result` 封装
- [x] 边界检查脚本 + 32 个单测
- [x] electron-builder Windows 打包配置

## 多路操作

- 输入房间号后点“播放/添加”，追加到网格；最多 4 路
- 每张卡片右上角可单独“重新解析”或关闭
- 视频右下角音量按钮切换声音；切到某一路时其他路自动静音
- 3 路时会显示“再加一路”空位；工具栏“清空”一次关闭全部
- 重新解析使用当前工具栏的画质/HLS 设置
- 每路视频左下角显示实时弹幕；连接中/重连/失败会在右上角提示
- 工具栏“弹幕设置”打开全局面板，所有画面立即同步；点击外部或 Esc 关闭
- 面板里的“清屏”只清当前画面，不关闭弹幕连接

## 弹幕说明

- 弹幕连接是匿名只读 WebSocket，不读取账号 Cookie
- 聊天和礼物默认从右向左飞行；进场提示默认关闭，可在“显示内容”里打开，避免进场消息刷屏
- 按文本宽度占用轨道，轨道释放前不会重复占用
- 聊天、进场、礼物分别用不同样式；粉丝牌、贵族、房管、超管有标识
- 设置项对齐斗鱼网页播放器：弹幕速度、不透明度、弹幕字号、弹幕位置、弹幕屏蔽（大号/顶部/底部/角色）、屏蔽超级留言弹幕、精简弹幕
- “精简弹幕”过滤没有 `dms` 标记的机器人消息；真实斗鱼 `chatmsg` 通常带 `dms`
- “弹幕位置”限制在播放器安全区内：全屏、1/4 屏、上半屏、下半屏
- “大号”按高等级消息过滤（当前阈值 30 级）；顶部/底部按协议 `pos` 字段过滤
- 设置写入 `localStorage`；暂停状态不持久化，重启后自动恢复播放
- 斗鱼弹幕颜色字段可能缺省，缺省时使用白色
- 礼物消息暂不解析礼物名称（只显示“送出礼物 ×N”），后续补礼物字典

## 已验证

- `npm run check`：类型、ESLint、架构边界、32 个单测全部通过
- `npm run build`：main / preload / renderer 生产构建通过
- `node scripts/probe-douyu.mjs 9999`：真实斗鱼签名接口返回 FLV 地址；CDN 返回 `Access-Control-Allow-Origin: *`
- `node scripts/probe-danmaku.mjs 9999`：真实斗鱼弹幕连接；12 秒收到 90 个包，含 `chatmsg`/`uenter`/`dgb`
- `node --experimental-strip-types scripts/verify-danmaku.mjs 9999`：用应用自身的编解码器解析真实帧；10 秒解码出 22 条聊天、60 条进场、2 条礼物，真实消息带 `dms`
- 浏览器 CDP 真实时间验证：8 条弹幕分轨飞行，动画 `currentTime` 持续递增，横向位置持续左移
- 当前执行环境没有可用的交互式 Electron 窗口（最小 Electron 窗口也会崩），所以窗口级 UI 需在正常 Windows 桌面执行 `npm run dev` 验证

## 暂未做

- B 站/虎牙直播与弹幕（可行性见 [docs/platform-support.md](docs/platform-support.md)）
- 9 宫格、拖拽排序、画中画
- 弹幕屏蔽词/用户屏蔽/重复弹幕合并/发送弹幕
- 弹幕 Net/Render Worker（当前 4 路用独立 RAF 轨道引擎；9 路或高流量再拆）
- 鱼吧/客户端/粉丝家园/钻粉/续牌
- 安装包签名、自动更新

## 架构约束

```text
main → core → shared
renderer → preload → main
renderer → 匿名弹幕 WebSocket（只读，不携带 Cookie）
```

- `core` 不依赖 Electron/React/Node 内置模块
- `renderer` 不依赖 Electron/Node/core/main
- 弹幕协议编解码在 `shared/douyu`，纯函数、可单测，供 renderer 复用
- 弹幕飞行引擎、过滤规则、轨道布局在 `renderer/features/danmaku`；布局和过滤是纯函数
- 弹幕设置通过 Context 全局共享，持久化在 renderer `localStorage`，不进入 main/IPC
- Cookie、`dyToken`、CSRF 只在 main；renderer 只拿 `AccountSummary`
- 任务通过 `TaskDefinition + TaskRunner + TaskRegistry` 注册，不在 UI 里写业务
- 请求级限速/重试在 `DouyuHttpClient`，任务级超时/取消在 `TaskRunner`

## 免责声明

斗鱼接口/页面可能随时变化；签到等自动化操作可能违反平台规则，风险由使用者承担。本项目不存账号密码，不绕过验证码/付费/DRM，不做自动送礼、抢宝箱、抽奖、自动关注。
