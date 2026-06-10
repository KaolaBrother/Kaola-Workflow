# editions — implementer evidence (issue #357)

non_tdd_reason: glue/wiring — error-path output plumbing in test-runner harnesses; the observable change is "child output appears on failure"; no natural failing unit test (parallel-prose catch-block mirror ×4 edition files).

## Change (canonical pattern, tail30 helper + catch block byte-identical ×4, modulo the execFileSync path)
run() now catches the execFileSync error and prints a delimited stderr block — "--- CHILD FAILURE: <script> ---", stdout (last 30 lines), stderr (last 30 lines), "--- END CHILD OUTPUT ---" — then rethrows. Success path + exit codes byte-unchanged.

## smoke-integration (planted inline node -e failure, then removed)
BEFORE: bare "Command failed: …node -e …" — child detail swallowed. AFTER: delimited block shows "FAKE FAIL DETAIL/line2/line3" from the child stdout, then the original error, exit 1. Plant removed before regression runs.

## regression-green (all four edition suites)
- gitlab walkthrough → "GitLab workflow walkthrough simulation passed" exit 0
- gitlab codex walkthrough → "GitLab Codex workflow walkthrough simulation passed" exit 0
- gitea walkthrough → "Gitea workflow walkthrough simulation passed" exit 0
- gitea codex walkthrough → "Gitea Codex workflow walkthrough simulation passed" exit 0

## Diff
Exactly the 4 declared files, 26 lines each (harness node's walkthrough change is the sibling node's pre-existing worktree state, untouched here).
