# Fable 研究综合：子代理提示词与角色划分（窗口 2026-07-09 至 2026-09-09）

执行身份：Claude Code 主编排者（Fable 5.1）。输入：本方三份 Sonnet `knowledge-lookup` 子代理报告（`fable-research-official.md`、`fable-research-evidence.md`、`fable-research-practice.md`）。我对每份报告的关键来源做了一手抽查（`WebFetch` / `gh api`），并把抽查发现的过度结论以"主编排者核对更正"追加在各报告末尾。**本文未读 Codex 的 research-*.md / codex-research-synthesis.md / issue-1054-proposal.md**，交叉核对另行进行。

## 0. 抽查记录（一手）
| 来源 | 抽查方式 | 结果 |
|---|---|---|
| Anthropic《Patterns and Problems in Multiagent Systems》 | WebFetch 原页 | 日期 2026-08-13；原句 "But these prompts did not make much difference."；结论限于游戏协作实验（游戏差、慢、界面难用），**不能**推广为"任何协作只由模型能力决定" |
| arXiv:2609.03028（Requirements After the First Edit） | WebFetch abs 页 | v1 2026-09-02；3,553 会话；"roughly twice as much invalidation"；作者自注 "not demonstrated as causal" |
| deepagents PR #4859 | `gh api` 正文/评论/review/files | merged 2026-07-22；正文 809 字，**不含**任何 token/正确率数字与实验链接；唯一依据句："The System Prompt Experiments found no arm statistically distinguishable, so parsimony argues for the leanest agent."；改动为删与工具 schema 重复的散文、保留 skills/memory/host-path routing。Sonnet 报告里的 -65%/-43%/0.81 等数字**降为未核实** |
| deepagents PR #4979 | `gh api` files/patch | merged 2026-07-23；`__init__.py` 移除顶层 `BASE_AGENT_PROMPT` 导出；`graph.py` 以 `__getattr__` 发弃用警告返回旧值 |
| Anthropic《anatomy of effective commerce agents》 | WebFetch 原页 | 2026-09-02；"anything relevant to a third or more of your traffic… goes in the system prompt, and the rest goes in skills"；"The prompt is where safe behavior starts, but… it can't be where safety is enforced" |
| OpenCode `docs/agents/` | WebFetch 原页 | Last updated Sep 8, 2026；"`tools` is deprecated. Prefer the agent's `permission` field"——**配置字段迁移**（tools→permission），原文不说提示词约束外迁；plan 的权限默认 `ask`，示例未给 prompt，**不能证明** plan/build 只差权限不差 prompt |

## 1. 最强依据（按证据强度，只列已一手核实者）
1. **需求/验收后补带来约两倍的代码失效**（arXiv:2609.03028，2026-09-02，3,553 真实会话 + 受控实验；相关性，作者明确非因果）。含义：派发时把验收依据与约束讲清楚，比事后提醒有效——这是"brief 必须自足"的最强实证。
2. **格式模板 + 人设 + 语气叠加产生超加性伤害，且方向因模型而异**（arXiv:2609.03156，2026-09-02，22,140 次评测，最高 -12.2pp）；窗口外背景（arXiv:2606.09410）把条件收敛为"模型算力余量"：高余量模型几乎不掉，低余量可掉 36.2pp。含义：固定输出模板不是免费的；对本仓库使用的高能力模型伤害可能小，但没有收益证据。
3. **提示结构在多智能体协作实验中差别不大**（Anthropic 2026-08-13，受控实验；限游戏协作场景）。含义：不要指望"更精细的角色分工提示"本身带来协调收益；不能反推"提示无所谓"。
4. **官方在配置层用更细粒度的权限字段表达工具边界，并把安全强制放在代码而非提示**（OpenCode 09-08 `tools`→`permission` 字段迁移；Anthropic 09-02 "safety… can't be where safety is enforced"，电商经验法则，不移植其"三分之一"阈值、不新增权限系统）。含义：宿主已有的权限/工具允许列表与流程门槛承载不可逆边界；角色散文不必重复它们，但这不是"从提示词删除边界"的命令。
5. **官方 SDK 以"各臂无统计差异"为由删除与工具 schema 重复的提示散文，保留不可推导的运行时事实**（deepagents #4859，2026-07-22；数字未公开）。含义："删除可推导/重复内容、保留独有事实"是被一线维护者采用的减法准则，但"更短更好"没有公开的对照数据。

## 2. 对核心问题的回答
- **现代子代理提示应以什么为主**：角色定位、要交付的结果与证据、独有的写入/custody 边界、停止条件。官方措辞（Anthropic 08-26 "instruct a smart person, not program a computer"；Cursor "2,000-word prompt… slower and harder to maintain"，日期未核实）与实践（Copilot CLI 一句话角色+边界；deepagents 删重复散文）方向一致，但**均为经验断言**。
- **哪些旧内容可删**：与工具 schema/宿主能力重复的说明、固定输出模板、数字门槛与比例、通用流程步骤、可由全局合同/宿主承载的安全教科书段。依据：#4859（重复散文）、2609.03156（模板叠加有害）、Anthropic 09-02（低频内容外置到技能）。
- **哪些上下文不可省**：（a）子代理**不继承**父会话（Claude Code 官方文档现行文本），因此 brief 必须带目标、验收依据、位置、写入范围、落点；（b）验收/约束必须首发讲清（2609.03028）；（c）宿主已有的工具/权限配置与流程门槛承载不可逆边界（OpenCode 配置字段迁移、Anthropic 电商案例），角色正文只补该角色独有的 custody；（d）行动边界与意图理解是失败占比上升的两类（arXiv 20,574 会话研究，v2 2026-08-31）。
- **更短是否真正改善**：**无窗口内对照证据**证明"字数"是自变量；有证据证明"重复/叠加约束无益或有害"、"缺失验收有害"。因此目标不是长度，而是删除无消费者、无行为差异的内容，并把边界移到结构化载体。
- **角色如何划分**：厂商分歧（Anthropic 反对按阶段、主张按上下文归属；OpenCode plan/build 至少在权限默认上不同，是否也差 prompt 文档未证明；Copilot/Cursor 按专长；Kimi 按读写权限+能力）。本仓库 14 角色是目录不是流水线，其列出顺序不构成按阶段强制分发的证据，重叠与否看实际交付与调用；实证（B3 窗口外：6 个多智能体系统 5 个跑输单 agent；Anthropic 08-13）不支持"更多更窄角色天然更好"；实践中**未找到**窗口内 planner/architect 或 test-writer/implementer 拆合的一手变更。结论：以**独有交付与写入权限**为划分轴，角色数不是目标；每次拆分需要实测收益。

## 3. 研究间分歧
- 实证（Anthropic 08-13、B3）对固定角色分工偏谨慎；实践（oh-my-opencode、VoltAgent 158+ 角色库）仍大量使用按职能拆分的专家角色且窗口内未做减法。两者面向的场景不同（协作博弈/通用基准 vs 领域专家描述），不能互相否定。
- "格式约束有害"的解释框架不一致（模型架构差异 vs 算力余量），窗口内未统一。
- 官方内部也不一致：Anthropic 主张给原则而非死规则，但其 harness 文章仍保留"It is unacceptable to remove or edit tests"式强禁令——即**少数高价值硬边界仍被官方保留**。

## 4. 对本仓库 14 角色的建议（本方独立结论，供与 Codex 交叉）
- **划分轴**：独有交付 + 写入/custody 权限。保留入口的角色是那些交付物类型不同的：规划（顺序与验收安排）、架构（结构与取舍）、验收测试（RED 证据）、生产实现、运行测量、静态追踪、外部查证、文档、正确性审查、安全审查、单主张反证、构建修复、冲突整合、指标棘轮。是否合并 planner/code-architect、investigator/code-explorer、code-reviewer/security-reviewer：**证据不足以支持合并也不足以反对**；按"交付是否真的不同"保留入口，并在运行层验收中记录实际派发差异，而不是现在按名字合并。
- **正文内容**：身份一句 + 交付与证据形态 + 独有边界/停止条件；不含固定模板、数字门槛、置信百分比、统计方法、流程步骤、通用安全段、solution ladder、机器回执协议（无生产消费者）。
- **边界载体**：工具允许列表/权限、宿主 adapter 的 `capability_gap`、全局合同的不可逆边界；角色正文只写该角色独有的写入 custody（例如 tdd-guide 不写生产代码、implementer 不改验收意义）。
- **brief**：目标、验收依据、位置（worktree/commit）、写入范围、落点、停止条件；首发讲清，不靠事后提醒（2609.03028）。
- **少数硬句可保留**：官方与实证都支持保留极少数高价值强约束（如"不得删改测试以求通过"），但要一句、一处，不重复十份。
- **子代理继承事实**：Claude Code 明确不继承父会话；其他六个 runtime 需按其 adapter 逐一确认（未做）。在确认前，不能假设子代理看到全局合同/项目规则。

## 5. 未证实部分
1. 窗口内无以"提示词长度"为单一自变量的对照实验；"更短更好"仍是断言。
2. deepagents #4859 的量化数字未公开；只能引用其"无统计差异"一句。
3. 无窗口内一手记录证明某项目拆分或合并了 planner/architect、test-writer/implementer。
4. Anthropic 08-13 的结论限于游戏协作场景；对单智能体工程任务的推广未被测试。
5. 除 Claude Code 外，其余 runtime 的子代理上下文继承与全局规则可见性未测量。
6. Cursor "2,000 词"、OpenAI "500 词"、Grok "4000 字符"等数字未溯源到一手页面，不采信。
