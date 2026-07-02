evidence-binding: n2-prose d6a40b28c7ac

## n2-prose (doc-updater) — issue #597, leg n2-prose

Ground truth confirmed by reading the shipped engine (leg commit 5ba860b2) before writing —
grepped `kaola-workflow-adaptive-schema.js`, `kaola-workflow-plan-validator.js`,
`kaola-workflow-adaptive-handoff.js`, `kaola-workflow-next-action.js`,
`kaola-workflow-adaptive-node.js`, and `git show 5ba860b2` for the exact diff, plus the
`issue-599` live-exercise comment on the GitHub issue (`gh issue view 597 --json comments`) for
the two operational gotchas and the precondition project id.

### Files changed (exactly the 8 declared; verified via `git status --porcelain` = clean set)

1-6. **Six plan-run routing surfaces** (`commands/kaola-workflow-plan-run.md`,
`plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`,
`plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`,
`plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md`,
`plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`,
`plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md`) — identical edit applied
to all six (byte-diff-confirmed on the touched block, see below):
   - Updated the `<!-- CARD: speculative-open -->` pointer sentence, which previously named
     `speculative_open_policy: consent` as the ONLY policy that reaches this card. It now names
     `speculative_open_policy: auto` (the freeze-time default) OR `consent`, and rewords the
     parenthetical to state `open-ready`'s activation is automatic at `auto` and flag-gated
     (`--speculative-consent`) at `consent`.
   - Inserted one new paragraph (mirroring the existing "Write-parallelism is default-on..."
     paragraph's tone/structure directly above the `<!-- PIN: leg-isolation-recipe -->` block)
     describing the new posture: speculation is default-on under the structural net (no
     `decision:ask`, `--speculative-consent` a no-op at `auto`); every write-speculation safety
     condition (exact-path disjointness, no PROTECTED file, exact resolvability, non-sink, leg
     capability, fan-out caps, the `speculativeCloseGuard` close fence) holds identically to
     `consent`; every discard now records telemetry; serial waiting on the gate is now the
     DEGRADED path (the operator should run `open-ready`, not idle on `open-next`); the
     `consent` tier remains fully authorable.
   - `<!-- CARD: speculative-open -->` and the literal `--speculative-consent` (T9) preserved
     verbatim, as is `<!-- PIN: leg-isolation-recipe -->` and `--write-overlap-consent` (T8) —
     neither pin block's own body text was touched, only the block immediately following T9's
     pin comment.
   - No provenance added (`#NNN` / `D-NNN-NN`) — the new paragraph and the CARD-pointer edit
     were grepped clean (see verification below).

7. **`docs/plan-run-cards/speculative-open.md`** — rewritten to cover both tiers throughout:
   - Header/intro/§1 (eligibility): now names both `speculative_open_policy: auto` (default,
     materialized into `## Meta` on a fresh freeze even when the author omits the field, per
     `materializeSpeculativePolicy`) and `consent`; added a comparison table (`auto` / `consent`
     / `off` — activation + per-run-consent columns) stating the two tiers differ ONLY in
     ceremony, never in eligibility or safety.
   - "Authoring" section rewritten: since `auto` is now the default, the planner's Meta-key
     choice is framed as an OVERRIDE (`off` to suppress, `consent` to require an explicit
     ask) rather than an opt-in; both worked examples (read-only, write-bearing) now describe
     the default-`auto` case (no operator action needed) instead of requiring the key be set.
   - §2 (confirming policy) and §3 (`open-ready` activation) rewritten to branch by tier:
     `auto` needs no flag, `consent` needs `--speculative-consent` (documented as an accepted
     no-op at `auto`, back-compat for a caller that always passes it).
   - §4 (pass path) and §5 (fail path / decision table) left semantically unchanged (mechanics
     are tier-invariant) but reworded "at either tier" for clarity — no behavior claims changed.
   - §6 (`discard-speculative`) gained a new bullet: EVERY discard (read or write, either tier)
     now records telemetry — node id, role, gate — into the run's provenance log via
     `appendProvenanceLog`'s `extra` parameter (grepped `runDiscardSpeculative` at
     `scripts/kaola-workflow-adaptive-node.js:3854-3857`: `appendProvenanceLog(planPath,
     'discard-speculative', nodeId, baseSha…, { role: member.role || null, gate:
     member.speculativeGate || null })`).
   - §7 unchanged (refusal reasons `not_in_running_set` / `not_speculative` are tier-invariant).
   - New **§8 "Operational gotchas"** folds in the two #597-comment learnings verbatim-grounded
     against the shipped mutual-exclusion guard, not invented:
     - §8.1: a gate opened via the fused serial advance (a bare serial `in_progress` row, no
       live running set) makes `open-ready` refuse `reason: serial_node_live` when trying to
       fan out its speculative descendants — grepped `mutationGuardPrologue`'s `excl: ['serial']`
       config on `runOpenReady` (`kaola-workflow-adaptive-node.js:3900`) and
       `coordinationRefusal`'s `serial_node_live` arm (`:3338-3343`), which fires when
       `coord.serialLive` is true (`readCoordinationState`: "exactly one in_progress row AND no
       live running set" — `:3277-3280`). Recovery: route the gate's own open through
       `open-ready`, not the serial path.
     - §8.2: a parent-branch commit landing while a speculative write leg is open voids the
       leg's anchored base, refusing close-time `leg_base_unreachable` (a union-barrier
       overflow) — grepped the existing `leg_base_unreachable` operator hint and refusal site
       in `kaola-workflow-plan-validator.js:113,2674-2680` (pre-existing mechanical behavior,
       not new code from this issue). Recovery per the issue comment: reset parent to the
       interim commit, rebase the leg onto it, re-run the close.
   - Quick decision tree at the bottom rewired for the three-branch tier split
     (absent/off / auto / consent) plus a "Gotchas" footer line pointing at §8.1/§8.2.
   - No provenance added.

8. **`docs/decisions/D-597-01.md`** (new ADR) — follows the D-596-01 structure (Date/Status/
   Issue/Related header block; Context; Decision numbered by the same shape as the issue's
   design section; Consequences; Alternatives considered). Content, all fact-checked against
   the shipped diff (`git show 5ba860b2`), not invented:
   - **Precedent ladder**: cites `D-542-01` (disjoint-write co-open default-ON) and `D-546-01`
     (titled D-546-G2 in its own header; shared-infra consent retirement, quoting its recorded
     rationale "the operator-consent ceremony added nothing the structural net does not already
     guarantee" — grepped verbatim from `docs/decisions/D-546-01.md:33` and
     `scripts/kaola-workflow-plan-validator.js:705`) as precedent rungs 1 and 2, speculation as
     rung 3.
   - **Live-exercise precondition**: cites project `issue-599` by id (transcribed from the
     `gh issue view 597 --json comments` comment recording the #596 exercise: gate opened,
     `open-ready --speculative-consent` opened a downstream docs writer speculatively in leg
     `.kw/legs/issue-599/n3-docs`, a deliberate premature `close-node` correctly refused
     `gate_not_complete`, the gate passed, the member closed through the per-leg barrier ->
     octopus merge -> union barrier at commit `23d4df98`) and notes the SAME comment is the
     source of the two §8 card gotchas.
   - **Schema-diff accuracy correction during drafting**: my first draft claimed
     `SPECULATIVE_OPEN_POLICY_LEGAL` membership was "unchanged — auto was already named." I
     verified this against `git show 5ba860b2 -- scripts/kaola-workflow-adaptive-schema.js` and
     found it was WRONG — `LEGAL` was previously `['off','consent']` (auto excluded from LEGAL
     itself, not merely a member of the separate, non-load-bearing
     `SPECULATIVE_OPEN_POLICY_REFUSED_AT_FREEZE=['auto']` constant) and gained `'auto'` in this
     change. Corrected before finalizing — the ADR now states LEGAL's membership change
     precisely and notes `REFUSED_AT_FREEZE` is informational only (grepped: not referenced by
     any file except its own declaration in `kaola-workflow-adaptive-schema.js`; the freeze gate
     itself checks `!schema.SPECULATIVE_OPEN_POLICY_LEGAL.includes(specPolicy)`).
   - **The D-419-02 supersession** (explicit section): quotes `[INV-19]` verbatim from
     `docs/decisions/D-419-02.md:172-174`, states precisely what is superseded (the per-run
     consent ceremony as a universal precondition for activation, at the `auto` tier only) and
     enumerates every invariant left untouched (`[INV-20]`-`[INV-25]`, the hash-covered Meta
     field, the `consent` tier's own continued validity of `[INV-19]`). Attributed as
     operator-directed 2026-07-02 (the issue body's own framing, not independently asserted).
   - **O1 telemetry-accuracy fold-in**: described the `parallel_safe_indeterminate` vs
     `overlaps_live_writer` relabel, confirmed against `git show 5ba860b2`'s exact diff of
     `selectSpeculativeWriteGroup`'s `excludedReason` computation.
   - Provenance (issue refs, decision IDs) used freely here per the docs/decisions/ exemption —
     confirmed this file is NOT one of the six provenance-banned agent-facing prompt surfaces.

### Verification (run from the leg)

- `node scripts/test-route-reachability.js` — **PASS**, 185 assertions (unchanged assertion
  count; T8/T9 pins re-verified present + literal-intact on all six surfaces post-edit).
- `node scripts/validate-workflow-contracts.js` — **PASS** ("Workflow contract validation
  passed").
- `node scripts/validate-kaola-workflow-contracts.js` — **PASS** ("Kaola-Workflow Codex contract
  validation passed").
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` —
  **PASS** ("Kaola-Workflow GitLab contract validation passed").
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` —
  **PASS** ("Kaola-Workflow Gitea contract validation passed").
- Provenance scan (`grep -nE '#[0-9]+|D-[0-9]{3}-[0-9]{2}'`) over all six plan-run surfaces —
  **zero hits** (clean before my edit, clean after).
- `git status --porcelain` in the leg — exactly the 8 declared files (6 modified, 1 modified
  card, 1 new ADR); no other file touched.
- Cross-surface parity: `diff` of the touched CARD-through-first-bullet block across all six
  files (using `commands/kaola-workflow-plan-run.md` as the reference) — **byte-identical** on
  all five comparisons.
- Markdown fence-count sanity (even `\`\`\`` count) on both new/changed docs — OK (card: 12,
  ADR: 0 — no fenced code in the ADR).

### Deviations from the task brief

None. All 8 files match the frozen declared write set exactly; no scope was added or dropped.
Note for the record (not a deviation, an observed pre-existing gap outside my write set): the
`gate_not_complete` operator-hint string in `scripts/kaola-workflow-adaptive-node.js`
(OPERATOR_HINT_REGISTRY, ~line 175) still only names `speculative_open_policy: consent` and does
not mention `auto` — that file is n1's write set (already `complete`), not mine, so I did not
touch it; the card and six-surface prose describe the accurate tier-invariant behavior
(`open-next` refuses `gate_not_complete` identically at both `auto` and `consent`) without
quoting that stale hint string, so nothing I wrote contradicts it. Flagging for n4/n5 visibility.
