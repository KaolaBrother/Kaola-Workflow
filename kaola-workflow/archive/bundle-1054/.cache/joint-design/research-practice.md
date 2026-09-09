# Coding subagent 提示词与上下文实践研究

研究日期：2026-09-09（Asia/Shanghai）  
研究窗口：2026-07-09 至 2026-09-09；窗口外材料只作边界背景。  
问题：现代 coding subagent 如何划分持久角色与本次任务 brief，如何注入动态上下文、缩小分发载荷、拆分与合并角色，以及如何做独立审查；这些实践哪些可以安全地映射到 Kaola-Workflow。

本报告只读检索了维护者仓库的 release、PR、issue、文档和源码变更说明。结论分为：

- **已交付**：维护者仓库中已合并的变更或已发布的 release。
- **设计/提案**：open PR、accepted/design issue 或当前文档；它们说明方向，不证明所有用户都已获得该行为。
- **问题报告**：用户提供的复现和测量；它们是故障信号，不是维护者共识。
- **推断/建议**：根据上述材料对 Kaola 的适配建议，需用本地验收确认。

没有测量任何模型提供商的真实缓存命中率，也没有把外部 issue 的用户报告当作 Kaola 的现状。没有修改 Kaola-Workflow 仓库、Issue 或运行中的任务。

## 研究结论

1. **角色正文与任务 brief 应是两个生命周期。** 角色正文保留稳定的职责、工具权限、custody、不可越过的边界和默认交付协议；本次 dispatch 只传目标、范围、当前证据、工作位置、验收依据、交付位置和必要停止条件。外部项目没有证据支持固定字数、固定压缩率或每个任务都加载完整历史。
2. **动态上下文应该在调用点生成，并显式区分静态与动态部分。** OpenHands 已合并 typed `PromptSection`/`PromptContext`/`PromptRegistry`：section 有 guard、纯 render、唯一 name、`static`/`dynamic` cache tier，context 是冻结快照。这个设计能让“持久规则”“按会话变化的事实”和“无关内容”分开测试；它没有提供 Kaola 可直接套用的 token 节省数字。
3. **“短用户问题”不等于“短请求”。** MiMo 的测量显示，170 字用户输入的首轮请求中，工具 schema 约占 70%；另一个 `/btw` 报告在约 300K 会话上产生 0.58M–1.32M 输入 token 且输出为 0。优化分发时应先量工具描述、系统块、历史快照和重试，再讨论自然语言 brief 的长度。
4. **动态发现比模型猜名称可靠。** OpenCode 的 open PR #43282 在注册时列出当前 location 可用的 subagent ID，过滤 primary/hidden agent，并保留运行时可配置的字符串 schema；它用 10 个 focused tests 加完整 core suite 验证。该 PR 仍 open，不能说已是所有版本的默认行为。
5. **角色拆分首先是权限和验收边界问题，其次才是并行速度问题。** Aider 的 architect→editor 故障报告复现了仓库 README 的 prompt injection 经过 architect 直接传给 editor，最后提交后门代码。拆角色可以隔离工具与权限，也会引入不可信 handoff 面；分发和 reviewer 必须把上游产物当作待验证输入。
6. **恢复与终止需要真实生命周期证据。** Kimi 的 open PR #2190 用 PID liveness 避免恢复时把仍在运行的 process task 标为 lost，但自动 review 又指出 ghost 状态刷新和 PID reuse 身份问题。Kimi 的问题 #2615 报告了任务已标记 terminal 后仍继续请求约 15.4M input tokens。一个“终止”字段不能替代底层 worker 已停止的证据。
7. **持久提醒、项目上下文和按轮注入不是同一种东西。** Goose v1.44.0 将时间时区显式化、在 approval 期间禁用 compaction 等生命周期细节纳入 release；Goose #10262 则把每轮 Top Of Mind 与启动时 `.goosehints` 区分，并建议 global→project→environment file→environment text 的合并顺序。后者是 accepted/design issue，仍不是已发布的文件发现协议。

## 证据表

| 来源（日期） | 状态 | 观察到的机制 | 对 Kaola 的可用启示 | 证据边界 |
|---|---|---|---|---|
| [OpenHands/software-agent-sdk PR #3634](https://github.com/OpenHands/software-agent-sdk/pull/3634/files)（2026-06-11） | 已合并；窗口外背景 | 新增 typed `PromptSection`、冻结 `PromptContext`、注册表、guard/render 纯函数和 static/dynamic block；配套孤立单元测试。 | 将全局合同、角色规则、运行时事实和本次 brief 分成可命名、可测试的块；对静态块和动态块分别做快照。 | 合并日期早于窗口；PR 说明设计和测试，不给出跨模型成本基准。 |
| [OpenHands file-based agents](https://docs.openhands.dev/sdk/guides/agent-file-based)；[subagent loader 约束](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/subagent/AGENTS.md)（当前文档，日期未标） | 当前文档/实现说明 | Markdown frontmatter 配置 name、description、tools、model、iteration；body 成为 system prompt suffix；project/user 目录有明确优先级；`max_iteration_per_run` 和 permission mode 是配置字段。 | 把长期角色配置与调用时的任务正文分开；给角色设置工具和迭代边界；明确优先级并只保留一个权威来源。 | 当前文档不等于窗口内新发布的行为；具体宿主继承方式仍需本地验证。 |
| [Goose v1.44.0 release](https://github.com/aaif-goose/goose/releases/tag/v1.44.0)（2026-07-23） | 已发布 | release notes 包括 prompt timestamp timezone、approval 期间禁用 compaction、每消息 usage/cost、有效 context limit、subagent/permission 相关修复。 | 生命周期、时间、审批和 context limit 应作为运行时事实注入，并由机器字段记录；不要用长提示词替代状态机证据。 | release notes 列出功能，不证明每项在所有 provider 上的表现。 |
| [Goose #10262](https://github.com/aaif-goose/goose/issues/10262)（2026-07-04，窗口外但贴近边界） | Open；状态为 accepted/design | 提议 global/project Top Of Mind 文件，和 `.goosehints` 项目上下文分开；每轮注入的内容与启动上下文有不同语义，并提出固定合并顺序。 | persistent prompt、project rules、per-turn reminder 分层；每层有来源、优先级和预算，不把每轮重复注入当默认。 | issue 不是 merged implementation，日期也早于窗口。 |
| [OpenCode #35823](https://github.com/anomalyco/opencode/pull/35823)（2026-07-08 开；2026-08-08 自动清理关闭） | 未合并；边界背景 | headless `run` 中，子 session 的 permission ask 因只比较 top-level `sessionID` 而被丢弃；提案沿 `parentID` 链判断 descendant，并在 auto 模式答 `once`，否则 reject 使其 fail closed；有 lineage 测试。 | dispatch 不能假设子代理有交互式人类；所有 descendant 的权限和失败路径都应可观察、可拒绝、可终止。 | PR 后被自动清理关闭；不能把它写成 OpenCode 已发布保证。 |
| [OpenCode #43282](https://github.com/anomalyco/opencode/pull/43282)（2026-08-18） | Open PR | registration 时从 `Agent.Service.list()` 生成 location-specific agent catalog，排除 primary/hidden，补进 tool description；运行时仍保留 permission assert；focused 10 tests、1854 core tests 和 typecheck。 | 动态列出当前可用角色/能力，消除 `explorer`/`explore` 这类名称猜测；无可用角色时明确 fallback 或 fail closed。 | PR 仍 open，且 CI 曾因 fork approval 卡住；验证记录是 PR 作者报告。 |
| [Kimi Code #1928](https://github.com/MoonshotAI/kimi-code/pull/1928)（2026-07-19） | Open PR | `.kimi-code/local.toml` 中按 subagent type 绑定 model/thinking effort；workspace > profile > parent；sticky resume；未知 alias 报错；`AgentSwarm` 明确暂不读取绑定。 | 模型路由、权限和角色选择应由用户/编排器配置机械决定；不要让 LLM 静默覆盖持久配置；批量 swarm 需单独设计。 | PR open，页面显示 checks 0；不代表已合并或经过统一评审。 |
| [Kimi Code #2190](https://github.com/MoonshotAI/kimi-code/pull/2190)（2026-07-25） | Open PR | 恢复时对持久 process task 做 `process.kill(pid, 0)`；活进程不标记 lost；200 个 task tests、lint/typecheck/sherif 通过，少量无关 plugin tests 在基线已失败。 | 恢复/重派必须检查 worker liveness 和 owner identity；reviewer 要检查“跳过 lost 后如何收敛”和 PID reuse。 | PR open；自动 review 已指出 ghost refresh 和 PID reuse 未解决。 |
| [Kimi CLI #2578](https://github.com/MoonshotAI/kimi-cli/issues/2578)（2026-08-02） | 问题报告 | 6 个并行 coder 中 4 个因 403/timeout 半途退出，留下半写状态和 16 个 TS errors；resume 会重新读取/验证，重复消耗 token。 | 并行 dispatch 要求轻量 checkpoint、原子写入或隔离 worktree；恢复 brief 应只带状态和下一步，而不是重放全部历史。 | 单一用户报告，未证明发生在所有版本/工作流；不要据此承诺自动 checkpoint 已存在。 |
| [Kimi CLI #2586](https://github.com/MoonshotAI/kimi-cli/issues/2586)（2026-08-05） | 问题报告，后标 Closed | 约 500K context fill 后观察到重复循环、无升级、角色漂移和 compaction 后信任 stale summary；作者建议重 grounding 和 circuit breaker。 | compaction summary 必须标为未验证；恢复后重新查磁盘/任务/commit；连续失败要停并请求决策。 | 操作者测量的阈值，非文档化限制；报告没有隔离 compaction、provider 和工具表的因果。 |
| [Kimi CLI #2615](https://github.com/MoonshotAI/kimi-cli/issues/2615)（2026-08-21） | Open 问题报告 | task/subagent 已 `timed_out`/`killed` 后仍继续约 26 分钟；报告记录约 137 次 LLM steps、15,431,930 input tokens 和 105,982 output tokens，杀掉父进程才停止。 | 终止验收需同时看状态、进程/任务句柄、网络/文件活动；terminal 状态不能只由 UI metadata 表示。 | CLI 报告 token，provider 计费可能因 cache 不同；尚未证明是普遍行为。 |
| [MiMo-Code #890](https://github.com/XiaomiMiMo/MiMo-Code/issues/890)（2026-06-17，窗口外背景） | Open 问题报告 | 170 字用户 prompt 的失败首轮请求中，工具 schema 56,141 chars（69.8%），系统消息另占约 23.4% 和 6.3%；12 个内置工具每轮 eager serialize。 | 先做工具暴露和 schema 的按需化，再讨论 brief 字数；不要把“任务短”当作请求小。 | 用户捕获的单一 provider/model 对照，未证明所有模型阈值相同。 |
| [MiMo-Code #1855](https://github.com/XiaomiMiMo/MiMo-Code/issues/1855)（2026-07-22） | Open 问题报告 | `/btw` 短问题在约 300K session 上按 history snapshot 构造了 0.58M、1.05M、1.32M 等 input，output 为 0；报告建议 question-only 或小系统块、可选最近 N 轮、8K–32K hard max。 | side task 使用最小上下文，默认传引用/摘要而不是整段会话；对 payload 做硬上限和可见错误。 | 本地数据库和日志来自用户环境；建议数值是 issue 的 acceptance，不是通用标准。 |
| [Aider #5058](https://github.com/Aider-AI/aider/issues/5058)（2026-04-21，窗口外背景） | Open 安全问题 | architect 读取恶意 README，把输出原样传给 editor；验证复现了将 telemetry import 写入 `auth.py` 并提交。 | architect/editor 或 planner/implementer 之间必须有不可信 handoff、独立 diff review 和仓库内容注入边界。 | issue 的 retest 使用 `--yes`，作者明确没有声称绕过全部安全逻辑；它仍是问题报告。 |

## 对 Kaola 的 prompt 分层建议

建议保留三层，而不是复制一份“万能长提示词”给每个子代理。

### 1. 持久角色层

由 `templates/agents/behavior-contracts.json` 或等价的一个权威源维护。每个角色只写：

- 角色身份、负责的结论类型和写入 custody；
- 可用工具和明确的只读/可写范围；
- 不能伪造执行证据、不能越过授权、遇到 capability gap 如何报告；
- 默认交付字段，例如 `result`、`evidence`、`unknowns`、`stop_reason`；
- 角色独有的验收规则。

全局合同只保留确实适用于所有角色的边界。重复出现的安全段、工具不足段和 solution ladder 应先按语义合并，再由生成器渲染给各 runtime。删除重复文本前要确认子代理确实能看到共享块；父会话继承不能假定存在。

### 2. 本次任务 brief

一次 dispatch 至少需要下面这些事实：

```text
目标：完成 <outcome>。
范围：只读/修改 <paths>；保留其他工作树改动。
基线：<commit、issue/claim、已有结果或机器信号>。
验收：<命令、证据字段、review 或用户可见结果>。
交付：把 <artifact/result> 写到 <destination>，返回 <evidence refs>。
停止：遇到 <权限、冲突、缺失能力、未知状态> 时报告并停止。
```

这是字段集合，不是固定字数。无代码的小调查可以只保留目标、范围、证据和交付；跨 worktree 的修改任务再增加基线、custody、验收和停止条件。brief 应引用可访问的文件/commit/receipt，而不是把整套角色正文、完整主会话和所有历史再次粘贴进去。

### 3. 调用点动态层

每次生成 dispatch 时只注入当下可能改变决策的事实：当前 run/claim、worktree 和 HEAD、任务状态、允许的工具/模型、目标 diff 或文件定位、已完成 mission 结果和未完成 frontier。为每个块定义来源、生命周期、是否可缓存、变更后哪些 PASS 失效。

建议采用 OpenHands 类似的内部形状，但不照搬实现：

```text
PromptContext = {
  static_role_contract,       // spawn 期间稳定
  run_facts,                  // claim / mission / custody
  task_facts,                 // 当前目标和验收
  dynamic_capabilities,       // 当前工具、agent ID、模型、权限
  evidence_refs,              // commit、receipt、命令结果的引用
}
```

`static_role_contract` 可以参与缓存；其余块按调用点生成。动态块为空时不发送空壳。任何自动摘要都标为摘要，不可替代对工作树、任务文件、commit 和退出码的复核。

## “diffs-only dispatch”的边界

外部材料没有证明“任何子代理都只需要 patch”这一强规则；实现任务常常还需要读取目标文件和相关测试。因此建议采用 **pointer-first、diff-bounded**：

- 优先发送目标 commit、文件路径、行号、现有 receipt 或 patch 引用；
- 只展开与本次 outcome 直接相关的 diff/片段；
- 把完整历史、无关工具 schema、其他角色的长报告留在可检索位置；
- 需要完整文件时说明原因，并限制文件集合与大小；
- reviewer 默认接收最终 diff、验收契约和独立执行证据，不接收作者的全部思路历史。

这同时降低 prompt injection 面和重复 token；但是否降低成本必须由 A/B 测量验证。至少记录每次 dispatch 的静态块字符数、动态块字符数、工具 schema 字符数、历史快照字符数、输入 token（若 provider 可见）、输出、重试和缓存字段。没有这些数据，只能说“载荷更小/边界更清楚”，不能说节省了某个百分比。

## 何时拆分、何时合并角色

**应拆分**的信号是：工具或写权限不同；验收标准不同；需要独立判断；生命周期不同（例如探索可停止而实现继续）；或者输入来自不可信仓库内容，需要另一个角色重新验证。一个安全的 Kaola 组合可以是：

1. read-only explorer：定位源码、约束和未知，不写生产文件；
2. planner/architect：提出可验证方案，只写约定的计划产物；
3. implementer：在明确 worktree/custody 中修改；
4. verifier/reviewer：从最终 diff、验收条件和机器证据重新判断。

**应合并**的信号是：两个角色读同一批文件、输出相同结论、没有独立权限或 oracle，且 handoff 需要复制大段上下文。拆分只有在它减少风险、允许真正并行或产生独立证据时才有价值；“每个阶段一个角色”本身不是验收条件。

对 planner 与 architect，不要同时要求两份同构计划。可以让一个角色回答结构/依赖问题，另一个只在有独立技术风险或接口决策时介入；否则把输出合并成一个可执行的 plan artifact。

## 独立 review 的最小协议

reviewer 的输入应重新构造为：目标和验收契约、最终 diff/commit、相关机器证据、允许的检查范围、需要返回的 verdict 字段。不要默认传作者的“已完成”叙述或完整历史。reviewer 至少应：

- 验证 diff 是否落在 custody 和目标范围；
- 复核失败/跳过/未执行的命令，不把 prose 当作 PASS；
- 检查仓库内容、上游代理输出和外部数据是否被当成指令；
- 给出阻断发现、未知和下一步，而不是只满足字符数/词数/位置格式；
- 对状态机、恢复、终止和重复执行做一次负向检查。

对于 architect/editor 或 planner/implementer，reviewer 应拿到原始任务和最终产物，而不是只审 handoff 文本。这是 Aider #5058 所揭示的信任边界。

## 建议的本地验收

这些是建议新增到研究/设计阶段的验证，不是已执行结果。

1. **静态/动态分离测试**：同一角色在两个不同 run 中，静态角色块字节一致；run/claim/HEAD 变化只改变对应动态块；guard 为 false 时不生成该块；section 不产生 I/O。
2. **最小 brief 测试**：用同一 outcome 分别构造短调查、修改任务、恢复任务，确认不需要的历史和角色正文不会进入 dispatch；验证引用仍可被子代理读取。
3. **payload A/B**：记录完整历史、目标 diff、工具 schema、系统块和输入 token；比较 pointer-first 与 full-history 两个版本的结果质量、失败率、重试和实际成本。没有 provider token 不能把字符数当 token。
4. **动态 agent catalog**：新增/隐藏/重命名 subagent 后，dispatch 使用当前有效 ID；未知 ID、权限拒绝和 descendant ask 都有可见的 fail-closed 结果。
5. **角色边界测试**：explorer 尝试写文件、implementer 尝试修改不在 custody 的路径、reviewer 收到恶意 README/上游文本，均不能越权或把文本指令当授权。
6. **独立 review 测试**：作者故意遗漏一项验收，reviewer 只接收最终 diff 和契约时仍能发现；reviewer 不依赖作者的“PASS”叙述。
7. **恢复/终止测试**：任务在 running、timeout、killed、completed 之间切换，验证底层 worker、文件活动、网络请求和持久状态最终一致；模拟 PID reuse/ghost refresh，而不是只检查一个 status 字段。
8. **compaction re-grounding 测试**：摘要中写入错误的已完成断言，恢复后必须重新读取 Mission List、worktree 和 receipt，并将冲突报告为未知或阻塞。
9. **规则去重的反向变异**：删除一份重复校验前，对其覆盖的失败输入逐项变异，确认保留的机器断言仍捕获同一缺陷；仅按重复字符串或行数删除不够。

## 已验证、推断与未知

### 已验证

- OpenHands 已有合并的 typed prompt section/context/registry 设计，区分 static/dynamic，且强调纯函数和孤立测试。
- Goose 1.44.0 已发布 prompt 时间、compaction、usage/context limit 等生命周期相关改进。
- OpenCode #43282 和 Kimi #1928/#2190 在窗口内分别提出动态 agent discovery、机械式模型绑定、恢复 liveness 保护，并附带了具体测试说明；它们仍是 open PR。
- MiMo #890/#1855、Kimi CLI #2578/#2586/#2615 提供了工具 schema 膨胀、历史快照膨胀、context drift、半写恢复和 terminal 后继续请求的实际报告。

### 推断/建议

- Kaola 可以采用角色层 + 任务 brief + 调用点动态块的三层协议。
- pointer-first、diff-bounded 比“永远只传 diff”更适合 coding task；是否节省 token 需 A/B。
- 角色拆分应由权限、custody、oracle 和生命周期触发；同构输出和重复读取应合并。
- reviewer 应使用独立上下文和最终 diff，且把仓库/代理输出视为不可信数据。

### 未知

- 本地各 runtime 是否继承父 system prompt、哪些块会进入 provider cache、实际 input token 如何计费，尚未完成跨宿主实测。
- OpenCode #43282、Kimi #1928/#2190 是否会合并、合并后的最终协议是什么，无法由 open PR 推断。
- Goose #10262 的文件命名、优先级和 per-turn 注入是否会发布，尚未确定。
- 外部用户报告的阈值和 token 数不能直接迁移为 Kaola 的阈值。

因此，当前最安全的 Kaola 方向是先做可观测的分层和边界验收，再删除重复提示词或引入缓存/自动压缩；不要以固定 prompt 长度、自然语言摘要或单个终态字段替代实际执行证据。

## 来源索引

- OpenHands: [typed prompt registry PR #3634](https://github.com/OpenHands/software-agent-sdk/pull/3634/files)、[file-based agents](https://docs.openhands.dev/sdk/guides/agent-file-based)、[subagent loader invariants](https://github.com/OpenHands/software-agent-sdk/blob/main/openhands-sdk/openhands/sdk/subagent/AGENTS.md)。
- Goose: [v1.44.0](https://github.com/aaif-goose/goose/releases/tag/v1.44.0)、[Top Of Mind file discovery #10262](https://github.com/aaif-goose/goose/issues/10262)。
- OpenCode: [headless descendant permission PR #35823](https://github.com/anomalyco/opencode/pull/35823)、[dynamic subagent IDs PR #43282](https://github.com/anomalyco/opencode/pull/43282)。
- Kimi Code/CLI: [workspace model binding #1928](https://github.com/MoonshotAI/kimi-code/pull/1928)、[PID liveness #2190](https://github.com/MoonshotAI/kimi-code/pull/2190)、[swarm partial state #2578](https://github.com/MoonshotAI/kimi-cli/issues/2578)、[high-context drift #2586](https://github.com/MoonshotAI/kimi-cli/issues/2586)、[post-terminal requests #2615](https://github.com/MoonshotAI/kimi-cli/issues/2615)。
- MiMo-Code: [tool schema payload #890](https://github.com/XiaomiMiMo/MiMo-Code/issues/890)、[`/btw` history snapshot #1855](https://github.com/XiaomiMiMo/MiMo-Code/issues/1855)。
- Aider: [architect/editor prompt injection #5058](https://github.com/Aider-AI/aider/issues/5058)。
