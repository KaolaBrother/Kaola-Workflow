# Workflow Plan — issue #277

<!-- plan_hash: f9a609c37c13c6b65a22d0a7b08e773b5042fc93b9e08741e56e5de9c5864aed -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| relocate-claude | implementer | — | agents/contractor.md, agents/workflow-planner.md, commands/kaola-workflow-phase6.md, commands/kaola-workflow-adapt.md | 1 | sequence |
| relocate-forge-cmds | implementer | relocate-claude | plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md | 1 | sequence |
| relocate-profiles | implementer | relocate-forge-cmds | plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 1 | sequence |
| skills-fallback | implementer | relocate-profiles | plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 1 | sequence |
| textlocks | implementer | skills-fallback | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 1 | sequence |
| closure-invariants | tdd-guide | textlocks | scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js | 1 | sequence |
| claim-posture-attest | tdd-guide | closure-invariants | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js | 1 | sequence |
| dispatch-hook | tdd-guide | claim-posture-attest | hooks/kaola-workflow-subagent-dispatch-log.sh, hooks/hooks.json, plugins/kaola-workflow-gitlab/hooks/kaola-workflow-subagent-dispatch-log.sh, plugins/kaola-workflow-gitlab/hooks/hooks.json, plugins/kaola-workflow-gitea/hooks/kaola-workflow-subagent-dispatch-log.sh, plugins/kaola-workflow-gitea/hooks/hooks.json | 1 | sequence |
| install-wiring | implementer | dispatch-hook | install.sh, scripts/validate-script-sync.js | 1 | sequence |
| simulate-coverage | tdd-guide | install-wiring | scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 1 | sequence |
| docs | doc-updater | simulate-coverage | README.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/api.md | 1 | sequence |
| security-review | security-reviewer | docs | — | 1 | sequence |
| code-review | code-reviewer | security-review | — | 1 | sequence |
| finalize | finalize | code-review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| relocate-claude | complete |
| relocate-forge-cmds | complete |
| relocate-profiles | complete |
| skills-fallback | complete |
| textlocks | complete |
| closure-invariants | complete |
| claim-posture-attest | complete |
| dispatch-hook | complete |
| install-wiring | complete |
| simulate-coverage | complete |
| docs | complete |
| security-review | complete |
| code-review | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (relocate-claude) | subagent-invoked | # Node Evidence: relocate-claude | |

| implementer (relocate-forge-cmds) | subagent-invoked | # Node Evidence: relocate-forge-cmds | |
| implementer (relocate-profiles) | subagent-invoked | # Node: relocate-profiles — Evidence Record | |
| implementer (skills-fallback) | subagent-invoked | # skills-fallback node evidence | |
| implementer (textlocks) | subagent-invoked | # Node Evidence: textlocks (M3) | |
| tdd-guide (closure-invariants) | subagent-invoked | # closure-invariants node evidence (M2 — #277 Phase 2) | |
| tdd-guide (claim-posture-attest) | subagent-invoked | # claim-posture-attest evidence | |
| tdd-guide (dispatch-hook) | subagent-invoked | # dispatch-hook node evidence | |
| implementer (install-wiring) | subagent-invoked | # Node: install-wiring — Evidence Record | |
| tdd-guide (simulate-coverage) | subagent-invoked | # simulate-coverage node evidence | |
| doc-updater (docs) | subagent-invoked | # docs node evidence — issue #277 | |
| security-reviewer | subagent-invoked | verdict: pass | |
| code-reviewer | subagent-invoked | verdict: pass | |
| finalize (finalize) | subagent-invoked | # Node Evidence: finalize (sink node) | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of the #277 delivery. This single adaptive run delivers
BOTH internal phases of #277 (Phase 1 = M3+M4, Phase 2 = M1+M2) and CLOSES the issue.
Full spec: `docs/investigations/2026-06-07-strict-lean-orchestrator-boundary.md`.

### Edition map (load-bearing for write-set disjointness)
- claude  → top-level `agents/` `commands/` `hooks/` `scripts/`
- codex   → `plugins/kaola-workflow/` (`.toml` agent profiles, `.codex-plugin/`, NO `commands/`, NO `hooks/hooks.json`)
- gitlab  → `plugins/kaola-workflow-gitlab/`
- gitea   → `plugins/kaola-workflow-gitea/`
All four plugin trees live under ONE top-level dir `plugins/`; the spine is fully
SEQUENTIAL (no fan-out, no antichain pairs) so exact-path disjointness is sufficient
and the concurrent-sibling checks never fire. Every production file that will change
appears in EXACTLY one node's declared_write_set (Phase-6 whole-plan `--barrier-check`
refuses any outOfAllow write). EXCLUDE the untracked junk dirs `--adaptive/` and
`--help/` from every write-set.

### Scope split: M1/M2 land ONLY on Claude-Code editions (claude/gitlab/gitea); Codex M1/M2 DEFERRED to #266
- M3 (procedure relocation) + M4 (always-worktree posture, run_posture, stale-doc fix)
  land on ALL FOUR editions incl. codex profiles.
- M1 (`SubagentStart` dispatch-log hook) + M2 (closure attestation invariants) land on
  claude/gitlab/gitea ONLY. Do NOT add the hook/invariant CHECK to codex profiles. The
  shared `closure-contract.js` byte-identical group still forces the codex copy to carry
  the invariant DEFINITION (byte-sync), but the codex claim port does not enforce M1/M2.

### Byte-identical groups (validate-script-sync.js) — must be edited together, in ONE node
- `closure-contract.js` ×4 (scripts/ + 3 plugin trees) → node `closure-invariants`.
- `validate-workflow-contracts.js` is a COMMON_SCRIPTS member: Claude `scripts/` copy ≡
  Codex `plugins/kaola-workflow/scripts/` copy byte-for-byte → both in node `textlocks`.
- `adaptive-schema.js` is NOT touched by this issue (no cap/constant change).

### Per-node intent

- **relocate-claude** (implementer; non_tdd_reason: pure procedure RELOCATION / text
  move — no natural failing unit test). M3: move the FULL mechanical procedure OUT of
  the orchestrator command files INTO the subagent profiles as the SOLE home.
  `agents/contractor.md` gains the Phase-6 Step 8a/8b/7/8 finalize procedure verbatim;
  `commands/kaola-workflow-phase6.md` keeps ONLY a thin contractor dispatch handle (no
  runnable body). `agents/workflow-planner.md` gains the claim+author+handoff procedure;
  `commands/kaola-workflow-adapt.md` keeps only the dispatch handle. Also (M4) fix the
  STALE `agents/workflow-planner.md` line that claims "adaptive does NOT provision a
  worktree" (false since #265).

- **relocate-forge-cmds** (implementer; non_tdd_reason: edition mirror of the command
  relocation). Mirror relocate-claude's command-file changes into the gitlab + gitea
  command files (thin dispatch handles only; bodies removed).

- **relocate-profiles** (implementer; non_tdd_reason: profile text relocation, ×4
  editions). Land the relocated procedure + M4 posture/stale-doc text into the codex,
  gitlab, gitea agent `.toml` profiles (contractor + workflow-planner) so each profile
  is the sole home of its seam's procedure for its edition.

- **skills-fallback** (implementer; non_tdd_reason: skill prose edit). M3: DELETE the
  "may run inline" fallback grants from the adapt + finalize SKILL.md files EXCEPT the
  genuine `local-fallback-tool-unavailable` escape (which must itself be logged). adapt
  SKILL.md is codex-only; finalize SKILL.md is codex + gitlab + gitea.

- **textlocks** (implementer; non_tdd_reason: assertion-string edits in the contract
  validators — verified by RUNNING the validators + npm test, not a unit test). M3:
  ADD the missing contractor-dispatch text-lock (today `subagent_type="contractor"` =
  ZERO hits) and DROP the inline-procedure text-locks (locking the body makes it
  copyable — lock the HANDLE, not the BODY). The Claude `scripts/` copy and the Codex
  `plugins/kaola-workflow/scripts/` copy of `validate-workflow-contracts.js` MUST stay
  byte-identical (write both byte-for-byte). Ports: `validate-kaola-workflow-contracts.js`
  (Codex-only) + gitlab + gitea contract validators get the same lock changes.

- **closure-invariants** (tdd-guide; behavioral fail-closed LOGIC, unit-testable). M2:
  add `claim-planner-attested` (planner spawn before freeze) + `finalize-contractor-attested`
  (contractor spawn in the finalize window) to `closure-contract.js` CLOSURE_INVARIANTS,
  receipts default `failed` (fail-closed, like the existing 7). WARN-FIRST: a missing
  attestation logs a LOUD warning + records it in the closure receipt but does NOT block
  (this run's own finalize must NOT be hard-blocked by an attestation it cannot yet have).
  All 4 closure-contract.js copies stay byte-identical.

- **claim-posture-attest** (tdd-guide; behavioral LOGIC, unit-testable). M4: startup
  DERIVES `run_posture: worktree|in-place` (from the worktree resolution, NOT inherited
  env) and records it in `workflow-state.md`; NO `--worktree` flag. M2: `checkClosureInvariants`
  wires the two new invariants WARN-FIRST (warn + receipt, no hard block yet). Apply to
  claim.js ×4 (gitlab/gitea use the renamed `kaola-gitlab-/kaola-gitea-` ports); codex
  claim carries the run_posture derivation but NOT the M2 invariant enforcement.

- **dispatch-hook** (tdd-guide; behavioral hook, unit-testable). M1: NEW `SubagentStart`
  hook script that appends `agent_type`+`agent_id`+`cwd` (one JSON line) to an append-only
  `kaola-workflow/{project}/.cache/dispatch-log.jsonl`; wire it into each Claude-Code
  edition's `hooks.json`. Claude-Code editions ONLY (claude/gitlab/gitea) — codex has no
  `hooks/hooks.json` and Codex M1 is deferred to #266.

- **install-wiring** (implementer; non_tdd_reason: install/merge shell wiring). Wire the
  new hook script into `install.sh` (settings.json hook merge + the 3 `SUPPORT_HOOK_NAMES`
  blocks, one per Claude-Code forge). Codex install path unchanged (no hook). ALSO register
  the new dispatch-log hook as a byte-identical group in `scripts/validate-script-sync.js`
  (3 copies: claude top-level + gitlab + gitea, mirroring the phantom-advisor 3-copy group)
  so cross-edition drift of the new hook is script-enforced like every other hook (added by
  governance plan-repair 2026-06-07; install-wiring depends_on dispatch-hook so the 3 copies
  already exist).

- **simulate-coverage** (tdd-guide; adds regression coverage for the new logic). Add
  simulate coverage for run_posture derivation, the warn-first closure invariants, and the
  dispatch-log hook across the 6 simulate walkthroughs (claude, codex, gitlab×2, gitea×2).
  Each walkthrough tests its own surface — do NOT byte-sync them.

- **docs** (doc-updater; docs-only write set → exempt from G1). Update README (new
  always-worktree posture + dispatch-log + invariants), docs/architecture.md (the seam
  enforcement model), docs/workflow-state-contract.md (`run_posture` durable field +
  `.cache/dispatch-log.jsonl`), docs/conventions.md (the strict subagent-seam rule).
  CHANGELOG.md is reserved to the finalize sink (NOT written here).

- **security-review** (security-reviewer). Positioned to post-dominate the
  security-relevant nodes (closure-invariants, claim-posture-attest, dispatch-hook,
  install-wiring): closure enforcement, a spawn-observing hook, settings.json merge.
  Read-only governance posture (no write set).

- **code-review** (code-reviewer). G1: post-dominates EVERY implement node (the fully
  sequential spine routes all of them through this single reviewer before the sink).

- **finalize** (finalize sink; writes only `CHANGELOG.md`). Adds the [Unreleased] entry;
  the contractor runs the Phase-6 8a/8b/7/8 bookkeeping at finalize.

### Acceptance (whole-plan, at finalize)
- `node scripts/simulate-workflow-walkthrough.js` (and the per-edition simulates) green.
- `node scripts/validate-workflow-contracts.js` + the 3 other contract validators green
  (contractor text-lock present; inline-body locks dropped).
- `node scripts/validate-script-sync.js` green (closure-contract ×4 + validate-workflow-contracts
  Claude≡Codex byte-identity holds).
- `npm test` green ×4 editions.
- Phase-6 whole-plan `--barrier-check` clean (every changed production file is in exactly
  one node's write-set).

### Out of scope
- Per-node loop provenance (`adaptive-node.js`) and the sink (`sink-merge.js`) — intended
  main-direct (ADR 0004/0005, 0002); §5 forbids adding provenance there.
- Codex M1/M2 (the SubagentStart hook + invariant ENFORCEMENT on the codex claim) —
  deferred to #266. The `--worktree` flag — explicitly rejected (owner decision 2026-06-07).
- Hard-refuse escalation of the attestation invariants — Phase 2 is WARN-FIRST only.
