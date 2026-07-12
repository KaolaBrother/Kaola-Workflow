evidence-binding: review-release-parser b25da8426107
verdict: pass
findings_blocking: 0
upstream_read: fix-unreleased-parser 70252d93b933

# Code Review — release `[Unreleased]` parser fix

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

None.

### LOW

None.

No blocking findings were found. Prose verdict: **APPROVE**.

## Correctness review

- `unreleasedSection(text)` is the single parser used by both verifier consumers: `issuesOkay()` reads its `refs` at `scripts/kaola-workflow-release.js:70-78`, and `runVerify()` reads the same result at `scripts/kaola-workflow-release.js:121-134`. The repository search found no third verifier parser or remaining duplicated multiline-dollar block expression.
- The helper finds the `[Unreleased]` heading without consuming a newline, searches the remainder for the next column-zero level-2 heading, and slices to `text.length` when none exists (`scripts/kaola-workflow-release.js:62-68`). EOF therefore has no multiline-`$` ambiguity, while `###` headings and inline `##` text remain inside the section.
- The absent-heading branch is stable and explicit: `{ section: '', refs: [] }` at `scripts/kaola-workflow-release.js:64`. An independent black-box fixture observed successful `--verify` output with `changelog_refs: []` when `[Unreleased]` was absent.
- `--prepare` retains its independent typed refusal after issue validation: `no_unreleased_section` remains at `scripts/kaola-workflow-release.js:160-165`. The same independent fixture observed nonzero exit with exactly that reason.
- Reference extraction uses `matchAll()` in source order followed by `Set` insertion-order deduplication (`scripts/kaola-workflow-release.js:68`). The committed cases assert EOF values/order/deduplication, next-level-2 termination, and non-truncation by level-3/inline heading-like text at `scripts/test-release.js:145-157`.
- The missing-reference path is genuinely black-box exercised through `--verify`: reference `#731` is absent from injected closed issue `661`, and the test requires nonzero status, `reason: changelog_incomplete`, and exact `missing: [731]` (`scripts/test-release.js:34-39`, `scripts/test-release.js:156-157`).

## Parity and scope review

- Canonical/Codex identity is preserved between `scripts/kaola-workflow-release.js:62-68` and `plugins/kaola-workflow/scripts/kaola-workflow-release.js:62-68`; independent `cmp -s` exited 0.
- GitLab and Gitea carry the same helper and two call-site replacements at `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js:62-72,123-126` and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js:62-72,123-126`. Independent `node scripts/validate-script-sync.js --check` exited 0 and reported all 8 rename-normalized families in sync.
- The actual product diff contains exactly the five paths declared for `fix-unreleased-parser` in `kaola-workflow/issue-662/workflow-plan.md:13-16`: the canonical script, Codex mirror, GitLab port, Gitea port, and `scripts/test-release.js`. No registration surface or unrelated product file changed.

## TDD and validation evidence

- Upstream evidence records the focused RED as four parser failures with 232 passes and the GREEN/refactor run as all 236 assertions passing (`kaola-workflow/issue-662/.cache/fix-unreleased-parser.md:2-3,24-26`).
- Independent review run: `node scripts/test-release.js` exited 0 with `test-release: all 236 assertions passed`.
- Independent parity run: `node scripts/validate-script-sync.js --check` exited 0; independent canonical/Codex `cmp -s` exited 0.
- Independent absence/value fixture exited 0 after asserting absent `[Unreleased]` produces `changelog_refs: []` for `--verify` and `no_unreleased_section` for `--prepare`.
- The required sequential four-chain command and exit-0 result are explicitly recorded in upstream evidence, including both full forge contract validators and release regression coverage (`kaola-workflow/issue-662/.cache/fix-unreleased-parser.md:24-32`).
- `git diff --check` was independently observed clean; the upstream evidence records the same result at `kaola-workflow/issue-662/.cache/fix-unreleased-parser.md:29`.

## Coverage and maintainability

The parser logic is small, forge-neutral, named for its responsibility, and removes duplicate behavior. The focused regression cases cover the changed structural-boundary, encounter-order, deduplication, and refusal behavior; independent review coverage additionally exercised the stable absence branch and unchanged explicit prepare refusal. No missing-test issue requiring repair was found.
