# 统计、规则、提示词与重复设计：只读审计

审计基线：`662bcd339c6efef5f0e29dbe13f33189a27f2848`，2026-09-09。

本轮没有修改仓库文件、创建或修改 Issue，也没有干预 Fable 的 #1054 工作。报告及复现产物放在仓库外。#1054 正在处理的 Mission List 计数问题作为背景，不把未合并修复当作已完成。以下是本轮覆盖范围内全部保留发现，不声称穷尽所有潜在缺陷。

覆盖：Next / Finalize / compact recovery / dispatch 模板、14 个角色正文与运行时附加规则、模型默认值与预检、gap sweep、backlog delta、文档对接、可选统计工具、四 forge 校验重复。检查了生成来源及代表性生成文件；没有逐个真实运行所有宿主，也没有测量模型实际输入 token、缓存命中或提示词精简后的行为。

“实测”表示执行生产函数/检查器复现；“静态确定”表示源码明确存在；“候选”表示值得精简，但尚未证明改变它能改善实际运行。下列编号用于本报告，不是待自动创建的 Issue。

## 已复现的统计与格式问题

### 1. Gap sweep 把人类记录重新变成固定格式接口【实测】

位置：`scripts/kaola-workflow-gap-sweep.js:259,351`；`templates/routing/finalize.skeleton.md:110`。
同一 seeded gap，规范 bullet 可通过；改成内容相同的表格后返回 `gaps_unswept`。未 seeded 的表格 gap 又会被漏读，返回 mapped/filed/noise 全零且成功；同样内容的规范 bullet 会报 `observed_gap_unseeded`。复现见 `fixtures/results.json`。

建议：先判断是否还需要程序理解这段自由文本。由编排器对照原始发现和 forge 处理结果；保留真实机器信号，避免继续扩充 Markdown 解析器。

### 2. Gap 匹配用子串近似语义【实测】

位置：`scripts/kaola-workflow-gap-sweep.js:344`。
seed 为 `permission check missing`，summary 只用 `permission` 搭配另一条 harmless 说明，仍可按 noise 映射成功。匹配成功证明字符串覆盖，不能证明问题已被正确处置。

建议：去掉这种语义替身，判断回到原始证据及编排器。

### 3. Backlog delta 统计的是记录行，不是本轮实际新建 Issue【实测】

位置：`scripts/kaola-workflow-claim.js:2671`。
关闭 1 个 Issue，同一 #1054 写两行得 filed=2、net=+1；写一行得 filed=1、net=0；用普通中文写已创建 #1054 则 filed=0、net=-1。见 `fixtures/backlog-results.json`。复现执行从源码提取的生产函数，注入真实 gap parser。

建议：不需要净增减时删除统计；需要时只基于实际操作事实。去重只能修复部分问题，不能证明链接指向的 Issue 是本轮创建。

## 重复记录与流程约束

### 4. 手写 gap 要维护三个表达【静态确定】

位置：`templates/routing/finalize.skeleton.md:98,134`。
原始发现之外，还要写 `.cache/run-gaps-manual.md`，扫描为 `run-gaps.json`，再写 `## Run gaps` 并重新核对。和第 1 项同源，但这是写入工作量问题。建议减少手工副本，不建立更复杂的同步器。

### 5. 文档对接多份回执重复【候选】

位置：`templates/routing/finalize.skeleton.md:87`；`scripts/kaola-workflow-claim.js:6189` 附近。
要求 `.cache/doc-updater.md`、`.cache/doc-docking.md`，summary 再记录 Documentation Docking。搜索到保存这些文件的逻辑，没有找到独立消费其内容的必要性证明。建议保留一份实质检查证据，其他位置引用；不能仅因文件多就删除恢复需要的记录。

### 6. Issue 正文长度被当成每次必须抄录的证据【静态确定】

位置：`templates/routing/finalize.skeleton.md:138-146`。
要求固定 Measured/Hypothesis 段、searched 查询和命中数，以及 Issue 号和正文长度。检查 Issue 存在、正文非空有用，反复记正文长度没有相同价值。建议保留事实/推断区分和查重事实，减少固定外形及无消费方数字。

### 7. Finalize 新发现要求回写 Mission result，与已完成结果不可变冲突【静态确定】

位置：`templates/routing/finalize.skeleton.md:145`；`templates/routing/next.skeleton.md:118`。
Finalize 阶段才新建 follow-up 时，指令仍要求把号和正文长度写入 Mission List result；但此时 missions 可能全部 done，且不能修改已完成结果、不能把 finalization 新增为 mission。建议事务期新事实进入该事务的记录，而非倒改完成结果。

### 8. 文档检查在项目规则、Finalize、角色中反复列举【候选】

位置：`AGENTS.md` Documentation；`templates/routing/finalize.skeleton.md:87`；`agents/doc-updater.md`。
职责、文件清单、质量清单、输出协议重复。项目的实际文档要求应保留；角色与分发只补本次差异，不再各自铺完整目录。

### 9. 同候选验证可能先裸跑，再为回执重跑【流程机会】

#1053 观察中，直接完整验证后又运行 receipt producer。候选变化后的重跑必要；同候选仅因首次选错入口而重跑可以避免。建议一开始使用要求的 producer，并复用仍有效的候选绑定证据；不建议为此新增缓存系统或豁免完整链。

## 子代理提示词：优先精简的内容

权威正文来源是 `templates/agents/behavior-contracts.json`；以下 `agents/*.md` 只用于便于阅读定位，不建议手改生成文件。

### 10. 通用防御段在 10 个角色正文中逐字重复【静态确定】

实测同一段 963 个 Unicode 字符，重复于 10 个角色。源码维护与携带负担明确；独立子代理仍需要有效的安全边界，不能只从子代理删除而假定它看到父上下文。建议精炼成必要边界，先核实宿主实际继承，再决定共享或内嵌。

### 11. “工具不足就停止”重复且措辞过宽【静态确定】

同一段 264 字符重复于 10 个角色，末尾 runtime adapter 又有 capability gap 停止指令。正文把任何绕过缺失工具的交付称为缺陷，容易混淆“伪造未执行结果”与“用已授权等价工具完成”。建议合并一次，只禁止伪证和越界，承认真正等价的可用能力。

### 12. 单角色内反复声明职责、范围、输出和停止条件【候选】

位置：`agents/implementer.md`、`agents/tdd-guide.md`、`agents/investigator.md`、`agents/synthesizer.md`。
例如测试只能由测试作者修改验收意义，在 role、scope、stop 重复；合并冲突只在给定范围处理亦重复多次。建议每个约束只有一个清晰落点，输出只规定需要交付的证据。

### 13. 大型输出模板迫使小问题也铺多节【候选】

位置：`agents/code-explorer.md:49`、`agents/investigator.md:70`、`agents/planner.md:57`。
探索/调查强制或示范整套层次、依赖、表格、建议。建议改成“回答所问、给源码/执行证据、明确未知”，由问题规模决定结构。

### 14. Planner 和 Code Architect 的计划职责重叠【候选】

位置：`agents/planner.md`、`agents/code-architect.md`。
两者都输出结构、文件、步骤、风险和验证安排。没有证据证明所有任务都双派；建议明确各自何时能提供不同结论，任务不需要两份计划时不重复派发。

### 15. Planner 固定四阶段及行数红旗【静态确定】

位置：`agents/planner.md:124-134`。
MVP/core/edge/optimization 四阶段、函数 >50 行、嵌套 >4 层，不是所有任务的真实验收条件。建议保留按风险拆解的目标，删除通用数字与预设阶段。

### 16. Code Architect 固定 tests 在 UI 后【候选】

位置：`agents/code-architect.md` 的 build order。
固定 types→logic→integration→UI→tests→docs，与独立测试作者先建立 oracle 的场景不匹配。它不是已执行的新阶段引擎，但会误导计划。建议依据真实依赖和测试 custody 排序。

### 17. Build Error Resolver 默认命令过于绑定 Node/TypeScript【静态确定】

位置：`agents/build-error-resolver.md`。
默认 tsc/build/eslint 及恢复示例不适用于所有项目，本仓库也无单独 build/lint。建议只运行项目声明且当前失败相关的命令。

### 18. Build Error Resolver 建议删除锁文件【静态确定】

位置：`agents/build-error-resolver.md:98-101`。
Quick Recovery 包含 `rm -rf node_modules package-lock.json && npm install`。删除锁文件会改变依赖解析面，与最小构建修复并不等价。本轮未执行。建议移除该通用恢复处方。

### 19. 用修改比例 <5% 衡量修复成功【静态确定】

位置：`agents/build-error-resolver.md:112`。
分母随文件大小变化，与修复正确性无必然关系。建议保留“最小必要改动”，删除百分比。

### 20. Implementer 强制四选一验证 tier【静态确定】

位置：`agents/implementer.md:52-62`。
exactly one 分类，以及 refactor 无条件前后完整 suite，不能表达同一改动同时需要测试、构建和 smoke。建议按影响选择验证并如实报告；有明确完整链要求时仍执行。

### 21. Metric Optimizer 的旧角色路由已冲突【静态确定】

位置：`agents/metric-optimizer.md:23`，对照 `agents/tdd-guide.md:23` 和 `agents/implementer.md:23`。
仍称 fixed-destination implementation 归 `tdd-guide`，后者现只写测试。建议修正归属，避免向测试 custody 发送生产实现任务。

### 22. Doc Updater 固定目录、日期和 500 行上限【候选】

位置：`agents/doc-updater.md:77,106` 及 codemap 模板。
预设 frontend/backend/database 等结构、Last Updated 和 <500 行，不保证对当前项目有价值。工具命令也应检查项目是否真正提供，不仅看目录存在。建议保留现有项目文档约定、按变更补充。

### 23. Review conclusion 的字符数、词数、位置仪式【静态确定】

位置：`agents/code-reviewer.md:80-84`、`agents/security-reviewer.md:88-92`。
要求列零、最后非空行、至少 24 字母数字字符及四个词；中文词数含糊。生产 verdict parser 消费 `verdict` 和 `findings_blocking`，本轮搜索未找到生产代码消费 `review_conclusion`。建议保留实质结论和真实机器字段，删除非消费方形状限制。尚未证明这条提示当前导致运行阻断。

### 24. Solution ladder 重复，偏向继续扩展现有机制【候选】

位置：planner / code-architect / implementer 的 solution ladder。
同一 506 字符段重复三次；reuse/extend 顺序可能让已经多余的机制继续长大。建议强调先判断现有机制是否还需要，允许删减；不为缩短提示词另建复杂选择表。

### 25. Compact recovery 与完整重载重复装入 dispatch / adapter【静态确定】

位置：`templates/routing/compact-recovery.skeleton.md:15`；Next / Finalize 入口。
recovery 已携带全局合同、dispatch、adapter，又要求完整重载带相同块的操作提示。独立入口与恢复各自可用有正当理由，重复加载仍可优化。建议明确各载体职责，不能删掉恢复所必需的信息。

### 26. 分发 brief 有重复角色正文/历史的风险，但未证实每次发生【候选】

位置：`templates/routing/dispatch-contract.md:27`。
当前要求 outcome/evidence/worktree-or-commit/custody/stop，是合理的短 brief 基础；没有理由再贴角色全文、整个主会话或所有规则。建议实际分发只传本次任务差异。完整历史继承成本依宿主而异，本轮未做 token A/B，不能宣称已有某个节省比例。

## 校验与维护层

### 27. 四套校验存在 80 条重复断言候选【实测分类】

现有 `measure-validator-duplication.js` 运行成功，四套 capture 均 COMPLETE；root 78、Codex 2、另两套 0。见 `validator-duplication.txt`。这证明分类器发现重合，不证明可以安全删除 80 条：仍需逐项反向变异，证明保留的断言能捕获同一缺陷。

### 28. 逐字 pin 与行为检查叠加，造成措辞/源码外形耦合【候选】

位置：`templates/routing/required-blocks.js`；`scripts/validate-workflow-contracts.js:734` 附近。
完整文案 pin、生成一致性和部分源码字符串断言同时存在。稳定接口字段与生成一致性检查有价值；只为相同自然语言/源码写法设置多道 pin 会增加改写成本。建议先区分“行为要求”“API 结构”“实现外形”，仅削减最后一类或真正重复部分。

### 29. 模型 tier/角色集合及 TOML 检查人工多处同步【静态确定】

位置：`scripts/kaola-workflow-resolve-agent-model.js:20`；`scripts/kaola-workflow-codex-preflight.js:61,79,1561`；`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`；adaptive schema 常量。
代码明确标注 MIRROR / keep in sync。不是所有生成副本都有问题；人工维护重复事实才是候选。建议从一个权威定义生成，或共享可随安装分发的小模块；没有证据证明当前副本已经漂移。

### 30. 200 行 AGENTS 提醒与无行数预算设计不一致【静态确定，低优先】

位置：`scripts/validate-kaola-workflow-contracts.js:228`；ADR 0023。
超过 200 行仍 notice 建议精简，当前不使验证失败。建议删除过时行数建议，保留内容质量判断。

### 31. Prose census 的比例阈值无法证明规则质量【静态确定，低优先】

位置：`scripts/kaola-workflow-prose-census.js:578,740`。
以 prose/refusal 数量变化和 0.05 slack 判断 proportionality；可选 `--fail-on-regression` 会退出失败。未发现当前主流程调用该开关。建议原始数量可作诊断，比例不作为正确性判据；不要把这说成当前阻塞门禁。

## 子代理提示词可以怎样变短

以下仅是审计建议，不是已修改的新协议，也不要求机械字段：

> 在指定 worktree 完成 X；验收依据见 Y。你负责 A 文件，保留他人改动。交付代码/报告到 Z，并给执行证据。若出现 B，报告后停止。

角色提示负责持久职责及独有边界；本次 brief 只补目标、上下文定位、写入范围、交付位置、验收与必要停止条件。短任务可以更短，复杂任务只补影响正确性的事实。引用必须是子代理能实际访问的材料。不能把最小字数、固定压缩率、所有角色统一长度变成新门禁。

角色正文有 14 份；`agents/*.md` 合计 1,560 行，包含 frontmatter / hash / adapter，不是单次模型输入长度。`prompt-overlap.json` 记录权威正文字符数及逐字重复段：963×10、264×10、506×3 等。这里统计用来定位重复，不判断角色质量或许诺 token 节省。

## 本轮未建议删除的机制

- 一个 run 的 claim 与 Mission List、四字段、三次写入时机、完成结果不可变：支撑恢复和证据责任。
- 测试验收意义与生产实现的 custody 边界：独立判断用途明确。
- 真实 commit/命令/退出码，以及候选绑定 receipt：不是自然语言任务数的替身。
- sink / archive / closure 的事务恢复信息：文件多不等于重复，需要逐个确认消费者。
- 多运行时和 forge 的生成产物：分发载体有实际必要，不能按文件副本数量计成问题。
- 模型适配能力的 unknown、安装校验和回滚保护：不能用提示精简抹去真实运行边界。

最先值得处理的是 1–3 的实测错误、7/21 的规则冲突、18 的锁文件恢复处方；随后精简子代理正文和重复记录。其余候选应按是否有独立消费者、是否影响行为验证再取舍。本轮仅交付清单。
