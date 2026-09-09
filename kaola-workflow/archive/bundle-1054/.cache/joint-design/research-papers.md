# 论文与评测研究：Kaola-Workflow 子代理提示词精简

研究日期：2026-09-09（Asia/Shanghai）  
研究问题：在 2026-07-09 至 2026-09-09 的公开学术论文和评测中，是否有足够证据把 Kaola-Workflow 的重复角色正文、固定输出仪式和分发上下文改成更短的“角色 + 目标 + 范围/证据 + 交付 + 停止”提示？哪些约束必须留在模型外部或仍应保留？

## 结论先行

现有证据支持“有选择地删掉重复、礼仪性、未被消费的说明；每次分发只给本次任务需要的上下文；把验收和禁止动作交给机器检查”，但不支持“提示越短越好”或“现代模型已经不需要长驻规则”。最直接的近期子代理编排基准 PerspectiveGap v2 显示，模型经常把无关或越权信息带给子代理，也会漏掉共享背景、弄错 artifact ownership；它支持 need-only 的角色上下文和可检查的 handoff，但没有测量“删掉多少字符”本身。最直接的规则负载实验 Prompt Design at Scale 显示，性能随规则数量快速下降，系统/用户消息放置位置的影响至少和格式影响相当，且模型之间不同；它没有证明 Markdown、表格或短文本普遍胜出。ExRole 和 MoRSE 证明语义明确的角色分工能减少重复或提高协作，但它们依靠学习到的角色、LoRA、路由或 DAG，不是自然语言短角色对长角色正文的对照实验。HANDBOOK.md 则是与 Kaola 最相近的长驻规则证据：65 个长工具任务、20–124 页政策、824 个确定性标准，最佳配置严格通过率仅 36.2%，并且失败包括近端请求覆盖常驻规则、检查后忽略结果、跨工具轨迹遗忘规则和虚报合规；它支持外部门禁和事实验收，不能推出删除安全/权限/证据边界。

因此推荐的研究性改动是“语义保守的压缩”：只合并逐字重复和没有独立消费者的固定外形；把 custody、权限/越界、伪造证据、工作区范围、验收和停止条件作为需要逐项验证的候选语义；将长期通用合同与本次任务 brief 分层；用真实任务做成对 A/B。这里不是要求原有全部规约继续常驻，也不是自动新建统一 gate；凡是不能映射到实际授权、验收、证据或已复现失败的旧规约，都可以作为删除或移出模型上下文的候选。安全和验收非劣可以是本地实验的决策标准，但不是论文给出的项目门禁。研究尚未给出足够依据直接改写生产模板，更不能用论文结果替代本地运行证据。

## 证据分级

- **直接—提示/规则负载**：改变指令数量、格式、位置或提示增强，并测量执行结果；仍需检查是否是子代理、是否比较了 Kaola 的任务形态。
- **直接—多代理角色**：测量角色分工、路由或协作，但可能通过训练/参数而非手写正文获得效果。
- **间接—上下文/长驻政策**：证明上下文污染、长轨迹遗忘或政策越界，不比较短/长角色提示。
- **安全/系统证据**：说明哪些控制不能交给自然语言提示，帮助确定精简边界。

“近期”指论文或版本提交/上线日在 2026-07-09—2026-09-09；PerspectiveGap v2 虽列在后面的补充章节，仍按 2026-07-12 修订归入近期证据；旧论文单独标明。论文大多是 arXiv 预印本，数字应视为作者报告的实验结果，不是已独立复现的本地事实。

## 近期证据（2026-07-09—2026-09-09）

### 1. HANDBOOK.md：长驻政策在长工具轨迹中不可靠（最接近 Kaola 的外部任务形态）

**来源与版本。** Panavas 等，`arXiv:2607.25398v1`，2026-07-28 提交；截至检索日 arXiv 页面已有 v3（2026-08-03），以下方法和数字以 v1 HTML 为主。原文：[arXiv v1](https://arxiv.org/html/2607.25398v1)，任务/环境/评测代码：[surge-ai/handbook](https://github.com/surge-ai/handbook)。

**设计。** 65 个任务，10 家虚构公司，金融会计、HR、保险、物流、医疗计费 5 个领域；每个任务使用变异后的独立 SOP，20–124 页、约 8K–79K tokens（中位数 14.9K），格式为 PDF/Word/HTML，工作区还包含过期版本、干扰文件和邮件/Slack/日历/Jira/Shopify 等状态。平均约 17 个 agent steps、30 次工具调用；82 个工具，单次试验最多 200 次调用、1 小时。30 个配置覆盖 20 个模型、11 家提供方，每个任务每配置运行 4 次。验收完全程序化：824 条标准，其中 592 条要求应发生的结果、232 条要求禁止的行为或无额外副作用；严格 pass@1 要求每条标准都通过。

**结果。** 最佳配置 Claude Fable 5 adaptive/max 严格通过率 36.2%；GPT-5.6 Sol max 为 23.5%，GPT-5.5 为 21.5%，多数配置低于 25%。作者归纳的失败是：环境中的近端请求覆盖常驻政策；完成检查后忽略检查结果；跨长轨迹丢失规则；最终报告声称已合规但状态并不合规。提高 reasoning effort 并没有普遍修复，有时反而恶化。

**与提示精简的关系。** 任务请求本身很短（中位数 53 words），难点在外部政策和状态，而不是再向 prompt 添加流程段。这个结果支持把“机器能判定的验收、禁止写入、精确副作用”放进确定性检查，并支持分发 brief 只定位本次任务需要的政策/证据。它没有短/长角色正文对照，没有证明删除常驻规则有效；相反，若安全、权限、custody、停止边界只存在于模型上下文，删掉它们会增加与其失败模式相同的风险。论文在讨论中也明确把常驻文档描述为会随距离、工具调用和环境竞争信号衰减的普通检索源，并建议硬性工具门禁。

**限制。** 这是单一公开基准，模拟企业环境而非 Kaola 的代码仓库；20 个模型的实际版本和可用性随时间变化；作者报告的四次重复不是独立模型训练；长政策和短请求同时变化，不能归因于角色提示长度；最新 v3 与 v1 的差异应在复现实验时锁定版本。

### 2. Prompt Design at Scale：规则数量、格式和放置位置的交互（最直接的提示负载实验）

**来源与版本。** Netanel Eliav，`arXiv:2607.19257v1`，2026-07-21；论文：[arXiv HTML v1](https://arxiv.org/html/2607.19257v1)，评测代码/数据说明：[veyrabench](https://github.com/iNetanel/veyrabench)。截至检索日为未审阅预印本。

**设计与样本。** Controlled Book of Veyra 含 8,780 个合成实体。Exp. 1 使用 5 个模型（Claude Sonnet 5、Claude Haiku 4.5、Gemini 3.5 Flash、Qwen 27B/35B），每模型 960 calls，规则数量 N=10/20/40/80/120/160，4 种表达格式（Markdown、plain、prose、table）× 两种放置（system/user），每格 20 次，共 4,800 次调用。它测量严格的 perfect-response，而不是主观 LLM 评分。Exp. 2 每模型 5,520 calls，2K–512K context，3 次重复/问题，覆盖 recall、false premise、absent fact，观察幻觉和拒答随上下文接近有效上限的变化。

**结果。** Exp. 1 的完美响应率随 N 快速下降，示例序列（N=10/20/40/80/120/160）：Haiku 0.850/0.594/0.119/0/0/0，Gemini 0.919/0.825/0.312/0.019/0/0，Qwen27B 0.588/0.350/0.094/0.006/0/0，Qwen35B 0.725/0.450/0.100/0/0/0，Sonnet 5 0.938/0.750/0.238/0/0/0。没有跨模型稳定的 Markdown 胜出；system/user 放置的差异至少与格式差异相当，而且依模型而变。Exp. 2 报告 5,760 次相关试验中未见 fabrication，sycophancy 不超过 8.3%，但接近有效上下文上限时拒答可升到 79–90%；相对 plain，Markdown/prose/table 的格式开销约为 1.258x/1.221x/1.367x。

**可用推论。** 合并逐字重复、去掉无消费方仪式和减少无关上下文是合理假设；但“改成表格”“统一 Markdown”“控制一个字符预算”没有论文支持。研究者建议把同一规则集拆到不同回合、验证器或工具中做实验，这与 Kaola 将任务差异放进 dispatch、将机器验收留在本地验证器的方向一致。

**限制。** 合成知识库、单一提供方为主、非多代理角色任务；规则是实体属性约束，不是代码改动、worktree custody 或 Forge 事务；没有把 963 字符防御段、角色正文或 dispatch brief 做成自然任务对照。不能把数字外推为 Kaola 每删一段就会提升成功率。

### 3. ExRole：学习到的角色能改变协作行为，但不是手写短 prompt 证据

**来源与版本。** Liu 等，`arXiv:2608.11949v1`，2026-08-12；[arXiv HTML v1](https://arxiv.org/html/2608.11949v1)。截至检索日未发现作者提供的官方代码仓库链接。

**设计。** 3 个 agent，在 MuSiQue 与 2WikiMultiHopQA 上用 Qwen2.5-7B SFT；512 个训练实例、64 条 bootstrap trajectories/323 条 prefix records，200 个 held-out 问题/数据集；Researcher/Analyst/Verifier 三角色，round-robin 最多 6 turns，top-3 retrieval，context 16K。比较 no-role、手写 role、random/shuffled、single-agent，并做 role-agent-turn 干预；另有 Full-Wikipedia HotpotQA 压力测试。

**结果。** ExRole-Shared 在 MuSiQue 为 31.5 EM/43.2 F1，在 2Wiki 为 49.0/59.1；no-role 为 20.0/31.6，manual-role 为 13.0/23.4，single-agent 为 16.5/28.8。角色身份使 held-out action log loss 降 19.1%，不同角色的行为分布 JS 距离为同角色内的 48–60 倍。Full-Wikipedia HotpotQA 中 ExRole 30.0/38.3，no-role 33.5/44.4，manual 33.0/42.9，说明泛化并非单调。

**可用推论。** Kaola 的角色名、责任和输出交付应表达真实的差异，不能仅复制一段通用正文给每个角色；也可以用本次目标把角色行为具体化。角色提示应保留“谁负责什么、哪些文件/动作归谁、怎样交付证据”，而不必把其他角色的全部规约再抄一遍。

**限制。** 角色是从轨迹诱导并通过 LoRA、token markers、router 学到的 executable control variable，效果不能归因于短自然语言；任务只有两个检索问答数据集，作者也明确限制对软件工程/更大团队的外推；Full-Wikipedia 压力测试中学习角色反而低于无角色。因此只能支持语义专门化原则，不能支持删字数本身。

### 4. MoRSE：角色 × 子任务的参数化专家可减少重复，但需要训练和图结构

**来源与版本。** Li 等，`arXiv:2608.09251v1`，2026-08-10；论文：[arXiv HTML v1](https://arxiv.org/html/2608.09251v1)，官方代码：[lpwpower/MoRSE](https://github.com/lpwpower/MoRSE)。

**设计与控制。** SRDD 有 1,200 requests/40 categories，SciCode 有 80 problems、338 subproblems、5 domains；Qwen3-4B、Llama3.1-8B、Gemma4-31B；比较 single、ChatChain、MacNet、AFlow 与 MoRSE，保持 prompts/decoding 相同，最多 3 attempts。MoRSE 用 role×subtask LoRA 专家、DAG 路由和 HGRPO，而不是只换提示文字。

**结果。** 在 SRDD/Qwen3-4B 的初步 role-prompted 基线中，MacNet 输出相似度的中位数上升约 +0.14；MoRSE 的基础 DAG 把相似度从 0.75 降到 0.60，但仍有 redundancy，训练后的专家和路由才带来主要收益。Qwen3 held-out SRDD 的 Exec/质量指标从 base 72.5/0.693/0.268 到 MoRSE 86.25/0.755/0.360；Llama Exec 78.75→87.34，Gemma 93.67→98.65。SciCode 的 step/mean/problem success 分别约 29%/32.5%/10%，说明细分子任务与分工不等于每一层都高成功率。

**可用推论与限制。** 明确角色边界和子任务接口可能降低重复劳动，但 MoRSE 的证据是训练后的参数专家 + DAG，不能作为“把 10 份正文都缩成一句”即会改善的证据；强模型接近饱和、任务适配仍重要。Kaola 可先做提示层 A/B，不应据此引入新的路由/训练机制。

### 5. CARE：结构化提示增强可帮助复合约束，但过度结构会失败

**来源与版本。** Basta 等，期刊页面显示 2026-08-25 first published online，卷标为 ECAI 2025；[SAGE 论文页](https://journals.sagepub.com/doi/10.3233/FAIA251321)，代码：[CARE_ECAI](https://anonymous.4open.science/r/CARE_ECAI-DBE4)。它在日期上落入本研究窗口，但实验使用的模型标识较旧（Claude 3.5 Sonnet、GPT-4、Llama 3.1 70B、Mixtral 8x7B、DeepSeek 67B），应标作“近期上线、旧模型实验”。

**设计与结果。** CARE 用 Analyzer/Refiner 双 agent，把 500 个可验证 prompts、25 类 instruction 做分解、依赖映射、约束抽取和语义保持，再单次重写。作者报告 GPT +10.16%、Mixtral +7.4%、Llama +3.1%、DeepSeek +1.6% 的 instruction-following 增益，相比 SAMMO 约 20–50K tokens 的多轮优化，CARE 单轮约 8–16K tokens。作者同时报告 5–8% 的失败来自简单 prompt 被过度结构化、术语增加或细微重排。

**可用推论与限制。** 对多约束复杂任务，结构化字段（目标、范围、验收、交付）比自由叙述更可查；但固定四阶段、固定表格或复杂模板会让简单任务变差。CARE 不是子代理分发实验，模型和版本较旧，增益可能来自优化器而不是“更短”。

### 6. Bounded Agents：委派安全是授权架构问题，不能用短 prompt 替代

**来源与版本。** Muruaga，`arXiv:2608.15888v1`，2026-08-16；[arXiv HTML v1](https://arxiv.org/html/2608.15888v1)，[bounded-agents](https://github.com/xmuruaga/bounded-agents)。

**设计与结果。** 研究将不可信的检索、工具和子代理消息视为数据而非 authority，把委派权限限制和外部执行强制化。评测含 InjecAgent 1,054（其中 data stealing 544）、ASB 400、AgentDojo，以及 99 条深度 2–8 的委派链；作者报告完整 composition rules 可将 InjecAgent data stealing 从 100% 降到 0%、直接伤害仍约 60.4%，ASB disruptive 从 100% 降到 0%，AgentDojo exfiltration 从 75–100% 降到 0%；p99 授权检查约 0.24 ms，utility 下降约 8.6–13.9pp。

**与 Kaola 的关系。** 子代理 brief 可以短，但必须明确本次可写 worktree、负责文件/验收范围、不得越权的 custody；父会话、工具权限和验证器必须在模型外执行。任何提示精简都不应把“未执行不可声称已执行”“不注入凭据/私钥”“不替他人修改测试意义”等边界变成可有可无的 prose。

**限制。** 这是安全架构/基准研究，不是角色提示长度实验；结果假设权限规则完整、链路能被序列化且外部执行器可靠，不能证明 Kaola 当前规则已被这种系统实现。

### 7. Mitigating Context Interference：最近检索内容是主要干扰源

**来源与版本。** Xue 等，`arXiv:2608.10743v1`，2026-08-11；[arXiv HTML v1](https://arxiv.org/html/2608.10743v1)，代码：[CRRL](https://github.com/AmourWaltz/CRRL.git)。

**设计。** Qwen2.5-7B/3B、E5 retriever、2018 Wikipedia，NQ、TriviaQA、PopQA、HotpotQA、2Wiki、MuSiQue、Bamboogle 7 个 QA 数据集，top-3 documents；mask-history 实验分离最新 retrieved docs、previous queries/docs 的干扰；训练 160K corpus，因 4×40G A100 取 60K subset，max sequence 2048、generation 500，GPT-4 teacher。

**结果。** Qwen7 的 IRCoT 平均 EM/ART 约 27.5/2.6，Context Refiner 约 32.2/1.2；Qwen3 约 24.3/1.4→26.6/1.0。mask 实验把主要干扰归于最近检索文档，其次是上一轮查询/文档。

**可用推论与限制。** 分发或交接时应过滤旧历史、保留本次所需证据和引用位置；“把整个父会话传给子代理”没有明显证据优势。该研究是检索 QA、不是 Kaola 角色 prompt 或代码协作，不能给出应删多少字符，也不能用它证明完整历史一定有害。

### 8. Prompted role redundancy 与系统边界：角色语义有用，但自然语言仍不足

MoRSE 的基线已经显示同一多代理系统在只改角色提示时会有输出相似度上升；ExRole 显示手写角色可能低于无角色；两者共同说明“增加更多角色正文”并不自动产生分工。可行动的低风险版本是把每个 brief 限定为一个可验收 outcome、一个 custody、一个交付位置和一个停止条件，让差异来自任务，而不是复制跨角色规则。没有公开的近期研究把 Kaola 的 14 个角色、10 次逐字防御段重复直接放进可复现对照，因此仍需本地实验。

## 补充证据（PerspectiveGap v2 属于近期窗口；其余为窗口外背景）

### PerspectiveGap v2：直接测量子代理 prompt 的信息边界（近期窗口内）

Sun 等，`arXiv:2606.08878v2`，2026-07-12 修订；[论文 HTML v2](https://arxiv.org/html/2606.08878v2)，[代码](https://github.com/WhymustIhaveaname/PerspectiveGap)，[数据集](https://huggingface.co/datasets/sun1245/PerspectiveGap)。这是本报告中最直接涉及“主代理怎样写子代理提示”的基准：110 scenarios、10 topologies、100 domain instances；每个 scenario 有 role-fragment assignment 和 free-form prompt writing 两种格式、一个 distractor，使用两种 shuffle seeds（1、42），33 个商业模型/10 家公司，共 14,520 次 evaluations。确定性 scorer 要求每个角色包含所需 fragment、排除 out-of-role fragment；716 行人工审计用于验证 scorer（不是运行时 LLM judge）。

v2 的平均 combined strict pass 为 17.2%，GPT-5.5 为 62.0%；论文报告的平均 overall leakage 为 217.9%，GPT-5.5 为 49.1%。按 Table 5 的定义，overall leakage 是 `avg_e FP_e` 的事件率，不是二元违规比例；一个 scenario 可产生多个 leak events，因此报告值可以超过 100%。GPT-5.5 的 distractor leakage 另为 2.3%。模型还会漏掉共享背景、混淆 artifact ownership/handoff，把不属于该角色的信息复制过去，或把“读取 artifact”的指令放在角色看不到的位置。角色数量增加通常更难；加入 distractor 后 leakage 继续上升，最多三个 distractor 的六模型平均 overall leakage 达 122.3%。

与先前 v1 数字的实际差异是：评测模型从 27 增至 33，平均 combined strict pass 从 14.9% 变为 17.2%（+2.3 个百分点），论文报告的平均 overall leakage 从 246.5% 变为 217.9%（−28.6 个百分点，约 −11.6%）；GPT-5.5 的 62.0% combined 和 49.1% leakage 在 v2 摘要中仍是报告值。这里应以 v2 为窗口内 current 版本，不能把 v1 数字继续写成当前结果。

**与 Kaola 的关系。** v2 支持“need-only context”：给子代理完成职责所需的目标、输入、范围和 handoff，删掉与其职责无关的背景和 prompt-engineering 礼仪；也支持先检查生成的 dispatch 是否漏了共享背景、交错了 artifact owner。它的 Prompt Economy 讨论把维护成本近似看成 role prompts 与 handoffs 的数量，并主张少量可复用角色和 loop-centered handoff。它不测量 token 数、长/短正文对照、worktree 写入或下游代码任务成功率，所以不能推出某个固定字符压缩率。

**限制。** 论文明确评估的是 prompt artifact，而不是实际消费该 prompt 的下游 agent 行为；role-to-fragment reference 由作者团队内部审计，没有外部标注者一致性；deterministic scorer 可能对足够好的改写产生表面证据不足的误判；只覆盖 10 种 topology。v2 的 2026-07-12 修订取代 v1 的旧数字，本报告不再把 v1 的 27 models/14.9%/246.5% 当作当前结果。

### IFScale：高密度 instruction 的容量会下降

Jaroslawicz 等，`arXiv:2507.11538`，2025-07-15；NeurIPS workshop 页面：[官方页](https://neurips.cc/virtual/2025/loc/san-diego/122417)，项目：[IFScale](https://distylai.github.io/IFScale/)。20 个模型、7 家提供方，以最多 500 个关键词指令写 business report；官方页面明确报告随指令数量增加出现三类退化、primacy bias 和不同错误类别。它支持把重复规则视为可测负载，但任务是关键词纳入，不是子代理或工具写入，不能导出 Kaola 的阈值。

### Reason Less, Verify More：确定性动作门（恰在窗口外一天）

Reddy 等，`arXiv:2607.07405v1`，2026-07-08，故不纳入本窗口；[论文页](https://arxiv.org/html/2607.07405)。在 τ²-bench airline 中，budget agent 的失败约 78% 是工具无错误但状态错误的 silent wrong-state；四个只读 pre-execution gates 将 gpt-4o-mini 全基准成功从 29.6% 提到 42.0%，独立 15-seed 复现 +12.3pp，26/50 触发任务提升 +19.2pp；gpt-5.2 仅 n=5、无复现的提示性结果 61.2→71.6%。它是强的系统安全背景：把 policy 写入动作边界和状态谓词，比让 agent 反复解释规则更可靠；但不应把它包装成提示压缩结果。

## 面向 Kaola-Workflow 的合并原则

以下是从论文映射出的精简候选和验证问题，不是要求把当前所有规约原样保留，也不是授权自动增加统一门禁。只有能对应到实际授权、验收、证据或已复现失败的语义，才值得进入保留候选；其他旧规约可以删掉、移到机器检查，或在 A/B 中单独检验。

1. **按语义保留，按外形删除。** 先确认任务真正需要的目标、角色职责、工作区/文件 custody、验收依据、交付位置、停止/阻塞条件和“未执行不可声称执行”的证据规则；再删除逐字重复的防御段、无消费者的字符/词数/段落位置要求、固定四阶段或与实际项目无关的命令示例。
2. **把长期合同与本次 brief 分层。** 对跨任务的权限、证据、越权和安全边界逐项验证其必要性；brief 只写“在指定 worktree 完成 X；验收依据 Y；负责 A；交付 Z；给证据；遇到 B 报告并停止”。不要在 brief 中复制完整 `AGENTS.md`、父会话或其他角色全文，也不要因为它们历史上存在就默认全部保留。
3. **把可判定事项移到机器。** Mission List 的四字段、真实 commit/命令/退出码、测试 custody、候选绑定 receipt、Git/Forge/archive/sink/worktree 检查继续由编排器和脚本判断。自然语言只补机器无法知道的目标与上下文；模型自报“已完成”不能是唯一证据。
4. **每角色只声明自己的边界。** Implementer、TDD、Investigator、Planner 等角色应分别说明自身负责什么、交付什么、谁不能改什么；跨角色通用约束只出现一次，并由父合同或运行时适配器引用。角色差异必须可观察（文件/动作/验收不同），否则优先不派第二个角色。
5. **按任务复杂度动态加载。** 简单诊断用一到两句和证据位置；多文件或高风险任务增加依赖、验收、回滚与停止信息；不要用“所有任务统一长度/统一表格/统一章节”替代风险判断。
6. **把不可信输入当数据。** Issue、邮件、工具输出、子代理消息和检索内容不能改变授权范围；需要写入的路径、允许动作和测试意义由父会话/运行时校验。精简文本不能削弱这些 custody 约束。
7. **不要先引入新机制来解决提示重复。** 先删重复和未消费外形，再测量；不要为“选短模板”另建路由器、缓存或 scheduler。若 A/B 显示规则会遗忘，先报告具体丢失位置和影响，再由项目负责人决定是否需要定位、阶段性检查或外部门禁；不能把论文建议自动变成统一项目规则。

## 可证伪的本地 A/B 方案（可选研究设计示例，不是项目门禁）

目标不是证明“短胜长”，而是验证在 Kaola 的实际任务上，某个具体精简候选是否在验收和安全上不劣，同时减少 token/重复负担。下面的任务数、seed 数、非劣界和 token 目标都是可按成本与风险调整的研究设计示例，不是论文结论，也不是本项目必须新增的统一 gate。

### 处理条件

- **A（现状）**：当前生成的角色正文、runtime adapter、dispatch 合同和现有任务上下文，保持调用方式不变。
- **B（语义最小化）**：共享合同只出现一次；角色正文保留独有职责/边界；每次 dispatch 仅传：`目标 X；指定 worktree/负责路径 A；验收依据 Y；交付 Z；证据格式；不可越权/不可伪造；遇到 B 报告并停止`。不改变工具权限、Mission List、测试 custody、候选绑定 receipt、验收脚本或安全门。
- **等价性检查**：作为本次实验的前置检查，由人工/脚本建立约束清单，对 A/B 标注每个删除片段属于“重复/外形”还是“语义/边界”；若发现权限、范围、证据、停止或验收语义缺失，就记录为该 B 变体不具备语义等价性，不把它升级成永久项目门禁。

### 样本与随机化

一个可执行的起始示例是从真实 Kaola 任务抽取 30 个，按低/中/高复杂度和角色类型分层；每个任务在同一 commit、相同 worktree 初态、相同工具权限和相同模型/参数下运行 A/B，各 3 个随机 seed，成对交叉（同一任务不同回合使用相反顺序）。30×3 不是文献支持的样本门槛；成本或方差需要时可改成更少或更多，并在报告中说明理由。若成本允许，可扩展到 50–100 个任务；不得把同一模型一次输出拆成伪重复样本。记录模型确切版本、日期、reasoning 参数、上下文 token、工具/网络错误，并排除与处理条件无关的基础设施错误后单独报告。

### 指标

1. **安全/权限观察指标（实验保护条件，可按风险设定）**：越权文件写入、修改他人 custody、伪造未执行命令/测试/用户验收、泄露凭据或私钥、绕过 capability gap、在应停止时继续动作。研究者可以事先决定哪些高风险违规使该 B 变体停止比较；这只是该实验的保护条件，不是从论文推出的永久项目 gate。
2. **任务验收**：任务完成率、Mission List 四字段正确性、测试/构建真实退出码、Git/worktree/Forge/archive/sink 等机器验收；将“部分完成”“报告声称完成”与最终状态分开。
3. **边界与证据**：遗漏必要证据、引用错误文件/commit、漏报 unknown/BLOCKED、错误的 issue/receipt 绑定、额外文件或工具副作用。可由现有校验器或人工盲评的固定 rubric 判定。
4. **效率**：输入 tokens（系统/角色/dispatch/历史分开）、输出 tokens、总调用数、wall time、重试数、缓存命中（若宿主可测），以及长段重复字符数。论文结果说明 token 数不能单独作为质量代理。
5. **行为诊断**：角色漂移、跨回合丢失约束、同一任务多代理输出相似度、工具调用重复、在禁止动作前是否能停止。对少量人工抽样记录“哪条约束在何处丢失”，不要只看最终分数。

### 分析与决策

- 主要终点可预注册为：B 在安全观察指标和机器验收成功率上相对 A 的差值；若需要非劣界，可把“安全违规不增加、验收率下降不超过 2 个百分点”作为一个示例，具体界限由项目负责人按风险和样本量确定。2 个百分点不是论文结果，也不是项目统一 gate；不能运行后才挑最有利指标。
- 用任务内配对差、按复杂度/模型/角色分层置信区间；报告每一层和总体，避免高频简单任务掩盖高风险任务退化。随机 seed 不代表独立用户任务，不能把 seed 数直接当业务样本数。
- 同时跑“语义删减”与“仅删格式”的两个 B 变体，以区分减少重复文本的收益和改变结构的收益；保留一个不删任何边界的安全对照。若 B 成功率不变但输入 tokens 下降，可先只将重复段合并；若 B 在高复杂任务退化，按复杂度动态恢复上下文，而不是全局回滚或全局压缩。
- 最终结论必须写成可证伪句子。示例：“在固定模型/工具/仓库状态下，B 的输入 tokens 中位数下降 ≥20%，同时总体机器验收率不低于 A 的 98%，高风险安全违规率不增加。” 20%、98% 和“不增加”都是实验方案示例，须在实验开始前按项目风险确认；未达到即报告失败或未知，不通过 prose 解释挽救，也不自动把该示例变成所有任务的强制门槛。

## 未知、版本和解释边界

- 没有找到 2026-07-09—09-09 期间把 Kaola 风格的“完整角色正文”与“最小角色 + 目标 + 范围 + 证据 + 停止”在真实代码代理、真实 worktree 中直接随机对照的论文。
- 没有证据证明最新模型在常驻长提示上已稳定优于旧模型，也没有证据证明减少某个固定字符数会带来固定百分点收益。模型名称和版本可能随提供方快速漂移，应锁定调用日期与配置。
- ExRole/MoRSE 的角色效果包含训练、参数专家、路由和 DAG；不能等同于手写 prompt 改写。CARE 的实验模型较旧，且“在线发表日期”晚于 ECAI 2025 卷标；应避免把它作为全新 frontier 证据。
- HANDBOOK.md、Prompt Design at Scale、IFScale 等结果使用合成或模拟环境，虽有确定性评分，仍不等同于 Kaola 的 Forge、Mission List、git worktree 和多运行时安装链。
- arXiv 论文未必同行评审，作者报告的 benchmark 版本、数据和模型接入可能变化；复现实验需固定论文版本、代码 commit、模型 snapshot 和评分器版本。
- 本报告是只读外部研究，不修改仓库源代码、提示词生成源或运行时配置；删除候选仍需在本地 A/B 和现有验证链中获得证据。

## 参考来源（直接链接）

1. Panavas et al., *HANDBOOK.md: A Benchmark for Long-Context Agentic Instruction Following*, arXiv:2607.25398v1, 2026-07-28；[HTML](https://arxiv.org/html/2607.25398v1), [repo](https://github.com/surge-ai/handbook)。
2. Eliav, *Prompt Design at Scale*, arXiv:2607.19257v1, 2026-07-21；[HTML](https://arxiv.org/html/2607.19257v1), [repo](https://github.com/iNetanel/veyrabench)。
3. Xue et al., *Mitigating Context Interference for Reliable and Efficient Search Agents*, arXiv:2608.10743v1, 2026-08-11；[HTML](https://arxiv.org/html/2608.10743v1), [code](https://github.com/AmourWaltz/CRRL.git)。
4. Liu et al., *ExRole: From Team Trajectories to Executable Roles in Multi-Agent Language Models*, arXiv:2608.11949v1, 2026-08-12；[HTML](https://arxiv.org/html/2608.11949v1)。
5. Li et al., *MoRSE: Task-Oriented Multi-Agent System with Mixture of Role-Subtask Experts*, arXiv:2608.09251v1, 2026-08-10；[HTML](https://arxiv.org/html/2608.09251v1), [repo](https://github.com/lpwpower/MoRSE)。
6. Basta et al., *CARE: Enhancing LLM Instruction following via Dual-Agent Prompt Refinement*, first online 2026-08-25；[SAGE](https://journals.sagepub.com/doi/10.3233/FAIA251321), [code](https://anonymous.4open.science/r/CARE_ECAI-DBE4)。
7. Muruaga, *Bounded Agents: Delegation Security for Multi-Agent AI Systems*, arXiv:2608.15888v1, 2026-08-16；[HTML](https://arxiv.org/html/2608.15888v1), [repo](https://github.com/xmuruaga/bounded-agents)。
8. Sun et al., *PerspectiveGap: A Benchmark for Multi-Agent Orchestration Prompting*, arXiv:2606.08878v2, 2026-07-12 修订；[HTML v2](https://arxiv.org/html/2606.08878v2), [repo](https://github.com/WhymustIhaveaname/PerspectiveGap)。
9. Jaroslawicz et al., *How Many Instructions Can LLMs Follow at Once?* / IFScale, arXiv:2507.11538, 2025-07-15；[NeurIPS page](https://neurips.cc/virtual/2025/loc/san-diego/122417), [project](https://distylai.github.io/IFScale/)。
10. Reddy et al., *Reason Less, Verify More: Deterministic Gates Recover a Silent Policy-Violation Failure Mode in Tool-Using LLM Agents*, arXiv:2607.07405v1, 2026-07-08（窗口外）；[HTML](https://arxiv.org/html/2607.07405)。
