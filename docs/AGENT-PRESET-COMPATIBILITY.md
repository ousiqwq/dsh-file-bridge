# Agent preset compatibility / Agent 预设兼容性

Runtime tested: official DSH 0.2.2-rc.2, Node.js 26. All sessions, personas, memories, MCP responses and downloaded files were synthetic and confined to an isolated DSH_HOME. No live user conversation or persona was used for these tests.

本轮验证标准 standard、PTC ptc、极简 minimal、创造 cordis。每种预设均通过三种人设注入、记忆/总开关、Skill 目录过滤、MCP 真正调用与禁用后拦截、二进制下载哈希及不可信 Origin 拒绝。PTC 使用真正的 run_code 嵌套调用，不用原生执行器代测；模型仅收到 run_code 的顶层 schema。极简预设没有被补装标准模式的 Skill/编辑/子代理工具。

Soul Complete 注入原先会移除 PTC 的 tools:ptc-only 和 tools:sdk 提示区。本轮保留执行器所有 tools: 区，仍替换其他正文；加入专门回归测试。Priority、Append 及关闭开关的语义保持。全局/工作区/会话和团队桥接流程继续沿用现有数据结构。

The npx installation command is tested with the official @deepseek-ai/dsh@0.2.2-rc.2 CLI plus temporary pnpm@11.28.5, including a clean isolated profile installation. It never upgrades the running host implicitly. Published plugin archives exclude test results, local operation backups, persona libraries, memories, credentials and conversation data.

“兼容”保留预设自身的能力边界，不表示为极简添加标准工具，也不表示自定义隔离注册表或外部 ACP 后端均已验证。旧版本的历史兼容范围见 package.json peerDependencies；本次四模式实测对应上述 rc.2。
