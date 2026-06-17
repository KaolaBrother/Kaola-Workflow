# Workflow Plan — bundle-510-511-519

<!-- plan_hash: 8997ab461805f2d34a78a324a2284f03627e1b343231f124f144f224b06a823d -->

## Meta

labels: bug, area:scripts, area:workflow-router
bundle_id: bundle-510-511-519
issue_numbers: 510, 511, 519

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-axis-fix | tdd-guide | — | scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-active-folders.js, plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js, scripts/test-claim-hardening.js, scripts/test-bundle-claim.js, scripts/test-issue-probe-memo.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence | opus |
| n2-code-review | code-reviewer | n1-axis-fix | — | 1 | sequence | opus |
| n3-docs | doc-updater | n2-code-review | CHANGELOG.md, docs/decisions/D-519-01.md | 1 | sequence | sonnet |
| n4-finalize | finalize | n3-docs | kaola-workflow/bundle-510-511-519/workflow-state.md | 1 | sequence | — |

## Plan Notes

Scope: ONE semantic axis change — classifier / claim-time gh-fetch error classification —
spanning #519 (foundational axis fix), #510 (malformed-JSON parity), #511 (forge determinate-refuse
test-pin). #495/#507 residuals. All three share ONE coupled file set across all four editions; they
are authored as a single implementation node (n1) because the change is semantically coupled and
the forge classifier + forge test files are a shared write lane across the three issues — splitting
them is `write_set_overflow`-by-construction and risks divergent cross-edition prose (#309/#431).
There is no file-count ceiling forcing a split (#453); the 17-file set moves atomically.

### n1-axis-fix — what to build (test-first, all four editions)

REPLACE THE AXIS (do NOT point-patch one more site). Partition gh fetch errors by error-class from
stderr, NOT by exit code:
- transient-infra (TLS handshake timeout / API rate-limit / DNS "Could not resolve host" /
  connection reset / ETIMEDOUT / 5xx) → the EXISTING `indeterminate` / `escalate` valve
  (`target_(set_)indeterminate`, `result: escalate`).
- genuine-negative (404 / "Could not resolve to an Issue" / closed / assigned) →
  `target_(set_)unavailable` / `result: refuse` (UNCHANGED).

Apply UNIFORMLY at all cited sites (root + codex byte-twin + gitlab + gitea ports):
1. classifier `getRepoOwnerName()` / `gh repo view` (classifier.js:62-63) — currently a BARE
   unwrapped `ghExec`; wrap it so a transient `gh repo view` fault cannot crash to `clean_nonzero`.
   This was the literal FIRST failure in the live repro.
2. classifier classify-path `gh issue view` fetch (classifier.js:643-663) — the `clean_nonzero`
   break must now consult stderr error-class, not just exit code.
3. claim.js `classifySubprocessError` / `classifyIssue` (claim.js:680-755) — same stderr-class split;
   transient `clean_nonzero` → indeterminate/escalate, genuine-negative → refuse.
4. `probeIssueState` (active-folders.js:115-132, ×4) — currently single `gh issue view`, ZERO retry,
   no escalate; collapses transient + genuine to `state:'unavailable'`. Give it the split + retry +
   escalate. CONTRACT (NON-BREAKING — pin this shape): KEEP returning `{state:'unavailable'}` for the
   genuine/unknown case so non-claim readers are unaffected, and ADD a separate transient discriminant
   (e.g. an additional field/reason value such as `transient: true` or `reason: 'transient'`) that
   ONLY the claim.js callers route to escalate. The claim.js callers consuming
   `probe.state === 'unavailable'` (claim.js:202-203, 828-831, 1265-1269, 2150, 2165-2167, 2841)
   must route the new transient signal to the escalate path; the bundle path
   (claim.js:1264-1297) must reach `target_set_indeterminate` / `result: escalate`.
   DO NOT change `probeIssueState`'s return for closed/open — `closure-audit.js` (×4) and
   `test-issue-probe-memo.js` read only `.state` (closed/open/unavailable) and MUST remain
   unaffected (that is why `closure-audit.js` is deliberately OUT of the write set — a conscious
   non-breaking call, not an omission).
5. (sibling) `issueHasRemoteClaimComment` `gh api .../comments` (classifier.js:272-277) — EVALUATE
   and note (a transient blip there silently catches to "no claim" = a different false-"unclaimed"
   conflation). Decide patch-or-note in the node evidence.

#510 (malformed-JSON parity) — converge all four editions on #519's CORRECTED taxonomy: an
exit-0-with-unparseable/empty body is a TRANSIENT fault → indeterminate/escalate (mirroring root's
in-`try` `JSON.parse` SyntaxError), NOT `clean_nonzero = refuse`. The malformed signal must NOT be
destroyed before the classifier sees it: the current forge fetch path is
`fetchIssueWithRetry(args.issue, forge.viewIssue.bind(forge))`, and `forge.viewIssue` calls
`parseJson(raw, {})` which SWALLOWS exit-0-unparseable to `{}` (no throw) → the classifier's
`state:'unknown'` guard cannot tell "swallowed malformed JSON" from "genuinely empty." VERIFIED
SEAM: both forge modules export a RAW exec (`glabExec` at kaola-gitlab-forge.js exports, `teaExec`
at kaola-gitea-forge.js exports), so the forge classifier CAN strict-parse the raw fetch without
editing the shared `parseJson` helper. Preferred fix: at the FORGE CLASSIFIER's fetch seam (in
kaola-{gitlab,gitea}-workflow-classifier.js), strict-parse the raw body (via the exported raw exec
or a new strict-view) and map a parse failure to the TRANSIENT class, mirroring root's in-`try`
`JSON.parse` SyntaxError. Do NOT change the shared `parseJson(raw, {})` `{}` fallback — gitea
forge.js:179 (`editIssue`, non-JSON stdout) depends on it. `kaola-{gitlab,gitea}-forge.js` ARE
declared in n1's write set as a deliberate HEDGE: if the only correct seam is a NEW strict-parse
variant exported from forge.js (leaving the existing `parseJson` `{}` fallback intact), the
implementer may edit forge.js without a mid-run plan-repair. The barrier checks actual ⊆ declared,
so an unused forge.js declaration is harmless.

#511 (forge determinate-refuse test-pin) — add a forge (gitlab + gitea) END-TO-END claim-flow test
asserting a GENUINE-negative `clean_nonzero` (mock `gh`/forge CLI emitting a real 404 /
"Could not resolve to an Issue" stderr) routes to `result: refuse` / `target_unavailable`. It must
NEVER use a generic "gh exits 1" / bare `network error` mock — under #519 that now ESCALATES, and a
generic-exit-1 pin would enshrine the #519 bug.

Tests in n1's write set (the axis change BREAKS existing pins that must be reconciled to the
corrected taxonomy, plus the new RED tests):
- `test-claim-hardening.js` `#495(c)` and `test-bundle-claim.js` `#495(c-bundle)`: currently pin
  `clean_nonzero → refuse` with a GENERIC mock → update to a GENUINE-negative stderr; ADD a
  transient-stderr (TLS timeout) → escalate case (the kaolaGIT repro: transient on BOTH `gh repo view`
  AND `gh issue view` → escalate, NOT refuse).
- forge `test-{gitlab,gitea}-workflow-scripts.js`: the `viewIssue throws → unavailable`
  probeIssueState test (~l.632/634) and the `clean_nonzero remains determinate → target_unavailable`
  pin (~l.2274-2275) are BROKEN by #519 — reconcile to the corrected taxonomy AND add the #511
  genuine-negative determinate-refuse end-to-end claim-flow test.
- `test-issue-probe-memo.js`: confirm the new `probeIssueState` return shape keeps the
  `.state === 'closed'` memo assertion green (non-breaking discriminant design preserves it).

CROSS-EDITION (#307): every source fix is byte-mirrored to its codex twin (root ↔
plugins/kaola-workflow/scripts/* — enforced by `validate-script-sync.js COMMON_SCRIPTS`, MUST be
byte-identical) and hand-mirrored to the gitlab/gitea data-layer ports (NOT auto-generated by
edition-sync.js — only token-pinned, so silent drift survives all four chains; the #340 forge-port
lesson). Canonical spec for each forge port = the FULL accumulated root diff vs the run base for
that file, mirrored modulo forge nouns (the forge CLI / the forge), NEVER a per-concern enumeration.
n1 must self-verify all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green
(run SEQUENTIALLY — `npm test` short-circuits on the first red). The codex chain runs
`validate-script-sync.js` (byte twin) + `validate-kaola-workflow-contracts.js` +
`simulate-kaola-workflow-walkthrough.js`; the gitlab/gitea chains run `edition-sync.js --check` +
the forge contract validators + the forge walkthroughs.

### n2-code-review

Opus gate (G1 post-dominance over the code-producing n1). The transient-vs-genuine taxonomy is
subtle correctness — verify: (a) the stderr error-class partition is applied UNIFORMLY at all four
cited sites in all four editions (no point-patch survivor); (b) the four editions converge on the
SAME verdict for the SAME fault (no #307 divergence) — transient → escalate everywhere,
genuine-negative → refuse everywhere; (c) `probeIssueState`'s discriminant is non-breaking for
closure-audit/probe-memo readers; (d) #511's test uses a GENUINE-negative stderr, never a generic
exit-1; (e) all four chains are green (sequentially), and the forge ports are full-diff mirrors not
half-mirrors. Emit lowercase `verdict: pass` + `findings_blocking: 0` to pass the finalize
verdict-check.

### n3-docs

CHANGELOG.md [Unreleased] entry covering #519/#510/#511 (the axis fix + parity + test-pin). Decision
record `docs/decisions/D-519-01.md` (next free id — no existing D-510/D-511/D-519 records; anchor on
the foundational issue #519) recording the axis replacement (exit-code → stderr-error-class) and the
non-breaking `probeIssueState` discriminant decision. Public-interface / classification-semantics
changed → doc-updater required before finalize.

### n4-finalize

Docs/state-only sink. Records closure; writes only
`kaola-workflow/bundle-510-511-519/workflow-state.md`. A non-docs write here trips code-reviewer.

## Node Ledger

| id | status |
| --- | --- |
| n1-axis-fix | complete |
| n2-code-review | complete |
| n3-docs | complete |
| n4-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-axis-fix) | subagent-invoked | evidence-binding: n1-axis-fix 270176ef7b4e | |
| code-reviewer | subagent-invoked | evidence-binding: n2-code-review ed2990005960 | |
| doc-updater (n3-docs) | subagent-invoked | evidence-binding: n3-docs 87e619bef729 | |
