# Fable 联合核对：31 项 disposition 与 #1054 一次性方案草案

执行身份：Claude Code 主编排者（Fable 5.1），2026-09-09。基线 `662bcd33`（main，与 Codex 审计同基线）。本文只核对与提方案，不改 forge、不改仓库；#1054 在途成果（worktree `bundle-1054`）保留，其对接见第 5 节。角色最终设计等三份在线研究（fable-research-*.md 与 Codex 的 research-*.md）返回后一起收敛；本文第 2 节是本地核对得出的定位与初步建议，不是定稿。

核对方法："复现"= 我本人用生产代码/检查器重跑；"静态"= 源码明确；"本轮亲历"= #1053/#1054 两轮 run 中实际遇到。我不把"更少指令"自动当作更好；每项都写根因与消费者。

---

## 1. 31 项 disposition

结论用四档：**已证实**（复现或静态确凿，应纳入 #1054）／**应修正**（Codex 标为候选或建议，我核对后认为应纳入）／**候选**（值得做，但缺独立消费者或效果证据，不纳入本次一次性范围）／**保留**（不改）。每项附依据与合并根因编号（R1–R4，见 1.1）。

### 1.1 合并后的根因

- **R1 finalize 把人类记录当机器接口**：Mission List 计数（#1054 原观察）、`## Run gaps` 固定语法 + `--check` 门（1）、子串近似语义（2）、backlog delta 数记录行（3）、手写 gap 三份表达（4）、正文长度抄录（6）、finalize 新事实倒写 mission result（7）。同一病：脚本重复"理解"编排者的自然语言记录并据此裁决或统计，而没有独立消费者。补救方向一致：finalize 只保留机器可测事实（receipt、changed_paths、issue 存在/关闭、文件字节），不再解析散文记录；结论由主编排者直接读原记录写入现有 finalize 记录。
- **R2 角色正文是为早期模型写的操作手册**：10–24。同一病：把"怎么做"（固定阶段、数字红旗、输出模板、四选一分类、锁文件处方、字符/词数仪式）写进持久角色正文；安全边界逐字复制 10 份。
- **R3 同一事实多载体人工维护**：5、8、25、29。
- **R4 校验层钉措辞/源码外形而非行为或接口**：23、27、28、30、31。

### 1.2 逐项

| # | 结论 | 依据（我方核对） | 根因 | 与 Codex 的差异 |
|---|---|---|---|---|
| 1 | **已证实** | 复现：临时项目，seed `gap: manual:auth — auditor permission bug` → 扫描产出 class `manual:manual-auth`；规范 bullet `--check` 反而 `observed_gap_unseeded`（class 被二次加前缀），等价表格 → `gaps_unswept`（exit 1）。即同一事实三种写法三种裁决。 | R1 | 我比 Codex 更进一步：不是"避免扩充解析器"，而是**退役 `--check` 门与 `## Run gaps` 语法**。`run-gaps.json` 的机器信号（扫描出的类）可留作诊断输入，但不再作为 finalize 前置门。 |
| 2 | **已证实**（静态） | `samplesMatch` 以双向包含判等（gap-sweep.js ~L330）。我的复现因 class 前缀问题未走到该分支，但代码路径确定。 | R1 | 同意去掉语义替身；与 1 一并退役。 |
| 3 | **已证实**（复现） | 提取 `computeBacklogDelta` 注入真实 `parseGapSection`：同一 #1054 两行 → filed=2/net=+1；一行 → 1/0；中文散文 → 0/-1；表格行 → unknown。消费者：仅 `workflow-state.md` `## Closure` 块（claim.js:2639）与 finalize envelope（:5118），无下游读取。 | R1 | Codex 说"需要时只基于实际操作事实"；我认为**直接删除该统计**：无消费者、无法从记录行证明"本轮新建"。forge 本身是唯一 backlog 真相。 |
| 4 | **已证实**（静态+亲历） | finalize.skeleton L98/L134；#1053 我为 #1054 补记时确需三处写。 | R1 | 同意；随 1 一并消失。 |
| 5 | **应修正**（比 Codex 更具体） | `doc-docking.md`、`doc-updater.md` 是 `ARCHIVE_CACHE_SIDECAR_MD` 固定名 sidecar（claim.js:6185–6191），且 `closure-audit.js:286` 把 `.cache/doc-updater.md` 当引用证据。退役其一必须同步改这两处，而非只删提示词。 | R3 | Codex 低估了机械耦合：保留一份 docking 证据（`doc-docking.md`），角色报告落点由 brief 指定，不再固定名 `doc-updater.md`；同步修 sidecar 集合与 closure-audit。 |
| 6 | **已证实** | finalize.skeleton L138–146。 | R1 | 保留 Measured/Hypothesis 区分与 `searched:` 查重事实（它们防止"读代码就立 issue"，本地记忆多次证实价值）；删除正文长度与固定外形。 |
| 7 | **已证实**（亲历） | #1053 在 archive 后才立 #1054，只能倒改已归档 summary（提交 `a4d242ab`）；Next 明文"已完成结果不可变"。 | R1 | 同意：事务期新事实写入 finalize 记录，删除"写入 mission result"的句子。 |
| 8 | **应修正** | AGENTS.md Documentation 段是项目事实（保留）；finalize card 与 doc-updater 正文各自铺清单。 | R3 | 角色只说"按项目声明的文档清单更新并转录真实签名"；finalize card 引用 AGENTS.md 而非重列。 |
| 9 | **保留**（不做） | 亲历：#1053 先 `npm test` 后 `run-chains`。原因是我的入口选择，Next/Finalize 已写明 finalize 用 producer 入口。 | — | 不新增缓存或提示；属编排者判断。 |
| 10 | **已证实** | `behavior-contracts.json` 中 963 字符段**逐字**出现 10 次（非共享块）。 | R2 | 我的修法是**单一来源由生成器渲染**（若仍需要），而非"精炼十份"。是否可从子代理正文完全移除取决于宿主是否给子代理加载全局合同/项目规则——**未测量**，列为收敛前必须核实的事实（各 runtime 分别核）。 |
| 11 | **已证实** | 264 字符段 ×10，且 adapter 尾部另有 `capability_gap` 停止指令（implementer.md L66 与 L124）。 | R2 | 合并为一句、一处：禁止伪造未执行结果；有授权等价工具则用；否则报告 `capability_gap`。落点在 adapter（它已在那里）。 |
| 12 | **应修正** | implementer 5 处、tdd-guide 7 处重复"验收意义"；synthesizer 8 处"conflict"。 | R2 | 随角色重写一次解决。 |
| 13 | **应修正** | code-explorer L45–56、investigator L64–76、planner L57 强制整套输出模板。 | R2 | 改为"回答所问、给可复现证据、标明未知"；结构随问题。 |
| 14 | **候选→建议合并**（待研究） | 两者都输出结构/文件/顺序/风险/验证；ADR 0019 把两者定为 heavy。无双派证据。 | R2 | Codex 建议"明确各自何时"；我倾向**合并为一个 heavy 规划角色**（保留 `planner` 名，吸收架构蓝图），退役 `code-architect`。最终待研究与 ADR 0019 影响评估。 |
| 15 | **已证实** | planner.md L120–136：四阶段、>50 行、>4 层。 | R2 | 删除数字与预设阶段。 |
| 16 | **应修正** | code-architect L46–56 固定 types→…→UI→tests→docs，与测试作者先建 oracle 相悖。 | R2 | 改为按真实依赖与测试 custody 排序（若 14 合并则一并消失）。 |
| 17 | **已证实** | build-error-resolver 默认 tsc/eslint；本仓库无 build/lint。 | R2 | 只跑项目声明且与失败相关的命令。 |
| 18 | **已证实** | L98–101 `rm -rf node_modules package-lock.json && npm install`。 | R2 | 删除。改变依赖解析面不是最小修复。 |
| 19 | **已证实** | L112 `< 5%`。 | R2 | 删除百分比，保留"最小必要改动"。 |
| 20 | **已证实** | implementer L52–62 exactly one tier；refactor 无条件前后全套。 | R2 | 按影响选择并如实报告所跑命令；项目有强制链时仍执行。 |
| 21 | **已证实** | metric-optimizer L23 把 fixed-destination 归 `tdd-guide`；tdd-guide L23 已是测试 custody。 | R2 | 修正为 `implementer`。 |
| 22 | **应修正** | doc-updater L74–80、L102–108：固定 codemap 结构、日期、<500 行。 | R2 | 只保留"遵循项目现有文档约定，按变更补充，转录真实签名"。 |
| 23 | **已证实（修订：整段退役）** | 复核：`parseRecordedVerdict` 的唯一生产调用在 adaptive-schema.js:1374，读取 `.cache/final-validation.md`（validation-runner 写入，含 `validated_candidate_hash` 绑定），**不是**逐个 reviewer 回执的消费者；非测试脚本中无 `review_conclusion` / canonical finding-row 消费者。 | R4 | 我此前"保留 verdict/findings_blocking 两个机器字段"是错的层：reviewer 常驻正文不再要求任何列 0 协议；角色交自然语言证据与结论，主编排审读后把真实字段写入已有 final-validation 记录（不得捏造未执行结果）。与 Codex 一致。同类删除：code-reviewer L41 的 ">80% 置信度" 数字。 |
| 24 | **应修正** | 506 字符 ladder ×3；全局合同已有"Keep changes surgical… avoid speculative mechanisms"。 | R2/R3 | 从角色删除，不另建选择表；"先判断现有机制是否还需要"一句可进全局合同或不写（已有"派生/删减"记忆原则）。 |
| 25 | **应修正**（比 Codex 强） | compact-recovery.skeleton 携带全局合同+dispatch+adapter，同时指令"完整重载" Next/Finalize（其中含相同块）。恢复期只需：合同 + "读状态并完整重载"两句。 | R3 | 去掉 recovery 中的 dispatch/adapter 块；需同步调整钉住它们的校验（R4）。 |
| 26 | **保留** | dispatch-contract L27 已是短 brief 骨架。 | — | 属编排者行为，不改机制。 |
| 27 | **应修正（纳入，修订）** | `measure-validator-duplication.js` 是诊断工具（非门），root 78 + Codex 2 = 80 条 DUP 候选，按 required-block 分组（36 nx-mission-list、24 nx-claim-is-bookkeeping、6 concurrency、6 resume、3 fn-validation-report、2 fn-changed-paths、1 fn-archive）。 | R4 | 用户要求一次性解决：本 issue 内对 80 条逐组做去重判断——每条按 subtraction 方向证明（删断言→删其命名 token→`test-route-reachability` 必须 RED 才算重复）；被证实重复者删除，保留者写明用途与反向验证依据。其中 nx-mission-list 组与本次 Next/Finalize 文案改动直接相关，优先。 |
| 28 | **应修正（窄）** | validate-workflow-contracts.js:734 附近钉源码字符串（`"inner_reason: 'mirror_sync_failed',"`、`if (!verdict.safe) {`），**直接与在途 #1054 ledger 改动相撞**。 | R4 | 对本次改动的部分把源码外形 pin 换成行为测试；不整体清理。 |
| 29 | **应修正（纳入，修订）** | 人工多源事实：`CODEX_PINNED_{STANDARD,REASONING,HEAVY}_ROLES` 在 adaptive-schema.js:78–85（已导出）、codex-preflight.js:83–87、install-codex-agent-profiles.js:82–86 三处重复声明；`DEFAULT_AGENT_MODELS`（resolve-agent-model.js）要求与 14 份 frontmatter 字节相等；`MANIFEST_BASENAME`/`RETIRED_PROFILE_FILES`/TOML 形状校验在 preflight 与 installer 互为 MIRROR。 | R3 | 收敛为一个权威定义（adaptive-schema 已导出角色集合；preflight/installer 改为引用；模型默认由 behavior-contracts/frontmatter 单源生成），**不改变真正不同的检查语义**（preflight 的只读校验与 installer 的写入校验各自保留）。无漂移不是不做的理由：重复本身是维护成本。 |
| 30 | **已证实** | validate-kaola-workflow-contracts.js:224–232：200 行 notice，与 ADR 0023 "无行数预算"不一致。 | R4 | 删除 notice（小改，纳入）。 |
| 31 | **应修正（纳入，修订）** | prose-census.js:576–580 以 0.05 slack 的比例判 `prose_lagging`；`--fail-on-regression` 无调用方。 | R4 | 删除比例判据与 `--fail-on-regression` 出口（无依据、无消费者），保留原始计数作诊断输出。 |

### 1.3 我不同意 Codex 之处（汇总）
1. 第 1/2/4 项：应**退役** `--check` 门与 `## Run gaps` 语法，而不是"避免扩充解析器"这种保留姿态。
2. 第 3 项：直接删除 backlog delta 统计，不保留"基于实际操作事实"的版本——没有消费者。
3. 第 5 项：这是机械耦合（archive sidecar 集合 + closure-audit 引用），不只是提示词重复。
4. 第 10 项：修法是单一来源渲染，且"能否从子代理移除"是需要按 runtime 测量的事实，不能先验。
5. 第 14 项：建议合并 planner/code-architect（待研究定夺），而非各自澄清触发条件。
6. 第 23 项：应修正而非候选——形状规则无消费者已确定。
7. 第 25 项：应修正而非候选——恢复提示自身要求立即完整重载。
8. （已撤回）第 27 项原拟另立后续；按用户"一次性解决"的要求改为纳入，见上表。

### 1.4 采纳用户/Codex 对本文初稿的修正
- 第 23 项：reviewer 协议整段退役（见上表修订）。
- 第 27/29/31 项：纳入一次性范围，不自动另立 issue。第 9/26 项保持为编排行为、不加代码。
- 角色合并不以共享的 381 字通用段为依据，而以**独有交付**是否不同为准；定案等双方研究完结。
- Codex 本地设计笔记补充的同根因细节，我核实并采纳：code-reviewer L41 ">80%" 无校准含义（删）；metric-optimizer 正文绑定 Beta 后验/pass-rate 打印格式（方法由任务与测量方案决定，不常驻）；`generate-agent-profiles.js` `runtimeAppendix` 把 runtime 名与三类 hash 拼进模型可读 instructions（hash 有安装完整性用途，但应先追踪 native carrier 能否把它们留在机器元数据，不能借移除完整性校验假装节省）；`REQUIRED_COVERAGE` 七键只是源元数据完整性，不得反过来要求角色正文七段复述。

---

## 2. 14 个角色：定位、任务、建议（初稿，待研究收敛）

原则：角色正文只回答"你是谁、要交付什么、你独有的写入/custody 边界、何时停"。通用安全与项目规则由全局合同/宿主/AGENTS.md 承载（前提：第 10 项的继承事实按 runtime 核实）。不设字数、比例、固定模板。

| 角色 | 层 | 定位与任务 | 建议 | 理由 |
|---|---|---|---|---|
| planner | heavy | 任务规划者：把目标、取舍与依赖组织成可验收的工作安排 | 保留；与 code-architect 是否合并待研究 | 判据是**独有交付**：规划交付"顺序与验收安排"，架构交付"组件/接口/数据流与取舍"。若研究显示两种交付常被同一派发同时要求且无独立价值，则合并；否则各留一个短正文 |
| code-architect | heavy | 技术设计者：为指定问题提出组件、接口、数据流与关键取舍 | 保留或合并待研究 | 同上；本地证据只能说明"当前正文重叠"，不能说明"交付不同"与否 |
| implementer | standard | 在给定范围写生产代码；不得改验收意义 | 保留；删除四选一 tier、ladder、重复段 | 唯一生产写入 custody |
| tdd-guide | standard | 验收测试 custody：从验收面写测试、证明基线 RED；不写生产代码 | 保留；删除重复声明 | 独立判断的核心 |
| investigator | standard | 执行调查者：通过运行与测量回答事实问题，交付可复查结果 | 保留 | 独有交付是"运行得到的测量"；与 code-explorer 的合并不以共享段为据 |
| code-explorer | standard | 代码探索者：解释指定功能如何工作，给出实现位置与依赖 | 保留或合并待研究 | 独有交付是"静态追踪结论"；Claude 有内置 Explore 但其他 runtime 没有，这是保留的事实依据之一 |
| knowledge-lookup | standard | 仓库无法确立的外部事实，一手来源与日期 | 保留 | 唯一带 Web 工具的角色；本轮研究派发即用它 |
| doc-updater | standard | 按项目文档清单转录真实签名/行为 | 保留；删除 codemap 结构/日期/500 行 | 固定名 sidecar 改由 brief 指定落点（第 5 项） |
| code-reviewer | reasoning | 独立代码审查者：识别改动引入的实质缺陷，交付可核查的发现与结论 | 保留；删除全部列 0 协议、形状仪式与 >80% 数字 | 无生产消费者读 reviewer 回执（修订后的第 23 项）；真实字段由主编排写入 final-validation |
| security-reviewer | reasoning | 安全审查者：检查信任边界与可利用风险，交付有证据的发现 | 保留或合并待研究 | 独有交付是"信任边界/可利用性发现"，与正确性审查的对象不同 |
| adversarial-verifier | reasoning | 对一条已记录声明做最强证伪 | 保留 | 与 reviewer 的对象不同（声明 vs 候选） |
| build-error-resolver | reasoning | 用最小 diff 让项目声明的构建/检查恢复绿 | 保留；删除 Node/TS 默认、锁文件处方、5% | 唯一"修构建不修架构"custody |
| synthesizer | reasoning | 真实内容冲突按意图合并 | 保留；删除重复 | 罕见但独有 |
| metric-optimizer | standard | 有数值目标的有界棘轮 | 保留；修正路由（21） | 独有循环 custody |

---

## 3. 各载体承载什么（尽量少提示）

- **角色正文**（behavior-contracts.json → 生成）：身份一句；应交付的结果与证据形态；该角色**独有**的写入/custody 边界与停止条件。不含：通用安全段、工具不足段、solution ladder、固定模板、数字门槛、置信百分比、统计方法、流程步骤、机器回执协议（无生产消费者）。
- **全局合同**（kaola-workflow-global.md）：第一原则、backlog 真相、Mission List 四字段/三写入、PASS 失效、未执行不 PASS。已有；不扩。
- **宿主 adapter**（runtime-capabilities.json → 渲染尾部）：工具/模型/原生限制、`capability_gap` 停止、原生路由事实。第 11 项合并后的一句落这里。
- **本次 brief**（编排者写）：目标、验收依据、worktree/commit、写入范围、交付落点、必要停止条件；只传本次差异。
- **共享安全边界**（第 10 项）：若测得子代理不继承宿主/全局边界，则由生成器把**一份**精炼边界渲染进每个角色；若继承，则不渲染。这是事实问题，不是偏好。

---

## 4. #1054 一次性范围、顺序、验收、不做

### 4.1 范围（在已改写的 #1054 四条之上并入）
A. **finalize 停止解析人类记录（R1）**：Mission List 探针/统计（在途已完成）；`## Run gaps` 语法与 `gap-sweep --check` 门退役（扫描器可留作诊断）；`computeBacklogDelta` 及 `## Closure` 三行统计删除；finalize 提示删除正文长度抄录与"倒写 mission result"；ledger 守卫改为内容/方向/权威（在途第二部分）。
B. **角色正文重写（R2）**：14 个角色按第 2/3 节重写，单一来源渲染，路由修正（21），锁文件/百分比/数字门槛/固定阶段/模板删除；合并决策（14/code-explorer）按研究收敛。
C. **载体去重（R3）**：recovery 去掉 dispatch/adapter 块（25）；docking 单一证据文件与 sidecar/closure-audit 同步（5）；finalize card 引用 AGENTS.md 文档清单（8）。
D. **校验层与维护层（R4/R3）**：被 A–C 改动触及的措辞/源码 pin 换为行为或接口检查（23、28）；80 条 DUP 候选逐组 subtraction 证明后删除被证实重复者、保留者记用途与反向验证依据（27）；模型 tier/角色集合/TOML 形状常量收敛为单一权威定义，不改各检查的语义（29）；删除 200 行 notice（30）；删除 prose-census 比例判据与 `--fail-on-regression`，保留原始计数（31）。
E. **文档与设计记录**：README/docs/api/architecture/workflow-state-contract/CHANGELOG；一份 ADR 记录"finalize 只测机器事实、编排者读记录；角色 = 身份+结果+边界"。全部 forge/runtime 由生成器再生。

### 4.2 顺序
1. 在途第二部分（ledger 内容守卫 + 其验收）收口为第一个候选；2. A 的其余退役（gap-sweep 门、backlog delta、skeleton 文案）；3. 研究收敛 → B 角色重写与生成；4. C、D；5. E 文档/ADR；6. 生成检查、受影响 forge/runtime 套件、`npm test`、完整 walkthrough；独立审查冻结候选；7. finalize/sink/安装核验（不发布）。

### 4.3 验收
- 不同排版的 Mission List 不影响 finalize；summary/state 无任何任务计数或 backlog 净增减；`gap-sweep --check` 不再是 finalize 前置；原始记录与已完成结果不被旧副本覆盖（首次/重复/冲突，四 forge），且不以计数判安全。
- 角色：全部正文由单一来源生成；共享边界最多渲染一次（或按测量不渲染）；无数字门槛、固定阶段、输出模板、锁文件处方、置信百分比、常驻统计方法；metric-optimizer 路由指向 implementer；reviewer 不再有列 0 回执协议，final-validation 字段仍由真实验证写入并绑定候选。运行层验收按 Codex 笔记的"设计验收草案"：在可用原生宿主上固定任务对比旧/新正文，记录任务质量、误路由、缺失证据、无谓停止/复跑，宿主未暴露的数值记 unknown；不用文件字符变化充当效果。
- 载体与维护层：recovery 不再重复 dispatch/adapter；docking 只有一份固定证据；被证实重复的 validator 断言已删且保留清单有依据；角色集合/模型常量单源；prose-census 无比例判据；校验层对改动表面无措辞 pin 残留；`generate-routing-surfaces --check`、agent profiles `--check`、四 forge 合同校验、edition 套件、walkthrough 全绿。
- 行为核对：新会话按新角色正文派发各角色一次（真实 Claude Code；其他宿主 headless 决策类），记录真实结果与未执行宿主。

### 4.4 明确不做
9 与 26（编排行为，不加代码）；任何新 schema/格式强制/审批门/通用解析框架；用关键词计数或字数比例验收提示词；改写历史 done 行或归档记录；自动另立 issue；release/tag。

---

## 5. 在途工作的对接（worktree `bundle-1054`，基线 `662bcd33`）

- 已完成并保留：第一部分——四棵 claim 树移除 `probeMissionListCoherence`/`persistMissionListToSummary`/`mission_list` envelope（impl）；验收套件 `test-issue-1054-mission-list-carriers.js`（116 断言，RED 44/72）+ `test-finalize-door.js` T17 重写（tdd）。
- 进行中（安全边界内完成后记录）：第二部分——`compareLedgers` 按内容（first_sync/identical/content_diverged+diff）、退役分歧时自动反向覆盖、`countComplete` 删除；验收 `test-issue-1054-ledger-guard.js` + `test-ledger-compare.js` 重写。**注意**：validate-workflow-contracts.js:734 附近的源码 pin（第 28 项）会与之相撞，属 D 的第一批。
- 已撤回并存证：双格式解析实现与验收（`.cache/withdrawn/`）。
- 尚未对接、需随 A 完成：finalize.skeleton 仍说 `## Mission List` 是"事务发现落点"（L94–95、L108），须随 A 一并改写；`## Run gaps`/gap-sweep/backlog delta 退役未开始。
- 本次 run 的 Mission List（表格式，8 行）本身就是"不同排版不影响收尾"的现场证据。

---

## 6. 待研究收敛的问题（不在本文定案）
1. 子代理是否继承宿主的全局合同/项目规则（按 7 个 runtime 测量）——决定第 10 项落点。
2. planner/code-architect、investigator/code-explorer、code-reviewer/security-reviewer 的合并与否。
3. "更短是否更好"只接受对照证据；无证据时按"删除无消费者与无行为差异的部分"处理，不追求长度目标。

---

## 7. 对 Codex 综合（codex-research-synthesis.md）与提案（issue-1054-proposal.md）的最终意见

前提：本节写于我方 `fable-research-synthesis.md` 成稿并完成一手抽查之后；抽查更正已追加到三份 fable-research-*.md 末尾。

### 7.1 同意（可直接写入 #1054）
1. **14 个调用入口保留，按独有交付重划分工，不构成必经流水线，不设目标角色数；实施中若实际交付不可区分可基于证据合并。** 我撤回本文第 2 节初稿中"合并 planner/code-architect、code-explorer 并入 investigator"的倾向：双方研究都没有窗口内一手证据支持拆或合（本方 practice 报告"未证实 2"，Codex 亦未引），Anthropic 08-13 只说明"提示分工不带来协调收益"，不说明"合并更好"。按提案的 14 条"定位与应完成的事情"表定案。
2. **31 项全部在本 issue 内给出处理结论并完成采纳项**，含 27（80 条候选逐项判断，反向变异证明后删重复、保留者记依据）、29（同一事实的 authoring 来源收敛，不混并不同检查语义）、31（删除比例判据，原始计数留作非裁决诊断）；9/26 记为编排行为、不加代码。与本文 1.2/1.4 修订一致。
3. **审查子代理交自然语言报告；`parseRecordedVerdict` 的唯一生产消费者是 `.cache/final-validation.md`，由主编排维护。** 与我方复核（adaptive-schema.js:1374）一致。补一条边界（见 7.3 第 1 点）。
4. 研究引用的措辞审慎：#4859 无可复核数字、Anthropic 08-13 限于游戏协作、Claude 指南页无日期——与我方抽查一致。deepagents #4979 "顶层导出删除、内部弃用兼容"表述正确。
5. 保留基础与明确边界一节（claim/Mission List 四字段三写入/结果不可变/forge 真相/测试与实现归属/候选绑定 receipt/archive-sink 恢复/宿主权限；不新增解析器、schema、固定字段/长度、guardrail、registry、缓存、评分、调度）——完全同意。
6. 验收一节（代表任务、真实宿主、未暴露数据记 unknown、不用字符数充当 token 节省、不设固定样本量/比例门）——同意；建议补一条现场证据（7.3 第 4 点）。

### 7.2 已在提案中、需要补的实施事实（不是异议，是防漏）
1. 退役 `## Run gaps` 门与手工登记链时，同步删除 `ARCHIVE_CACHE_SIDECAR_MD` 中的 `run-gaps-manual.md`（claim.js:6185–6191 同一集合也含 `doc-updater.md`），并处理归档字节校验对 sidecar 的豁免逻辑；否则第 4/5 项各只完成一半。
2. 第 3 项删除 `computeBacklogDelta` 时，`workflow-state.md` `## Closure` 三行（claim.js:2639–2641）与 finalize envelope（:5118）一并删除；检查 test-forge-finalize-findings / walkthrough 是否钉这些行。
3. finalize.skeleton 仍写 "`## Validation`, `## Changed Paths` and `## Mission List` are where the finalize transaction's own findings land"（L94–95）与 summary 模板列出 `## Mission List`（L108）；在途第一部分已删代码，这两处文案必须随本 issue 改，否则 Next/Finalize 表面与代码不一致。
4. docs/api.md:444 的 `mission_list` 行与 :1808 的 `countComplete` 说明已过时（实施者已标记未改）。
5. `generate-agent-profiles.js` 的 `REQUIRED_COVERAGE` 七键是源元数据完整性检查；角色重写后必须核对它与 `test-runtime-agent-architecture`（859 断言）是否会把短正文判为不完整或钉住旧措辞——这是第 28 项"外形 pin"的一个具体实例，建议在提案第 28 行点名。
6. 第 10 项"实测宿主有效边界"应写成**按 7 个 runtime 分别测量**；Claude Code 官方文档明确子代理不继承父会话，其余六个未测。测量前，共享边界由单一来源渲染一次，而不是先删后测。
7. 第 27 项的 78 条 root DUP 中 36 条属 `nx-mission-list`、24 条属 `nx-claim-is-bookkeeping`，都钉住本 issue 会改写的 Next 文案；建议按组先做这两组，其余按 subtraction 证明逐条处理。

### 7.3 异议或需明确的边界（小，且不改变提案方向）
1. **"主编排写最终机器字段"必须限定为：`final-validation.md` 的 `verdict: pass` 与 `validated_candidate_hash` 只来自实际执行的验证（validation-runner / chain receipt），绝不由审查报告的 PASS 推出。** 审查发现是 summary 里的散文证据，验证是另一回事；提案第"任务说明、宿主与最终记录"节应加这一句，避免把"review PASS"写成"validation PASS"。
2. 提案第 1 项"机器扫描可保留为诊断"：若保留 `gap-sweep --project` 扫描，需删除其对 `.cache/run-gaps-manual.md` 的读取（否则第 4 项的手工链仍在），且不再要求 finalize 运行它；我方复现还发现手写 seed 的 class 会被二次加前缀（`manual:manual-auth`），保留扫描时一并修或直接不再读手工文件。
3. 提案的 OpenCode 依据未出现在 issue 正文引用里（好），但若后续引用，须按更正表述：`tools`→`permission` 是配置字段迁移，不证明"提示词约束外迁"，也不证明 plan/build 只差权限。
4. 验收补一条现场证据：本次 run（`bundle-1054`）自身的表格式 Mission List 在 finalize 时不产生任何统计与格式门，作为"排版不影响收尾"的直接证据；以及安装后七个 home 的角色正文与生成源逐载体 SHA256 一致（沿用 #1053 的三类安装证据划分）。
5. 提案"实施组织"第 3 步"按研究后的职责定位重写全部角色"——同意，但请注明角色正文的**权威来源仍是 `templates/agents/behavior-contracts.json`**，`agents/*.md` 与七 runtime 载体只再生成，不手改。

### 7.4 结论
同意以 issue-1054-proposal.md 为 #1054 正文，附 7.2 的 7 条实施事实与 7.3 的 5 条边界。本方无其他异议。当前状态：#1054 候选 `6ae5374b` 已推送到 `workflow/bundle-1054`（Mission List 去计数 + 内容守卫 + 验收），未合并、未 sink；无子代理在运行；等 issue 更新后按新 scope 继续（下一批：finalize 文案与 gap/backlog 退役 → 角色重写 → 校验层 → 文档/ADR → 验证/审查/finalize/sink/安装核验）。
