# #1113 P1 repair — cursor-KW-i1113-p1repair

Worktree: `/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113`
Branch: `workflow/issue-1113`
Base repaired from: `1203f76510f5dff3418b18ae6b5db116e0c1899a`
HEAD: `6423042aa1679564db6ca317bb4cf448f316da5c`
Worktree status after the commits: clean. No push, no ledger write, no finalize, no merge, no issue close.

Commits (author and committer `KaolaBrother <yanleichen@hotmail.com>`, no co-author trailer):

- `96c20b6100090df99d6c15c1ec430486bbfed0f1` — sink, ADR, public docs, Codex byte-mirror
- `6423042aa1679564db6ca317bb4cf448f316da5c` — walkthrough scenarios

Probed sink SHA-256 (worktree `scripts/kaola-workflow-sink-pr.js`, same bytes as `96c20b61`): `9ac99a9711fe8b1b6a6e94fdcc0eeee43af6b85df77c4deac82c23a159416624`

## P1-1 partial/duplicate intent

`assessKeepOpenPr` no longer treats the first `sinkField` value as the marker. Any `keep_open_pr` line counts, including an empty value (`sinkFieldValues` length, `scripts/kaola-workflow-sink-pr.js` 237–265). Any `--keep-open-pr` token counts, including a bare token whose value is empty (`parseArgs` 120–126). Duplicate lines or tokens return `ambiguous_identity` before close-mode selection. A single empty line with no flag is `partial_marker`. A wrong token is `mode_mismatch`. No line and no token still returns close, and `issue_action: comment_keep_open` with neither is still the #336/#1098 `merge-sink-only` refusal.

`main` throws that malformed result at 644–646, before the OFFLINE placeholder at 648 and before push, create, or archive publication.

The empty-line-then-`explicit_singleton` case, with no flag and no `issue_action`, is `explicit_keep_open_refused: ambiguous_identity`.

## P1-2 native closing associations

`PR_VIEW_JSON` (491) adds `closingIssuesReferences` to both `gh pr view` (548) and `gh pr list` (561). `normalizeClosingIssues` (498–512) maps an array of objects' `number` fields to numbers. Missing, null, or an unparseable element is `{ measured: false }`.

`assertExplicitOpenNativeSafe` (353–364) runs only on the explicit OPEN path (768), after head/base checks and after the MERGED and CLOSED-unmerged returns. A measured set that contains the retained issue refuses `native_closing_linkage`. An unmeasured field refuses `native_closing_unmeasured`. An empty array continues. The sink does not unlink or edit the pull request. Close mode still ignores the field.

## P1-3 enabled auto-merge on reuse

`normalizeAutoMerge` (516–521): `null` is disabled; a non-null object is enabled and keeps that object's fields; anything else is unmeasured. On the same OPEN path (365–372), a non-null request refuses `auto_merge_enabled` and does not disable or otherwise change the remote setting. A missing or unparseable value refuses `auto_merge_unmeasured` so the sink does not treat an unread request as disabled and does not describe queue behavior it did not measure. MERGED and CLOSED-unmerged lanes are unchanged. A clean OPEN reuse (`[]` and `null`) still prints `pr_auto_merge: suppressed_request_only` and does not call `gh pr merge`.

## Scanner association

`closingIssueNumbers` (155–174) replaces the old "keyword anywhere on the line, then every `#N`" scan. A keyword (`close`/`closes`/`closed`, `fix`/`fixes`/`fixed`, `resolve`/`resolves`/`resolved`) associates only the reference it immediately precedes, with optional whitespace or punctuation. `owner/repo#N` is matched and discarded. A bare `#N` without that keyword does not count. Commit scan, OPEN body/title reuse scan, and the generated-body self-check all call this helper.

## ADR

`docs/decisions/0031-explicit-github-keep-open-pr.md` line 3: Status is **Accepted** (was Proposed). Decision items 3 and 7–10 and the Consequences paragraphs at 95–103 record line-existence intent, native closing validation with fail-closed unmeasured, auto-merge-enabled reuse refusal without a policy change, the scanner rule, and the full-URL gap. This is not a merge and not a release.

Also updated, so the public contract matches the code: `docs/api.md` (explicit-singleton paragraph), `CHANGELOG.md` `[Unreleased]` Fixed, `README.md`, `docs/architecture.md`, `docs/workflow-state-contract.md`.

## Tests

`scripts/simulate-workflow-walkthrough.js` `testExplicitKeepOpenPrP1Repairs` (7956–8162), registered at 13185. No new framework.

- P1-1: empty line plus `keep_open_pr: explicit_singleton`, no flag, no action, `pr_auto_merge: true`, online and OFFLINE. Exit non-zero, `ambiguous_identity`, no create, no merge, no queue probe, local and remote tips unchanged, no `OFFLINE_PLACEHOLDER`.
- Positive create: commit message `Fix #999; related #143` plus `Fixes other/repo#143`, `pr_auto_merge: true`. Exit 0, `Keeps #143 open.` body, no `--fill`, no `Closes #143`, no merge, `suppressed_request_only`, `sink_pr: created`.
- `Fixes #143` and `closes #143` commit messages refuse `closing_linkage` before push.
- Clean OPEN reuse: synthetic `gh` returns title/body, `closingIssuesReferences: []`, `autoMergeRequest: null`. Exit 0, `sink_pr: reused`, no create, no merge.
- P1-2: `closingIssuesReferences` contains 143 → `native_closing_linkage`, no create/merge/archive push.
- P1-3: non-null `autoMergeRequest` → `auto_merge_enabled`, same no-effect checks.
- Unmeasured `closingIssuesReferences` → `native_closing_unmeasured`.
- Helper controls: `Fixes #143` and `closes #143` yield `[143]`; `Fixes other/repo#143` yields `[]`; `Fix #999; related #143` yields `[999]`.
- Marker-free state stays `kind: close`. `issue_action` alone stays `legacy_refuse` / `merge-sink-only`.

The existing `testSinkPr*` scenarios (close mode, reuse, merge queue, OFFLINE) were re-run and passed.

## Probe re-run

Original `.kaola/outer-review-1113` was not modified. Copies live under `kaola-workflow/issue-1113/.cache/keepopen-p1repair/probe-sandbox/`. The frozen bound source was copied there and `scripts/kaola-workflow-sink-pr.js` was replaced with the repaired file. The adapter's manifest hashes were updated only in that sandbox so `verifyBound` could load the overlay. The adapter and gh spy were read from the existing v3 controls directory and not written.

| script | process exit | sink outcome | effect |
|---|---|---|---|
| `probe.cjs` | 0 | `refused`, sink exit 1 | `ops: []`. stderr `explicit_keep_open_refused: ambiguous_identity`. No `pr.create`, `pr.merge`, `git.push`, `archive`, or `Closes` body. |
| `reuse-probe.cjs` `manual-linked-reuse` | 0 | `refused`, sink exit 1 | ops `pr.view` only. stderr `native_closing_linkage` for issue 143. No archive, no merge, no push. |
| `reuse-probe.cjs` `auto-enabled-reuse` | 0 | `refused`, sink exit 1 | ops `pr.view` only. stderr `auto_merge_enabled`. Remote setting not changed. No `suppressed_request_only` stdout. |

The copied `probe.cjs` still prints the reviewer's four helper lines. Observed, and not used as a URL verdict: `Closes #143` → `[143]`; `Fixes other/repo#143` → `[]`; `Fix #999; related #143` → `[999]`; the `https://github.com/.../issues/143` line → `[]`. The last line is the unverified full-URL gap recorded in the ADR. It is not a pass or a fail.

`stages.request.recordMainline: pending` on the two reuse rows is the adapter's pre-seeded durable record, not a sink write: those runs did not emit `request.record` or `archive`.

## Checks

| command | exit |
|---|---|
| `node scripts/simulate-workflow-walkthrough.js --only testExplicitKeepOpenPrP1Repairs` | 0 |
| `node scripts/simulate-workflow-walkthrough.js --only testSinkPr --only testExplicitKeepOpenPrP1Repairs` (21 scenarios, including close-mode reuse and the #1099 merge-queue lanes) | 0 |
| `node scripts/validate-workflow-contracts.js` | 0 |
| `node scripts/validate-script-sync.js` | 0 |
| `node scripts/edition-sync.js --write` then `--check` | 0 (write updated 1 file; check: 6 forge aggregator ports in parity) |
| `node scripts/generate-routing-surfaces.js --check` | 0 |

## Mirrors

`node scripts/edition-sync.js --write` copied `scripts/kaola-workflow-sink-pr.js` to `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` (the only file it rewrote). That copy is in `96c20b61`. No routing skeleton changed, so no routing surface was regenerated.

## Not done

- The full `npm test` producer chain was not run. The task leaves candidate-bound chain re-run to a later seat.
- The mission ledger was not written. The Host owns it.
- Nothing was finalized, merged, closed, or pushed.
- GitLab and Gitea request sinks were not changed. Close mode and the marker-free #336/#1098 refusal were not changed.
- The independent v3 harness was not copied or re-run as a suite. Only the two outer probe scripts were re-executed, against a sandbox overlay.
- Full-URL closing references are not implemented and not tested as a behavior. The ADR records that gap.
- `auto_merge_unmeasured` is the fail-closed reason when `autoMergeRequest` is absent or not `null` and not an object. The required non-null refusal remains `auto_merge_enabled`.
