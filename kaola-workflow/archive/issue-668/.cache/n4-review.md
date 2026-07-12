evidence-binding: n4-review e70bc3bac308
upstream_read: n1-fix-assertion 7d81297cad4c
upstream_read: n3-gitlab-leak 4ea6c89e47b8
verdict: pass
findings_blocking: 0

# G1 Review — n4-review, issue-668 (nonce e70bc3bac308)

Scope: git diff 1030190f..HEAD at merged HEAD a3bd3e81. Non-evidence changed: scripts/test-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, + n2 docs (out of scope, docs-only confirmed).

## n1 — test-adaptive-node.js (#434-b harness)
(a) PASS — vacuous reviewerEvidence.includes(...) replaced with assert(result.evidenceRemoved && !result.evidenceRemoved.includes('review.md')) on the captured runRepairNode return, not a local constant.
(b) PASS — genuinely discriminating: evidenceRemoved init [], populated only via removeEvidenceName in loop 4c (fan-out groups), unconditionally returned. If field dropped → fails closed; a purge routing review.md through the tracker → fails; direct-unlink caught by preserved !removedBaselines.includes('review.md'); the cacheExists-guarded avenue pinned by the adjacent #664/#665 tests (present664 includes review.md, asserts not removed). Matches the deliberate singleton-retention comment.
(c) PASS — adjacent !removedBaselines.includes('review.md') preserved.
(d) PASS — only the one assertion replacement + comment (net +6/-2); 1767 assertions unchanged.

## n3 — test-gitlab-workflow-scripts.js (#519(gl-b2b))
(a) PASS — three new assert.ok over result.reasoning (classifier output), not mock input.
(b) PASS — discriminating vs fetchIssueWithRetry's fixed genuine-negative reasoning: includes(cleanErr.stderr.trim()) catches raw-stderr interpolation; /Unknown/ + /401/ regexes catch leaked CLI diagnostics; typeof string fails closed. Exactly the #659 manual-grep vocabulary, now wired.
(c) PASS — reuses existing withClassifierForge seam + existing result/cleanErr.
(d) PASS — forge-neutral messages ("raw fetch-error text"/"CLI diagnostic token"); no forge CLI binary named in added lines (the pre-existing 'glab exited 1' fixture is mock input, unchanged). Minor loose-wording note (comment says forge-neutral while the fixed string starts 'glab ...') — functionally irrelevant, not a finding.
(e) PASS — +11 lines inside the block only.

## Runs
test-adaptive-node.js exit 0 (1767 assertions); test-gitlab-workflow-scripts.js exit 0; validate-kaola-workflow-gitlab-contracts.js exit 0.
EISDIR noise (task-mirror.js:143, 4 traces) NOT introduced here (git log 1030190f..HEAD -- task-mirror.js empty); pre-existing #437 lane, filed #671; suite exits 0.

## Summary
CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0. Verdict: APPROVE — both test-hardening edits surgical, bound to real production outputs, genuinely discriminating, all confirmation runs green. Zero findings, nothing blocking.
