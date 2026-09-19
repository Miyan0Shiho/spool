# spool 当前进度

> 更新：2026-09-19

## 当前状态

第一阶段设计已形成可交接的基线；B0-B4 核心纵切已形成；DeepSeek 真实 coding
smoke 和 headless CLI 通过；B5 已完成 threshold freeze 和 formal 单次 run
`27/27`。用户确认先交付基础 coding agent，增强能力分阶段补齐。

- 已完成：总体定位、架构参考、独立实现原则、发布顺序和首版范围。
- 已完成：模块职责、执行契约、异常与恢复语义、P0 子集、B0-B5 实施计划和验收映射。
- 已完成：文档树归一，`docx/` 历史材料迁入 `docs/history/`，本地参考源码迁入忽略的 `.references/`。
- 已完成：B0 环境、SQLite、进程取消、Seatbelt、provider mock 和 tarball 安装
  probe，证据与边界见 [B0 报告](../architecture/probes/b0.md)。
- 已完成：单包实现目录、依赖方向、持久化/进程/provider/隔离边界见
  [实现架构](../architecture/implementation.md)。
- 已完成：Node `24.21.0`、SQLite `3.53.4` 上的五组 B0 复测；产品骨架、
  `typescript@7.0.2`、`@types/node@24.13.6`、构建、单测、tarball 和干净安装验证。
- 已完成：B1 的事务事件存储、输入幂等、session/run 生命周期、单写者所有权、
  artifact、确定性 provider、工具 intent/result、取消、失败注入、工具结果 unknown
  和中断恢复；`npm run check` 当前包含 6 个单测、39 个集成测试和自动 pack/install
  检查全部通过。
- 已完成：B2 文件/搜索/精确编辑、Shell、后台 job、输出 spill、workspace、
  allow/ask/deny 权限和真实工具循环。
- 已完成：B3 OpenAI-compatible streaming adapter；DeepSeek `deepseek-flash`
  完成真实读、运行测试、编辑、再验证的 coding smoke。
- 已完成：B4 CLI/headless 共享 runtime、workspace rules、声明式 skills、审批和
  tool-pair-safe compaction；真实 headless 只读任务通过。
- 已完成：B5 `BENCH-FIXED-V1` 的 calibration/threshold freeze/formal run；
  formal 记录为 `benchmarks/fixed-v1/results/BENCH-FIXED-V1-2026-09-19-formal.jsonl`，
  27 pass、0 fail、0 infra、无重试。安装后的真实 provider、取消、恢复和扩展
  验收也已通过，见 [发布报告](./release-report.md)。
- 未完成：OpenAI 官方直连（当前真实 provider 为 DeepSeek）和显式发布动作。
  硬件断电按 DEC-044 豁免；人工 interactive 会话为可选，P0 行为已由自动化 PTY
  流式测试覆盖。
- 当前没有待批准的技术栈事项；产品或发布范围没有待决问题。

## 下一执行批次

下一步是显式发布决策：是否提交/推送，以及是否把 `0.1.0-rc.1` 转为正式版本。
K01 硬件断电和人工 interactive 会话均不再是发布阻塞项。

2026-09-19 B0 的关键边界：

- Node 24.21.0/SQLite 3.53.4 已通过五组探针；Node 23 仅保留为旧环境证据。
- Seatbelt 存在预建 hard-link 写逃逸，只能报告 partial enforcement。
- provider mock 通过不等于真实 provider 兼容。
- `SIGKILL` 恢复不等于断电 durability；硬件断电已按 DEC-044 豁免并明确不承诺。
- B1 的 `unknown` 结算表示“不假装知道工具是否成功”，不是自动恢复副作用。

## 文档验证记录

2026-09-19 已检查 10 份设计与入口文档：

- 143 个本地链接可定位，表格列数、代码围栏与文本编码检查通过。
- A01-A12、C01-C08、K01-K12 定义齐全，决策编号 DEC-000 至 DEC-044 无重复。
- B0-B5 连续，P0 计划完整映射 T01-T27。
- 固定任务规格和其 README 的 SHA-256 与本轮开始时一致，没有更改冻结基准。
- 已清除“等待首版范围决策”的过期状态；首版基础可靠性与后续增强功能分开。

2026-09-19 已完成仓库文档结构整理：

- 根目录 V1 文档分别迁入 `docs/product`、`docs/architecture` 和 `research/`。
- 早期设计讨论保留在 `docs/history/`，不再具有当前范围权威。
- 系统性架构取舍移入 `docs/decisions/`。
- 61 份 Markdown 文档的本地链接已重新校验，全部可定位。
- `docx/` 已移除；本地参考源码统一位于被 Git 忽略的 `.references/`。

这里只验证文档结构、链接、映射和范围一致性，不代表架构实验、产品测试或 benchmark 已通过。

## 入口

- [交接](./handoff.md)
- [开发范围](../product/scope.md)
- [架构总览](../architecture/overview.md)
- [执行契约](../architecture/execution-contracts.md)
- [P0 实现计划](../architecture/p0-plan.md)
- [实现架构](../architecture/implementation.md)
- [B0 报告](../architecture/probes/b0.md)
