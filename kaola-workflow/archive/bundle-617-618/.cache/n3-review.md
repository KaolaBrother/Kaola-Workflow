# Review: n3-review (bundle-617-618) — post-dominating gate over n1-fix-617 + n2-fix-618

Scope reviewed: full accumulated diff 866421aa..HEAD for scripts/, plugins/, package.json (22 files, +1608/-301).

## 1. Fail-closed direction — VERIFIED for both fixes

#617 (closed-before-merge): four independent layers, all traced to genuine fail-closed conditionals, none cosmetic:
- cmdFinalize deferral (kaola-workflow-claim.js:2134-2138): mergeLaneDeferred = --keep-worktree OR durable sink: != 'pr'; an unreadable/absent state file lands in catch(_){mergeLaneDeferred=true} — fails TOWARD deferral, never toward premature close.
- Closure-step hard gate (kaola-workflow-sink-merge.js:1282-1320): re-resolves branch live tip; missing ref -> implRef=null -> published=false -> typed remote_closed_after_publish_unverified refusal, exit 1, closure NOT marked done (resume retries).
- checkClosureInvariants wiring (claim.js:2065-2082): remote-closed-after-publish invariant now evaluates git merge-base --is-ancestor when opts supplied; no-opts caller is byte-equivalent no-op.
- verify-sink (claim.js:3005-3074): pure read, exits non-zero on any failing leg; proven clean-sink pass and orphaned-close detection.

#618 (chain-receipt greenness):
- Sync path (kaola-workflow-run-chains.js:202-208): r.status==null && (r.signal||r.error) -> exitCode 1. Proven by T26.
- Async path (:296-307): exitCode:(timedOut||code==null)?1:code. Proven by T27.
- Consumer gate (kaola-workflow-plan-validator.js:2812-2819): fresh HEAD-bound chains:[] now refuses chains_empty. Proven by T29.
- package.json claude chain now includes scripts/test-run-chains.js, ran green in-chain.

## 2. Cross-edition parity — VERIFIED
Root/plugins/kaola-workflow copies byte-identical. gitlab/gitea hand-ports carry all elements with forge nouns preserved; sink-value comparison correctly forge-adjusted (!== 'pr' vs !== 'mr'). chains_empty present in all four plan-validator copies; #618 hunks present in all four run-chains copies; edition-sync.js --check green.

## 3. SINK_STEPS reorder — no worse crash window; resume intact
Old worst case: crash after closure, before push_main -> issue closed, merge unpublished (unrecoverable deception). New worst case: crash after push_main, before closure -> merge published, issue open, receipt closure:pending -> re-run retries only closure by name. Strictly better. Branch teardown is post-loop so closure gate's rev-parse is always resolvable.

## 4. #608 regression — NONE
Timer path unchanged; T21/T24/T25 pass; new T28 contrasts timer-kill vs external SIGKILL in one receipt.

## 5. Validation — all four chains green, run sequentially
test:kaola-workflow:claude / :codex / :gitlab / :gitea — all exit 0, full walkthroughs + active-folders-field-parity (61 assertions) passed in each.

## Findings

[MEDIUM] R1 — verify-sink false-alarms on a clean sink whose branch was rebased mid-flight (non-blocking follow-up)
File: scripts/kaola-workflow-claim.js:3036-3049 (cmdVerifySink, and the three edition ports)
cmdVerifySink prefers receipt.branch_head, stamped only at receipt init and never re-stamped after the merge step's doRebase rewrites the branch. Reproduced: an online sink with main advanced (forcing rebase) completes correctly (remote_closed_after_publish:"verified"), yet a subsequent verify-sink exits 1 with impl_commit_not_ancestor. Fail-closed direction (false alarm never false pass), net-new standalone advisory wired into no gate, orphaned-close detection still works -- non-blocking. Fix suggestion: stamp a post-publish ref (e.g. published_head) at the closure gate (do not mutate branch_head, load-bearing for #518 cycle-identity guard) and have cmdVerifySink prefer it.

finding: id=R1 scope=in_scope action=follow_up status=deferred severity=medium fix_role=none rationale=verify-sink prefers rebase-stale receipt.branch_head, false-alarms impl_commit_not_ancestor on clean rebased sinks; fail-closed advisory-only, repro'd in sandbox

## Review Summary
CRITICAL 0, HIGH 0, MEDIUM 1 (info/non-blocking follow-up), LOW 0

Verdict: APPROVE — both fixes are genuinely fail-closed, parity holds across all four editions, reorder strictly shrinks crash damage, all four chains green.

evidence-binding: n3-review b7e07e69f5c9
verdict: pass
findings_blocking: 0
