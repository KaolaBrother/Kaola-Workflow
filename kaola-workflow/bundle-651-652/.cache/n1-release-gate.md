evidence-binding: n1-release-gate 52926cd3cc6d
RED: 10 new #651 --release-check walkthrough cases authored FIRST (simulate-workflow-walkthrough.js, beside the #648 chains_stale diagnostics block); pre-implementation run failed at case #651 (1): `a green unwaived receipt at the candidate sha must pass with a typed envelope, got status 1 {"result":"refuse","reason":"plan_unreadable",...,"errors":["cannot read plan: --release-check"]}` — the validator had no --release-check entry point and misread the flag as a plan path, so every new case was unreachable/failing before the implementation.
GREEN: `node scripts/simulate-workflow-walkthrough.js` exits 0 with "Workflow walkthrough simulation passed" — all 10 #651 cases green (pass envelope; missing receipt; unparseable receipt; older-sha + culprit hints stale_paths=['newcode.js']/stale_kind='code'; headSha 'unknown' refuses; chains_waived naming codex; chains_red precedence over waived sibling; chains_empty; explicit --candidate pass at C + stale at advanced HEAD; dirty-stamp refuses) — re-verified green AFTER `npm run sync:editions`.

## What shipped (issue #651 AC1 + AC3 + AC4)

Check-only `--release-check` entry point in the canonical `scripts/kaola-workflow-plan-validator.js`:

- `releaseCheck(args)` added directly after `attachChainsStaleDiagnostics` (the helper it reuses); intercepted in `main()` BEFORE the plan read — the gate is PLAN-INDEPENDENT (at release time the run is archived; no workflow-plan.md exists). Invocation: `node scripts/kaola-workflow-plan-validator.js --release-check [--json] [--candidate SHA] [--receipt PATH]`.
- Receipt default: `<git-toplevel>/.cache/chain-receipt.json` — the same path run-chains' bare-cwd stamp writes and `kaola-workflow-release.js` reads. Root resolved via `git rev-parse --show-toplevel` from cwd.
- Typed precedence family (structural `reason`, never string-matched): `chains_unverified` (missing/unparseable receipt) > `chains_stale` (unbound 'unknown'/missing headSha; headSha != candidate; dirty-stamped `workTreeHash != 'clean'`) > `chains_empty` > `chains_red` (unwaived red, with timed_out hint ctx mirrored from finalize) > `chains_waived` (NEW reason + getOperatorHint entry — ANY `accepted_red === true` chain refuses; a waiver is legal at adaptive finalize, never for a release tag).
- STRICT headSha EQUALITY against the candidate (default HEAD; `--candidate <sha-ish>` normalized via `rev-parse --verify ^{commit}`; unresolvable candidate fails CLOSED into the stale arm). The #547 codeTreeHash content-address relaxation is deliberately NOT applied — a release tag names an exact commit.
- release.js leniency NOT copied: `chainReceiptGreenness` (kaola-workflow-release.js:254) treats `headSha === 'unknown'` as green; the new gate refuses it (walkthrough case #651 (5) is the negative control).
- Sha-mismatch refusal attaches the existing hint-only culprit diagnostics via `attachChainsStaleDiagnostics` (stale_paths/stale_kind, project=null — `isValidationInvisible` is null-project-safe and the kaola-workflow/ state tree folds in project-independently); degrades to the generic refusal on uncertainty exactly like finalize's `chains_stale` (unknown-headSha and dirty-stamp cases prove the degrade).
- Typed pass envelope: `{result:'pass', mode:'release-check', candidate:<full sha>, chains:[{name,exitCode,accepted_red:false}]}`.
- Usage block updated in the same file (new `--release-check` entry after `--finalize-check`).
- AC4 self-owned: reads only the receipt + local git; no CI/CD coupling, no forge calls, zero mutation (pure check → stdout + exit code).
- Live smoke in the leg worktree: `--release-check --json` with no receipt → typed `chains_unverified`, exit 1.

## Verified sequencing fact (RED-phase verification the n4-docs flow depends on)

run-chains CAN stamp a green receipt at the candidate sha BEFORE the tag exists:
- The tag-existence + tag-ancestry enforcement lives ONLY in `validate-workflow-contracts.js:631-655` and is fenced by `if (process.env.KAOLA_WORKFLOW_OFFLINE !== '1' && exists('.git'))` — skipped entirely under `KAOLA_WORKFLOW_OFFLINE=1`.
- `kaola-workflow-run-chains.js` propagates that env to the chains: the serial path (`runChainSync`, ~line 194) passes NO `env` option to spawnSync (child inherits process.env) and the concurrent path (~line 279) passes `env: { ...process.env }`.
- Therefore the documented flow is sound: bump commit → `KAOLA_WORKFLOW_OFFLINE=1` run-chains stamps a green receipt at the bump commit (headSha = candidate, no tag needed) → `--release-check` passes → tag → online npm test → push.

## Decisions / derivations

- Dirty-stamp refusal (`workTreeHash !== 'clean'` → chains_stale) added beyond the brief's literal (a)-(d) arms: axiom 1 tie-break (tighten-only) — a receipt stamped over a dirty worktree proves the chains validated headSha PLUS uncommitted edits, NOT the tree the tag would name, so passing it would defeat the strict-sha pin's purpose. run-chains always writes the field ('clean' or a diff sha256), so a modern receipt is never falsely refused; a legacy/missing field fails closed. Walkthrough case #651 (10) locks it.
- Unbound headSha ('unknown'/missing) refuses under reason `chains_stale` (not a new reason): same remedy ("regenerate the receipt at the candidate"), keeps the reason family closed per the brief, and the brief reserves the one NEW reason for the waiver arm (`chains_waived`).
- chains_red > chains_waived precedence: an unwaived red is the harder fact; locked by walkthrough case #651 (7) (red + waived siblings → chains_red).
- Test fixtures gitignore root `/.cache/` (mirrors the real repo's .gitignore, whose comment names ad-hoc run-chains receipts) so the untracked receipt never pollutes the exact stale_paths assertion.
- Scope guard honored: `kaola-workflow-release.js` NOT modified (its --cut deliberately does not hard-gate on the receipt — existing decision record stands); this node ships the check-only gate.

## Validation record

- RED: walkthrough FAILED at #651 (1) with reason plan_unreadable pre-implementation (observed output above).
- GREEN: `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0), run twice: after implementation and again after `npm run sync:editions`.
- `npm run sync:editions` → "write complete (3 file(s) updated)": generated `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`, codex-sync `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js` — no hand edits to any plugin copy.
- `git status --short` shows EXACTLY the 5 declared write-set files modified, nothing else.

## Files touched (all under the leg root, repo-relative)

- scripts/kaola-workflow-plan-validator.js (canonical: releaseCheck() + chains_waived hint + main() intercept + usage block)
- scripts/simulate-workflow-walkthrough.js (10 new #651 cases beside the #648 finalize-check/chains_stale blocks)
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js (generated, sync:editions)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js (generated, sync:editions)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js (generated, sync:editions)
