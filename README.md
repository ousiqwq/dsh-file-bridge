# DSH File Bridge

**简体中文** | [English](README.en.md)

为远程浏览器中的 DeepSeek Harness 添加 **下载到本机** 按钮。文件直接保存到访问网页的设备上，与原生预览和文件列表配合使用。

插件包：`dsh-plugin-file-bridge`

## 功能

- **预览工具栏下载**：打开文件后，点击右侧工具栏的下载图标。
- **无法预览的文件也能下载**：ZIP、XPI 等文件的提示区提供下载按钮。
- **保留文件内容与名称**：支持二进制文件、中文名、空格与大文件流式传输。
- **原生预览继续使用**：文档、图片、表格等沿用 Harness 已有的预览能力。
- **原生界面样式**：按钮、图标、提示和深浅主题与 Harness 保持一致。

### 下载文件

打开不支持预览的文件后，可直接选择 **下载到本机**。

![无法预览的文件也可下载到当前设备](docs/images/download.png)

### 预览与下载

在原生预览中阅读文档，同时使用顶部工具栏的下载按钮。

![原生 Markdown 预览与工具栏下载按钮](docs/images/preview.png)

## 安装

已验证 DeepSeek Harness **0.2.1-rc.3 / 0.2.1-rc.5 / 0.2.2-rc.2** 的 Web profile。

```bash
dsh plugin --profile web add https://github.com/ousiqwq/dsh-file-bridge/releases/download/v0.1.2/dsh-plugin-file-bridge-0.1.2.tgz
```

在插件管理中启用插件并刷新页面。如果运行实例尚未加载新配置，重启 DSH 后刷新。安装包见 [Releases](https://github.com/ousiqwq/dsh-file-bridge/releases)。

## 使用

1. 点击对话中的文件链接，或从原生文件列表打开文件。
2. 点击工具栏下载图标，或预览提示区的 **下载到本机**。
3. 在浏览器下载列表中查看进度、取消、重试或打开文件。

文件保存位置由当前浏览器决定。需要本机应用时，下载后从浏览器或文件管理器打开。原生 **打开** 按钮仍由 Harness 处理，远程部署时可能打开服务端应用。

## 行为与范围

- 沿用 DSH 的会话文件访问范围、认证和 Host/Origin 检查。
- 使用原生文件接口分段读取并流式下载，支持单段 HTTP Range、HEAD 和中文文件名。
- 文件在传输期间发生变化时拒绝或中断下载，避免混合不同版本。
- 下载地址有效期为五分钟；过期或服务重启后，重新点击按钮生成新地址。
- 处理普通文件，不打包文件夹；具体预览格式取决于 Harness 版本及其预览组件。
- 通过公开的文档操作插槽集成，无运行时 npm 依赖。

## 开发

使用 Node.js 22+：

```bash
npm test
npm run check
npm pack
```

浏览器检查需要可访问的 Harness 实例和 Playwright/Chromium：

```bash
DSH_TEST_URL=http://your-harness-host:3080 npm run test:browser
```

可通过 `PLAYWRIGHT_MODULE` 和 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已有浏览器工具。检查覆盖下载、原生预览、错误重试和响应式布局。

## 许可证

[MIT](LICENSE) © 2026 osiqwq
