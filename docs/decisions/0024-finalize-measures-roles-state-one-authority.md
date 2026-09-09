# ADR 0024 — Finalize measures; roles state positioning; one authority per constant

Status: Accepted · Date: 2026-09-09 · Issue: #1054

## Context

A Codex/Fable joint read-only audit (baseline `662bcd339c6efef5f0e29dbe13f33189a27f2848`, three
Luna Max and three Sonnet research branches per side, cross-reviewed) found four related instances
of the same shape: a script or a prose surface judging an agent's own honest record by parsing it,
rather than trusting the orchestrator that wrote it and the evidence it points to.

1. **Finalize read the orchestrator's own records as machine interfaces.** `probeMissionListCoherence`
   counted the Mission List's items and flagged any that carried an outcome while not `status: done`,
   landing the count in a `## Mission List` finalize measurement. `kaola-workflow-gap-sweep.js --check`
   required every machine-swept signal to be hand-mapped into a strict-grammar `## Run gaps` section of
   `finalization-summary.md`, and (#653) the reverse direction too. Equivalent, legitimate expressions
   of the same disposition — bullets, free prose, a table — were accepted, refused, or silently misread
   as zero depending on shape alone; the same claimed set could log a `net_backlog_delta` of `+1`
   (canonical bullets) or `-1` (free prose) depending only on how the orchestrator happened to format
   the same two follow-ups. Separately,
   `kaola-workflow-ledger-compare.js`'s Step-8a mirror guard (`countComplete`) counted `status: done`
   lines rather than reading content: it read a real, finished table-form Mission List as zero on both
   sides (a line-regex applied to a table) and reported a copy SAFE that would have erased three of
   seven finished rows — reproduced live against `kaola-workflow/archive/bundle-1053/mission-list.md`.
2. **Role contracts carried procedure written for an earlier, less capable model generation** — fixed
   phases, numeric thresholds, a closed verification-tier vocabulary, default shell commands, and a
   column-zero `finding: id=` / `verdict: pass` review-record format — instead of stating what result
   the role owns and what makes that result trustworthy. Six of the fourteen bodies carried the largest
   share of this: shared runs of 136–400 consecutive words verbatim from an externally sourced prompt
   pack, framed as if still current when the last such measurement predates several major redesigns.
3. **The same constant existed in more than one place with no single authoring source.** Codex profile
   schema (`MANIFEST_BASENAME`, `RETIRED_PROFILE_FILES`, `EFFORT_VALUES`, `validateProfileText`) was
   hand-declared separately in `kaola-workflow-codex-preflight.js` and `install-codex-agent-profiles.js`
   (four and three tree copies respectively), able to drift silently between edits. Role→model defaults
   (`DEFAULT_AGENT_MODELS` in `kaola-workflow-resolve-agent-model.js`) were a hand-kept map with no
   check binding them to the generator's own real authority (`behavior-contracts.json` `intent_class`
   through `runtime-capabilities.json`'s tier bindings), so the two could silently disagree.
4. **Contract validators pinned wording rather than the behavior or the interface it protected.** A
   subtraction probe over every candidate (mutate the exact needle out of the rendered surface, run
   `test-route-reachability.js`, restore, record RED/GREEN) found 80 assertions across
   `validate-workflow-contracts.js` and `validate-kaola-workflow-contracts.js` whose loss was already
   caught by `templates/routing/required-blocks.js`'s own manifest-coverage check — a second, redundant
   pin on the same fact. Others pinned the retired review-record format and role-body phrasing verbatim,
   rather than the concept a rewritten body still had to state.

## Decision

1. **Finalize measures machine facts; the orchestrator reads records.** Finalize keeps exactly two
   durable measurements — `## Validation` (the chain-receipt finding) and `## Changed Paths` (the
   branch diff) — and adds no reconciliation gate over an orchestrator-authored record. It no longer
   parses the Mission List, `finalization-summary.md`'s prose, or any hand-written section grammar as a
   machine interface. `kaola-workflow-gap-sweep.js` survives only as an optional, non-gating diagnostic
   (`--project`, `--json`, `--output`): it scans machine-observable signals it can actually see
   (`chain-receipt.json`'s `accepted_red` entries) and settles nothing on its own. The archive keeps one
   docking-evidence sidecar, `.cache/doc-docking.md` (`.cache/doc-updater.md` retired). The record mirror
   between a linked worktree and the main checkout is guarded by **content**, not a count:
   `compareLedgers` returns `first_sync` / `identical` / `content_diverged` (with a bounded diff), and a
   divergence now refuses `mirror_sync_failed` outright — the transaction no longer guesses a repair
   direction by copying the worktree's copy over main's, since #1053's own run record shows that
   direction is not universally the correct one.
2. **A role body states positioning, deliverable, unique custody, and stop condition — nothing else is
   ritual.** No fixed phase, numeric threshold, verification-tier menu, default command, or shape is
   prescribed in prose the current model generation can decide for itself. A reviewer delivers
   natural-language findings a reader can verify; `.cache/final-validation.md`'s verdict comes only from
   validation that was actually executed, never from a role-body attestation format. Shared boundaries
   (the honesty and evidence obligations every role already carries) stay in the machine-global contract
   and `AGENTS.md`, not duplicated into each body. Where a runtime's compact-recovery render is that
   host's *only* always-loaded carrier of the dispatch/adapter contract (Grok, Cursor), the full block
   stays; every other runtime's recovery render collapses to a one-sentence pointer at the full
   Next/Finalize reload it will carry again. A machine field survives in a generated carrier only where
   a real consumer reads it — Claude's YAML frontmatter already carries the hash fields, so its prose
   appendix drops the duplicate; every runtime without an equivalent frontmatter keeps the full block.
3. **One constant, one authoring source, with a generated or required mirror where a second copy is
   structurally necessary.** Codex profile-schema constants and the pinned tier rosters move into
   `kaola-workflow-adaptive-schema.js`, the existing byte-identical cross-edition anchor; consumers
   `require()` them instead of redeclaring them. `DEFAULT_AGENT_MODELS` becomes a generated marked block
   in `kaola-workflow-resolve-agent-model.js`, written and checked by `generate-agent-profiles.js`,
   derived from the same `behavior-contracts.json` / `runtime-capabilities.json` lookup the generator
   already uses per role, since the resolver itself stays dependency-free so an installed runtime can
   read its metadata without a schema sibling on disk. A remaining duplication is converged only when a
   structural reason for the second copy no longer holds, and is otherwise recorded with its reason
   rather than converged by fiat.
4. **A validator checks an interface or a generation guarantee, not a sentence.** An assertion proven
   redundant against a manifest-driven coverage check is removed, not kept as a second witness of the
   same fact. A wording pin tied to retired procedure (the tier-name vocabulary, the column-zero review
   format) is replaced by a concept-level check against the role's current, real wording — still able to
   fail if the concept the role must still deliver disappears, but no longer coupled to one exact
   phrasing.
5. **Source classification is measured, not asserted.** `templates/agents/provenance.json` records
   `source_kind: kaola_authored` for all fourteen current role contracts. Six keep a `history` record
   naming their retired origin (Everything Claude Code, MIT, a pinned commit) and the measurement that
   grounds "no longer derived": the rewritten bodies share zero eight-word sequences and at most a
   four-word run with the pinned upstream files, against the pre-rewrite bodies' 15–73% shared 8-word
   shingles and 136–400-word verbatim runs. Borrowing an idea is not reusing text or code; classification
   follows what the current content actually retains, not what a file's history implies.

## Consequences

- An orchestrator can record a run's outcome in whatever prose shape actually communicates it —
  bullets, a table, free text — without a parser silently misreading the shape as zero, and without a
  format choice changing a recorded statistic.
- A stray `## Mission List` or `## Run gaps` heading in an old archived summary is inert; nothing reads
  it as a gate input any more. `kaola-workflow-gap-sweep.js --check`, `--summary`, `--offline`, and
  `.cache/run-gaps-manual.md` are gone; a caller that still invokes `--check` gets the same "unknown
  argument" refusal as any other retired flag.
- A finalize mirror divergence between a linked worktree and main now always stops for the
  orchestrator to resolve — get the merge correct, resynchronize, or choose a direction deliberately —
  instead of the transaction silently guessing "worktree wins."
- Role bodies are markedly smaller across the board (685–1,001 characters across all fourteen roles,
  were 1,170–8,832) and can be extended with a new fact without also carrying the facts every other
  role already states in the shared machine-global contract.
- Editing a Codex profile-schema constant or a role's default model now requires editing exactly one
  file (plus, for the schema constants, running the existing propagator); a validator or an installer
  that used to carry its own copy will fail loudly if it falls out of sync with the one authority,
  rather than silently drifting.
- A validator failure now names either a real interface break or a real behavioral regression; it does
  not also fire on a cosmetic rewording of a role's own prose.
- `README.md`'s license and capability framing, and `docs/agents-source.md`'s provenance sections, no
  longer read as if the current role contracts are derived from or scored against an external prompt
  pack; see `docs/agents-source.md` for the measurement and the historical origin record it still
  preserves.

## Withdrawn

Three shapes considered and rejected during this run, kept here so they are not silently
re-proposed:

- **A dual-carrier parser** that would have widened `parseGapSection` to tolerate a table or a
  qualified heading, so more prose shapes would parse instead of misreading as zero. Rejected: widening
  a parser to chase every legitimate shape is re-authoring the same coupling with a longer tolerance
  list, not removing it — decision 1 removes the parse step instead.
- **A semantic-count guard** that would have kept a `## Mission List` / backlog-delta statistic but
  computed it more carefully (e.g. content-aware counting instead of a line regex). Rejected for the
  same reason `compareLedgers` moved to content comparison rather than a smarter count: a statistic
  derived by parsing a human record is a second, format-dependent copy of a fact the record already
  states in prose, and it re-introduces exactly the shape-dependent misreading this decision removes.
- **A reviewer machine-field protocol** — keeping the column-zero `finding: id=` / `verdict: pass`
  format for reviewer bodies so a script could parse findings mechanically. Rejected: no production
  code reads that format (`parseRecordedVerdict`'s only real consumer is `.cache/final-validation.md`,
  a different, still-live machine interface); a reviewer's findings are read by the orchestrator and by
  the owner of the flagged work, not by a parser, so requiring a rigid row format bought no consumer and
  cost every reviewer body a ritual section.

## Supersession

This decision retires the mechanism [D-435-01](D-435-01.md) built (the gap-sweep `--check` gate and
its six-surface wiring) and the reverse-containment extension in [D-653-01](D-653-01.md) §D — both
records are historical: they describe why the gate was built and how it worked, not current behavior.
[D-676-01](D-676-01.md)'s fixed-name sidecar exemption list is narrowed from five names to three
(`final-validation.md`, `selection-evidence.md`, `doc-docking.md`); `run-gaps-manual.md` and
`doc-updater.md` are no longer produced. D-653-01's sections A (attestation persistence), B
(sink-journal disposal), and C (candidate-hash binding) are unaffected and remain active decisions.
[ADR 0017](0017-the-mission-list.md)'s watch-list row on a `## Run gaps` section shaped so the scanner
cannot read it is moot for finalize: the scanner it describes (`parseGapSection`) no longer gates
anything, so the row's failure class can no longer arm against finalization; it remains accurate
history of why the grammar was stated as it was. ADR 0017's own Mission List design (the four fields,
three write moments, no required script) is unchanged — this decision is about what finalize does with
the file, not what the file is.

## Pointers

The run record for this decision — the joint 31-item audit, the per-mission implementation and
acceptance evidence, the source-classification measurement, and the RED/GREEN proof for every
rewritten test — is archived at `kaola-workflow/archive/bundle-1054/.cache/` after this run's sink.

## Rejected alternatives

- **Keep the Mission List statistic but make it opt-in.** Rejected: an opt-in machine gate over a
  human record still couples finalize to one prose shape whenever it is turned on, and a silently-off
  gate is a worse trap than no gate.
- **Keep both the old and the new role-body style, migrating one role at a time across releases.**
  Rejected: the fixed-phase procedure, numeric-threshold ritual, and column-zero review format that
  made the old bodies long were the same handful of patterns repeated across every role, not a
  property of any one role's content — there was no per-role increment that would have reduced the
  risk of a single rewrite pass.
- **Version the Codex profile-schema constants instead of consolidating them.** Rejected: versioning
  solves a compatibility problem this issue does not have — every consumer in this repository is built
  and shipped together; a single authoring source with a propagator is simpler and already the pattern
  every other forge-neutral constant in `kaola-workflow-adaptive-schema.js` uses.
