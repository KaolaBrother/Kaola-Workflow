# Workflow Plan — issue #266

<!-- plan_hash: 1db18045c78719e9a7113fc59317d2f55c1675415df36d031d3b82ace1fd0ec1 -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| explore | code-explorer | — | — | 1 | sequence |
| architect | code-architect | explore | — | 1 | sequence |
| skill-dispatch-text | implementer | architect | plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md | 1 | sequence |
| preflight | tdd-guide | skill-dispatch-text | scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, scripts/validate-script-sync.js | 1 | sequence |
| task-mirror | tdd-guide | preflight | scripts/kaola-workflow-task-mirror.js, plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-task-mirror.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-task-mirror.js | 1 | sequence |
| compact-hook | tdd-guide | task-mirror | plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js | 1 | sequence |
| script-registration | implementer | compact-hook | install.sh, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 1 | sequence |
| tests | tdd-guide | script-registration | plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence |
| version-parity | implementer | tests | plugins/kaola-workflow/.codex-plugin/plugin.json, plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json, plugins/kaola-workflow-gitea/.codex-plugin/plugin.json, README.md | 1 | sequence |
| docs | doc-updater | version-parity | docs/architecture.md, docs/workflow-state-contract.md, docs/api.md, docs/conventions.md, AGENTS.md | 1 | sequence |
| security-review | security-reviewer | docs | — | 1 | sequence |
| code-review | code-reviewer | security-review | — | 1 | sequence |
| finalize | finalize | code-review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| explore | complete |
| architect | complete |
| skill-dispatch-text | complete |
| preflight | complete |
| task-mirror | complete |
| compact-hook | complete |
| script-registration | complete |
| tests | complete |
| version-parity | complete |
| docs | complete |
| security-review | complete |
| code-review | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (explore) | subagent-invoked | # explore — structural findings for issue #266 (code-explorer, read-only) | |

| code-architect (architect) | subagent-invoked | # architect — implementation blueprint for issue #266 (code-architect, read-only | |
| implementer (skill-dispatch-text) | subagent-invoked | # skill-dispatch-text — node evidence (issue #266, AC-A) | |
| tdd-guide (preflight) | subagent-invoked | # preflight — node evidence (issue #266, AC-B) | |
| tdd-guide (task-mirror) | subagent-invoked | # task-mirror — node evidence (issue #266, AC-C) | |
| tdd-guide (compact-hook) | subagent-invoked | # compact-hook — node evidence (issue #266, AC-E + AC-F) | |
| implementer (script-registration) | subagent-invoked | # script-registration node evidence — issue #266 | |
| tdd-guide (tests) | subagent-invoked | # tests — AC-7 evidence for issue #266 | |
| implementer (version-parity) | subagent-invoked | # version-parity (AC-8) — VERIFICATION-ONLY (no version bump) | |
| doc-updater (docs) | subagent-invoked | # docs — node evidence (issue #266, AC-D) | |
| security-reviewer | subagent-invoked | verdict: pass | |
| code-reviewer | subagent-invoked | verdict: pass | |
| finalize (finalize) | subagent-invoked | # finalize (sink) — issue #266 | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe spec of the #266 Codex harness-hardening enhancement. #266 is the direct
continuation of #277, which explicitly DEFERRED "Codex M1/M2 (the SubagentStart hook +
invariant ENFORCEMENT on the codex claim)" to this issue. #266 *complements* (does not
depend on) the still-OPEN #247/#248 prose-wording work; AC-C/AC-D do NOT assume that
prose already landed.

### Edition map (load-bearing for write-set placement)
- claude  → top-level `scripts/`, `commands/`, `hooks/`, `agents/`, `docs/`, README.md
- codex   → `plugins/kaola-workflow/` (skills, `.codex-plugin/`, `.toml` profiles, NO
            `commands/`, NO `hooks/hooks.json`)
- gitlab  → `plugins/kaola-workflow-gitlab/`
- gitea   → `plugins/kaola-workflow-gitea/`
All four plugin trees live under ONE top-level dir `plugins/`, so the validator's
top-level-directory disjointness check would treat any two edition nodes as overlapping —
edition work MUST be `sequence`, never `fanout`. The spine is fully SEQUENTIAL (no fan-out,
no antichain pairs), so the inferred concurrent-sibling disjointness check never fires
(plan-validator lines 712-713: antichain pairs only) and exact-path coverage at the
Phase-6 `--barrier-check` is what governs.

### Byte-identical sync discipline (validate-script-sync.js, COMMON_SCRIPTS)
A NEW *shared* script (`kaola-workflow-codex-preflight.js`, `kaola-workflow-task-mirror.js`)
must appear byte-identical in `scripts/` + all 3 `plugins/*/scripts/` trees AND be added to
the COMMON_SCRIPTS allowlist in `scripts/validate-script-sync.js`, or `validate-script-sync.js`
(run by all 4 `npm test` editions) refuses. Each such script therefore costs 4 copies +
the sync-allowlist edit = 5 paths (fits one node). The Codex compact/resume hook
(`kaola-workflow-codex-compact-resume.js`) follows the EDITION-NAMED pattern of the existing
`kaola-/kaola-gitlab-/kaola-gitea-workflow-compact-context.js` (3 edition copies, NOT
byte-synced — excluded from COMMON_SCRIPTS exactly as compact-context is) and is therefore
NOT in `validate-script-sync.js`.

### STRUCTURAL UNCERTAINTY — flagged for the architect node + governance (uncertain: true)
The issue lists "options to evaluate" for AC-A/B/C/D/E; several physical-placement questions
are UNRESOLVED at authoring time and are why `explore` + `architect` are front-loaded:
1. **AC-B preflight & AC-C task-mirror: shared vs edition-named.** Authored as SHARED
   byte-identical scripts (4-copy + sync-allowlist) on the safe assumption they are
   forge-neutral (they read `.codex/config.toml`, role profiles, and the frozen ledger —
   no forge API). IF the architect finds a forge-specific surface, they become edition-named
   (3 copies, each registered in its edition contract validator) — a DIFFERENT file shape.
2. **AC-E compact/resume hook WIRING.** Codex has NO `hooks/hooks.json` (per #277 notes), so
   the SUPPORT_HOOK_NAMES / hooks.json install pattern that the Claude editions use MAY NOT
   apply. The hook script copies are declared (3 editions, compact-context naming), but the
   exact REGISTRATION surface (Codex lifecycle-event binding: plugin-bundled vs
   `workflow-init` managed-block vs `.codex/config.toml`) is a genuine unknown the architect
   must resolve. The `script-registration` node's write set (install.sh + 4 contract
   validators) is a bounded best-guess SUPERSET intended to absorb either resolution.
3. **AC-A finalize-skill prose.** The genuine Claude-only `Agent(...)` CALL-SYNTAX leaks are
   in codex `kaola-workflow-init/SKILL.md` ×3 (line ~66 `Agent(...)`) + codex
   `kaola-workflow-adapt/SKILL.md` (line ~106 `subagent_type="workflow-planner"`) — those 4
   paths are this run's AC-A node. The "MUST delegate" prose in the 3 finalize SKILL.md files
   is plausibly legitimate (not Claude call-syntax); the architect confirms whether it is in
   AC-A scope. If it is, AC-A SPLITS into a second node (init/adapt would otherwise exceed
   FILE_CEILING when combined with finalize×3).

Because the planner is dispatched ONCE and must freeze, these are declared as bounded
best-guess supersets rather than deferred. Post-architect, if the resolution moves a write
set, the orchestrator can apply ledger-preserving plan-repair-via-`--freeze` (the hash covers
`## Meta` + `## Nodes` only; the ledger is preserved). The `uncertain: true` risk flag and
this note are the deliberate staging-governance signal for the main session.

### Per-node intent

- **explore** (code-explorer; read-only). Resolve the structural unknowns above:
  where new Codex scripts/hooks physically live; how `validate-script-sync.js` COMMON_SCRIPTS
  + the per-edition contract validators register a new script; whether the Codex compact/resume
  hook has a real lifecycle-binding surface (no `hooks/hooks.json` on Codex); and the complete
  Claude-only `Agent(...)` leak census in codex skill text. No write set.

- **architect** (code-architect; read-only). Decide: shared-byte-identical vs edition-named
  for the preflight + task-mirror scripts; the AC-E hook registration surface; the
  `workflow-tasks.json` schema (source_plan_hash, tasks[], last_synced_from_ledger; `n/a` →
  `completed` + `ledger_status:"n/a"`); and the AC-B preflight contract (verify
  `.codex/agents/kaola-workflow/*.toml` + managed `.codex/config.toml` role block freshness;
  typed repair refusal vs safe auto-`install-codex-agent-profiles.js`; no silent
  `subagent-invoked` on absent profile). No write set. (G1: not a code node.)

- **skill-dispatch-text** (implementer; non_tdd_reason: skill PROSE edit — removing Claude
  `Agent(...)` call-syntax from Codex-facing skill text has no natural failing unit test;
  verified by RUNNING the contract validators + a grep-absence assertion, not a unit test).
  AC-A: remove Claude-only `Agent(...)` / `subagent_type=` call-syntax as the operational
  contract from the codex `kaola-workflow-init` SKILL.md ×3 editions + the codex
  `kaola-workflow-adapt` SKILL.md, replacing it with a Codex-native dispatch description
  (role + prompt + cwd + expected_cache + declared_write_set + model packet, NOT a Claude
  `Agent(...)` example). Do NOT touch the gitlab/gitea/codex COMMAND files' intentional
  `subagent_type` text-locks (those ENFORCE dispatch — #277). (G1 implement → code-review
  post-dominates.)

- **preflight** (tdd-guide; behavioral fail-closed LOGIC, RED-first unit-testable per AC-7).
  AC-B: NEW shared `kaola-workflow-codex-preflight.js` that hard-checks role-profile/config
  freshness BEFORE `subagent-invoked` compliance is claimed: verify
  `.codex/agents/kaola-workflow/*.toml` exists and the managed `.codex/config.toml` block
  carries every role the frozen plan + current template require; on missing/stale, EITHER
  auto-run `install-codex-agent-profiles.js` when safe OR stop with a typed repair refusal;
  NEVER silently continue (AC-7 "no silent inline fallback"). Written byte-identical ×4 trees
  + added to COMMON_SCRIPTS in `scripts/validate-script-sync.js`. (G1 + G2: trust-boundary —
  security-review post-dominates.)

- **task-mirror** (tdd-guide; deterministic generation LOGIC, RED-first unit-testable per
  AC-7). AC-C: NEW shared `kaola-workflow-task-mirror.js` that GENERATES the durable
  `kaola-workflow/{project}/workflow-tasks.json` from the frozen `## Nodes` + `## Node Ledger`
  (never hand-authored): `source_plan_hash`, `tasks[]` (id, role, status, ledger_status),
  `last_synced_from_ledger`; `n/a` → `completed` + `ledger_status:"n/a"`; rebuild-if-stale on
  resume. Written byte-identical ×4 trees. Its sync-allowlist registration lands in the
  `script-registration` node (NOT here — `validate-script-sync.js` is already in `preflight`'s
  set and the two new shared scripts are batched there to keep both `--freeze` write sets
  honest). (G1 implement → code-review post-dominates.)

- **compact-hook** (tdd-guide; deterministic packet-generation LOGIC, RED-first unit-testable
  per AC-7). AC-E/F: NEW Codex-native compact/resume hook
  `kaola-workflow-codex-compact-resume.js` (edition-named ×3: codex / gitlab / gitea, mirroring
  the existing compact-context naming) that reads `workflow-state.md`, `workflow-plan.md`,
  `## Node Ledger`, and `workflow-tasks.json` and emits a deterministic resume packet (active
  project, next skill/command, in-progress node, pending gates, consent halt markers, task-mirror
  summary). AC-F: MUST NOT depend on `CLAUDE_PLUGIN_ROOT` or the Claude settings schema —
  Codex paths + packaging only; does not mutate state except via an explicit repair script.
  (G1 implement → code-review; G2 lifecycle-recovery trust surface → security-review
  post-dominates.)

- **script-registration** (implementer; non_tdd_reason: install/registration WIRING + contract-
  validator assertion-string edits — verified by RUNNING the validators + `npm test`, not a unit
  test). Register the two NEW shared scripts (`codex-preflight`, `task-mirror`) and the Codex
  compact/resume hook in `install.sh` (per-edition `SUPPORT_SCRIPT_NAMES`) and add the required
  `exists(...)`/`assertIncludes('install.sh', ...)` registration assertions to the Claude
  contract validator `scripts/validate-workflow-contracts.js` (+ its byte-identical Codex copy
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`), the Codex-only
  `scripts/validate-kaola-workflow-contracts.js`, and the gitlab/gitea contract validators.
  BOUNDED-SUPERSET write set per uncertainty #2/#3 above. (G1 implement → code-review.)

- **tests** (tdd-guide; AC-7 RED-first coverage). Add coverage for: stale `.codex/config.toml`,
  missing role profiles, task-mirror regeneration, compact/resume packet generation, and
  no-silent-inline-fallback — across the Codex-facing simulate walkthroughs (codex / gitlab-codex
  / gitea-codex) and the gitlab/gitea per-edition script tests. Each walkthrough tests its own
  surface — do NOT byte-sync them. `npm test` + `simulate-workflow-walkthrough.js` green is
  NECESSARY BUT NOT SUFFICIENT — the new RED-first cases must exist and pass. (G1 implement →
  code-review post-dominates.)

- **version-parity** (implementer; non_tdd_reason: version-string bump across the 3 codex
  manifests + the README parity lines — a mechanical lockstep edit, verified by the
  contract-validator parity assertion, not a unit test). AC-8: bump all THREE
  `.codex-plugin/plugin.json` versions in lockstep AND the matching `Codex \`<name>\` plugin
  manifest: \`<version>\`` lines in README.md (asserted at
  `validate-workflow-contracts.js:418`). This node OWNS README.md (the version-parity contract
  forces README + the 3 manifests to move together — they cannot ride the docs node or the
  finalize sink: a non-docs `.codex-plugin/plugin.json` write on the sink would trip
  code-reviewer). (G1 implement → code-review post-dominates.)

- **docs** (doc-updater; docs-only write set → exempt from G1). AC-D: document that the Codex
  visible task list is a UI MIRROR of the durable `workflow-tasks.json`, NOT correctness state
  (docs/architecture.md, docs/workflow-state-contract.md — `workflow-tasks.json` durable field +
  the Codex dispatch/preflight/compact contracts; docs/api.md — the new script CLIs +
  workflow-tasks.json schema; docs/conventions.md — the Codex-native dispatch + no-silent-inline
  rule; AGENTS.md — Codex agent guidance). Does NOT write README.md (owned by version-parity) or
  CHANGELOG.md (reserved to the finalize sink).

- **security-review** (security-reviewer). G2: positioned to post-dominate the trust-boundary
  nodes — preflight (the gate that authorizes `subagent-invoked` compliance), compact-hook
  (lifecycle-recovery surface), and the no-silent-inline-fallback enforcement. Read-only (no
  write set). Emit lowercase `verdict: pass` / `findings_blocking: 0`.

- **code-review** (code-reviewer). G1: post-dominates EVERY implement/tdd-guide code node (the
  fully sequential spine routes all of them through this single reviewer before the sink).
  Read-only. Emit lowercase `verdict: pass` / `findings_blocking: 0`.

- **finalize** (finalize sink; writes only `CHANGELOG.md`). Adds the [Unreleased] entry; the
  contractor runs the Phase-6 8a/8b/7/8 bookkeeping at finalize.

### Acceptance (whole-plan, at finalize)
- `node scripts/validate-script-sync.js` green (the 2 new shared scripts byte-identical ×4 +
  in COMMON_SCRIPTS).
- All 4 contract validators green (new-script registration assertions present; AC-A
  Agent(...)-leak absent from codex skills).
- The new AC-7 RED-first cases (stale config, missing profiles, mirror regen, compact packet,
  no-silent-inline) present and passing in the Codex walkthroughs + edition script tests.
- README + 3 `.codex-plugin/plugin.json` version lines in lockstep (`validate-workflow-contracts.js`
  parity assertion green).
- `npm test` green ×4 editions; `node scripts/simulate-workflow-walkthrough.js` green.
- Phase-6 whole-plan `--barrier-check` clean (every changed production file in exactly one
  node's write set — EXCEPT README and validate-script-sync.js, which are each single-owned
  here by design).

### SIZE / STAGING SIGNAL (for main-session governance at the freeze decision)
This is a LARGE, multi-edition (3+ tree) enhancement: 2 new shared byte-identical scripts
(×4 copies each), 1 new edition-named hook (×3), 8 ACs, contract-validator count-bumps, and a
version-parity lockstep — touching ~40 production files across `plugins/`, `scripts/`,
`install.sh`, `docs/`, README, and 3 `.codex-plugin` manifests. Blast radius is HIGH and two
physical-placement questions (uncertainty #1/#2) are UNRESOLVED until the architect runs. The
honest write sets are declared as bounded best-guess supersets; `uncertain: true` is set
deliberately so the main session can govern whether this lands as ONE run or a STAGED sequence
(the #242/#244 accumulate-release-once pattern) at the freeze decision. The planner does not
make that call.

### Out of scope (per the issue)
- Replacing Codex's subagent system; moving judgment into scripts; making the ephemeral Codex
  UI task list a source of truth.
- Adaptive worktree isolation (#264); selective execution (#263).
- Rewriting #247/#248 prose-wording (this run COMPLEMENTS, does not depend on, them).
