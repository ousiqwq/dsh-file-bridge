# 原生控件迁移验收

2026-11-12，本机版本 0.2.3-local.1。下载操作使用 DSH Button、原生下载图标和 Tooltip；错误使用原生 Toast，同时保留无障碍播报。插件只保留图标按钮尺寸和排版 CSS，主题、焦点和按钮交互由宿主维护。下载协议、权限检查及后端未改变。

16 项自动测试通过。在独立 DSH 0.2.2-rc.2 宿主中，`tests/browser.mjs` 检查五类文件的内容摘要（含中文名、空文件和约 33 MiB 文件）、四种视口宽度、深浅主题、键盘下载、文件变化后的错误提示与重试、来源限制，以及原生表格和 Markdown 预览。报告与截图保留于忽略目录 `test-results/`。

浏览器检查需要 `DSH_TEST_URL` 指向隔离宿主，使用 `PLAYWRIGHT_MODULE` 指定 Playwright 模块，必要时通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定浏览器路径。请勿用真实私人会话作写入测试。三个插件的联合验收和本地部署记录见相邻 Capability Desk 项目的 `docs/NATIVE-UI-MIGRATION-ACCEPTANCE.zh-CN.md`。本轮未推送 GitHub/npm。
