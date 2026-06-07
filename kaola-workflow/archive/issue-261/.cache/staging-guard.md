# staging-guard node evidence — issue-261

## task
Insert a foreign-archive detector (FOREIGN_ARCHIVE block) immediately before the existing PROJECT_COUNT block in the Phase-6 Staging Guard bash section of all three phase6.md editions (github, gitlab, gitea). The block emits a typed BLOCKED message and exits 1 when a staged `kaola-workflow/archive/<other>/` path does not match the finalized project name (`{project}`). Per reviewer adjudication, the final filter tolerates the finalized project's own `.archived-<ts>` collision suffix (consistent with gate-carveout / plan-validator Fix 2).

## non_tdd_reason
**Category: markdown command prose** — the change is a bash snippet embedded in markdown documentation. There is no module to import, no function to call in a test harness, and no natural failing unit test that can be written against prose. Verified by bash smoke-test of the logic in isolation (smoke-integration) + regression-green on `simulate-workflow-walkthrough.js`.

## write_set
- commands/kaola-workflow-phase6.md (github edition)
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md

## inserted_block (FINAL, exact — literal {project} token preserved, identical across all 3 editions)
```bash
# #261: a staged archive/<other>/ that is NOT the finalized project is a swept-in stray.
FOREIGN_ARCHIVE=$(git diff --cached --name-only \
  | grep '^kaola-workflow/archive/' \
  | awk -F'/' 'NF>=3 {print $3}' | sort -u \
  | grep -v -E -x "{project}(\.archived-.*)?" || true)
if [ -n "$FOREIGN_ARCHIVE" ]; then
  echo "BLOCKED: a foreign project's archive band is staged (${FOREIGN_ARCHIVE}) — only {project}'s archive may be committed. Unstage the stray archive/<other>/ before committing." >&2
  exit 1
fi
```
The final filter line `| grep -v -E -x "{project}(\.archived-.*)?" || true)` excludes both `{project}` (exact whole-line) and `{project}.archived-<anything>` from the foreign set. `-x` preserves whole-line anchoring (so `issue-2610` is NOT a substring-match of `issue-261`); `-E` enables the optional `(\.archived-.*)?` group; the `.` before `archived-` is escaped. `{project}` is sanitized to `[A-Za-z0-9_-]` so it carries no regex metachars.

## insertion_line_by_edition (FOREIGN_ARCHIVE= line / final-filter line / PROJECT_COUNT= line)
- github: FOREIGN_ARCHIVE= at line 533, filter at 536, PROJECT_COUNT= at 541
- gitlab: FOREIGN_ARCHIVE= at line 525, filter at 528, PROJECT_COUNT= at 533
- gitea:  FOREIGN_ARCHIVE= at line 524, filter at 527, PROJECT_COUNT= at 532

## verification_commands

### before_result (baseline)
Pre-fix, the filter line was `| grep -v -x "{project}" || true)` (Case 3 self-blocked the project's own `.archived-<ts>` collision dir). Reviewer adjudicated: the guard MUST tolerate the own suffix to stay consistent with gate-carveout (plan-validator Fix 2 exempts `dir.startsWith(archiveProj + '.archived-')`). Pre-fix simulate suite: green.

### Verification 1: identity check across the 3 editions (smoke-integration)
Extracted the FOREIGN_ARCHIVE..fi block from each edition and diffed:
```
diff github vs gitlab -> IDENTICAL
diff github vs gitea  -> IDENTICAL
```
All three carry the byte-identical updated block.

### Verification 2: smoke-test, project substituted as "issue-261" (smoke-integration)
```
Case 1 — foreign archive issue-999:                          BLOCKED (issue-999) -> EXIT:1   (correct)
Case 2 — own archive issue-261 exact:                        EXIT:0 (pass)                   (correct)
Case 3 — own archive issue-261.archived-1700000000:          EXIT:0 (pass)                   (correct — now tolerated)
Case 4 — no archive entries:                                 EXIT:0 (pass)                   (correct)
Extra  — substring guard issue-2610:                         BLOCKED (issue-2610) -> EXIT:1  (correct — not a substring-match of issue-261)
```
Case 3 now PASSES (the adjudicated fix). Case 1 still BLOCKS, Case 2 still passes, Case 4 passes, and the substring guard (issue-2610) still BLOCKS — the `-x` whole-line anchor is preserved.

### Verification 3: regression suite (regression-green)
```
node scripts/simulate-workflow-walkthrough.js
```
Output: "Workflow walkthrough simulation passed" — exit 0.

## after_result
All three editions contain the byte-identical FOREIGN_ARCHIVE block (with the prefix-aware `-E -x` filter) preceding the unchanged PROJECT_COUNT block. Staging Guard now consistent with gate-carveout on the `.archived-<ts>` suffix case; re-finalize collision no longer self-blocks. Suite exit 0.
