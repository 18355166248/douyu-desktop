# 斗鱼多屏（douyu-desktop）

Windows 桌面端斗鱼多直播间客户端。当前是 **P0 竖切**：登录斗鱼、解析一路直播、播放、房间签到。

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

## 当前范围（P0）

- [x] 深色桌面壳 + 单路播放器
- [x] 斗鱼登录窗（独立 `persist:` 分区）
- [x] 读取 `acf_*` Cookie，拼 `dyToken`（只在 main）
- [x] 斗鱼 `getEncryption` + `getH5PlayV1` 流解析
- [x] FLV/HLS 播放（HLS 不可用时自动回退 FLV）
- [x] 房间标题/主播名补全（`betard`，失败不影响播放）
- [x] 房间签到任务（手动触发、dry-run、限速、逐房间结果）
- [x] typed preload + IPC `Result` 封装
- [x] 边界检查脚本 + 12 个单测
- [x] electron-builder Windows 打包配置

## 已验证

- `npm run check`：类型、ESLint、架构边界、12 个单测全部通过
- `npm run build`：main / preload / renderer 生产构建通过
- `node scripts/probe-douyu.mjs 9999`：真实斗鱼签名接口返回 FLV 地址；CDN 返回 `Access-Control-Allow-Origin: *`
- 当前执行环境没有可用的交互式 Electron 窗口（最小 Electron 窗口也会崩），所以窗口级 UI 需在正常 Windows 桌面执行 `npm run dev` 验证

## 暂未做

- 4/9 宫格、拖拽布局
- 弹幕 Net/Render Worker
- 鱼吧/客户端/粉丝家园/钻粉/续牌
- 安装包签名、自动更新

## 架构约束

```text
main → core → shared
renderer → preload → main
```

- `core` 不依赖 Electron/React/Node 内置模块
- `renderer` 不依赖 Electron/Node/core/main
- Cookie、`dyToken`、CSRF 只在 main；renderer 只拿 `AccountSummary`
- 任务通过 `TaskDefinition + TaskRunner + TaskRegistry` 注册，不在 UI 里写业务
- 请求级限速/重试在 `DouyuHttpClient`，任务级超时/取消在 `TaskRunner`

## 免责声明

斗鱼接口/页面可能随时变化；签到等自动化操作可能违反平台规则，风险由使用者承担。本项目不存账号密码，不绕过验证码/付费/DRM，不做自动送礼、抢宝箱、抽奖、自动关注。
