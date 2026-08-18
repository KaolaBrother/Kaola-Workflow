# Documentation docking — bundle-1001-1002

Docked by the orchestrator inline rather than dispatched to `doc-updater`. Stated because the
choice was deliberate: both surfaces changed here are ones `doc-updater` has previously fabricated
against (an API envelope shape and a CLI mode description), and the standing rule for those is to
dictate exact text or diff against real `--json` output. Every figure below was transcribed from a
command run in this session, not recalled.

## Changed files reviewed

Commit `137e2108`, 17 files, +651/-6.

| file | change | doc consequence |
|---|---|---|
| `templates/routing/slots.js` | new `fz-gapsweep-scan` splice, 3 forge keys | yes — CLI/mode description |
| `templates/routing/finalize.skeleton.md` | Step 6 lead-in + resolver/scan block | rendered surfaces only |
| `commands/kaola-workflow-finalize.md` + 5 plugin surfaces | regenerated, no hand edits | none (generated) |
| `scripts/kaola-workflow-claim.js` + 3 port copies | `stale_paths`/`stale_kind`/`stale_paths_truncated` at 2 sites | yes — `--check` envelope contract |
| `scripts/test-route-reachability.js` | T6c surface pin | none |
| `scripts/test-finalize-door.js` | T15a–e consumer pins | none |
| `scripts/simulate-workflow-walkthrough.js` | `testStaleDiagnosticsPortedToAllEditions1002` | none |
| `docs/api.md` | envelope fields + gap-sweep mode text | is the docking |
| `CHANGELOG.md` | `[Unreleased]` entries for both issues | is the docking |

## Documents checked

- **`docs/api.md` — UPDATED, two sections.** The `finalize --check` `checks` list now names
  `stale_paths`, `stale_kind` and `stale_paths_truncated` as conditional, states that `validation`
  remains the bare classification token, and carries an explicit **`stale_paths` is not
  `changed_paths`** warning — the two answer different questions (drift since the receipt vs. branch
  against base) and disagreed in the run that filed #1002. Field names transcribed from the shipped
  producer, not invented: they are the finding's own keys from `computeChainsStaleDiagnostics`.
  The gap-sweep section now states the two modes are exclusive, that the gate consumes without
  producing, that it refuses `artifact_missing` + exit 1 against no artifact, and that the surface
  therefore splices both — scan in Step 6, gate in Step 7.
- **`CHANGELOG.md` — UPDATED.** #1001 under `### Added` (no code repaired; `gap-sweep.js` is
  byte-untouched), #1002 under `### Fixed`. Both written from measurements, not from the issue text:
  #1001 states plainly that the gate fails closed and recent-40 harm is 0/40; #1002 states plainly
  that it is not a regression of #648.
- **`README.md` — NO IMPACT.** Overview and install only. Neither the installed command surface
  (still three commands) nor any install flag changed.
- **`docs/architecture.md` — NO IMPACT.** No structural change: one slot added to an existing
  registry, one field group added to an existing envelope. No new script, no new module boundary.
- **`docs/conventions.md` — NO IMPACT, checked deliberately.** Its `:505-535` three-step MUST is
  what #1001 was measured against and it remains accurate; the surface now carries steps 1 and 3
  rather than 3 alone. No divergence to reconcile, so no edit — "one rule, one wording" is satisfied
  by the doc describing what the surface now does.
- **`docs/workflow-state-contract.md` — NO IMPACT.** No claim-record field changed.
- **`.env.example` — NO IMPACT.** No environment variable added or read.
- **`docs/decisions/` — NO IMPACT.** Neither change alters a decision of record. #1001 implements
  what `conventions.md` already mandated; #1002 restores diagnostics #648 already decided to ship.
- **Issue comments** — premise corrections for both issues are posted at Step 7, before closure,
  per the standing rule against closing quietly against text now known to be wrong.

## Gaps found and fixed

1. `docs/api.md` documented neither `stale_paths` nor `stale_kind` on any finalize consumer —
   pre-existing, and it would have become actively wrong once the fields shipped. Fixed.
2. The gap-sweep API section described two modes without stating they are exclusive or that the
   gate is a pure consumer. That omission is the doc-level twin of #1001's surface-level one.
   Fixed.

## No-impact reasons recorded

Every document in the map above is listed with an explicit verdict; none was skipped silently.

## Verdict: DOCKED

---

## Addendum — #1003, adopted into this run after the original docking

`scripts/kaola-workflow-adaptive-schema.js` (+ its 3 byte-identical edition copies): the
`chains_stale` operator hint became `stale_kind`-aware, rendered inside
`attachChainsStaleDiagnostics`.

- **`CHANGELOG.md` — UPDATED**, under `### Added`. Filed as Added rather than Fixed deliberately:
  the previous sentence was true, merely uninformative, so nothing in code was repaired. The entry
  states the load-bearing constraint (every arm still commands the regenerate, because test-consumed
  prose is inside the hash by construction) rather than only the capability.
- **`docs/api.md` — NO IMPACT, checked.** `operator_hint` is documented as a *field* and never by
  its text: `:583` and `:598-599` render it as `"operator_hint": "..."`. No documented string
  changed, and no envelope key was added or removed by #1003. Recorded rather than assumed — the
  file was grepped for `operator_hint` and for the literal old sentence.
- **`docs/conventions.md`, `docs/architecture.md`, `README.md` — NO IMPACT.** No rule, structure or
  install surface moved; this is one template body and one re-render call.
- **Prompt surfaces — NO IMPACT.** The hint is emitted by a script at runtime, not spliced from
  `templates/routing/`; `generate-routing-surfaces.js --check` re-verified at all 18 surfaces.

## Verdict (addendum): DOCKED
