# 官方厂商指南研究：子代理/自定义 agent 系统提示词应写什么

## 执行元数据

- 执行身份：Claude Code 子代理，角色 `knowledge-lookup`，模型 sonnet，派发方 team-lead，派发时间 2026-09-09
- 检索时间：2026-09-09（当日执行完毕，未跨日）
- 检索窗口：2026-07-09 至 2026-09-09（"窗口内"）；窗口外资料仅作背景标注
- 使用的主要查询词（节选）：
  - `Claude Code subagents documentation system prompt best practices 2026`
  - `Anthropic Claude Agent SDK subagents guide changelog 2026`
  - `Anthropic engineering blog multi-agent system prompt design 2026`
  - `OpenAI Agents SDK subagent instructions best practices 2026`
  - `OpenAI Codex AGENTS.md custom agent guide 2026`
  - `Gemini CLI custom agents subagent system prompt documentation 2026`
  - `Google ADK Agent Development Kit multi-agent instructions guide 2026`
  - `Cursor custom agents rules.md subagent documentation 2026`
  - `GitHub Copilot custom agents coding agent instructions documentation 2026`
  - `OpenCode subagent config documentation update 2026`
  - `Kimi Code CLI agent subagent documentation 2026`
  - `Grok CLI agent documentation custom agent system prompt 2026`
  - 以及针对各命中页面的日期核实追问（GitHub commit 历史、releases 页面、changelog 原文）
- 方法：对每条候选来源使用 WebFetch 实际打开原始页面（docs.claude.com、code.claude.com、claude.com/blog、anthropic.com/engineering、github.com 的 CHANGELOG/releases/commits、opencode.ai、cursor.com、docs.github.com、developers.openai.com、developers.googleblog.com、docs.x.ai 等），核实发布/修改日期后摘录原文关键句。无法核实日期的来源单独标注"日期未核实"。

---

## 一、逐条来源记录

### Anthropic

**A1. Claude Code 子代理官方文档（现行文档，日期未核实）**
- URL: https://code.claude.com/docs/en/sub-agents（`docs.claude.com/en/docs/claude-code/sub-agents` 301 重定向至此）
- 标题：Subagents
- 发布方：Anthropic
- 类型：规范/参考文档（持续维护，非博客）
- 日期核实情况：页面本身不含"最后更新"时间戳；Wayback Machine 显示窗口内存在两个快照（2026-07-07、2026-09-06），说明文档在窗口内被持续访问/维护，但抓取工具无法访问 web.archive.org 逐字比对具体改动，因此**具体文字改动的确切日期未核实**，仅能确认窗口内该文档处于现行有效状态。
- 关键原文（英文原句，≤3 句）：
  1. "Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history, the skills you've already invoked, or the files Claude has already read."
  2. "The body becomes the system prompt that guides the subagent's behavior. Subagents receive only this system prompt plus basic environment details like the working directory, not the Claude Code system prompt."
  3. "Trim the `description` fields of your subagents, and move detail into each subagent's system prompt, which only loads when that subagent runs."
- 对核心问题的立场：**未给出**"角色+要完成的事+边界"式的明确写作规范，也未明确反对详细步骤或固定模板；仅给出结构性事实——子代理不继承父上下文（因此系统提示词必须自足），以及"描述要短、细节放系统提示词正文"这一路由效率考量（描述字段计入常驻上下文，正文只在触发时加载）。未发现篇幅/字数门槛。
- 备注：三方博客（Tembo.io 等）转述的"Keep the system prompt short...put procedure in a Skill instead"未能在官方页面原文中定位到对应语句，怀疑为三方总结而非官方原话，本报告不采信为一手依据。

**A2.《How Warp builds self-improving agents on Claude》**
- URL: https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude
- 核实日期：**2026-08-26**（窗口内）
- 发布方：Anthropic（客户案例栏目，Anthropic 编辑/发布）
- 类型：案例研究 + 建议（非对照实验）
- 关键原文：
  1. "Construct the skill as though you're instructing a smart person, not like you're programming a computer."
  2. "File-based skills are a way of encoding knowledge for agents without putting that knowledge directly in the prompt."
  3. "Providing the rationale behind the rule lets the agent reason about the problem instead of following rigid instructions."
- 立场：明确支持"少写死板步骤、多给原则和理由"的方向，与"角色+边界"式精简提示词的主张一致；程序性细节应放入按需加载的 Skill 文件而非常驻提示词；反对"穷举式变量命名规则"这类固定流程细节。**未给出**字数/比例的量化门槛，也**非**对照实验，属于经验总结。

**A3.《A guide to the anatomy of effective commerce agents》**
- URL: https://claude.com/blog/the-anatomy-of-effective-commerce-agents
- 核实日期：**2026-09-02**（窗口内）
- 发布方：Anthropic
- 类型：规范性建议，含少量量化经验法则
- 关键原文：
  1. "Anything relevant to a third or more of your traffic goes in the system prompt, and the rest goes in skills."（本报告在窗口内找到的**唯一明确量化的"何时该放进系统提示词 vs 该外置"经验门槛**）
  2. "No model tool call moves money or changes the business."（安全边界示例：模型不应被赋予可直接执行高风险动作的工具，而应经人工审批）
  3. Tool 边界的表述：让底层系统处理业务逻辑与排序，模型只做"该用哪个结果达成目标"的判断；"Tool results are context"。
- 立场：直接回应核心问题——安全边界/停止条件应由代码强制（"enforcement lives in code, not prompts alone"），而非仅靠提示词约束；给出了迄今唯一的量化"提示词 vs 外置"频率门槛（三分之一流量原则），但这是经验法则而非对照实验。

**A4.（背景，窗口外）《When to use multi-agent systems (and when not to)》**
- URL: https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them
- 核实日期：**2026-01-23**（窗口外，早于窗口 5.5 个月，作为背景引用）
- 关键原文：
  1. "Context-centric decomposition means an agent handling a feature should also handle its tests, because it already possesses the necessary context."
  2. "The instruction 'You MUST run the complete test suite before marking as passed' is essential" 以防止走捷径。
  3. "Multi-agent systems typically use 3-10x more tokens than single-agent approaches for equivalent tasks."
- 立场（窗口外背景）：明确**反对按"阶段"（规划→实现→测试）划分角色**，主张按"上下文边界"划分；这与本仓库当前 14 角色中 planner/implementer/tdd-guide 按阶段区分的做法存在张力（见第五节"启示"）。窗口内未发现 Anthropic 有更新的、推翻此立场的官方表态。

**其余检索到但落在窗口外、仅作背景的 Anthropic 一手来源**（均已用 WebFetch 核实日期，均非窗口内实质更新）：
- 《Zero Trust for AI agents》— 2026-05-27，强调"传统访问控制无法阻止 agent 滥用合法权限"，安全须结构化（加密身份、按任务范围授权），不能只靠提示词，与 A3 的"code, not prompts alone"呼应。
- 《Harness design for long-running application development》— 2026-03-24，展示按能力（planner/generator/evaluator）+ 按阶段（sequential handoff）混合划分角色的真实案例。
- 《Scaling Managed Agents: Decoupling the brain from the hands》— 2026-04-08，未涉及提示词写法。
- 《Effective harnesses for long-running agents》— 2025-11-26，强调"strongly-worded instructions"（如"It is unacceptable to remove or edit tests"）用于边界控制，说明官方实践中仍保留强约束式硬性指令，并非完全"去过程化"。
- anthropic.com/engineering 博客索引在窗口内（2026-07-09～09-09）**未发现新文章上线**（最近一篇为 2026-04-23）。

---

### OpenAI

**B1. Codex 多智能体（Responses API）指南**
- URL: https://developers.openai.com/api/docs/guides/responses-multi-agent
- 日期：**日期未核实**（页面无时间戳；Codex Subagents 于 2026-03-16 GA，窗口外；无法确认该页文字是否在窗口内被修订）
- 类型：参考文档
- 关键原文：
  1. "Subagents help when work divides into independent, bounded lanes: audit frontend and backend changes separately, research several primary sources, or run implementation and adversarial review in parallel."
  2. "Add a developer message to tune when the root model should spawn subagents."（示例："Do not spawn subagents unless the user explicitly asks" / 主动委派版本）
  3. "For most tasks, use the default `max_concurrent_subagents` value of 3."
- 立场：给出的是"何时该派生子代理"的调度层建议（按独立/有界任务划分），**未给出**子代理系统提示词本身该怎么写、篇幅多少的规范。

**B2. OpenAI Agents SDK `Agent.instructions` 文档**
- URL: https://openai.github.io/openai-agents-python/agents/
- 日期：**日期未核实**（无时间戳）
- 关键原文：instructions 字段标注为 "Strongly recommended"，示例极短（如 "Be concise."/"Handle all direct user communication."），但**无篇幅或结构建议**。
- 立场：无实质性表态。

**背景（窗口外）**：
- 《A practical guide to building agents》（PDF）— 2025-04 发布，早于窗口 1 年以上，主张"把任务拆成更小更清楚的步骤""明确措辞以减少歧义"，语气偏向"给清晰步骤"而非"极简角色定位"。
- 《The next evolution of the Agents SDK》— 2026-04-15，引入原生 sandbox 与子代理原语，但内容为基础设施能力公告，未涉及提示词写作规范。
- 三方总结提到"Agents with narrow, specific instructions outperform agents with long, complex prompts. If your instructions exceed 500 words, split the agent."——**未能在任何 OpenAI 一手页面中定位到"500 词"这一具体表述的原文出处**，本报告不采信为一手依据，标注为"来源存疑，未核实"。

**结论**：OpenAI 在窗口内（2026-07-09～09-09）**未检索到**专门讨论"子代理提示词应写什么"的新一手文档或博客；现有一手资料（B1/B2）均侧重调度机制而非提示词写作规范，且发布日期本身未落在窗口内或无法核实。

---

### Google（Gemini CLI / ADK）

**C1. Gemini CLI 子代理官方文档**
- URL: https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md（同步于 geminicli.com/docs/core/subagents）
- Git 提交历史核实：最近一次修改为 **2026-06-08**（"chore: remove experimental text from browser agent docs"），**窗口内（07-09～09-09）无提交**。
- 类型：参考文档
- 关键原文（窗口外内容，仅作背景）：文件必须以 YAML frontmatter 开头，正文即系统提示词；示例 `security-auditor.md` 采用"角色声明→职责列表→明确边界（'Do not fix it yourself; just report it'）"结构，但文档本身**未显式给出**该结构为推荐写法。
- 立场：文档存在角色+职责+边界的示例范式，但**没有一手文字明确主张**这是"应当"遵循的规范；且该内容窗口内无更新，故不计入"窗口内一手依据"。

**C2.（背景，窗口外）Google Developers Blog《Subagents have arrived in Gemini CLI》**
- 核实日期：**2026-04-15**（窗口外）
- 关键原文："Subagents act in isolation with their own set of tools, MCP servers, system instructions, and context window."
- 立场：仅描述能力，无提示词写作建议。

**C3.（背景，窗口外）Google Developers Blog《Build Long-running AI agents that pause, resume, and never lose context with ADK》**
- 核实日期：**2026-05-12**（窗口外）
- 关键原文："Each agent has a focused prompt and a narrow tool set, which keeps reasoning sharp even after weeks of accumulated state."；系统提示词应通过运行时状态变量动态注入当前进度，而非依赖重放历史对话——这是对"父上下文不继承时需要什么信息"的具体回答（结构化状态而非对话重放）。

**结论**：Google 在窗口内**未检索到**专门更新的一手指南；Gemini CLI 子代理文档最近一次实质修改（2026-06-08）与 ADK 相关博客（2026-04/05）均落在窗口外，仅作背景。

---

### Cursor

**D1. Cursor 子代理官方文档**
- URL: https://cursor.com/docs/subagents
- 日期：**日期未核实**（无时间戳，为持续维护的现行文档）
- 类型：规范 + 建议
- 关键原文：
  1. "Long, rambling prompts dilute focus. Be specific and direct."
  2. "A 2,000-word prompt doesn't make a subagent smarter. It makes it slower and harder to maintain."
  3. "If you find yourself creating a subagent for a simple, single-purpose task like 'generate a changelog' or 'format imports,' consider using a skill instead."
- 立场：**明确主张"更短更好"**，且给出了具体反例门槛（2000 词），但**未提供对照实验数据**，属断言式建议，非测量。同时给出了"子代理 vs 技能"的划分标准：需要长任务的上下文隔离/并行工作流用子代理，简单单一任务用技能——这是按"是否需要上下文隔离"划分，接近 Anthropic A4 的"上下文边界"逻辑，而非按阶段。

**D2. Cursor Changelog（窗口内确认更新）**
- URL: https://cursor.com/changelog/08-19-26
- 核实日期：**2026-08-19**（窗口内）
- 内容："Subagents can now run on their own virtual machines. Each gets an isolated copy of the project with clean context in its own cloud environment."；新增"Custom Modes"（技能可固定为常驻模式）。
- 立场：确认 Cursor 在窗口内持续迭代子代�理/角色机制（上下文隔离、常驻技能模式），但该条目本身是功能公告，**未包含**提示词写作规范的新表态。
- 补充：Cursor 2.4（首次引入子代理与技能，quote "Subagents are independent agents specialized to handle discrete parts of a parent agent's task...configured with custom prompts, tool access, and models"）核实发布日期为 **2026-01-22**，窗口外，仅作为该产品线的背景起点。

---

### GitHub Copilot

**E1. About custom agents（GitHub 官方文档）**
- URL: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents
- Git 提交历史核实：最近提交 **2026-09-04**（"Add Copilot app to enterprise custom agent surfaces"，窗口内）；另有 **2026-07-09** 提交（"Update redirected internal links"，窗口内但为链接维护，非内容变更）；再前一次实质性改版为 2026-04-07（改名 coding-agent→cloud-agent）。
- 类型：规范文档
- 关键原文（现行文本）：Prompt 字段定义为"Custom instructions that define the agent's behavior and expertise"；文档未给出篇幅/结构建议，仅给出字段清单（Name/Prompt/Tools 等）。
- 立场：文档在窗口内确有提交（09-04、07-09），证明该文档处于活跃维护状态，但**两次窗口内提交的实际改动内容均非"提示词写作规范"相关**（分别是企业版界面接入、内部链接修复），因此本条目**不构成**窗口内关于"提示词该写什么"的实质性新指导，仅确认文档持续存在且现行有效。

---

### OpenCode

**F1. Agents 配置文档**
- URL: https://opencode.ai/docs/agents/
- 核实日期：页脚显示 **"Last updated: Sep 8, 2026"**（**窗口内，且是本次调研中日期核实最精确的一手来源之一**）
- 类型：规范文档
- 关键原文：
  1. "The `mode` option can be set to `primary`, `subagent`, or `all`."（primary = 用户直接对话的主代理；subagent = 主代理调用的专职代理；all = 两者皆可）
  2. "`tools` is **deprecated**. Prefer the agent's `permission` field for new configs, updates and more fine-grained control."
  3. 内置 `build` agent "全部工具开启"用于开发；内置 `plan` agent 默认对文件编辑/bash 设为 `ask`（受限）。
- 立场：**明确以"权限字段"而非"提示词约束"来实现工具边界**——直接回应核心问题"哪些边界不可省略"：工具边界应结构化声明（permission），不应仅靠提示词文字要求模型"不要做 X"。角色划分方式为**按写入权限/模式**（primary/subagent/all + 权限等级），而非按阶段或纯能力描述；`plan` vs `build` 两个内置代理的差异**只在权限配置，不在系统提示词本身**，这与 Anthropic A4 反对的"按阶段划分导致协调开销"形成有趣对照——OpenCode 的 plan/build 划分表面像"阶段"，但官方文档将其实现为"权限级别"而非"独立提示词叙事"，可视为对同一问题的不同技术解法。
- 未给出：篇幅/字数建议、"角色+范围+边界"式模板要求。

---

### Kimi Code CLI

**G1. Agents and Sub-Agents 文档**
- URL: https://github.com/MoonshotAI/kimi-cli/blob/main/docs/en/customization/agents.md
- Git 提交历史核实：最近一次修改为 **2026-05-09**（"refactor(windows): switch Shell backend from PowerShell to git-bash"，与内容无关的基础设施改动），**窗口内（07-09～09-09）无任何提交**。
- 结论：**窗口内未找到** Kimi Code 关于子代理提示词设计的一手更新。现行文档（窗口外内容，仅背景）描述三种内置子代理类型（coder/explore/plan，按能力+读写权限划分）及 `system_prompt_args` 参数化机制，但均属旧内容，不计入窗口内证据。

---

### Grok / xAI

**H1. Grok Build CLI 官方文档**
- URL: https://docs.x.ai/build/overview
- 日期：**日期未核实**（无时间戳）
- 内容：仅涵盖安装、交互/无头模式、API 配置，**不含**提示词写作规范或 AGENTS.md 使用指导。

**H2. Grok Bot（消费级"总是在线"代理）**
- 产品发布：**2026-08-11**（Beta，窗口内，据多篇三方报道交叉印证，但**未能通过 WebFetch 直接核实到 x.ai 官方一手页面**——`x.ai/news/grok-bot` 返回 404，官方一手公告页未定位成功）
- 三方转述称："Each agent's instructions are capped at 4,000 characters""xAI recommends focused Bots because a focused role gives the Bot more useful context over time""Give it a short name, one main job, and a clear description of how it should work."
- **核实状态：未核实为一手来源**。这些具体数字（4000 字符）和建议措辞均来自 uniflow.kr / basenor.com / blutrumpet.com 等三方博客的转述，未能定位到 xAI/Grok 官方页面的原始文字，因此**不采信为官方一手依据**，仅记录以提示后续可补充核实。
- 结论：xAI 在窗口内确有产品动作（Grok Bot beta），但**官方一手文档对"如何写子代理系统提示词"的具体规范未能核实**。

---

## 二、窗口内 vs 窗口外来源汇总表

| 厂商 | 窗口内一手来源（日期已核实） | 窗口内但日期未核实 | 仅窗口外背景 |
|---|---|---|---|
| Anthropic | claude.com/blog: Warp（08-26）、Commerce agents（09-02） | code.claude.com/docs/en/sub-agents（现行，日期未核实） | Zero Trust（05-27）、Harness design（03-24）、Managed Agents（04-08）、Multi-agent systems（01-23）、Effective harnesses（2025-11-26） |
| OpenAI | 无 | developers.openai.com 多智能体指南；Agents SDK instructions 文档 | Practical Guide PDF（2025-04）、Next evolution of Agents SDK（04-15） |
| Google | 无 | 无 | Gemini CLI subagents 博客（04-15）、docs 最近提交（06-08）、ADK 长时运行 agent 博客（05-12） |
| Cursor | changelog/08-19-26（功能公告，非提示词规范） | cursor.com/docs/subagents（含"2000 词"论断） | Cursor 2.4 公告（01-22） |
| GitHub Copilot | github/docs 仓库 09-04、07-09 两次提交（均非提示词规范内容） | — | 04-07 改版 |
| OpenCode | **opencode.ai/docs/agents/（页脚 Sep 8, 2026，内容含权限优先于提示词的明确规范）** | — | — |
| Kimi Code | 无（最近提交 05-09，窗口外） | — | 现行 agents.md 内容 |
| Grok/xAI | 产品发布 08-11（未核实一手文档页） | docs.x.ai/build/overview（无提示词规范内容） | — |

---

## 三、对核心问题的回答

1. **现代子代理提示词是否应以"角色定位+要完成的事+边界"为主？**
   窗口内证据总体支持"更精简、原则化"的方向，但**没有任何一手来源给出统一的强制模板**。最直接的支持来自 Anthropic 的 A2（"instruct a smart person, not program a computer"）和 A3（量化的"三分之一流量"门槛）；Cursor 的 D1（"2000 词"论断，日期未核实但内容与此方向一致）进一步加强"更短更聚焦"的立场。反例是 Anthropic A4（窗口外背景）中仍保留"strongly-worded instructions"（如"It is unacceptable to remove or edit tests"）这类硬性禁止句，说明官方实践并未完全放弃"明确的强约束式指令"，尤其在防止模型走捷径的场景。

2. **哪些旧式细节被官方建议删除/保留？**
   - **建议外置（删除出主提示词）**：低频程序性细节、穷举式规则（Anthropic A2 明确反对"exhaustive variable naming rules"，主张给原则和理由）。
   - **建议保留在提示词内**：高频（≥1/3 流量，Anthropic A3）功能所需指令；防走捷径的强约束句（A4 背景）。
   - **未见**任何一手来源提出"固定输出模板"或"先做 X 再做 Y 的机械步骤"应被普遍删除的明确禁令；仅 Anthropic A2 建议"给理由而非死板规则"这一间接主张。

3. **哪些上下文被认定为不可省略？**
   - **工具边界**：应结构化强制（OpenCode F1 明确弃用 `tools` 转向 `permission`；Anthropic A3"enforcement lives in code, not prompts alone"），不能仅靠提示词文字。
   - **安全边界**：高风险动作（如资金变动）必须走人工审批而非模型工具调用（A3）。
   - **父上下文不继承时需要的信息**：Claude Code 官方文档（A1）明确子代理不继承对话历史/已读文件/已调用技能，因此系统提示词是子代理唯一的"记忆"来源；Google ADK 背景资料（C3，窗口外）给出具体解法——用运行时状态变量动态注入当前进度，而非依赖对话重放。
   - **停止条件**：仅 Anthropic 背景资料（effective-harnesses，2025-11-26）给出具体例子（"only by changing the status of a passes field"），窗口内暂无更新的一手表述。

4. **官方是否声称"更短更好"？有无对照证据？**
   - Cursor（D1）与 Anthropic（A2、A3）均有方向性主张，但**均为经验断言，没有一家给出对照实验或量化 A/B 测试数据**。Anthropic A3 的"三分之一流量"门槛是目前找到的**唯一带具体数字的官方经验法则**，但其依据也是内部实践总结而非公开的对照测量。

5. **官方推荐的角色划分方式？**
   厂商之间**存在明确分歧**：
   - Anthropic（A4，窗口外但为目前唯一专门讨论"如何拆分多智能体角色"的一手文章）：**反对按阶段划分**（规划→实现→测试），主张按"上下文边界"（谁已经掌握必要信息）划分。
   - OpenCode（F1，窗口内、日期最明确）：built-in `plan`/`build` 两个代理**表面上按阶段区分**（先规划后开发），但官方实现方式是**按权限级别**区分，而非各自独立叙事的系统提示词——即"阶段"被折叠进"写入权限"这一维度。
   - GitHub Copilot（E1）与 Cursor（D1）均采用**按角色人设/专长**（specialist persona）划分，未明确按阶段或权限。
   - Kimi Code（G1，窗口外背景）内置三类子代理（coder/explore/plan）**同时体现能力划分与读写权限划分**（explore 只读，coder 读写）。

---

## 四、最强依据（≤5 条，均已核实一手来源与日期）

1. **Anthropic《A guide to the anatomy of effective commerce agents》（2026-09-02）**——目前窗口内唯一给出量化门槛的官方文章："Anything relevant to a third or more of your traffic goes in the system prompt, and the rest goes in skills."；并明确"安全边界应由代码强制，不能只靠提示词"。
2. **OpenCode 官方文档 `agents/`（页脚 Sep 8, 2026）**——`tools` 字段被正式标记为 deprecated，官方明确建议用结构化 `permission` 字段取代提示词式工具约束，是窗口内对"工具边界不可省略、且不应靠提示词实现"最直接的规范性证据。
3. **Anthropic《How Warp builds self-improving agents on Claude》（2026-08-26）**——"Construct the skill as though you're instructing a smart person, not like you're programming a computer"，是窗口内对"少写死板步骤、多给原则"最明确的官方措辞。
4. **Claude Code 官方子代理文档（现行，`code.claude.com/docs/en/sub-agents`）**——"Each subagent starts with a fresh, isolated context window. It doesn't see your conversation history..."，是关于"父上下文不继承"这一硬事实的权威来源（尽管具体修订日期未核实，但作为持续维护的官方规范文档，其内容现行有效）。
5. **Cursor 官方文档 `cursor.com/docs/subagents`（日期未核实，但内容现行）**——"A 2,000-word prompt doesn't make a subagent smarter. It makes it slower and harder to maintain."，是"更短更好"主张中表述最直接、最具体的一手断言。

---

## 五、厂商间分歧

- **角色划分轴心不同**：Anthropic 主张按上下文边界/能力划分、明确反对按阶段划分；OpenCode 事实上仍保留 plan/build 式的类阶段划分，只是把差异实现为权限级别而非独立提示词叙事；GitHub Copilot / Cursor 偏向按人设/专长（persona）划分；Kimi Code 三类内置子代理同时体现能力轴与读写权限轴。**没有任何两家厂商采用完全相同的划分逻辑**。
- **"更短更好"的证据强度不同**：Anthropic 给出可操作的量化门槛（三分之一流量），Cursor 给出更强烈但更模糊的断言（"2000 词"无出处说明如何得出），OpenAI/Google/GitHub Copilot/Kimi/Grok 的一手文档**均未在窗口内表态**。
- **工具/安全边界的实现哲学**：OpenCode 和 Anthropic 商业 agent 文章都明确"结构化强制優先于提示词约束"，这是本次调研中**跨厂商一致的少数共识之一**；但具体机制不同（OpenCode 用 `permission` 字段，Anthropic commerce agents 用"工具调用本身不允许执行高风险动作，需人工审批"）。

---

## 六、对 14 个工程角色划分方式的启示

（本节仅陈述调研发现，不代表本报告对仓库该如何划分角色做出价值判断——按 knowledge-lookup 职责，只报告事实供人类决策。）

- 当前 14 角色（planner、code-architect、implementer、tdd-guide、investigator、code-explorer、knowledge-lookup、doc-updater、code-reviewer、security-reviewer、adversarial-verifier、build-error-resolver、synthesizer、metric-optimizer）中，**planner→code-architect→implementer→tdd-guide→...→code-reviewer→adversarial-verifier 明显是按"阶段"排列**的。Anthropic 窗口外但唯一的专门文章（A4）明确警告"按阶段划分会带来协调开销"，主张改为"谁已掌握上下文，谁就完整负责该部分（含测试）"。窗口内没有新证据推翻或支持这一警告，但也没有厂商在窗口内给出反例证明"phase-based 划分"本身有问题——OpenCode 的 plan/build 两分实际上也是阶段性质，只是没有做成 14 个独立角色，而是 2 个权限级别。
- 工具边界/权限应结构化声明（不仅靠角色提示词里写"你不能做 X"）这一共识（OpenCode F1 + Anthropic A3），如果适用到本仓库，意味着 14 个角色之间的"能不能写文件""能不能执行命令"等边界更适合在角色的工具/权限配置层面强制，而不是仅依赖角色系统提示词的文字约束——这与仓库现有的按角色分配工具权限（如 code-reviewer 可能只读）的做法方向一致，属于对现状的支持性证据而非新发现。
- "三分之一流量"门槛（A3）提示：如果某个角色的指令只在少数场景触发，更适合作为可选参考材料（类似 Skill）而非常驻在角色主提示词中；这对 investigator/code-explorer/knowledge-lookup 这类低频、任务特化的角色可能有参考意义，但**该门槛本身来自电商 agent 场景的经验总结，未必能直接套用到工程角色场景**，属于弱证据。
- Kimi Code 的 explore（只读）vs coder（读写）二分，与仓库中 code-explorer（推测只读探索）vs implementer（读写实现）的划分逻辑相似，可作为"按读写权限划分角色"的一个独立厂商佐证。

---

## 七、未证实/待补充部分

- Grok/xAI 官方一手页面（非三方转述）关于"如何写自定义 agent 系统提示词"的具体规范**未能定位**；"4000 字符上限"等具体数字未经一手核实。
- Google Gemini CLI / ADK 在窗口内**没有**任何一手文档或博客的实质更新，本报告对 Google 立场的描述完全依赖窗口外背景资料。
- OpenAI 在窗口内**没有**检索到专门讨论子代理提示词写作的新一手资料；三方转述的"500 词"门槛未能溯源到 OpenAI 官方原文，不予采信。
- Anthropic 官方 Claude Code 子代理文档的具体修订历史（哪一天新增了"fresh isolated context"这句话）因 Wayback Machine 抓取工具受限，**未能逐字比对确认改动时间**，只能确认该文档在窗口内始终现行有效。
- GitHub Copilot 官方文档窗口内的两次提交均未涉及提示词写作规范内容，因此 GitHub 在窗口内对本报告核心问题**实质上没有一手表态**，仅确认文档处于活跃维护状态。
- 未对 Kimi Code、Grok CLI 之外更多"次要"厂商（如 Windsurf、Cline、Amazon Q Developer 等）做同等深度核实，因原始任务范围明确列出的厂商已覆盖完毕，未做超范围扩展。

---

## 主编排者核对更正（Fable，2026-09-09，WebFetch 原页复核）

1. **OpenCode `docs/agents/`（Last updated Sep 8, 2026）的推断收窄。** 原文只说 "`tools` is deprecated. Prefer the agent's `permission` field for new configs, updates and more fine-grained control."——这是**配置字段从 `tools` 迁往 `permission`**，原文没有说"提示词式工具约束应迁出提示词"。上文"F1 明确弃用 `tools` 转向 `permission`，是对'工具边界不应靠提示词实现'最直接的规范性证据"属过度推断，改为："配置层的工具边界字段从 `tools` 迁往更细粒度的 `permission`"。另外，文档示例中 plan/build **未给出各自 prompt**，只能证明它们的权限默认不同（plan 对 edit/bash 默认 `ask`），**不能证明**二者"只差权限不差 prompt"；上文相应句子按此读。
2. **"14 角色明显按阶段排列"的推断撤回。** 仓库的 14 角色是一个目录，其列出顺序不构成本地按阶段强制分发的证据；是否重叠要看实际交付与实际调用（本仓库的 Next 路由明文"每个 mission 单独判断派发"）。第六节第一条据此作废。
3. Anthropic 09-02 的"三分之一流量"是电商 agent 的经验法则，**不移植其阈值**，也不据此新增任何权限系统；只取其"低频内容不常驻主提示、安全不能只靠提示"两点方向。
