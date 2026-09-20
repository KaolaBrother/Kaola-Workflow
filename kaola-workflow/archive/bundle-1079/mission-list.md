# Issue #1079 — ZCode: Workflow Next/Finalize recover via native Skill invocation

Goal: on ZCode, starting/resuming Workflow Next and switching to Finalize load the
full prompt through ZCode's native Skill invocation (`/<skill-name>` → ACP `tool_call
title=Skill`), not AGENTS.md recovery prose, role guessing, or manual `read`. Codex
compact hook path unchanged; no second state system.

## Missions

- item: M1 — Freeze verified design facts and the minimal design: skill basenames,
  `.zcode/skills/` tree shape, global-carrier change, command retirement, and the
  evidence boundary from /tmp/kpr-zcode-native-live-cMR6oa + KPR #94.
  status: done
  dispatched: self — design record lands in kaola-workflow/bundle-1079/design-freeze.md
  result: kaola-workflow/bundle-1079/design-freeze.md — skills replace commands under
  .zcode/skills/<skill-basename>/, zcode joins RECOVERY_FULL_DISPATCH_RUNTIMES, adapter
  + registry + installer updated; no #94 dependency, no hooks/second-state.
- item: M2 — Adapter authority: zcode `compact_protocol` + `delegation_guidance` in
  templates/agents/runtime-capabilities.json; zcode-local `reload` in
  templates/global/runtime-contract-adapters.json; add zcode to
  RECOVERY_FULL_DISPATCH_RUNTIMES in scripts/generate-routing-surfaces.js; update
  affected contract/adapter/reachability tests to the new measured design.
  status: done
  dispatched: self — edits land in the bundle-1079 worktree templates/scripts/tests
  result: zcode adapter records the measured carrier (AGENTS.md managed region survives
  compact per KPR #75; recovery via native /kaola-workflow-next|finalize Skill invocation,
  never manual read) + evidence zcode_native_skill_20260919; registry zcode-local.reload
  updated; zcode joins RECOVERY_FULL_DISPATCH_RUNTIMES + renderCompactRecoveryPrompt
  allow-list; test-issue-1044-runtime-adapters/1046/1051 pins updated (65+161+50 pass).
  Remaining RED in test-runtime-agent-architecture A10-pointer is M3 scope (zcode render
  must defer the dispatch block).
- item: M3 — ZCode edition surface: sync-zcode-edition.js renders
  `.zcode/skills/{kaola-workflow-next,kaola-workflow-init,kaola-workflow-finalize}/SKILL.md`
  from the canonical command surfaces with ZCode transforms (skill basename mapping,
  `/workflow-next`→`/kaola-workflow-next` route rename, deferred dispatch block);
  retire `.zcode/commands/`; regenerate all three forge trees to byte parity.
  status: done
  dispatched: self — edits land in the bundle-1079 worktree scripts/sync-zcode-edition.js
  and the regenerated .zcode*/ trees
  result: sync-zcode-edition.js renders .zcode/skills/{kaola-workflow-next,kaola-workflow-init,
  kaola-workflow-finalize}/SKILL.md (name+description frontmatter, ZCODE_HOME resolver,
  zcode adapter block via the always-loaded carrier, deferred dispatch pointer, native-route
  cards, /workflow-next|init → /kaola-workflow-* route renames); commands lane fully retired
  (all *.md pruned, dir removed); all three forge trees regenerated, --check parity green.
  Verified zcode compact-recovery render carries dispatch contract + zcode adapter once.
  test-runtime-agent-architecture + test-route-reachability + test-zcode-edition still RED
  on the old command-lane consumer API — M5 scope.
- item: M4 — install-zcode.sh deploys skills to project `.zcode/skills/` or
  `${ZCODE_HOME}/skills/` (--global), retires the three legacy command files, and
  uninstall removes only Kaola-deployed artifacts.
  status: done
  dispatched: self — edits land in the bundle-1079 worktree install-zcode.sh
  result: install-zcode.sh deploys .zcode/skills/<name>/SKILL.md to project or
  ${ZCODE_HOME}/skills (--global); retires the three legacy command basenames by exact
  name (user files untouched); uninstall removes only Kaola artifacts (skills, retired
  commands, agents, support scripts, edition dir, receipt-owned hooks). Smoke-tested
  project + global install/uninstall in /tmp sandbox with ZCODE_HOME redirected —
  layouts exact, user-owned commands/user-own.md preserved, zhome empty after uninstall.
- item: M5 — Edition/contract test updates plus new #1079 coverage: generated skill
  bytes, installer deploy+retire, zcode lane in route-reachability, and the
  measured-boundary pins (no hook/plugin/second-state).
  status: done
  dispatched: self — edits land in the bundle-1079 worktree scripts/test-*.js
  result: test-zcode-edition.js rewritten to the skills lane (506 assertions: skill set
  parity, exact name+description frontmatter, deferred pointer once on next/finalize,
  no dispatch/delegation markers, G2-carrier pins on renderCompactRecoveryPrompt('zcode'),
  installer skills deploy, new G8-retire project+global legacy-command retirement cases,
  G5b measured boundaries — no hook/plugin/second-state); zcode lanes updated in
  test-route-reachability, test-runtime-agent-architecture, test-issue-1053,
  simulate-workflow-walkthrough, test-issue-1055 (+baseline recaptured per policy),
  test-zcode-install-trust. All green incl. generate-routing-surfaces --check (24 surfaces)
  and the 1044/1046/1051/1054 contract suites.
- item: M6 — Docs: docs/zcode-edition.md, docs/api.md, docs/runtime-capabilities.md,
  README.md, CHANGELOG.md [Unreleased], decision doc if the design record changes.
  status: done
  dispatched: self — edits land in the bundle-1079 worktree docs/, README.md, CHANGELOG.md
  result: docs/zcode-edition.md rewritten around the #1079 native-Skill design (keeps all
  D2-pinned historical tokens: 3.10.1, 1M window, self-lock, unknown boundaries);
  docs/api.md compact-lifecycle paragraph + install-zcode.sh row updated;
  docs/runtime-capabilities.md ZCode compact row + 2026-09-19 native-Skill measurement added;
  README delivery table ZCode row → Skills; CHANGELOG [Unreleased] entry added.
  No design change → no new decision doc. test-zcode-edition (506) + walkthrough (178/178)
  green after the edits.
- item: M7 — Live ZCode legs via the proven ACP adapter: initial `/kaola-workflow-next`
  Skill tool_call + body marker, manual `/compact` then same native reload,
  missions-done → `/kaola-workflow-finalize`, resume/new session, ordinary-worker
  negative, bounded auto-compact leg or explicit NOT-VERIFIED marker; exact stop,
  zero residue. Evidence under this run's folder.
  status: done
  dispatched: self — evidence lands in kaola-workflow/bundle-1079/live-evidence/
  result: kaola-workflow/bundle-1079/live-evidence/README.md + 30 JSON receipts — 8 legs
  PASS against the candidate-deployed skills in an isolated fixture: native Skill
  tool_call + unique body marker; /kaola-workflow-next Skill tool_call pre/post manual
  /compact (fresh triple after compact); finalize switch loads natively via slash-body
  inclusion (carrier nuance documented); ordinary-message negative (no Skill call);
  fresh session B invocation; exact stop exit 0, residual_pids=[], files_changed=0.
  Auto-compact leg NOT-VERIFIED per design freeze; /$<name> not re-run (upstream-proven).
- item: M8 — Freeze candidate SHA; run repo-required validation (focused suites,
  editions chain, simulate-workflow-walkthrough, and the run's chain receipts);
  record actual diff, raw evidence, unverified boundaries.
  status: done
  dispatched: self — commits + receipts in the bundle-1079 worktree and run folder
  result: FINAL (post-rebase) candidate ad5d9e48c80c07afa41dbb19942c09e3f8f616d5 —
  two commits on workflow/bundle-1079 rebased onto main c1a77d60 (#1080 CLAUDE.md
  retirement + #1083 changed_paths merged): 2467674c feat + ad5d9e48 fix; 21 files,
  +572/-272 vs c1a77d60. Rebase conflicts merged semantically: CHANGELOG [Unreleased]
  keeps #1083 Fixed + #1080 Removed/Changed + #1079 Changed; docs/api.md keeps main's
  sync-row (dsh) + my install-zcode row; RECOVERY_FULL_DISPATCH_RUNTIMES = union
  [grok cursor devin droid dsh zcode]; #1055 baseline recaptured from merged canonical
  (132 records). Render parity: generate-routing-surfaces --check 24 surfaces,
  sync-zcode --check x3 forges; zcode skills now render #1080's AGENTS.md init prose.
  Validation: focused suites green (zcode-edition 506, hook-protocol 32, install-trust
  49, reachability 148, architecture 742, 1044x2, 1046 170, 1051 50, 1053 264, 1054
  173, 1055 oracle); EDITIONS LANE ALL 11 SUITES GREEN (D0 recovered as predicted);
  walkthrough 178/178; chain receipt kaola-workflow/bundle-1079/.cache/chain-receipt.json
  binds ad5d9e48, clean tree, claude/codex/gitlab/gitea all exit 0 unwaived, 1 attempt.
  Fix ad5d9e48: installer manifest loops replaced < <(node ...) process substitution
  with $(...) + herestring — the procsub child intermittently deadlocked on a full
  self-pipe under never-EOF stdin (claude-chain 1800s timeouts x2); 3x open-stdin
  stress runs pass post-fix. Boundaries unchanged: real 1M auto-compact NOT-VERIFIED;
  finalize slash-body-inclusion carrier note; /$<name> not re-run.
