evidence-binding: n_review 2b5922824354

verdict: pass
findings_blocking: 0

# G1 Code Review — bundle-429-434 (#429 resumable --sink, #434 repair primitives)

Reviewed the committed diffs (1da833a #429, 8c76a22 #434) plus the uncommitted
doc/pin working tree against origin/main. All four edition chains were run
sequentially and are GREEN (cross-edition diff per #307).

## Verification performed (success sentinels confirmed, not tail-masked)

- node scripts/test-adaptive-node.js           → 641 assertions passed
- node scripts/simulate-workflow-walkthrough.js → passed; incl.
    testSinkTransactionCrashResume: PASSED + testSinkTransactionCleanEndToEnd: PASSED
- node scripts/validate-workflow-contracts.js  → passed (new pins green)
- node scripts/edition-sync.js --check         → 12 forge ports in parity (EXIT 0)
- node scripts/validate-script-sync.js         → in sync (EXIT 0)
- npm run test:kaola-workflow:claude  → CLAUDE_EXIT=0  "Workflow walkthrough simulation passed"
- npm run test:kaola-workflow:codex   → CODEX_EXIT=0   "Kaola-Workflow walkthrough simulation passed"
- npm run test:kaola-workflow:gitlab  → GITLAB_EXIT=0  "GitLab Codex workflow walkthrough simulation passed"
- npm run test:kaola-workflow:gitea   → GITEA_EXIT=0   "Gitea Codex workflow walkthrough simulation passed"

## Scope checklist results

1. --sink preflight (n2 #429): PASS. sinkPreflight() classifies the dirty tree into
   3 buckets and, if foreignDirt.length > 0, returns {ok:false, reason:'sink_blocked',
   foreign_dirt} with ZERO mutation BEFORE any stash/unlink runs (the foreign-dirt scan
   completes first; mutation only happens after the early refuse return).
   runSinkTransaction emits {result:'refuse', reason:'sink_blocked', foreign_dirt} and
   exits 1 without advancing the receipt. Auto-stash for kaola-workflow/.roadmap/issue-N.md
   is gated on issueSet membership (only THIS sink's issue numbers). Registered linked
   worktrees are excluded from foreign-dirt via worktree list --porcelain. Correct.

2. sink-receipt.json crash-resume (n2 #429): PASS. Each step is gated by
   `if (receipt.steps[step] === 'done') continue;` at loop top. Receipt is written
   atomically (temp + rename) AFTER the side effect. No double-apply risk:
   push_upstream/push_main swallow already-pushed errors (no-op); merge is up-to-date
   gated; closure uses probeIssueClosed() before every close (incl. bundle members);
   stash_restore re-checks stash-still-exists before pop; archive_commit uses
   `diff --cached --quiet` to skip an empty commit. All steps re-entrant. The dedicated
   testSinkTransactionCrashResume walkthrough exercises this and passes.

3. revert-overflow (n3 #434): PASS. Reads outOfAllow from the per-node
   commit-node --barrier-check --json result. Runs `git checkout <baseSha> -- <outOfAllow>`
   with cwd=barrierRoot (getRoot() = git toplevel of the run cwd = the worktree, the same
   root commit-node computes outOfAllow against — paths are consistent). gitCheckout seam
   (opts.gitCheckout) is injectable for tests and falls back to real execFileSync. Refuses
   barrier_base_missing / barrier_base_empty / git_checkout_failed without mutation.
   Re-runs barrier-check and reports barrierClearedAfterRevert. Correct.

4. repair-node anti-laundering invariant (n3 #434): PASS — verified the critical claim.
   runRepairNode KEEPS barrier-base-{nodeId}: deletes ONLY downstream-gate baselines via
   the `for (const gid of gatesReset)` loop (gid is never nodeId — descendantsOf() deletes
   `start` from the visited set), and NEVER shells commit-node (no --start/--record-base).
   Returns baselineReused:true. Test fixture (b) asserts barrier-base-impl is NOT removed
   and commit-node is NOT shelled — both green. The writer is reset complete→pending→
   in_progress; the post-dominating gate(s) fold to pending; fail-closed orphan guard
   mirrors reopen-node. Matches reopen-node's live-coordination refusals (active_batch_exists
   / scheduler_active) inline — consistent with the sibling convention (reopen-node also
   inlines these rather than calling mutationGuardPrologue, so this is faithful, not a
   missing-guard regression).

5. requires_redispatch (n3 #434): PASS, additive. runOrient computes it only for an
   in_progress node and spreads `...(requires_redispatch ? {requires_redispatch:true} : {})`
   so the absent/incomplete-evidence case is surfaced WITHOUT altering the existing orient
   shape when evidence is present. Distinguishes absent-evidence (this flag) from the
   complete-evidence-but-no-commit crash (handled by the existing resume path). Fixture (c)
   covers both the absent and present cases — green.

6. Edition faithfulness: PASS. scripts/kaola-workflow-sink-merge.js and
   scripts/kaola-workflow-adaptive-node.js are byte-identical to their
   plugins/kaola-workflow/scripts/ peers (diff -q IDENTICAL). Forge ports carry the new
   tokens (sink_blocked / isSinkMode / sink-receipt.json; 19 repair-primitive hits each).
   No wrong-forge leak in scripts: gitea sink-merge has 0 glab/gh; gitlab sink-merge's 3
   `glab` refs are forge-correct (operator WARNING fallback strings + a comment), the close
   path itself uses forge.closeIssue/forge.updateIssue. edition-sync.js --check passes
   (12 ports in parity).

7. Contract pins (n_pins): PASS. All 6 new assertIncludes tokens verified present in their
   targets: "subcommand === 'revert-overflow'"(1), "subcommand === 'repair-node'"(1),
   requires_redispatch(5), baselineReused(5), isSinkMode(2), 'sink-receipt.json'(6),
   'sink_blocked'(5). Both validator copies (root + plugins/kaola-workflow) are byte-identical.

8. Contractor tomls (n7): forge-neutral confirmed. agents/contractor.md is canonical; the
   3 tomls carry no gh/glab/tea binary names and no forge brand. New subsections are DISTINCT
   from the #435 gap-sweep region. (See non-blocking finding F1 below.)

## Non-blocking findings

[LOW / coherence] F1 — n7 contractor prose documents an unimplemented field.
  File: agents/contractor.md:165-172 (and the 3 mirror tomls:
  plugins/kaola-workflow/agents/contractor.toml:30,
  plugins/kaola-workflow-gitlab/agents/contractor.toml,
  plugins/kaola-workflow-gitea/agents/contractor.toml).
  The new "inline_execution_suspected verifier note" instructs the contractor/verifier to
  check whether the adaptive-node `close-and-open-next` response carries
  `inline_execution_suspected: true`. That field is implemented in NO script —
  `grep -rn inline_execution_suspected scripts/ plugins/*/scripts/` returns zero hits, and
  runCloseAndOpenNext never emits it. The n3 plan fixture (c) AC ("inline completion without
  attestation flags inline_execution_suspected") was NOT delivered; n3 shipped only the
  `requires_redispatch` half. The n5 plan-run prose dropped its `--attest-inline` reference,
  but n7 still references the absent field.
  Failure mode: a verifier following this instruction checks a field that is never present,
  so the note silently never fires — a dead/no-op instruction, not a runtime fault.
  NON-BLOCKING because: no contract pin asserts the field (all 4 chains stay green); it
  cannot cause a bug, data loss, or security issue; worst case is an inert verifier hint.
  Recommended follow-up (not required for this gate): either implement the
  `inline_execution_suspected` flag on close-and-open-next (completing #434 fixture (c)), or
  soften the contractor prose to mark it as a forward-looking/aspirational signal until the
  emit side lands. Filing a follow-up issue is the appropriate disposition.

## Verdict rationale

No CRITICAL or HIGH issues. The git-surgery primitives are correctly scoped, the
anti-laundering baseline-reuse invariant holds, the sink transaction is genuinely
idempotent on resume, and all four editions are in byte/rename parity with the four
test chains green. The single finding (F1) is a non-blocking prose-vs-code coherence
gap with no runtime consequence and no chain impact. APPROVE.

finding: id=F1 scope=in_scope action=follow_up status=open severity=low fix_role=none rationale=contractor-prose-references-unimplemented-inline_execution_suspected-field-inert-no-runtime-impact-no-contract-pin
