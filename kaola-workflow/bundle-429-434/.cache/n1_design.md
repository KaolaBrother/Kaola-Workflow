evidence-binding: n1_design 0fa58782000d

# Design Pass — bundle-429-434 (#429 Script-owned worktree sink, #434 Sanctioned repair primitives)

READ-ONLY design. No production files written. This file is the primary spec for n2_impl_sink and n3_impl_repair.

Source files read (all paths absolute under the worktree root /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-429-434):
- scripts/kaola-workflow-sink-merge.js (canonical, 734 lines — full main() pipeline)
- scripts/kaola-workflow-adaptive-node.js (canonical, 3645 lines — runReopenNode @1993, runCloseAndOpenNext @1485, runOrient @853, runWriteHalt @1815, mutationGuardPrologue @2450, CLI @3392)
- scripts/kaola-workflow-commit-node.js (barrier choreography: --start record-base, per-node barrier-check)
- scripts/kaola-workflow-plan-validator.js (barrierCheck @658 returns {result,reason,errors,sensitiveHits,outOfAllow,foreignArchiveHits,unattributed}; --barrier-check CLI @1837; --record-base/--drop-base/cacheBaseFile/barrierRef)
- scripts/kaola-workflow-claim.js (cmdWorktreeFinalize @2537, cmdFinalize @1807, checkDispatchAttestations @58)
- scripts/validate-script-sync.js (COMMON_SCRIPTS @42, RENAME_NORMALIZED_FAMILIES @221)
- scripts/validate-workflow-contracts.js (pins @256-680)
- scripts/edition-sync.js (GENERATED_AGGREGATORS @46, forgeRel @61)
- scripts/test-adaptive-node.js (runReopenNode fixtures @2122-2377; injected-stub pattern)
- scripts/simulate-workflow-walkthrough.js (sink-merge scenarios @4839, @5499, @5701-5840)

KEY STRUCTURAL FACT discovered: `runReopenNode` (#308) ALREADY EXISTS in adaptive-node.js as the `reopen-node` subcommand. It RE-RECORDS a FRESH baseline (`commit-node --start` @2186). #434's `repair-node` is a SEPARATE, NEW primitive that KEEPS the original baseline (no re-snapshot) — the exact opposite. Do NOT modify or alias `reopen-node`; add `repair-node` alongside it.

---

## #429 Sink Design

### Q1. New subcommand(s) + sink-receipt.json fields

**Subcommand:** add a single resumable transaction to `scripts/kaola-workflow-sink-merge.js`. The plan declares the write set as the four `kaola-workflow-sink-merge.js` editions, so the new code lands in THAT script (NOT claim.js — claim.js is not in n2's write set). The issue's "(or promote kaola-workflow-sink-merge.js to this role)" alternative is the chosen one.

Concretely: introduce a NEW arg path `--sink` (a top-level mode flag) into sink-merge.js `main()`. When `--sink` is present, run the full resumable transaction (`runSinkTransaction`). When absent, the existing 9-step merge pipeline runs byte-identically (the existing walkthrough scenarios at @4839/@5499/@5701 MUST stay green — they invoke sink-merge WITHOUT `--sink`). This preserves the legacy entry point that watch-pr / sink-fallback and the existing tests rely on.

Rationale for a flag rather than a new file: sink-merge.js is the COMMON_SCRIPT already carrying the merge pipeline, the FF-loop, postMergeCleanup (closure receipt, #427 probe-before-close, #369 bundle closure). The resumable transaction COMPOSES those existing functions; a separate script would duplicate them. The `--sink` flag gates the new preflight + receipt + worktree-sync wrapper around the existing merge/cleanup core.

**`.cache/sink-receipt.json` step-receipt** — written under the LIVE project `.cache/` (path: `kaola-workflow/<project>/.cache/sink-receipt.json`) resolved from `mainRootFromCoord(getCoordRoot())`, falling back to the archive `.cache/` once archived (mirror the #394 sink-fallback.json dual-home logic at sink-merge.js:379-391). Shape:

```json
{
  "project": "bundle-429-434",
  "branch": "workflow/bundle-429-434",
  "issue_number": 429,
  "issue_numbers": [429, 434],
  "resolved_default_branch": "main",
  "started_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "stash_ref": "stash@{0} | null",          // named stash created in preflight (step 1), null if none
  "removed_duplicates": ["kaola-workflow/<proj>/workflow-plan.md", ...],  // step 1 byte-superset-verified untracked removals
  "steps": {
    "preflight":      "done | pending",
    "push_upstream":  "done | pending",
    "merge":          "done | pending",
    "worktree_sync":  "done | pending",
    "finalize":       "done | pending",
    "closure":        "done | pending",
    "stash_restore":  "done | pending",
    "archive_commit": "done | pending",
    "push_main":      "done | pending"
  }
}
```

Each step name MUST be a literal const (one array `SINK_STEPS = ['preflight','push_upstream','merge','worktree_sync','finalize','closure','stash_restore','archive_commit','push_main']`) so the receipt is iterable and the resume loop walks it deterministically. A step transitions `pending`→`done` only AFTER its side effect completes; the receipt is re-written (atomic) after each transition.

### Q2. Exact `sink_blocked` preflight logic

The preflight runs in `mainRoot` (the MAIN checkout, where the merge happens), classifying the dirty tree into three buckets via `git -C <mainRoot> status --porcelain` (FULL — including untracked, because the manual traps were all untracked/staged residue). For each porcelain entry path:

1. **Claim-time roadmap source** — path matches `^kaola-workflow/\.roadmap/issue-\d+\.md$` AND the issue number is a member of THIS sink's `issue_numbers`. Remediation: AUTO-STASH with a named stash `git -C <mainRoot> stash push -m "kw-sink-<project>" -- <path...>`. Record `stash_ref` in the receipt. Restored in step 7 (stash_restore). This is the #297-recurred trap (the claim stages `A .roadmap/issue-N.md` in main).

2. **Untracked project-state duplicate** — path is one of `kaola-workflow/<project>/{workflow-plan.md,workflow-state.md,workflow-tasks.json,.cache/dispatch-log.jsonl}` (mirror-project residue, #335) AND it is UNTRACKED (`??` status). Remediation: VERIFY-BYTE-SUPERSET-THEN-REMOVE. Before `rm`, confirm the branch tip carries the same-or-superset content: `git -C <mainRoot> cat-file -e <branch>:<path>` succeeds (the branch has the committed version) → the untracked main copy is safe to delete (`fs.unlinkSync`). If the branch does NOT carry it, the untracked file is NOT a duplicate → treat as FOREIGN DIRT (bucket 3). Record each removed path in `removed_duplicates`.

3. **FOREIGN DIRT** — ANY other dirty path: a tracked modification, a staged file outside `kaola-workflow/<project>/`, an untracked file that is not a verified project-state duplicate, OR a `kaola-workflow/<other-project>/**` path (a CONCURRENT session's WIP — the #328 "surface-don't-overwrite" / #254 "another project's staged roadmap orphan" lesson). Remediation: NONE. REFUSE `sink_blocked`, list the EXACT paths, mutate NOTHING (do not stash, do not rm — a foreign-dirt refusal must leave even buckets 1+2 untouched so the operator sees the true tree). Emit:
```json
{ "result": "refuse", "reason": "sink_blocked",
  "foreign_dirt": ["<exact path>", ...],
  "detail": "main checkout carries changes not owned by this sink; resolve (commit/stash/restore) before re-running. This sink never touches another project's files." }
```
Exit 1. This is the load-bearing safety property: `sink_blocked` NEVER mutates.

ORDERING: scan ALL porcelain entries FIRST and classify every path. If ANY path lands in bucket 3, refuse `sink_blocked` immediately (zero mutation). Only when bucket 3 is EMPTY do the bucket-1 stash and bucket-2 removals execute. This guarantees "blocked preflight refuses, nothing mutated" (AC#3).

### Q3. Crash-resume via sink-receipt.json; idempotent steps

On invocation with `--sink`, if `sink-receipt.json` already exists, LOAD it and SKIP every step whose status is `done`. The transaction walks `SINK_STEPS` in order; for each step: if `done`, continue; else run it, flip to `done`, re-write the receipt atomically.

Idempotency requirements PER STEP (so a re-run after a crash mid-step is safe):
- **preflight**: re-classifies; bucket-1 stash is skipped if `stash_ref` already recorded; bucket-2 removals skip already-absent files. Foreign-dirt re-refuses (correct — operator must resolve).
- **push_upstream**: `git push -u origin <branch>` — re-push of an up-to-date branch is a clean no-op (already self-healed at assertBranchPushedToUpstream:204).
- **merge**: reuse the existing `doRebase` + `ffMergeLoop` (already idempotent on a re-run: `merge-base --is-ancestor` makes a second merge a no-op / alreadyUpToDate). After a crash post-merge-pre-receipt-flip, the re-run's merge sees the branch already an ancestor → no-op, flip to done.
- **worktree_sync**: `cp -R` worktree→main project folder is naturally idempotent (overwrite-with-identical). Guard: skip if the live folder already mirrors the branch.
- **finalize**: invoke cmdFinalize internals (archive-before-delete). cmdFinalize is ALREADY crash-resumable (#296 — `already_finalized` early-return when the archive exists, claim.js:1352). A re-run sees the archive and no-ops.
- **closure**: per #427 — `probeIssueClosed` BEFORE `gh issue close` (sink-merge.js:442) makes close idempotent; an already-closed issue is `already_closed`, not failed.
- **stash_restore**: `git stash pop <stash_ref>` only if `stash_ref` set and the stash still exists (probe `git stash list`); a missing stash (already popped) → skip.
- **archive_commit**: stage `kaola-workflow/archive/<project>/` pathspec, check `git diff --cached --quiet` exit-1 before committing (mirror cmdWorktreeFinalize:2553-2557) — nothing staged → skip commit.
- **push_main**: `git push origin <defBranch>` — already-pushed is a clean no-op; the FF-impossible classifier (classifyMergeError:66) already handles origin-advance with `--force-with-lease` ON THE WORKFLOW BRANCH ONLY (never force main).

The receipt write itself routes through an atomic temp-write+rename (mirror writeFileAtomicReplace semantics; sink-merge.js currently uses plain fs.writeFileSync for sink-fallback.json — for the receipt use write-temp-then-rename so a crash mid-write never corrupts the resume state).

### Q4. cmdWorktreeFinalize's fate

**FOLD-AND-DELETE.** cmdWorktreeFinalize (claim.js:2537) is the orphan the issue names: pure `copyDir` worktree→main + `chore: finalize` commit, NO archive/closure/cleanup, routed to by NO documented flow. Its body IS the new transaction's `worktree_sync` + `archive_commit` steps (steps 4 + 8). 

DECISION: the `worktree_sync` step in sink-merge.js's `--sink` transaction subsumes cmdWorktreeFinalize's copyDir; the new transaction calls cmdFinalize (the REAL archiver) at the `finalize` step. cmdWorktreeFinalize should be DELETED from claim.js and its `worktree-finalize` subcommand registration removed (claim.js:2925 dispatch + the usage string @2910).

HOWEVER — claim.js is NOT in any node's write set in this plan (n2 writes sink-merge.js ×4 + walkthrough; n_pins writes the contract validator ×2). Deleting cmdWorktreeFinalize requires editing claim.js, which is OUT OF SCOPE for the declared write sets. THEREFORE: n1 RECOMMENDS the fold-and-delete but the n2 implementation MUST treat cmdWorktreeFinalize as **leave-in-place, mark superseded**. Concretely: n2 does NOT touch claim.js. The new `--sink` transaction re-implements the copyDir+commit logic INLINE (it cannot import a soon-to-be-deleted function). The decision record D-429-01 (authored by n_decisions) documents that cmdWorktreeFinalize is now superseded/test-only and SHOULD be removed in a follow-up that legitimately scopes claim.js. This keeps n2 surgical and within its write set while recording the architectural intent.

### Q5. Tokens to pin in validate-workflow-contracts.js (added by n_pins)

Pin into BOTH `scripts/validate-workflow-contracts.js` AND its byte-identical codex peer `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (COMMON_SCRIPT pair):
```js
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'sink_blocked');       // #429 typed preflight refusal
assertIncludes('scripts/kaola-workflow-sink-merge.js', 'sink-receipt.json');  // #429 resumable step-receipt
assertIncludes('scripts/kaola-workflow-sink-merge.js', "args.includes('--sink')"); // #429 transaction entry
```
(The existing `--issue-numbers` pin @654 stays.) Place these near the existing sink-merge pins (validate-workflow-contracts.js:256-273).

### Q6. Walkthrough test scenarios (added by n2 to simulate-workflow-walkthrough.js)

Three NEW scenarios, modeled on the real-git-repo pattern at @5499/@5701 (git init + user config + OFFLINE + a linked worktree). Each builds a repo with a `workflow/<project>` branch carrying a real implementation file + the live project folder:

(a) **Blocked preflight (FOREIGN dirt) refuses, mutates nothing** — seed main with an untracked file that is NEITHER a roadmap source NOR a verified project-state duplicate (e.g. `kaola-workflow/other-project/workflow-state.md`, or a stray tracked-mod). Run `--sink`. Assert: exit 1, stdout JSON `reason: 'sink_blocked'`, `foreign_dirt` lists the exact path, AND a post-run `git status --porcelain` is BYTE-IDENTICAL to pre-run (no stash created, no file removed, no merge).

(b) **Kill-between-merge-and-finalize → re-run completes without double-applying** — run `--sink` once with an env hook that aborts the process AFTER the `merge` step flips to `done` but BEFORE `finalize` (use a test-only env var `KAOLA_WORKFLOW_SINK_ABORT_AFTER=merge`, mirroring the FF_RACE_PUSH_DIR test-hook pattern @17). Assert the receipt shows `merge:done, finalize:pending`. Re-run `--sink`. Assert: the second run SKIPS merge (no second merge commit — `git rev-list --count` unchanged across the two halves), completes finalize+closure+archive, exit 0, all steps `done`.

(c) **Clean run sinks end-to-end; receipt lists all steps** — clean worktree, clean main, run `--sink` once. Assert: exit 0, main advanced to feature HEAD, worktree removed, branch deleted, live folder archived, AND `sink-receipt.json` exists with every step `done`.

All three run OFFLINE (`KAOLA_WORKFLOW_OFFLINE=1`) so closure/push are skipped-offline but the local merge/sync/archive choreography is exercised.

---

## #434 Repair Primitives Design

### Q1. `revert-overflow` API

**Subcommand:** `node scripts/kaola-workflow-adaptive-node.js revert-overflow --project X --node-id N --json`. New `runRevertOverflow(opts)` function + a CLI arm in `main()` (alongside `reopen-node` @3583).

**Inputs / what it reads from `--barrier-check`:** shells the per-node barrier via `commit-node.js --node-id N --json` (the SAME call runCloseAndOpenNext makes @1562). Reads `barrierOut.barrierCheck.outOfAllow` — the array of production paths written outside the node's declared allowlist (plan-validator barrierCheck @719 surfaces this array). It MUST also read the per-node baseline commit (the revert target): the ref-anchored commit at `.cache/barrier-base-<sanitizeNodeId(N)>` (read via the existing `readNonce`-adjacent path — read the FULL SHA, not just the 12-char nonce). Refuse `no_overflow` (zero git ops) when `outOfAllow` is empty (nothing to revert). Refuse `no_baseline` when the baseline file/ref is absent (the barrier already refuses `no recorded per-node base`).

**Exact git operations:** for the EXACT paths in `outOfAllow` (and ONLY those — never a broad checkout), run in the BARRIER ROOT (= `git rev-parse --show-toplevel`, the same root the barrier pins via `--skip-root-pin`-off; the worktree/main root where node writes land):
```
git -C <barrierRoot> checkout <baseline-commit> -- <path1> <path2> ...
```
where `<baseline-commit>` is the SHA from `.cache/barrier-base-<sanitizeNodeId(N)>` (the ref-anchored node-start tree). This reverts exactly the overflowed paths to their node-start content. NO `--drop-base`, NO `--record-base` — the baseline is preserved (this is a revert TO the baseline, not a re-snapshot OF the current tree).

**Lifecycle-log write:** append ONE structured JSONL entry to `.cache/provenance-log.jsonl` via the EXISTING `appendProvenanceLog(planPath, event, nodeId, nonce)` helper (@233). Use `event: 'revert-overflow'`. Best-effort (never throws, never blocks). Additionally surface the reverted paths in the return payload.

**Output / re-run:** after the checkout, RE-RUN the per-node barrier (`commit-node.js --node-id N --json`) and report whether it now PASSES. Emit:
```json
{ "result": "ok", "nodeId": "N", "reverted": ["<path>",...],
  "baseline": "<sha>", "barrierAfter": "pass|refuse",
  "outOfAllowBefore": ["<path>",...], "taskMirror": {...} }
```
If `barrierAfter` is still `refuse`, return `result: 'ok'` but `barrierAfter: 'refuse'` with the residual `outOfAllow` (the operator may have a second overflow class — sensitive/unattributed — that revert cannot fix; do not claim success).

**Guard prologue:** run `mutationGuardPrologue(opts, { halt: true, excl: ['batch','scheduler'] })` (revert-overflow mutates the worktree; it must not fight a live batch/scheduler fan-out — same posture as reopen-node's manual guards @2021-2049). NO ledger mutation (the node stays in_progress — revert-overflow is a within-window correction, not a reopen).

### Q2. `repair-node` API

**Subcommand:** `node scripts/kaola-workflow-adaptive-node.js repair-node --project X --node-id <writer> --json`. New `runRepairNode(opts)`.

This is the #296-correct recovery the issue names, and is DISTINCT from the existing `reopen-node`/`runReopenNode`:
- `reopen-node` (#308): for an ALREADY-COMPLETE node, resets post-dominating gates, REMOVES the writer's baseline (`--drop-base` + unlink @2132-2147), reopens, and RE-RECORDS a FRESH baseline (`commit-node --start` @2186). The repair writes are measured against the NEW snapshot.
- `repair-node` (#434): KEEPS the writer's ORIGINAL `barrier-base` — NO `--drop-base` on the writer, NO `commit-node --start` for the writer. Repair writes land INSIDE the writer's original window and are attributed to it. This is the anti-laundering property: the original baseline still includes the pre-repair tree, so a `git checkout <writer-baseline>` would still revert the repair too — the repair is genuinely part of the writer's diff, reviewed by the (reset) gate.

**Safe-point definition (when it refuses):** repair-node refuses `not_at_safe_point` UNLESS the run is at a safe point. A node is safe to re-open when, examining the PRE-mutation ledger:
- NO node is `in_progress`, OR
- the ONLY `in_progress` node is a GATE (role ∈ GATE_ROLES, @670) that POST-DOMINATES the writer (it is the gate that found the issue and will be ledger-reset too — the #343 mid-gate case).

Any OTHER in_progress row (a non-gate node mid-flight, or a gate that does NOT post-dominate the writer) → refuse `not_at_safe_point` listing the offending in_progress ids, ZERO mutation (mirror reopen-node's `would_orphan_in_progress` guard @2101-2120, reusing the post-dominance computation @2066-2099). Also refuse over a live batch (`active_batch_exists` @2024) or live running-set (`scheduler_active` @2041) — same as reopen-node. Refuse `node_not_repairable` if the writer is not `complete` (only a finished writer is repairable) — the writer's ledger status must be `complete` (reset complete→pending, allowFrom:['complete']).

**Downstream baselines:** delete the baselines INVALIDATED by the reset — i.e. the post-dominating gate(s)' baselines (their review no longer applies to the changed tree). Use `--drop-base --node-id <gate>` + unlink `.cache/barrier-base-<gate>` + purge stale gate verdict evidence `.cache/<gate>.md` (mirror reopen-node @2132-2178). The gate(s) fold complete|in_progress→pending so they re-review. The KEY DIFFERENCE from reopen-node: the WRITER's baseline is NOT dropped or re-recorded.

**Ensuring the original barrier-base is KEPT (no re-snapshot):** runRepairNode does:
1. Reset writer complete→pending in the ledger (`spliceLedgerNode(..., 'pending', {allowFrom:['complete']})`).
2. Reset post-dominating gates complete|in_progress→pending + drop THEIR baselines + purge THEIR verdict evidence.
3. Reopen writer pending→in_progress (`spliceLedgerNode(..., 'in_progress', {allowFrom:['pending']})`).
4. Persist the plan. DO NOT call `commit-node --start` for the writer. DO NOT `--drop-base` the writer. The writer's `.cache/barrier-base-<writer>` and its anchored ref survive untouched — the existing baseline is reused. The on-disk nonce (`readNonce`) is UNCHANGED, so the re-dispatched agent's evidence-binding header must carry the SAME nonce (the issue's "re-dispatch the role agent with the same nonce"). Therefore repair-node does NOT re-seed the evidence file with a fresh nonce (contrast reopen-node @2196 forceRotate=true); it preserves the existing evidence file / nonce so the writer's window is continuous.
5. Append a lifecycle-log entry `event: 'repair-node'` via appendProvenanceLog.

**Emit the re-dispatch contract:** return the writer's role + declared write set + the PRESERVED nonce so the orchestrator re-dispatches the SAME role agent into the SAME window:
```json
{ "result": "ok", "repaired": "<writer>", "gatesReset": ["<gate>",...],
  "baselinesRemoved": ["barrier-base-<gate>",...],
  "evidenceRemoved": ["<gate>.md",...],
  "baselineReused": true, "nonce": "<preserved 12-char nonce>",
  "redispatch": { "node_id":"<writer>", "role":"<role>", "model":<model|null>,
                  "declared_write_set":"<raw>", "nonce":"<preserved>",
                  "evidence_file":".cache/<writer>.md", "required_tokens":[...] },
  "taskTransitions":[...], "taskMirror":{...} }
```
Build `redispatch` via the existing `buildDispatch(nodeInfo, context)` (@745) for shape-parity with the openers — passing the PRESERVED nonce and existing evidence_file (NOT a re-seeded one). `baselineReused: true` is the machine-checkable anti-laundering assertion the test (b) verifies.

### Q3. `requires_redispatch` resume signal

`runOrient` (@853) emits a NEW field. Today orient surfaces `inProgressNode` + `cacheState` ('present'|'absent') for the first in_progress row (@955-956) but routes nothing on absent evidence — it returns `result:'ok'` and the orchestrator infers. #434 makes this EXPLICIT.

**When `orient` emits it:** when there is an `in_progress` ledger row whose evidence is ABSENT OR INCOMPLETE (fails `checkEvidenceShape` — not merely cache-absent, also shape-malformed/unbound/stale). Compute per in_progress node: read `.cache/<id>.md` + its nonce (`readNonce`) and run `checkEvidenceShape(role, id, content, {expectedNonce, expectedNodeId})`. Any in_progress node failing the shape check is added to a `requires_redispatch` array:
```json
"requires_redispatch": [ { "nodeId":"<id>", "role":"<role>", "nonce":"<nonce>",
                           "reason":"evidence_absent|evidence_shape_failed|evidence_stale|evidence_unbound",
                           "evidence_file":".cache/<id>.md" } ]
```
Field is `[]` (or omitted) when every in_progress node has complete evidence. This is ADDITIVE — orient still returns `result:'ok'` (requires_redispatch is informational routing, NOT a refusal), and the existing `inProgressNode`/`cacheState`/`inProgressNodes` fields stay byte-identical so no current consumer regresses.

**How it differs from the existing crash-recovery path:** the existing refuse paths (`running_set_opening_incomplete` @994, `running_set_close_incomplete` @1014, `orphan_multi_in_progress` @1118, `batch_topup_incomplete` @1058) are STRUCTURAL CORRUPTION of the coordination manifests (a crashed open/close transaction) and REFUSE with a `reconcile-*` repair. `requires_redispatch` is NOT corruption — the ledger + manifests are coherent; a single legitimately-in_progress node simply lacks finished evidence because its agent never ran / died / was paused (the rate-limit-resume case at 23:15Z). The recovery is RE-DISPATCH the role agent (same nonce), not reconcile. So `requires_redispatch` rides on the `result:'ok'` path with a coherent ledger, whereas the reconcile refusals fire on incoherent manifests. The two are mutually exclusive: requires_redispatch is only computed when NONE of the reconcile-refuse conditions fired (it sits after the AC#5 legality gate, on the ok path).

### Q4. `inline_execution_suspected` informational flag

`runCloseAndOpenNext` (@1485) gains an OPTIONAL informational flag on its `result:'ok'` close payload (NEVER a refusal — "not a hard gate initially", per the issue). 

**What triggers it:** when closing node N, probe the dispatch-log (`.cache/dispatch-log.jsonl`) for a role-agent dispatch entry INSIDE the node's window. The window is bounded by the node's open: the baseline commit at `.cache/barrier-base-<N>` is recorded at open; the dispatch-log entries are timestamped. "Inside the window" = a dispatch-log entry naming this node's role (or this node-id) with a timestamp ≥ the node-open time. Heuristic (the simplest correct version): read `.cache/dispatch-log.jsonl`; if it exists AND has NO entry whose `agent`/`subagent_type` matches the closing node's role since the node opened, set `inline_execution_suspected: true`. If the dispatch-log is ABSENT (SubagentStart hook not installed — the checkDispatchAttestations:71 "detector inactive" case), DO NOT set the flag (absence of evidence ≠ evidence of inline; mirror the warn-first posture).

**What it warns about:** the main session completed the node's work INLINE without dispatching the role agent (the 23:15Z→02:06Z rate-limit-resume incident where main edited a doc-updater node's files itself). The flag is consumed by the adversarial-verifier + the #435-style finalize sweep, not blocked here. Emit on the ok payload:
```json
{ "result":"ok", "closed":"N", ..., "inline_execution_suspected": true,
  "inline_detail": "no role-agent dispatch for role '<role>' found in dispatch-log within node window — main session may have run the node inline (re-dispatch or log --attest-inline)" }
```
PAIRS WITH the `--attest-inline --reason <r>` escape: when the operator legitimately ran a node inline (allowed only with a consent-halt or explicit attestation), they back-fill a dispatch-log entry (mirror claim.js's --attest-contractor-spawn back-fill @2122) so the flag does not fire. The `--attest-inline` flag handling is a documented prose contract (n5 plan-run prose); the close-side only READS the dispatch-log.

### Q5. Tokens to pin in validate-workflow-contracts.js (added by n_pins)

Into BOTH validate-workflow-contracts.js editions (COMMON_SCRIPT pair):
```js
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "subcommand === 'revert-overflow'");
assertIncludes('scripts/kaola-workflow-adaptive-node.js', "subcommand === 'repair-node'");
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'requires_redispatch');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'inline_execution_suspected');
assertIncludes('scripts/kaola-workflow-adaptive-node.js', 'baselineReused');  // anti-laundering: repair-node keeps the original baseline
```
Place near the existing adaptive-node pins (validate-workflow-contracts.js:611-624).

### Q6. Test fixtures in test-adaptive-node.js (added by n3)

Follow the EXISTING injected-stub pattern (the runReopenNode fixtures @2122-2377: `shell`/`readFile`/`writeFile`/`cacheExists`/`unlink`/`readdir` closures over an in-memory `planContent`, NO real git repo). Three fixtures:

(a) **Overflow → revert-overflow clears it; close passes; lifecycle log shows revert.** Stub `shell` so the first `commit-node.js --json` (barrier) returns `{exitCode:1, result:'refuse', barrierCheck:{result:'refuse', reason:'write_set_overflow', outOfAllow:['docs/api.md']}}`; stub the baseline read to return a SHA; capture `git checkout` (stub shell or an injected `runGit`) and assert it was called with EXACTLY `['checkout','<sha>','--','docs/api.md']`; stub the SECOND barrier call to return `{result:'pass'}`. Assert `result:'ok'`, `reverted:['docs/api.md']`, `barrierAfter:'pass'`, and that an `appendProvenanceLog` entry with `event:'revert-overflow'` was written (inject a provenance-capture or assert via a recorded append). NOTE: revert-overflow git ops need an injectable git seam — add a `runGit` injection point (the tests inject a recorder; production wires execFileSync) OR shell it through the validator. RECOMMEND: route the `git checkout` through an injectable `opts.gitCheckout(baselineSha, paths)` so the test asserts the args without a real repo, mirroring how shell is injected. (Production CLI wires `gitCheckout` to an execFileSync wrapper in `barrierRoot`.)

(b) **Reviewer-finding → repair-node reopens writer with ORIGINAL baseline; repair closes cleanly in the writer window; NO re-snapshot.** Plan a→writer(tdd-guide)→review(code-reviewer)→finalize, all complete. Run `runRepairNode({nodeId:'writer', ...})` with the writer + gate baselines present. Assert: `result:'ok'`; writer reopened to in_progress; review gate reset to pending; `baselineReused === true`; the captured `shell` calls contain NO `commit-node.js --start` for the writer AND NO `--drop-base --node-id writer` (assert the writer's baseline was NEITHER dropped NOR re-recorded — the anti-laundering invariant); the gate's baseline WAS dropped (`--drop-base --node-id review` present); the returned `nonce` EQUALS the writer's pre-existing on-disk nonce (readNonce unchanged); `redispatch.node_id==='writer'`. Add a NEGATIVE assertion mirroring reopen-node test @2164 inverted: `assert(!shelled.some(c => c.base==='kaola-workflow-commit-node.js' && c.args.includes('--start') && c.args.includes('writer')))`.

   PLUS a safe-point REFUSAL fixture: a non-gate node mid-flight in_progress → `runRepairNode` refuses `not_at_safe_point`, ZERO mutation (`writeFile` throws if called), listing the offending in_progress id.

(c) **Resume → orient says requires_redispatch; inline completion without attestation flags inline_execution_suspected.** 
   - requires_redispatch: build a plan with one in_progress node whose `.cache/<id>.md` is ABSENT (cacheExists false for that file). Run `runOrient`. Assert `result:'ok'` AND `requires_redispatch` array contains `{nodeId, role, reason:'evidence_absent'}`. A SECOND sub-case: in_progress node with PRESENT-but-shape-failed evidence (e.g. tdd-guide missing GREEN) → `reason:'evidence_shape_failed'`.
   - inline_execution_suspected: run `runCloseAndOpenNext` closing a node whose evidence is VALID (so it closes ok) but the dispatch-log (`.cache/dispatch-log.jsonl`) exists with NO entry for the node's role → assert the ok payload carries `inline_execution_suspected: true`. Negative: a dispatch-log WITH a matching role entry → flag absent. Negative: NO dispatch-log file → flag absent (detector inactive).

---

## Implementation Contract

### n2_impl_sink (writes: scripts/kaola-workflow-sink-merge.js + plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js + plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js + plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js + scripts/simulate-workflow-walkthrough.js)

1. In `scripts/kaola-workflow-sink-merge.js`, add a `--sink` mode to `main()`. When present, run `runSinkTransaction(args, mainRoot, defBranch)`; when absent, the existing 9-step pipeline runs UNCHANGED (existing tests must stay green).
2. `runSinkTransaction`:
   - Resolve/load `.cache/sink-receipt.json` (live → archive fallback path). Initialize with all steps `pending` if absent.
   - Run `sinkPreflight(mainRoot, args)` → classifies porcelain into roadmap-source / project-state-duplicate / foreign-dirt. Foreign-dirt → return `{result:'refuse', reason:'sink_blocked', foreign_dirt:[...]}` exit 1, ZERO mutation. Else auto-stash bucket 1 (named `kw-sink-<project>`, record stash_ref), byte-superset-verify+remove bucket 2 (record removed_duplicates). Flip `preflight:done`.
   - Walk SINK_STEPS = ['preflight','push_upstream','merge','worktree_sync','finalize','closure','stash_restore','archive_commit','push_main']; skip `done` steps; run each, flip to done, atomic-rewrite the receipt.
   - `merge` reuses doRebase + ffMergeLoop; `closure` reuses postMergeCleanup's #427 probe-before-close + #369 bundle close; `finalize` invokes cmdFinalize internals (require claim.js's finalize entry or replicate archive-before-delete — PREFER requiring the existing `archiveProjectDir`/finalize helper exported from claim.js; sink-merge already requires several claim.js exports @6).
   - `worktree_sync` = inline copyDir worktree→main project folder (do NOT depend on cmdWorktreeFinalize).
   - Emit final `{result:'ok'|'refuse', status:'sinked', receipt:{...}}`.
3. The receipt step const array, `sink_blocked`, `sink-receipt.json`, and `--sink` token literals MUST appear verbatim (n_pins asserts them).
4. Codex byte-copy (plugins/kaola-workflow/scripts/...) = VERBATIM (COMMON_SCRIPT — validate-script-sync byte-compares claude↔codex). Two forge ports = hand-port per rename map (see Cross-Edition Notes).
5. Add the three walkthrough scenarios (Q6). Run `node scripts/simulate-workflow-walkthrough.js` → must print "Workflow walkthrough simulation passed".

### n3_impl_repair (writes: scripts/kaola-workflow-adaptive-node.js + the 3 regenerated ports + scripts/test-adaptive-node.js)

1. Add `runRevertOverflow(opts)`, `runRepairNode(opts)` functions + their CLI arms in `main()` (after the `reopen-node` arm @3583). Export both from module.exports.
2. Add `requires_redispatch` computation to `runOrient` (additive, on the ok path, after the AC#5 gate). Add `inline_execution_suspected` to `runCloseAndOpenNext`'s ok payloads (additive, informational).
3. `runRepairNode` MUST NOT call `commit-node --start` for the writer and MUST NOT `--drop-base` the writer (assert `baselineReused:true`). It DROPS only post-dominating gate baselines + purges gate verdict evidence (reuse the post-dominance computation @2066-2099 and the gate-purge loop @2149-2178 from runReopenNode — factor a shared helper if convenient, but the write set is only adaptive-node.js so a local copy is fine).
4. `runRevertOverflow` needs an injectable git seam (`opts.gitCheckout`) for testability; production wires it to execFileSync in `barrierRoot`. Lifecycle log via `appendProvenanceLog` with events `revert-overflow` / `repair-node`.
5. Recovery-hint rewrite: every refusal payload that today suggests "drop/re-record" or "--drop-base then --record-base" sequences (the barrier_base_mismatch hints live in the VALIDATOR, out of scope; within adaptive-node the relevant hints are in reopen-node/reconcile refusals) SHOULD point at `revert-overflow`/`repair-node`. Scope: only adaptive-node.js refusal `repair:`/`detail:` strings — do NOT edit the validator (not in write set).
6. adaptive-node.js is a GENERATED_AGGREGATOR: edit the CANONICAL root only, then run `npm run sync:editions` (edition-sync.js --write) to regenerate the codex byte-copy + 2 forge ports. Declare all four in the write set (they change as bytes). `edition-sync.js --check` gates the gitlab/gitea chains.
7. Add the three test fixtures (Q6) to test-adaptive-node.js. Run `node scripts/test-adaptive-node.js` → must pass.

### Shared invariants (n_review G1 verifies)
- `sink_blocked` preflight NEVER touches foreign files (zero mutation on refuse).
- sink-receipt makes resume idempotent (no double-apply — merge/finalize/closure each idempotent).
- `repair-node` truly REUSES the original writer baseline (no laundering re-snapshot; `baselineReused:true`; no `--start`/`--drop-base` on the writer).
- `revert-overflow` scopes `git checkout` to EXACTLY the `outOfAllow` paths in the barrier root.
- Edition ports faithful: root↔codex byte-identical (sink-merge AND adaptive-node); no forge-noun leak in scripts/SKILLs.

---

## Cross-Edition Notes

### kaola-workflow-sink-merge.js — COMMON_SCRIPT (hand-ported forges)
- Registered in `scripts/validate-script-sync.js` COMMON_SCRIPTS @49. validate-script-sync byte-compares `scripts/kaola-workflow-sink-merge.js` ↔ `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (claude↔codex MUST be byte-identical → codex copy is VERBATIM).
- The two FORGE ports are EDITION-NAMED, hand-ported files at:
  - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
  - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
  These are NOT in a byte-identical group; they are HAND-PORTED per the rename map. The forge ports import the forge-named claim.js port and use forge nouns. Canonical spec = "mirror the root sink transaction modulo forge nouns": gitlab = MR / `glab` / merge-request nouns; gitea = PR / `tea` / pull-request nouns. The forge validators FORBID `gh`, `pull request`, and `plugins/kaola-workflow/scripts` cross-tree references in the forge trees — keep the ports edition-pure.
- Because sink-merge is online-IO (gh issue close, push), the forge ports route closure through their forge CLI. The OFFLINE walkthrough scenarios sidestep this; the forge chains exercise the forge ports via their own test-*-sinks.js (test-gitlab-sinks.js / test-gitea-sinks.js already present).

### kaola-workflow-adaptive-node.js — GENERATED_AGGREGATOR (regenerated forges)
- Registered in BOTH COMMON_SCRIPTS (validate-script-sync @62, claude↔codex byte-identical) AND edition-sync.js GENERATED_AGGREGATORS @47.
- Edit the CANONICAL `scripts/kaola-workflow-adaptive-node.js` ONLY. Then `npm run sync:editions` (edition-sync.js --write) REGENERATES:
  - `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` (codex byte-copy)
  - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` (forge port, rename-normalized by edition-sync's renameSet)
  - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js`
- edition-sync's `forgeRel(base, forge)` = `plugins/kaola-workflow-${forge}/scripts/${forgeBase(base, forge)}`; `renderForgePort`/`renameSet` apply the noun renames mechanically. `edition-sync.js --check` is wired into the gitlab/gitea npm chains — a forgotten regenerate FAILS those chains.
- n3 DECLARES all four (canonical + 3 ports) in its write set because they all change as bytes when the canonical changes.

### validate-workflow-contracts.js — COMMON_SCRIPT pair (n_pins)
- `scripts/validate-workflow-contracts.js` ↔ `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` are byte-identical (COMMON_SCRIPTS @52). n_pins edits BOTH with the IDENTICAL assertIncludes lines (#274/#301 pattern). The gitlab/gitea contract validators are SEPARATE files (validate-{gitlab,gitea}-contracts.js) — they assert their OWN forge ports; n_pins does NOT touch them (the plan's write set is the claude+codex pair only), but the cross-edition chains will still run them via npm test, so the forge ports must EXIST (they do, regenerated/hand-ported by n2/n3) before n8_finalize runs all four chains.

### Cross-edition diff (#307) — the SIX prose surfaces + four chains
- This bundle touches edition trees (forge sink-merge ports, regenerated adaptive-node ports, the ×6 prose surfaces n5/n6/n7 write) → ALL FOUR `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains MUST be green, run SEQUENTIALLY, before n8_finalize. A green claude chain alone is INSUFFICIENT (npm test short-circuits on `&&`). n5 (plan-run ×6) + n6 (finalize ×6) + n7 (contractor ×4) carry the #400 six-surface propagation; the route-reachability contract (test-route-reachability.js + all four validate-*-contracts.js) machine-enforces the 3-commands + 3-SKILL-packs reach.
- n2/n3 must run `node scripts/simulate-workflow-walkthrough.js` (claude) AND, being cross-edition, the claude chain at minimum; n8 runs all four.

### #435 conflict-avoidance (primary instruction)
- #435 (parallel session) owns: workflow-next.md Goal-Driven Autonomy; the finalize `## Run gaps`/`gaps_unswept` Step-8 gate region; a NEW scripts/kaola-workflow-gap-sweep.js + its COMMON_SCRIPTS/install-manifest lines. NO node here touches any of those. The doc nodes (n5→n6→n7, sequenced LAST) write ONLY new sink-routing/resume subsections structurally separate from #435's gap-capture region. The sink/repair code (n2/n3/n_pins) shares zero files with #435. Result: conflict-free regardless of landing order.
