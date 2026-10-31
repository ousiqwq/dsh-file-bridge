# DSH File Bridge

为远程浏览器中的 **DeepSeek Harness** 补充「下载到本机」按钮。下载落在访问网页的设备上，由浏览器选择保存位置。

## 使用

在对话中点击文件链接，或从原生文件列表打开文件：

- 右侧文件预览工具栏会出现 **下载图标**，悬停提示「下载到本机」。
- 对 `.zip`、`.xpi` 等原生无法预览的文件，中央提示下方也会出现 **下载到本机** 按钮。
- 下载保留原始字节和文件名，包括中文、空格和二进制文件；文件夹不在本插件范围内。
- 图片、PDF、Markdown、代码、HTML、Excel、Word、PPT 等继续使用 Harness 原生预览。具体格式和转换依赖以已安装版本为准；本插件不增加预览器。
- **不增加本机应用唤起功能。** 原生「打开」属于 Harness 自身，在远程部署中可能打开服务端应用。需要本机程序时，下载后从浏览器下载列表或本机文件管理器打开。

## 安装

已验证的兼容基线：DeepSeek Harness `0.2.1-rc.3`，Web profile。使用 Harness 的两个公开 document action slots，不修改内置包、预览注册表或原生「打开」按钮。

从 [Releases](https://github.com/ousiqwq/dsh-file-bridge/releases) 下载插件包，然后运行：

```sh
dsh plugin --profile web add ./dsh-plugin-file-bridge-0.1.1.tgz
```

在插件管理中启用 `dsh-plugin-file-bridge`，刷新浏览器。若当前运行实例尚未重新加载插件配置，重启自己的 Harness 服务后刷新。

## 实现与权限

浏览器先请求准备下载，再把下载地址交给浏览器下载管理器。服务端按 64 KiB 窗口读取并流式传输，不在网页中拼接整份 Blob，也不受原生「整文件预览读取」默认 32 MiB 上限影响。原生单次窗口读取限额仍然适用；部署若把该限额设为不足 64 KiB，需相应调整本插件的窗口大小。

- 两个 HTTP 入口都在原生 `connection.fetch` 中注册，继承 Harness 的登录、Owner 身份及 Host/Origin 校验。**不提供免认证下载接口。** 原部署主动关闭认证时，遵循部署现有设置。
- 根据实际会话头取得文件作用域，每次通过原生 `workspaceFiles.stat/readBytes` 检查文件访问权限。不会直接用 Node `fs` 绕过 Harness 文件系统。
- 文件访问范围与原生预览一致，**不是额外的工作区沙箱**：如原生文件系统允许读取工作区外文件，本插件也可以下载。目录、原生拒绝的链接和特殊文件不会被打包或强行读取。
- 准备记录只留在内存，五分钟过期、最多 128 条；下载地址仍需登录。重启/禁用插件后记录清空。
- 支持单段 HTTP Range、HEAD、Content-Length、中文附件文件名。文件版本或长度变化会拒绝/中断传输，避免把不同版本拼成一个成功下载。
- 响应强制作为附件，不把下载的 HTML/SVG 当作站点脚本执行。无外部网络请求、遥测、持久文件缓存或上传功能。
- 下载一旦交给浏览器，进度、取消和重试由浏览器下载列表管理。五分钟后重新点击按钮会生成新地址；不保证跨服务重启恢复旧下载。

## 开发与测试

无运行时 npm 依赖；使用 Node.js 22+。宿主提供浏览器 React 与插件服务。

```sh
npm test
npm run check
npm pack
```

`npm run check` 检查语法以及发行包的精确文件白名单。测试覆盖二进制内容、分段读取、请求验证、过期、文件变更、权限失败、取消及插件卸载。

浏览器验收入口为 `tests/browser.mjs`。先准备自己的 Playwright/Chromium，再运行：

```sh
DSH_TEST_URL=http://your-harness-host:3080 npm run test:browser
```

该测试需要与服务器共享测试目录，创建纯测试文件和一个空白测试会话，不调用模型，结束后归档自己创建的会话；如提供 `DSH_TEST_SESSION`，则复用该会话且不归档它。测试会修改测试浏览器中的选中页面。脚本支持 `PLAYWRIGHT_MODULE` 和 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 以复用已有测试工具。Playwright 仅用于开发测试，不随插件分发。

### 0.1.1 样式调整

下载按钮使用原生主题圆角、边框、字体和悬停颜色。无法预览时的按钮与原生「打开」保持相同的 36px 高度和 14px 字体；工具栏图标与原生刷新按钮保持相同的 28px 控件和 15px 图标尺寸。下载图标和提示浮层直接使用宿主 UI 组件。

### 0.1.0 验证记录

- 16 项 Node 自动化测试通过。
- 真实 Harness Web 中下载中文名二进制文件、CSV、Markdown、空文件、33 MiB 文件，SHA-256 全部一致。
- 原生表格 Canvas 和 Markdown 预览正常；错误提示后可重试；拒绝不受信任的 Origin。
- 检查 1440、1000、775、390 像素窗口中的按钮可见性与位置，浏览器无页面异常。

仅将插件源码、测试脚本和文档公开；测试文件、会话标识、截图、宿主配置和安装备份均不进入仓库或插件包。

官方接口依据：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中 `packages/client/ui-sidebar-documentpreview`、`packages/api/workspace-files`、`packages/client/connection`，并已对照上述版本的已安装类型和实现。

MIT © 2026 osiqwq。
