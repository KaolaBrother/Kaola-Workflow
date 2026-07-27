evidence-binding: n1-surface c88971e73a76
findings: Both seams reproduced with captured values. THREE corrections to `## Design` — (1) the P5 blocker is BROADER than a gap body: the production `seedEvidenceFile` scaffold alone trips P5 for all 15 roles, so `substitute-role` is unreachable on ANY opened node; (2) `code-explorer -> investigator` is the ONLY pair in the library that even reaches P5; (3) the `.toml` editions carry `--` not `—` in the gap token form, so a check keyed on the full phrase is NOT cross-edition stable while one keyed on the column-0 `capability_gap:` key IS. Baseline `test-adaptive-node.js` unsharded is GREEN (413 scenarios / 3431 assertions / exit 0), and the fast gate at HEAD does NOT execute the substitute-role scenario (measured: it is ordinal 412 → shard 5; `auto/12` selects shard 7 at `8d881aaf`).

## Investigation: what does the #819 repair reach, and what asserts on each surface?

### Setup

- Commit: `8d881aaf5dd43620cf1e06a8b7a4847a75d13db1` (worktree `.kw/worktrees/issue-819`, branch `main`, clean except the untracked `kaola-workflow/issue-819/`)
- Node: v24.18.0, darwin
- Throwaway fixtures under `mkdtemp`; no tracked file was edited.

---

## PART 1 — REPRODUCTION

### 1A. Seam 1 reproduced — a `capability_gap` body produces `substitute_node_closed`

Fixture: node `n1-explore`, frozen role `code-explorer`, ledger `in_progress`, evidence file written with
the exact return form every role profile mandates.

Evidence-file bytes:

    "evidence-binding: n1-explore c88971e73a76\ncapability_gap: shell execution — required to run the repository test suite\n"

`runSubstituteRole({nodeId:'n1-explore', toRole:'investigator'})` returned:

```json
{"result":"refuse","reason":"substitute_node_closed","node_id":"n1-explore",
 "from_role":"code-explorer","to_role":"investigator","status":"in_progress",
 "detail":"evidence for \"n1-explore\" already carries a recorded body; substitution applies only before a deliverable exists"}
```

`role-substitutions.json` written: **false**. REPRODUCES.

CONTROL (same fixture, body `evidence-binding: … \nfindings:\n`) returned `result: ok`, `to_role: investigator`.
So the gap body is a **sufficient** cause on its own.

The hand-patch from the observed run also reproduces: refuse → overwrite the body with a bare seeded
binding → `result: ok`. No subcommand performs that reset (see 1D).

### 1B. Seam 1 is BROADER than the issue states — the PRODUCTION SEED alone blocks substitution

**This is the most important finding in this report and it contradicts the issue's framing.**

`hasEvidenceBodyBelowHeader` (`scripts/kaola-workflow-adaptive-node.js:14883`) walks every line below the
binding. A `token:` line with an empty value is tolerated; **anything else returns `true`**, including an
HTML comment. And `seedEvidenceFile`'s `freshSeed()` (`:2212-2244`) emits exactly such a comment for every
stub token:

```js
freshContent += '<!-- ' + tokenClass + ': paste ' + tokenClass + ' here -->\n';   // :2231
freshContent += tokenClass + ': \n';                                              // :2232
```

Measured against the real seeder (not a hand-written fixture):

```
seedEvidenceFile(planPath,'n1-explore','c88971e73a76','code-explorer',false,null)
  → bytes: "evidence-binding: n1-explore c88971e73a76\n<!-- findings: paste findings here -->\nfindings: \n"
runSubstituteRole(… toRole:'investigator')
  → {"result":"refuse","reason":"substitute_node_closed",
     "detail":"evidence for \"n1-explore\" already carries a recorded body; …"}
```

Per-role scan — **all 15 roles** produce a seed carrying an HTML comment below the header:

| seed_lines | roles |
|---|---|
| 3 | adversarial-verifier, build-error-resolver, code-explorer, doc-updater, implementer, investigator, planner, synthesizer |
| 5 | code-architect, code-reviewer, knowledge-lookup, main-session-gate, security-reviewer, tdd-guide |
| 9 | metric-optimizer |

Confirmed against a LIVE artifact — this run's own `.cache/n2-mechanism.md`, seeded by `open-ready` at 09:44:

    "evidence-binding: n2-mechanism cb782b26822d\n<!-- files_to_create|files_to_modify -->\nfiles_to_create: \n<!-- build_sequence: paste build_sequence here -->\nbuild_sequence: \n"

**Consequence for `n2`:** a mechanism that only teaches P5 to ignore a `capability_gap:` line does **not**
make recovery reachable — the HTML comment scaffold still fires the guard. Any fix must handle the
scaffold too, or the issue's own acceptance A1 ("a `capability_gap` body … does not block `substitute-role`")
will be satisfied on a hand-written fixture and still fail in production.

Outcome table (each row = a real `runSubstituteRole` call on that body):

| substitute-role outcome | evidence body |
|---|---|
| `ok` | seed-only, token with no value (the #798 test's hand-written shape) |
| `refuse:substitute_node_closed` | **seed + HTML comment scaffold (what the seeder actually writes)** |
| `refuse:substitute_node_closed` | `capability_gap:` line, mandated form |
| `refuse:substitute_node_closed` | blank `findings:` + `capability_gap:` line |
| `refuse:substitute_node_closed` | genuine deliverable |
| `ok` | header only |
| `ok` | empty / absent file |
| `refuse:substitute_node_closed` | no binding header, prose |

**The #798 regression case "a SEEDED-but-valueless evidence file must stay substitutable"
(`scripts/test-adaptive-node.js:25497-25502`) is VACUOUS against the real seeder** — it hand-writes
`'evidence-binding: n1 abc123\nfindings:\n'`, a two-line shape `seedEvidenceFile` never emits. `n3` should
replace or supplement it with a fixture seeded by `seedEvidenceFile` itself.

### 1C. Seam 2 reproduced — the task identity is frozen across a recorded substitution

```
codexTaskNameForNode({id:'n1-explore', role:'code-explorer'})   = "n1_explore_code_explorer"
dispatch.codex_task_name  (before substitution)                  = "n1_explore_code_explorer"
dispatch.agent_type       (before substitution)                  = "code-explorer"

runSubstituteRole(… toRole:'investigator') → ok
active record → {"node_id":"n1-explore","from_role":"code-explorer","to_role":"investigator", …}

codexTaskNameForNode({id:'n1-explore', role:'code-explorer'})    = "n1_explore_code_explorer"
dispatch.codex_task_name  (after substitution)                   = "n1_explore_code_explorer"   ← UNCHANGED
dispatch.agent_type       (after substitution)                   = "investigator"               ← CHANGED
```

Exhaustive dispatch-card diff, before → after (the ONLY four keys that move):

```
agent_type:               "code-explorer" -> "investigator"
agent_type_frozen:        undefined       -> "code-explorer"
role_substituted:         undefined       -> true
role_substitution_basis:  undefined       -> "manifest superset (Read+Write+Grep+Glob+Bash covers Read+Write+Grep+Glob), kind producer, identical token contract [evidence-binding, findings]"
```

REPRODUCES. `codex_task_name` is derived at `:3054-3057` from `id + '__' + role` reading `nodeInfo.role`
(the FROZEN cell); `buildDispatch` (`:3110`) computes it BEFORE resolving the substitution at `:3118` and
never revisits it.

Cross-check against the issue's recorded Codex failure: the reported agent path was
`/root/n1_explore_code_explorer`; `sanitizeCodexTaskName('n1-explore__code-explorer')` measures to
`"n1_explore_code_explorer"`. **Exact match** — the external failure and our derivation are the same string.

For reference, the value a role-aware derivation would yield:
`codexTaskNameForNode({id:'n1-explore', role:'investigator'})` = `"n1_explore_investigator"`.

### 1D. A4 reproduced — a self-substitution is RECORDED, not refused

```json
{"result":"ok","node_id":"n1-explore","from_role":"code-explorer","to_role":"code-explorer",
 "basis":"manifest superset (Read+Write+Grep+Glob covers Read+Write+Grep+Glob), kind producer, identical token contract [evidence-binding, findings]",
 "idempotent":false,"plan_unchanged":true}
```

`records_written = 1`. The resulting card: `agent_type=code-explorer agent_type_frozen=code-explorer
role_substituted=true codex_task_name=n1_explore_code_explorer` — a card that flags a substitution while
redirecting nothing. Byte-for-byte the residue the issue reports.

### 1E. No existing subcommand can perform the reset A2 asks for

`seedEvidenceFile(..., forceRotate=true)` is the atomic re-seed primitive (temp+fsync+rename via
`writeFileAtomicReplace`, `:2276`). Its only reachable caller for a *whole-file* reset is `runReopenNode`
(`:8221`), and `reopen-node` refuses first:

```
scripts/kaola-workflow-adaptive-node.js:8006
  return { result:'refuse', reason:'node_not_complete', nodeId,
           detail:'only a complete node can be reopened for repair' };
```

The reset gate is `spliceLedgerNode(…,'pending',{allowFrom:['complete']})` (`:8003`). A gapped node is
`in_progress`, so `reopen-node` is structurally unavailable. `runRepairNode`'s rotating seed (`:9381`) is
attempt-bound to a review-repair transaction, not a free reset. **A2 has no shipped surface today** —
confirmed, not assumed.

---

## PART 2 — SCRIPT-LANE PROPAGATION INVENTORY

`kaola-workflow-adaptive-node.js` reaches its three ports by TWO independent mechanisms:

| # | Path | Mechanism | Driver |
|---|---|---|---|
| 1 | `scripts/kaola-workflow-adaptive-node.js` | CANONICAL — the only file to hand-edit | — |
| 2 | `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` | **byte copy** (`COMMON_SCRIPTS`, member confirmed; 22 entries) | `edition-sync.js --write` step (b) |
| 3 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js` | **rendered** (`GENERATED_AGGREGATORS`, `edition-sync.js:47`) + `@generated` banner | `edition-sync.js --write` step (a) |
| 4 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js` | **rendered**, same | same |

**Regenerate (exactly one command):**

```bash
npm run sync:editions            # == node scripts/edition-sync.js --write
```

**Verify no drift — TWO commands are required, they cover disjoint sets:**

```bash
node scripts/edition-sync.js --check       # ONLY the 12 forge aggregator ports (6 aggregators x 2 forges)
node scripts/validate-script-sync.js       # the COMMON_SCRIPTS canonical -> codex-tree BYTE identity
```

Read `runCheck()` in `scripts/edition-sync.js`: it iterates `GENERATED_AGGREGATORS x FORGES` only and never
looks at `plugins/kaola-workflow/scripts/`. Chain wiring makes this asymmetric: `edition-sync --check` runs
in the **gitlab + gitea** chains; `validate-script-sync.js` runs in the **claude + codex** chains. A
canonical edit not propagated to the codex tree reds claude+codex; not propagated to the forge trees reds
gitlab+gitea. Neither check alone is sufficient.

**Baseline (both green at `8d881aaf`):**

| Command | Exit | Output |
|---|---|---|
| `node scripts/edition-sync.js --check` | **0** | `edition-sync: 12 forge aggregator ports in parity with canonical.` |
| `node scripts/validate-script-sync.js` | **0** | — |

---

## PART 3 — IN-FILE REGISTRATION SURFACE (if the mechanism adds a subcommand)

Measured against `scripts/kaola-workflow-adaptive-node.js`. A new subcommand must join **every** list below;
these are the exact anchors:

| # | List / site | Line | What omission costs |
|---|---|---|---|
| 1 | `SPLIT_GUARDED_SUBCOMMANDS` | `:94-107` | no worktree-authority split guard **and no scheduler lock** (`:15204` derives the lock set from this same Set) |
| 2 | `REPLAN_GUARDED_SUBCOMMANDS` | `:112-118` | mutates through an active re-plan fence (`:15095`) |
| 3 | `LEDGER_MUTATING_SUBCOMMANDS` | `:167-172` | run-progress mirror not refreshed — **only if the command flips a ledger row status**; `substitute-role` is deliberately absent today |
| 4 | dispatch `else if` chain | `:15223-15504` (21 branches) | falls to the terminal `else` → `{"result":"refuse","errors":["unknown subcommand: …"]}` |
| 5 | usage block | `:14991-15012` | invisible to `--help`; `substitute-role`'s line is `:15001` |
| 6 | `OPERATOR_HINT_REGISTRY` | `:212` (75 keys) | refusal ships with no operator hint |

**Two measured facts that correct working assumptions:**

- **`OPERATOR_HINT_REGISTRY` contains ZERO `substitute_*` keys.** Measured:
  `Object.keys(OPERATOR_HINT_REGISTRY).filter(k=>/substitut/.test(k))` → `[]`. All five existing
  `substitute_*` refusals ship with no hint, even though `main()` wraps the result in
  `decorateOperatorHint(...)` at `:15349`. A new refusal code inherits that silence unless a key is added.
- **`substitute-role` does NOT run the layered guard prologue.** `mutationGuardPrologue` has exactly six
  call sites, all measured: `runOpenNext:6673`, `runCloseAndOpenNext:7118`, `runOpenReady:11035`,
  `runCloseNode:12089`, `runExpandOpen:13357`, `runExpandClose:13611`. `runSubstituteRole` is not among
  them, so it gets no integrity check, no consent-halt fence, and no live-coordination exclusion — only the
  `main()`-level replan fence, split guard, and scheduler lock. **This contradicts the `CLAUDE.md` line
  "Runs a layered guard prologue before every mutating subcommand"**, which is true of 6 subcommands, not
  all of them. A new reset subcommand does not inherit the prologue by registration; it must call it.

---

## PART 4 — ROUTING-LANE INVENTORY

**Generation confirmed.** `scripts/generate-routing-surfaces.js` renders **30** surfaces (5 topics x 6) from
one skeleton per topic. For `plan-run`, the skeleton is `templates/routing/plan-run.skeleton.md` and the six
outputs are exactly the six paths in `n5`'s declared write set. `--write` renders + writes; `--check`
byte-compares and exits 1 on any mismatch. A hand-edit to any rendered surface is wiped by the next
`--write` and reds `--check`, which is wired into **all four** chains.

### 4A. Passages the change must touch

**(i) The `role-capability-coverage` PIN region — `templates/routing/plan-run.skeleton.md:427-447`.**

**CORRECTION to the `n5` brief:** it says "the skeleton carries command and skill variants as parallel
regions, so locate and apply **both** copies of every passage." Measured: `grep -c 'PIN:
role-capability-coverage'` = **1**. This region sits OUTSIDE every `REGION:` marker (the nearest are
`/REGION` at `:418` and `REGION:command` at `:494`), so it is a **single shared copy** that renders to all
six surfaces. Verified downstream: all six rendered files carry `pin=1`. There is no second copy to find.

Current text carrying contract meaning that changes:

- `:441-444` the typed-refusal list — `substitute_unknown_role`, `substitute_kind_mismatch`,
  `substitute_not_superset`, `substitute_token_contract_mismatch`, `substitute_node_closed` — followed by
  "there is no in-kind role that covers the brief, so escalate with `write-halt --reason consent`". A new
  refusal code joins this list; and `substitute_node_closed` will no longer always mean "no in-kind role
  covers the brief", so that sentence's logic changes.
- `:446-447` "A `capability_gap` return is **NOT evidence**: never `record-evidence` it. The node stays
  open; substitute and re-dispatch, or halt."

**(ii) Task identity / `codex_task_name` — four sites in the skeleton, with different reach:**

| Skeleton line | Text | Region | Reaches |
|---|---|---|---|
| `:92` | `opened=<node-id> role=<role> task=<codex_task_name>` (summary essentials) | none | all 6 |
| `:168` | `agents.spawn_agent` … `task_name: dispatch.codex_task_name` — **the actual dispatch mandate** | inside `REGION:skill` (`:154-232`) | **3 SKILL packs only** |
| `:385` | `opened=<node-id> role=<role> task=<codex_task_name>` | none | all 6 |
| `:490` | "`{task_name}` is `dispatch.codex_task_name` on Codex, …" (announcement) | none | all 6 |

Rendered counts corroborate: commands carry `codex_task_name` **3x**, SKILLs **4x** — the extra being the
skill-only `:168` mandate.

### 4B. `templates/routing/required-blocks.js` — the `pr-role-capability-coverage` entry

At `:186-199`. Full entry, verbatim:

```js
block_id: 'pr-role-capability-coverage',
topic: 'plan-run',
runtime_tag: 'both',
surface_type_tag: 'both',
content_tokens: [
  '<!-- PIN: role-capability-coverage -->',
  'cannot cover the node brief',
  'capability_gap',
  'substitute-role',
  'BYTE-IDENTICAL',
  'write-halt --reason consent',
  'is **NOT evidence**',
],
```

`runtime_tag: 'both'` + `surface_type_tag: 'both'` ⇒ `deriveObligated` yields all **6** files.

**How `scripts/test-route-reachability.js` consumes it** (`checkManifest`, `:1234-1300`):

1. **FORWARD** — for each block, derive the obligated file set from `topic` + the two tags
   (`deriveObligated`, `:1210`), then assert **every** `content_tokens` string is a normalized **substring**
   of **every** obligated file. Any miss → `missing-token` failure.
2. **REVERSE orphan-sentinel** — scan all in-scope surfaces for `<!-- PIN|CARD: … -->` markers; each must map
   to a block whose FIRST token is that marker AND whose obligated set includes that surface, else
   `orphan-surface`. So a new PIN marker without a matching block reds.
3. **NON-VACUITY floor** (`:1327+`) — a marker-led block must carry ≥1 token that is not a substring of its
   own marker; an empty `content_tokens` array reds.
4. `foldsGeneric` (`:1306`) proves legacy `(token, surfaces)` pins fold into a manifest block.

Practical rule for `n5`: **any edit that removes or rewords one of the seven pinned strings above reds
`test-route-reachability.js` unless the token table changes in the same commit.** `capability_gap` and
`substitute-role` are bare substrings and survive most rewording; `is **NOT evidence**`,
`cannot cover the node brief`, `write-halt --reason consent`, and `BYTE-IDENTICAL` are exact phrases and are
the fragile ones.

---

## PART 5 — PIN INVENTORY: every machine assertion standing on each surface

### 5A. The planning claim — CONFIRMED, with one addition

> "Planning found no substitute-role assertion in the contract validators or the walkthrough — confirm or refute."

**CONFIRMED.** An exhaustive grep for `substitute-role | substitute_role | runSubstituteRole |
substitute_node_closed | substitute_unknown_role | substitute_kind_mismatch | substitute_not_superset |
substitute_token_contract_mismatch | role-substitutions | role_substituted | agent_type_frozen` across every
`.js` in the tree, excluding the four adaptive-node editions, returns hits in exactly **two** files:

- `scripts/test-adaptive-node.js` — the #798 scenario, `:25392-25503`
- `templates/routing/required-blocks.js:194` — the `'substitute-role'` content token

**Zero** hits in `validate-workflow-contracts.js`, `validate-kaola-workflow-contracts.js`, the gitlab/gitea
contract validators, `simulate-workflow-walkthrough.js`, or any of the four edition walkthroughs.

**ADDITION planning did not have:** `docs/api.md` contains **no** `substitute-role` entry at all — not in the
reason-code catalog, not in the guard/lock catalogs. `n6` is authoring the first one, not amending an entry.

### 5B. The pin that IS load-bearing on seam 2 — and its owning file is in NO write set

```
scripts/simulate-workflow-walkthrough.js:21452
  assert(d.codex_task_name === 'n1_tdd_guide',
    '#775 (a): dispatch card must carry the role-bearing codex_task_name, got: ' + …);
```

A **hard equality** on the derivation, for node `n1` with frozen role `tdd-guide` and no substitution on
record — driven through a real `open-next` on a real fixture repo (`:21448`). Also
`scripts/simulate-workflow-walkthrough.js:21268` asserts `parsed.opened.dispatch.codex_task_name` is truthy.

**`scripts/simulate-workflow-walkthrough.js` appears in no node's declared write set in this plan.** That is
correct *only* while the UNSUBSTITUTED derivation stays byte-identical — which is exactly the constraint A3
and the `n4` brief already impose. Stated as a conditional so nobody trusts it blindly:

- If `n2`'s derivation leaves an unsubstituted node's `codex_task_name` unchanged → **preserved by
  construction**, no write needed. This is the expected outcome.
- If `n2` changes the base derivation → this assertion reds, and repairing it requires a file outside every
  declared write set ⇒ **write-set overflow**. `n4` must stop and report rather than write.

Measured: **none** of the four ported walkthroughs
(`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`, the two gitlab and two gitea
walkthroughs) reference `codex_task_name` or `n1_tdd_guide`. The pin is canonical-only.

### 5C. Full pin table

| # | Assertion | File:line | Status | Owner |
|---|---|---|---|---|
| 1 | #798 happy path, plan byte-identity, idempotent replay, card fold-in, 5 typed refusals | `scripts/test-adaptive-node.js:25392-25503` | **NEEDS UPDATE** — the seed-only case at `:25497-25502` is vacuous (1B) and `:25491-25496` pins the behavior #819 changes | `n3` |
| 2 | `pr-role-capability-coverage` 7 content tokens x 6 surfaces | `templates/routing/required-blocks.js:186-199` | **NEEDS UPDATE** if any pinned phrase is reworded | `n5` |
| 3 | `d.codex_task_name === 'n1_tdd_guide'` | `scripts/simulate-workflow-walkthrough.js:21452` | **PRESERVED BY CONSTRUCTION** iff the unsubstituted derivation is unchanged — see 5B | none (n4 must verify, not write) |
| 4 | `dispatch.codex_task_name` truthy | `scripts/simulate-workflow-walkthrough.js:21268` | preserved by construction | none |
| 5 | `commands/kaola-workflow-plan-run.md` includes `opened=<node-id> role=<role> task=<codex_task_name>` | `scripts/validate-workflow-contracts.js:1078` and its COMMON byte twin `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:1078` | preserved unless the `:385` summary format changes | none |
| 6 | codex SKILL includes `codex_task_name` and the `opened=` format | `scripts/validate-kaola-workflow-contracts.js:672,679` | preserved | none |
| 7 | gitlab SKILL, same two | `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:791,802` | preserved | none |
| 8 | gitea SKILL, same two | `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:793,804` | preserved | none |
| 9 | Six-surface byte-identity of the rendered plan-run outputs | `scripts/generate-routing-surfaces.js --check` (all 4 chains) | **NEEDS `--write`** after any skeleton edit | `n5` |
| 10 | Forge-port render parity, 12 ports | `scripts/edition-sync.js --check` (gitlab + gitea chains) | **NEEDS `npm run sync:editions`** | `n4` |
| 11 | COMMON_SCRIPTS canonical→codex byte identity | `scripts/validate-script-sync.js` (claude + codex chains) | **NEEDS `npm run sync:editions`** | `n4` |
| 12 | Forward/reverse/non-vacuity manifest checks | `scripts/test-route-reachability.js` | **NEEDS UPDATE** only if a PIN marker is added or a pinned phrase reworded | `n5` |

Note on #5: `validate-workflow-contracts.js` is a `COMMON_SCRIPTS` member, so its codex twin is a byte copy
— a change to it must be regenerated, not hand-edited. It is not in any declared write set, and it should
not need to be.

### 5D. Pre-existing docs/code drift `n6` will meet

`docs/api.md` enumerates the guarded subcommand sets in two places, and **both are already stale** against
`scripts/kaola-workflow-adaptive-node.js:94-118`:

- `docs/api.md:318` (`worktree_authority_split`) lists 12 subcommands; the code's
  `SPLIT_GUARDED_SUBCOMMANDS` has 16. Missing from the doc: `expand-open`, `expand-close`,
  **`substitute-role`**, `discard-speculative`.
- `docs/api.md:344` (`scheduler.lock`) lists 12; missing: `expand-open`, `expand-close`,
  **`substitute-role`**, `record-evidence`.

This drift predates #819. The `n6` brief already asks for the catalogs to "match the shipped ones"; flagging
it so the scope of that sentence is understood before the node opens.

Useful anchors for `n6`: `docs/api.md:217` "Adaptive Refusal / Emit Protocol", `docs/api.md:314`
"Mutual-exclusion + integrity reason codes (Cluster S)".

---

## PART 6 — BASELINE

### 6A. `test-adaptive-node.js` unsharded — the run started GREEN

```
$ node scripts/test-adaptive-node.js
##KW-SHARD {"suite":"test-adaptive-node","index":1,"total":1,"scenarios":413,"ran":413,"passed":3431,"failed":0}
adaptive-node tests passed (3431 assertions)
EXIT=0
```

Real exit code captured via `$?` written to file; not read through a pipe.

### 6B. The fast gate does NOT run the substitute-role coverage at this commit — MEASURED

The claude chain runs `node scripts/test-adaptive-node.js --shard auto/12`. `auto/N` is
HEAD-seeded (`scripts/test-shard-lib.js:66-78`): deterministic within a commit, rotating across commits.
Ownership is a stride: `owns(ordinal) ⟺ ordinal % 12 === index - 1`.

| Quantity | Value | How measured |
|---|---|---|
| `autoIndex(12)` at HEAD `8d881aaf` | **7** | re-implemented the exact hash from `test-shard-lib.js:74-77` |
| ordinal of the #798 substitute-role scenario | **412** (last of 413 registrations; the block at `test-adaptive-node.js:25396` is the final `scenario(...)` call in the file) | — |
| shard owning ordinal 412 | **5** | `412 % 12 = 4` ⇒ index 5 |

Empirically confirmed with `KAOLA_TEST_SCENARIO_TIMING=1`, which prints `##KW-SCENARIO <ordinal> <ms>`:

```
$ KAOLA_TEST_SCENARIO_TIMING=1 node scripts/test-adaptive-node.js --shard 7/12
##KW-SHARD {"suite":"test-adaptive-node","index":7,"total":12,"scenarios":413,"ran":34,"passed":339,"failed":0}
EXIT=0        grep -c '##KW-SCENARIO 412 '  →  0     ← ordinal 412 ABSENT

$ KAOLA_TEST_SCENARIO_TIMING=1 node scripts/test-adaptive-node.js --shard 5/12
##KW-SHARD {"suite":"test-adaptive-node","index":5,"total":12,"scenarios":413,"ran":35,"passed":359,"failed":0}
EXIT=0        grep -c '##KW-SCENARIO 412 '  →  1     ← ordinal 412 PRESENT
```

**A green claude fast gate at this commit is not evidence that any substitute-role assertion executed.**
`node scripts/test-adaptive-node.js` unsharded is mandatory for `n3`, `n4`, `n7`, and `n8`. Note that
`scripts/simulate-workflow-walkthrough.js` is also run at `--shard auto/12`, so pin #3 (5B) is sampled the
same way. Only `test:kaola-workflow:claude:full` runs either unsharded — and per `CLAIM`/`CLAUDE.md` the
full tier is never mandated, so the explicit unsharded invocation is the right instrument.

### 6C. Every other relevant check, baseline exit codes

| Command | Exit |
|---|---|
| `node scripts/test-adaptive-node.js` (unsharded) | **0** |
| `node scripts/edition-sync.js --check` | **0** |
| `node scripts/validate-script-sync.js` | **0** |
| `node scripts/generate-routing-surfaces.js --check` | **0** |
| `node scripts/test-route-reachability.js` | **0** |
| `node scripts/test-generate-routing-surfaces.js` | **0** |
| `node scripts/validate-workflow-contracts.js` | **0** |
| `node scripts/validate-kaola-workflow-contracts.js` | **0** |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | **0** |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | **0** |

Forge-neutrality check form for `n4`/`n5`:

```bash
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only <file> [<file> …]
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js  --forbidden-only <file> [<file> …]
```

---

## PART 7 — CONTRADICTIONS OF `## Design`, STATED PLAINLY

**C1 — the scope of seam 1 is understated (HIGH impact on `n2`).** `## Design` says P5 fires because "a
gapping role writes its gap text there before returning". Measured: the production seed **alone** fires P5
for all 15 roles, with no gap body and no dispatch. `substitute-role` therefore has **zero** reachable
success paths on a node that has been opened; the only reachable path is substituting a node that is still
`pending` and unseeded — i.e. never the recovery case. A fix scoped to a `capability_gap:` marker alone
leaves the defect live. Evidence: 1B.

**C2 — `code-explorer -> investigator` is the ONLY pair in the library that reaches P5 (MEDIUM impact).**
Enumerating `ROLE_CAPABILITY_MANIFEST` x `ROLE_TOKEN_REGISTRY` over the P1–P4 predicates yields exactly one
admissible ordered pair. Every other pair is refused earlier by P2 (kind), P3 (superset), or P4 (token
contract). Consequences: (a) the entire mechanism has one live swap, so "make recovery reachable" means
making that one pair work; (b) `n3` cannot build a second happy-path fixture from a different pair without
first widening the manifest — out of scope; (c) the observed run's `code-explorer -> code-explorer` self-swap
was the only other thing the guard chain would admit, which is precisely why A4 matters.

Full derivation:

```
role                  kind        tools                                       tokens
code-explorer         producer    Read+Write+Grep+Glob                        ["evidence-binding","findings"]
planner               producer    Read+Write+Grep+Glob                        ["evidence-binding","recommendation"]
knowledge-lookup      producer    Read+Write+Grep+mcp__context7__…+WebSearch+WebFetch  ["evidence-binding","findings","sources"]
code-architect        producer    Read+Write+Grep+Glob+Bash                   ["evidence-binding","files_to_create|files_to_modify","build_sequence"]
investigator          producer    Read+Write+Grep+Glob+Bash                   ["evidence-binding","findings"]
tdd-guide             implement   Read+Write+Edit+Bash+Grep                   ["evidence-binding","RED","red_baseline"]
implementer           implement   Read+Write+Edit+Bash+Grep                   ["evidence-binding","tests-green|…"]
build-error-resolver  implement   Read+Write+Edit+Bash+Grep+Glob              ["evidence-binding","build-green"]
metric-optimizer      implement   Read+Write+Edit+Bash+Grep                   ["evidence-binding","metric_baseline",…]
doc-updater           write       Read+Write+Edit+Bash+Grep+Glob              ["evidence-binding","docs_updated"]
synthesizer           write       Read+Write+Edit+Bash+Grep                   ["evidence-binding","merge_outcome"]
code-reviewer         gate        Read+Write+Grep+Glob+Bash                   ["evidence-binding","verdict","findings_blocking"]
security-reviewer     gate        Read+Write+Grep+Glob+Bash                   ["evidence-binding","verdict","findings_blocking"]
adversarial-verifier  gate        Read+Write+Grep+Glob+Bash                   ["evidence-binding","verdict"]
workflow-planner      orchestration …                                          undefined
```

`SUBSTITUTABLE_KINDS = {'producer'}` (`:14734`) excludes `implement`, `write`, and `gate` outright.

**C3 — the role-profile scope boundary is CORRECT but its stated justification is imprecise (LOW impact,
but it changes what `n2` may key on).** `## Design` asserts every profile "already mandates the exact token
form `capability_gap: <missing capability> — <required action>`" and calls that stable "across all four
editions". Measured:

| Surface set | Carrying the EXACT phrase (with `—`) | Carrying the column-0 key `capability_gap:` |
|---|---|---|
| `agents/*.md` (15) | 14 | 14 |
| `plugins/kaola-workflow/agents/*.toml` (15) | **3** | 14 |
| `plugins/kaola-workflow-gitlab/agents/*.toml` (15) | **3** | 14 |
| `plugins/kaola-workflow-gitea/agents/*.toml` (15) | **3** | 14 |

The `.toml` editions ASCII-normalize the em dash: they read
`` `capability_gap: <missing capability> -- <required action>` `` (two hyphens). Only the three reviewer
profiles happen to carry the `—` form. The lone profile carrying no gap instruction at all is
`workflow-planner`, an `orchestration`-kind role that `substitute-role` can never target.

**Therefore: the boundary holds, and the conclusion `## Design` draws from it is right — but only for a
check keyed on the column-0 `capability_gap:` key.** A check keyed on the full phrase, or on the em dash,
is NOT cross-edition stable and would behave differently on Codex than on Claude. `n2` should key on the
column-0 key alone if it takes the marker route.

**C4 — "both copies of every passage" does not apply to the region `n5` must edit (LOW impact, saves time).**
See 4A(i): the `role-capability-coverage` PIN exists exactly once and is region-free. The `codex_task_name`
dispatch mandate at skeleton `:168` IS region-scoped, but to `REGION:skill` only — there is no parallel
command copy of it either.

**C5 — the guard-prologue claim in `CLAUDE.md` is broader than the code (LOW impact, but relevant if `n2`
adds a subcommand).** See Part 3: 6 of ~16 mutating subcommands call `mutationGuardPrologue`.

---

## Inferences (labelled, with what would refute each)

- **I1 — `substitute-role` today has no reachable success path on any node that has been opened.**
  Confidence: high. Derived from 1B (the seed alone refuses, all 15 roles) + C2 (one admissible pair).
  Refuted by: exhibiting a role whose `ROLE_TOKEN_REGISTRY` entry is `['evidence-binding']` alone (its seed
  would be a bare binding line with no comment) AND that is a `producer` in an admissible pair. I found
  none — every registry entry carries ≥1 stub token.
- **I2 — a marker-only fix satisfies A1's letter and not its intent.** Confidence: high; follows directly
  from 1B. Refuted by: a marker mechanism that also stops treating the seed scaffold as a body.
- **I3 — `n4` will not need to touch `scripts/simulate-workflow-walkthrough.js`.** Confidence: medium — it
  holds only under the byte-identity constraint A3 already imposes. Refuted by: an `n2` derivation that
  alters the unsubstituted `codex_task_name`. Flagged rather than assumed.
- **I4 — no contract validator or walkthrough will red from the seam-1 change.** Confidence: high; from the
  exhaustive grep in 5A. Refuted by: a change that adds a PIN marker to a routing surface (that would red
  `test-route-reachability.js`'s reverse orphan-sentinel) or reworders a pinned phrase.

Tie-breaker derivation: C1/C2/C3 are reported in full rather than trimmed to the brief's six questions,
because axiom 1 (correct first) outranks axiom 3 (spend least) when a stated premise is measurably wrong and
three downstream writers are about to build on it.

## Open — what I did not measure, and why

- **No live Codex re-dispatch.** This run executes on the Claude runtime. Seam 2 is proven on our side (the
  identity is byte-identical before and after a recorded substitution, and it matches the exact string in
  the issue's `already exists` failure); the external fact that Codex rejects a duplicate `task_name` rests
  on that recorded failure, not on a probe I ran. `## Design` already states this residual.
- **`hasEvidenceBodyBelowHeader` is not exported** (confirmed against `module.exports`), so I observed it
  only through `runSubstituteRole`'s outcome. Faithful for behavior, but `n3` cannot unit-test the predicate
  directly without `n4` adding it to the export list — worth knowing before the test is written.
- **`reopen-node`'s `node_not_complete` refusal was read, not executed.** Driving it needs a git fixture and
  a real `commit-node --record-base`. The precondition is a single unambiguous `allowFrom: ['complete']` at
  `:8003`, so I judged the read sufficient; a writer who needs it as a hard guarantee should run it.
- **The four validation chains were not run.** Out of scope for a read node, and `n8` owns them.
- **The ordinal-412 measurement is commit-specific.** Both the `auto/12` slice and the scenario's ordinal
  shift as commits land and scenarios are added. The general conclusion (the fast gate samples 1/12, so a
  new assertion may not execute) is stable; the specific "shard 7 vs shard 5" pair is only true at
  `8d881aaf`.
