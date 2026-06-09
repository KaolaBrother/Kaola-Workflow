# recon (code-explorer) — issue #328 multi-issue bundle lane

Read-only survey. File-level implementation map keyed to the 19 plan nodes. Additive only — single-issue behavior MUST stay unchanged (AC#1).

## Entry Points
- `--target-issue N` / `KAOLA_TARGET_ISSUE`: single-issue path, UNCHANGED.
- `--target-issues A,B,C` / `KAOLA_TARGET_ISSUES`: NEW bundle path.
- Both set → `target_ambiguity` typed refusal.

## Node: state-foundation (tdd-guide)
Files: active-folders.js (+claude byte-pair), classifier.js (+byte-pair), test-bundle-state.js (new).
- active-folders.js `parseStateFile` (~L72-88): reads `issue_number` via parseInt → scalar/null. No `issue_numbers` today. `readActiveFolders` (~L94-134) returns shape incl scalar `issue_number`.
- claim.js `activeByIssue` (~L498-499): `find(folder => folder.issue_number === issueNumber)` strict scalar equality.
- ADD: parseStateFile reads `issue_numbers` (comma list → array); readActiveFolders return gains `issue_numbers: number[]`; activeByIssue checks BOTH scalar AND `(folder.issue_numbers||[]).includes(issueNumber)`.
- classifier.js `cmdClassify` (~L517-521): `activeStateIssues = Set(folders.map(f=>f.issue_number).filter(Boolean))`; early-exit if `.has(args.issue)`. ADD: also check any folder.issue_numbers includes args.issue → blocked.
- AC#1 safety: missing `issue_numbers` field → empty → `[]`; scalar equality unchanged.
- Byte-lock: both files in COMMON_SCRIPTS (root↔claude byte-identical).

## Node: claim-startup (tdd-guide)
Files: claim.js (+byte-pair), test-bundle-claim.js (new).
- parseArgs (~L96-119): add explicit `--target-issues` branch → `args.targetIssues=[A,B,C]`; check `KAOLA_TARGET_ISSUES` env.
- claimProject (~L506-638): `issueNumber = args.issue||args.targetIssue` (scalar); project=projectNameForIssue; activeByIssue collision; adaptive toggle (L519-532); probeIssueState (L534-541); buildBranchName (L546); provisionWorktree (L576-579); writeState (L602-613); postAdvisoryClaim (L614, ONE issue).
- NEW claimBundle/claimExplicitBundle: parse targetIssues; `target_ambiguity` if both set; validate all unclaimed+green/yellow; bundle project `bundle-42-47-53`; branch `workflow/bundle-42-47-53`; all-or-nothing provision+writeState(issue_number=primary + issue_numbers + bundle_id + closure_policy)+postAdvisoryClaim per issue; rollback all labels/comments/worktree on failure.
- Nine typed refusals (per Plan Notes): target_set_empty, target_set_has_closed/claimed/red/unavailable/unverified, target_ambiguity, partial_rollback_ok, target_set_label_rollback_failed.
- writeState (~L368-422, L412 `issue_number`): ADDITIVE — bundle adds `issue_numbers`/`bundle_id`/`closure_policy` only on bundle path; single-issue writes ONLY `issue_number`.
- buildBranchName (~L194-197): null issueNumber + project=bundle-… falls to else → `workflow/bundle-…` (confirm).
- cmdStartup (~L702-719): `target=args.targetIssue||args.issue` today; route to claimExplicitBundle if targetIssues set; target_ambiguity if both.
- postAdvisoryClaim (~L432-437) / clearAdvisoryClaim (~L455-479): bundle calls per issue; rollback removes already-applied labels/comments on partial failure.
- Byte-lock: claim.js in COMMON_SCRIPTS.

## Node: finalization (tdd-guide)
Files: claim.js (+byte-pair), roadmap.js (+byte-pair), test-bundle-finalize.js (new).
- archiveProjectDir (~L813-928): L821 `archiveIssueNumber=parseInt(issue_number)`; L883-925 on closed removes `.roadmap/issue-{N}.md` + regenerateRoadmap. ADD: read issue_numbers, remove each `.roadmap/issue-N.md`, regenerate ONCE; return `roadmap_sources_removed` plural.
- cmdFinalize (~L987-1069): L1030 scalar issue_number; L1041 clearAdvisoryClaim single. ADD: clearAdvisoryClaim per issue.
- buildClosureReceipt: add `closed_issues`, `failed_issue_closures`, `removed_roadmap_sources`.
- checkClosureInvariants (~L930-984): loop issue_numbers for roadmap-source-absent + in-progress-label-removed per issue. Warning-first on single remote-close failure (AC#13).
- roadmap.js regenerateRoadmap (~L197-206) forge-neutral, NO change (regenerates from remaining source files).
- Byte-lock: claim.js + roadmap.js in COMMON_SCRIPTS.

## Node: resume-display (tdd-guide)
Files: adaptive-node.js (+byte-pair), test-adaptive-node.js (additions).
- runOrient (~L385-567): no project identity fields today. ADD: read issue_numbers/bundle_id/closure_policy from state (same `stateContent.match()` pattern as escalated_to_full L401); return gains bundleId/issueNumbers/closurePolicy/primaryIssue.
- DESIGN DECISION: compact-context.js (~L88, Claude-only, NOT in COMMON_SCRIPTS, NOT in resume-display write set) reads only name/phase/step/next_command. If bundle identity needed in compact → plan-repair to add it. Recon recommends OUT OF SCOPE (full orient suffices).
- Byte-lock: adaptive-node.js in COMMON_SCRIPTS.

## Node: scout-role (implementer)
Files: agents/issue-scout.md (root .md), plugins/kaola-workflow{,-gitlab,-gitea}/agents/issue-scout.toml.
- issue-scout is READ-ONLY (like code-explorer): survey backlog for bundle candidates. MUST NOT be in WRITE_ROLES/IMPLEMENT_ROLES/GATE_VERDICT_ROLES.
- plan-validator `installedRoles()` (~L88-96) auto-discovers `agents/*.md` at runtime; CANONICAL_ROLES explicit add (validator-roles node) needed for closed-library baseline + fixtures.
- Root .md uses YAML frontmatter `model:` + markdown body (Prompt Defense Baseline etc). Plugin .toml uses TOML name/description/model.
- No COMMON_SCRIPTS/BYTE_IDENTICAL implications (profiles not in sync lists).

## Node: scout-registration (implementer)
Files: install.sh, resolve-agent-model.js ×4 (BYTE_IDENTICAL_GROUPS).
- install.sh: L40 REQUIRED_AGENTS array add "issue-scout" (13→14); L427-438 default_agent_model() add issue-scout→sonnet; emit_agent_model_manifest()/install loops auto-iterate (no change).
- DESIGN DECISION: model_for_placeholder() (~L472-487, 12 entries) + render_command_file (~L526-539) — adversarial-verifier is NOT in these (dispatched inline, not via {X_MODEL} in a command file). issue-scout is similar (routing prose, not Agent(model=) block) → likely NO ISSUE_SCOUT_MODEL placeholder needed. design confirms.
- resolve-agent-model.js DEFAULT_AGENT_MODELS (~L8-22, 13 entries): add `'issue-scout': 'sonnet'` in ALL FOUR byte-identical copies (root + claude + gitlab + gitea, same filename).

## Node: validator-roles (implementer)
Files: plan-validator.js (+claude byte-pair), gitlab port kaola-gitlab-workflow-plan-validator.js, gitea port kaola-gitea-workflow-plan-validator.js.
- CANONICAL_ROLES (~L51-55) = 11 entries today (excludes contractor/workflow-planner). ADD 'issue-scout' → 12.
- Do NOT add to WRITE_ROLES(L58)/IMPLEMENT_ROLES(L59)/GATE_VERDICT_ROLES(L61).
- All 4 validators share the same CANONICAL_ROLES array (grep-verified); add issue-scout to each.
- Byte-lock: root↔claude pair in COMMON_SCRIPTS.

## Node: forge-claim-ports (implementer)
Files: gitlab/gitea kaola-{forge}-workflow-{claim,active-folders,classifier}.js (6 files).
- Edition-named ports, NOT in COMMON_SCRIPTS. MIRROR root behavioral logic verbatim modulo forge nouns (#254 parity lesson — do NOT re-derive). Canonical spec = matching root script.

## Node: forge-final-ports (implementer)
Files: gitlab/gitea kaola-{forge}-workflow-{roadmap,adaptive-node}.js (4 files).
- roadmap port: verify current with root (forge-neutral regen). adaptive-node port: mirror runOrient bundle-fields addition.

## Node: routing-core (implementer)
Files: commands/workflow-next.md, commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/{kaola-workflow-next,kaola-workflow-adapt}/SKILL.md.
- workflow-next.md (~L46-68) Step 0 single-issue startup. ADD: explicit-bundle (`--target-issues`/`KAOLA_TARGET_ISSUES`, compat note `--target-issue` unchanged) + auto-bundle (issue-scout role identifies candidates before startup). Semantically identical across editions (root=canonical).

## Node: routing-forge (implementer)
Files: gitlab/gitea commands/{workflow-next,kaola-workflow-adapt}.md (4 files). Mirror routing-core modulo forge nouns.

## Node: contracts-registration (implementer)
Files: validate-script-sync.js, package.json, gitlab/gitea contract validators, gitlab/gitea forge test scripts.
- COUNT ASSERTIONS (separate bases — NOT a flat 13→14):
  - gitlab validate-kaola-workflow-gitlab-contracts.js L143 `agentFiles.length===13` → 14
  - gitea validate-kaola-workflow-gitea-contracts.js L142 `===13` → 14
  - gitlab test-gitlab-workflow-scripts.js ~L1988-1990 `length===13`/'should install 13 agent TOML files' → 14
  - gitea test-gitea-workflow-scripts.js ~L2040 'should install 13 agent TOML files' → 14
  - ROOT validate-workflow-contracts.js / validate-kaola-workflow-contracts.js: NO literal count → DO NOT ADD.
- CANONICAL_ROLES base 11→12 is a DIFFERENT count from agent-profile-install 13→14. Do NOT conflate.
- validate-script-sync.js: new test-bundle-*.js are root-only `scripts/` (like simulate-workflow-walkthrough.js) → keep OUT of COMMON_SCRIPTS (design confirms).
- package.json: add three test-bundle-*.js to test runner.

## Node: regression-tests (tdd-guide)
File: simulate-workflow-walkthrough.js. ADD: 3-issue bundle startup (assert issue_numbers/bundle_id/closure_policy), bundle finalize (assert all roadmap sources removed + regen), target_ambiguity refusal, confirm single-issue steps still pass (AC#1).

## Nodes: code-review / adversarial-verify / docs / finalize
- code-review (code-reviewer, empty write set) post-dominates all implement nodes; AC#1 regression safety.
- adversarial-verify (adversarial-verifier, read-only) re-tests bundle claim/finalize.
- docs (doc-updater): README.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md.
- finalize sink: CHANGELOG.md ONLY (no double-write).

## BYTE_IDENTICAL_GROUPS relevant
- resolve-agent-model.js ×4: add issue-scout:sonnet.
- closure-contract.js ×4: DESIGN DECISION — only edit if CLOSURE_INVARIANTS constant list must change for bundles. Additive per-issue application of existing invariants needs NO constant change → likely no edit (NOT in any node write set today; would need plan-repair if required).
- adaptive-schema.js ×4: no change expected.

## OPEN DESIGN DECISIONS for the design (code-architect) node
1. ISSUE_SCOUT_MODEL placeholder in command files? (likely NO — routing-prose dispatch like adversarial-verifier).
2. compact-context.js bundle display? (likely OUT OF SCOPE — full orient suffices; else plan-repair).
3. issue_numbers state format: comma-separated integers on one line (recommended, consistent with field() regex parser).
4. test-bundle-*.js placement: root-only (recommended).
5. closure-contract.js CLOSURE_INVARIANTS: extend only if needed for plural checks (likely additive application, no constant change).

## Cross-edition grep discipline (#291)
Grep changed symbols (issue_numbers, bundle_id, issue-scout, count literal 13) across scripts/ AND every plugins/*/scripts/ before sealing each node — edition-named ports are NOT found by base-filename find.

survey is complete
