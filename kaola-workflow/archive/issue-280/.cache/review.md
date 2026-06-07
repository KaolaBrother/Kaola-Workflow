verdict: pass
findings_blocking: 0

# review node (G1 reviewer gate) — issue #280

## Scope reviewed
git diff main, 6-path write-set only:
- scripts/kaola-workflow-claim.js + plugins/kaola-workflow/scripts/kaola-workflow-claim.js (byte-mirror)
- scripts/kaola-workflow-sink-merge.js + plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js (byte-mirror)
- agents/workflow-planner.md
- scripts/simulate-workflow-walkthrough.js

## Verification performed
- node scripts/simulate-workflow-walkthrough.js -> exit 0; all 3 #280 tests PASSED.
- npm test -> exit 0; validate-script-sync "17 common + 7 byte-identical group in sync";
  Codex/GitLab/Gitea contract validators + vendored-agent validation all pass.
- diff of both mirror pairs: CLAIM_IDENTICAL, SINK_IDENTICAL.
- git diff main --name-only: exactly 6 files; no closure-contract.js / hook / .toml / gitlab / gitea / codex edits.

## AC validation
AC1 (fully-delegated => attested in BOTH receipts): MET. claimProject back-fills a
  {agent_type:'workflow-planner',agent_id:'claim-backfill'} line under --attest-planner-spawn;
  cmdFinalize (line 953-958) and sink-merge postMergeCleanup (line 302-309) both call the
  exported checkDispatchAttestations archive-first. Test asserts attested in fin + sink receipts.
AC2 (zero-spawn inline bypass stays not-attested): MET. Back-fill gated strictly on
  args.attestPlannerSpawn; only agents/workflow-planner.md passes the flag. cmdClaim/cmdStartup/
  cmdPickNext/cmdResume parse own argv and never inject it. Test runs startup WITHOUT flag,
  asserts no log written (!fs.existsSync at 8968) and fields != 'attested'.
AC3 (3 non-circular regression tests): MET. Behavioral tests drive the REAL claim/finalize/
  sink-merge binaries (runClaimOnlineLastJson spawns claimScript; not plantActiveFolder).
  Contract guard reads the real agents/workflow-planner.md via repoRoot=resolve(__dirname,'..')
  — proves production passes the flag, not just the test. All 3 registered in main() (8841-8843).

## Read/write root alignment (production, not just test harness) — verified
Back-fill WRITES to getRoot()-relative .cache at claim time. Planner runs startup at repo-root,
so the line lands in the repo-root project .cache. Both consumers read it in real adaptive flow:
- cmdFinalize: runs FROM the worktree (finalize SKILL line 130: cd $ACTIVE_WORKTREE_PATH && finalize).
  getRoot()=git rev-parse --show-toplevel => worktree root. The finalize SKILL re-mirrors
  main->worktree (cp -R kaola-workflow/{project}/. incl .cache, line 88-90) BEFORE that cd, so the
  worktree .cache carries the planner line. Read root == mirrored write location. Aligned.
- sink-merge: runs from mainRoot (repo-root) and reads archiveDest first; cmdFinalize's
  archiveProjectDir places the archive (incl .cache) at the MAIN repo (dual-location cleanup,
  finalize SKILL line 126). Archive-first read finds planner+contractor lines. Aligned.
This was the one place a repo-root-only test could mask a worktree mismatch; traced and clean.

## Focus-area findings
- AC2 integrity: back-fill is warn-first — checkClosureInvariants never reads the attestation
  fields (only pushes to receipt.warnings), so closure_invariants.ok stays true; back-fill is
  try/catch fail-open and cannot block the claim. No non-planner path forwards the flag.
- M2 path resolution: archiveDest (line 288), mainRoot, args.project, receipt (line 293) all in
  scope before the new call (line 306). cmdFinalize and sink-merge run SEQUENTIALLY in adaptive
  (finalize archives -> sink-merge re-checks the archive — exactly why M2 exists). No double-count:
  each call mutates its OWN separate receipt once.
- Test honesty: contractor line in AC1 is faithful — hook (hooks/kaola-workflow-subagent-dispatch-log.sh
  line 42) writes the same {ts,agent_type,agent_id,cwd} shape and genuinely logs agent_type generically;
  checkDispatchAttestations matches agent_type==='contractor' (line 83).
- Byte-mirror: both pairs identical (diff + validate-script-sync).
- Timestamp: back-fill new Date().toISOString().replace(/\.\d{3}Z$/,'Z') == hook's
  date -u +%Y-%m-%dT%H:%M:%SZ format. Detector ignores ts anyway (checks agent_type only).
- Idempotency: re-claim on occupied folder early-returns target_occupied (line 565) before back-fill;
  a post-discard reclaim would append a 2nd planner line — harmless (presence-only detector).
- Scope discipline: emptyReceipt/closure-contract.js untouched; hook untouched (correct — the hook
  structurally can't log the planner's pre-state-file spawn); codex/.toml/gitlab/gitea untouched
  (#266/#286 scope, correctly excluded).

## Findings
(none — zero action:fix, zero action:consider, zero action:note)

## Verdict
verdict: pass
No in-scope action:fix findings. No repair required before finalize.
