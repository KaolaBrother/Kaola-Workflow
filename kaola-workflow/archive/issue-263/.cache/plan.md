# Implementation Blueprint: Classify-And-Act selective execution (issue #263)

RED evidence: the three open decisions from the explore node are resolved below with
ground-truthed code seams (line numbers verified against the live tree on 2026-06-06)
and exact diffs. The frozen plan's `## Nodes` write sets were read directly
(`kaola-workflow/issue-263/workflow-plan.md` L53–61) and every node section in this
blueprint is bounded to its declared write set.

GREEN evidence: n/a — this is a read-only forward-reasoning planning node; no writes to
production code. Output is this blueprint only.

---

## 0. Resolved decisions (the three open questions)

### Decision A — `select(<group>)` lives in the **shape column** (shape branch)
Adopted: add `{ kind: 'select', group }` to `parseShape`. Confirmed against the live
tripwire fixture (`scripts/simulate-workflow-walkthrough.js` L6677–6678): `select(fix)`
sits in the **shape column** of a 6-column table, and today produces
`invalid shape "select(fix)"`. The shape branch is the lowest-change fit, mirrors the
existing `fanout(<group>)` analogy exactly, and requires no `## Nodes` table-schema change
for the *shape* itself.

### Decision B — ledger `n/a` write is done by the **contractor agent** (transcription)
Adopted option (c): commit-node never mutates the ledger (invariant confirmed —
`combineResults` returns a structure; no `fs.writeFileSync`/`appendFileSync` to the
ledger anywhere in `kaola-workflow-commit-node.js`). The contractor agent writes the
`n/a` rows via `Edit` on `## Node Ledger`, exactly as it already writes every status row.

REFINEMENT vs the task prose: the contractor does **not** re-implement the selector logic
in its prompt. The n/a *computation* (find the group, read `.cache/<id>.md`, parse the
selector, fail-closed on missing/foreign) is done **mechanically** by a new
`--selector-check --node-id X --json` mode of the **plan-validator** (impl-validator's
file). commit-node shells it (impl-commit-node's file) as an informational sibling of
`--verdict-check` and surfaces a `selectorCheck.armsToNa: [...]` JSON array. The
contractor's job is reduced to "copy that JSON array into `n/a` ledger rows." Decision B's
answer (contractor writes the ledger) stays TRUE; the prompt is simplified to a copy, and
commit-node's no-mutation invariant is intact.

### Decision C — `selector_source` is a new **column in the `## Nodes` table**
Adopted: append a `selector_source` column to the `## Nodes` table, after the `shape`
column. It is inside the `computePlanHash` coverage region (the hash covers
`## Meta` + `## Nodes`, L479–484), stays adjacent to the node definition, and is parsed
alongside `shape`/`depends_on` with one extra `get('selector_source')`. No new
`## Selectors` section (which would force `sectionBody` parsing changes).

Convention: for non-arm, non-classifier nodes → `—`. For an arm → the classifier node id.
The classifier (selector_source) node itself → `—` (it does not point to itself).

---

## 0a. Plan-boundary notes (surfaced honestly; NOT required work — out of frozen write sets)

These were ground-truthed against the actual frozen plan and test surface. None block AC.

1. **Codex/gitea/gitlab walkthroughs have NO `select()` tripwire** (grep empty in all three).
   The tripwire to flip is **root-only** (`scripts/simulate-workflow-walkthrough.js`), which
   impl-tests-sync owns. There is no second tripwire to flip anywhere.

2. **Gitea/gitlab contract validators** (`plugins/kaola-workflow-{gitea,gitlab}/scripts/
   validate-kaola-workflow-{gitea,gitlab}-contracts.js`) assert only file *existence* +
   `assertNotIncludes(..., 'enable_adaptive')` on the plan-validator. The new code
   (`parseNodeSelector`, G-SEL) contains no `enable_adaptive` string, so those assertions
   still pass untouched. Explore §8's claim that "AC6 needs `assertIncludes` additions to
   the gitea/gitlab contract validators" is **incorrect** — no in-plan node owns those
   files and no edit is required for them to stay green. Treat as out-of-scope, not a gap.

3. **`scripts/test-commit-node.js`** (run in `npm test:kaola-workflow:claude`) tests
   `combineResults` as a pure function with explicit input objects lacking `selectorCheck`.
   impl-commit-node must thread an **absent** `selectorCheck` to null/pass — mirror the
   existing `(verdictCheck == null) ? true` pattern — so every existing pure case stays
   green. No in-plan node owns `test-commit-node.js`; a dedicated `selectorCheck` unit case
   there is nice-to-have, not required (the selector *logic* lives in the validator and is
   exercised via the walkthrough). Backward-compatibility is the hard constraint.

4. **AC2 ("parseNodeSelector unit-covered in the schema module")** is satisfiable inside
   the frozen write sets: `parseNodeVerdict` is unit-tested in
   `scripts/simulate-workflow-walkthrough.js` (the `#251 verdict-gate unit tests` block,
   L6358–6384, which `require`s the schema module). impl-tests-sync owns that file and adds
   a parallel `parseNodeSelector` pure-case block right after it.

5. **Contractor `n/a`-Edit prompt wiring has no in-plan owner (the USE side, deferred).**
   Decision B routes the ledger mutation to the contractor; at runtime that needs an
   agent/command prompt encoding "read `selectorCheck.armsToNa`, Edit `n/a` rows, halt on
   `ok:false`." That prompt lives in an agent/command file — none is in any frozen write set
   (scripts + README + CHANGELOG only), and the plan header states #263 IMPLEMENTS but does
   NOT USE `select(...)`. So: within #263, AC#3 ("routing marks exactly the unselected arms
   n/a; missing/foreign halts") is verified at the **`--selector-check` computation +
   fail-closed-exit** level — the walkthrough tests the validator's `armsToNa` output and its
   exit-1 on missing/foreign; the commit BLOCKS on `ok:false` (Change 2). It is NOT verified
   at a live contractor Edit (no script can test a subagent's prose Edit). The contractor
   prompt wiring is honestly **deferred / unowned** — same class as note 2. Surface this at
   closure; do not silently assume the USE side ships.

---

## Section: impl-schema (node `impl-schema`)

**Frozen write set (verified, plan L55):**
```
scripts/kaola-workflow-adaptive-schema.js,
plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js,
plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js,
plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
```
All four keep the base filename `kaola-workflow-adaptive-schema.js` (drift anchor) and
**must be byte-identical** after the change.

**Change 1 — add `parseNodeSelector`.** Insert immediately after `parseNodeVerdict`
(which ends at L111 in the root file), before the `// #238 ... CURATED_ROOT_PATHS` comment
block at L113. Exact function (no vocabulary check — arm-id validity is checked in the
validator against the plan's declared arms, NOT here):

```js
// #263: the mechanical SELECTOR vocabulary a read-only classifier (selector_source) emits
// into its `.cache/{node-id}.md` evidence. Same discipline as parseNodeVerdict: native
// multiline regex ONLY (no classifier import — cross-edition byte-identity). FENCE-BLIND BY
// ANCHOR: a selector line is recognised ONLY at column 0 (`^selector:`). Last-match-wins.
// Value is a single bare token (an arm id — no whitespace). No vocabulary clamp: which arm
// ids are legal is plan-relative and is checked by the validator's --selector-check.
// Returns { found, selector: <arm-id>|null }.
function parseNodeSelector(cacheText) {
  const text = String(cacheText || '');
  const re = /^selector:[ \t]*([^\s]+)[ \t]*$/gm;
  let m, last = null;
  while ((m = re.exec(text)) !== null) { last = m[1]; }
  return { found: last !== null, selector: last };
}
```

**Change 2 — export it.** In `module.exports` (the block at L204–239), add
`parseNodeSelector,` immediately after the existing `parseNodeVerdict,` line (currently
L227):

```js
  parseNodeVerdict,
  parseNodeSelector,
```

**Replication.** Apply the identical two edits to all four files. The plugin/gitea/gitlab
copies have the same `parseNodeVerdict` + `module.exports` structure (byte-identical drift
anchor), so the insertion points are identical line-for-line.

**Verification before exit (REQUIRED):**
```bash
node scripts/validate-script-sync.js
```
Must report the `adaptive-schema constant copies` group (4 files, L100–106) byte-identical.
No new group is needed in `validate-script-sync.js` — the existing group already covers all
four editions, so adding `parseNodeSelector` + its export to all four auto-syncs.

Also load the module and smoke it:
```bash
node -e "const s=require('./scripts/kaola-workflow-adaptive-schema.js'); \
  console.log(JSON.stringify(s.parseNodeSelector('selector: arm-csv\n')));"
# => {"found":true,"selector":"arm-csv"}
```

**Do NOT touch** the walkthrough, validator, or commit-node from this node — they belong to
later nodes. The `parseNodeSelector` *unit test* is impl-tests-sync's job.

---

## Section: impl-validator (node `impl-validator`)

**Frozen write set (verified, plan L56):**
```
scripts/kaola-workflow-plan-validator.js,
plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js   (byte-identical to root),
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js  (renamed),
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js (renamed)
```
Codex copy is **byte-identical** to root; gitea/gitlab are **renamed but structurally
identical** — apply the same logical edits.

This node has FIVE pieces of work: (1) `parseShape` select branch, (2) `parseNodes`
`selector_source` column, (3) G-SEL-1..4 in the shapes loop, (4) a new
`--selector-check --node-id X --json` CLI mode, (5) parity verification.

### (1) parseShape — add the select branch
At L94–100, insert the select branch **after the fanout branch (L98), before the loop
branch (L99)** (placement is cosmetic; the only hard rule is before the `invalid` fallthrough):

```js
  if ((m = s.match(/^fanout\(([^)]+)\)$/))) return { kind: 'fanout', group: m[1].trim() };
  if ((m = s.match(/^select\(([^)]+)\)$/))) return { kind: 'select', group: m[1].trim() };
  if ((m = s.match(/^loop\((\d+)\)$/))) return { kind: 'loop', cap: parseInt(m[1], 10) };
```

### (2) parseNodes — read the new `selector_source` column
In `parseNodes` (L116–140), the header is parsed generically via `idx(name)` and `get(name)`
returns `''` for an absent column — so a 6-column table is already safe. Add one field to
the pushed node object (after `shape: parseShape(get('shape')),` at L136):

```js
      cardinality: get('cardinality'),
      shape: parseShape(get('shape')),
      // #263: classifier node id this node is an arm of ('—'/'' => not an arm). Hash-covered
      // (lives in ## Nodes). Absent column => '' => treated as non-arm (back-compat).
      selectorSource: (() => { const v = get('selector_source'); return (v && v !== '—' && v !== '-') ? v : ''; })(),
```

### (3) G-SEL-1..4 — new validation block in the shapes loop
The shapes loop is L544–586. After the existing `for (const [, grp] of groups) { ... }`
fanout block closes (L586), add a select-group block. Structure it like the fanout block.

First, collect select members. In the per-node loop (L550–569), add a select bucket
alongside the fanout bucket. Declare a `selectGroups` Map before the loop (next to
`const groups = new Map();` at L545):

```js
  const groups = new Map();
  const selectGroups = new Map();   // #263: select(<group>) label -> { members: [] }
```
and inside the node loop, after the `if (n.shape.kind === 'fanout') { ... }` block (L552–559):
```js
    if (n.shape.kind === 'select') {
      if (!selectGroups.has(n.shape.group)) selectGroups.set(n.shape.group, { label: n.shape.group, members: [] });
      selectGroups.get(n.shape.group).members.push(n);
    }
```

Then, after the fanout `for (const [, grp] of groups)` block (after L586), add:

```js
  // --- #263 G-SEL: selective-execution (Classify-And-Act) groups -----------------------------
  // All four rules fail-closed (push to errors => refuse). Post-dominance over the superset
  // (G-SEL-3) needs NO code here: G1/G2 below already run over ALL nodes including every arm,
  // because all arms are present in the frozen DAG (documented, not re-implemented).
  for (const [, grp] of selectGroups) {
    const members = grp.members;
    const g = grp.label;

    // G-SEL-1a — exactly-one membership: a select group needs >= 2 arms.
    if (members.length < 2) {
      errors.push(`select group "${g}" has only ${members.length} arm(s) (needs >= 2)`);
    }

    // G-SEL-1b — every arm names a selector_source, and all arms in the group name the SAME one.
    const srcs = new Set(members.map(m => m.selectorSource).filter(Boolean));
    if (srcs.size === 0) {
      errors.push(`select group "${g}" arms declare no selector_source`);
    } else if (srcs.size > 1) {
      errors.push(`select group "${g}" arms name conflicting selector_source(s): ${[...srcs].join(', ')}`);
    } else {
      const srcId = [...srcs][0];
      const srcNode = nodes.find(n => n.id === srcId);
      // G-SEL-1c — the selector_source must EXIST in the plan.
      if (!srcNode) {
        errors.push(`select group "${g}" selector_source "${srcId}" not found in plan`);
      } else {
        // G-SEL-1d — the selector_source must be READ-ONLY. Use the SAME predicate the fanout
        // read-only carve-out uses (L578): !WRITE_ROLES.has(role). NOT a hand-listed allowlist.
        if (WRITE_ROLES.has(srcNode.role)) {
          errors.push(`select group "${g}" selector_source "${srcId}" (role ${srcNode.role}) must be a read-only node`);
        }
        // G-SEL-1e — every arm must depend_on the selector_source (it runs strictly before them).
        for (const m of members) {
          if (!m.dependsOn.includes(srcId)) {
            errors.push(`select group "${g}" arm "${m.id}" must depend_on selector_source "${srcId}"`);
          }
        }
      }
    }

    // G-SEL-2 — gates are never selectable. GATE_VERDICT_ROLES already exists at L56.
    for (const m of members) {
      if (GATE_VERDICT_ROLES.has(m.role)) {
        errors.push(`select group "${g}" arm "${m.id}" has gate role ${m.role} — gates cannot be select arms (G-SEL-2)`);
      }
    }

    // G-SEL-4 — disjoint-or-identical write sets across arms. Reuse classifier.disjointWriteSets
    // (the empty-set carve-out makes read-only arms pass trivially). Only RED is fatal here —
    // a YELLOW shared-infra touch among mutually-exclusive arms (only one ever runs) is not a
    // concurrency hazard, so it does not block (mirrors that exactly one arm executes).
    const dj = classifier.disjointWriteSets(members.map(m => m.writeSet));
    if (dj.verdict === 'red') {
      errors.push(`select group "${g}" arms have overlapping write sets (${dj.reasoning})`);
    }
  }
```

Notes for the implementer:
- `WRITE_ROLES`, `GATE_VERDICT_ROLES`, `classifier`, `nodes`, `errors` are all already in
  scope at this point in `validatePlan` (do not re-declare).
- **G-SEL-3 is a NO-OP by design** — write a comment only (as above). The existing G1
  (L645) / G2 (L651) `gateUncovered` runs over `nodes`, which includes all arms; that is
  already strictly-more-conservative post-dominance over the superset. Do not duplicate it.
- **Disjointness severity for G-SEL-4:** only `red` is fatal. The fanout block treats
  `yellow` (shared-infra) as a fatal "must serialize" error (L583) BECAUSE fanout arms run
  concurrently. Select arms are mutually exclusive (exactly one runs), so shared-infra
  overlap is not a concurrency hazard — do not copy the fanout `yellow` push. (`red` =
  exact-path / coarse-area overlap = a stale mis-attributable declaration = still fatal.)

### (4) New CLI mode `--selector-check --node-id X --json`
This is the mechanical n/a computation Decision B routes through the validator (NOT
commit-node). Add it next to the existing `--verdict-check` CLI handler. Behavior:

Inputs: plan path, `--node-id <selector_source-id>`. Steps:
1. Parse the plan (`parseNodes`). Find the node with `id === nodeId`.
2. Determine the select group it is the `selector_source` of: collect all nodes whose
   `selectorSource === nodeId`. These are the arms. If there are none, this node is not a
   selector_source → return `{ ok: true, isSelector: false, armsToNa: [] }`, **exit 0** (a
   non-selector node is a no-op for routing; with `ok:true` it never false-blocks a normal
   commit — see §impl-commit-node Change 2's `selectorPass` term).
3. Read the classifier's evidence: `.cache/<nodeId>.md` (resolve relative to the plan dir,
   matching how the validator already resolves `.cache` for `--verdict-check`). Run
   `schema.parseNodeSelector(text)`.
4. FAIL-CLOSED:
   - selector not found (`found === false`) → `{ ok: false, isSelector: true, errors:
     ['selector_source <id> produced no selector: line'] }`, exit 1.
   - selector names an id NOT among the arms (foreign) → `{ ok: false, isSelector: true,
     errors: ['selector "<x>" is not an arm of select group (<arm ids>)'] }`, exit 1.
   - Never "run all" and never "run none."
5. On a valid selected arm: `armsToNa = arms.map(a => a.id).filter(id => id !== selected)`.
   Return `{ ok: true, isSelector: true, selected: '<arm-id>', group: '<label>', armsToNa: [...] }`,
   exit 0.

Mirror the exact CLI arg-parsing + JSON-emit + exit-code convention of `--verdict-check`
(find it by grepping `--verdict-check` in the validator's `main()`/CLI dispatch). Reuse
`parseNodes` + the new `selectorSource` field; do NOT re-parse the table by hand.

**Exit-code contract (load-bearing — commit-node's blocking `overallOk` depends on it):**
- non-selector node → `{ ok:true, isSelector:false, armsToNa:[] }`, **exit 0**.
- valid selected arm → `{ ok:true, isSelector:true, selected, group, armsToNa:[...] }`, **exit 0**.
- missing selector (`parseNodeSelector.found === false`) → `{ ok:false, isSelector:true, errors:[...] }`, **exit 1**.
- foreign selector (names a non-arm) → `{ ok:false, isSelector:true, errors:[...] }`, **exit 1**.
This `ok`/`exitCode` shape is exactly what commit-node threads into `overallOk`.

### (5) Parity verification before exit (REQUIRED)
```bash
diff scripts/kaola-workflow-plan-validator.js plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js   # must be empty (byte-identical)
grep -c 'parseNodeSelector\|--selector-check\|G-SEL\|select(' plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
grep -c 'parseNodeSelector\|--selector-check\|G-SEL\|select(' plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
```
Codex copy must be byte-identical (empty diff). Gitea/gitlab are renamed; verify structural
presence of the new branches/mode (non-zero grep counts). Then run
`node scripts/simulate-workflow-walkthrough.js` is impl-tests-sync's gate — but impl-validator
should smoke its own change against a hand-written 7-column select fixture (see the
impl-tests-sync fixture below) to confirm `in-grammar` before exit.

---

## Section: impl-commit-node (node `impl-commit-node`)

**Frozen write set (verified, plan L57):**
```
scripts/kaola-workflow-commit-node.js,
plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js   (byte-identical to root),
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js  (renamed),
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js (renamed)
```

The plan DOES expect a change to all four commit-node editions (this is ground truth, not
the task-prose "zero files / docs-only" framing — the per-node barrier would refuse a docs
write since `docs/api.md` is not in this node's write set). The change is small and
preserves the no-ledger-mutation invariant.

**What changes:** add a `--selector-check` shell sibling (shell placement mirrors
`verdictCheck`'s call site) and thread its result **as a BLOCKING per-node gate** through
`combineResults` (NOT informational — see Change 2 for why it patterns with barrier-check,
not the downstream gates).

### Change 1 — shell the selector-check in per-node mode
In `main()` (the per-node branch at L190–196), after the `verdictCheck` shell at L196, add:

```js
    // #263: selector-check ID --json. BLOCKING per-node (checks the COMPLETING node's OWN
    // .cache, like barrier-check — no deadlock risk, so NOT informational). A non-selector
    // node returns isSelector:false/ok:true (never false-blocks). A selector_source with a
    // missing/foreign selector returns ok:false/exit 1 => fails the commit (fail-closed).
    // NEVER mutates the ledger: on success it RETURNS armsToNa for the contractor to transcribe.
    selectorCheck = shellValidator(validatorPath, planPath, ['--selector-check', '--node-id', nodeIdValue, '--json']);
```

Declare `let selectorCheck = null;` next to `let verdictCheck = null;` (L185).

The whole-plan branch (L197–202) does NOT shell `--selector-check` (selection is per-node,
keyed on the completing selector_source). Leave `selectorCheck = null` there.

### Change 2 — thread it through combineResults (backward-compatible)
Pass `selectorCheck` into `combineResults` (L204):
```js
  const out = combineResults({ recordBase, barrierCheck, gateVerify, verdictCheck, selectorCheck }, { mode, nodeId: nodeIdValue });
```

In `combineResults` (L~90–130):
- Destructure `selectorCheck` from the input. **It is OPTIONAL** — absent (undefined) must
  behave like null. This keeps `scripts/test-commit-node.js` (which calls `combineResults`
  with inputs lacking `selectorCheck`) green.
- **selector-check is BLOCKING in per-node mode — it is NOT informational like verdictCheck.**
  This is the load-bearing correction: verdict/gate-check are informational ONLY to avoid a
  deadlock (when an impl node commits, its DOWNSTREAM reviewer has not run yet, so a blocking
  verdict could never pass). selector-check has no such risk — it checks the COMPLETING node's
  OWN `.cache/<id>.md` at the moment it commits, exactly like barrier-check verifies the
  completing node's own writes. So it patterns with **barrier (blocking)**, not the downstream
  gates. A `selectorCheck.ok === false` (missing/foreign selector) MUST fail the commit
  (typed refusal, design-doc + AC#3 "never runs-all/runs-none"); making it informational would
  let `ok:false` slip through `overallOk`, leaving fail-closure dependent on contractor prose —
  the exact failure trace: classify commits `complete`, both arms stay `pending`, both
  `depend_on` a now-`complete` classify → next-action makes BOTH ready → both run. Forbidden.
- Thread it into per-node `overallOk` (small, backward-compatible):
  ```js
  const selectorPass = (selectorCheck == null) ? true
    : (selectorCheck.exitCode === 0 && selectorCheck.ok === true);
  overallOk = barrierPass && /* ...existing per-node terms... */ && selectorPass;
  ```
  Two cases verified: (a) ABSENT selectorCheck → `selectorPass === true` → existing
  `test-commit-node.js` pure cases stay green; (b) a NON-selector node returns
  `{ isSelector:false, ok:true, exitCode:0, armsToNa:[] }` → `selectorPass === true` → a normal
  commit is never false-halted. Only a real selector_source with a missing/foreign selector
  fails (exit 1, ok:false) → blocks the commit. NOTE: the `--selector-check` validator mode
  (impl-validator) must therefore exit 0 / `ok:true` for a non-selector node and exit 1 /
  `ok:false` on missing-or-foreign — confirm that exit-code contract matches §impl-validator (4).
- Add `selectorCheck` to the returned object (L120–129), next to `verdictCheck` (surface
  `armsToNa` on the success path for the contractor — blocking the error case and reporting on
  the success case are not in tension; do NOT tag it `informational`).

### Change 3 — replicate across 4 editions + smoke
Apply identically; gitea/gitlab call their renamed validator (`shellValidator` already
receives `validatorPath`, so no string change beyond what already differs per edition).

**Verification before exit (REQUIRED):**
```bash
diff scripts/kaola-workflow-commit-node.js plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js   # empty
node scripts/test-commit-node.js          # existing pure cases MUST still pass (absent selectorCheck => null)
```

**Invariant restated:** commit-node still writes NOTHING to the ledger. It surfaces
`selectorCheck.armsToNa`; the contractor transcribes.

### Contractor orchestration note (for the commit+advance prompt — documents Decision B)
When dispatching the **commit+advance** bracket for a node, the orchestrator includes:

> If the per-node `commit-node --json` output has `selectorCheck.isSelector === true` and
> `selectorCheck.ok === true`, then for each id in `selectorCheck.armsToNa`, set that node's
> `## Node Ledger` status to `n/a` via Edit, with note
> `selected: <selectorCheck.selected> (not this arm)`. If `selectorCheck.ok === false`,
> HALT and surface the error (fail-closed — never run-all/run-none). For a node with
> `selectorCheck.isSelector === false`, do nothing (normal node).

The contractor reads a JSON array; it does not parse `.cache` or compute the group itself.
`LEDGER_STATUSES` already includes `'n/a'` as legal; `next-action.js` already treats `n/a`
as terminal and `n/a` deps as satisfied.

**SCOPE CAVEAT (read §0a note 5):** this prompt wiring lives in an agent/command file, and
NO node's frozen write set in this plan owns such a file (the sets are scripts + README +
CHANGELOG). The plan header is explicit that #263 *IMPLEMENTS* `select(...)` and does NOT
*USE* it. So this orchestration note is the USE side and is **deferred / unowned by this
plan** — do not present it as shipping here. Within #263, fail-closure is guaranteed by the
BLOCKING `--selector-check` in `overallOk` (Change 2), which is script-mechanical and fully
tested; the contractor's `n/a` Edit is the *bookkeeping* that follows a commit that already
fail-closed at the script level.

---

## Section: impl-tests-sync (node `impl-tests-sync`)

**Frozen write set (verified, plan L58):**
```
scripts/simulate-workflow-walkthrough.js,
scripts/validate-script-sync.js
```

### (A) Flip the `select()` tripwire — `testAdaptivePatternLibrary` (L6673–6685)
The current tripwire asserts `refuse` + `invalid shape "select(fix)"`. After #263 it must
assert `in-grammar`. But the current fixture (L6675–6681) has NO `selector_source` column —
under G-SEL-1 it cannot be in-grammar without one, AND the shared `validatePlanFixture`
helper hardcodes a 6-column header/separator (L804–805).

**Do NOT bump `validatePlanFixture`'s shared header to 7 columns** — it is called by ~a
dozen existing governance/composed assertions (L813+, L6656+) that pass 6-column rows; a
7-column header desyncs every one of them. Instead, **write the select fixture inline with
its own 7-column header + separator** (a small local helper or a direct
`fs.writeFileSync` + `runNode(planValidatorScript, [planPath,'--json'])`, matching what
`validatePlanFixture` does internally at L800–807).

**Replacement for L6673–6685.** The in-grammar fixture (7 columns — `selector_source` is the
new 7th; the classifier is read-only `code-explorer`; two disjoint arms both depend_on it
and both carry `select(fix)` + `selector_source = classify`; the classifier itself and all
non-arms carry `—`):

```
| id       | role          | depends_on        | declared_write_set | cardinality | shape       | selector_source |
| classify | code-explorer | —                 | —                  | 1           | sequence    | —               |
| arm-csv  | tdd-guide     | classify          | exporter/csv.js    | 1           | select(fix) | classify        |
| arm-html | tdd-guide     | classify          | renderer/html.js   | 1           | select(fix) | classify        |
| review   | code-reviewer | arm-csv,arm-html  | —                  | 1           | sequence    | —               |
| done     | finalize      | review            | —                  | 1           | sequence    | —               |
```

Assertions replacing L6682–6685:
```js
assert(v.result === 'in-grammar',
  'select() classify-and-act with a read-only selector_source + 2 disjoint arms must be in-grammar, got: ' + JSON.stringify(v));
// arms are mutually exclusive: only one ever runs => no write-role-fanout blast radius from the arms;
// risk is assessed over the superset, classifier is zero-blast-radius. (assert decision per live output —
// expect 'auto-run' here since labels are non-sensitive and there is no fanout/loop; if a write-role arm
// trips blastRadius in the live validator, assert 'ask' to match — read the actual JSON, do not guess.)
```
IMPLEMENTER: run the fixture against the live validator FIRST and pin the `decision` value
to the actual output (the arms are single `select` sequence branches, not a fanout, so
`writeRoleFanout` should be false → expect `auto-run`; confirm empirically before asserting).

**Keep tripwire (b)** (the both-arms-as-fanout workaround, L6687–6697) UNCHANGED — it still
documents that the fanout workaround runs both arms. It uses `validatePlanFixture` (6-col)
and stays valid.

**Add typed-refusal cases** (still inside `testAdaptivePatternLibrary`, inline 7-col
fixtures), asserting `result === 'refuse'` and the matching error substring:
- single-arm group (one `select(fix)` row) → `select group "fix" has only 1 arm`.
- gate arm: an arm with role `code-reviewer` and `select(fix)` → `gates cannot be select arms` / G-SEL-2.
- write-role selector_source: point arms at a `tdd-guide` classifier → `must be a read-only node`.
- arm missing `depends_on` the selector_source → `must depend_on selector_source`.
- overlapping arm write sets (two arms declaring the same file) → `overlapping write sets`.

### (B) parseNodeSelector unit coverage — AC2
In the `#251 verdict-gate unit tests` block (the function around L6335; `schema` is
required at L6340), after the `parseNodeVerdict` pure cases (which end ~L6384), add a
parallel `parseNodeSelector` block mirroring L6362–6384:

```js
// (1b) #263 parseNodeSelector pure cases
let ps = schema.parseNodeSelector('selector: arm-csv\n');
assert(ps.found === true && ps.selector === 'arm-csv',
  'parseNodeSelector: "selector: arm-csv" must parse, got ' + JSON.stringify(ps));
// last-match-wins
ps = schema.parseNodeSelector('selector: arm-csv\nselector: arm-html\n');
assert(ps.found === true && ps.selector === 'arm-html',
  'parseNodeSelector: last-match-wins, got ' + JSON.stringify(ps));
// missing -> found:false
ps = schema.parseNodeSelector('');
assert(ps.found === false && ps.selector === null,
  'parseNodeSelector: empty text => found:false, got ' + JSON.stringify(ps));
// fence-blind by col-0 anchor: indented selector must NOT match
ps = schema.parseNodeSelector('    selector: arm-csv\n');
assert(ps.found === false,
  'parseNodeSelector: indented selector must NOT match (col-0 anchor), got ' + JSON.stringify(ps));
```

### (C) validate-script-sync.js — read-only verification pass (NO edit)
Confirmed: NO change needed. The existing `adaptive-schema constant copies` group
(L100–106) already lists all four editions, so `parseNodeSelector` + its export auto-sync.
impl-tests-sync should OPEN `scripts/validate-script-sync.js`, confirm the
`adaptive-schema constant copies` group still lists the four `kaola-workflow-adaptive-schema.js`
paths, and CLOSE — no Edit. (The file is in this node's write set only so the node can
verify the sync group covers the new export; if a future maintainer split the schema out of
that group, this is where they'd notice.)

### Verification before exit (REQUIRED)
```bash
node scripts/simulate-workflow-walkthrough.js   # must print "Workflow walkthrough simulation passed", exit 0
node scripts/validate-script-sync.js            # adaptive-schema group byte-identical
```

---

## Build sequence (dependency order — already the frozen chain)

1. **impl-schema** — `parseNodeSelector` + export, ×4 byte-identical. (No consumers yet.)
2. **impl-validator** — `parseShape` select branch, `parseNodes` `selector_source` column,
   G-SEL-1..4, `--selector-check` mode, ×4. (Consumes `parseNodeSelector` from step 1.)
3. **impl-commit-node** — `--selector-check` shell sibling + `selectorCheck` BLOCKING
   threading into per-node `overallOk`, ×4, backward-compatible. (Consumes `--selector-check`
   from step 2.)
4. **impl-tests-sync** — flip the tripwire (7-col inline fixture), add G-SEL refusal cases,
   add `parseNodeSelector` unit cases, verify `validate-script-sync` (no edit). (Exercises
   steps 1–3.)
5. **review** (code-reviewer, G1) → **docs** (doc-updater, README) → **finalize** (CHANGELOG).

## Data flow (runtime, once shipped)
read-only classifier node (`selector_source`) runs → writes `selector: <arm-id>` to
`.cache/<id>.md` → on its commit+advance, commit-node shells
`plan-validator --selector-check --node-id <id> --json` → validator parses the selector and
**fail-closes (exit 1, `ok:false`) on a missing/foreign selector, BLOCKING the commit** — this
script-mechanical halt is what guarantees AC#3's "never runs-all/runs-none", independent of any
agent prose → on the success path it returns `armsToNa` (no ledger write by commit-node) →
[USE side, deferred — see §0a note 5] the contractor transcribes `n/a` rows via Edit →
`next-action.js` treats `n/a` arms as terminal, their deps satisfied → the ONE selected arm
runs; the rest never execute. Gates (G1/G2) post-dominate the superset, so whichever arm runs,
its path still crosses code-reviewer. Recomputable on resume from the durable `selector:` line
+ ledger rows.
