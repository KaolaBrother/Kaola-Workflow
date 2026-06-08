# adversarial-verify gate — issue #292

Independent falsification of the central #292 claim. Burden INVERTED: the claim is
presumed false until disproof attempts are exhausted. Re-derived from primary
evidence (real subprocess runs + a decisive mutation test), NOT from the prior
build/code-review caches.

## Claim Under Test (verbatim)
"The changeset on branch workflow/issue-292 correctly, completely, and regression-free
closes issue #292 — it fixes R3 (the gitCheckout ref-vs-path bug) AND completes AC#3
(write-role fanout batch joins run in isolated worktrees and join into the parent
without attribution ambiguity), with a correct + logged serialized fallback, and a
test that genuinely proves it (no false-greens)."

Scoped surface: scripts/kaola-workflow-parallel-batch.js (+ 3 forge ports),
scripts/test-parallel-batch.js, commands/kaola-workflow-plan-run.md (+ forge copies + SKILL).

## Disproof Attempts (all FAILED to break the claim)

### A. Decisive mutation test — R3 reintroduced (THE headline experiment)
Copied the whole scripts/ tree to $TMPDIR (so sibling require()s resolve; sanity-
confirmed the mutant loads: `status` returns JSON, not a require stack trace).
Reintroduced EXACTLY the R3 defect: runJoin passes `m.worktreePath` (a filesystem
path) into the ref slot + shim `-C projectDir`. Kept seal/mergeRef capture intact.
Ran the copied test-parallel-batch.js (its __dirname BATCH_CLI picks up the mutant).

RESULT: 8 failures / 109 passed — DIAGNOSTIC RED for the right reason:
- E1a FAIL "PARENT contains wa.js==AAA", E1b FAIL "wb.js==BBB" (content did NOT land)
- E1 join FAIL, E1c FAIL
- worktreePath non-null, mergeRef captured, E2, E3 ALL still PASS (mutant not broken)
- Raw git error surfaced: `fatal: invalid reference: <…/.kw/batch/test-project/wa>`
  — the exact R3 signature (a worktree FS path in the git-checkout ref slot).
Conclusion: the test GENUINELY catches R3; it is NOT a false-green. A direct-call
test with an injected gitCheckout would have passed with the bug present — these do not.

### B. Test drives the REAL subprocess CLI (not injected seams)
test-parallel-batch.js:821 `runBatchCli` → `execFileSync('node',[BATCH_CLI,...],{cwd:repoRoot})`.
E1/E2/E3 call runBatchCli exclusively. main()'s `shell` seam is shellNode (real
`execFileSync('node',[commitNodePath,...])`), so E2's seal-member exercises the REAL
commit-node binary against the member plan copy. E1a/E1b assert real parent file
content (readFileOr(repoRoot/wa.js)), not state:'joined'. E2 asserts the barrier
error NAMES intruder.js. Confirmed by reading test bodies + the mutation corroboration.

### C. Four-edition parity (the unguarded attack — validate-script-sync only covers base↔claude)
Diffed added/removed lines of all 4 ports. base/claude/gitlab/gitea: 208 added +
24 removed lines EACH, ALL IDENTICAL (gitlab/gitea added lines byte-identical to
base — the #292 logic block carries zero edition token). base↔claude full file
BYTE-IDENTICAL. The 232-line block was mirrored into the forge ports with ZERO
logic drift. (npm test green across all 4 editions; exit 0.)

### D. Fail-closed join
runJoin:696 refuses missing_merge_ref on falsy mergeRef / missing seam; :701 refuses
join_failed on a non-ok checkout; :705 sets joined:true ONLY after a confirmed
checkout. The old `if (m.worktreePath && …)` false-green guard is gone; line 710 is
the NEW post-success cleanup guard (worktreeRemove), not the old one. joined:true is
unreachable without a real checkout.

### E. gc-between-seal-and-join survival (risk 4) — independent live experiment
Built a real $TMPDIR repo, open→write→seal, then ran `reflog expire --expire=now
--all` + `git gc --prune=now --aggressive` BETWEEN seal and join. The captured
mergeRef commit STILL resolved (cat-file -e ok); join → ok/joined; PARENT wa.js==AAA,
wb.js==BBB. update-ref anchoring genuinely defeats gc (stronger than the suite's E1).

### F. Seed-from-current-state attribution (risk 3)
runOpenBatch:402 `worktree add <seedCommit>` → :410 copy plan → :412 `--start`
baseline recorded AFTER seeding. Member barrier diff is vs the seed tree (parent's
current state), so prior nodes' uncommitted writes cancel; only the member's own
write is attributed. No over-attribution.

### G. Degraded mode = zero mutation; serialized fallback logged
Manifest written LAST (:456); degradedReturn (:370) returns
{result:'ok',degraded:true,reason:'worktree_unavailable',opened:[]} before any ledger/manifest write (manifest is written LAST, :456). E3 proves the
seedTree-null trigger via the real CLI (no manifest, ledger rows pending). NOTE: E3
degrades at the seedTree-null gate so the partial-worktree rollback LOOP is not
directly test-exercised; its worst case is a leftover under the gitignored .kw/batch/
(no tracked-state mutation, no false-green) — non-blocking. plan-run.md (+ gitlab/gitea copies + SKILL,
15 added lines each, edition-rename only) document `log()`s the degradation + fall
back to the single-node open-next serial path.

### H. Hygiene + no weakened assertions + deletion-edge honesty
`git check-ignore .kw/batch/x` → IGNORED. No .kw/batch leftover (tests use $TMPDIR).
test diff = 237 insertions / 0 deletions — no existing P1–P6/I1–I7/R assertion
weakened or removed. Deletion edge documented as a bounded additive/modify scope
(design §8.2; code-review F1 scope=out_of_scope action=document) — surfaces as
fail-closed join_failed, not silently broken.

### Baseline verification (real exit codes, captured directly)
- node scripts/test-parallel-batch.js → EXIT 0 (117 assertions)
- node scripts/simulate-workflow-walkthrough.js → EXIT 0
- npm test → exit 0 (all 4 editions; gitea reached final PASSED; 2 independent runs)

## Verdict
NOT-REFUTED (confidence: high). Every sub-claim was positively confirmed with concrete
evidence; the decisive mutation test produces diagnostic RED for the right reason
(content-not-landed + fatal: invalid reference) while leaving E2/E3 green, proving the
test is no false-green. No counterexample found across mutation, gc, parity, fail-closed,
attribution, degraded, and hygiene attacks.

verdict: pass
findings_blocking: 0
finding: id=F1 scope=out_of_scope action=document status=deferred severity=low deletion-of-a-declared-path surfaces-as-fail-closed-join_failed; additive/modify-boundary-design-8.2; follow-up-only-if-deletion-support-needed
finding: id=F2 scope=out_of_scope action=document status=deferred severity=low batch-seed/merge-refs-left-anchored-after-join by-design-bounded-by-node-count
