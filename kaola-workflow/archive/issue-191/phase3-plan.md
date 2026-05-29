# Phase 3 - Plan: issue-191

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-active-folders.js` | `\s*` → `[ \t]*` in field() regex | L3 |
| `scripts/kaola-workflow-classifier.js` | `\s*` → `[ \t]*` in field() regex | L3 |
| `scripts/kaola-workflow-repair-state.js` | `\s*` → `[ \t]*` in field() regex | L3 |
| `scripts/kaola-workflow-compact-context.js` | `\s*` → `[ \t]*` in field() regex | L3 |
| `scripts/kaola-workflow-roadmap.js` | Parser regex `[^|]+?` → `(?:[^|\\]|\\.)+?` | L2 |
| `scripts/kaola-workflow-claim.js` | Add `runtime: args.runtime || 'claude'` to writeState template + claimProject data | L4 |
| `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` | Byte-twin of base | L3 sync |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | Byte-twin of base | L3 sync |
| `plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js` | Byte-twin of base | L3 sync |
| `plugins/kaola-workflow/scripts/kaola-workflow-compact-context.js` | Byte-twin of base | L3 sync |
| `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js` | Byte-twin of base | L2 sync |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-twin of base | L4 sync |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add cmdAuditLabels/cmdRepairLabels + router + runtime persist | L1+L4 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` | Parser regex fix (line 106) | L2 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-compact-context.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | Add testAuditAndRepairLabels() | L1 test |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Add cmdAuditLabels/cmdRepairLabels + router + runtime persist | L1+L4 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` | Parser regex fix (line 106) | L2 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-compact-context.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `\s*` → `[ \t]*` | L3 |
| `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | Add testAuditAndRepairLabels() | L1 test |
| `uninstall.sh` | FORGE="" default + sentinel block | L5 |
| `.env.example` | Add KAOLA_GLAB_MOCK_SCRIPT and KAOLA_TEA_MOCK_SCRIPT | L6a |
| `docs/README.md` | Add workflow-state-contract.md, agents-source.md, investigations/ | L6b |
| `docs/workflow-state-contract.md` | Document runtime: field | L4 doc |
| `README.md` | Remove "(GitHub only)" annotation from audit/repair; add sink-fallback row | L1/L6c |

### Build Sequence
1. L3: Fix field() regex in all 18 files (WS-A + WS-B + WS-C) — leaf fix, no dependents
2. L2: Fix parseRoadmapTable regex in 4 roadmap copies (WS-A + WS-B + WS-C) — independent
3. L4: Add runtime: to writeState in 3 claim scripts + github-plugin twin + workflow-state-contract.md (WS-A + WS-D + WS-E)
4. L1: Port audit-labels/repair-labels to GitLab+Gitea claim scripts + add tests (WS-D + WS-E) — same files as L4 in WS-D/WS-E, sequenced within those write sets
5. L5: Fix uninstall.sh FORGE sentinel + add contained test (WS-F) — independent
6. L6: Doc nits .env.example + docs/README.md + README.md (WS-G) — after L1 decisions (README annotation removal)

### Parallelization Plan
| Group | Write Set | Tasks | Why Safe |
|-------|-----------|-------|----------|
| WS-A | base+github-plugin (12 files) | L2+L3+L4 for main scripts | Byte-synced pair; one agent writes both halves |
| WS-B | gitlab roadmap+field (6 files) | L2+L3 gitlab | Disjoint from WS-A |
| WS-C | gitea roadmap+field (6 files) | L2+L3 gitea | Disjoint from WS-A/B |
| WS-D | gitlab claim+walkthrough (3 files) | L1+L4 gitlab | Disjoint from all |
| WS-E | gitea claim+walkthrough (3 files) | L1+L4 gitea | Disjoint from all |
| WS-F | uninstall.sh | L5 | Disjoint from all |
| WS-G | docs (4 files) | L6 | Disjoint from all |

All 7 groups are pairwise-disjoint → can run concurrently.

### External Dependencies
None new.

## Task List

### Task 1: T-WS-A (base+github-plugin — L2, L3, L4)
- Files: 12 files (6 base + 6 github-plugin byte-twins)
- Write Set: scripts/kaola-workflow-{active-folders,classifier,repair-state,compact-context,roadmap,claim}.js + plugins/kaola-workflow/scripts/{same 6}
- Depends On: none
- Parallel Group: WS-A
- Action: MODIFY
- Implement:
  - L3: In each of 4 scripts (active-folders, classifier, repair-state, compact-context): `\s*` → `[ \t]*` (string-concat form: `':\\s*'` → `':[ \\t]*'`; template-literal form: `:\\s*` → `:[ \\t]*`). Apply to both base and plugin twin (byte-identical).
  - L2: In roadmap.js line 174: change `([^|]+?)` → `((?:[^|\\]|\\.)+?)` in all 4 capturing groups. Apply to both base and plugin twin (byte-identical).
  - L4: In claim.js writeState template (line 284 area): add `'runtime: ' + (data.runtime || 'claude'),` after `workflow_path:` line. In claimProject data object (line 421 area): add `runtime: args.runtime || 'claude',`. Apply to both base and plugin twin (byte-identical).
- Mirror: roadmap.js:12 for correct `[ \t]*` pattern; claim.js:421 area for data object pattern
- Validate: `node scripts/validate-script-sync.js` → "OK: 10 common scripts" (zero drift); `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed"
- **CRITICAL gate: after edits, grep for old patterns across ALL editions must return zero:**
  ```bash
  grep -rn ':\\\\s\*' scripts/ plugins/kaola-workflow/scripts/ plugins/kaola-workflow-gitlab/scripts/ plugins/kaola-workflow-gitea/scripts/
  grep -rn '\[^|\]+?' scripts/ plugins/kaola-workflow/scripts/ plugins/kaola-workflow-gitlab/scripts/ plugins/kaola-workflow-gitea/scripts/
  ```
  (Both must return 0 lines — or only lines you haven't touched yet in WS-B/C.)

### Task 2: T-WS-B (gitlab roadmap+field — L2, L3)
- Files: 6 gitlab plugin scripts (roadmap + active-folders, classifier, repair-state, compact-context, sink-merge)
- Write Set: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-{roadmap,active-folders,classifier,repair-state,compact-context,sink-merge}.js
- Depends On: none
- Parallel Group: WS-B
- Action: MODIFY
- Implement:
  - L2: Fix parseRoadmapTable regex at line 106: same `[^|]+?` → `(?:[^|\\]|\\.)+?` replacement.
  - L3: Fix `\s*` → `[ \t]*` in each of the 5 field files. Match the exact syntactic form in each file (verify string-concat vs template-literal).
- Mirror: WS-A changes as reference
- Validate: `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`

### Task 3: T-WS-C (gitea roadmap+field — L2, L3)
- Files: 6 gitea plugin scripts (same set for gitea)
- Write Set: plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-{roadmap,active-folders,classifier,repair-state,compact-context,sink-merge}.js
- Depends On: none
- Parallel Group: WS-C
- Action: MODIFY
- Implement: same as WS-B but for gitea
- Validate: `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`

### Task 4: T-WS-D (gitlab claim+walkthrough — L1, L4)
- Files: 3 gitlab files
- Write Set: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
- Depends On: none
- Parallel Group: WS-D
- Action: MODIFY
- Implement:
  - L4: Add `runtime: args.runtime || 'claude'` to writeState data obj (adjacent to workflow_path); add `'runtime: ' + (data.runtime || 'claude'),` to writeState template.
  - L1: Add `cmdAuditLabels()` using `forge.listIssues({state:'closed', labels:[CLAIM_LABEL]})` returning `{stale:[{number:it.issue_iid, title, url:it.web_url}], count}`. Add `cmdRepairLabels()` with `--execute` flag, using `forge.updateIssue(it.number, {unlabels:[CLAIM_LABEL]})`. Add router dispatch `if (sub === 'audit-labels') return cmdAuditLabels()` and `if (sub === 'repair-labels') return cmdRepairLabels()`. Update usage string and module.exports.
  - L1 test: Add `testAuditAndRepairLabels()` to simulate-gitlab-workflow-walkthrough.js using `KAOLA_GLAB_MOCK_SCRIPT`. Mirror GitHub test at simulate-workflow-walkthrough.js:2763. 3 sub-cases: audit (count:1), repair dry-run (dry_run:true, would_remove.length===1), repair --execute (removed:[N]). Register with `testAuditAndRepairLabels();`.
- Mirror: scripts/kaola-workflow-claim.js:910-932 for function bodies; simulate-workflow-walkthrough.js:2763 for test structure
- Validate: `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`

### Task 5: T-WS-E (gitea claim+walkthrough — L1, L4)
- Files: 3 gitea files (same structure as WS-D)
- Write Set: plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
- Depends On: none
- Parallel Group: WS-E
- Action: MODIFY
- Implement: same as WS-D but `forge.updateIssueLabels(projectInfo, it.number, {remove:[CLAIM_LABEL]})` for repair; `it.number` (not `it.issue_iid`) for audit. `KAOLA_TEA_MOCK_SCRIPT` for test.
- Mirror: WS-D changes as reference; gitea claim.js for forge API pattern
- Validate: `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`

### Task 6: T-WS-F (uninstall.sh — L5)
- Files: uninstall.sh
- Write Set: uninstall.sh
- Depends On: none
- Parallel Group: WS-F
- Action: MODIFY
- Implement:
  - Line 4: `FORGE=github` → `FORGE=""`
  - After argument-parse loop (line 39 area) and BEFORE the validation `case` statement, insert:
    ```bash
    # Bare uninstall with no --forge removes every installed edition.
    if [[ -z "$FORGE" ]]; then
      FORGE=all
    fi
    ```
  - Ensure the validation case (`case "$FORGE" in github|gitlab|gitea|all)`) still accepts all values including "all".
  - CONTAINED BEHAVIORAL TEST (required, in-band): Add a test function that: creates a temp dir `$TMPDIR` with fake `$HOME/.claude/kaola-workflow-gitlab` and `$HOME/.claude/kaola-workflow` dirs; runs `HOME="$TMPDIR" bash uninstall.sh`; asserts both dirs are gone. Run a second test: empty `$TMPDIR` (nothing installed), assert "Not installed" text appears. Run a third test: `HOME="$TMPDIR" bash uninstall.sh --forge=gitlab` with only a gitlab dir seeded; assert only gitlab dir removed. Add this as a shell test script or inline assertion, NOT runtime execution against real ~/.claude.
- Validate: `bash -n uninstall.sh` (syntax) + behavioral test output
- **L5 RESTRICTION**: NEVER run `bash uninstall.sh` against the real `$HOME`. Always use `HOME=$TMPDIR` for any behavioral test.

### Task 7: T-WS-G (docs — L4 doc, L6)
- Files: 4 doc files
- Write Set: .env.example, docs/README.md, docs/workflow-state-contract.md, README.md
- Depends On: L1 decisions (for README annotation removal — already decided: remove "(GitHub only)")
- Parallel Group: WS-G
- Action: MODIFY
- Implement:
  - L4 doc: `docs/workflow-state-contract.md`: Add under "Workflow State Fields" (line 34 area): `- runtime: (claude|codex) — runtime that claimed the folder; from --runtime startup flag (default: claude).`
  - L6a: `.env.example`: After KAOLA_GH_MOCK_SCRIPT block (line 37), add: `# KAOLA_GLAB_MOCK_SCRIPT=` and `# KAOLA_TEA_MOCK_SCRIPT=` with comment "Test-only: mock scripts for GitLab/Gitea CLI execution"
  - L6b: `docs/README.md`: Add `workflow-state-contract.md`, `agents-source.md`, `investigations/` (match CLAUDE.md ordering)
  - L6c: `README.md`: Remove "(GitHub only)" annotation from audit-labels/repair-labels rows; add sink-fallback row grouped with sink commands (format: `| sink-fallback | node scripts/kaola-workflow-claim.js sink-fallback --project <name> | Updates Sink block after merge-impossible fallback |`)
- Mirror: CLAUDE.md Documentation Map for docs/README.md ordering; README.md:530-542 for table format
- Validate: No automated check; review diff

## Advisor Notes
- L5 VERIFIED: shared removals ARE presence-guarded. Sentinel alone is the complete fix. No dead-guard revival needed.
- L2 test: assert row preserved + pipe present; do NOT assert backslash-free round-trip (unescape was scoped out).
- WS-A must grep for old patterns across ALL editions → zero hits before declaring done.
- Dogfooding gate: full npm test green BEFORE Phase 6 finalize.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | advisor endorsed first blueprint | no gaps requiring revision |
