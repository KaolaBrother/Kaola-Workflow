# Exploration Evidence — issue-269 (node: explore)

## Real selectorCheck JSON shapes (from plan-validator, lines 982–1037)

Non-selector node:
```json
{ "ok": true, "isSelector": false, "armsToNa": [] }
```

Selector — missing/foreign value (exit 1):
```json
{ "ok": false, "isSelector": true, "errors": ["selector_source \"<id>\" produced no selector: line"] }
```
or:
```json
{ "ok": false, "isSelector": true, "errors": ["selector \"<arm-id>\" is not an arm of select group \"<group>\" (<arm-ids>)"] }
```

Selector — valid selected arm (exit 0):
```json
{ "ok": true, "isSelector": true, "selected": "<arm-id>", "group": "<group>", "armsToNa": ["<other-arm-id>", ...] }
```

`armsToNa` = all arms in the select group except `selected` (line 1034: `armIds.filter(id => id !== selected)`).

## Full commit-node barrier JSON shape (commit-node.js, combineResults lines 126–137)

```json
{
  "result": "ok" | "refuse",
  "mode": "per-node-start" | "per-node" | "whole-plan" | null,
  "nodeId": "<string>" | null,
  "recordBase": { "exitCode": 0, "result": "ok", "nodeId": "...", "base": "<tree-sha>" } | null,
  "barrierCheck": { "exitCode": 0, "result": "pass", "errors": [], "sensitiveHits": [], "outOfAllow": [] } | null,
  "gateVerify": { "exitCode": 0, "ok": true, "unsatisfied": [], "informational": true } | null,
  "verdictCheck": { "exitCode": 0, "ok": true, "nodeId": "...", "role": "...", "verdict": "pass"|null, "findings_blocking": 0|null, "found": true|false, "informational": true } | null,
  "selectorCheck": { "exitCode": 0, "ok": true, "isSelector": false, "armsToNa": [] } | null,
  "overallOk": true | false
}
```

Key: `selectorCheck` is populated only in `per-node` mode (`null` in `per-node-start` and `whole-plan`).
`overallOk = barrierPass && selectorPass`; `null` selectorCheck → treated as pass (backward-compatible).
Per-node selector-check is BLOCKING (unlike gate-verify/verdict-check which carry `informational: true`).

## How n/a rows interact with next-action.js TERMINAL set (lines 27–82)

```js
const TERMINAL = new Set(['complete', 'n/a']);
```

(a) depends_on predicate (line 70): `node.dependsOn.every(d => TERMINAL.has(st(d)))` — n/a arm satisfies the join.
(b) allDone predicate (line 82): `nodes.every(n => TERMINAL.has(st(n.id)))` — n/a arms count toward completion.

**Critical ordering**: n/a writes MUST precede the fused advance — next-action reads the ledger synchronously.
If arm rows are still `pending` when next-action runs, it may stall the ready-set or return allDone:false.

## Insertion point: docs/api.md

New "Selector routing — orchestrator contract" section goes **after line 397** and **before line 399**:

Line 397 (anchor before):
```
  Also: `"errors": ["--node-id requires a value"]` when `--node-id` flag is present but value is missing or starts with `--`.
```

Line 399 (anchor after):
```
## Contractor Agent (issue #242 Part B, wired in Stage C)
```

## Insertion point: commands/kaola-workflow-plan-run.md (canonical)

Step 3 contractor prompt, lines 194–199. Sub-steps (a)–(d) are inside the prompt string.
New `(e) SELECTOR ROUTING` inserts after `(d) FUSED ADVANCE` before the final `Do NOT dispatch...` closing clause.

Closing text of (d) (anchor):
```
...report the next-action JSON + the node you opened, or `allDone`. If the barrier exits 1, or `test_thrash` ≥ 3, or evidence is missing: do NOT mark the node `complete` AND do NOT run the fused advance — report the condition and stop (the orchestrator owns the halt). Do NOT dispatch a role, judge sufficiency, write any `escalated_to_full`/`consent_halt` marker, or ask the user."
```

## Insertion point: plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md (Codex mirror)

Prose structure — no lettered sub-steps. Insertion between:

Para before (lines 107–108):
```
...Never mark a gate row `n/a` while a node it post-dominates reached `complete`.
```

Para after (lines 108–110):
```
**Then, ONLY IF the barrier exited 0** (the node is now `complete`/`n/a`), the contractor FUSES the next advance in the SAME call — re-runs `node "$KAOLA_SCRIPTS/kaola-workflow-next-action.js"...`
```

**GOTCHA**: SKILL.md uses prose, not (a)–(d) letters. Must insert prose-form, not a lettered `(e)`.

## Insertion point: plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md

Structurally identical to canonical (same (a)–(d) letters), step 3 at line 198.
Script names differ: `kaola-gitea-workflow-commit-node.js`, `kaola-gitea-workflow-next-action.js`.
Same insertion point as canonical.

## Insertion point: plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md

Structurally identical to canonical, step 3 at line 198.
Script names differ: `kaola-gitlab-workflow-commit-node.js`, `kaola-gitlab-workflow-next-action.js`.
Same insertion point as canonical.
