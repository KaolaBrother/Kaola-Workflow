evidence-binding: n5-review 577040f8d725
verdict: pass
findings_blocking: 0
findings_total: 0

## n5-review — code review of #411 / #412 / #413

Scope: 21 files (canonical scripts + 3 plugin trees + tests + 6 prose surfaces + 6 TOMLs).
Read-only review. No code files modified.

### Verdict: APPROVE — zero blocking findings.

All eight review-focus points verified against the source, plus full test-chain
re-run (claude/codex/gitlab/gitea all exit 0; adaptive-node 492 assertions;
walkthrough green; route-reachability 32 assertions; manifest single-source PASSED).

finding: id=V1 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=nonce-derivation-correct
finding: id=V2 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=running-set-removal-faithful-mirror
finding: id=V3 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=excl-batch-guard-in-prologue-vacuous-pass
finding: id=V4 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=manifest-ordering-and-test-anchor-correct
finding: id=V5 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=contractor-md-both-helpers-identical
finding: id=V6 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=toml-whole-file-byte-identity
finding: id=V7 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=six-prose-surfaces-complete
finding: id=V8 scope=in_scope action=none status=resolved severity=info fix_role=none rationale=no-forge-vocab-in-toml

### Detail (informational)

1. n1 nonce derivation (scripts/kaola-workflow-adaptive-node.js:1439-1440):
   reads `baselineResult.recordBase && baselineResult.recordBase.base` then
   `.slice(0,12)`, byte-identical to runOpenNext (1098-1099) and runOpenReady
   (2233-2234). NOT the top-level `baselineResult.base`. Correct.

2. n1 running-set removal (1304-1312): byte-for-byte mirror of runCloseNode
   step (e) (2370-2378): readRunningSet → filter(n.id !== nodeId) → if empty
   unlink (or write empty {state:'open',nodes:[]}) else write filtered. Placed
   AFTER the ledger close write (1291) and BEFORE selector (1315) / fused advance
   (1363), so every ok exit reflects it and every refuse path (1210-1258) is a
   pure no-op leaving the set intact — matches runCloseNode exactly.

3. n1 excl-batch guard (1169): `mutationGuardPrologue(opts,{halt:true,excl:['batch']})`
   is the FIRST statement (before all mutation). coordinationRefusal only fires
   `batch_active` when coord.batchLive||coord.batchOpening; with no active-batch
   manifest both are falsy → returns null (vacuously-pass). Serial-fallback
   byte-identity preserved (docstring 2070).

4. n2 manifest: SUPPORT_SCRIPTS is a logical/dependency order, NOT alphabetical;
   new entry appended at the end is consistent with the existing convention. The
   #407 plant test re-anchored from task-mirror (no longer last) to ledger-compare
   (now last) so the planted script still lands inside the array. ledger-compare.js
   exists in all four script trees (byte-identical, no forge rename). Manifest test
   passes for all forges.

5. n2 contractor.md: both kaola_script helper copies updated; function bodies
   byte-identical (differ only in leading indentation due to nesting context).
   Both now probe $HOME/.claude/kaola-workflow-gitlab/scripts and
   $HOME/.claude/kaola-workflow-gitea/scripts in correct order (after the canonical
   home probe, before ./scripts).

6. n3 byte-identity: all three workflow-planner.toml share one whole-file md5
   (b111d783...); all three contractor.toml share one whole-file md5 (2cc8b0bc...).

7. n4: all 6 prose surfaces updated; 3 commands share one added-line md5, 3 SKILL
   share another (format differs by surface, intent identical). Both add the fused
   close-and-open-next as a third nonce source and document the opened payload
   `nonce`. route-reachability test passes.

8. No forge vocabulary in TOML: forge forbidden-only validators pass on the changed
   gitlab/gitea files. The workflow-planner.toml mentions of gitlab/gitea are plugin
   DIRECTORY PATHS in forge-neutral guidance, identical across all editions (hence
   byte-identity), not forge-brand/CLI instructions. No `gh`/`glab`/`tea` leaks.

### Cross-edition discipline
All four adaptive-node port diffs (incl. comments) share one md5 (0fe79382...).
Forge-named ports (kaola-gitlab/gitea-workflow-adaptive-node.js) carry the full,
non-half-mirrored change. No missed surfaces.

### Test evidence
- node scripts/test-adaptive-node.js → 492 assertions PASSED
- node scripts/simulate-workflow-walkthrough.js → passed
- node scripts/test-route-reachability.js → 32 assertions
- node scripts/test-install-manifest-single-source.js → #407/#412 PASSED
- npm run test:kaola-workflow:{claude,codex,gitlab,gitea} → all exit 0
