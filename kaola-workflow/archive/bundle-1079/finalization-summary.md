# Finalization Summary — bundle-1079 (issue #1079)

## Delivered

ZCode 的 Workflow Next / Finalize 通过原生 Skill invocation 加载与跨 compact 恢复：
`.zcode/skills/{kaola-workflow-next,kaola-workflow-init,kaola-workflow-finalize}/SKILL.md`
取代 `.zcode/commands/` 平面命令；zcode 加入 always-loaded-carrier 运行时集合，
`~/.zcode/AGENTS.md` managed region 渲染完整 compact-recovery prompt（prefix 跨 compact
存活，KPR #75），恢复经原生 Skill 重调完成，绝不手动 `read`。无 hook、插件或第二状态系统；
Codex compact hook 路径不变。

- Candidate: ad5d9e48c80c07afa41dbb19942c09e3f8f616d5（workflow/bundle-1079，基于 main c1a77d60 的 rebase 后两提交）
- 设计记录: kaola-workflow/bundle-1079/design-freeze.md；Mission List 8/8 done
- Live 证据: kaola-workflow/bundle-1079/live-evidence/（8/8 legs PASS，30 张 receipt）

## Files Changed

21 files, +572/−272（vs c1a77d60）:
- 适配器权威: templates/agents/runtime-capabilities.json（zcode compact_protocol 实测化 +
  证据 zcode_native_skill_20260919）、templates/global/runtime-contract-adapters.json（zcode-local reload）
- 路由/生成器: scripts/generate-routing-surfaces.js（zcode ∈ RECOVERY_FULL_DISPATCH_RUNTIMES，
  与 dsh 并集）、scripts/sync-zcode-edition.js（skills lane 渲染 + commands lane 退役）
- 安装器: install-zcode.sh（skills 部署、legacy command 精确退役、uninstall 仅删部署物；
  收尾修复：manifest 循环去除进程替换死锁）
- 测试: test-zcode-edition.js（506 断言 skills lane 重写 + G8-retire 新用例 + G5b 边界 pin）、
  test-zcode-install-trust.js、test-route-reachability.js、test-runtime-agent-architecture.js、
  test-issue-1053、test-issue-1055(+baseline 重捕获)、test-issue-1044-runtime-adapters、
  test-issue-1046、test-issue-1051、simulate-workflow-walkthrough.js
- 文档: docs/zcode-edition.md、docs/api.md、docs/runtime-capabilities.md、README.md、CHANGELOG.md

## Test Coverage

- test-zcode-edition（506 断言）覆盖：skills 集合与注册表 parity、frontmatter 精确形状、
  deferred dispatch pointer 恰好一次、G2-carrier 对 renderCompactRecoveryPrompt('zcode') 的 pin、
  forge 轴三树、安装器 project/global 部署与 legacy 退役、无 hook/无第二状态边界。
- test-zcode-install-trust（49）+ test-zcode-hook-protocol（32）保持 receipt/配置边界。
- route-reachability（148）zcode lane 指向 skillRel/renderSkill。

## Validation

- 四链回执: kaola-workflow/bundle-1079/.cache/chain-receipt.json 绑定 ad5d9e48，clean tree，
  claude/codex/gitlab/gitea 全 exit 0 无豁免（1 attempt）。
- final-validation.md: verdict: pass（validated_candidate_hash 526a9709…，绑定候选树）。
- editions lane 11/11 suites 绿（含 zcode 506 断言、dsh/devin/droid/cursor/grok/kimi/opencode）。
- simulate-workflow-walkthrough 178/178。
- focused suites 全绿（清单见 mission-list M8 result）。
- Live ZCode ACP legs（真实 ZCode 3.12.3 + KPR adapter 0.3.3，隔离 fixture 由候选安装器部署）：
  原生 Skill tool_call 初调与手动 /compact 后重调、唯一 body marker、finalize 原生加载
  （slash 正文注入载体，已记录）、普通消息负例、新会话发现、精确停止零残留。
- 未验证边界: 真实 1M auto-compact NOT-VERIFIED（设计冻结约定）→ 已立 follow-up #1084（P3）；
  `/$<name>` 形式未重跑（上游 KPR #94 已证）。

## Changed Paths

finalize transaction 报告（finalize --check，2026-09-20）：CHANGELOG.md, README.md,
docs/api.md, docs/runtime-capabilities.md, docs/zcode-edition.md, install-zcode.sh,
scripts/fixtures/issue-1055-render-baseline.json, scripts/generate-routing-surfaces.js,
scripts/simulate-workflow-walkthrough.js, scripts/sync-zcode-edition.js,
scripts/test-issue-1044-runtime-adapters.js, scripts/test-issue-1046-global-contract.js,
scripts/test-issue-1051-global-contract.js, scripts/test-issue-1053-next-task-quality.js,
scripts/test-issue-1055-render-subtraction-oracle.js, scripts/test-route-reachability.js,
scripts/test-runtime-agent-architecture.js, scripts/test-zcode-edition.js,
scripts/test-zcode-install-trust.js, templates/agents/runtime-capabilities.json,
templates/global/runtime-contract-adapters.json（21 项，与 summary 的 Files Changed 一致；
dirty_paths 为空）。

## Documentation Docking

DOCKED — kaola-workflow/bundle-1079/.cache/doc-docking.md（docs/zcode-edition.md、docs/api.md、
docs/runtime-capabilities.md、README.md、CHANGELOG.md、installer/generator 注释；architecture 无影响）。

## Follow-Up Items

- filed: #1084（P3）— ZCode 真实 1M auto-compact 原生 Skill 恢复腿补证（#1079 的 NOT-VERIFIED 边界）。
  确认存在且 body 非空（gh issue view 1084，body_len=961）。

## Final Readiness

就绪。8/8 missions done；候选 ad5d9e48 经四链、editions lane、walkthrough、focused suites 与
live legs 验证；文档 docked；遗留边界已立案。进入 archive + sink。

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1079/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1079/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1079/.cache/final-validation.md
- kaola-workflow/archive/bundle-1079/.cache/mirror-digest.json
- kaola-workflow/archive/bundle-1079/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1079/design-freeze.md
- kaola-workflow/archive/bundle-1079/finalization-summary.md
- kaola-workflow/archive/bundle-1079/live-evidence/README.md
- kaola-workflow/archive/bundle-1079/live-evidence/capture-compact.json
- kaola-workflow/archive/bundle-1079/live-evidence/capture-compact.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/capture-finalize-c.json
- kaola-workflow/archive/bundle-1079/live-evidence/capture-finalize.json
- kaola-workflow/archive/bundle-1079/live-evidence/capture-finalize.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/capture-next-1.json
- kaola-workflow/archive/bundle-1079/live-evidence/capture-next-1.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/capture-next-2.json
- kaola-workflow/archive/bundle-1079/live-evidence/capture-next-2.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/capture-next-b.json
- kaola-workflow/archive/bundle-1079/live-evidence/capture-next-b.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/capture-plain.json
- kaola-workflow/archive/bundle-1079/live-evidence/capture-plain.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/capture-probe.json
- kaola-workflow/archive/bundle-1079/live-evidence/capture-probe.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/preflight-a.json
- kaola-workflow/archive/bundle-1079/live-evidence/preflight-a.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/send-compact.json
- kaola-workflow/archive/bundle-1079/live-evidence/send-compact.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/send-finalize-c.json
- kaola-workflow/archive/bundle-1079/live-evidence/send-finalize.json
- kaola-workflow/archive/bundle-1079/live-evidence/send-finalize.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/send-next-1.json
- kaola-workflow/archive/bundle-1079/live-evidence/send-next-1.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/send-next-2.json
- kaola-workflow/archive/bundle-1079/live-evidence/send-next-2.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/send-next-b.json
- kaola-workflow/archive/bundle-1079/live-evidence/send-next-b.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/send-plain.json
- kaola-workflow/archive/bundle-1079/live-evidence/send-plain.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/send-probe.json
- kaola-workflow/archive/bundle-1079/live-evidence/send-probe.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/start-a.json
- kaola-workflow/archive/bundle-1079/live-evidence/start-a.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/start-b.json
- kaola-workflow/archive/bundle-1079/live-evidence/start-b.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/start-c.json
- kaola-workflow/archive/bundle-1079/live-evidence/status-a.json
- kaola-workflow/archive/bundle-1079/live-evidence/status-a.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/status-b.json
- kaola-workflow/archive/bundle-1079/live-evidence/status-b.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/stop-a.json
- kaola-workflow/archive/bundle-1079/live-evidence/stop-a.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/stop-b.json
- kaola-workflow/archive/bundle-1079/live-evidence/stop-b.stderr
- kaola-workflow/archive/bundle-1079/live-evidence/stop-c.json
- kaola-workflow/archive/bundle-1079/mission-list.md
- kaola-workflow/archive/bundle-1079/workflow-state.md
