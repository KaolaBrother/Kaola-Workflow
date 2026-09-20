# Issue #1085 — Pink class 2 文案修正（Kimi secondary-model 去 experimental 措辞；Codex 0.155.1 agents 目录发现路径改写注册叙述）

证据基线：`kaola-workflow/pink-class2-verify/VERDICT.md`（Claude Code 独立实机核验，2026-09-21，
HEAD 786af12a）。Grok explore 项核验不成立，本轮不改其文案。

## Missions

- item: 改 Kimi secondary-model 措辞四处（docs/kimi-edition.md:53、:63；docs/runtime-capabilities.md:268；templates/agents/runtime-capabilities.json kimi availability），按实测改为 optional/user-owned、未设置即继承会话模型与 effort，不再称 experimental
  status: done
  dispatched: self
  result: worktree workflow/bundle-1085 四处已改；docs/runtime-capabilities.md:268 处另附 live inheritance（2026-09-21）实测注；ADR 0021 加日期化 Measured refresh 注（#1085 先例格式）

- item: 改 Codex 注册叙述四处（docs/architecture.md:573-574；docs/conventions.md:64-65；docs/runtime-capabilities.md:32；docs/api.md:1848-1850），先述 $CODEX_HOME/agents 递归发现（name 为身份源），再述托管 [agents.<role>]+config_file 块为补充声明/安装器修剪路径；agents.toml 非查找路径句保留
  status: done
  dispatched: self
  result: worktree 四处已改，两句 agents.toml 保留原意；CHANGELOG 历史条目不动（记录当时事实）

- item: 更新 templates/agents/runtime-capabilities.json 证据面（kimi 增加 secondary_model GA 实测条目；codex 增加 agents 目录发现实测条目；observed_at 2026-09-21）
  status: done
  dispatched: self
  result: 新增 kimi_secondary_model_ga_20260921 与 codex_agents_dir_discovery_20260921（locator #1085），挂接 kimi 与三个 codex runtime 条目 evidence 数组；JSON 解析与 generate-agent-profiles --check 通过

- item: 文档勾稽（README/docs 索引如涉）+ CHANGELOG [Unreleased]
  status: done
  dispatched: self
  result: README/docs 索引无涉（grep 零命中）；CHANGELOG 新增 [Unreleased] Changed 条目完整记录两项实测与 Grok 不成立结论

- item: 验证：聚焦套件（能力表/文档相关）+ node scripts/simulate-workflow-walkthrough.js
  status: done
  dispatched: self
  result: 全绿：generate-agent-profiles --check（42 renders）、validate-vendored-agents、test-kimi-edition（434 断言；.kimi 三 forge 镜像经 sync --write 再生成后 parity，树根落主检出为脚本设计）、test-grok-edition（412）、test-issue-1044-runtime-adapters（65）、test-runtime-agent-architecture（742）、validate-workflow-contracts、edition-sync --check、generate-routing-surfaces --check（24 面）、validate-script-sync、codex plugin walkthrough（165 spawns）、集成 walkthrough 178/178、test-release-surface-drift（9）、test-edition-sync（28）
