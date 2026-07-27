evidence-binding: n2-mechanism cb782b26822d
files_to_create: none
files_to_modify: scripts/kaola-workflow-adaptive-node.js (+ its 3 ports, n4) · scripts/test-adaptive-node.js (n3) · templates/routing/plan-run.skeleton.md + templates/routing/required-blocks.js + the 6 rendered plan-run surfaces (n5) · docs/api.md + CHANGELOG.md + docs/decisions/D-819-01.md (n6). This node writes NOTHING; the list is the binding scope this spec implies.
build_sequence: n3 authors the RED assertions in §5 → n4 implements §1–§4 in canonical `scripts/kaola-workflow-adaptive-node.js` then `npm run sync:editions` → n5 transcribes §6 into the skeleton + token table then `node scripts/generate-routing-surfaces.js --write` → n6 records the landed names → n7 runs the §5 mutation probe → n8 runs the four chains sequentially + `test-adaptive-node.js` unsharded.

# n2-mechanism — the binding design decision for issue 819

**Verdict: the mechanism is decidable and lands entirely inside the declared write sets. Role-profile
prose stays OUT of scope — the `## Design` boundary HOLDS, but its stated *reason* is factually wrong
and is corrected in §0. No scope expansion. No values call is escalated.**

Everything below is binding. `n3`, `n4`, `n5` implement it verbatim and re-decide nothing. Where I
measured a fact rather than reasoned to it, the measurement is quoted.

---

## §0 — The measurement that changed the design (read this first)

`## Design` and my own brief both assert that a column-0 `capability_gap:` key is "an existing,
shipped, cross-edition token" in the evidence file. **That is false, and I proved it against the
recorded run the issue cites.**

What IS shipped (verified): 14 of `agents/*.md` plus `scripts/generate-reviewer-profiles.js:431`
mandate the token form `capability_gap: <missing capability> — <required action>` **as the compact
summary return**. Nothing in any profile says it goes into the evidence file.

What the real gapping role actually did, from
`~/.codex/sessions/2026/07/27/rollout-2026-07-27T06-23-24-019fa086-*.jsonl` — line 115 is the child's
FINAL_ANSWER and line 145 is the orchestrator's hand `apply_patch` that reverted the body, so line 145's
`-` lines are the exact bytes that were on disk when P5 fired (quoted with a 2-space indent so this
file's own close-time token scan cannot mistake the quotation for this node's tokens):

```
  evidence-binding: n1-explore e411444ef7e9
  findings:
    outcome: "capability_gap: local text-file read capability -- the dispatch forbids executing commands, ..."
    facts:
      - "AGENTS.md requires CLAUDE.md to be read in full before repository action."
    unknowns:
      - "All requested issue-327 source, test, documentation, and Git-history findings remain unverified ..."
    validation_commands: []
  delegation_outcome: capability_gap
  <!-- findings: paste findings here -->
  findings: 
```

Three facts follow, and they are decisive:

1. **There is NO column-0 `capability_gap:` line.** The token appears only nested inside an indented
   `outcome:` value. A classifier keyed on a column-0 `capability_gap:` key **would have classified
   this body as a deliverable and refused** — the fix would not have fixed the observed defect.
2. **There IS a column-0 `delegation_outcome: capability_gap` line**, written unprompted. That key is
   an already-shipped, column-0, closed-vocabulary token this codebase already parses
   (`parseDelegationOutcome`, `adaptive-schema.js:3490`).
3. **Both column-0 `findings:` lines carry an EMPTY value.** The role delivered nothing.

`capability_gap` is deliberately NOT in `DELEGATION_OUTCOME_VOCABULARY`
(`['completed','returned_partial','interrupted_unresponsive','interrupted_obsolete']`), and
`checkEvidenceShape` (`adaptive-node.js:2752-2756`) refuses an out-of-vocabulary token at close time.
**That refusal must be preserved: a gap must never close a node.** We *read* the marker at substitute
time; we do not *admit* it at close time. Two gates, two verdicts, both fail-closed in their own
direction. **No shared constant changes**, so nothing reaches `kaola-workflow-adaptive-schema.js`
(which is in nobody's write set).

### Re-verification of the scope boundary (brief constraint)

**Role-profile prose stays out of scope. I am NOT invoking the stop-and-expand clause.** The boundary
holds for a different reason than `## Design` gives: the classifier accepts **both** typed markers,
one of which a real role produced unprompted, and it is **fail-closed** — a gap body in neither form
degrades to exactly today's behaviour (`substitute_node_closed` → consent halt), never to a wrong
success. No profile change is required for the fix to work on the observed case or any other.

Teaching the ~56 profile surfaces to emit a column-0 `capability_gap:` line in the *evidence file*
would upgrade the recovery from best-effort to deterministic. It is **not required, not in scope, and
is a run gap `n9` should FILE rather than absorb** (see §7).

---

## §1 — A1: the gap-versus-deliverable distinction

### Decision

**A typed-marker structural classifier inside `runSubstituteRole`, replacing the single
`hasEvidenceBodyBelowHeader()` boolean with a three-way classification. No prose matching, no
substring search of free text, no flag.**

Add two module-level constants next to `SUBSTITUTABLE_KINDS` (`adaptive-node.js:14734`):

```js
// The typed, column-0 markers by which a returning role states it could not perform the brief. Both
// forms are READ here and NEITHER is admitted at close: a gap may never close a node (the close-time
// delegation_outcome vocabulary deliberately excludes it), but it is exactly the state substitution
// exists to serve. Column-0 anchored like every other token key — an indented or quoted occurrence
// inside another token's value is prose, not a marker, and is deliberately not matched.
const CAPABILITY_GAP_MARKERS = Object.freeze([
  /^capability_gap:[ \t]*\S/m,
  /^delegation_outcome:[ \t]*capability_gap[ \t]*$/m,
]);
```

Add the classifier immediately below `hasEvidenceBodyBelowHeader` (which stays, unchanged, as the
`seeded` test):

```js
// classifyEvidenceBody — 'seeded' | 'capability_gap' | 'deliverable'.
//
// 'capability_gap' requires BOTH halves and the second is the load-bearing one: a typed marker AND
// no non-empty value for any content-bearing token the role's contract demands. A role can therefore
// only be classified as gapped by WITHHOLDING its whole deliverable. Stamping the marker onto real
// work does not launder it — that body is a deliverable and the swap is refused.
function classifyEvidenceBody(content, role) {
  if (!content || !hasEvidenceBodyBelowHeader(content)) return 'seeded';
  if (!CAPABILITY_GAP_MARKERS.some(re => re.test(content))) return 'deliverable';
  let ROLE_TOKEN_REGISTRY;
  try { ({ ROLE_TOKEN_REGISTRY } = require('./kaola-workflow-plan-validator')); }
  catch (_) { ROLE_TOKEN_REGISTRY = {}; }
  const row = (ROLE_TOKEN_REGISTRY && ROLE_TOKEN_REGISTRY[role]) || [];
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const tokenClass of row) {
    if (tokenClass === 'evidence-binding') continue;
    for (const alt of tokenClass.split('|')) {
      if (new RegExp('^' + esc(alt) + ':[ \\t]*(\\S.*)$', 'm').test(content)) return 'deliverable';
    }
  }
  return 'capability_gap';
}
```

`valuePresent`'s regex is copied verbatim from `checkEvidenceShape` (`adaptive-node.js:2926`) so the
two gates can never disagree about what "a token carries a value" means. Which registry row is used
is decided by the **frozen** role (`fromRole`) — P4 has already proven `fromRole` and `toRole` have
byte-identical rows, so the choice is provably immaterial; `fromRole` is the role that produced the
body.

Trace against the §0 body with `role = 'code-explorer'` (row `['evidence-binding','findings']`):
`hasEvidenceBodyBelowHeader` → true; marker 2 matches; `^findings:[ \t]*(\S.*)$` matches neither
occurrence (both empty) → **`capability_gap`**. Recovery unblocks. ✓

### How P5 continues to refuse a genuine deliverable

The `deliverable` arm returns the **byte-identical existing refusal** — same code
`substitute_node_closed`, same `detail` string, same fields — with one appended clause naming the
distinction (see §6.3). The ledger-status arm (`status !== 'pending' && status !== 'in_progress'`) is
**untouched** and runs *before* the classification, so a `complete` node with a gap body still refuses.

### Rejected alternative A — a column-0 `capability_gap:` key alone

Rejected on measurement, not taste: §0 shows it does not fire on the only real gap body on record.
Making it fire would require changing ~56 profile surfaces — a scope expansion, not a repair. The key
is *kept* as marker 1 because it costs one regex and is the form the profiles already mandate for the
return, so a role that does write it is served; it is simply not sufficient alone.

### Rejected alternative B — a `--reset-evidence` opt-in flag that force-clears any body

Rejected on integrity. A flag with no structural check behind it converts P5 from a guard into a
speed bump: an orchestrator that meets `substitute_node_closed` will reflexively re-run with the flag
and destroy real work. It also fails A1's second clause — the guard would no longer refuse a genuine
deliverable, it would merely complain once. The classifier gives A1 both clauses at once and leaves
**no override path at all**, which is the strictly stronger posture. (This also answers A2: see §2.)

---

## §2 — A2: who owns the reset, and why it is atomic

### Decision

**The surface is `substitute-role` itself — NO new flag and NO new subcommand.** The reset is a step
inside the existing subcommand's commit phase, performed only when §1 classified the body as
`capability_gap`. A2's "a subcommand owns it atomically" is satisfied by `substitute-role`.

Why not a separate subcommand: a standalone `reset-evidence` is a general-purpose "discard a node's
evidence" tool — a strictly larger and more dangerous capability than this defect needs, and it would
have to join five in-file registration lists (dispatch switch, `SPLIT_GUARDED_SUBCOMMANDS`,
`REPLAN_GUARDED_SUBCOMMANDS`, usage block, `OPERATOR_HINT_REGISTRY`), each a place to ship a mutator
unguarded. `substitute-role` is **already** in `SPLIT_GUARDED_SUBCOMMANDS` (`adaptive-node.js:103`)
and `REPLAN_GUARDED_SUBCOMMANDS` (`:117`), so the reset inherits the full guard prologue with zero new
registration. It is also only ever legitimate *as part of* the swap: the reset runs after P1–P4 have
proven a valid in-kind superset target exists, so it can never be "just discard this evidence".

### Mechanism — reuse `seedEvidenceFile`, do not write a new writer

```js
const nonce = readNonce(planPath, nodeId, readFile);   // .cache/barrier-base-<sanitized id>, first 12 chars
if (!nonce) return refuse('substitute_evidence_reset_failed', { … });
const reseed = seedEvidenceFile(planPath, nodeId, nonce, toRole, /* forceRotate */ true);
if (reseed && reseed.ok === false) return refuse('substitute_evidence_reset_failed', { … });
```

- **Crash atomicity**: `seedEvidenceFile`'s `forceRotate` branch (`:2270-2277`) calls
  `writeFileAtomicReplace` — tmp + fsync + rename. A torn rewrite is impossible; the prior file stays
  byte-intact on failure.
- **Fail-loud on failure**: the `forceRotate && hadExistingBody` catch arm (`:2292-2304`) already
  exists for exactly this case. It unlinks the stale body and returns `{ ok: false, reason:
  'evidence_seed_failed' }`. We map that to a refusal and write **no record**. Residual state is
  `evidence_unbound`, which is fail-closed.
- **Prior body**: destroyed, entirely, with no backup. Stated plainly in §4 as what P5 no longer
  guarantees.
- **Which role seeds the stubs**: `toRole` — the role about to be dispatched. Provably identical to
  seeding with `fromRole` today (`SUBSTITUTABLE_KINDS = {'producer'}`; no producer role is in
  `IMPLEMENT_ROLES`, so `upstreamReadStubIds` returns `[]` for both; `g4CertifierSeedContext` matches
  only `code-reviewer`/`security-reviewer`, so it is `null` for both; P4 forces identical registry
  rows). `toRole` is chosen so the code stays correct if `SUBSTITUTABLE_KINDS` ever widens.

### The nonce after the reset — stated plainly

**The reset RE-SEEDS WITH THE CURRENT BINDING. It does NOT rotate the nonce, and it does not touch the
barrier baseline.** Line 1 after the reset is byte-identical to line 1 before it.

The parameter is named `forceRotate`, but its effect is "re-seed the whole file"; the nonce written is
whatever is passed, and we pass the one already on disk. Why preserve:

- The nonce **is** the barrier baseline's SHA prefix (`readNonce`, `:9789`). Rotating it means
  re-recording the baseline, which re-snapshots the worktree mid-node and silently absorbs anything
  the gapped role wrote into the "before" picture — laundering an out-of-set write. Preserving keeps
  the barrier honest.
- The anti-replay rotation exists so a prior attempt's `verdict: pass` cannot survive into a new open.
  A gap body carries no verdict, and the full re-seed destroys the body anyway. There is nothing to
  replay.
- Preserving means the re-dispatched role's evidence closes against the binding the open recorded. A
  rotated nonce with an unchanged baseline would refuse `evidence_stale` at close — trading one wedge
  for another. **Test T13 (§5) pins exactly this.**

### New refusal code

`substitute_evidence_reset_failed` — ONE code covering both reset failure modes (no resolvable
baseline nonce; atomic re-seed failed). Fields: `node_id`, `from_role`, `to_role`, `detail`.

---

## §3 — A3: the task-identity derivation

### The rule

> **The Codex task identity is derived from the role that will actually be dispatched — the card's
> `agent_type` — not from the plan's frozen `role` cell. With no substitution on record the two are
> the same value, so the card is byte-identical to today's.**

### The change

`codexTaskNameForNode` (`:3054`) gains an OPTIONAL second parameter. One-arg callers are unaffected:

```js
function codexTaskNameForNode(nodeInfo, dispatchRole) {
  const id = nodeInfo && nodeInfo.id ? String(nodeInfo.id) : 'node';
  const frozen = nodeInfo && nodeInfo.role ? String(nodeInfo.role) : '';
  const role = (dispatchRole != null && String(dispatchRole) !== '') ? String(dispatchRole) : frozen;
  return sanitizeCodexTaskName(role ? id + '__' + role : id);
}
```

In `buildDispatch`, move the substitution resolution ABOVE the task-name computation (it is currently
at `:3118`, five lines below `:3113`), then:

```js
const substitution = resolveRoleSubstitution(ctx, nodeInfo);
const agentType = substitution ? substitution.to_role : nodeInfo.role;
const codexTaskName = codexTaskNameForNode(nodeInfo, agentType);
```

and set `agent_type: agentType` in the descriptor. Nothing else in `buildDispatch` moves.
`sanitizeCodexTaskName` is untouched.

### Why the two required properties both hold

- **Distinct after a substitution** — because §4's `substitute_self_noop` makes `to_role !== frozen`
  an *invariant of every record*, not a hope. The distinctness of the identity is therefore supplied
  by A4, not by the sanitizer. (The sanitizer must still be injective over the installed library;
  test T11 pins it.)
- **Stable across an idempotent replay** — because the name is a pure function of
  `(node id, active record's to_role)` and a replay writes no new row. There is no counter, no
  timestamp, no invocation-dependent input; a derivation with one would break crash-resume.

### Worked examples — node `n1-explore`, frozen role `code-explorer`

| # | substitution state | `agent_type` | `codex_task_name` |
|---|---|---|---|
| 1 | none on record | `code-explorer` | `n1_explore_code_explorer` |
| 2 | one record → `investigator` | `investigator` | `n1_explore_investigator` |
| 3 | idempotent replay of #2 | `investigator` | `n1_explore_investigator` (identical to #2) |
| 4 | second record → `knowledge-lookup` | `knowledge-lookup` | `n1_explore_knowledge_lookup` |

Row 1 is confirmed against the runtime: the recorded Codex failure names the agent path
`/root/n1_explore_code_explorer`. Note `sanitizeCodexTaskName` collapses the `__` separator to a
single `_` (`.replace(/_+/g,'_')`) — this is existing behaviour and must not be "fixed".

**Row 4 is illustrative and needs a fixture manifest.** In the shipped library exactly ONE
substitution is legal: `code-explorer → investigator`. (Producer kind = `code-explorer`, `planner`,
`knowledge-lookup`, `code-architect`, `investigator`; P4 identical-token-contract admits only the
`code-explorer`/`investigator` pair, both `['evidence-binding','findings']`; P3 superset admits only
that direction, since `code-explorer` lacks `Bash`.) `n3`: for row 4 either inject a fixture
registry/manifest or assert the derivation directly via `codexTaskNameForNode` — do not expect a
second legal `runSubstituteRole` call from the real library.

### Deliberate non-changes

- `dispatchSummarySegments` (`:3303`) keeps emitting `role=<d.role>` — the FROZEN role. Its shape
  `opened=<node-id> role=<role> task=<codex_task_name> …` is pinned by `assertIncludes` in three
  contract validators that are in **nobody's** write set. Do not touch it. The card already carries
  `agent_type` + `agent_type_frozen`; §6 makes the asymmetry explicit in prose instead.
- `resolveCodexDispatchMode`, `sanitizeCodexTaskName`, and every other card key are unchanged.

---

## §4 — A4: the self-substitution refusal

### Decision

Refusal code: **`substitute_self_noop`**. Position: **P0 — the first predicate after the node lookup
resolves `fromRole`, before P1 and before the idempotent-replay branch.**

```js
// P0 — a swap to the role already frozen is a no-op with a durable footprint: it records a row that
// means nothing, and it destroys the one property the dispatch identity depends on (a substituted
// node must present an identity distinct from the one already consumed). Refuse before any read of
// the manifest, the substitution store, or the evidence file.
if (fromRole === toRole) {
  return refuse('substitute_self_noop', {
    node_id: nodeId, from_role: fromRole, to_role: toRole,
    detail: 'role "' + toRole + '" is already the frozen role for "' + nodeId +
      '"; a substitution must name a DIFFERENT in-kind role',
  });
}
```

`fromRole` is always `node.role` — the frozen cell — so this also catches the observed *revert* case
(an active record to `investigator`, then `--to-role code-explorer`), which is how the meaningless
row in the issue was produced.

### Ordering, and why it must be P0

The replay branch (`:14800-14807`) returns `ok` before P2–P5 run. Placing P0 after it would let a
legacy self-substitution row on disk replay to `ok` forever. P0 first makes the refusal **total**: no
path — fresh, replay, or legacy-residue — can return `ok` on a self-substitution or write a row.
Consequence, accepted deliberately: a `--to-role <frozenRole>` call whose frozen role has no manifest
row now refuses `substitute_self_noop` instead of `substitute_unknown_role`. The self-ness is the more
specific defect and the precedence order is the more useful one.

### What a caller sees

```json
{"result":"refuse","reason":"substitute_self_noop","node_id":"n1-explore",
 "from_role":"code-explorer","to_role":"code-explorer",
 "detail":"role \"code-explorer\" is already the frozen role for \"n1-explore\"; a substitution must name a DIFFERENT in-kind role",
 "operator_hint":"…"}
```

Exit code 1, `.cache/role-substitutions.json` **not created and not modified**, evidence file
untouched.

---

## §4b — The full rewritten guard order for `runSubstituteRole` (binding for `n4`)

Every guard is **pure**: a refused call must be a byte-for-byte no-op on disk. All side effects live
in one commit phase at the end. This is the codebase's existing discipline (see `runReopenNode`'s
"refuse BEFORE any real side effect" orphan guard) and it is the reason the ordering below is not the
current one.

| step | check | refusal | change |
|---|---|---|---|
| 0 | `--node-id`, `--to-role` present | `missing_node_id` / `missing_to_role` | unchanged |
| 1 | plan readable; node in plan → `fromRole = node.role` | `plan_unreadable` / `unknown_node` | unchanged |
| **P0** | `fromRole !== toRole` | **`substitute_self_noop`** | **NEW** |
| P1 | target and source both in `ROLE_CAPABILITY_MANIFEST` | `substitute_unknown_role` | unchanged |
| P2 | same kind ∈ `SUBSTITUTABLE_KINDS` | `substitute_kind_mismatch` | **moved above the replay branch** |
| P3 | target tools ⊇ source tools | `substitute_not_superset` | **moved above the replay branch** |
| P4 | identical `ROLE_TOKEN_REGISTRY` rows | `substitute_token_contract_mismatch` | **moved above the replay branch** |
| P5a | ledger status ∈ {pending, in_progress} | `substitute_node_closed` | unchanged (incl. its `detail`) |
| P5b | `classifyEvidenceBody(body, fromRole)` ≠ `'deliverable'` | `substitute_node_closed` (detail extended) | **NEW classification** |
| — | `isReplay = !!(active && active.to_role === toRole)` | — | detection only, no return |
| **C1** | if P5b said `capability_gap`: resolve nonce, `seedEvidenceFile(..., true)` | `substitute_evidence_reset_failed` | **NEW** |
| **C2** | if `isReplay`: return `ok, idempotent:true` — **no second record** | — | return moved to commit phase |
| C3 | else append the record, write the store, return `ok, idempotent:false` | — | unchanged |

Both `ok` returns gain one field: **`evidence_reset: <boolean>`** — true exactly when C1 re-seeded.

**Post-condition, identical on both `ok` paths and easy to test:** *after any successful
`substitute-role`, the node's evidence file is at its binding-preserving seeded state and exactly one
active record names `(node, to_role)`.*

**Crash windows.** C1 precedes C2/C3, so a crash leaves either `{seeded body, no record}` or
`{seeded body, record}`. Re-running the identical command recovers both: the first re-classifies as
`seeded` (no reset) and records; the second re-classifies as `seeded` and returns `idempotent: true`.
No hand patch is reachable anywhere in the path. ✓ A2.

**One stated behaviour change beyond the acceptance items:** moving the replay return into the commit
phase means a replay now re-validates P2–P4. This matters only if the role library changed mid-run,
and refusing a no-longer-admissible recorded swap is the fail-closed answer. It is intentional; `n7`
and `n8` should treat it as specified, not as an accident.

---

## §4c — What P5 still guarantees, and what it no longer guarantees

**Still guarantees.** `substitute-role` never proceeds on a node whose evidence carries a deliverable,
and "deliverable" is now a structural predicate rather than a boolean over emptiness: any body below
the binding header that either carries no typed capability-gap marker, or carries one *and also*
carries a non-empty value for any content-bearing token the role's contract demands. A returning role
can therefore only get itself classified as gapped by withholding **every** required token value —
that is, by genuinely not delivering. Stamping `delegation_outcome: capability_gap` onto real findings
does not launder them. The ledger-status arm is untouched, so a `complete` or `n/a` node still refuses
regardless of its body, and there is no flag, env var, or argument that overrides either arm.

**No longer guarantees.** P5 no longer guarantees the evidence file is byte-untouched across a
substitution: on the `capability_gap` classification the body is destroyed and re-seeded, irreversibly
and with no backup, so a role that jotted partial notes and then gapped loses those notes. And the
predicate itself has moved from "a non-empty body ⇒ refuse" to "a non-empty body that is not a typed
gap ⇒ refuse", which means the guard's correctness now depends on the classifier rather than on a
one-line emptiness test. That is the deliberate price: the alternative on the table was a hand
`apply_patch` of a nonce-bound artifact, which is unbounded where this is bounded, unlogged where this
reports `evidence_reset: true`, and non-atomic where this is tmp+fsync+rename.

---

## §5 — A5: test obligations. Assertion + the mutation that must turn it red.

`n3` owns `scripts/test-adaptive-node.js` and nothing else. Extend the existing `#798` substitute-role
scenario block (search `substitute_node_closed`, ~line 25390) — same `makePlan`/`fixture` helpers,
same hand-rolled `assert`, temp dirs cleaned in `finally`.

**Fixture prerequisite for every reset scenario.** The existing `fixture()` writes no barrier
baseline, so `readNonce` returns `null` and any reset would refuse. A gap-reset scenario MUST write
`.cache/barrier-base-n1` whose first 12 characters equal the nonce in the evidence binding — e.g.
file content `abc123abc123deadbeefcafe` with binding `evidence-binding: n1 abc123abc123`. Scenarios
that do **not** exercise the reset need no baseline; the reset is attempted only on the
`capability_gap` classification, so **every existing scenario stays green untouched** (verify this
claim, do not assume it).

**Reference gap body** (use the §0 bytes verbatim, adapted to node `n1`) — the tests must be written
against what a real role produced, not against an idealised marker.

| id | assertion | mutation that must turn it RED |
|---|---|---|
| **T1** | Gap body (§0 shape) + baseline → `ok`, `evidence_reset === true`, one record, and the file afterwards equals the fresh `investigator` seed with **line 1 byte-identical** to before | make `classifyEvidenceBody` return `'deliverable'` for a marker-bearing body |
| **T2** | `findings: already delivered` → refuse `substitute_node_closed`; evidence bytes unchanged; **no** substitutions file | delete the `'deliverable'` arm (permit every body) |
| **T2b** | **Forgery control.** `findings: <real text>` **plus** `delegation_outcome: capability_gap` → refuse `substitute_node_closed`; bytes unchanged | drop the "no non-empty required token" conjunct from `classifyEvidenceBody` |
| **T2c** | Indented-only marker: body whose sole `capability_gap` occurrence is inside an indented value, with a non-empty `findings:` → refuse | change `CAPABILITY_GAP_MARKERS` from `/^…/m` to an unanchored `/…/` search |
| **T3** | Seed-only body (`findings:` empty, no marker) → `ok`, `evidence_reset === false`, evidence bytes **unchanged** | make the reset unconditional |
| **T4** | After substitution the card has `agent_type === 'investigator'`, `agent_type_frozen === 'code-explorer'`, `codex_task_name === 'n1_investigator'` ≠ the pre-substitution `'n1_code_explorer'` | revert `codexTaskNameForNode` to the frozen role |
| **T5** | Two identical calls → second is `idempotent: true`, store has exactly ONE row, and `codex_task_name` is identical across both | derive the name from a counter, timestamp, or record `ts` |
| **T6** | No record on file → card `codex_task_name === 'n1_code_explorer'`, no `agent_type_frozen` / `role_substituted` / `role_substitution_basis` / `evidence_reset` keys, and the full key set equals the pre-change golden | append any suffix unconditionally, or attach the substitution keys unconditionally |
| **T7** | `--to-role code-explorer` on a frozen `code-explorer`, no record → refuse `substitute_self_noop`; substitutions file **does not exist** | remove P0 |
| **T7b** | Active record → `investigator`, then `--to-role code-explorer` → refuse `substitute_self_noop`; store still has exactly one row | make P0 conditional on "no active record" |
| **T8** | Reset written, then re-run the identical command → `ok`, `evidence_reset === false`, exactly one record (crash-window resume) | move C1 after C3 |
| **T8b** | `.cache` made unwritable (`chmod 0o555`, restored in `finally`) with a gap body → refuse `substitute_evidence_reset_failed`, **no** record written | swallow `seedEvidenceFile`'s `ok:false` and record anyway |
| **T9** | Gap body, **no** `barrier-base-n1` → refuse `substitute_evidence_reset_failed`, no record, evidence bytes unchanged | fall back to an empty-string nonce instead of refusing |
| **T10** | For each of P0 / P2 / P3 / P4 / P5a / P5b: after the refusal, evidence bytes AND the substitutions file are unchanged | move C1 above the guard block |
| **T11** | `new Set(Object.keys(ROLE_CAPABILITY_MANIFEST).map(sanitizeCodexTaskName)).size === Object.keys(ROLE_CAPABILITY_MANIFEST).length` | (standing invariant — its mutation is "add a colliding role name"; it guards a future change, not this one. Label it so, honestly.) |
| **T12** | `complete` ledger row **with** a gap body → still refuse `substitute_node_closed` | run P5b before P5a |
| **T13** | **The end-to-end proof.** After T1's reset, write `findings: real work` into the re-seeded file and run the close path → the node closes and the compliance row carries the substitution basis | rotate the nonce in C1 instead of preserving it → close refuses `evidence_stale` |

T13 is the single most load-bearing assertion in the set: it is the only one that proves the
*preserve, do not rotate* decision of §2 against the real close gate. T2b is the second: it is the
answer to "can the returning role forge the distinction?".

If T8b's environment cannot make a directory unwritable (running as root), **skip it with a recorded
reason** — do not let it pass vacuously.

---

## §6 — The prose delta (binding transcription for `n5`)

### 6.1 — Facts `n5` must know before editing

- `<!-- PIN: role-capability-coverage -->` occurs **ONCE** in
  `templates/routing/plan-run.skeleton.md` (line 427), **outside** every `REGION:` block, so it
  renders to all six surfaces from one copy. The brief's "locate and apply both copies" does **not**
  apply to this passage. Verify with `grep -n 'PIN: role-capability-coverage'` before editing.
- The `codex-dispatch` PIN (line 168, `REGION:skill`) already says both `task_name` and `agent_type`
  come from the card. **It needs no change** — do not invent one.
- The `{task_name}` mapping sentence (line 490) needs no change.
- The `opened=… role=… task=…` summary-segment text (lines 92, 385) needs no change (see §3).

### 6.2 — Current text (skeleton lines 427-447), for exact location

```
<!-- PIN: role-capability-coverage -->
**If the card's role manifest cannot cover the node brief, or the role returns `capability_gap`,
run `substitute-role`** — do NOT dispatch a role that cannot perform what the brief mandates, and
do NOT let it improvise around the gap:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" substitute-role \
  --project {project} --node-id {node-id} --to-role {role} --json
```

Same-kind and manifest-superset are checkable facts, so this decides mechanically — no consent stop.
The frozen plan, its `## Node Ledger`, and `plan_hash` stay BYTE-IDENTICAL: substitution is dispatch
metadata, recorded durably in `.cache/role-substitutions.json` and folded into the close-time
compliance row. The re-issued card carries `agent_type` (dispatch this), `agent_type_frozen` (what
the plan says), and `role_substituted: true`. On any typed refusal — `substitute_unknown_role`,
`substitute_kind_mismatch`, `substitute_not_superset`, `substitute_token_contract_mismatch`,
`substitute_node_closed` — there is no in-kind role that covers the brief, so escalate with
`write-halt --reason consent` rather than dispatching anyway.

A `capability_gap` return is **NOT evidence**: never `record-evidence` it. The node stays open;
substitute and re-dispatch, or halt.
```

### 6.3 — Replacement text (transcribe verbatim; the opening paragraph and the fenced block are unchanged)

```
<!-- PIN: role-capability-coverage -->
**If the card's role manifest cannot cover the node brief, or the role returns `capability_gap`,
run `substitute-role`** — do NOT dispatch a role that cannot perform what the brief mandates, and
do NOT let it improvise around the gap:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" substitute-role \
  --project {project} --node-id {node-id} --to-role {role} --json
```

Same-kind and manifest-superset are checkable facts, so this decides mechanically — no consent stop.
The frozen plan, its `## Node Ledger`, and `plan_hash` stay BYTE-IDENTICAL: substitution is dispatch
metadata, recorded durably in `.cache/role-substitutions.json` and folded into the close-time
compliance row. The re-issued card carries `agent_type` (dispatch this), `agent_type_frozen` (what
the plan says), `role_substituted: true`, and a task identity derived from the DISPATCH TARGET — so a
substituted node presents a FRESH identity, not the one already consumed. Spawn it anew from the
re-issued card; never resume the consumed identity with a follow-up, and never reuse the
pre-substitution task name. An unsubstituted node's card is unchanged.

A `capability_gap` return is **NOT evidence**: never `record-evidence` it, and never hand-edit the
seeded evidence file to clear it. The node stays open. A role that self-persisted a gap instead of a
deliverable leaves a body that only `substitute-role` may clear: when that body carries a typed gap
marker and no non-empty required token, the same call re-seeds the file atomically at its CURRENT
binding before recording the swap and reports `evidence_reset: true`. A body carrying a real
deliverable is never cleared — the swap is refused instead.

Two refusal families, two different moves:

- `substitute_self_noop` — the requested target IS the frozen role. Nothing was recorded and nothing
  was cleared; name a DIFFERENT in-kind role, or halt.
- `substitute_unknown_role`, `substitute_kind_mismatch`, `substitute_not_superset`,
  `substitute_token_contract_mismatch`, `substitute_node_closed`,
  `substitute_evidence_reset_failed` — no in-kind role covers the brief, or the node's evidence
  cannot be safely reset, so escalate with `write-halt --reason consent` rather than dispatching
  anyway.
```

Forge-neutral: no forge CLI binary, brand, or request noun appears. The runtime-specific mapping of
"task identity" stays in the existing `{task_name}` sentence, so this passage reads correctly on every
runtime. No provenance: no issue ref, decision id, or ADR citation.

### 6.4 — `templates/routing/required-blocks.js`, `pr-role-capability-coverage` (lines 186-199)

**PRESERVE all seven existing `content_tokens` verbatim** — every one survives the rewrite:
`'<!-- PIN: role-capability-coverage -->'`, `'cannot cover the node brief'`, `'capability_gap'`,
`'substitute-role'`, `'BYTE-IDENTICAL'`, `'write-halt --reason consent'`, `'is **NOT evidence**'`.

**ADD exactly four**, appended to the same array:

```js
      'substitute_self_noop',
      'substitute_evidence_reset_failed',
      'evidence_reset: true',
      'derived from the DISPATCH TARGET',
```

`'evidence_reset: true'` is pinned **with its value** on purpose: bare `evidence_reset` would be
satisfied by the substring inside `substitute_evidence_reset_failed`, which is exactly the kind of
silently-unguarded token this repository treats as a defect.

**CHANGE nothing** in the existing seven. One phrase not pinned before and not pinned now is
"substitute and re-dispatch, or halt" — its removal is deliberate; the two-family list replaces it
with a more precise instruction.

### 6.5 — `n5`'s procedure

Edit the skeleton and the token table, then `node scripts/generate-routing-surfaces.js --write`,
confirm with `--check`, and run `node scripts/test-generate-routing-surfaces.js` and
`node scripts/test-route-reachability.js`, capturing real exit codes. Never hand-edit a rendered
surface.

---

## §7 — Residuals: named, out of scope, and for `n9` to file rather than absorb

1. **Profile prose does not mandate a gap marker in the evidence file.** §0. The fix is fail-closed
   without it, but the recovery stays best-effort rather than deterministic. Filing it makes the
   distinction guaranteed; ~56 surfaces (`agents/*.md` + three `.toml` editions each, policed by
   `test-agent-profile-parity.js`) plus `scripts/generate-reviewer-profiles.js:431`.
2. **`reopen-node` re-dispatch still collides on a task-name runtime.** `reopen-node` rotates the
   nonce but not the identity, so a re-dispatched COMPLETE node presents `id__role` again and hits the
   same `already exists` failure. **Inferred from the code path plus the recorded failure mode; NOT
   reproduced in this run.** No acceptance item covers it and it needs a different key (an attempt
   ordinal), so it is out of scope. Forward-compat note: §3's effective-role derivation composes with
   a later attempt-ordinal suffix conditional on `attempt > 1`, so fixing it later does not disturb
   byte-identity.
3. **`delegation_outcome: capability_gap` is out-of-vocabulary at close time** and must stay that way
   (a gap must never close a node). Not a defect; worth one line in `docs/api.md` so the asymmetry is
   recorded rather than rediscovered.

## §8 — Optional additions inside `n4`'s write set

Two `OPERATOR_HINT_REGISTRY` entries. The five existing `substitute_*` codes deliberately fall through
to the generic "Run orient …" hint; leave them. The two NEW codes get entries because "run orient"
actively misdirects for both, and misdirecting the orchestrator into improvisation is the failure this
whole issue is about:

```js
  substitute_self_noop: (ctx) =>
    'Role "' + (ctx.to_role || '<role>') + '" is already the frozen role for ' + (ctx.nodeId || ctx.node_id || '<id>') +
    '. Nothing was recorded. Name a DIFFERENT in-kind role, or escalate: ' + ADAPTIVE_NODE_SCRIPT +
    ' write-halt --project <P> --reason consent --json.',
  substitute_evidence_reset_failed: (ctx) =>
    'The evidence for ' + (ctx.nodeId || ctx.node_id || '<id>') + ' could not be re-seeded atomically (' +
    (ctx.detail || 'no resolvable binding nonce') + '). Do NOT hand-edit the evidence file; escalate: ' +
    ADAPTIVE_NODE_SCRIPT + ' write-halt --project <P> --reason consent --json.',
```

`n4`: also extend the `substitute-role` usage line (`:15001`) — no new flags, so only the parenthetical
needs the reset mention — and export `classifyEvidenceBody` alongside `runSubstituteRole` /
`hasEvidenceBodyBelowHeader` so `n3` can unit-test the classifier directly. Then `npm run
sync:editions`; never hand-edit a port.

---

## Tie-breaker derivation (optional, audit-only)

Two live options at §1 — an opt-in force flag (cheapest to build) versus a structural classifier
(more code, no override). Axiom 1 (correct first) settles it: the flag leaves a relabeling hole that
rework would eventually have to close, and rework is the most expensive outcome. Axiom 3 does not get
to argue, because a guard is not a place to spend less.
