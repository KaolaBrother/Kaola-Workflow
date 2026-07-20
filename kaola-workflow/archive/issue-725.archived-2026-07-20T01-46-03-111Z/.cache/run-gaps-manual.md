# Run gaps — issue-725 Phase C (manual observations)

## GAP-1: #722 recurrence (third time) — replan transaction leaves stale parent journal live

At the r1→r2 fused advance, `close-and-open-next` refused `review_journal_plan_hash_mismatch`:
the committed replan transaction archived the epoch-1 `review-attempts.json` to
`.cache/epochs/1/files/.cache/` but left the byte-identical stale copy live in `.cache/`.
Workaround (same as Phase A/B): verified byte-identity (`cmp`), deleted the live copy, re-ran
`open-next`. Comment the recurrence on #722.

## GAP-2 (NEW DEFECT): cross-epoch child journal wedges every SEQUENTIAL schema-2 gate after the first settlement

Two independent seams, one trigger. After a committed replan, the first schema-2 gate (r2) opens
with the journal file ABSENT (post-#722-rotation) → `readReviewLineageV2` finds no journal → empty
lineage → open + settlement succeed. The settlement writes the sanctioned schema-1 legacy-import
child journal (`schema_version: 1` + `legacy_import` pointer; adaptive-node.js:4073-4078 comment
explicitly legitimizes this shape) with the attempt in schema-1 id format (`r2-code-certify:1`).
Opening the NEXT sequential gate (r3) then refuses twice:

1. `review_journal_attempt_identity_mismatch` — `reviewJournalIdentityMatchesPlan`
   (adaptive-node.js:3591) pools imported parent attempts into ordinal scopes via
   `reviewAttemptOrdinalScope` (adaptive-node.js:3013), which keys sequence gates by
   `logicalGate.id`. Schema-2 parent attempts carry digest `key`s but NO `id` → all three epoch-1
   attempts (distinct gates, each ordinal 1) collapse into one scope `'sequence\n'` → ordinals
   [1,1,1] fail the 1..N contiguity check at :3688. Structurally unfixable from state: the imported
   attempts are digest-bound (`legacy_import.attempts_digest`).
2. `review_journal_version_mismatch` — `readReviewLineageV2` (adaptive-node.js:1091) hard-calls
   `validateReviewJournal(journal, planHash, REVIEW_JOURNAL_SCHEMA_VERSION=2)` on the schema-1
   legacy-import child journal that :4073-4078 sanctions. The absent-journal branch returns empty
   lineage; the present-schema-1-child branch refuses instead of returning the same
   (factually correct) empty lineage.

Phase A/B did not trip this because their epoch-2 certifier walls opened as a parallel BATCH while
the journal was still absent; Phase C's r2→r3 are sequential, so r3 sees r2's settled journal.

Workaround applied (patched-copy pattern, repo untouched, scratchpad
`kw-adaptive-node-patched.js` with re-pointed requires + `__dirname`):
- `reviewAttemptOrdinalScope`: sequence scope keys by `id` when present, else by `key`
  (`'sequence\n' + (id != null ? 'id:'+id : 'key:'+key)`) — mirrors the V2 checker's per-key
  scoping for id-less schema-2 gates; id-bearing schema-1 semantics (shared-id ordinal
  continuity, #699 changed-origin case) preserved byte-for-byte.
- `readReviewLineageV2`: a `schema_version: 1` journal WITH `legacy_import` returns the same empty
  lineage shape as the absent-journal branch (r3's gate has no prior attempts; r2's schema-1
  attempt belongs to a different gate and lacks `scope_lineage_id`, so empty is the correct
  lineage answer either way).
All subsequent journal-reading lifecycle calls this run (r3 record/close, r4, finalize fence) must
go through the patched copy.

File as a NEW issue (722-family): "sequential schema-2 gates after a committed replan wedge on the
cross-epoch child journal (ordinal-scope collision + lineage-reader version refusal)". Proper fix
candidates: settlement upgrades the child journal to schema-2 at first schema-2 settlement (the
":until schema-2 review runs" intent), or both readers accept the sanctioned schema-1
legacy-import child shape.

## GAP-3: #719/#720/#734 workarounds applied verbatim a THIRD time (replan prepare)

Compliance pending-row hand-append + task-mirror refresh (#719); scratchpad-patched replan copy
with landable-digest (#720) and raw_evidence_sha256 (#734) branches. Note the recurrence on each.

## GAP-4: #737 avoidance confirmed — freeze-before-attest

The epoch-2 planner froze the child BEFORE attesting; resume committed first-try with no
`child_frozen` wedge. Note on #737 that freeze-before-attest is a valid avoidance and the
planner-side ordering should be the documented default.

## GAP-5 (planner lesson, for #725 Phase D/E briefs): deletion needle-greps must include CONSUMER-side literals

The epoch-1 n5 write set missed 5 surfaces across all four chains because the planner grepped for
the deleted hook basenames but not the consumer-side literals (`PreToolUse`, hook-count asserts,
sync-script file lists). Also the "additive editions aren't in npm test" premise is FALSE for
`sync-opencode-edition.js` — it is exercised in-chain by `test-install-adaptive-config.js`
shelling `install-opencode.sh`.
