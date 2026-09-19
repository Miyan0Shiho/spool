# P0 实现架构

> 状态：B0-B5 核心验收完成；DeepSeek 真实 coding、formal `27/27`、安装后
> `release:check` 和 PTY 审批均通过。`0.1.0-rc.1` 私有候选已准备，公开发布动作
> 尚未执行。
>
> 日期：2026-09-19
>
> 依据：[B0 报告](probes/b0.md)、[执行契约](execution-contracts.md)、
> [P0 实现计划](p0-plan.md)。

## 1. 技术基线

| 维度 | 选择 | 原因 |
|---|---|---|
| 目标 runtime | 锁定 Node `24.21.0` LTS，实际 SQLite `>= 3.51.3` | 当前 Node 23 EOL，且 SQLite 版本有已知 WAL-reset 风险 |
| 源码语言 | TypeScript，编译为 ESM JavaScript | 核心状态机和持久化契约需要静态类型；发布不依赖运行时转译 |
| 开发依赖 | `typescript@7.0.2`、`@types/node@24.13.6` | 精确锁定编译与 Node API 类型，不进入 runtime 依赖 |
| 运行时依赖 | P0 不新增 npm runtime 依赖 | SQLite、HTTP、子进程、测试均使用 Node 标准库 |
| SQLite | `node:sqlite`、WAL、`synchronous=FULL`、macOS `fullfsync`、有限 `busy_timeout` | B0 已验证事务、进程重启、备份和 schema 升级接口；硬件断电明确不承诺 |
| 测试 | `node:test` | 无额外测试框架依赖，可覆盖真实子进程和持久化 |
| 发布 | 编译后 npm tarball，先用干净目录安装验证 | 避免源码运行、全局工具和隐式依赖进入发布路径 |
| 首批验证平台 | macOS 15.2 arm64；其他版本和架构在后续批次验证 | B0 只覆盖此环境，不能泛化支持声明 |

Node `24.21.0` 已安装并保持 Homebrew keg-only。`typescript` 和 `@types/node` 已
精确写入 `devDependencies`，没有第三方 runtime dependency。

B0 的 `SIGKILL` 前缀恢复不是断电 durability。用户已按 DEC-044 豁免真实硬件
断电实验；实现和发布说明不得把它写成“硬件断电后必不丢失”。

## 2. 仓库布局

B0 没有证明需要独立版本化的 runtime、CLI 或协议包，因此首版采用单包布局，不预先
创建 `apps/` 或 `packages/`：

```text
src/
  app/            composition root、配置装配、具体 adapter 绑定
  contracts/      纯类型、事件 schema、ID、错误和端口
  runtime/        session controller、run 状态机、agent loop、取消
  providers/      provider port、SSE parser、具体模型 adapter
  tools/          tool registry、schema、文件/搜索/编辑工具
  execution/      subprocess、process identity、后台 job、output capture
  permissions/    workspace trust、allow/ask/deny、审批记录
  sandbox/        ExecutionPolicy、Seatbelt adapter、capability reporting
  storage/        SQLite owner、事务、迁移、artifact、backup
  context/        instructions、model projection、compaction
  extensions/     声明式 commands 和 skills
  surfaces/       CLI 与 headless；只做输入输出和审批适配

tests/
  unit/
  integration/
  fixtures/
  evaluators/

bin/              可执行入口，只加载编译后的 app
dist/             构建产物，不进入 Git
```

依赖方向固定为：

```text
surfaces -> app -> runtime -> contracts
                         -> provider ports
                         -> tool ports
                         -> storage ports
                         -> execution/permission ports

providers/tools/storage/execution/sandbox -> contracts
app -> all concrete adapters
```

`contracts` 不导入具体 adapter；`runtime` 不导入 CLI、终端、SQLite 或某一家 provider
SDK。CLI 和 headless 不得各自维护 session、权限或循环状态。

## 3. 运行闭环

### 3.1 输入与会话

`SessionController` 是产品表面的唯一控制入口，负责：

- 持久接收并去重 `acceptInput`。
- 创建、排队、取消和恢复 run。
- 向 runtime 提供已接纳的输入、权限快照和取消信号。
- 响应用户控制命令，不把取消或审批塞进模型消息队列。

CLI 和 headless 只投影同一个 session/run 事件，不获得额外权限，也不定义另一套
完成语义。

### 3.2 Agent loop

一个 turn 包含零个或多个 step；每个 step 是一次模型请求及其工具结果回填。循环
只在以下结构化事实出现时继续：

- 模型产生完整、已结算的 tool calls。
- 运行时策略允许派发且资源预算仍有效。

文本停止、断流、取消、provider 错误和工具失败必须形成明确终态。live stream 只
用于展示，最终结果从持久 settlement 派生。

### 3.3 工具派发

流程固定为：

```text
完整响应结算
  -> tool schema 校验
  -> 权限决策
  -> 持久化 tool intent
  -> 执行
  -> 持久化 result / outcome-unknown
  -> 下一 step 或终止
```

没有持久 intent 的副作用工具不得执行。结果未知不能按“未执行”盲目重放。

## 4. 持久化

### 4.1 存储所有权

一个 execution domain 只有一个活动 storage owner。所有写事务由该 owner 串行化；
SQLite `busy` 错误只表示违反所有权或不正常并发，不替代协议的互斥控制。

当前实现用 `PRAGMA locking_mode = EXCLUSIVE` 和启动事务取得文件级所有权；第二
连接在超时后失败。获取所有权后，store 会恢复上次中断的 running run，并为没有
result 的 tool intent 追加 `unknown` 结果，再记录 run failure。没有可证明的所有权
时不得自动恢复。

连接初始化至少包括：

- `PRAGMA journal_mode = WAL`
- `PRAGMA synchronous = FULL`
- `PRAGMA foreign_keys = ON`
- 有界 `busy_timeout`

正式 writer 不直接复制 `.sqlite` 主文件作为备份，使用 SQLite backup API。迁移使用
版本化、事务化、向前的 schema 变更，失败必须回滚且启动不能继续使用未知 schema。

### 4.2 记录层次

- canonical events：不可原地改写的输入、控制、run、request、tool 和结果事实。
- projections：可重建的 session 视图、任务状态和模型上下文。
- artifacts：大输出、diff、审批材料和证据内容，由内容引用关联。
- exports：JSONL 只作为导出，不作为第二份可写权威来源。

`exit`、`close`、进程组静默、工具已执行、工具结果未知和 evidence 适用性都必须
是独立事实，不能折叠成一个 success 布尔值。

## 5. Provider 边界

provider adapter 负责 wire 格式、SSE、认证载荷、TLS/HTTP 错误和 provider 特有
字段；runtime 只消费规范化事件。

必须保留：

- provider、wire API、protocol version、model、route、attempt/request ID。
- message/block index、tool call ID、partial argument、解析和 schema 校验状态。
- text delta 和完整结算文本。
- opaque reasoning block 的原始 start、有序 delta、signature 和未知字段。
- stop reason、usage 或 `unknown`、错误类型、request ID、retryable。
- 中断时的 partial blocks、未关闭 block 和工具是否已派发。

adapter 不得隐藏无限重试。网络重试必须只在没有工具副作用、错误被判定为临时、
预算允许且身份稳定时发生；每次实际 attempt 都要记录。

## 6. 进程与执行

### 6.1 进程身份

自有命令默认使用独立进程组或 session。持久记录至少包含：

- `pid`
- `pgid`
- `startSec` / `startUsec`
- policy version、profile hash、workspace root
- command identity 和所属 run

取消顺序为：

1. 持久撤销新派发资格。
2. 核对 PID/PGID/启动时间。
3. 向进程组发送 `SIGTERM`。
4. 有界等待并重新枚举。
5. 仍存活时向进程组发送 `SIGKILL`。
6. 分别记录 exit、close、quiescence 和 residual processes。

身份不匹配时禁止发信号，结果保持 `outcome-unknown`。

### 6.2 隔离等级

`ExecutionGrant` 按维度报告 `full | partial | unknown | unavailable`，至少覆盖：

- 文件读写、创建、删除和元数据。
- 网络、Unix socket 和本地监听。
- 进程创建、可见性和后代控制。
- 用户、组、权限和 no-new-privileges。
- 环境变量和凭据引用。
- CPU、内存、进程、文件大小、时间和输出限制。

首版 macOS adapter 使用 Seatbelt，但 hard-link 写逃逸意味着文件系统写入只能报告
`partial`。如果请求的策略要求完整写入隔离，则拒绝执行而不是降到 unsandboxed。
partial 模式必须是用户明确选择、可见且可审计的执行模式。

Shell/后台 job 当前默认必须经过 Seatbelt：workspace 外写入、原 HOME 与其他临时
目录读取、网络访问均 fail closed；provider 凭据不进入 Shell 环境。该后端仍为
`partial`，不能声明完整隔离。

## 7. 上下文与扩展

模型可见上下文由 durable facts 重新投影；压缩不能只保存自然语言摘要。压缩边界
必须保留：

- 当前用户目标和约束。
- 已修改文件和 workspace 版本。
- 已执行验证、结果和未验证项。
- 未解决阻塞、风险和下一步。
- tool call/result 配对边界。

首版扩展只支持声明式 commands/skills。extension loader 不执行第三方 in-process
代码，不进入权限决策的信任根；所有 extension 文本与文件内容仍按不可信输入处理。

当前已具备 `.spool/skills/**/*.md` 读取和 `skill` 工具；workspace
instructions 从 `AGENTS.md`、`CLAUDE.md`、`.spool/AGENTS.md` 加载；compaction
只在 user-message 边界切分，避免留下没有 assistant call 的 tool result。

## 8. 测试与交付

测试层次：

| 层 | 内容 |
|---|---|
| unit | 状态机、SSE parser、schema、权限匹配、projection |
| integration | SQLite 进程重启、事务失败、取消、后台命令、崩溃修复 |
| security | allow/ask/deny、workspace 边界、Seatbelt sentinel、residual process |
| provider contract | mock server 的成功、错误、断流、取消和 usage unknown |
| end-to-end | 临时仓库中的真实工具循环和最终 diff/测试证据 |

验证命令目标：

```bash
npm run typecheck
npm test
npm run test:integration
npm run build
npm pack
```

发布前必须在干净目录安装 tarball；测试不能依赖仓库源码树、全局 TypeScript、
`.references`、在线 registry 或隐含 PATH 工具。

## 9. 实施顺序

运行时和开发依赖已经批准并锁定：

1. 安装并固定 Node `24.21.0`，记录实际 `process.versions.sqlite`，重跑 B0 的存储、
   进程、Seatbelt、provider 和安装五组探针；若使用更高 Node 版本，重新执行同一
   矩阵后才更新锁定版本。
2. 创建单包骨架和测试入口，只建立 `contracts`、`app`、`storage`、`runtime` 的最小
   垂直切片。
3. 完成 B1：输入接收、run 生命周期、SQLite events/artifacts、假 provider 和取消。
4. B1 证据通过后进入 B2，不在 B1 提前加入 Goal、子 Agent、hooks/MCP 或 Desktop。

后续进度：

- B2 文件、Shell、后台 job、权限和 workspace 边界已实现并有集成测试。
- B3 OpenAI-compatible adapter 已用 DeepSeek `deepseek-flash` 完成真实 coding
  smoke；OpenAI 直连在当前网络超时，未记为通过。
- B4 headless/interactive 共享 runtime、规则、skill、审批和 compaction 已实现；
  interactive 的流式文本、工具进度、allow/deny 审批和 prompt 返回 PTY 自动测试已通过；
  人工可用性会话为可选项。
- B5 `BENCH-FIXED-V1` 已补齐 27 项 fixture/evaluator。calibration 文件用于冻结
  threshold，formal 文件在同版本下达到 `27/27`、0 fail、0 infra、无重试。
  安装后真实 provider、取消、恢复和扩展验收也已通过。

当前没有待批准的技术栈事项。B0 的存储禁用条件已经解除；硬件断电为已披露的
非承诺项，其余真实 provider、fixture/evaluator 和 B1-B5 产品实现均已完成核心验收。
