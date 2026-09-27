# Documentation docking — issue-1100

Candidate: `66a077d7` (branch `workflow/issue-1100`), 9 changed files.
Scope of the change: `collectStale`'s LANE worktree arm gains the sink-resumability pin that the
integration arm has had since 57fc4c67. No new command, flag, JSON field, env var, or public
signature is introduced; the only observable behavior change is that a lane worktree is no longer
classified stale while its project holds a non-all-done `sink-receipt.json`.

## Checked files

| Surface | Verdict | Reason |
|---|---|---|
| `CHANGELOG.md` | FIXED | `[Unreleased] → Fixed` entry added (#1100): names the lane arm, the closed-issue active-set drop, the shared `sinkReceiptResumable` helper, the all-done/absent sweep-unaffected boundary, and the four claim copies. |
| `docs/api.md` | FIXED | The `stale-worktree-check` section described only the `(closed \|\| archived) && !active` classification and omitted the resumability pin entirely — it did not document the integration arm's #1097 guard either. Added one paragraph covering both arms, the live-then-archive `.cache` lookup order, and the missing/all-done boundary. Verified against the implementation: the receipt paths, the `steps` key, and the `!== 'done'` test match `sinkReceiptResumable` exactly. |
| `README.md` | NO IMPACT | Contains no `stale-worktree` / `collectStale` surface (`grep -n "stale-worktree\|collectStale" README.md` → 0 hits). Nothing user-facing in the README describes this classification. |
| `docs/decisions/` (ADRs) | NO IMPACT | No design change: this extends an existing, already-recorded guard to the second arm of the same rule rather than introducing a mechanism. ADR 0017/0027 concern the mission list and ledger, untouched here. |
| Architecture docs | NO IMPACT | The private-helper extraction is internal to one file's `collectStale` region and changes no module boundary, ownership, or transaction shape. |
| Public-interface comments | FIXED | The helper carries its own contract comment (source-of-truth, all-done/absent = NOT resumable, the two arms that call it), and the lane-arm call site explains why `inActiveSet` alone cannot protect a live lane worktree. |
| Docs index (`docs/README.md`) | NO IMPACT | No new document was added or renamed; the edited `docs/api.md` is already indexed. |

## Validation of the doc claims

- The pin's lookup order (`kaola-workflow/issue-<N>/.cache/sink-receipt.json`, then
  `kaola-workflow/archive/issue-<N>/.cache/sink-receipt.json`) is read directly from
  `sinkReceiptResumable` in all four claim copies.
- "steps not all done" corresponds to `Object.values(receipt.steps).some((v) => v !== 'done')`.
- "missing or all-done sweeps as before" is the `return false` path, and is covered by the new
  no-receipt and all-done test sub-cases in all three suites.
- All four claim copies carry the identical change; `node scripts/validate-script-sync.js` exits 0
  and `scripts/kaola-workflow-claim.js` is byte-identical to
  `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`.

## Result

DOCKED
