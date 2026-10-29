# 快捷键

修饰键随系统显示：macOS 为 Cmd，Windows/Linux 为 Ctrl。

| 操作                          | Windows / Linux  | macOS            |
| ----------------------------- | ---------------- | ---------------- |
| 刷新首页列表 / 重连当前直播间 | F5 / Ctrl+R      | Cmd+R / F5       |
| 关闭当前直播间                | Ctrl+W / X       | Cmd+W / X        |
| 定位房间输入框                | Ctrl+L           | Cmd+L            |
| 新建副屏窗口                  | Ctrl+N           | Cmd+N            |
| 播放 / 暂停                   | Space / K        | Space / K        |
| 静音                          | M                | M                |
| 音量 ±5%                      | ↑ / ↓            | ↑ / ↓            |
| 独听当前房间                  | S                | S                |
| 重连当前房间                  | R                | R                |
| 显示 / 隐藏全局弹幕           | D                | D                |
| 暂停 / 继续全局弹幕           | P                | P                |
| 切换沉浸模式                  | F                | F                |
| 关闭弹层 / 退出沉浸           | Esc              | Esc              |
| 快捷键说明                    | ?（Shift+/）/ F1 | ?（Shift+/）/ F1 |

- 房间操作只在直播页生效，目标为最近鼠标移入或键盘聚焦的房间，默认第一路。
- 首页刷新只更新关注、特别关注和历史列表；直播页刷新只重新解析当前一路，不重载整个应用。
- 首页、没有房间、输入文字或打开弹层时，关闭房间组合键不会关闭窗口。窗口关闭按钮及操作系统退出快捷键保持原行为。
- 单字母播放器快捷键在输入框内不生效；Space 和方向键保留按钮、选择框、滑块等控件的原生操作。
- 弹层打开时暂停工作区快捷操作；Esc 优先关闭弹层。长按不重复触发关闭或新建。
- 顶部设置入口的“快捷键”分类可查看分组说明，? / F1 可直达；按钮悬浮提示和辅助功能快捷键属性与系统一致。

## 参考与取舍

参考 [YouTube 官方快捷键](https://support.google.com/youtube/answer/7631406?hl=en) 和 [Vimeo 官方播放器快捷键](https://help.vimeo.com/hc/en-us/articles/12425998125073-What-are-player-keyboard-shortcuts) 的 Space/K、M、音量方向键和问号帮助约定。F 沿用项目已有的沉浸模式，D/P/S 保留本项目弹幕与多路声音语义；直播无进度回放能力，因此不增加 J/L、左右箭头快进后退。

Electron 主进程仅通过 `setIgnoreMenuShortcuts` 将已接管的组合键交还页面，不能在 `before-input-event` 调用 `preventDefault`，否则页面收不到按键。参考 [Electron webContents 文档](https://www.electronjs.org/docs/latest/api/web-contents#event-before-input-event)。
