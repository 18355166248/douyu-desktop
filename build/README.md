# Build resources

应用图标采用已选定的 C 款小鱼吉祥物，原图见 `docs/icon-concepts/C-fish-mascot.png`。

- `icon.png`：透明背景原图，供主窗口和标题栏使用。
- `icon.ico`：包含 16、24、32、48、64、128、256 像素尺寸，供 Windows 程序和安装包使用。

Windows 打包保留图标及元信息写入，通过 `signExecutable: false` 关闭代码签名。
