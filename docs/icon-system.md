# 图标语义约定

统一使用 `lucide-react`（当前锁定 1.64.0，ISC 许可），通过 `src/renderer/src/components/Icon.tsx` 的显式导入映射使用。图标随应用本地依赖加载，不请求远程图标服务。库许可证位于 `node_modules/lucide-react/LICENSE`。

官方说明：https://lucide.dev/guide/react/

## 容易混淆的入口

| 操作                    | 语义键                         | 图形                    |
| ----------------------- | ------------------------------ | ----------------------- |
| 直播工作区              | live                           | 带播放标志的显示器      |
| 房间号或链接输入        | roomLink                       | 链接                    |
| 观看组合                | scenes                         | 图层                    |
| 新建副屏窗口            | newWindow                      | 带加号的窗口            |
| 进入 / 退出小窗         | enterCompact / exitCompact     | 画中画 / 普通窗口       |
| 均分布局                | layoutGrid                     | 四宫格                  |
| 主画面布局 / 设为主画面 | mainView                       | 主次分栏                |
| 替换房间                | replaceRoom                    | 替换箭头                |
| 进入 / 退出沉浸         | enterImmersive / exitImmersive | 向外 / 向内的角箭头     |
| 系统窗口最小化          | minimize                       | 横线                    |
| 视频播放 / 暂停         | play / pause                   | 三角 / 双竖线           |
| 弹幕显示 / 隐藏状态     | danmaku / danmakuOff           | 消息气泡 / 划线气泡     |
| 暂停 / 继续弹幕         | danmakuPause / danmakuResume   | 气泡内的暂停 / 播放标志 |
| 弹幕设置                | settings                       | 齿轮                    |
| 清除当前弹幕            | clearDanmaku                   | 橡皮擦                  |
| 签到 / 签到完成         | tasks / taskDone               | 签到日历                |
| 开播提醒                | reminder                       | 铃铛                    |
| 添加账号                | addAccount                     | 人像加号                |
| 置顶 / 取消置顶         | pin / unpin                    | 图钉 / 划线图钉         |

## 后续维护

- 同一操作在播放器、右键菜单等位置使用同一个语义键；不为“去重”而改变相同操作的图标。
- 不同操作不要仅因形状相近而复用：四宫格只表示均分布局，横线只表示系统最小化。
- 图标按钮保留 `aria-label`、`title` 和已有快捷键。图标本身为装饰性 SVG，不重复朗读按钮名称。
- 常规图标使用 24×24 viewBox、1.8 描边；根据控件尺寸缩放，避免小图标细节过密。
- 品牌鱼、平台官方标识继续使用原资源；文本明确的按钮不强制添加图标。
- 播放/弹幕复合图标在公共组件内组合，不在业务组件中重复手写 SVG。
