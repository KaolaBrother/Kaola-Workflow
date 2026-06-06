# Exploration: Classify-And-Act selective execution (issue #263)

RED evidence: existing code structure before any changes.
GREEN evidence: n/a — read-only exploration node; no writes to production code.

---

## 1. Confirmed file paths — all 12 files across four editions

**Root scripts (`scripts/`)**
- `scripts/kaola-workflow-adaptive-schema.js`
- `scripts/kaola-workflow-plan-validator.js`
- `scripts/kaola-workflow-commit-node.js`

**Plugin mirror 1 — Codex / kaola-workflow (`plugins/kaola-workflow/scripts/`)**
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js`

**Plugin mirror 2 — gitea (`plugins/kaola-workflow-gitea/scripts/`)**
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js` (keeps base name — byte-identical drift anchor)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js` (renamed)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js` (renamed)

**Plugin mirror 3 — gitlab (`plugins/kaola-workflow-gitlab/scripts/`)**
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js` (keeps base name — byte-identical drift anchor)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` (renamed)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js` (renamed)

Schema name confirmed: `kaola-workflow-adaptive-schema.js` keeps the exact same filename across all four editions.

---

## 2. parseNodeVerdict seam — root `adaptive-schema.js`

**Location**: `scripts/kaola-workflow-adaptive-schema.js` lines 99–111

```js
function parseNodeVerdict(cacheText) {
  const text = String(cacheText || '');
  const vRe = /^verdict:[ \t]*([A-Za-z-]+)[ \t]*$/gm;
  let vm, lastVerdictTok = null;
  while ((vm = vRe.exec(text)) !== null) { lastVerdictTok = vm[1].toLowerCase(); }
  const found = lastVerdictTok !== null;
  let verdict = null;
  if (found && VERDICT_VOCABULARY.includes(lastVerdictTok)) verdict = lastVerdictTok;
  const fRe = /^findings_blocking:[ \t]*(\d+)[ \t]*$/gm;
  let fm, lastBlocking = null;
  while ((fm = fRe.exec(text)) !== null) { lastBlocking = parseInt(fm[1], 10); }
  return { found, verdict, findings_blocking: lastBlocking };
}
```

- **Signature**: `parseNodeVerdict(cacheText: string) => { found, verdict: 'pass'|'fail'|null, findings_blocking: number|null }`
- **Pattern discipline**: column-0-anchored (`^verdict:`), fence-blind (native multiline only), last-match-wins
- **Vocabulary check**: `VERDICT_VOCABULARY = ['pass', 'fail']` at line 93
- **Exported at line 227** in `module.exports`
- No existing `selector` or `select` parsing — confirmed absent

`parseNodeSelector` must follow the exact same discipline:
- Regex: `/^selector:[ \t]*([^\s]+)[ \t]*$/gm` — column-0, fence-blind, last-match-wins
- Returns: `{ found: boolean, selector: string|null }`
- No classifier import — cross-edition byte-identity requirement

---

## 3. Shape parsing seam — root `plan-validator.js`

**`parseShape`**: `scripts/kaola-workflow-plan-validator.js` lines 94–101

```js
function parseShape(cell) {
  const s = String(cell || 'sequence').trim();
  let m;
  if (s === '' || s === 'sequence') return { kind: 'sequence' };
  if ((m = s.match(/^fanout\(([^)]+)\)$/))) return { kind: 'fanout', group: m[1].trim() };
  if ((m = s.match(/^loop\((\d+)\)$/))) return { kind: 'loop', cap: parseInt(m[1], 10) };
  return { kind: 'invalid', raw: s };
}
```

`select(fix)` today → `{ kind: 'invalid', raw: 'select(fix)' }` → error at line 551.

**Open decision A** (for planner): design doc says "no fourth shape" but tripwire fixture puts `select(fix)` in the shape column. Two options:
- (a) Shape branch: add `if ((m = s.match(/^select\(([^)]+)\)$/)))` → `{ kind: 'select', group: m[1].trim() }` — lower change count, matches fixture
- (b) New column: add `selector_group` column to `parseNodes` — matches design doc text, bigger table schema change

**Shapes validation loop**: lines 544–586 (where G-SEL-1..4 attach).

---

## 4. disjointWriteSets — location and signature

**Location**: `scripts/kaola-workflow-classifier.js` lines 317–340

```js
function disjointWriteSets(nodeWriteSets) { ... }
// returns { verdict: 'green'|'red'|'yellow', reasoning: string }
```

Called in plan-validator.js at line 581: `classifier.disjointWriteSets(members.map(m => m.writeSet))`.

G-SEL-4 reuses this call identically for select groups. Empty-set carve-out at line 322 means read-only selector arms pass trivially.

---

## 5. Gate-check locations — G1 and G2 in root `plan-validator.js`

- **G1** (code-reviewer post-dominance): lines 645–646 — `gateUncovered(nodes, producesCode, 'code-reviewer', sink)`
- **G2** (security-reviewer post-dominance): lines 651–659 — conditional on `sensitiveByLabel || sensitiveNodes.length`
- **G-SEL-2** (gates never selectable): attaches at shapes/fanout loop lines 544–586 — check arm roles against `GATE_VERDICT_ROLES`
- **G-SEL-3** (post-dominance over superset): satisfied by existing G1/G2 machinery unchanged — all arms stay frozen in the DAG, `gateUncovered` computes over all of them

---

## 6. n/a marking mechanism — root `commit-node.js`

**Critical finding**: `commit-node.js` does NOT write the ledger — its invariant is no ledger mutation. Enforced: no `fs.writeFileSync`/`fs.appendFileSync` calls for the ledger.

Ledger n/a row is written by the **contractor agent** via `Edit` tool directly on `## Node Ledger` in `workflow-plan.md`.

`LEDGER_STATUSES` enum in `adaptive-schema.js` line 39 includes `'n/a'` as legal.

`next-action.js` treats n/a as terminal (`TERMINAL = new Set(['complete', 'n/a'])` at line 27) and n/a deps satisfy readiness.

**Open decision B** (for planner): design doc says "routing bracket in commit-node marks arms n/a" but commit-node's invariant forbids ledger writes. Options:
- (a) New `--mark-na-arms --selector-source <id>` subcommand in plan-validator (which already writes on `--freeze`); commit-node shells it
- (b) New standalone aggregator script with ledger-write capability
- (c) Contractor agent reads selector verdict from `.cache/<classifier-id>.md` via `parseNodeSelector`, computes unselected arms, writes n/a rows via Edit — consistent with current architecture

---

## 7. Quorum/verdict seam — where parseNodeVerdict is called in root `commit-node.js`

`commit-node.js` does NOT call `parseNodeVerdict` directly — it shells the validator.

Verdict check shells: `shellValidator(validatorPath, planPath, ['--verdict-check', '--node-id', nodeIdValue, '--json'])` at line 196.

`parseNodeVerdict` calls live in `plan-validator.js` `verifyVerdictBlock`:
- Line 352: `schema.parseNodeVerdict(readCache(f) || '')` (fanout adversarial-verifier)
- Line 372: `const v = schema.parseNodeVerdict(raw)` (sequence gate roles)

The G-SEL routing bracket is architecturally a sibling of the `--verdict-check` shell call at commit-node.js lines 196/201.

---

## 8. validate-script-sync.js — edition registration, required change

**Current `adaptive-schema` byte-identical group** (lines 95–107): covers all 4 editions. Adding `parseNodeSelector` to `adaptive-schema.js` and its `module.exports` automatically syncs all four editions — **no new entry needed** in `validate-script-sync.js`.

**plan-validator.js and commit-node.js gitea/gitlab mirrors**: NOT covered by `validate-script-sync.js`. Their parity is enforced by structural `assertIncludes` checks in the edition contract validators (`validate-kaola-workflow-contracts.js`, `validate-kaola-workflow-gitea-contracts.js`, `validate-kaola-workflow-gitlab-contracts.js`).

**Required change for AC6**: new `parseNodeSelector` export and new G-SEL rules need `assertIncludes` additions to the gitea/gitlab contract validators. The `COMMON_SCRIPTS` entry for `kaola-workflow-plan-validator.js` already ensures Claude↔Codex parity.

---

## 9. simulate-workflow-walkthrough.js select() tripwire — exact lines to flip

**Location**: lines 6673–6685

Current assertion A (lines 6682–6683):
```js
assert(v.result === 'refuse',
  'TRIPWIRE: select() classify-and-act must be out-of-grammar until the selective-execution primitive ships, got: ' + JSON.stringify(v));
```

Current assertion B (lines 6684–6685):
```js
assert(Array.isArray(v.errors) && v.errors.some(e => /invalid shape "select\(fix\)"/.test(e)),
  'TRIPWIRE: select() refusal must name the invalid shape, got: ' + JSON.stringify(v));
```

**Flip**: both assertions flip to assert `in-grammar`.

**Critical additional requirement**: current fixture (lines 6675–6681) has no `selector_source` declaration — under G-SEL-1 it cannot be in-grammar without one. The flip also requires:
1. Adding `selector_source` declaration to the fixture
2. Possibly extending `validatePlanFixture` (lines 799–808) which hardcodes 6-column header

---

## 10. Design doc Classify-And-Act key decisions

**Source**: `docs/investigations/2026-06-06-six-workflow-patterns.md`

**`selector_source` identification**:
- A read-only role node (code-explorer or planner) whose `.cache` evidence contains `selector: <arm-id>`
- All arms `depends_on` it (topologically earlier)
- Declaration: `## Selectors` block or extra column — must be inside `computePlanHash` coverage region (covers `## Meta` + `## Nodes` at lines 479–484)

**Selector verdict format**:
- Keyword: `selector: <arm-id>` (column-0)
- Written to `.cache/<classifier-id>.md`
- Parsed by `parseNodeSelector` — fence-blind, last-match-wins, returns `{ found, selector }`
- Foreign arm-id → halt (fail-closed, never run-all/run-none)

**Constraints on `selector_source` roles**:
- Must be read-only (no write set, zero blast radius)
- Write-role `selector_source` is out-of-grammar
- Gate roles cannot be select group members (G-SEL-2)

**Governance**: risk assessed over union of all arms; selector adds no blast radius; n/a arms cannot smuggle unreviewed writes through `barrierCheck` (plan-validator.js lines 456–467).

---

## Key Open Decisions for Planner

| Decision | Options |
|----------|---------|
| A — `select(<group>)` in shape column vs new column | Shape branch (lower change, matches fixture) vs new column (matches design doc) |
| B — ledger n/a write location | New validator subcommand vs new standalone script vs contractor agent transcription |
| C — `selector_source` declaration location | `## Selectors` section under `## Meta` vs extra column in `## Nodes` |

---

## Key Files Summary

| File | Key Seam | Change Needed |
|------|----------|---------------|
| `scripts/kaola-workflow-adaptive-schema.js` | `parseNodeVerdict` at L99–111; `module.exports` at L227 | Add `parseNodeSelector` (×4 auto-synced) |
| `scripts/kaola-workflow-plan-validator.js` | `parseShape` L94–101; shapes loop L544–586; G1 L645, G2 L651 | Add G-SEL-1..4 |
| `scripts/kaola-workflow-commit-node.js` | `--verdict-check` shell at L196; no ledger writes | Add routing bracket (design TBD) |
| `scripts/simulate-workflow-walkthrough.js` | Tripwire at L6673–6685; `validatePlanFixture` at L799 | Flip tripwire, update fixture |
| `scripts/validate-script-sync.js` | `adaptive-schema` group L95–107 | No new entry needed |
| `scripts/kaola-workflow-classifier.js` | `disjointWriteSets` L317 | No changes (reuse only) |
