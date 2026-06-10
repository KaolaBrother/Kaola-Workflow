# Design: `map(<group>)` dynamic fan-out — runtime-expanded instances from a frozen template

**Date:** 2026-06-11
**Status:** Design (design-first deliverable for issue #379)
**Builds on:** `docs/investigations/2026-06-10-parallelism-redesign.md` §D7; the `select` precedent
(#263/#268/#271); the grammar-feature precedent #334; the running-set scheduler #377 (§D5).
**Sequencing:** implementation lands after #377. This document is the *design phase* the issue
asks for; no grammar code ships here.

---

## 0. Problem recap

Every node is enumerated at freeze: `plan_hash` covers the whole `## Nodes` table
(`plan-validator.js:605-618`) and the `cardinality` column is parsed-but-dead. Discovered work
— "apply X to each of the N editions", "fix each of the M sites the scout found" — cannot widen
a running plan; the planner must over-enumerate at freeze or burn a full repair-refreeze.

`select` (#263) already proved the pattern for **bounded runtime variability**: pre-enumerated
arms plus a `.cache` token that chooses among them, validated by `parseSelectorToken`
(`adaptive-schema.js:131-137`) and armed off via `close-and-open-next`'s selector path
(`adaptive-node.js:1038-1063`). `map` is its **width generalization**: one template row expands
at runtime into K disjoint instances chosen by a generator node's `.cache` output.

## 1. The shape, end to end

```
## Nodes
| id        | role        | depends_on | declared_write_set            | cardinality | shape         |
| scout     | code-explorer | —        | —                             | 1           | sequence      |
| port      | implementer | scout      | plugins/{instance}/x.js       | map         | map(scout)    |
| review    | code-reviewer | port     | —                             | 1           | sequence      |
| finalize  | finalize    | review     | CHANGELOG.md                  | 1           | sequence      |
```

- `port` is a **template row**: `shape = map(<generator-id>)`, `cardinality = map`, and a
  `declared_write_set` **pattern** carrying exactly one `{instance}` placeholder.
- `scout` is the **generator**: a read-only node that, in its evidence
  `.cache/scout.md`, emits `map: <token>` lines (one per instance) — the parser sibling of
  `parseSelectorToken`.
- At runtime, after `scout` closes, `adaptive-node.js expand-map --node-id port` reads the
  tokens, substitutes the placeholder, validates, and appends K **instance rows** to a new
  `## Map Expansions` section **outside** the `plan_hash`, plus their ledger rows. From that
  point the instances schedule like any other ready nodes (#377), write instances under
  containment (#376).

## 2. Why expansions live OUTSIDE `plan_hash`

`plan_hash` covers `## Meta` + `## Nodes` only (validator:605-618). The `## Node Ledger` is
already the established precedent for **runtime-mutable state under a frozen plan** — it is
appended/spliced every node lifecycle without re-freezing. `## Map Expansions` joins it as a
second hash-exempt, runtime-appended section. The **template row stays inside the hash** (so the
frozen plan's post-dominance/cycle/sink proofs cover the template), and the expansion is a
deterministic function of (frozen template row, generator `.cache` tokens) — reproducible on
resume, never re-frozen.

## 3. G-MAP validator rules (freeze-time, over the template)

A new validator rule family `G-MAP`, checked during `validatePlan` when a node's parsed shape is
`map(...)`:

1. **Template legality.**
   - `shape` parses as `map(<id>)` via an extended `parseShape` (today's closed library is the
     three shapes `sequence` / `gate` / `select`; `map` is the fourth). The `<id>` must name an
     existing node.
   - `cardinality` cell MUST be the literal `map` (the dead column finally gets one legal
     non-`1` value; any other non-integer stays a parse error).
   - `declared_write_set` MUST contain **exactly one** `{instance}` placeholder token and MUST
     NOT be `—` (a write template with no per-instance variation is a planning error — it would
     make all instances exact-overlap RED at expansion).
   - The template row participates in the DAG like any node for **edges** (post-dominance,
     cycle, unique-sink) — see §5.

2. **Generator typing.**
   - The referenced generator node MUST be **read-only** (`role ∉ WRITE_ROLES`). A write-role
     generator is an explicit **non-goal** (it would couple width discovery to a mutation and
     defeat the deterministic-expansion property). Refusal token: `map_generator_not_readonly`.
   - The generator MUST be an **ancestor** of the template (`depends_on` chain) — the tokens
     must exist before expansion. Refusal: `map_generator_not_upstream`.

3. **Placeholder grammar.**
   - `{instance}` is the only legal placeholder; the substituted value is a token matched by
     `^[A-Za-z0-9._-]+$` (same character class the project already trusts for project tags /
     node ids — no path separators, no `..`, no whitespace). A token failing this class refuses
     `map_token_illegal` at expansion (§4), never silently sanitized.

4. **Single-level only.**
   - A `map` template MUST NOT depend (transitively) on another `map` template's instances, and
     its generator MUST NOT itself be a `map` template. **Nested maps are a non-goal**; the
     freeze-time check refuses `map_nested` if a `map` node's ancestor set contains another `map`
     template. (Instances of a *different*, already-expanded map may be ancestors via the ledger,
     but template→template nesting in the frozen graph is rejected.)

5. **Cardinality bound is declared, enforced at expansion.** `MAP_CAP` (new
   `adaptive-schema.js` const, **default 8**, env `KAOLA_MAP_CAP`, min-clamp 1 — same resolver
   shape as `resolveFanoutCap`) is the hard ceiling; freeze only checks the template is
   well-formed, not the count (count is unknown until the generator runs).

## 4. Expansion-time rules (`expand-map`, runtime)

`adaptive-node.js expand-map --node-id <template> --json` runs when the generator has closed and
the template is the next action. It is a **pure, idempotent** transaction:

1. Read generator evidence; parse `map: <token>` lines (sibling of `parseSelectorToken`).
2. Refuse `map_no_tokens` if zero tokens; `map_cap_exceeded` (typed, with `cap` + `requested`)
   if `count > MAP_CAP`.
3. Substitute `{instance}` → token in the template's `declared_write_set` for each token →
   per-instance write set.
4. **Disjointness-at-expansion:** the K substituted write sets MUST be pairwise disjoint under
   `classifier.disjointWriteSets` at the SAME verdict bar the static fan-out uses
   (`validator:744-746`): `red` → refuse `map_instances_overlap`; `yellow` (shared-infra) →
   refuse unless optimistic lanes (#378) are enabled, in which case it follows #378's `ask`
   governance. (Until #378, `yellow` refuses — conservative, matches today's static rule.)
5. Refuse `map_token_illegal` on any token failing the §3.3 character class **before** any
   write.
6. On success: append a `## Map Expansions` block recording `{template, generator, instances:
   [{id: "<template>__<token>", token, writeSet}], expandedAt}` and append one
   **pending** ledger row per instance. Instance id = `<templateId>__<token>` (double-underscore
   join; `token` already excludes `__`-ambiguous separators by §3.3... note: tokens MAY contain
   single `_`, so the join uses `__` and the un-join is "split on the template-id prefix", not
   "split on `__`").
7. Idempotency: re-running `expand-map` when `## Map Expansions` already carries this template's
   block is a no-op success (resume-safe), provided the recorded token set equals the current
   generator tokens; a **mismatch** refuses `map_expansion_drift` (the generator evidence
   changed after expansion — never silently re-expand).

Best-effort telemetry (#373): `expand-map` appends an `expanded` event to `node-timings.jsonl`.

## 5. Edge cloning & post-dominance (the key correctness argument)

Instances **clone the template's edges**: each instance inherits the template's `depends_on`
(the generator + any other upstreams) and every node that depended on the template now depends on
**all** instances (the template becomes a structural join point — its downstream waits for the
whole expansion, exactly as it would have waited for a hand-enumerated fan-out group).

Because the **template** is inside `plan_hash` and the freeze-time post-dominance gate already
proved that every write-bearing path from the template reaches the unique sink through the
required gates (`plan-validator.js:25-27, 881-907`), and instances only **substitute the write
set** (never add edges outside the template's edge set), **post-dominance over the template
covers every instance by construction**. No re-proof at expansion is needed for placement; only
the per-instance write-set disjointness (§4.4) is new.

## 6. `--resume-check` over a partially-expanded plan

`--resume-check` (validator) today recomputes `plan_hash` and confirms the ledger is consistent.
With maps:

- `plan_hash` is computed over `## Meta` + `## Nodes` **only** — the template row is hashed; the
  `## Map Expansions` section and instance ledger rows are **excluded** (same treatment as the
  ledger). So a partially-expanded plan still matches the frozen hash. ✔
- Added consistency check `resume-check --map`: for every `## Map Expansions` block, the recorded
  `template`/`generator` ids MUST still exist in `## Nodes` as a `map` template, and every
  recorded instance MUST have a ledger row (and vice-versa: no orphan instance ledger row without
  an expansions entry). A mismatch is a typed `resume_map_inconsistent` refusal — the same
  fail-closed posture as a tampered hash.
- An **un-expanded** template (generator not yet closed) is legal mid-run: the template ledger
  row is `pending`, no `## Map Expansions` block exists, `resume-check` passes. `next-action`
  treats an un-expanded `map` template as **not-ready-to-dispatch-as-work** but **ready-to-
  expand** once its generator closes (the executor calls `expand-map` instead of dispatching the
  template as a role).

## 7. Interaction with `--freeze --repair`

`--freeze --repair` (the in-flight plan-repair path) re-stamps `plan_hash` over the new
`## Nodes` while preserving the ledger (memory: "hash covers Meta+Nodes only"). With maps:

- Repair MAY add/edit/remove a **template** row (it is inside `## Nodes`) — re-freeze re-stamps
  the hash as usual.
- Repair MUST NOT hand-edit `## Map Expansions` or instance ledger rows (they are
  runtime-derived). The repair validator refuses `map_repair_touches_expansion` if the diff
  touches the expansions section or instance rows — the operator re-expands via `expand-map`, it
  is never authored.
- If a repair **removes** a template that has already expanded, repair refuses
  `map_repair_removes_expanded` unless its instances are first reconciled (ledger rows + barrier
  bases purged like a reopen) — symmetric with the reopen-node cleanup discipline.

## 8. How `--gate-verify` and whole-plan `--barrier-check` fold expansions in

- **`--gate-verify`** (Finalization): the post-dominance / reachability proof already holds over
  the template (§5). Gate-verify additionally confirms the **union** of write sets that crossed
  each gate **includes every substituted instance write set** — i.e. a reviewer node downstream
  of the template must post-dominate all instance writes. Because instances clone the template's
  downstream edges, this is automatic; gate-verify asserts it explicitly by treating each
  instance row as a write-bearing node under the template's gate.
- **Whole-plan `--barrier-check`** (Finalization sweep): the declared-write-set **union** the
  barrier diffs against MUST be the union over (static nodes) ∪ (every expanded instance's
  substituted write set), NOT the template's pattern (the pattern's literal `{instance}` path
  matches nothing). The barrier reads `## Map Expansions` to build the per-instance lanes; an
  instance write outside its substituted set fails the barrier exactly as a static node would.
- **Per-node `--barrier-check`** (running): each instance uses its own substituted write set and
  its own anchored baseline ref (#368/#377) — no template-level barrier for an expanded map.

## 9. MAP_CAP refusal shape (typed)

```json
{ "result": "refuse", "reason": "map_cap_exceeded", "template": "port",
  "cap": 8, "requested": 12 }
```
All map refusals follow the unified envelope (#355): `{result:'refuse', reason, ...extra}`,
last-line JSON, exit 1. Token vocabulary introduced: `map_generator_not_readonly`,
`map_generator_not_upstream`, `map_nested`, `map_no_tokens`, `map_cap_exceeded`,
`map_token_illegal`, `map_instances_overlap`, `map_expansion_drift`,
`resume_map_inconsistent`, `map_repair_touches_expansion`, `map_repair_removes_expanded`.

## 10. Explicit non-goals (locked)

- **Nested maps** — a map template depending on another map's instances, or a map generator that
  is itself a map template (§3.4). Rejected at freeze.
- **Write-role generators** — the generator is read-only only (§3.2).
- **Unbounded width** — `MAP_CAP` (default 8) is a hard ceiling; no env can disable it (min-clamp
  1, no "0 = unlimited").

## 11. Validator token pins that move (for the implementation PR)

- The closed shape-library pin (`sequence|gate|select`) becomes `sequence|gate|select|map` in all
  four contract validators — a single coordinated token-set edit (the #303 "anti-drift token to
  all 4 validators" discipline).
- The `cardinality` column pin (today "integer ≥ 1") widens to "integer ≥ 1 **or** `map`".
- New emission pins for the `## Map Expansions` heading and the `expand-map` subcommand name in
  the adaptive-node usage block (the #290 emission-pin pattern).

## 12. Open design questions deferred to the implementation issue

- Whether `next-action` should surface an un-expanded template as a distinct `readyToExpand`
  array (cleaner) or overload `readyPending` with an `expand:true` flag (smaller diff). Lean:
  distinct array, mirrors `readySet`/`readyPending` separation.
- Whether instance ids should be content-addressed (`<template>__<token>`) or ordinal
  (`<template>__0..K-1`). Lean: token-addressed for evidence-path readability and idempotent
  re-expansion; §4.6 un-join rule handles `_`-containing tokens.
