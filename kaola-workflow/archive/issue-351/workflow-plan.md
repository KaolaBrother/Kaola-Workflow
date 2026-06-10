# Adaptive Workflow Plan — issue-351

<!-- plan_hash: 02f5fd1e6696886565324f74f53d09774ca1d4e90a2e44ac7deb721bf71168cf -->

bug(hooks): pre-commit guard misses `git -C` commits — the workflow's own finalize
commit bypasses the multi-project staging guard.

## Meta

labels: bug, area:scripts

## Design notes

- Root cause: `hooks/kaola-workflow-pre-commit.sh:21-24` gates on a `*"git commit"*`
  substring. The contractor finalize commit is `git -C "$ACTIVE_WORKTREE_PATH" commit`
  (agents/contractor.md:189) — no literal `git commit` substring — so the hook exits 0
  without inspecting staging. Any `git -c k=v commit` / `git -C <path> commit` variant
  evades the guard the same way.
- The hook is a byte-identical ×4 edition group enforced by
  `scripts/validate-script-sync.js` ("pre-commit hook copies": the 4 listed paths).
  Per #309 this is ONE semantic change across 4 byte-mirrored files; it is authored as a
  single node with a shared canonical spec so the editions converge by construction
  (byte-identical), NOT as a file-disjoint fanout that could diverge in prose.
- Test-first (AC1): the walkthrough already exercises pre-commit at
  `scripts/simulate-workflow-walkthrough.js` (`testHookSingleProjectGuard`, ~:486-494).
  A meaningful failing unit test exists — assert `git -C <wt> commit` with cross-project
  staging is BLOCKED (exit 2), plain `git commit` still BLOCKED, non-commit git
  untouched — so the implement role is `tdd-guide` (write the failing test first, then
  make it pass by robustly parsing the git command and deriving the repo root from the
  `-C` argument). Doubt → tdd-guide; here a clean failing test is available, so tdd-guide.
- Cross-edition symbol scoping (#306): the fix adds no new script-name const, env var,
  pinned doc phrase, or contract-validator needle. `validate-script-sync.js` already
  lists the 4 hook paths and compares them for byte-identity; editing all 4 identically
  satisfies it with no path-list change. Symbol grep confirms the change is hook-content
  only — write set = the 4 hook copies + the one walkthrough test file.
- Gates: tdd-guide produces code → `code-reviewer` post-dominates (G1). `code-reviewer`
  is a read-only role and declares NO write set (its review evidence lands in `.cache`
  via the executor, not a declared write path). Labels are bug / area:scripts (not
  sensitive) and the change hardens an existing guard rather than touching
  auth/secrets/IO surfaces → no security-sensitive node, G2 not triggered. No public
  interface / README / API change → no `doc-updater`; the user-visible note is a
  CHANGELOG entry, which is the `finalize` sink's permitted docs/state write. No external
  library/API behavior → no `knowledge-lookup`. Fix is surgical and fully specified by the
  issue → no separate `planner`/`code-architect` node.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| n1 | tdd-guide | — | scripts/simulate-workflow-walkthrough.js, hooks/kaola-workflow-pre-commit.sh, plugins/kaola-workflow/hooks/kaola-workflow-pre-commit.sh, plugins/kaola-workflow-gitlab/hooks/kaola-workflow-pre-commit.sh, plugins/kaola-workflow-gitea/hooks/kaola-workflow-pre-commit.sh | 1 | sequence |
| n2 | code-reviewer | n1 | — | 1 | sequence |
| n3 | finalize | n2 | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
| --- | --- |
| n1 | complete |
| n2 | complete |
| n3 | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1) | subagent-invoked | # n1 — tdd-guide evidence (issue #351) | |
| code-reviewer | subagent-invoked | verdict: pass | |
| finalize (n3) | subagent-invoked | # n3 — finalize sink evidence (issue #351, main-session bookkeeping) | |
