# 官方研究：现代子代理提示词与多 Agent 编排

**检索日期：2026-09-09（Asia/Shanghai）**  
**研究窗口：2026-07-09 至 2026-09-09**  
**问题：**官方模型厂商和 Agent 框架在近期怎样定义有效的角色提示、子代理分工、上下文传递、交付与停止条件？这些证据对 Kaola-Workflow 的角色提示精简和子代理 brief 有什么可采用的约束？

本报告只使用一方官方文档、官方文档仓库或官方发布页。页面没有显示发布日期的，标成“当前页面、日期未显示”；检索日期不是发布日期。窗口内的日期证据主要来自页面的 `Last updated`、官方发布页或官方文档仓库提交记录。外部资料不能证明 Kaola 本地宿主已经加载了某种提示，也不能替代本地运行验收。

## 结论

官方资料在一个可执行的最小结构上趋同：**角色/能力边界 + 当前结果 + 成功或验收条件 + 必要上下文和工具 + 权限/风险边界 + 交付格式或停止条件**。这不是要求每次都写六段固定模板，而是区分“模型完成任务必需的信息”和“可以从常驻规则或运行时获得的信息”。

因此，“只保留角色和目标”可以作为削减冗余的方向，但不能作为所有子代理的充分提示。静态追踪可能只需角色、目标和路径；外部查证还需要来源与时效要求；实现任务需要验收、工作区边界和可用工具；审查任务需要被审查的变更及报告落点；不可逆操作需要明确授权边界。应删除通用教条、默认命令、固定步骤、任意数字阈值和无机器消费者的回执仪式，同时保留具体任务实际依赖的上下文和判据。

官方资料还给出三条对 Kaola 编排有直接意义的边界：

1. **编排方式决定上下文和最终责任。** OpenAI、Microsoft 都区分“主代理把专长代理当工具调用”和“把任务 handoff 给另一个代理”。前者主代理保留最终答案，后者接收方负责后续任务；上下文是否完整传递、哪些历史应过滤，必须由编排器明确决定，不能假设所有子代理自动看到父级提示。
2. **子代理适合独立、可并行、边界清楚的结果。** Anthropic 明确提醒不要为简单任务过度使用 subagent；Google 建议对复杂工作拆成链式或并行聚合步骤；确定性顺序、汇聚、冲突整合仍应由编排层负责。并行不是固定阶段，也不是角色数目标。
3. **提示词质量要靠任务结果和评测验证。** OpenAI 建议从最小的新鲜基线开始，Anthropic 和 Google 都强调用实际响应迭代，Google 的 Agent 文档还把恢复、风险、权限、精确性列为可调行为维度。字符数、固定字段数或模型自评不能证明角色提示变好。

## 官方证据

### OpenAI：结果优先，工具和委派边界显式化

- [Latest models guide](https://developers.openai.com/api/docs/guides/latest-model)（当前页面，日期未显示）把新模型的提示建议概括为：从一个短的、面向结果的基线开始；写清目标结果、成功标准、约束、输出格式和停止条件；提供清楚的工具描述；想让模型委派时要直接说明委派意图。页面同时警告，过长、相互冲突或过度规定过程的提示可能阻碍模型完成任务。该证据支持“删掉通用流程，保留结果和必要边界”，但不支持把所有任务压成角色加一句目标。
- [Agents SDK for Python: Agents](https://openai.github.io/openai-agents-python/agents/)（当前页面，日期未显示）把 Agent 的核心组成描述为 instructions、tools 和运行时；同页区分 manager 使用 agents-as-tools 与 handoffs。角色正文不应假装包含工具实现或状态载体；工具、运行时、会话状态和提示职责应保持可辨认的层次。
- [Agents SDK for JavaScript: Multi-agent](https://openai.github.io/openai-agents-js/guides/multi-agent/)（当前页面，日期未显示）说明 manager 模式由主代理保留最终答案，handoff 模式由专门代理接管后续对话；建议为专长代理设置清楚的工具和参数边界，并用评测验证多代理设计。
- [Agents SDK for JavaScript: Handoffs](https://openai.github.io/openai-agents-js/guides/handoffs/)（当前页面，日期未显示）说明默认可把完整对话历史传给接收方，但 `inputFilter` 可以改变传递的历史；`inputType` 是元数据，`RunContext` 是应用状态。对 Kaola 而言，当前任务 brief、父历史、项目状态和宿主能力应分别建模，不应靠角色提示逐字复制父上下文。

OpenAI 官方仓库在研究窗口内有可核对的文档更新：

- [Agents JS capability/authorization clarification](https://github.com/openai/openai-agents-js/commit/9051635ebf5481869c0b54b0495f9de80abef592)，2026-08-25；
- [Agents JS v0.16.1 updates](https://github.com/openai/openai-agents-js/commit/7bef1f23f35b913d96bbb03ba02ed6f7432ddd9d)，2026-08-16；
- [Agents Python v0.22.0 behavior changes](https://github.com/openai/openai-agents-python/commit/727e729f212d7d8e396480ea73786c3d1cf74ac7)，2026-08-19；
- [Agents Python capability/authorization clarification](https://github.com/openai/openai-agents-python/commit/48c2ee40a41610ad92b20ba0ce77a3587f127cd8)，2026-08-25。

这些提交日期证明文档在窗口内持续修订，不证明 Kaola 的本地运行时已经具有相同版本或行为。JS 多代理页面的相关润色提交 [ca82d1c3](https://github.com/openai/openai-agents-js/commit/ca82d1c3a1253ae72cff472764c0b766bbb40e3c) 为 2026-07-04，早于本研究窗口五天，不能当作窗口内更新。

### Anthropic：直接表达结果，按任务使用上下文和子代理

- [Claude prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)（当前页面，日期未显示）建议清晰直接地写任务，在需要时解释动机，使用少量而有代表性的示例和结构化标签；长上下文应先给文档、最后给问题，并用原文证据约束回答。页面还建议一般规则优先于僵硬的逐步处方，同时提醒过强的 `MUST` 可能导致过度触发。
- 同页关于 Agent 的部分把“成功标准、来源核验、研究范围、停止条件”作为研究类任务的一部分；关于 subagent 的部分建议只在任务可并行、相互独立且确实能从拆分中获益时使用，避免为简单工作增加代理层。
- 同页关于长任务的部分要求跨窗口保留精确状态、约束和未完成事项；关于修改边界的部分区分可逆操作和破坏性操作，要求授权和边界清楚。这个方向与 Kaola 的运行状态、候选验证记录和不可逆动作保护相容，但不意味着应把整个项目合同复制到每个角色提示中。
- [Prompting Claude Fable 5.1](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1)（当前页面，日期未显示）强调完成用户已授权的整个任务、保留压缩时的精确状态、避免未经请求的修复或测试，并在子代理运行时让主代理继续处理独立工作。这些是行为约束，不是要求每个角色使用同一套固定输出模板。
- [Claude Fable 5.1 model overview](https://platform.claude.com/docs/en/models/fable-5-1/overview) 的发布信息显示模型于 **2026-09-01** 发布；[Anthropic newsroom](https://www.anthropic.com/news) 同期列出 “Introducing Claude Fable 5.1”。这为模型上下文提供了窗口内日期，但上述提示最佳实践页面本身仍未显示发布日期，不能把它写成一篇 2026-09-01 发布的提示文章。

### Google：结构化输入，复杂工作拆分，显式调节 Agent 行为

- [Gemini prompt design strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)（当前页面，日期未显示）要求清晰具体地写输入、约束和输出格式；推荐用少量一致的 few-shot 示例来固定范围、格式或表达，而不是用更多抽象规则填充提示。页面同时建议复杂工作拆成独立提示、链式步骤或对独立数据分片并行后聚合。
- 同页的 Gemini 3 指南建议把角色、关键约束和输出要求放在系统指令或用户提示开头；长上下文先放数据、最后放问题；对 Agent 可明确调节逻辑分解、诊断深度、信息穷尽程度、适应性、恢复、风险、权限/澄清、精确性和完整性。该列表适合用来设计任务级 brief 的可验证维度，不应照抄成每个角色的长篇常驻教条。
- 同页还指出，最新事实应使用 grounding 工具，计算应使用 code execution；这说明“是否需要工具”是当前任务的信息，而不是应硬编码为所有角色都必须拥有或调用的步骤。
- [ADK Agent Team tutorial](https://adk.dev/tutorials/agent-team/)（当前页面，日期未显示）要求给 Agent 提供名称、模型、描述、指令和工具；对子代理的描述应简洁说明能力和范围，根 Agent 的指令要说明何时把任务委派给哪个子代理。它支持在会话状态中保存跨代理可用的信息，因此“代理名称”不能代替委派条件和输入范围。

Google 官方 ADK 文档仓库在窗口内有相关修订记录：[Agent team persistence/ToolContext 修订](https://github.com/google/adk-docs/commit/839e898fcf0176c8c323aeb4cf806e2fc1b14c15) 为 2026-08-07，[Python agent team 教程修订](https://github.com/google/adk-docs/commit/534d39895ec07fd375580c06da619648e3058f36) 为 2026-07-13。仓库提交证明文档内容仍在变化，不能单独证明任何 Kaola 宿主实现了 ADK 的会话状态语义。

### Microsoft：把身份、历史、工具、中间件与工作流分层

- [From LLMs to agents](https://learn.microsoft.com/en-us/agent-framework/journey/from-llms-to-agents)（页面标注 **Last updated 2026-08-25**）把 Agent 描述为模型外加持久身份/系统指令、工具、记忆和运行时；指令负责 persona、约束和输出，session state 负责跨轮状态。这个分层直接支持把 Kaola 的常驻角色、当前任务 brief、项目状态、宿主能力和机器记录分开。
- [Agent pipeline architecture](https://learn.microsoft.com/en-us/agent-framework/concepts/agents/agent-pipeline)（页面标注 **Last updated 2026-08-25**）把 middleware、history provider、context provider、tool-call loop 和模型调用分开，说明上下文装载、工具调用和记录都属于生命周期层，不应全塞进角色自然语言。
- [Handoff](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/handoff)（页面标注 **Last updated 2026-08-25**）明确区分 handoff 与 agent-as-tool：handoff 的接收方拥有任务并可获得完整上下文；tool agent 只获得相关上下文，主 Agent 保留责任。页面还说明可过滤历史和工具调用。对 Kaola 最重要的推论是：每次委派必须有明确的上下文边界、责任归属和返回/交接语义。
- [Agents in workflows](https://learn.microsoft.com/en-us/agent-framework/workflows/agents-in-workflows)（页面标注 **Last updated 2026-08-25**）用简短指令创建翻译等专用 Agent；[builder and execution](https://learn.microsoft.com/en-us/agent-framework/concepts/workflows/builder-and-execution) 说明确定性工作流可以按 superstep 并行执行并再汇聚。框架能力支持并行，不等于每个任务都应拆成多个代理。

## 对 Kaola-Workflow 的采用建议

下面是从上述资料到本地角色和子代理 brief 的**可检验推论**，不是任何供应商的原文规定。

### 常驻角色应保留什么

每个角色保留三类稳定信息即可：

- 它负责的结果类型，以及与相邻角色的实际交付差异；
- 它能够做出的判断范围和必须遵守的项目边界；
- 交付必须可复查的证据性质，例如“给出实现位置”“给出运行测量”“给出有出处的结论”“给出可核查发现”。

角色正文不宜长期携带默认命令、固定阶段、通用安全教材、任意百分比、信心格式、长篇身份宣言或没有真实机器消费者的回执语法。若某段文字只是完整性校验、版本、运行时适配器或安装协议，应让机器层承载；只有模型确实需要理解的能力差异才进入 instructions。

### 本次分发的任务 brief 应补足什么

对当前委派，至少传入能决定正确结果的事实：

- 当前目标和成功/验收条件；
- 要处理的路径、变更、数据或外部问题；
- 已知约束、权限、不可逆边界和允许的工具；
- 需要回传的证据及其落点；
- 完成、无法安全继续、需要用户决定时分别怎样停止或返回。

这是“最小充分上下文”，不是新的固定字段协议。静态探索可以短；涉及实现、审查、外部研究、指标比较或危险写入时，不能为了追求短提示删掉任务真正依赖的信息。

### 委派和验收

- 把独立的调查、不同文件的互不依赖检查或可分别验证的研究分支并行分发；把需要共享中间状态、顺序依赖、冲突整合或最终取舍的工作留在编排器。
- 记录主 Agent 是否保留最终答案、子代理是否接管任务、传入了哪些历史/上下文、结果写到哪里。不要假设子代理会继承父 Agent 的全部系统提示、工具或授权。
- 用固定的代表性任务做旧/新提示对照：观察目标完成率、错误路由、缺证据、无谓停止或复跑、输入 token（宿主可见时）、时长和成本；宿主不暴露的值写 `unknown`。提示更短本身不是通过标准。
- 机器真正读取的最终验证字段继续由编排器依据原始记录写入；自然语言子代理回执不能伪造未执行的环境、设备、服务或用户验收。

## 证据边界、未知与版本风险

- 本次研究确认的是官方文档在检索时表达的设计建议，不是 Kaola 的本地行为测试。没有执行本地原生宿主的角色加载、上下文传递、子代理路由、成本比较或跨设备验收。
- 多个关键提示页没有显示发布日期；“当前页面”只能说明检索时可访问，不能证明内容在窗口内首次发布，也不能保证下一版模型继续保持同样的敏感点。
- 官方示例常常是模型、SDK 或云服务特定的。few-shot、XML 标签、完整历史、结构化输出、handoff、session state 等手段按任务和宿主选择，不应机械地并入所有 Kaola 角色。
- 供应商都支持显式约束，但对“多写步骤”与“少写过程”的平衡不同：Google 为复杂 Agent 给出较长的行为维度示例，OpenAI 和 Anthropic 同时警告过长或相互冲突的指令会阻碍完成。应以实际任务结果和本地消费者为裁决，而不是以某一家模板或提示长度为裁决。
- 版本敏感项包括模型的指令遵循、上下文窗口、handoff 默认历史、工具可见性、会话状态和结构化输出能力。升级模型或运行时后，至少重跑受影响的代表任务和安装/生成一致性检查。

## 来源索引

所有链接均为官方域名或官方 GitHub 仓库；页面内容按 2026-09-09 检索。主要来源：

1. OpenAI 最新模型、Agents SDK Python/JavaScript 与 handoff 文档；
2. Anthropic Claude 提示最佳实践、Fable 5.1 提示页、模型概览和发布页；
3. Google Gemini 提示策略、Gemini 3 Agentic workflows、ADK Agent Team；
4. Microsoft Agent Framework 的 Agent、pipeline、handoff 和 workflow 文档；
5. 上述 OpenAI 与 Google 官方文档仓库在 2026-07-09 至 2026-08-25 的提交记录。

