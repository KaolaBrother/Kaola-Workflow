# Workflow 冗余清理与子代理重设计：共同方案

2026-09-09。Codex 与 Fable 5.1 联合核对；Codex 使用3个 `gpt-5.6-luna / max` 子代理，Fable 使用3个 Sonnet 子代理，分别完成官方指南、论文实验、开源实践研究。双方先各自成稿，再交换结论、核对一手来源与本地消费者。研究重点为2026-07-09至2026-09-09。

最终方案纳入 [Issue #1054](https://github.com/KaolaBrother/Kaola-Workflow/issues/1054)，沿用已有claim与工作树；不拆成一串后续Issue。完整的31项处置、源码落点、实施依赖与验收见[最终Issue正文](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/issue-1054-proposal.md)。这是研究与设计成果，扩大范围后的实现及行为效果尚未验证。

## 共同决定

角色提示从职责重写，主要告诉模型它负责什么、应完成什么。删除固定流程、通用命令处方、大型输出模板、无依据数字、重复规约和旧模型时期的催促。每次分发再给当前任务需要的目标、材料与协作位置；方法由模型选择。没有统一字数、字段或压缩率要求。

保留14个调用入口，按不同交付划清职责。角色目录不是必经流水线；有两个角色不等于要分发两份同构任务。研究没有证明合并或增加角色数本身能改善本项目。

| 角色 | 定位与要完成的事情 |
|---|---|
| code-explorer | 解释指定代码的实现、调用关系与依赖。 |
| investigator | 通过执行、复现和测量回答事实问题。 |
| knowledge-lookup | 查找本地代码无法建立的外部事实，给出出处。 |
| planner | 将目标、优先关系和依赖组织为工作安排。 |
| code-architect | 设计组件、接口、数据流及技术取舍。 |
| tdd-guide | 编写能区分正确与错误行为的验收测试，给出基线证据。 |
| implementer | 完成指定产品行为或代码改动，交付实现与验证结果。 |
| build-error-resolver | 解决确认的构建、类型、导入或依赖故障。 |
| doc-updater | 让文档准确反映改动后的行为与用法。 |
| code-reviewer | 独立找出改动引入的实质缺陷。 |
| security-reviewer | 检查指定功能的信任边界与可利用风险。 |
| adversarial-verifier | 挑战一条主张，交付反证尝试与局限。 |
| metric-optimizer | 改进指定指标，交付可比较的前后测量及改动。 |
| synthesizer | 按各方意图解决真实内容冲突，整合结果。 |

角色正文的权威源仍为 `templates/agents/behavior-contracts.json`。各forge/runtime产物继续生成。宿主权限、真实能力差异和项目事实使用已有有效载体；先核对子代理实际继承，再删重复加载。缺失的任务信息按需要提供，不把整本旧手册搬进新的共享段。

子代理自然报告结果与依据。审查报告中的结论格式不再强制列零、最低词数或固定结尾；本地实际生产消费者读取的是最终验证记录。最终验证的PASS与候选绑定必须来自实际执行，不能由审查PASS推出。

## 本地核对改变了哪些判断

1. **gap格式门与统计确有错误。** 等价表格可被拒绝或漏读为成功全零；子串匹配不能证明正确处置。backlog delta因同一Issue重复写几行或改成散文而变化。因此删除这些语义代理判断及手工重复登记链，不补一个更大的解析器。
2. **文档证据有真实消费者。** 初扫将重复cache主要视为提示负担；Fable找到closure-audit和归档sidecar依赖。收敛证据时必须同步消费者。
3. **reviewer格式协议不是最终验证格式。** 双方沿生产调用核实 `.cache/final-validation.md` 的消费位置，撤回保留每个reviewer机器字段的早期意见。
4. **80条断言只是重复候选。** 全部在本Issue完成判断；用反向变异或相应覆盖证据证明可删项，保留不同消费者或语义覆盖的项。不因数量为80就删除80条。
5. **人工多源事实与必要生成副本分开处理。** 同一角色集合、tier等事实收敛权威来源；各运行时生成产物和有独立用途的校验仍然需要。
6. **角色合并不凭名称相似。** Fable撤回初稿中偏向合并planner/architect及explorer/investigator的意见；双方按工作安排/软件设计、静态追踪/运行调查等不同交付定案。

全部31项都在最终正文中给出处理。包括gap与backlog、文档回执、Finalize倒写、子代理提示、恢复重复加载、校验外形耦合、模型常量多源、200行notice和prose比例判据。重复复跑与任务说明冗余属于编排选择，不为它们新增缓存或框架。

## 近期依据与适用边界

| 一手来源 | 日期与状态 | 对本方案的支持及限制 |
|---|---|---|
| [LangChain deepagents #4859](https://github.com/langchain-ai/deepagents/pull/4859) 与 [#4979](https://github.com/langchain-ai/deepagents/pull/4979) | 7月22日、23日合并 | 维护者删掉与工具schema重复的提示，保留不可推导的skills/memory/path事实。正文未公开可复核的token节省数字，不能承诺Kaola收益。 |
| [Anthropic / Warp](https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude) | 8月26日，工程案例 | 建议用原则和理由指导模型，材料按需读取；属于经验，不是提示长度对照。 |
| [Anthropic多代理研究](https://www.anthropic.com/research/multiagent-systems) | 8月13日，实验研究 | 协作任务的耦合和独立交付性很重要；游戏实验三种提示差别不大，不能外推成所有提示都无影响。 |
| [Prompt Design at Scale](https://arxiv.org/abs/2607.19257) | 7月21日，预印本 | 规则数量、位置与格式共同影响遵循；没有统一格式优势，不移植实验阈值。 |
| [PerspectiveGap v2](https://arxiv.org/abs/2606.08878v2) | 初版6月，7月12日修订 | 直接研究对子代理的信息分配；不证明某个角色数或brief模板最佳。 |
| [HANDBOOK.md v3](https://arxiv.org/abs/2607.25398v3) | 7月提交，8月修订 | 长轨迹仍可能遗忘或误用规则；不是短长提示A/B，不能用规则堆叠保证可靠性。 |
| [ExRole](https://arxiv.org/abs/2608.11949) / [MoRSE](https://arxiv.org/abs/2608.09251) | 8月12日 / 10日，预印本 | 角色应产生真实分工；效果包含训练与路由机制，不照搬这些机制。 |
| [Claude当前提示指南](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) | 当前官方页，发布日期未显示 | 支持清理针对旧模型的过度催促、过度验证指令；模型特定建议，不记成窗口内新实验。 |

另核对了9月2日的[commerce agents指南](https://claude.com/blog/the-anatomy-of-effective-commerce-agents)：其关于常驻提示与技能的频率建议来自电商经验，本方案不采用该数字阈值，也不因此新增权限系统。2025年的[context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)仅作为较早背景。

研究没有证明所有任务只给一个角色名字就足够，也没有要求保留旧手册。共同采用职责优先、任务信息按需提供、实际交付验证的方案。

## 交叉核对后的研究纠正

- deepagents报告中的具体token下降和正确率数字未在PR正文、文件及可访问实验链接得到支撑，已降为未核实；不进入Issue的效果承诺。
- #4979删除旧常量顶层导出，内部模块仍有弃用兼容；不能写成顶层仍可正常导入。
- Anthropic游戏结果被收窄为该实验范围；撤回“所有游戏不可运行”及“只有模型能力决定协作”的外推。
- OpenCode `tools` 到 `permission` 是配置字段迁移；它不能证明提示约束被迁走，也不能证明plan/build只差权限。
- 14个角色按某个顺序列在表中，不能作为本地14阶段强制流水线的证据。
- 日期未知的现行文档、窗口外背景、未合并提案与问题报告分别标注。子代理报告中的提议不会自动变成需求；主编排综合与最终Issue处置优先。

## 实施与验收

对接已有Mission List去计数和按内容保护记录的候选成果，接着退役gap/backlog重复机制，重写角色与分发说明，同步恢复和文档消费者，完成重复校验判断及人工多源事实收敛。文档、生成面、聚焦测试、完整候选绑定链与walkthrough一起验收。

在可用原生宿主以固定任务和原始验收比较旧/新提示，观察实际交付、误路由、缺证据、无谓停止或复跑，以及宿主暴露的成本。角色、adapter和任务说明分别记录实际加载；未知数据保持未知，不把字符下降等同token节省。安装内容与对应生成产物分别核对；安装、headless探针和真实原生行为属于不同证据。

当前扩大范围后的实现没有开始。Fable此前完成的候选保留在 `workflow/bundle-1054` 的 `6ae5374b`，尚未合并或sink；该候选不代表本完整方案已通过验证。

## 研究材料

- Codex：[官方指南](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/research-official.md)、[论文实验](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/research-papers.md)、[开源实践](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/research-practice.md)、[独立综合](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/codex-research-synthesis.md)。
- Fable：[官方指南](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/fable-research-official.md)、[论文实验](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/fable-research-evidence.md)、[开源实践](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/fable-research-practice.md)、[独立综合](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/fable-research-synthesis.md)。
- [31项原始审计](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/report.md)、[Fable联合核对与最终意见（第7节）](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/fable-joint-review.md)、[最终Issue正文](/Users/ylminiserver/Documents/Codex/2026-09-09/workflow-rule-audit/issue-1054-proposal.md)。

原始研究保留独立思考及后续纠正记录；本共同方案与最终Issue正文表示已采纳结论。
