evidence-binding: review-release-issue-accounting 3a76acbaaca6
verdict: pass
findings_blocking: 0
upstream_read: fix-release-issue-accounting f3399a35efdc

# Findings

## CRITICAL

None.

## HIGH

None.

## MEDIUM

None.

## LOW

None.

No blocking findings were found.

# Review Verdict

APPROVE. The implementation satisfies the frozen review brief, retains the existing release-verifier safety boundaries, and is ready for the finalize node's CHANGELOG move.

# Grounded Review

- Authoritative online accounting is implemented in `scripts/kaola-workflow-release.js:70-86`: injected issue numbers are stable-deduplicated, unknown Unreleased references are computed against injected-or-git-known issues, and inverse missing issues are computed only when an injected set exists. `unknown` retains first-seen Unreleased order and `missing` retains stable injected order.
- `--verify` preserves the public envelope at `scripts/kaola-workflow-release.js:129-143`. Unknown references refuse first as `changelog_unknown_reference` with `unknown`, while inverse gaps refuse separately as `changelog_incomplete` with `missing`; both include `verification`, `changelog_refs`, `closed_issues`, chain greenness, and the stable human refusal string.
- `--prepare` consumes the same result coherently at `scripts/kaola-workflow-release.js:146-176`: both typed issue refusals occur before the receipt binding or release-file mutation.
- Offline mode remains explicit through the null-injection boundary at `scripts/kaola-workflow-release.js:83,137-143,302-305`: it disables only the inverse authoritative-set check, continues to protect against Unreleased references absent from git history, and reports `verification:"offline"` with git-log-only `closed_issues`.
- The committed tests at `scripts/test-release.js:145-175` cover bounded/ordered Unreleased parsing, both mismatch directions, complete authoritative acceptance, injected and changelog duplicate deduplication, stable output order, and offline git-log-only accounting. Existing envelope coverage at `scripts/test-release.js:133-143` remains green. No missing-test finding remains after the independent controls below.
- The token-neutral README edition literals at `scripts/kaola-workflow-release.js:208-216` preserve the same runtime strings while satisfying the forge forbidden-token contracts. No new external input, secret, auth, user-data, network, or privilege surface was introduced.

# Independent Validation

- `node scripts/test-release.js` -> exit 0, `test-release: all 240 assertions passed`.
- Isolated injected/online controls -> exit 0 overall:
  - Unreleased `[658]` with injected `654,655,654,656,658` refused `changelog_incomplete`, `missing:[654,655,656]`, `verification:"online"`, stable `closed_issues:[654,655,656,658]`.
  - Unreleased `[654,999]` with injected `654,655,654` refused the distinct `changelog_unknown_reference`, `unknown:[999]`; the payload did not conflate this with the simultaneous inverse gap.
  - Duplicate/order control passed with `changelog_refs:[658,654,656,655]` and stable injected `closed_issues:[654,655,656,658]`.
  - An Unreleased `#999` absent from injection but present in post-tag git history passed online and yielded `closed_issues:[654,999]`, confirming the preserved injected-or-git-known protection.
  - Human controls emitted exactly `verify: REFUSED changelog_incomplete` and `verify: REFUSED changelog_unknown_reference` on stderr with exit 1.
- Isolated offline controls -> exit 0 overall: a post-tag `#661` passed with `verification:"offline"` and `closed_issues:[661]`; an Unreleased `#777` absent from git history refused `changelog_unknown_reference` while retaining `verification:"offline"` and `closed_issues:[]`.
- Isolated `--prepare` controls -> exit 0 overall: inverse gaps refused `changelog_incomplete` with stable missing order, unknown refs refused `changelog_unknown_reference`, and both left the fixture clean with no release receipt created.
- Live pre-CHANGELOG command `node scripts/kaola-workflow-release.js --verify --issues-closed 654,655,656,658,659,660,661,662 --json` -> expected exit 1 with `reason:"changelog_incomplete"`, `missing:[654,655,656]`, `verification:"online"`, and unchanged CHANGELOG. This verifies the finalize node has not moved those entries early.
- `cmp -s scripts/kaola-workflow-release.js plugins/kaola-workflow/scripts/kaola-workflow-release.js` -> exit 0 (canonical/Codex byte identity).
- Rename-normalizing `kaola-gitlab-workflow-release` and `kaola-gitea-workflow-release` to the canonical usage name and piping each file to `cmp -s` against the canonical script -> exit 0 for both editions.
- GitLab and Gitea `--forbidden-only` contract checks over their changed release scripts -> exit 0 for both.
- `git diff --check` -> exit 0.

# Upstream TDD and Cross-Edition Gate Evidence

The bound upstream evidence records RED with the two prior behavioral failures plus the expected distinct-unknown mismatch, followed by GREEN with all 240 focused assertions passing. It also records the required final clean sequential Meta command:

`npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`

That final sequential run exited 0 across Claude, Codex, GitLab, and Gitea and is the only upstream Meta run accepted for this review. Earlier overlapping attempts that produced shared-fixture EISDIR noise, and the nested-tool attempt that lost its final envelope, are explicitly treated as discarded run noise and provide no gate evidence.

# Scope and Parity

`git status --short` and `git diff --name-status` show exactly the frozen five product/test paths modified:

- `scripts/test-release.js`
- `scripts/kaola-workflow-release.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-release.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js`

The active untracked `kaola-workflow/issue-663/` folder contains workflow bookkeeping and the seeded evidence files. `CHANGELOG.md`, financial-agent surfaces, and all other product files are untouched. Canonical/Codex identity and rename-normalized forge parity are exact.
