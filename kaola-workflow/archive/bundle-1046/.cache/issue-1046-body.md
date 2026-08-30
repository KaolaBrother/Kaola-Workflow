# architecture: install and live-prove one global workflow contract across every Agent Runtime

## 当前结论（2026-08-31）

本 Issue 已完成代码候选、架构、安装事务、项目指令减法、七个本机/CLI 宿主的真实语义正控，以及 Cursor Cloud 候选安装/Build/冷启动载体证明。进入 Finalization 前的事实边界是：

- Claude Code 2.1.246 当前 `loggedIn:false`，外部账户仍不可用；owner 已明确接受安装、静态渲染、`SessionStart(source=compact)`、组合与回归机制证据，并决定跳过不可执行的在线模型腿。本文仍明确记录“没有 Claude 模型响应”，不把机制验收写成 live semantic PASS。
- Cursor Cloud 的同一候选已完成安装、哈希、receipt、幂等、空 hook、Draft Build 和冷启动绑定证明。额外的 exact-Build cold subagent 在工具前返回全 `null`，证明 subagent 的隔离 task context 不能代验 top-level；有效语义验收必须等默认分支发布后 Save Active Build，再从该环境重启 top-level Agent。
- 非默认分支 Draft Build 被 Cursor 平台明确禁止保存或提升为 Active Build。因此，“同一未发布候选”“非默认分支绑定”“已保存 Active Build”不能作为一个同时成立的发布前条件。本文把候选验收与发布后 Active Build 验收拆开，但两者都保留，不作 waiver。
- 当前 Forge 复核只有 #1046 一个开放 Issue、0 个开放 PR；本地只有 `bundle-1046` 一个 active run。

冻结候选：`bd766e8f47ca04ae716870d441bc9f4d8ea17d50`  
代码树哈希：`40556f924b287181e64c0b4425b2ac66e49650fac29d55d72df7fcce5f92e9e1`  
计划发布版本：`10.2.0`（按仓库 SemVer：向后兼容的新 Workflow / install capability 使用 MINOR）  
运行证据索引：`kaola-workflow/bundle-1046/.cache/runtime-live-matrix/README.md`

## 顺序与范围

#1044 已先完成 compact/reload/dispatch 框架和 Runtime adapter 的事实修正，#1045 随后修复 Cursor named-profile 的模型字段逃逸；两者都在 #1046 开始前关闭。本 Issue 只负责：

1. 把通用 Workflow 行为从每个项目的 `AGENTS.md` 中减掉；
2. 安装为一份机器级通用契约的九个原生宿主渲染；
3. 保留项目级事实、命令、约束、验证、文档与更严格本地覆盖；
4. 用真实新会话证明全局与项目指令确实合成生效；
5. 把 Cursor CLI、Cursor App local、Cursor Cloud 当作三个独立宿主，不互相代验。

## 已决定的架构

### 1. 一份作者源，Runtime 只是渲染目标

唯一通用作者源是：

`templates/global/kaola-workflow-global.md`

它只承载跨项目行为：First Principles、premise/evidence、Mission List、custody/carrier、failure frontier、test custody 与 completion 边界。它不包含项目、vendor、model、原生工具或私有配置路径。

九宿主能力和物理差异只写在：

`templates/global/runtime-contract-adapters.json`

adapter 只声明已测量的 discovery、carrier、precedence、reload 和 compatibility reads，不成为第二份行为作者源。未知字段保持 unknown，真实会话暴露的 schema/catalog 始终优先。

### 2. Dispatch 规范必须始终加载

通用 Workflow contract 不复制 Runtime 调度细节；完整 Workflow Next 与 Finalization 提示词会组合：

- 同一份 global contract；
- 一段薄的 durable-state 恢复路由；
- 始终存在的完整 dispatch contract；
- 当前 Runtime 的已测量 adapter facts。

dispatch 不能是可选恢复项，因为 Agent 不知道自己需要去寻找一份尚未进入上下文的调度规范。named、built-in、generic route 必须保持真实身份；generic route 不能冒充有 custody 的 named role。模型、effort、thought、background、parallel、resume、nesting 与 call fields 以实时宿主 schema 为准。

### 3. Compact 只在 Compact 后恢复，不在每次 Tool Use 注入

本设计不安装任何 Kaola `PreToolUse`、`PostToolUse` 或 `Stop` prompt gate。普通工具调用增加：

- `0` Kaola recovery bytes；
- `0` Kaola recovery subprocesses。

也不存在 compact-time JS prompt composer。JavaScript 只用于安装期的 batch transaction、渲染和校验，不在模型推理或工具调用路径中运行。

按真实能力使用以下恢复载体：

| Runtime family | Compact / reload 设计 |
|---|---|
| Claude / Codex | `SessionStart(source=compact)` 直接输出安装期已生成的静态 V2；随后重读 `AGENTS.md`、`workflow-state.md`、`mission-list.md`，完整加载 Workflow Next 或 Finalization |
| Grok | 一份持久 user Rule；真实测量证明被动 hook stdout 不进入 compact 后上下文 |
| Cursor CLI / App / Cloud | 一份 `alwaysApply` V2 Rule；local CLI/App 共享用户载体，Cloud 在选定仓库显式物化；Cloud 无 `sessionStart`，`preCompact` 不能注入上下文 |
| OpenCode | 新会话重新发现 global/project 指令；本 Issue 不增加 speculative compact lifecycle |
| Kimi | 新会话重建合并上下文；升级移除旧 managed `PostCompact` prompt block |
| ZCode | 新任务读取 user/workspace 指令；1,000,000-token 实测和真实 PreToolUse self-lock 反证 speculative compact gate |

### 4. 安装事务而不是运行时框架

`scripts/kaola-workflow-global-contract.js` 从 registry 生成整批计划，并保证：

1. 所有本机目标在第一次写入前完成 preflight；
2. managed region 保留 owner bytes，dedicated carrier 拒绝 foreign bytes；
3. symlink、非普通文件、重复 marker、未来 schema、ownership collision 在整批写入前报告；
4. Cursor CLI/App 仅在 carrier group 和渲染字节相同的条件下去重到一个物理 Rule；
5. 安装失败回滚，receipt 记录 source、registry、render、install、candidate 与 target hash；
6. uninstall 重新从当前 registry 推导目标，只删除 receipt 证明仍未变化的 owned bytes；
7. 本机 `install-all.sh` 对 Cursor Cloud 只报告 `REMOTE_REQUIRED`，从不猜测或修改远端环境。

### 5. Project instructions 做减法

`workflow-init` 只有在 machine-global receipt 兼容且 `CURRENT` 时才生成精简项目 contract。新项目 `AGENTS.md` 只保留：

- Project Snapshot、技术栈和结构；
- 项目命令；
- 项目专属约束与安全/public-contract 要求；
- validation；
- 文档地图与 gotchas；
- 更严格的 local overrides；
- 最小 global-contract adoption marker。

精确已知旧模板可以迁移；owner-only、malformed、mixed 或未知字节不改。任一 active run 的 `AGENTS.md`、bridge、state 和 Mission List 全部保持不变。

## 九宿主能力与载体证据

| Runtime / host | 实测版本 | 原生全局载体 | precedence / reload | Native dispatch 事实 | 当前 live 状态 |
|---|---:|---|---|---|---|
| Claude Code local | 2.1.246 | `${CLAUDE_CONFIG_DIR:-~/.claude}/rules/kaola-workflow-global.md` | user Rule 后叠加更近的 project instructions；新 session / static compact V2 | `Agent` + named `subagent_type`；built-in `general-purpose`、`Explore`、`Plan`；live catalog 决定可用性 | `OWNER_ACCEPTED_MECHANICS`：安装、静态 render、SessionStart/compact hook、组合与回归通过；`loggedIn:false`，在线模型响应未执行且不推断 |
| Codex local | 0.150.1 | `${CODEX_HOME:-~/.codex}/AGENTS.md` managed region | global 先加载，project root-to-cwd 后加载；新 run / static compact V2 | live `spawn_agent` schema + named `agent_type`；`default`、`worker`、`explorer` 保持真实身份 | PASS，新 run 与 native `/compact` 都证明恢复和 dispatch |
| OpenCode local | 1.18.23 | `${OPENCODE_CONFIG_DIR:-~/.config/opencode}/AGENTS.md` managed region | native global 优先于 Claude fallback；新 session reload | `task(subagent_type)` / `@name`；`general`、`explore`、`scout`；task_id/background 由宿主决定 | PASS |
| Kimi Code local | 0.39.1 | `${KIMI_CODE_HOME:-~/.kimi-code}/AGENTS.md` managed region | Kimi global 后叠加 project instructions；新 session reload | `Agent` / `AgentSwarm` + `kaola-role-*`；`coder`、`explore`、`plan`；内置角色是 leaves | PASS |
| Grok CLI local | 1.0.13 | `${GROK_HOME:-~/.grok}/rules/kaola-workflow-global.md` | persistent user Rule + project AGENTS；每次 interaction 可见 | `spawn_subagent(subagent_type)`；`general-purpose`、`explore`、`plan`；child 不再 spawn descendant | PASS，新 session 与 native `/compact` |
| Cursor CLI local | 2026.08.25-3e8eec8 | `${CURSOR_HOME:-~/.cursor}/rules/kaola-workflow-global.mdc` | project Rule 高于 user Rule；新 CLI session + alwaysApply | 当前 Task catalog 为权威；实测 exact `implementer`；named profile 持有 model/effort，call 不重复填 model | PASS，新 session 与 native `/compact` |
| Cursor App local | 3.18.9 | 与 CLI 共享同一用户 Rule，但 live host 独立验收 | 新 App Agent + alwaysApply；不能从 CLI binary 推断 App | local App catalog 独立暴露 Kaola types；child model/profile source 仍可保持 unknown | PASS，独立新 App Agent |
| Cursor Cloud | Environment `9116f5fb-a1f4-11f1-b532-320a589b8025` | `<repo>/.cursor/rules/kaola-workflow-global.mdc` | selected-repository project Rule；候选用 Draft Build，发布版用 saved Active Build + 重启 top-level Agent | Cloud catalog 与 CLI/App 不同；subagent 是隔离 task context，不能代验 top-level | `CANDIDATE_BUILD_VERIFIED`；`TOP_LEVEL_SAVE_REQUIRED`，发布后执行 |
| ZCode App local | 3.10.1 | `${ZCODE_HOME:-~/.zcode}/AGENTS.md` managed region | user global 先合并，workspace 为项目主源；新 task reload | user agents + automatic / `@role` / live schema；`general-purpose`、`Explore`；child 不再 spawn | PASS，新 GLM-5.3 highest task；无 Kaola tool hook |

默认 tier 只是 selection guidance，不关闭宿主的 task-sensitive override：

| intent | Claude | Codex | OpenCode | Kimi | Grok | Cursor | ZCode |
|---|---|---|---|---|---|---|---|
| standard | `sonnet` | `gpt-5.6-luna` / `max` | session / optional standard pin | inherit session | profile `medium` | named profile `medium` | `GLM-5.3` / high |
| reasoning | `opus` | `gpt-5.6-sol` / `medium` | optional reasoning pin | inherit session | profile `high` | named profile `high` | `GLM-5.3` / max |
| heavy | `fable` | `gpt-5.6-sol` / `high` | reasoning class / session fallback | inherit session | profile `xhigh` | named profile `xhigh` | `GLM-5.3` / max |

权威说明与一手来源集中在 `docs/runtime-capabilities.md`；机器权威仍是 registry 与实时 tool schema。

## 长度与重复上下文测量

| Surface | 测量 |
|---|---:|
| 唯一 universal source | 3,293 B / 58 logical lines；SHA-256 `f4c3cc736fafa606ba34b84ebf0ac5ecfb1b6b7ac696c49bb551849fe418e841` |
| 九宿主 registry | SHA-256 `ae71dc1d80c9e7c414bf53b8cd5190b8be1d40ca2524798f299e811679c45aac` |
| 普通 nonce render | 3,313 B |
| Grok persistent V2 Rule | 7,184 B |
| Cursor V2 Rule body | 8,499 B |
| Cursor Cloud `.mdc` live probe | 8,671 B；SHA-256 `69a5756e05d3b187f0d63d17e827e6faaae28f4fbb809e23e3566095ae1ab333` |
| 旧项目全量 AGENTS template | 5,404 B |
| 新 minimal project AGENTS template | 1,308 B |

这里的减法不是把必要规则缩成摘要：global contract、active operation、dispatch contract 和 adapter 都仍完整；删除的是每个项目重复拷贝、每次 tool use 重复注入、重复 Rule、推理时 JS 和无证据的生命周期协议。

## Cursor Cloud 的新测量与设计修正

官方生命周期资料：

- https://prod.cursor.com/docs/cloud-agent/setup
- https://cursor.com/docs/cloud-agent/builds
- https://cursor.com/docs/cloud-agent
- https://cursor.com/docs/subagents
- https://docs.cursor.com/context/rules-for-ai

负控证明：仅把 Rule、receipt 和 AGENTS 提交到 feature branch，不会自动进入任意旧 Environment Build 的模型上下文。三个新 no-tool Agent 均返回全 `null`；旧 recurring Build `bld-20260830-12ea7590-2de4-4e64-aeab-a9ea57013442` 是明确负控。

候选正向 carrier 证明：

- branch：`probe/issue-1046-cloud-live`
- HEAD：`4ac80cf3e6e4eea1aaea1bb6826eb7fa2584abd2`
- product ancestor：`bd766e8f47ca04ae716870d441bc9f4d8ea17d50`
- setup Agent：`bc-c14d2d1f-8ff7-4b51-88d4-a115bf34e3e4`
- ready snapshot：`snapshot-20260830-5012e66a-6950-4c40-b97c-6491e38f56a9`
- candidate Draft Build：`bld-20260830-c4504be8-22ce-4d21-aaa8-c4e080db946b`，`SUCCEEDED`，`isDraft=true`
- cold child：`bc-90278e2e-e405-5f61-a37d-9b487a2224ab`，`warmFork=cold`，exact Build/branch/HEAD/hash/`check-cloud=CURRENT`
- global/project/cloud receipts CURRENT；两处 Cursor hooks 都是 `{ "version": 1, "hooks": {} }`

平台明确拒绝把带非默认 `refs` 的 Build 保存/提升为 active，也拒绝让该 Build ID 成为 saved environment。没有静默改用 main、没有无 Build ID 提案、没有 Save。

因此验收按平台真实生命周期分两层：

1. **#1046 候选 Finalization 门：** 同一 feature-branch Draft Build 完成安装、exact boot binding、hash、receipt、幂等、hook absence 与载体生存证明；同时记录 non-default Build 不可 Save、subagent 不继承 repo instructions 的能力边界。
2. **发布版收敛门：** exact candidate 进入默认分支并发布后，从默认分支安装 Workflow、构建并 Save Active Build；随后从该环境重启新的 top-level same-repository Agent，boot record 必须命名该 Build，并在任何 tool/file read 前完成 nonce、project overlay、precedence、negative absence 和 V2 marker 的语义 probe。

第一层证明候选代码；第二层证明实际发布/部署。目标在第二层通过前不算全部完成。

## 当前真实读取矩阵

| Host | 结果 |
|---|---|
| Claude Code local | `OWNER_ACCEPTED_MECHANICS`：机制证据充分；`loggedIn:false`，按 owner 决定跳过 live 模型腿，没有模型响应 |
| Codex local | PASS：fresh run + native compact + static recovery + dispatch |
| OpenCode local | PASS：fresh native session |
| Kimi local | PASS：fresh native session |
| Grok local | PASS：fresh session + native compact |
| Cursor CLI local | PASS：fresh session + native compact |
| Cursor App local | PASS：独立新 App Agent |
| Cursor Cloud | candidate install/Build/cold boot PASS；exact-Build subagent 全 `null` 是隔离上下文负控；top-level 语义验收按平台要求在发布后 Save + restart |
| ZCode App local | PASS：独立新 task，negative token null，无 pre/post hook |

每个 PASS 都绑定同一 global nonce `KW1046_GLOBAL_LIVE_bd766e8f`、project token、negative token absence、版本、会话 locator 与原始响应。详细 raw locator 在 runtime live matrix 中。

## 自动化与 exact-candidate 证据

- producer-selected chains：4/4 PASS；
- canonical `npm test`：PASS；
- walkthrough：179/179 scenarios，2,118 spawns；
- global-contract focused suite：154 PASS；
- runtime architecture suite：784 PASS；
- prompt-framework suite：153 PASS；
- routing suite：506 PASS；
- install-all suite：275 PASS；
- affected edition suites、generated checks、mirror checks：PASS；
- exact-SHA receipt：`kaola-workflow/bundle-1046/.cache/chain-receipt.json`。

任何 production byte 变化都会使上述候选证据失效，必须重新冻结并重跑受影响 live matrix。

## 关闭与发布验收

### #1046 可以进入 Finalization 的条件

- [x] 唯一 universal source、九宿主 registry 与 batch transaction 完成；
- [x] project AGENTS 减法、owner-byte preservation、active-run preservation 完成；
- [x] 无 pre/post tool injection、无 inference-time JS、dispatch always loaded；
- [x] exact candidate 自动化全部通过；
- [x] Claude 安装、静态 render、SessionStart/compact hook、组合与回归机制通过；owner 明确接受因 `loggedIn:false` 跳过 live 模型腿，且正文不宣称模型响应 PASS；
- [x] Cursor Cloud candidate Draft Build 的安装、exact cold boot、hash、receipt、空 hook 与 subagent 隔离负控完成；发布前不再用未保存 Draft/subagent 伪装 top-level 语义验收；
- [x] live matrix 和 Issue 正文更新为最终候选事实；发布后 Save + restart 的 top-level 门完整保留，不作 waiver。

### 新 Release 和全目标完成的条件

- [ ] #1046 Finalization、sink、archive 与 Issue closure 有完整 receipt；
- [ ] exact publication commit 通过完整 unwaived release receipt；
- [ ] 发布新 GitHub Release；
- [ ] 从发布版运行 `./install-all.sh --yes` 与 `./install-all.sh --check`；
- [ ] Codex、OpenCode、Kimi、Grok、Cursor CLI、Cursor App local、ZCode 全部用发布版新会话复验；Claude 用发布版重验安装、静态 render、SessionStart/compact hook 与组合机制，继续保留 owner-authorized no-live-model exception；
- [ ] Cursor Cloud 从默认分支创建并 Save Active Build，新 top-level Agent 绑定该 Build 并完成 no-tool semantic probe；
- [ ] 审计 forge open list，不留未收尾 Issue 或 active claim；
- [ ] 恢复本机无测试 nonce 的正式 installation receipt。

## 明确不接受

- 用文件存在、parser 单测、mock 或 installer 日志代替真实模型读取；
- 用另一个 Runtime 或 Cursor sibling surface 代验；
- 把读过文件后的回答冒充 no-tool semantic read；
- 为了通过而在项目 `AGENTS.md` 恢复全量通用规则；
- 增加每次工具调用的 prompt injection 或运行时 JS composer；
- 在 feature-branch Build 上伪称 Save/Active；
- 未经 owner 明确决策，仅用 `SKIPPED`、`DOCS_ONLY` 或外部认证困难宣称整轮完成；Claude 本轮例外只接受已测机制，不宣称 live 模型读取；
- 覆盖 owner-authored global/project instructions；
- 在发布版 Active Build 与全 Runtime 重装复验之前宣称最终目标完成。
