evidence-binding: n2-review 9282ff9fcac0
verdict: pass
findings_blocking: 0

# n2-review — issue #527 (gitlab/gitea orient --summary scratch leak)

Reviewed the uncommitted n1-fix diff. Scope: exactly two files
(plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-workflow-scripts.js).
git status confirms no other repo changes (only kaola-workflow/issue-527/ active artifacts).

## 1. Correctness of the fix — PASS
The `orient --summary` spawn now passes `cwd: summaryRoot`. `summaryRoot` comes from
`tempRoot('kw-{gl,gt}-orient-summary-')`, which is `fs.mkdtempSync(path.join(os.tmpdir(), name))`
(test file line 47) — an absolute path rooted in os.tmpdir(), NOT relative to the repo. orient
materializes kaola-workflow/<project>/.cache/orient-envelope.json relative to its process cwd, so
with cwd redirected the scratch tree lands under $TMPDIR, not the repo working tree. Cleanup
`fs.rmSync(summaryRoot, { recursive: true, force: true })` is in a `finally`, so it runs even when
the assertion throws. No residual leak path: the only writer (the child orient process) inherits
the tmp cwd; the parent test does no repo-cwd write. force:true tolerates an already-absent dir.

## 2. #446 sentinel preserved — PASS
`assert.ok(summaryOut.startsWith('summary:'), ...)` is unchanged in meaning. The spawn argv
(orient --project nonexistent-*-445-test --json --summary), the offline env, the trim(), and the
sentinel predicate are all identical to the pre-fix code — only `cwd` was added to the spawn opts
and the body wrapped in try/finally. The sentinel is not weakened or removed.

## 3. Cross-edition mirror parity (#307/#309) — PASS
Normalized diff of the two added hunks is byte-identical modulo the forge noun
(gitlab/gitea, gl/gt): comment text, helper name pattern, try/finally structure, spawn opts, and
cleanup are the same logical change. No structural divergence.

## 4. Scope — PASS
No change outside the two test files. The shared orient source (kaola-*-workflow-adaptive-node.js)
is untouched — the fix is correctly test-local (orient's read-only-but-materializes-cache behavior
is documented in the comment, not altered). No unrelated edits in either file.

## 5. Convention fit — PASS
`tempRoot(...)` + try/finally + `fs.rmSync(root, { recursive: true, force: true })` matches the
prevailing pattern in these files (tempRoot used at ~20+ sites, e.g. lines 259/305/331...). fs/os/path
are already required at the top of both files (lines 5-7). The 'kw-{gl,gt}-...' prefix convention is
followed.

## Non-blocking nits
- None worth raising. The temp-cwd-redirect approach is the minimal correct fix and is consistent
  with the rest of the suite.

Verdict: APPROVE. Clean, surgical, scoped, twin-parity-preserving. Note the cross-edition
validation policy (#307) still requires all four npm chains green before finalize — that is a
finalize-gate concern, outside this read-only review node.
