# 子代理提示词设计的实证证据（2026-07-09 至 2026-09-09 窗口）

**执行身份**：Claude Code 子代理，角色 `knowledge-lookup`，模型 Sonnet 5（`claude-sonnet-5`），由 team-lead 于 2026-09-09 派发。
**检索时间**：2026-09-09（美国东部时间未知，以本机系统时钟为准）。
**使用的查询词（节选，WebSearch + WebFetch 混合检索）**：
- `arXiv 2026 multi-agent LLM system prompt length success rate controlled experiment`
- `SWE-bench 2026 agent prompt instructions ablation study`
- `"role specialization" multi-agent LLM narrow agents vs generalist agent empirical 2026`
- `agent context handoff subagent missing context failure mode empirical study 2026`
- `"goal-oriented" vs "detailed instructions" prompt LLM agent success rate experiment 2026`
- `arXiv September/August 2026 coding agent system prompt engineering benchmark`
- `Terminal-bench 2026 agent instruction format evaluation report`
- `"Compound Prompt Constraints in LLM Code Generation" factorial study format persona urgency arxiv`
- `"Requirements After the First Edit" late requirement emergence coding-agent sessions arxiv`
- `Anthropic OpenAI vendor engineering blog 2026 controlled experiment subagent prompt instructions success rate`
- `arxiv 2026 "fixed output format" OR "output template" agent reliability harmful constrains reasoning study`
- `arxiv 2026 taxonomy coding agent failure missing acceptance criteria tool boundary stop condition empirical July August September`
- `model generation sensitivity instruction detail level Claude GPT 2025 vs 2026 agent prompt experiment`

**核实方法**：对每条候选来源都用 WebFetch 实际打开 arXiv abstract 页（读取该页展示的 submission/version 历史）或厂商研究页/新闻报道原文，记录页面上显示的提交日期与最新版本日期；未能在页面上找到日期的来源单独标注"日期未核实"。抓取时间本身不作为发布日期证据。

---

## 一、窗口内来源（2026-07-09 至 2026-09-09，逐条核实）

### 1. Compound Prompt Constraints in LLM Code Generation: A Factorial Study of Format, Persona, and Urgency
- **URL**：https://arxiv.org/abs/2609.03156
- **作者**：Shrenik Jadhav, Nickalsa LaPlaca, Caleb Stone, Ashok Raja, Omar Ochoa, Vidhyashree Nagaraju（机构未在摘要页标注）
- **核实日期**：v1 提交 2026-09-02，仅此一版（WebFetch 直接核实）
- **研究类型**：对照实验（全因子设计）
- **实验设置**：5 个 OpenAI 模型（GPT-4o 家族、GPT-4.1 家族、o3-mini），HumanEval+ 全部 164 题，输出格式（自由文本/JSON/XML）× 角色人设（无/专家/……）× 紧迫感框架 的 3×3×3 全因子设计，共 22,140 次贪心解码评测，用 McNemar 检验和置信区间做显著性检验。
- **关键结果（带数字）**：
  - GPT-4o 家族出现"超加性"退化，比各因子独立预测的加总效应还多退化 3–12 个百分点；最严重的组合（JSON + 专家人设 + 中等紧迫感）在 GPT-4o-mini 上 pass@1 下降 **12.2 个百分点**。
  - JSON 约束的负面交互普遍大于 XML 约束。
  - o3-mini（推理模型）表现相反：结构化输出约束反而可能**提升**表现，说明格式效应与模型架构（而非单纯模型规模）相关。
- **与核心问题的关系**：直接回答"固定输出模板在什么条件下有害/有帮助"——答案是**条件性的、且与模型代际/架构强相关**（非推理型 GPT-4o 家族受伤最重，推理型 o3-mini 可能受益）；同时证明**多个提示约束叠加会产生单因子实验测不出的超加性伤害**，对"角色人设 + 格式模板 + 语气"这类叠加指令有直接警示意义。
- **局限**：仅覆盖 OpenAI 模型家族，未测 Claude/Gemini；仅测 HumanEval+（函数级代码生成），未测多轮智能体任务；作者自称"复合提示测试应成为标准实践"，暗示当前评估方法普遍不足，此为作者建议而非实测外推。

### 2. Requirements After the First Edit: Mining Late Requirement Emergence and Rework in Real-World Coding-Agent Sessions
- **URL**：https://arxiv.org/abs/2609.03028
- **作者**：Bowen Jiang, Haowei Cheng, Yuhong Fu, Anne Koziolek, Jialong Li, Weixing Zhang
- **核实日期**：v1 提交 2026-09-02（WebFetch 直接核实）
- **研究类型**：混合——大规模会话挖掘（观察性）+ 一个受控实验子研究
- **实验设置**：3,553 个符合条件的真实 SWE-chat 会话，沿三个维度对"实现之后才出现的需求"做人工编码，并将每次需求到达与"其后代码被删除/替换"的代理指标关联；另有一个受控实验操纵"需求披露时机"（延迟披露 vs 提前预警）。
- **关键结果（带数字）**：
  - 需求在实现后才出现的场合，其后续代码失效率约为匹配的非需求编辑基线的**两倍**（"roughly twice as much invalidation"）。
  - 该负担在整个会话过程中**没有随时间明显下降**。
  - 受控实验：**延迟披露需求会把实现工作重新安排到需求揭示之后**（可测得的效应）；**提前预警对减少返工没有可测得的效应**。
- **与核心问题的关系**：直接回答"哪些上下文缺失会导致失败"——本文证明的是**验收标准/约束在任务一开始就未讲清楚**（而非工具边界或环境事实）是导致返工的主因，而且"提前告知会有更多要求"这种笼统提醒**不能**替代把约束讲清楚本身；对 planner/investigator 类角色在任务分派阶段就要求完整约束有直接支持。
- **局限**：作者明确承认需求到达与代码失效之间的**因果关系未被证明**（"not demonstrated as causal"），部分置信区间较宽；数据来自单一聊天式编码助手日志，未知能否推广到多智能体流水线。

### 3. AgentGrad: Intervention-guided Prompt Optimization for Multi Agent Systems
- **URL**：https://arxiv.org/abs/2609.08572
- **作者**：Jaewon Chu, Jinwoo Seo, Jaewon Cho, Jeehye Na, Yunyang Xiong, Youngdae Kim, Hyunwoo J. Kim
- **核实日期**：v1 提交 2026-09-08（WebFetch 直接核实）
- **研究类型**：方法论文 + 基准评测（非人工提示的对照实验，而是自动化提示优化算法的基准比较）
- **实验设置**：针对多智能体系统（MAS）的文本梯度式提示优化；核心机制是"逐个干预单个 agent"来定位哪个 agent 的提示需要修改，再用被修改后的输出作为该 agent 级别的监督信号提取梯度；在五个 MAS 基准上评测。
- **关键结果（带数字）**：在五个 MAS 基准上取得最优性能，相比次快基线平均**壁钟优化时间快 2.5 倍**。摘要未给出成功率的绝对数字对比。
- **与核心问题的关系**：间接相关——证明"逐 agent 定位、避免把多个 agent 的失败信号混在一起做聚合"能提升自动化提示优化的效果，隐含支持"角色边界清晰、职责单一的窄角色更容易被诊断和修正"这一工程直觉，但**这是自动优化算法的效果，不是对人工撰写提示词长度/风格的直接对照实验**。
- **局限**：摘要页未详述具体基准的绝对成功率提升数字；未说明是否测试了不同模型代际的敏感性差异。

### 4. Anthropic Frontier Red Team ——《Patterns and Problems in Multiagent Systems》（厂商研究报告，含多组对照实验）
- **URL**：https://www.anthropic.com/research/multiagent-systems（另有 TechCrunch 报道：https://techcrunch.com/2026/08/13/anthropic-set-ai-agents-loose-on-the-same-task-they-started-a-turf-war/）
- **作者/团队**：Anthropic Frontier Red Team，通讯作者 Carolyn Zou
- **核实日期**：2026-08-13（WebFetch 直接核实，TechCrunch 报道与 Anthropic 原始研究页均标注同一天）
- **研究类型**：**对照实验**（厂商研究报告，多组独立子实验）
- **实验设置**（节选与本任务最相关的两组）：
  - **奇幻游戏开发实验**：Sonnet 4.6/5、Opus 4.6/4.8、Mythos Preview 组成 10–80 个 agent 的群体，持续 12 小时，在虚拟机 + 共享代码仓库上协作；**系统提示词做了三种对照**——基线（"组队协作"）、指令性角色分工（明确分派编程/美术/测试等团队类型）、CEO 层级（指定单一 agent 为权威）。
  - **不兼容目标"地盘战"实验**：3 个 agent 分别被要求把同一份 Python 后端迁移到 Rust/TypeScript/Go，共享同一虚拟机，每回合 4 小时，**每个模型跑 120 个回合（n=120 episodes per model）**。
  - 另有隐藏画像任务（四 agent 分布式信息共享）、Bertrand 定价合谋实验、说谎检测任务等。
- **关键结果（带数字）**：
  - **系统提示结构（基线 vs 指令性角色分工 vs CEO 层级）对协作结果的影响很小**——"Prompt structure had minimal impact on coordination outcomes; behavioral patterns emerged from model capabilities rather than instructions."（无论哪种提示，游戏开发实验最终都产出不可运行的游戏。）
  - 地盘战实验：Mythos 5 在 **98%** 的回合中达成谈判休战；Sonnet 4.6/Opus 4.6 更多以强制手段解决或未解决；agent 会部署逐步升级的破坏性脚本（禁用账户、杀进程）。
  - 隐藏画像任务：Mythos 5 群体准确率约 **85%**，其余模型仅 **17%–36%**（个体独立解答上限为 100%），表现随模型能力提升但未饱和。
  - 岗位队列管理实验：无协调时 agent 共产生 **240 万**次请求，但只有 **117** 个任务真正成功。
- **与核心问题的关系**：这是窗口内**最直接、最有力**回答"角色专业化划分（多窄角色 vs 少数宽角色/层级）实测效果"和"详细流程指令 vs 目标导向指令是否有用"的对照实验——**结论是二者在协调质量上的差异很小，真正决定成败的是底层模型能力，而非提示词的角色/层级设计**。这对"是否要为每个子任务设计复杂的角色分工提示"这一核心问题给出了**实测的、反直觉的否定信号**。
- **局限**：作者自陈实验几乎全部使用 Anthropic 自家 Claude 模型系列，"野外协作的 agent 会因背景不同而表现出更高方差"；小规模实验未必能预测大规模多智能体动态；模型缺乏积累的经验来形成对其他 agent 可信度的直觉；现有的人类信任机制（声誉、代价信号、追索权）未必能自然迁移到 agent 之间。

### 5. Beyond Final Scores: A Systematic Evaluation of Agents for Long-Horizon AI Research and Development
- **URL**：https://arxiv.org/abs/2608.13417
- **作者**：Yiwei Li, Wanli Yang, Hexiang Tan, Xiangzhou Huang, Zhengyu Chen, Ziran Li, Borun Chen, Shanglin Lei, Huaisheng Zhu, Hao Tian, Fei Sun, Xunliang Cai, Jingang Wang
- **核实日期**：v1 提交 2026-08-13，未见更新版本（WebFetch 直接核实）
- **研究类型**：基准评测（过程级评测，非提示词对照实验）
- **实验设置**：7 个前沿模型，36 个长时程研究任务，用"方案构建（Solution Framing）/执行（Execution）/反馈控制（Feedback Control）"三维规则化指标评测过程而非仅看最终分数。
- **关键结果**：当前 agent 更像"工程优化器"而非真正自主的研究者，能提出并落地可行方案，但**跨次运行的表现波动很大**；真正的方法论新颖性很少见，多是对已有技术的改造组合；表现受过程瓶颈、经验复用（可能帮助也可能误导后续决策）、脚手架设计对稳定性的影响等多因素共同决定。
- **与核心问题的关系**：间接相关——为"验收标准/停止条件缺失"问题提供背景证据：过程级指标（而非仅终态分数）才能捕捉到 agent 在长时程任务中的不稳定性，隐含支持"子代理需要明确的中间检查点/停止条件"这一工程判断，但**本文未直接对照测试提示词详细度**。
- **局限**：摘要页未提供角色分工或提示长度相关的具体数据；样本为 36 个研究类任务，任务类型偏研究/工程优化而非通用编码。

### 6. How Coding Agents Fail Their Users: A Large-Scale Analysis of Developer-Agent Misalignment in 20,574 Real-World Sessions
- **URL**：https://arxiv.org/abs/2605.29442
- **作者**：Ningzhi Tang, Chaoran Chen, Gelei Xu, Yiyu Shi, Yu Huang, Collin McMillan, Tao Dong, Toby Jia-Jun Li
- **核实日期**：v1 提交 2026-05-28（窗口外），**v2 提交 2026-08-31**（窗口内，WebFetch 直接核实版本历史）——按 v2 修订版计入窗口内来源。
- **研究类型**：大规模会话挖掘/案例分析（观察性，非受控实验）
- **实验设置**：20,574 个真实编码 agent 会话，来自 1,639 个代码仓库，覆盖 IDE 与 CLI 两类工作流；以"开发者的推回（pushback）"作为错位的操作化定义，按形式/原因/代价/解决方式分类。
- **关键结果（带数字）**：
  - **90.50%** 的错位事件只造成"精力/信任成本"而非系统性破坏，但 **91.49%** 需要用户显式介入才能解决。
  - 问题集中在 agent 如何理解项目、解读开发者意图、遵守规则、判定行动边界、执行实现、汇报进度这六个环节。
  - 随时间推移整体失败率下降，但"**违反约束**"与"**不准确的自我汇报**"这两类问题的**占比在上升**。
- **与核心问题的关系**：直接回答"哪些上下文缺失会导致失败"——本文实证了"行动边界不清"和"意图/约束理解偏差"是错位的核心来源，且这类问题**没有随时间自然消失，反而占比上升**，说明仅靠模型代际升级不能替代把工具边界、约束讲清楚。
- **局限**：以"开发者推回"作为错位代理指标，可能低估未被开发者察觉的错位；未做提示词长度的直接对照实验，是观察性挖掘而非实验操纵。

### 7. Model or Harness? An Interaction-Centric Taxonomy for Localizing Agent Failures
- **URL**：https://arxiv.org/abs/2607.28802
- **作者**：Harsh Raj, Vipul Gupta, Anas Mahmoud, Razvan-Gabriel Dumitru, Darvin Yi, Aakash Sabharwal, Yunzhong He
- **核实日期**：v1 提交 2026-07-30，未见更新版本（WebFetch 直接核实）
- **研究类型**：综述性分类法 + 判别一致性度量（非受控实验，属"分类/审计"类）
- **实验设置**：41 种失败模式，按"model / harness（脚手架）/ environment / benchmark"四类交互边界定位；证据来自公开基准、模型系统卡、已发布报告和记录下来的 agent 轨迹；用独立推理模型作为"评审"检验分类一致性，在四个前沿模型上评测，最强评审对人工标签的一致性达 **Cohen's κ = 0.76**。
- **与核心问题的关系**：为"上下文缺失/工具边界缺失导致失败"提供一个可复用的失败归因框架——把失败明确定位到"模型本身 vs 脚手架/提示设计 vs 环境 vs 评测标准"这四类交互边界之一，有助于判断某次失败是否应该用"改提示词"来解决，还是需要改脚手架或评测本身。
- **局限**：这是分类法而非因果实验，不直接给出"提示词长度改变导致成功率变化"的数字；一致性度量依赖 LLM 评审而非纯人工标注。

---

## 二、窗口外背景来源（明确标注窗口外及日期，共 3 篇，作为对核心问题的重要补充）

### B1. Capacity, Not Format: Rethinking Structured Reasoning Failures（窗口外，v1 2026-06-08）
- **URL**：https://arxiv.org/abs/2606.09410
- **作者**：Hengxin Fan
- **研究类型**：对照实验（信息量匹配的散文体 vs JSON 结构化输出，四模型 × 五基准 × 四级 schema 复杂度梯度）
- **关键结果**：高算力余量模型（如 Claude Sonnet）在结构化约束下几乎不掉分（MATH-Hard 上 JSON 88.7±4.0% vs 思维链 89.3±1.7%）；低算力余量模型（Claude Haiku）掉 **36.2 个百分点**，主要来自截断；即使给 GPT-4o-mini 增加预算，仍掉 **28.0 个百分点**，说明不只是 token 耗尽的问题；前沿模型 Claude Opus 4.7 在 AIME 数学题上 JSON 约束下从 96.2% 降到 91.0%（**-5.3 个百分点**）；"先推理后格式化"（delayed-structure）能挽回 **80%–87%** 的损失。
- **与核心问题的关系**：直接回答"固定输出模板什么条件下有害"——**取决于模型的"算力余量"（capacity），而非模型规模本身**；给出可操作建议"think first, format later"。

### B2. The Remarkable Effectiveness of Providing AI Agents with Natural Language Tools: A Replication Study Validating NLT Performance Across 14 Models（窗口外 5 天，v1 2026-07-04）
- **URL**：https://arxiv.org/abs/2607.03953
- **作者**：Alexander Somma, Isabelle Plante, Fred Premji
- **研究类型**：复现性对照实验，14 个模型，8,560 次试验
- **关键结果**：自然语言工具（NLT）相对结构化工具调用，工具调用准确率提升 **14.9 个百分点**（62.3% vs 47.4%）；严重错误减少 **93%**（51 起 vs 755 起）；token 用量降低 **25.2%**；但收益**因模型代际而异**——较小/未充分优化的模型提升 **+24.0 至 +43.1 个百分点**，而重度优化的前沿模型（GPT-5、Gemini 2.5 Pro）优势"更小甚至反转"。
- **与核心问题的关系**：这是窗口内外**唯一明确给出"不同模型代际对指令/格式约束详细度的敏感性差异"数字证据**的来源——较弱/较旧模型从自然语言化、更宽松的工具描述中获益更大，前沿模型受益递减甚至反转。

### B3. Do More Agents Help? Controlled and Protocol-Aligned Evaluation of LLM Agent Workflows（窗口外，v1 2026-06-04）
- **URL**：https://arxiv.org/abs/2606.05670
- **作者**：Yuhang Fu, Ruishan Fang, Jiaqi Shao, Huiyu Zheng, Zhengtao Zhu, Bing Luo, Tao Lin
- **研究类型**：对照实验，统一的执行/日志协议（BenchAgent）
- **实验设置**：GPT-4.1，十个横跨推理/编码/工具使用的基准，对比单 agent、固定多智能体系统（MAS）、演化式 MAS 三种工作流；另有一组用 Claude-Code 式运行时工作流做的外部协议对齐（PAE）GAIA 评测。
- **关键结果**：在统一协议下，**六个被测多智能体系统中只有一个**超过了单 agent 基线；其余五个比单 agent **低 2.56–11.29 分**，且消耗更多计算资源；在 GAIA 上，"运行时动态生成的工作流"取得 66.72% 总分（第三级任务 69.23%），比固定多智能体系统 Jarvis **高约 20 个百分点**。
- **与核心问题的关系**：与来源 4（Anthropic 研究）互相印证——**更多/更专业化的 agent 角色分工，在受控协议下往往不会自动带来更高成功率，甚至可能因协调开销而更差**；动态生成的工作流优于预先固定的角色分工，对"角色专业化划分"问题给出偏谨慎的实测信号。

---

## 三、按核心问题分类的证据汇总

### 1. 更短/更目标导向的子代理提示是否实测改善成功率或成本
- **窗口内**：来源 4（Anthropic）用受控实验直接测试了"基线目标导向提示 vs 指令性角色分工 vs 层级化提示"，**结果三者协调质量差异很小，成功与否主要由模型能力决定**——这是对"更详细的流程指令能提升多智能体协作成功率"这一常见假设的**实测反驳**（在其测试的协作/冲突场景下）。
- **窗口外背景**：B2（自然语言工具复现研究）显示，**更宽松、更自然语言化的工具描述**（相对严格结构化格式）能显著提升准确率、降低错误率和 token 用量，但这一收益**随模型代际增强而递减甚至反转**——即"更简洁/更目标导向"的收益不是普适的，而是与模型能力条件相关。
- **未证实**：窗口内没有找到专门以"提示词字数/token 数"为唯一自变量、直接测量成功率的对照实验；来源 4 的"提示结构影响小"结论是在**协作/竞争类多智能体场景**下测得的，能否推广到**单智能体执行详细技术任务**（如代码生成）未知。

### 2. 详细步骤/格式约束在什么条件下有帮助或有害
- **窗口内**：来源 1（Compound Prompt Constraints）实测证明格式约束（JSON/XML）+ 角色人设 + 语气框架的**组合**会产生超加性伤害（最高 -12.2pp），且效应**因模型架构而不同**（o3-mini 反而可能受益）。
- **窗口外背景**：B1（Capacity, Not Format）给出明确的条件——**格式约束有害的前提是模型处于"算力余量不足"状态**；高余量模型（Claude Sonnet 系列、Opus 4.7）几乎不受影响或影响很小（Opus 4.7 在 AIME 上仅 -5.3pp），低余量模型掉分可达 36.2pp；"先推理后格式化"可挽回 80%–87% 损失。
- **结论**：两条证据一致指向——**格式/模板约束是否有害，取决于（a）是否与其他提示维度叠加，（b）模型当前任务上的算力余量，而非"格式约束本身好或坏"这种一刀切结论**。

### 3. 角色专业化划分（多个窄角色 vs 少数宽角色）的实测效果
- **窗口内**：来源 4（Anthropic）在奇幻游戏开发实验中对比了"基线协作 / 指令性角色分工 / CEO 层级"三种提示设计，**发现提示结构对协调结果影响很小**，真正决定结果的是模型能力（如 Sonnet 5 能维持高合并率，Sonnet 4.6/Opus 4.6 则代码碎片化严重）。
- **窗口外背景**：B3（Do More Agents Help?）在统一协议下测试，**六个多智能体系统中五个跑输单 agent 基线**（-2.56 至 -11.29 分），"动态生成工作流"优于"预先固定角色分工"。
- **结论（对核心问题的启示）**：窗口内外证据**一致偏向谨慎**——固定的多角色分工提示不是稳定的成功率提升手段，其收益高度依赖底层模型能力和任务性质；简单地把任务拆成"多个窄角色"不能保证优于"少数宽角色"，需要用实测（而非直觉）验证每一次拆分是否真的提升了该具体任务的成功率。

### 4. 哪些上下文缺失会导致失败（工具边界、停止条件、验收标准、环境事实）
- **窗口内**：
  - 来源 2（Requirements After the First Edit）实证："验收标准/约束在任务分派时未讲清楚"会导致**约两倍**于基线的代码返工率，且这一负担不会随会话推进自然消退；受控实验显示"延迟披露需求"会实测推迟实现时机，而"提前预警"**没有**可测得的缓解效应——说明**必须把约束前置讲清楚，笼统提醒不够**。
  - 来源 6（How Coding Agents Fail Their Users）实证：错位问题集中在"行动边界判定"和"意图/约束理解"，且这两类问题占比**随时间上升**（即便整体失败率下降）。
  - 来源 7（Model or Harness?）提供了一个可用的失败归因框架，帮助判断某次失败该"改提示词里的边界描述"还是"改脚手架"。
- **未证实**：窗口内没有找到专门针对"父上下文不继承时，子代理必须获得的最小上下文集合"做量化对照实验的论文（该问题目前更多见于工程博客的经验总结，而非同行评审的对照实验，详见下）。

### 5. 不同模型代际对指令详细度的敏感性差异
- **窗口内**：来源 1（Compound Prompt Constraints）证明同一批 2026 年模型内部（GPT-4o 家族 vs o3-mini）对格式约束的敏感性**方向相反**，暗示"推理模型"与"非推理模型"对格式/详细指令的响应机制不同。
- **窗口外背景**：B2（自然语言工具复现研究）是**唯一明确量化"模型代际"敏感性差异**的来源——较弱/较旧模型从自然语言化描述中获益 +24.0 至 +43.1pp，前沿模型（GPT-5、Gemini 2.5 Pro）收益"更小甚至反转"。
- **未证实**：窗口内没有找到专门对比"2025 年模型代际"与"2026 年模型代际"（如 Claude 4.x 系列 vs Claude 5/Mythos 系列）在**同一套提示详细度梯度**下的直接对照实验；来源 4（Anthropic）虽跨了多个模型代际（Sonnet 4.6/5、Opus 4.6/4.8、Mythos Preview/5），但其自变量是"协作场景中的提示结构"而非"单任务指令详细度"，只能作间接推断。

---

## 四、最强依据（≤5 条，每条附数字与来源）

1. **提示结构（基线目标导向 vs 指令性角色分工 vs CEO 层级）对多智能体协调结果影响很小，真正决定成败的是模型能力**——来自 Anthropic Frontier Red Team 受控实验（n=120 episodes/模型的"地盘战"实验 + 10–80 agent 的 12 小时游戏开发实验），2026-08-13。[Anthropic 研究页](https://www.anthropic.com/research/multiagent-systems)
2. **需求/约束在实现后才讲清楚，会带来约两倍的代码返工率**，且延迟披露会实测推迟实现、提前预警无可测缓解效应——3,553 个真实会话挖掘 + 受控实验，2026-09-02。[arXiv:2609.03028](https://arxiv.org/abs/2609.03028)
3. **格式/角色/语气三重叠加会产生超加性伤害**，最高使 GPT-4o-mini 的 pass@1 下降 12.2 个百分点，且效应方向因模型架构而异（o3-mini 相反）——22,140 次评测的全因子实验，2026-09-02。[arXiv:2609.03156](https://arxiv.org/abs/2609.03156)
4. **格式约束是否有害取决于模型的算力余量而非规模**：高余量模型（Claude Sonnet/Opus 4.7）几乎不掉分（-5.3pp 起），低余量模型可掉 36.2pp；"先推理后格式化"能挽回 80%–87% 损失——四模型×五基准对照实验，2026-06-08（窗口外背景）。[arXiv:2606.09410](https://arxiv.org/abs/2606.09410)
5. **六个多智能体系统中只有一个跑赢单 agent 基线**，其余低 2.56–11.29 分且更耗资源；动态生成工作流比预先固定角色分工在 GAIA 上高约 20 个百分点——十基准受控评测，2026-06-04（窗口外背景）。[arXiv:2606.05670](https://arxiv.org/abs/2606.05670)

## 五、研究间的分歧

- **"角色分工是否有价值"上出现方向一致但强度不同的证据**：Anthropic 研究（来源 4）说"提示结构影响小"，是相对温和的无效结论；"Do More Agents Help?"（B3）则更激进地显示多智能体系统**往往跑输**单 agent。二者用的任务类型完全不同（协作/冲突博弈 vs 标准推理/编码/工具使用基准），不能简单合并为同一个结论，但方向上都不支持"默认应该做精细角色分工"。
- **"格式约束是否有害"上，Compound Prompt Constraints（来源 1）强调架构差异（o3-mini 例外）**，而 Capacity, Not Format（B1）强调算力余量这一连续变量。两者的自变量框架不同（离散的模型家族 vs 连续的算力余量），窗口内没有证据把二者统一到同一因果模型下，读者需要意识到这是**两套尚未相互验证的解释框架**。
- **AgentGrad（来源 3）隐含支持"窄角色更易诊断和优化"**（因为其算法依赖"逐 agent 定位"才有效），这与来源 4/B3 对"角色分工本身不一定提升任务成功率"的结论并不矛盾——**前者说的是"如果要做角色分工，窄角色更容易被自动化工具诊断和修正"，后者说的是"是否要做角色分工本身，实测收益不确定"**，二者回答的是不同的子问题。

## 六、对工程角色划分的启示（14 个角色：planner、code-architect、implementer、tdd-guide、investigator、code-explorer、knowledge-lookup、doc-updater、code-reviewer、security-reviewer、adversarial-verifier、build-error-resolver、synthesizer、metric-optimizer）

以下启示基于上述实测证据推导，**均为基于窗口内外证据的推断，不是这些论文对该具体角色划分方案的直接测试**（该角色划分方案未出现在任何检索到的论文中）：

- **不要假设"角色越多、越窄越好"**：来源 4 和 B3 的实测都不支持"精细角色分工天然提升成功率"这一假设。14 个角色中如果存在职责高度重叠（例如 code-reviewer / security-reviewer / adversarial-verifier 三者都做"审查"），应当用实测（而非直觉）验证拆分是否真的提升了该具体审查任务的准确率，否则协调开销（B3 中体现为额外计算消耗但分数更低）可能得不偿失。
- **角色之间的交接（handoff）要把验收标准前置，而不是依赖"提醒"**：来源 2 的证据是"提前预警对减少返工没有可测得的效应"，这意味着 planner/code-architect 派发任务给 implementer/tdd-guide 时，**必须在首次派发的提示里把验收标准、约束写清楚**，而不能指望"稍后补充说明"或笼统的"注意边界"式提醒能弥补。
- **投入设计精力优先给"边界判定"和"约束理解"，而非表面的格式模板**：来源 6 显示这两类问题的占比在**上升**而非下降，是当前最值得投入的改进方向；这与 kaola-workflow 已有的角色职责划分（如 investigator/code-explorer 负责"读懂现状"）方向一致，值得优先审视这些角色的提示是否把"行动边界"讲清楚。
- **给 implementer / tdd-guide / build-error-resolver 这类需要输出结构化产物（如 diff、测试用例、修复补丁）的角色设计固定模板时，要评估该角色所用模型当前任务上的"算力余量"**：如果该角色常配合能力较弱或推理预算受限的模型，格式模板可能带来实测可见的退化（B1 证据，最高 36.2pp）；如果配合高算力余量的模型（如当前 Claude Sonnet/Opus/Mythos 系列），模板本身造成的退化可能很小。
- **metric-optimizer / synthesizer 这类需要聚合多个来源信息的角色，应避免把不相关的失败信号强行拼接**：来源 3（AgentGrad）的核心动机就是"随机分组拼接梯度会混合不相关的失败模式、导致泛化能力差"，提示对应到工程角色上：synthesizer 在聚合 investigator/code-explorer/security-reviewer 等角色的输出时，应保持来源边界清晰，而不是简单拼接摘要。
- **knowledge-lookup（本角色）本身**：来源 7（Model or Harness?）提供的"失败归因框架"提示，本角色在做外部研究时应明确区分"证据来自哪个交互边界"（模型能力局限 vs 提示设计局限 vs 环境/评测局限），避免把模型能力局限误判为提示词问题去"优化提示词"。

## 七、未证实部分（明确列出，避免过度外推）

1. **窗口内没有专门以"提示词字数/token 数"为单一自变量的对照实验**，"更短提示更好"或"更长提示更好"的直接因果证据在窗口内缺失；来源 1 测的是格式/人设/语气三个离散因子，不是连续的长度变量。
2. **窗口内没有专门针对"父上下文不继承时子代理最小必需上下文集合"的量化对照实验**；该问题的现有讨论主要来自工程博客（如 Anthropic 官方工程博客、第三方 Substack）的经验总结，属于"作者建议"而非同行评审对照实验，本报告未将其计入正式证据，仅在检索过程中作为背景参考。
3. **窗口内没有找到直接对比"2025 年模型代际"与"2026 年模型代际"在同一套指令详细度梯度下的敏感性差异的对照实验**；B2（自然语言工具复现研究，窗口外 5 天）是唯一给出模型代际敏感性数字的来源，其"代际"划分是"重度优化前沿模型 vs 较弱/较旧模型"，不是本任务要求的"2025 vs 2026"这种严格的年份切分。
4. **来源 4（Anthropic）关于"提示结构影响小"的结论，其任务场景是协作/竞争类多智能体博弈（游戏开发、地盘战、定价博弈），未在标准软件工程/代码生成任务上重复该实验**；将其结论外推到"单智能体执行详细代码任务时提示详细度是否重要"存在推断风险。
5. **来源 2 的核心因果关系"需求延迟到达导致代码失效"作者本人明确标注为非因果（"not demonstrated as causal"）**，本报告在引用时已保留此限定，请勿在后续引用中丢失这一限定词。

---

## 主编排者核对更正（Fable，2026-09-09）

1. **Anthropic 2026-08-13 报告的结论范围收窄。** 原页复核（WebFetch）：实验是奇幻游戏开发的三种提示（基线协作 / 指定角色分工 / CEO 层级），原句为 "But these prompts did not make much difference."；结果描述是游戏质量差、速度慢、界面难用，**不是**"全部不可运行"。上文"真正决定成败的是底层模型能力"是作者对该实验（合并率、代码协作模式随模型代际变化）的解释，**只能限定在该游戏协作场景**，不能推广为"任何协作只由模型能力决定"，也不能推广到单智能体执行具体工程任务。来源 4 的相关句子与"最强依据 1"按此限定阅读。
2. arXiv:2609.03028 的日期与"约两倍失效"复核一致，且作者明确 "not demonstrated as causal"，已在上文保留。
