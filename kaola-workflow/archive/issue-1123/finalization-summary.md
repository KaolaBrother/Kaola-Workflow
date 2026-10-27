# Finalization Summary — issue-1123

## Delivered

Multi-forge coexistence for Kaola-Workflow (#1123), delivered in four phases:

- **P0** measurement table in `docs/investigations/2026-10-27-multi-forge-p0-measurements.md`.
- **P1** byte-identical `kaola-workflow-forge-resolve.js` (T1–T4 + `forge_hosts`, `set`/`unset`) and
  `forge_mismatch` guards at claim startup/resume and every sink, before the first forge CLI call.
- **P2** Claude multi-forge install: comma-list `--forge`, three committed `templates/routing/multi/`
  entries, one compact hook, per-forge uninstall, `install-all --check` forge sets, and the
  measured/proposed D5 increment.
- **P3** Codex two-plugin coexistence and the documented single-forge + P1-guard posture for the
  nine additive runtimes; `docs/antigravity-edition.md` corrected to receipt/copy facts.
- **Round 1** fixes: GitLab `sink: mr` routes to the request MR sink; JS guard recorder with
  positive controls; multi init resolver, same-shell instruction, refusal `return 1`; ZCode gate.
- **Round 2** touch-up: CLI HOME isolation order, `--shell` operator hint, Cursor receipt-prune
  wording, non-empty `KW_FORGE` guards, CHANGELOG `scripts=` label, test nits.

## Candidate

- Branch: `workflow/issue-1123`
- Commit: `6e502753` (`fix(forge): round-2 review touch-up (#1123)`)
- Base: `3a3861a9`

## Evidence

- Issue #1123 P0–P3, round-1 and round-2 comments (see the final closure comment for pointers).
- Independent review: `.kaola/review-1123.md`, round 3 PASS (mergeable).
- Recorded validation: `.cache/final-validation.md` — `verdict: pass`, command `npm test`,
  candidate hash bound to this worktree.
- Host independent full chain on `6e502753`: `NPM_TEST_EXIT=0`, 0 FAILED, 27 routing surfaces
  byte-match.
- Focused evidence: resolver 41, guards 23, multi-sink 9 routes, multi-install 19, additive 9
  decisions, editions lane 13/13, full walkthrough 205/205.

## Known failures or unverified scope

- D5 `3,000` estimated-token cap is a **proposal pending owner ratification**; measured
  Next+Finalize increment is `2,890` (110 headroom).
- P4 (tea second-login binding) remains gated on the unmeasured second authorized login; not
  started.
- Guard scope: `claim`, `release/discard`, `finalize`, `watch-pr`, `list-open` remain unguarded by
  design (§2.3). Recorded as a potential follow-up, not filed.

## Validation

classification: chains_unverified
green: false
mode: chain-receipt

no chain receipt at /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1123/kaola-workflow/issue-1123/.cache/chain-receipt.json — run kaola-workflow-run-chains.js after the LAST commit so HEAD is covered; prose "all four chains green" is not evidence

No chain receipt found. Run kaola-workflow-run-chains.js after the last commit so HEAD is covered.

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- AGENTS.md
- CHANGELOG.md
- README.md
- docs/README.md
- docs/antigravity-edition.md
- docs/api.md
- docs/cursor-edition.md
- docs/decisions/0032-per-repo-forge-resolution.md
- docs/devin-edition.md
- docs/droid-edition.md
- docs/dsh-edition.md
- docs/grok-edition.md
- docs/installation.md
- docs/investigations/2026-10-27-multi-forge-p0-measurements.md
- docs/kimi-edition.md
- docs/opencode-edition.md
- docs/prompt-size.md
- docs/zcode-edition.md
- install-all.sh
- install.sh
- package.json
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-forge-resolve.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-forge-resolve.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-forge-resolve.js
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js
- scripts/edition-sync.js
- scripts/generate-routing-surfaces.js
- scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-forge-resolve.js
- scripts/kaola-workflow-install-manifest.js
- scripts/kaola-workflow-sink-merge.js
- scripts/kaola-workflow-sink-pr.js
- scripts/test-antigravity-edition.js
- scripts/test-cursor-edition.js
- scripts/test-devin-edition.js
- scripts/test-droid-edition.js
- scripts/test-dsh-edition.js
- scripts/test-forge-guards.js
- scripts/test-forge-resolve.js
- scripts/test-generate-routing-surfaces.js
- scripts/test-grok-edition.js
- scripts/test-issue-1123-additive-guard.js
- scripts/test-issue-1123-codex-multi-plugin.js
- scripts/test-issue-1123-multi-forge-install.js
- scripts/test-issue-1123-multi-sink.js
- scripts/test-kimi-edition.js
- scripts/test-opencode-edition.js
- scripts/test-zcode-edition.js
- scripts/validate-script-sync.js
- templates/routing/finalize.skeleton.md
- templates/routing/init.skeleton.md
- templates/routing/multi/kaola-workflow-finalize.md
- templates/routing/multi/workflow-init.md
- templates/routing/multi/workflow-next.md
- templates/routing/next.skeleton.md
- templates/routing/slots.js
- uninstall.sh

## Follow-Up Items

- Owner ratification or replacement of the proposed D5 `3,000` cap.
- P4 remains gated on a second authorized tea login.
- Potential follow-up: extend the forge guard to claim/release/finalize/watch-pr/list-open if the
  residual risk is accepted as worth a separate issue.

## Readiness

Ready for the finalize transaction: merge sink to `main`, close #1123, archive the run, and clean
up the worktree. No release, tag, prepare, or installer is part of this finalization.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1123/.cache/final-validation.md
- kaola-workflow/archive/issue-1123/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1123/finalization-summary.md
- kaola-workflow/archive/issue-1123/mission-ledger.jsonl
- kaola-workflow/archive/issue-1123/workflow-state.md
