verdict: pass
findings_blocking: 0

# code-review — G1 gate node evidence (issue #266)

Role: code-reviewer | Node: code-review | Issue: #266 (Codex harness hardening) | Date: 2026-06-07
Reviewed: COMPLETE change on branch workflow/issue-266 vs origin/main (working-tree state;
HEAD == origin/main, changes uncommitted — reviewed against the worktree diff + untracked new
scripts). Read-only.

G1 post-dominates every implement/tdd-guide code node on the fully-sequential spine.

## VERDICT: PASS — findings_blocking: 0

No correctness bug, broken contract, vacuous test, or AC unmet WITHIN THE FROZEN PLAN SCOPE. The
11 new scripts, the sync/install/contract-validator registration, the AC-7 tests, and the docs are
correct, complete, and internally consistent. Three deliberate plan deviations are each the correct
call; a 4th scope boundary surfaced during review (AC-3's runtime resume-reconciliation wiring was
deliberately scoped out at plan-freeze and is delivered as a documented contract, not a wired call)
— non-blocking by frozen-plan design, with a follow-up recommended.

## Build verification (real exit codes, captured directly — NOT via tail/head pipe)

- `npm test` (all 4 editions: claude → codex → gitlab → gitea): **exit 0** (harness-confirmed
  completion code 0; log terminates with "Gitea Codex workflow walkthrough simulation passed").
  Codex edition prints all three #266 suites PASSED:
  testCodexPreflight266 (cases 1,2,5), testCodexTaskMirror266 (case 3), testCodexCompactResume266
  (case 4). gitlab/gitea #266 suites run transitively via the codex walkthroughs.
- `node scripts/simulate-workflow-walkthrough.js`: **exit 0** ("Workflow walkthrough simulation
  passed").
- `node scripts/validate-script-sync.js`: exit 0 — "17 common scripts and 7 byte-identical file
  group in sync" (preflight added the 4-path byte-identical group; both new shared scripts in
  COMMON_SCRIPTS).

## AC-completeness (8/8 met)

1. AC-A (no Claude `Agent(...)` as operational contract in Codex adaptive skills): MET. The single
   operational-dispatch leak (adapt SKILL.md `subagent_type="workflow-planner"` parenthetical) is
   removed; Codex-native delegate clause retained. Census confirms the only remaining `Agent(`
   hits are the 3 init-SKILL line-66 instances, which are byte-locked Claude-consumer CLAUDE.md
   template payload (deviation #1) — not operational dispatch.
2. AC-B (hard role-profile/config preflight before subagent-invoked): MET. New
   `kaola-workflow-codex-preflight.js` verifies `.codex/agents/kaola-workflow/*.toml` + the managed
   `.codex/config.toml` block against template∪plan roles; autofix-when-safe, else typed refusal;
   never a silent `subagent-invoked`. Tested (config_stale, profiles_missing, autofix, refusal).
3. AC-C / AC-3 (durable task mirror generated from ledger after handoff AND reconciled on every
   plan-run resume): GENERATOR + DOCUMENTED-CONTRACT MET; AUTOMATIC RUNTIME INVOCATION OUT OF FROZEN
   SCOPE — see deviation #4. The generator (`kaola-workflow-task-mirror.js`) is correct: builds
   workflow-tasks.json from `## Nodes` + `## Node Ledger`; reuses parseNodes/parseLedger/
   readStoredHash; clock-free core + CLI clock edge; n/a→completed; plan_not_frozen refusal;
   stale-hash regen. Tested (4 mappings, determinism, unfrozen refusal, stale-hash). The
   "after handoff / reconciled on every resume" CLAUSE is delivered as a documented reconciliation
   contract (docs/workflow-state-contract.md + api.md), NOT as a wired runtime call: no
   adaptive-node.js / adaptive-handoff.js (×4 editions) invokes the generator, and those files are
   absent from EVERY frozen node write set. compact-resume only READS the mirror (summarizeTasks),
   it does not regenerate. Non-blocking because the frozen, approved plan deliberately scoped the
   wiring out (architect D3 chose "Document the rule in docs"); a G1 gate reviews against the frozen
   plan. Stated honestly as deviation #4 below.
4. AC-D (Codex UI task list documented as a mirror, not correctness state): MET. docs/
   workflow-state-contract.md states the explicit 3-level source-of-truth chain (Node Ledger =
   correctness truth; workflow-tasks.json = durable mirror; Codex UI = ephemeral mirror).
5. AC-E (Codex-native compact/resume hook rehydrating from durable artifacts): MET. New
   `kaola-workflow-codex-compact-resume.js` (edition-named ×3) emits a deterministic 6-section
   resume packet from the 4 durable artifacts; self-contained stdin/stdout filter; on-demand
   invocation documented (Codex has no hooks manifest key — correct per architect D2). Tested.
6. AC-F (no CLAUDE_PLUGIN_ROOT / Claude settings dependency): MET. compact-resume body uses only
   fs+path+stdin; no CLAUDE_PLUGIN_ROOT, no require() of edition code. Verified by read + diff
   (the 3 edition copies differ only in the filename comment).
7. AC-7 (tests for stale config, missing profiles, mirror regen, compact packet, no-silent-inline):
   MET and NON-VACUOUS. Cases are RED-discriminating (wrong fixture → typed refusal / wrong JSON →
   assertion would fire) and GREEN, invoked from main()/top-level. gitlab/gitea cases live in
   test-{forge}-workflow-scripts.js, which IS run by simulate-{forge}-codex-workflow-walkthrough.js
   (in the npm test path) — confirmed executed, not orphaned.
8. AC-8 (parity across GitHub/Codex, GitLab, Gitea): MET as FEATURE parity. All Codex surfaces
   exist in all editions; preflight 4-tree byte-identical, task-mirror edition-ported, compact-hook
   edition-named ×3; registered in install.sh + all contract validators. (Version BUMP is a
   separate release action — deviation #2.)

## The 3 deliberate deviations — each is the CORRECT call (not an oversight)

1. AC-A scope (only adapt SKILL.md fixed; 3 init SKILL line-66 left alone): CORRECT. Line 66 is
   inside the KW-CLAUDE-TEMPLATE-START/END markers (init SKILL lines 31-111) — the literal
   CLAUDE.md payload workflow-init installs into a consumer repo, byte-locked to the paired
   commands/workflow-init.md (validate-kaola-workflow-contracts.js:427-441). It is correct guidance
   for Claude consumers (where Agent(...) IS the runtime contract), not the skill's own operational
   dispatch surface. Editing it would have broken the template byte-lock AND required touching the
   out-of-scope command files. AC-A's requirement (skills don't present Agent(...) as the
   *operational* contract) is fully met. Byte-lock still passes (npm test green).
2. version-parity NO-OP (no version bump): SOUND. A codex manifest bump requires a root
   package.json bump + a new git tag (npm test asserts the tag exists), all outside the node's
   write set. AC-8 is FEATURE parity (satisfied); the bump is a separate release action. The
   parity contract (validate-workflow-contracts.js:418) is GREEN at the unbumped state: all 3
   .codex-plugin/plugin.json + README agree at 3.6.0. npm test green confirms it.
3. docs reverted AGENTS.md (kept redirect-only): CORRECT, respects single-canonical-source design.
   AGENTS.md self-states it "exists only to direct you there [CLAUDE.md]" and "intentionally
   contains nothing else"; adding substantive Codex guidance would split the source of truth and
   contradict the CLAUDE.md non-negotiable. The Codex guidance lives in docs/conventions.md,
   docs/api.md, docs/workflow-state-contract.md, docs/architecture.md — the correct homes.
   (docs node: actual ⊆ declared write set; no plan-repair needed.)

4. (Surfaced during review — runtime reconciliation wiring) AC-3's "reconciled on every plan-run
   resume" / "after handoff" clause is NOT mechanically wired. task-mirror.js is shipped + tested +
   documented, but nothing invokes it at runtime: a full grep of adaptive-node.js / adaptive-handoff.js
   across all 4 editions finds zero references, and those files are in no frozen write set. The
   architect (D3) deliberately chose to DOCUMENT the rebuild-if-stale-on-resume rule rather than wire
   the caller; the plan was frozen and approved that way. CORRECT scope boundary, NOT a defect: the
   gate reviews against the frozen plan, and adding the invocation would require editing
   adaptive-node.js ×4 (out of every write set → barrier would refuse). The durable mirror + the
   reconciliation contract are delivered; automatic invocation on handoff/resume is out of this
   issue's frozen scope. RECOMMEND a follow-up issue to wire the orient/plan-run/compact caller so
   the resume-reconciliation clause becomes runtime-enforced (currently it is a documented
   convention the main session must honor). This is the ONLY AC clause not mechanically realized,
   and it is non-blocking by frozen-plan design.

## Quality / structure spot-checks (all clean)

- Byte-identity: preflight identical sha256 across all 4 trees; task-mirror identical in
  claude+codex, gitlab/gitea ports differ ONLY in the validator require line; compact-resume copies
  differ only in the filename comment. All 3 task-mirror ports load and export {generateMirror,
  mapLedgerStatus}; the edition-named validators export parseNodes/parseLedger/readStoredHash.
- Registration: claude/codex validate-workflow-contracts.js pair received IDENTICAL edits (required
  — they are in COMMON_SCRIPTS); compact-resume asserted only in the codex-only +
  gitlab/gitea validators (no claude scripts/ copy exists — correct). install.sh: preflight+
  task-mirror base-named in the github block, edition-named in gitlab/gitea; compact-resume
  edition-named in gitlab/gitea (codex ships via the plugin, not the github install lane).
- Preflight error handling: typed refusals on every non-ok arm (template_missing, role_not_in_
  template, autofix_unsafe, profiles_missing/config_stale, installer_failed); never emits
  subagent-invoked. Claude-tree degrade (no config/agents.toml) → template_missing exit 2 (verified
  real exit code, not pipe-masked) — never reaches the absent installer; correct fail-closed.
- task-mirror determinism: clock-free generateMirror core takes injected `now`; CLI stamps clock at
  the outer edge only. Conservative default (unknown ledger value → pending).
- compact-resume: deterministic fixed-order packet, no timestamps; swallows errors to a [skipped]
  stderr line; never mutates state.
- Changed-file census: every changed production file maps to exactly one frozen node write set; no
  stray leak. Sink barrier will be clean.

## Non-blocking observations (informational only — do NOT block merge)

- N1: The frozen `tests` node write set named the gitlab/gitea *codex* walkthroughs; the
  implementer instead placed the gitlab/gitea AC-7 cases in test-{forge}-workflow-scripts.js (also
  in the declared write set). Those files ARE executed (the codex walkthroughs `run()` them), so
  coverage is real. actual ⊆ declared. No action needed.
- N2: version bump deliberately deferred (deviation #2). When this ships, the release step must
  bump root package.json + the 3 codex manifests + README in lockstep and create the matching git
  tag, per the release contract. This is expected, not a defect.
