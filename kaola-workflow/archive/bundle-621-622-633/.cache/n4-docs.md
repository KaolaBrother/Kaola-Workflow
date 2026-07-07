evidence-binding: n4-docs 7db14465c5f3

# n4-docs — documentation update for bundle-621-622-633 (#621/#622/#633 + R4 repair)

Grounding performed before writing anything: read `git diff HEAD -- scripts/kaola-workflow-adaptive-node.js`
in full (the working-tree diff — the fixes are uncommitted changes on top of `d5f942a8`, not a
committed range; `git diff d5f942a8 HEAD` alone showed nothing because the file is unchanged at the
commit level), plus `kaola-workflow/bundle-621-622-633/.cache/n1-scheduler-fixes.md` (fix rationale +
RED/GREEN evidence for the R4 repair), `n2-review.md` (repair-pass code review, verdict pass), and
`n3-adversary.md` (adversarial falsification, verdict pass, NOT-REFUTED). Cross-checked exact reason
strings and line numbers against the live source (`grep -n` for `write_node_exclusive`,
`write_awaits_drain`, `merge_awaits_read_drain`, `lane_group_live`, `liveHasLeglessWrite`,
`legMirrorPath`, function start lines) before citing any of them in prose. Confirmed `docs/decisions/`
has no existing `D-62x` file and that the source code's own comments already anticipate `D-622-01`
(6 occurrences: `legMirrorPath` comment, both `runOpenReady` relaxation/preservation comments, the
tracked-evidence-seeding comment, the leg-preferred-read comment, and the merge-fence comment) —
confirming this is the correct/expected decision id, not a fabricated one.

## Files written (all four declared; none skipped)

1. **`docs/decisions/D-622-01.md`** (NEW). Primary artifact. Covers, in one decision record:
   - #622: `write_node_exclusive` relaxed to `liveHasLeglessWrite` (a live write only excludes
     co-open when it is NOT a lane-group member); the `merge_awaits_read_drain` last-member merge
     fence in `closeGroupMember`.
   - R4 (in-run adversarial-verifier finding, not a filed GitHub issue — labeled as such, not given
     a fake `#NNN`): the `lane_group_live` speculative-write exclusion that preserves the
     single-`lane_group`-descriptor invariant, sibling to the pre-existing `no_leg_capability` /
     `parent_dirty` exclusions.
   - #633: the `legMirrorPath` helper, the TRACKED-EVIDENCE-SEEDING commit at group formation
     (before `baseRev` capture), and the leg-preferred evidence read in `runCloseNode`.
   - Cites real line numbers from the current source (`runOpenReady` ~L4186, `liveHasLeglessWrite`
     ~L4238, `lane_group_live` exclusion ~L4356, `legMirrorPath` ~L3811, tracked-seeding ~L4535,
     `runCloseNode` ~L4875, `closeGroupMember`/merge fence ~L5081/L5199).
   - `Related:` cross-refs #621 (separate fix, same bundle, extends the pre-existing `D-590-01`
     baseline-first invariant — explicitly called out as OUT of this decision's scope in the
     Non-goals section) and #596/#542/#437/#419 (the mechanisms this decision builds on/relaxes).
   - Follows the house ADR format read from `D-617-01.md` and `D-590-01.md` (Context / Decision /
     Consequences / Non-goals / Alternatives considered).

2. **`docs/architecture.md`** — updated the running-set scheduler section (the existing
   "Lane-group co-open and group-scoped close barrier" block):
   - Added a new paragraph on the #622 relaxation (`liveHasLeglessWrite`) + the
     `merge_awaits_read_drain` last-member fence.
   - Added a new paragraph on the single-descriptor invariant + the R4 `lane_group_live`
     speculative-write exclusion.
   - Added a new paragraph on the #633 tracked-evidence-seeding (cross-referencing
     `docs/workflow-state-contract.md` for the full contract, to avoid duplicating the same prose
     in two files).
   - Fixed a real pre-existing accuracy gap directly caused by this bundle's rename: the doc named
     the literal variable `liveHasWrite` (twice, in the #607 gate-exclusion paragraph) but the
     source renamed it to `liveHasLeglessWrite` as part of the #622 diff — corrected both mentions.
   - Added a short paragraph extending the existing "Serial `open-next` baseline-first ordering
     (issue #590)" paragraph to note #621 also applies the same ordering to
     `close-and-open-next`'s fused advance and `runReopenNode` — this is the exact paragraph #621
     extends, so leaving it unmentioned there would itself be a staleness gap; not explicitly
     requested in the task brief but directly grounded in the read diff and a natural fit for an
     existing paragraph about the invariant being extended.
   - Did NOT restructure the file; only added paragraphs inside the existing lane-group /
     coordination-kernel subsections.

3. **`docs/plan-run-cards/frontier-batch.md`** — updated reason-code semantics:
   - New paragraph (§3, before the `open-ready` returns line) documenting reads co-opening
     alongside a live leg-contained lane group, and the `lane_group_live` speculative-write
     exclusion.
   - Updated the `write_node_exclusive` reason description in the existing "non-error `ok`" list to
     clarify it now fires only for a LEGLESS live write.
   - Updated §4 (`close-node`)'s "Last member" bullet to describe the new `merge_awaits_read_drain`
     zero-mutation refuse ahead of the synthesizer/octopus-merge step.
   - Left `write_awaits_drain`'s existing description untouched — verified against the source
     (~L4466-4469) that this reason's semantics (write ready but read-only members still live) are
     completely unchanged by this bundle; no edit needed there.
   - Did NOT touch the bottom "Quick reference" flow diagram — it already generically says
     `write_node_exclusive / write_awaits_drain / cap_reached`, and the detailed reason semantics
     are now covered in the narrative sections above it; adding every new reason string to the
     terse diagram would be restructuring beyond a targeted update.

4. **`docs/workflow-state-contract.md`** — updated the `lane_group` key section:
   - Added a bullet noting `running-set.json`'s `nodes` array can now carry a `kind:'read'` entry
     alongside a live `lane_group` (issue #622) — a real schema/state-contract change (previously
     structurally impossible under strict `write_node_exclusive`).
   - Added a bullet documenting the #633 tracked-evidence-stub seeding + commit at group formation
     (the `legMirrorPath` helper, the `kw-stub:` commit, and its explicit non-relationship to the
     per-node barrier commit order already documented earlier in the file).
   - Added a bullet documenting the #633 leg-preferred evidence read in `close-node`.
   - Fixed the same stale `liveHasWrite` → `liveHasLeglessWrite` reference found in architecture.md
     (same #607 gate-exclusion sentence, duplicated near-verbatim in this file).

## Explicit skip / non-edits

- **`docs/api.md`** — NOT edited, per the task's explicit instruction to skip it absent a
  clear-cut gap and given it is outside this node's declared write set (four files only). Note for
  the record: `docs/api.md`'s "Lane-group co-open and group-scoped close barrier" section
  (~L521-599) documents the `running-set.json` `lane_group` schema at a level that does not
  enumerate the `write_node_exclusive` / `write_awaits_drain` / `merge_awaits_read_drain` /
  `lane_group_live` reason-code family at all (that vocabulary lives in
  `docs/plan-run-cards/frontier-batch.md` instead) — so there is no regression there, only a
  pre-existing scope split between the two docs that predates this bundle. Left untouched rather
  than expanding the node's write set unilaterally.
- **`README.md`**, **`.env.example`** — not touched; no new env var, CLI flag, or install-facing
  behavior was introduced by #621/#622/#633/R4 (all four changes are internal scheduler-file
  mechanics gated on pre-existing toggles), so there is no README/env-var gap to document.
- **`CHANGELOG.md`** — intentionally not touched (that is the separate finalize node's job per the
  task brief).

## Validation of my own edits

- Re-read each edited section back via `git diff` after writing, confirmed every prose claim traces
  to a line I actually read in the source diff or the n1/n2/n3 evidence — no invented section names,
  no invented reason codes, no invented schema fields.
- Confirmed via `grep -n` that `write_node_exclusive`, `write_awaits_drain`, `merge_awaits_read_drain`,
  and `lane_group_live` are the exact literal reason strings emitted by the source (no typos), and
  that `liveHasLeglessWrite` (not `liveHasWrite`) is the current literal variable name.
- This is a docs-only node: no code or test file was touched (`git status` shows only the four
  target markdown files as newly modified/added by this node, on top of the pre-existing
  n1/n2/n3-authored code+test changes already present in the working tree).
