evidence-binding: n5-docs 541c6df01c8a

## Task

Record durable-contract documentation for the two bug fixes landed on this branch since
`866421aa`: #617 (an issue could close while its merge sink never actually published the
implementation — fixed via state-derived close deferral, a `git merge-base --is-ancestor` wiring
of the previously-declared-but-unused `remote-closed-after-publish` closure invariant, a
standalone `verify-sink` audit subcommand, and reordering `SINK_STEPS` so `closure` runs after
`push_main`) and #618 (chain-receipt greenness failed open on a signal-killed child and on an
empty `chains[]` receipt — fixed via fail-closed exit-code mapping in
`kaola-workflow-run-chains.js` and a typed `chains_empty` refusal in
`kaola-workflow-plan-validator.js --finalize-check`).

Grounded the write in the actual landed diff, not the task summary alone:
`git diff 866421aa HEAD -- scripts/kaola-workflow-sink-merge.js scripts/kaola-workflow-claim.js
scripts/kaola-workflow-closure-contract.js scripts/kaola-workflow-run-chains.js
scripts/kaola-workflow-plan-validator.js` (plus a supplementary look at `package.json` and
`scripts/test-run-chains.js`/`scripts/test-bundle-finalize.js` for the wiring and test-coverage
claims made in the task description, and `docs/api.md` read-only for cross-reference accuracy —
not edited, it is outside the declared write set).

## Files written (both in the declared write set; nothing else touched)

### `docs/decisions/D-617-01.md` (new)

Followed the existing ADR convention (checked `D-608-01.md`, `D-615-01.md`, `D-514-01.md` for
format/style). Header carries `Date / Status / Issue / Related` exactly like the recent examples;
`Issue:` names #617 as primary with #618 as the companion fix in the same bundle (mirroring the
`D-514-01.md` precedent for a bundled non-primary issue reference). Body:

- **Context** — one paragraph on the 2026-07-06 incident (issue closed, ~3000-line implementation
  never merged) plus the independently-found chain-receipt fail-open gap, stated at decision-record
  level (enough for a future reader, not a full incident narrative).
- **Decision** — five numbered arms matching the task's (a)-(e): state-derived `mergeLaneDeferred`
  in `cmdFinalize`; the `checkClosureInvariants(root, receipt, archiveDest, opts)` fourth-parameter
  wiring of `remote-closed-after-publish` via `git merge-base --is-ancestor`; the `SINK_STEPS`
  reorder (`closure` moved to run last, after `push_main`) plus the `closure` step's own hard
  re-check immediately before closing; the new `verify-sink` standalone audit subcommand; and the
  #618 fail-closed exit-code mapping (signal death ⇒ always `exitCode: 1`, `signal` field added) +
  the `chains_empty` typed refusal in `--finalize-check`, plus `test-run-chains.js` now wired into
  `test:kaola-workflow:claude`.
- **Consequences** — notes the double defense (ordering + hard gate) is deliberate redundancy, that
  `verify-sink` gives an independent audit path, and that `docs/api.md`'s existing prose describing
  `remote-closed-after-publish` as "intentionally deferred to issue #165" (line ~2098) is now STALE
  given this fix — flagged as a known follow-up gap, NOT fixed here because `docs/api.md` is outside
  this node's declared write set.
- **Non-goals** / **Alternatives considered** — sections explaining why a post-hoc reconciliation
  sweep was rejected (this project's #501 "CI/CD is not a gate" posture: no external schedule to
  lean on) and why the ancestor check alone (without reordering `SINK_STEPS`) would not have closed
  the gap — a merge-then-not-yet-pushed window would still pass an ancestor check against the local
  ref before #617's reorder.

Provenance (`#617`, `#618`, `#164`, `#429`, etc.) is intentionally present throughout — this file
lives in `docs/decisions/`, one of the two surfaces (with `CHANGELOG.md`) the project's
"provenance out of agent-facing prompts" rule explicitly carves out as the *correct* home for issue
references, not an agent-facing prompt/skill/command.

### `docs/workflow-state-contract.md` (updated in place)

Read the whole file first to fit additions into its existing structure/conventions (bullet-in-list
style, `#NNN` provenance already used throughout this file, cross-references to
`docs/api.md § <section>` and `docs/decisions/D-NNN-01.md`). Two additive bullets, no restructuring:

1. In the "Key `.cache/` entries" list (under the `.cache/` files bullet, after `barrier-open-<id>`)
   — a new `chain-receipt.json` bullet stating the #618 fail-closed facts: signal-killed children on
   both the sync and async dispatch paths now always map to `exitCode: 1` (never a false-green `0`)
   with a new `signal` field recording the terminating signal name; and an empty `chains[]` receipt
   now trips a typed `chains_empty` refusal in `--finalize-check`, precedence-ordered between
   `chains_stale` and `chains_red`. Cross-references `docs/api.md § kaola-workflow-run-chains.js`
   (verified this is the actual section header text, not a guessed heading) for the full schema and
   `docs/decisions/D-617-01.md` for the design record.
2. In the "Sink-receipt schema extensions" list (immediately after the existing `closed_issues`
   (#592) bullet) — a new `remote_closed_after_publish: "verified" | "failed"` bullet documenting
   the field, when it is populated vs. left unset (the `cmdFinalize` merge-lane no-op case vs. the
   `sink-merge` verification case), and the `SINK_STEPS` closure-last reorder in the same paragraph
   since both facts describe the same #617 fix and belong together in this file's existing style
   (the file already mixes a schema-field note with the mechanism it belongs to elsewhere, e.g. the
   `closed_issues` bullet's gate-widening note).

## Verification

- Re-read both diffs after editing to confirm every fact cited (function signature
  `checkClosureInvariants(root, receipt, archiveDest, opts)`, the exact `SINK_STEPS` before/after
  arrays, the `chains_empty` precedence position in the code comment at
  `kaola-workflow-plan-validator.js:2710`, the `signal` field wording in `run-chains.js`'s own
  schema comment) matches the actual landed code rather than the task summary paraphrase.
- Confirmed via `grep` that `verify-sink`, `remote_closed_after_publish`, and `chains_empty` were
  previously undocumented anywhere under `docs/` or `scripts/` comments outside the diff itself, so
  neither doc addition duplicates existing prose.
- Confirmed `docs/api.md` section header text (`### Script: kaola-workflow-run-chains.js (issue
  #432)`) before writing the cross-reference, rather than guessing a heading name.
- No CHANGELOG.md edit (reserved for the finalize sink node, per the task instructions).
- Both docs additions were judged necessary (not "smaller than expected") — the closure-ordering and
  chain fail-closed facts are genuinely new durable-state contract points, not already covered
  elsewhere in `docs/workflow-state-contract.md`.

## Verdict

Both declared-write-set files are written: `docs/decisions/D-617-01.md` (new ADR) and
`docs/workflow-state-contract.md` (two additive bullets, no restructuring). No file outside the
declared write set was modified.
