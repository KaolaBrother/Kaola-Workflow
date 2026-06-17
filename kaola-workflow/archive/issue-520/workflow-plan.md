# Workflow Plan — issue-520

<!-- plan_hash: eedf521e10e5d74bfbfd5f2f8eb1ea7b9a53721eca24c96c876351bbec990ab6 -->

## Meta

- issue: 520
- labels: —
- sink: main
- speculative_open_policy: off

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 7 | sequence | sonnet |
| n2-review | code-reviewer | n1-fix | — | 1 | sequence | opus |
| n3-finalize | finalize | n2-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

**Issue 520 (bug):** the `--sink` direct-to-main `archive_commit` step stages the whole archive band
with a directory-wide pathspec (`git add -- 'kaola-workflow/archive/<project>/'`), which sweeps the
transient crash-resume journals `sink-receipt.json` / `sink-fallback.json` into `main` on every sink
cycle, forcing recurring manual cleanup. Shape is Case A — phenomenon and the named fix are both
known; the only open question (add-only vs add+commit) is settled by the e2e `git ls-files` assertion,
not by speculation.

**n1-fix (tdd-guide, sonnet).** Cohesive single-semantic-change-across-editions node — kept in ONE
node per #309/#254 (cross-edition same-logic prose must converge by construction; do NOT fan out).
Canonical spec for the fix:
- Exclude both transaction journals from `archive_commit` staging in ALL FOUR sink-merge editions
  (canonical `scripts/kaola-workflow-sink-merge.js` ~line 1158-1160; the byte-identical codex twin
  `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` — keep byte-identical, `validate-script-sync`
  asserts it; the gitlab hand-port `kaola-gitlab-workflow-sink-merge.js` ~line 1047-1051; the gitea
  hand-port `kaola-gitea-workflow-sink-merge.js` ~line 1041-1045) using `:(exclude)` pathspecs:
  `git add -- 'kaola-workflow/archive/<project>/' ':(exclude).../.cache/sink-receipt.json' ':(exclude).../.cache/sink-fallback.json'`
  (or an equivalent post-stage `git reset -- <journals>` before commit).
- **The fix surface is BOTH the `git add` AND the `git commit -- <projectPathspec>` call in
  `archive_commit`** (`git commit -- <pathspec>` can pull working-tree matches independent of staging).
  Apply the `:(exclude)` to the commit pathspec too, OR let the e2e `git ls-files` assertion
  discriminate whether add-only suffices and fix accordingly. Do NOT copy the issue's snippet literally
  as add-only without confirming via the test.
- **Exclude-from-staging, NEVER delete the file on disk** — crash-resume (#429) and the #484 freshness
  guard both read the journal off the working tree, so deleting it breaks the #429 crash-resume e2e
  test. The fix must leave the on-disk receipt intact and only keep it out of the commit.

**RED test (the adversary the model cannot rubber-stamp).** Assert by **tracked-status, not
disk-existence**: after a clean `--sink`, `git ls-files` shows NO `sink-receipt.json` /
`sink-fallback.json` under `kaola-workflow/archive/<project>/`, while the journal still EXISTS on disk.
- Claude chain home: `scripts/simulate-workflow-walkthrough.js`, the existing `#429 Clean end-to-end
  --sink run` region (~line 12549) which already runs a real sink transaction and asserts the project
  is archived — add the `git ls-files` tracked-status assertion there.
- gitlab/gitea chain homes: `test-gitlab-sinks.js` / `test-gitea-sinks.js` (run by both their normal
  and codex walkthroughs). Add the matching `git ls-files` assertion.
- Codex chain: no dedicated assertion needed — the byte-identical codex twin + `validate-script-sync`
  byte-group enforcement cover the fix; confirmed no codex-walkthrough assertion expects the receipt
  tracked.
- Confirmed pre-freeze: no existing chain-run assertion expects the receipt TRACKED/committed after a
  clean sink (the #484/#518 fixtures hand-write a stale receipt to test the freshness guard and treat
  it as untracked), so the fix flips nothing RED.

**Cross-edition validation (#307).** This diff touches the sink-merge ×4 (canonical + codex twin +
two forge ports) plus three test homes — a cross-edition diff, so all four `npm run
test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green (run sequentially) before the
sink. The codex chain's sink-merge twin is enforced byte-identical by `validate-script-sync`.

**Scope — the 7 leftover committed receipts are deliberately EXCLUDED from this plan.** AC marks
untracking them "(Optional housekeeping)". They are FOREIGN-project archives
(`bundle-429-434`, `bundle-440-441`, `bundle-445-446`, `issue-443`, `issue-451`, `issue-453`,
`issue-455`); `git rm --cached` on them mid-run risks the FOREIGN_ARCHIVE guard (#261) and barrier
complications, and they are out-of-lane for the n1 write set. Conscious exclude — handle as a manual
follow-up if desired, not silently omitted.

**n2-review (code-reviewer, opus).** G1 gate — post-dominates the only code-producing node (n1).
Opus because the subtle correctness point (add-vs-commit pathspec coverage; exclude-not-delete so
crash-resume survives; byte-identity of the codex twin) is exactly the kind of subtle review where
reasoning depth catches a half-fix the cheap tier would wave through.

**n3-finalize (finalize).** Unique sink; docs-only write (`CHANGELOG.md`). No model cell — the
finalize sink is never dispatched as a subagent. No public-interface or doc-structure change beyond
the changelog entry, so no separate `doc-updater` node is needed (CHANGELOG rides the finalize sink).
No `security-reviewer` (labels empty; no secrets/auth/sensitive surface). No decision record minted —
a one-line behavioral bug fix with a named cause does not warrant a `D-520-NN` record.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-review | complete |
| n3-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix 65c841b6a07d | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review e5af1a24d4f9 | |
| finalize (n3-finalize) | main-session-direct | evidence-binding: n3-finalize d4691cb2d1db | |
