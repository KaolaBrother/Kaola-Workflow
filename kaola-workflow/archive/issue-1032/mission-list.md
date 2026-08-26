# 删除 Mission List 周围重新长出的调度器残留，同时保留按效率判断的自适应多代理执行

- item: 核验 workflow-state 活跃运行字段的全部生产读写者，区分真实 claim/liveness/sink 事实与可删除的运行进度镜像
  status: done
  dispatched: code-explorer 在 main@HEAD 只读追踪 state 字段的生产读写、测试与文档，完整结果写入 kaola-workflow/issue-1032/.cache/state-surface-map.md
  result: ef0a6d5 的完整字段图已落地；确认 session_marker、claim_ts、claim/sink 身份与 closure 安全事实必须保留，Current Position/Last Evidence/Last Updated 大部可删，并识别 step: complete 与 legacy next_command 两个必须在实现中显式解除的耦合

- item: 核验 delegation、handoff、test custody、model routing 与 dispatch-log 的权威源、生成面、消费者和可删除测试
  status: done
  dispatched: code-explorer 在 main@HEAD 只读追踪 prompt/role/hook/telemetry 的权威源、生成面和删除边界，完整结果写入 kaola-workflow/issue-1032/.cache/orchestration-surface-map.md
  result: ef0a6d5 的权威源—生成面—消费者图已落地；确认自适应 delegation 应归一为一个执行经济性判断，七字段 handoff/fixed per-spawn model/dispatch-log 全链路可删除，同时保留紧凑可执行交接、role tier/profile defaults、独立 acceptance 与历史 receipt 兼容

- item: 从 Issue #1032 acceptance 建立独立测试基线，证明删除旧机制而不引入新的调度 gate
  status: done
  dispatched: tdd-guide 在 issue-1032 worktree 只改既有测试以冻结 #1032 的删除结果并在 HEAD 证明 RED；测试文件本身为落点，不另写实现报告
  result: ef0a6d5 上 6 个既有 owner 测试完成删除式 RED；state/parser 以 17 failures 暴露旧字段，manifest 直接命中 dispatch-log hook，routing 以 7 failures 暴露退役 fixed-model marker，所有改动 node --check 与 diff --check 通过且未新增 suite/gate

- item: 以一个内聚 production owner 实现 state、routing、role、hook、telemetry 与文档的完整减法
  status: done
  dispatched: implementer 在 .kw/worktrees/issue-1032 统一拥有全部非测试 production/template/role/hook/telemetry/install/docs 变更，读取两份 surface map 与既有 RED，直接以 tracked diff 为落点，不另写实现报告
  result: .kw/worktrees/issue-1032 已落下 68-file canonical/edition implementation candidate，净删除约 2694 行；state/routing/hook/schema/telemetry 主链已删除，但 owner 被主会话在生成传播与 docs 前中断，active docs、生成 routing surfaces、forge sink copies 和 role wording 收敛仍待新 mission

- item: 收敛 canonical candidate 的生成副本、forge/runtime 安装面、role 合同与活跃文档，并消除所有生产侧旧机制残留
  status: done
  dispatched: 复用同一 implementer 读取当前 diff 和精准残留清单，完成非测试 production/docs 收敛、运行 generators 与 focused checks；仍以 tracked diff 为落点，不另写实现报告
  result: 120-file cohesive candidate 已落地，routing/reviewer/edition generators 与 script/contract checks 通过；114 个 production/docs 表面净删除约 4.3k 行，剩余一个明确 production finding 是 opencode buildResumeContext 仍读 current_phase/issue，另有 5 组旧测试 oracle 待独立 test owner 修正

- item: 修复 opencode active resume context 的最后一个 progress-state reader，并重新生成受影响 runtime surface
  status: done
  dispatched: 复用现有 implementer 只改 opencode canonical resume context 及其生成副本，以 claim facts + Mission List 为恢复来源，完成后运行对应 edition/focused checks
  result: canonical OpenCode resume context 与三份生成 plugin 已改用 name/status/branch/worktree/sink + Mission List 原文，current_phase/issue reader 删除；三 edition checks、edition-sync、node/diff checks 全绿，剩余 8 failures 均为 dispatch-log/fixed-model 旧测试

- item: 按真实 production candidate 修正剩余旧测试 oracle，删除 retired state/model/hook/custody 期待而不改变 #1032 acceptance
  status: done
  dispatched: 复用原 tdd-guide 只改既有 test/simulate/fixture owners，修正 implementer 已列出的 state/model/hook/custody/opencode/forge 旧期待并跑 focused suite；production/docs 只读
  result: 9 个既有 test owners 已更新且 8 组 focused suites 全绿（claim 833、Kimi 625、profile 808、OpenCode 663、outcome 80）；walkthrough 返回 FAIL，唯一首个 blocker 是已删除 hook 的 #338 dispatch-log-only 测试仍在执行，未发现 production defect

- item: 删除 root walkthrough 中最后一组只服务 dispatch-log hook/payload/attestation 的测试，并证明完整 walkthrough 越过该机制
  status: done
  dispatched: 复用原 tdd-guide 只删除已退休 dispatch-log producer/payload/active-attestation tests 和调用，保留 sink/closure/legacy receipt coverage，随后完整运行 walkthrough
  result: dispatch-log-only #338/#566/#567/#568/#816 测试与调用已删除，通用 sink marker 保留 sink 覆盖；walkthrough 越过该机制后返回 FAIL 于 #296 crash-resume 仍要求已退休 next_command，证明下一处旧 state oracle

- item: 删除 root walkthrough 中只服务 retired progress-state/terminal breadcrumb 的剩余断言，并保留 crash-resume、archive、sink 与 closure 行为证明
  status: done
  dispatched: 复用原 tdd-guide 只处理 next_command/phase/step/Last Evidence/Last Updated 等旧字段 oracle，改用 resumed/status/receipt/sink/absence 等存活行为，随后完整运行 walkthrough
  result: root walkthrough 退休 progress/evidence fixtures 与断言已删除或迁移到 resumed/reason/project、archive status、sink/receipt、claim/liveness/closure facts；完整 179 scenarios 全绿，node/diff checks 通过

- item: 对收敛候选做一次完整正确性复核，并把具体 finding 交回现有 owner 闭环
  status: done
  dispatched: code-reviewer 审查 ef0a6d5..当前 124-file 收敛候选、Issue #1032 acceptance、两份 surface map 与验证结果，finding 落主会话消息，不写 tracked 文件
  result: code-reviewer 在两次限定收敛请求后仍未返回任何 verdict 或 finding，主会话中断该 dispatch；该结果不作为通过证据，另追加一个以 canonical/high-risk 面和生成验证为边界的 bounded review mission

- item: 对 canonical/high-risk 变更与生成验证做 bounded correctness review，确认完整候选没有 claim/sink/install/custody 回归
  status: done
  dispatched: 新 code-reviewer 只审 canonical source、高风险 state/sink/install 边界和已有 parity/walkthrough 证据，禁止无界逐生成文件扫描，结果直接回主会话
  result: bounded reviewer 仍未在限定时间内返回 verdict，主会话中断并自行完成高风险 diff review；发现两项 concrete production findings：五 runtime installer 未把 dispatch hook 加入 RETIRED_HOOKS，tdd-guide 仍要求 mechanical test maintenance 先获 explicit exemption

- item: 修复 reviewer findings：升级清理五 runtime 的旧 dispatch hook，并消除 test-role 合同中的 explicit exemption 残留
  status: done
  dispatched: 复用 cohesive implementer 只改五 installer RETIRED_HOOKS、canonical tdd-guide/生成 profiles 与必要 docs，运行 installer/edition/profile focused checks
  result: implementer 未在限定时间内落盘后由 main inline 完成机械修复；五 installer 的 bounded RETIRED_HOOKS 均包含 dispatch hook，tdd-guide 与三 TOML 删除 exemption gate；五脚本 bash -n、profile parity 808 与 diff check 全绿

- item: 为 reviewer findings 更新既有 installer/profile 测试并证明升级清理与 custody 语义
  status: done
  dispatched: 复用原 tdd-guide 更新五 edition installer/role owner 测试，证明旧 hook 在 install+uninstall 的 bounded retirement 集合中且机械维护无需 exemption；production/docs 只读
  result: 原 tdd-guide 在多次限定后未落下本 mission 测试 diff，主会话中断该 dispatch；production bash/profile checks 已绿，但 installer retirement regression 仍缺独立 test proof

- item: 为五 runtime installer 的 dispatch-hook retirement 与 no-exemption custody 合同建立最小独立回归证明
  status: done
  dispatched: 新 tdd-guide 只改现有 edition/profile owners，以静态 bounded membership/consumer 断言冻结 7-file repair，不扫描其他机制
  result: 五 edition 各新增 RETIRED_HOOKS membership + install/uninstall consumer 证明，profile parity 816 全绿；Grok suite 返回 FAIL（11 failures/549 passed），因 G5 仍要求已删除 SubagentStart/payload dispatch hook，未发现 production defect

- item: 删除 Grok/Cursor/ZCode edition tests 中最后的 active dispatch-hook/payload 旧断言，并验证三 runtime surviving compact/install behavior
  status: done
  dispatched: 复用 fresh tdd-guide 只删三 edition retired hook 机制测试，保留 compact hook、native defaults、bounded installer retirement 与生成 parity，随后运行三 suite
  result: Grok 退休 dispatch 测试已删且 550 assertions 全绿；Cursor 删除 hook 测试后返回 FAIL（49 failures/791 passed），均来自 CURSOR_MODEL_DISPATCH_BLOCK/inherit/generalPurpose 等已由 D7 退休的 workflow-owned model dispatch oracle；ZCode 未运行

- item: 删除 Cursor/ZCode edition tests 中 workflow-owned fixed model dispatch 的最后旧 oracle，并保留 native profile/default capability
  status: done
  dispatched: 复用 fresh tdd-guide 只处理 Cursor G2/G10 与 ZCode 对 fixed per-spawn routing 的机制测试，保留 native tier/default metadata、runtime capability与 installer retirement，运行两 suite
  result: Cursor fixed dispatch oracle 已删除且 737 assertions 全绿；ZCode 保留 native GLM/thoughtLevel 后 686 passed/1 failed，R3 证明 uninstall_edition 未消费 RETIRED_HOOKS，确认一个 production cleanup defect

- item: 修复 ZCode uninstall 对 bounded RETIRED_HOOKS 的遗漏，并复核 installer retirement
  status: done
  dispatched: main inline 在 install-zcode.sh 的 project/global uninstall hooks 路径消费现有 RETIRED_HOOKS，不引入目录 sweep，随后运行 ZCode suite
  result: project/global uninstall 均以 basename 消费 bounded RETIRED_HOOKS；bash -n、ZCode 687 assertions 与 diff check 全绿，finding surface 已完成修复后复核

- item: 运行既有生成检查、完整 walkthrough 与 producer-selected chains，完成文档对接和 workflow finalization
  status: done
  dispatched: main 按 kaola-workflow-finalize 自行运行 final validation receipt、doc docking、gap sweep、finalize transaction 与 sink；doc-updater 仅做独立 ground-truth docking review
  result: 首次四链 receipt 为 FAIL：Claude script-sync mutation 仍假定 SubagentStart，Codex walkthrough 仍要求 dispatch hook，GitLab/Gitea validators 仍要求 Agent Model Dispatch；均为 #1032 删除机制后的旧 test oracle，finalize/sink 未执行

- item: 修复首次 final-chain 暴露的 Claude/Codex/GitLab/Gitea 旧 validator 与 walkthrough oracle
  status: done
  dispatched: tdd-guide 只改 test-validate-script-sync、Codex plugin walkthrough 与 GitLab/Gitea validators，删除 retired hook/fixed model 要求并保留 surviving parity/compact/native defaults
  result: script-sync 56 assertions 全绿；Codex AC1 与 forge fixed-model oracle 已删，focused run 返回新 FAIL 于 Codex #333 仍要求 next_command、GitLab/Gitea #400 仍要求 adaptiveSchema.NEXT_SKILL，均为 D2 退休 state pointer 的旧 oracle

- item: 删除 Codex plugin walkthrough 与 GitLab/Gitea validators 中剩余 next_command/NEXT_SKILL state-pointer oracle
  status: done
  dispatched: 复用 tdd-guide 只改三 owner，把 #333/#400 验收迁移到 Mission List resume + claim facts，保留 sink/closure/liveness，运行 focused commands
  result: FAIL — 子代理未产生目标文件改动或测试结果，主 orchestrator 在确认无活动测试进程后中止派发；不把协调等待继续当成效率收益

- item: 主线删除 Codex #333 与 forge #400 的退休 state-pointer oracle
  status: done
  dispatched: main orchestrator 内联改三 owner；#333 改验 archive terminal/claim/sink/closure facts，删除 forge NEXT_SKILL registry gate，不扩大到无关测试
  result: Codex walkthrough、GitLab validator、Gitea validator 均 exit 0；三文件 node --check 与 git diff --check 全绿

- item: 重新运行四链生成最终 receipt，完成 doc docking、gap sweep、finalize transaction 与 sink
  status: done
  dispatched: main orchestrator 运行四条 producer-selected chains
  result: FAIL — Claude kernel registry 仍称 workflow-state 为 position record；GitLab/Gitea walkthrough 仍要求退休 dispatch-log hook；receipt 已记录三条精确失败，finalize/sink 未执行

- item: 修复 kernel registry 与 forge walkthrough 的最后旧 ownership oracle
  status: done
  dispatched: main orchestrator 内联更新四份 shared kernel registry 为 claim/sink，并删除 GitLab/Gitea dispatch-log existence tests
  result: 变更严格限定于现有 registry 与两处纯退休机制测试；未新增替代 gate；kernel conformance 243 assertions、GitLab 461 spawns suite、Gitea 467 spawns suite 全绿

- item: 重新运行四链，生成最终 candidate receipt 后进入 docking/finalize/sink
  status: done
  dispatched: main orchestrator 运行四条 producer-selected chains；通过后再做 doc-updater docking、gap sweep 与 finalize
  result: FAIL — Claude bundle claim tests 仍要求 workflow_path；GitLab/Gitea Codex walkthrough 仍要求 SubagentStart dispatch-log；receipt 精确记录三项失败，finalize/sink 未执行

- item: 清理 bundle claim 的 workflow_path 旧 state oracle
  status: done
  dispatched: main orchestrator 内联只改 scripts/test-bundle-claim.js，把两个 persisted workflow_path 断言改为字段缺席，保留退休 flag warn-and-ignore 行为
  result: test-bundle-claim 196 tests 全绿；node --check 与 git diff --check 全绿

- item: 清理 GitLab/Gitea Codex walkthrough 的 dispatch-log/SubagentStart 旧 oracle
  status: done
  dispatched: fresh tdd-guide 并行只改两个 forge Codex walkthrough，保留 hooks JSON、SessionStart compact-context 与 forge-local compact-resume runtime surface
  result: GitLab/Gitea focused walkthrough 均 PASS（各 3 spawns）；两文件 node --check 与 scoped diff check 全绿，未新增替代 gate

- item: 再次运行四链，生成最终 candidate receipt 后进入 docking/finalize/sink
  status: done
  dispatched: main orchestrator 运行四条 producer-selected chains；仅以全绿 receipt 进入 docking
  result: FAIL — GitLab/Gitea 已绿；Claude routing mutation proof 仍要求 fixed per-spawn model era 的 adaptive-schema transitive dependency，四链 receipt 记录唯一失败

- item: 删除 routing mutation proof 对退休 model-routing kernel dependency 的旧 pin
  status: done
  dispatched: main orchestrator 只改 scripts/test-generate-routing-surfaces.js，保留 derived require graph、sandbox baseline 与 real-surface mutation proof
  result: 删除 adaptive-schema 两跳成员断言及陈旧注释；test-generate-routing-surfaces 433 assertions、node --check、git diff --check 全绿

- item: 运行最终四链并生成全绿 candidate receipt
  status: done
  dispatched: main orchestrator 运行四条 producer-selected chains，要求四 runtime 全绿且 receipt 绑定当前 candidate
  result: PASS — Claude、Codex、GitLab、Gitea 四链全部通过；全绿 receipt 写入 issue-1032/.cache/chain-receipt.json

- item: 完成独立文档对接审查与 finalization docking
  status: done
  dispatched: doc-updater 只审查 #1032 的真实实现 diff 与 active docs/CHANGELOG，对照 Issue 决策识别遗漏或陈旧叙述；输出 .cache/doc-updater.md
  result: DOCKED — 修复 CLAUDE、README、conventions 与 Cursor/Grok/OpenCode/ZCode 活跃文档硬冲突，补齐 CHANGELOG D4/D6/D7；未改历史 chronology；generation 18/18、Codex contracts、diff check 全绿，无 unresolved doc gap

- item: 基于文档对接后的最终 candidate 重新生成四链 receipt
  status: done
  dispatched: main orchestrator 再跑四条 producer-selected chains，使 receipt 绑定包含 docking 修正的最终树
  result: PASS — 文档 docking 后 Claude、Codex、GitLab、Gitea 四链全部通过；receipt 重新绑定当前 144 文件 candidate

- item: 写入 doc-docking receipt 并运行 run-gap sweep
  status: done
  dispatched: main orchestrator 根据独立 doc-updater receipt 写 .cache/doc-docking.md，随后运行 gap sweep 并逐项判定是否存在未承接缺口
  result: doc-docking status DOCKED；run-gaps sweptClasses=[]，gap-sweep --check PASS（mapped=0, filed=0, noise=0），无 follow-up 或用户决策项

- item: 写 finalization-summary 并通过 finalize 只读门
  status: done
  dispatched: main orchestrator 写完整 closing record，捕获 sink metadata，运行 claim finalize --keep-worktree --check --json 并清理全部 typed refusal
  result: 首次 check 唯一拒绝 implementation_commit_missing；mirror ready、staging guard ok、validation chains_green，说明 closing artifacts 已就绪且必须先提交 144 路径实现 diff

- item: 提交 #1032 实现候选并重新生成 exact-commit 四链 receipt
  status: done
  dispatched: main orchestrator 只 stage 当前 tracked implementation diff，创建 issue commit；随后在 clean commit 上重跑四链，使 finalize receipt 绑定 implementation SHA
  result: implementation commit 7e116d6c（144 files, +1714/-5999）；clean commit 上四链全部 PASS，receipt exact headSha 绑定 7e116d6c

- item: 通过 finalize check 并执行 resumable finalize transaction
  status: done
  dispatched: main orchestrator 复跑 --keep-worktree --check；仅在 ok=true 后运行实际 finalize，生成 closing commit 与 archive-ready authority
  result: check ok=true（reasons=[]，dirty_paths=[]，chains_green）；transaction status closed，archive invariant ok，claim label removed，issue close-pending，worktree/branch 保留给 sink

- item: 执行 merge sink、关闭 Issue #1032 并完成 closure audit
  status: done
  dispatched: main orchestrator 使用已捕获 branch=workflow/issue-1032、issue=1032、sink=merge 运行 resumable --sink transaction；成功后运行 closure audit
  result: sink status sinked，main 推送到 6b00da36，Issue #1032 远端 verified CLOSED，workflow branch 删除且 journal disposed；scoped closure audit current_project_clean=true、五类 drift 均 0，四项 repository 外部旧 citation drift 未触碰
