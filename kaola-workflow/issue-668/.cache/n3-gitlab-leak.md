evidence-binding: n3-gitlab-leak 4ea6c89e47b8
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: test-hardening — adding one wired output assertion to an existing gitlab classifier test (#519(gl-b2b) genuine-negative clean_nonzero block); no production change, no separate failing unit precedes a test-file edit; verified by the gitlab chain.
<!-- regression-green|build-green|smoke-integration -->
regression-green: yes — full gitlab suite green before and after (see verification_commands/after_result below)

## task
Item 3 of issue-668 roadmap hygiene: in
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`, the `#519(gl-b2b)`
genuine-negative `clean_nonzero` classification block already asserted
`classifier.classifyIssue(99, root).verdict === 'target_unavailable'` but never asserted anything
about the human-facing classification OUTPUT text itself — the #659 evidence for "no ambient
CLI/auth leak" relied on a manual grep over full test-process output, not a wired assertion. Add
ONE wired assertion, in that block, that `result.reasoning` carries no leaked raw stderr text.

## non_tdd_reason (category)
Test-hardening / characterization-style strengthening of an existing test's own assertions.
No production code changed. No new behavior introduced — the assertion pins an invariant that was
already true (verified: the added assertion passes without any production change). This is not
"a bug fix" and not "new behavioral logic" — it is strengthening test coverage on an existing
passing case, so it does not fit tdd-guide's red-first ceremony; it fits the implementer's
test-hardening non-TDD category.

## verification_tier
regression-green

## write_set
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (only file touched; +11
  lines inside the existing `#519(gl-b2b)` block, no other block touched)

## Investigation notes
- Read the `#519(gl-b2b)` block (originally lines 4805-4831): mock seam is
  `withClassifierForge({ viewIssue: ... throw cleanErr, discoverProject, listIssueNotes }, () =>
  classifier.classifyIssue(99, root))`; `cleanErr.status = 1` (clean non-zero) and
  `cleanErr.stderr = 'GraphQL: Could not resolve to an Issue with the number of 99.
  (repository.issue)\n'` (a genuine-negative 404-shaped fixture). The variable holding the
  classification result is `result` (`const result = withClassifierForge(...)`), and the assertions
  already present check `result.verdict` and the local `callCount`.
- Read `classifier.js` `fetchIssueWithRetry` (kaola-gitlab-workflow-classifier.js:568-600): the
  genuine/determinate-refuse arm returns a FIXED, forge-neutral reasoning string —
  `{ verdict: 'target_unavailable', reasoning: 'glab issue fetch failed; refusing to claim outside
  KAOLA_WORKFLOW_OFFLINE=1' }` — it never interpolates the caught error's `.stderr`/`.message` into
  `reasoning`. This is the field the new assertion checks.
- Read the module-level "hostile" shim (test-gitlab-workflow-scripts.js:31-33): a sandbox-wide
  `KAOLA_GLAB_MOCK_SCRIPT` pointed at a script that does only `process.exit(97);` — no stdout/stderr
  text of its own. It is a poison canary for any codepath that bypasses `withForge`/
  `withClassifierForge` stubs and shells out for real; it carries no literal string to assert
  against directly. The archived #659/#668-origin evidence (`kaola-workflow/archive/bundle-658-659-
  660/.cache/n2-fence-parser-and-hermetic-fixtures.md`,
  `.cache/n5-adversarial-parser-hermeticity.md`) recorded the manual-grep check as: captured process
  output contained no `Unknown flag`, auth/host, or `401 Unauthorized` diagnostics — i.e. the
  representative leaked-token vocabulary a real unstubbed forge CLI failure would produce. Those two
  tokens (`Unknown`, `401`) are what the new assertion checks against `result.reasoning`, alongside
  a direct check that `result.reasoning` never echoes the raw fixture stderr text verbatim.
- Confirmed `result` in this block has only `verdict` + `reasoning` fields (no `.reason` field —
  that field name belongs to a different function's return shape used earlier in the file, at the
  unrelated case-2a/2b block near line 754-756).

## Change made
Inserted, inside the existing `#519(gl-b2b)` try block, immediately after the existing
`callCount` assertion and before the `finally`:
```
assert.ok(typeof result.reasoning === 'string' && !result.reasoning.includes(cleanErr.stderr.trim()),
  '#668(gl-b2b-leak): reasoning must NOT echo the raw fetch-error text verbatim (got ' + JSON.stringify(result.reasoning) + ')');
assert.ok(!/Unknown/.test(result.reasoning),
  '#668(gl-b2b-leak): reasoning must NOT leak an "Unknown"-style CLI diagnostic token (got ' + JSON.stringify(result.reasoning) + ')');
assert.ok(!/401/.test(result.reasoning),
  '#668(gl-b2b-leak): reasoning must NOT leak a "401"-style CLI diagnostic token (got ' + JSON.stringify(result.reasoning) + ')');
```
plus a short comment explaining the invariant. Reused the existing `withClassifierForge` mock seam
and the existing `cleanErr` fixture unchanged — no new fixture, no production-code change. New
comments/assertion messages use forge-neutral vocabulary ("fetch-error text", "CLI diagnostic
token") and do not name any forge CLI binary; only the pre-existing fixture data (`cleanErr =
new Error('glab exited 1')`, mock input, not my added output) still contains the literal binary
name, which the task explicitly allows.

## verification_commands
1. `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
   → exit 0, "Kaola-Workflow GitLab contract validation passed"
2. `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
   → exit 0, "GitLab workflow script tests passed" (includes
   `testGitlabBoundary2FetchRetry507 (#507/#511/#519): PASSED`, which contains the edited block)

## before_result
Ran `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` against the
pre-edit file (via a scoped re-run of the untouched suite state prior to the Edit tool call, and
by inspection of the block): the pre-existing `#519(gl-b2b)` assertions
(`result.verdict === 'target_unavailable'`, `callCount === 1`) already passed; suite was green
(exit 0, "GitLab workflow script tests passed") before this change.

## after_result
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` → exit 0
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → exit 0, all cases
  PASSED including `testGitlabBoundary2FetchRetry507 (#507/#511/#519): PASSED`, ending
  "GitLab workflow script tests passed"
- No production file was changed; the new assertion passes against the existing, unmodified
  `classifier.js` behavior (fixed forge-neutral `reasoning` string), confirming the invariant was
  already true and is now locked in by a wired check instead of a manual grep.
