# code-review gate — issue #292 (code-reviewer)

Reviewed the FULL working-tree changeset on branch `workflow/issue-292` (9 files)
against HEAD=d8b3511, the design recipe (`design.md`), and the build evidence
(`build.md`). Verdict: APPROVE / pass — all 4 ACs met, all high-value scrutiny
points confirmed, zero blocking findings.

## Verification run (real exit codes, captured directly — not a piped tail)

| Command | Result |
|---|---|
| `node scripts/test-parallel-batch.js` | EXIT 0 — "parallel-batch tests passed (117 assertions)" |
| `node scripts/simulate-workflow-walkthrough.js` | EXIT 0 — "Workflow walkthrough simulation passed" |
| `npm test` | EXIT 0 — validate-script-sync OK (18 common + 7 byte-identical group), all 4 editions green, contract validation passed, walkthrough passed |

Forge-port parity (diff vs base):
- base ↔ claude copy: **byte-identical** (0 diff) — satisfies validate-script-sync.
- base ↔ gitlab port: exactly **7 changed lines** (line-5 header + 6 const renames).
- base ↔ gitea port: exactly **7 changed lines** (line-5 header + 6 const renames).
- The R3 shim, snapshotMember/anchorMergeRef helpers, worktree lifecycle, member-scoped seal, and fail-closed runJoin are byte-identical across all 4 ports (zero edition token — pure git + runtime values).

## AC verification

- **AC#1 (R3 closed — REF in the ref slot)**: PASS. io shim `gitCheckout`
  (`scripts/kaola-workflow-parallel-batch.js:825-832`) runs
  `git -C repoRoot checkout <mergeRef> -- <paths>` — `-C` targets the PARENT
  worktree (repoRoot, not projectDir), the ref slot is `mergeRef` (a gc-anchored
  commit), declared paths are the pathspec. `runJoin:700` passes `m.mergeRef`,
  NOT the worktree FS path. The old bug (FS path in the ref slot, wrong `-C`) is
  gone.
- **AC#2 (2+-member disjoint write-role fanout joins, exercised by a REAL test)**:
  PASS. E1 (`test-parallel-batch.js:886-947`) drives the REAL subprocess CLI
  (`runBatchCli` → `execFileSync('node', [BATCH_CLI, ...], {cwd: repoRoot})`)
  against a real `$TMPDIR` git repo with two disjoint write-role members. E1a/E1b
  assert REAL parent content (`wa.js=="AAA"` / `wb.js=="BBB"`), not `state:'joined'`.
- **AC#3 (serialized fallback + logged in degraded mode)**: PASS. `runOpenBatch`
  degraded path (`:361-385`) returns
  `{result:'ok',degraded:true,reason:'worktree_unavailable',opened:[]}` with full
  rollback + zero mutation; E3 proves it via the real CLI. Docs
  (`commands/kaola-workflow-plan-run.md` + 3 forge copies + SKILL) instruct the
  orchestrator to `log()` and fall back to the single-node `open-next` path.
- **AC#4 (barrier/gate-verify/verdict-check/Phase-6 + 4-edition parity)**: PASS.
  npm test (all editions) green; validate-workflow-contracts passes; no new files
  → no count-bump; forge ports differ only by the 7 rename lines.

## High-value scrutiny — all confirmed

- **R3 fix correctness**: confirmed `git -C <repoRoot> checkout <mergeRef> -- <paths>`
  and `runJoin` passes `m.mergeRef` (gc-anchored commit), not the worktree path.
- **False-green killed (a)**: `runJoin:696` refuses `missing_merge_ref` on falsy
  mergeRef or missing seam; the `if (m.worktreePath && ...)` guard is removed so
  `joined:true` (`:705`) is reachable ONLY after a successful real checkout.
- **False-green killed (b)**: seal is MEMBER-SCOPED — `sealOne:486-490` shells the
  real `commit-node` against the per-member plan copy so `findRepoRoot` resolves
  the member worktree. E2 drives this through the REAL `commit-node` subprocess
  and asserts `barrier_failed` AND that the error names `intruder.js`.
- **Test integrity**: E1/E2/E3 invoke the REAL subprocess CLI, NOT direct
  `runJoin`/`runSeal` with an injected `gitCheckout`/`shell`. Load-bearing R3
  check satisfied.
- **Degraded mode**: zero mutation + rollback of provisioned worktrees on
  capability absence; ledger rows stay pending; E3 asserts no manifest + pending
  rows.
- **Crash-safety / idempotency**: `runJoin` skips already-`joined` members
  (`:690`); `mergeRef` is gc-anchored via commit-tree + update-ref; E1c proves an
  idempotent re-join leaves content intact.
- **Hygiene**: `.kw/` is gitignored (`git check-ignore .kw/batch/x` → IGNORED);
  no leftover worktrees; working tree is exactly the 9 expected files.

## Non-blocking observations (documented, not defects)

- The deletion edge (`git checkout <ref> -- <declared-path>` errors if a member
  DELETES a declared path, surfacing as `join_failed`) is an explicit additive/
  modify scope boundary (design §8.2 risk 2; build.md). Out of scope; a follow-up
  only if deletion support is ever required.
- Seed/merge refs under `refs/kaola-workflow/batch-{seed,merge}/...` are left
  anchored after join by design ("bounded by node count"). Acceptable.

## Machine-readable verdict (parseNodeVerdict / parseNodeFindings format)

verdict: pass
findings_blocking: 0
finding: id=F1 scope=out_of_scope action=document status=deferred severity=low deletion-of-a-declared-path surfaces-as-join_failed; additive/modify boundary per design-section-8.2; follow-up-only-if-deletion-support-needed
finding: id=F2 scope=out_of_scope action=none status=deferred severity=low batch-seed/merge-refs-left-anchored-after-join by-design-bounded-by-node-count
