evidence-binding: n5-docs d6480e5637d7

# n5-docs evidence — documentation for bundle-619-620-631 (#619/#620/#631)

## Scope

Docs-only node. Grounded in the actual uncommitted diff (`git diff -- scripts/kaola-workflow-sink-merge.js
scripts/kaola-workflow-claim.js`, +239/-46 across the two canonical scripts) and the four upstream
node evidence files (`n1-sink.md`, `n2-claim.md`, `n3-review.md`, `n4-adversary.md`). Read the actual
diff line-by-line (not just the evidence prose) before writing any doc text, including exact receipt
field names, refuse-envelope shapes, and function names (`probeIssueClosedLive`, `removeBranchIfMerged`,
`published_head`) — no schema field or section was invented.

Also read the existing house style from two recent ADRs (`docs/decisions/D-617-01.md`,
`docs/decisions/D-622-01.md`) before writing D-619-01, and confirmed via `ls docs/decisions/ | grep
-E 'D-619|D-620|D-631'` that no `D-619-01.md` (or `D-620-*`/`D-631-*`) existed yet — used `D-619-01`
per the primary issue number, consistent with the numbering convention (one ADR per bundle, numbered
after the primary/lowest issue when multiple issues land as one fix).

## Files written

### 1. `docs/decisions/D-619-01.md` (NEW)

Full ADR covering all three issues as one bundle decision (matching the multi-issue-one-ADR
precedent set by D-617-01 itself, which covers #617 + #618): #619's four sub-fixes (post-probe on
close success path incl. the load-bearing `probeIssueClosedLight`/memo-trap rationale in claim.js,
the legacy `postMergeCleanup` closeFailed refusal mirroring the #497 `--sink` pattern, the
`push_upstream` parity check, and the `worktree_sync` dead-step removal + stage-then-land fix with
its self-caught checkout-collision regression), #631's additive `published_head` field (stamped only
at the closure gate, `branch_head` untouched — the #518 identity guard), and #620's
`removeBranchIfMerged` merge-base-proven deletion + `skipped_unmerged` bucket, including the R4
doc-clarity note (a pushed-and-at-parity unmerged branch is deleted by the safe `-d` leg into
`deleted_branch`, not `skipped_unmerged` — not data loss, tip stays reachable via
`refs/remotes/origin/<branch>` and the remote). Includes Context / Decision / Consequences /
Non-goals / Alternatives considered, following the D-617-01/D-622-01 house style. Provenance
(#619/#620/#631/R4/#497/#518/#617) lives here, per the project convention that ADRs — unlike
agent-facing prompts — carry provenance.

### 2. `docs/api.md`

Read the existing "Merge Sink" section (exit codes + failure handling, lines ~137-145),
"Sink-Merge Test Hooks" (~205-210), the `stale-worktree-cleanup` behavior/JSON sections
(~1783-1832), and the `sink_incomplete` refuse envelope section (~2201-2239) BEFORE editing any of
them — all four are genuine existing sections whose documented behavior is now stale/incomplete
after this bundle, not invented structure:

- **Merge Sink exit codes / failure handling** — corrected: exit `0` no longer means "or close
  failure emits warning but exit code stays 0" (that was the pre-#619 fail-open behavior on the
  legacy direct-merge path); exit `1` now also covers a post-merge close that failed or could not
  be verified, and `main()`'s exitCode propagation was generalized from `===3` to any non-zero code.
  Rewrote "Failure handling (issue #168)" to describe the new success-path post-probe and the
  `sink_incomplete`/`step:'closure'` refuse envelope this legacy path now emits (mirrors the
  pre-existing `--sink`-transaction #497 pattern), plus the `closeWasAttempted` no-false-flag guard.
- **Sink-Merge Test Hooks** — added `KAOLA_WORKFLOW_FORCE_PUSH_UPSTREAM_FAIL=1` (issue #619) as a
  new bullet, describing exactly what the code comment says it does. Did NOT attempt to backfill
  documentation for the pre-existing (already-undocumented before this bundle) `FORCE_PUSH_MAIN_FAIL`
  hook — that is a pre-existing gap unrelated to this bundle's diff, out of scope for a surgical
  docs-only node.
- **`stale-worktree-cleanup` § Branch cleanup (item 5)** — rewrote to describe the merge-base
  ancestry proof before `-D`, the safe `-d` fallback, and the never-force-delete-unproven-work
  invariant (#620).
- **`stale-worktree-cleanup` § Execute JSON output** — added `"skipped_unmerged": []` to the
  existing JSON schema block (did not restructure the block, only extended it), plus two new prose
  paragraphs: one describing the `skipped_unmerged` bucket shape (`{branch, tip}`) and recovery
  path, and one carrying the R4 doc-clarity note verbatim in spirit (pushed-at-parity unmerged
  branches land in `deleted_branch` via the safe `-d` leg, not `skipped_unmerged` — not data loss).
- **`sink_incomplete` refuse envelope (issue #497)** — added a THIRD shape, `step:"push_upstream"`
  (issue #619), following the exact same two-shape pattern already established for `push_main`/
  `closure` (discriminated JSON block + one-paragraph description) — this is an additive extension
  of an existing enumerated-shapes section, not new structure. Also updated the `step:"closure"`
  paragraph to note the new "OR an exit-0 close could not be verified closed on a live post-close
  probe" cause, since the `--sink` transaction's `closeOne` now probes on the success path too.

**Skipped (with reason), not touched:** the closure-receipt schema block at api.md lines ~1960-1988
(`emptyReceipt()`/`buildClosureReceipt` fields) and the `sink-merge` closure-receipt example at
~2159-2196 are a DIFFERENT receipt (the audit/closure receipt, `closure_receipt` — project, archive,
roadmap_source_removed, etc.) from `sink-receipt.json` (the crash-safe per-step transaction record
that carries `branch_head`/`published_head`/`push_upstream`). `published_head` belongs to the
latter, which api.md does not document a schema for at all (confirmed via `grep -n "branch_head"
docs/api.md` returning zero hits before this session's edits) — that schema lives solely in
`docs/workflow-state-contract.md` (the "Sink-receipt schema extensions" list) and in
`docs/decisions/D-429-01.md`/`D-518-01.md`. Rather than invent a new sink-receipt-schema section in
api.md that has never existed, `published_head` is documented in workflow-state-contract.md (see
below) and in the ADR. Similarly, the `worktree_sync` step removal / `SINK_STEPS` array is an
internal step-list detail with no dedicated section in api.md (no `SINK_STEPS` or step-table match
in api.md) — documented fully in the ADR instead of inventing a step-list section in api.md.

### 3. `docs/workflow-state-contract.md`

Read the existing "Sink-receipt schema extensions (#517, #518)" bullet list (lines ~209-252, the
section that already documents `branch_head` for #518 and `remote_closed_after_publish` for #617)
before editing. Added ONE new bullet, `published_head` (#631), immediately after the existing #617
bullet, matching the list's established per-field prose style: describes it as additive, stamped
only at the closure gate once the live tip is proven published, explicitly states `branch_head` is
never mutated (preserving its #518 identity-guard role), and documents `cmdVerifySink`'s preference
order (`r.published_head || r.branch_head`, falling back only for legacy receipts).

**Skipped (with reason), not touched:** the task asked for a "stale-cleanup data-safety contract"
update in this file, but `docs/workflow-state-contract.md` has NO existing stale-worktree-cleanup
section at all — confirmed via `grep -n "stale-worktree\|cleanup\|removeBranch" docs/workflow-state-contract.md`
returning zero relevant hits (the file's only other subcommand-adjacent section is "Script-Owned
Mechanical Transitions", an unrelated topic). Per the grounding rule ("if a subsection genuinely
doesn't exist, skip it with an explicit reason rather than inventing content"), the #620 data-safety
contract is documented instead in `docs/api.md` (which DOES have the `stale-worktree-cleanup`
section, edited above) and in the ADR (the primary artifact for durable-contract provenance).

## Not touched

- `CHANGELOG.md` — explicitly out of scope per the task (separate finalize-node responsibility).
- `README.md` / `.env.example` — no genuine gap found; this bundle is an internal script-contract
  hardening fix (fail-closed receipt integrity + an additive receipt field + a data-safety guard),
  not a new user-facing feature, CLI flag, or environment variable requiring top-level README/
  .env.example coverage. `FORCE_PUSH_UPSTREAM_FAIL` is a test-only hook (explicitly "never set in
  production" in the code comment), consistent with how the file's other test hooks
  (`FORCE_FF_FAIL`, `FORCE_MERGE_IMPOSSIBLE`) are documented in api.md only, not README/.env.example.
- No code or test file was edited by this node.

## Validation

- `git diff --stat -- docs/api.md docs/workflow-state-contract.md` — 64 insertions/13 deletions in
  api.md, 13 insertions in workflow-state-contract.md; both diffs re-read in full after editing to
  confirm no accidental restructuring of surrounding content.
- Cross-checked every new doc claim against the actual diff line numbers (e.g. `probeIssueClosedLive`
  at claim.js, `removeBranchIfMerged` at claim.js, the `published_head` stamp site in sink-merge.js's
  runSinkTransaction, the `SINK_STEPS` array literal) rather than paraphrasing only the node evidence
  prose — the node evidence was used to corroborate line ranges and the RED→GREEN narrative, not as
  the sole source of the schema/behavior claims written into the docs.
- This is a docs-only node; `node scripts/simulate-workflow-walkthrough.js` was not re-run here (no
  code/test file touched) — n1/n2 evidence already records full green walkthrough + chain runs for
  the underlying code change.
