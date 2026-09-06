# Independent code-review of final integrated `b39af460`

Role: code-reviewer (independent). No edits. Did not run `npm test`, `:claude:full`, or walkthrough.
Did not reuse prior PASS files (`code-review-comment-5561551896.md`, `code-review-handoff-1051.md`, `code-review-comment-5561808292.md`, `code-review-re-review.md`).

## Identities (dispatch-supplied)

- Candidate: `b39af460a0ac1abf094795ef49bf29b9c18badac` on `workflow/issue-1052`
- Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
- Confirmed `git rev-parse HEAD` = `b39af460a0ac1abf094795ef49bf29b9c18badac`
- Merge-base with origin/main: `101b84b070e192527407a8c57ba80569d3f10d71` (#1051 included)
- Binding later-wins: issue comments 5560806842, 5561181849, 5561551896, 5561808292
- Keep-both-intents: #1051 shorter global contract + #1052 CLI ancestor identity

## What was re-driven this review

1. Generated Cursor Next for github / gitlab / gitea via `scripts/sync-cursor-edition.js --write --forge=<edition> --tree-root` into `/tmp/kw-1052-gen-QhuD`. First unstamped fence is `node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"` with named claim.js per edition. Resume is `kaola_script` / `CLAIM_JS=` outside any `if`, then `node "$CLAIM_JS" resume --runtime cursor`. No `--product cli --host local`, no `cursorCliHostGateOpen`, no invented `CURSOR_PRODUCT` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE`.
2. For each edition, isolated `install-cursor.sh --global --yes --forge=<edition>` then that generated first fence as grandchild of living `…/2026.09.02-c22c1a3/index.js --workspace <opened> --model cursor-grok-4.6-xhigh` (spawn, not exec-replace). Matching-authority path preps (`cursor_prep` materialized/current) before the single claim; not `cursor_prep_failed` / `stale_forge`. Isolated install itself receipts the named claim.js (`kaola-workflow-claim.js` / `kaola-gitlab-workflow-claim.js` / `kaola-gitea-workflow-claim.js`) and helper; this review did not plant a GitHub helper into GitLab/Gitea trees.
3. Unrelated-tool `--workspace` non-writing. `--worker-dir` without `--workspace` non-writing. `--worker-dir` with `--workspace` non-writing (does not take the workspace branch first as CLI). Darwin spaced opened dir: host `ps -ww -p PID -o args=` is unquoted and naive tokenize truncates; production `collectUnquotedFlagRemainder` reconstitutes the full path and preps that dir.
4. Cold resume with `CLAIM_JS` unset still resolves named claim.js `resume`. No `cursorCliHostGateOpen` in claim trees or generated Next. README still required and states `--ensure-target` CLI/local prep. R1 `--product cli --host local` accepted (not `unknown_flag`) on all four named claim trees. GitHub `scripts/kaola-workflow-claim.js` against isolated gitlab/gitea authority still fail-closes `stale_forge`.
5. #1051 compact recovery / `docs/api.md` still carry “supplement verified local facts”. Live global no longer says “add only verified local facts and stricter constraints”. Candidate diff vs merge-base does not rewrite `templates/global/kaola-workflow-global.md` or compact recovery.

Focused suite on this SHA (not a reused receipt): `node scripts/test-issue-1052-cursor-cli-startup-prep.js` passed 251 assertions. `node scripts/test-cursor-edition.js --cli-materialization-oracle` GREEN. Independent `/tmp/kw-1052-independent-drive.js` PASSED for all three editions.

## Production trace (candidate-caused surface)

- `applyDemonstratedCursorCliHost` stamps only when `--runtime cursor` and both `--product`/`--host` omitted, and only when a living ancestor is CLI-shaped (`YYYY.MM.DD-<hash>/index.js` or `cursor-agent`) **and** `--workspace` that shares git identity with cwd. `--worker-dir` returns `kind: app` first. Generic `--workspace` without CLI executable stays unknown.
- Four claim trees share identical ancestor-resolver functions; `ensureCursorCliLocalPrep` differs only by install-authority `const forge = 'github'|'gitlab'|'gitea'`. No env reads of invented gate names. `status` / `list-open` do not call ensure. Prep runs in `cmdStartup` before claim mutation and on `cmdResume` without re-claim.
- Generated Next is a shared file: App/Cloud execute the same unstamped fence and do not obtain CLI prep without demonstrated CLI identity.

## Findings

None admitted. Confidence that the listed binding behaviors hold on these bytes is from this SHA’s generation, isolated installs, living-parent grandchild fences, and the focused 1052 suite, not from earlier PASS files.

verdict: pass
findings_blocking: 0
review_conclusion: Independent re-drive of b39af460 found no candidate-caused defect on the binding #1052 call chain or the kept #1051 supplement wording.
