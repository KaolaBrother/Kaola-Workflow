# Finalization - Summary: issue-606

## Delivered

Claude dispatch posture (mirrors the settled Codex pattern), prompt-hardening + report-only detection: (1) `install.sh` gains a read-mode-only `detect_claude_dispatch_posture()` (env probe first, then `~/.claude/settings.json` → `$PWD/.claude/settings.json` → `$PWD/.claude/settings.local.json` `env`-block fallback) reporting `claude_dispatch_posture: teams | classic` in the post-install summary — non-fatal, never writes user config (test-asserted byte-unchanged settings), classic-led remediation; (2) the three workflow-init COMMAND surfaces gain the same posture note outside the byte-paired template block; (3) all six plan-run surfaces gain a byte-identical `#### Teammate-Mode Dispatch` subsection (named spawns = node id, mailbox returns, SendMessage repair nudges, sync-spawn exception, one-nudge idle-race discipline, transport-not-contract closing rule) with classic as the unchanged default; (4) needles in all five validators + route-reachability T14; (5) decision record docs/decisions/D-606-01.md.

## Files Changed

18 (+513/-0): install.sh, scripts/test-install-model-rendering.js, 6 plan-run surfaces, 3 workflow-init commands, 5 validators, scripts/test-route-reachability.js, docs/decisions/D-606-01.md; plus CHANGELOG.md (finalize window).

## Test Coverage

Hand-rolled assert suites (no coverage tooling). Behavioral: 4 new sandboxed posture cases in test-install-model-rendering.js (env-set / env-unset / settings-fallback / settings-byte-unchanged); route-reachability 245 (T14 new); validator needles per edition.

## Final Validation Evidence

- Binding receipt: `KAOLA_RUN_CHAINS_CONCURRENCY=serial KAOLA_RUN_CHAINS_TIMEOUT_MS=1500000 node scripts/kaola-workflow-run-chains.js --project issue-606` — claude/codex/gitlab/gitea ALL exit 0 (claude 976s), receipt headSha 3db2c398, completedAt 2026-07-03T08:49:47Z, workTreeHash covers the uncommitted CHANGELOG. Reuse boundary: covers everything through the merge commit + CHANGELOG; no edits after.
- First receipt attempt: claude exit 1 at exactly 900013ms — a timeout kill at the runner's default per-chain budget, NOT a test failure (all CHANGELOG-adjacent members green when run directly; the chain measured 821s pre-#606 and 976s with the new sandboxed-install cases). Remedied via the documented `KAOLA_RUN_CHAINS_TIMEOUT_MS` knob; recorded as a follow-up observation below.
- n4-review (opus) independently ran the four chains green before its verdict.
- Finalize gates: resume=0 gate=0 barrier=0 verdict=0; gap sweep: zero swept classes.

## Documentation Docking

DOCKED — `.cache/doc-docking.md` (zero gaps; chain-asserted docs verified no-impact; receipt preserved).

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| run-chains claude (1st attempt) | tool-environment: per-chain timeout artifact (900s default vs 976s real runtime) | main session (env knob) | .cache/chain-receipt.json (final, green) | resolved |

## Gate-surfaced incidents (recorded)

- The FIRST n4-review agent instance terminated unreachable without delivering (no idle notification, no error report). Node state was intact (in_progress, seeded stub only); a fresh opus reviewer was redispatched per the crash-resume contract and re-ran the full review + chains. verdict: pass, findings_blocking: 0.

## Follow-Up Items

- Observation (not filed — needs user permission): the claude chain's runtime (976s) now exceeds run-chains' 900s default per-chain timeout on this box; candidates are raising the default, or a receipt-visible warning when duration approaches the budget. Session-local remedy: `KAOLA_RUN_CHAINS_TIMEOUT_MS`.

## Closure Decision

No deferred/partial items block closure: all five issue-606 ACs verified met (n4 opus gate + green receipt + docking). No issue/roadmap reorganization performed. #606 closes at the sink.

## Commit And Push

Pending final Git gate (contractor Step 8 + sink-merge --sink); final hash reported after push.

## GitHub Issue

#606 — to be closed by sink-merge (--issue 606).

## Roadmap

Closure removes kaola-workflow/.roadmap/issue-606.md if present; ROADMAP.md regenerated once by cmdFinalize.

## Archive

Pending — kaola-workflow/archive/issue-606/ via cmdFinalize.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | timeout artifact resolved via env knob, no code fix to route |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (regen at cmdFinalize Step 8b) | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/upstream check | final gate runs after this file is committed |

## Status

ARCHIVED AFTER FINAL GIT GATE
