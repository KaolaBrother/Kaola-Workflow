# Node `explore` evidence — issue #274 (sync-group write-set gap at freeze)

Read-only code-explorer map. Anchors are repo-relative (resolve in the worktree).

## Where the new check goes (single source of truth)
- `scripts/kaola-workflow-plan-validator.js` → `validatePlan(content, {root})` is the ONE function both `--freeze` (via `freezePlan` ~L805) and `--json`/default validate (~L1077) reach. `--resume-check`, `--gate-verify`, `--record-base`, `--barrier-check`, `--selector-check`, `--verdict-check` do NOT reach it (correct — the check must not run there).
- Insert the new `errors.push(...)` block INSIDE `validatePlan()` **between the G1/G2 gate block (~L734-753) and `const planHash = computePlanHash(content)` (~L756)**. Same `errors[]` accumulation as every other grammar check → refuse path `{result:'refuse', errors, planHash, sink}` (L757).
- Union of all declared write paths is already built at ~L427-428 / L463 (`for (const n of nodes) for (const p of n.writeSet) declared.add(p)`) — model the new check on a plan-level union: if ANY node declares a sync-group member, its peer(s) must appear in the union of ALL nodes' write paths.

## try-require pattern (plan-validator)
At ~L40 (right after L39 `const schema = require('./kaola-workflow-adaptive-schema')`):
```js
let syncMeta = null;
try { syncMeta = require('./validate-script-sync'); } catch (_) {}
```
Guard ALL use with `if (syncMeta)`. No circular require (validate-script-sync needs only fs/path). The line is IDENTICAL in all 4 editions; resolves only in Claude `scripts/`, throws+caught (null) in Codex/GitLab/Gitea trees (validate-script-sync.js is root-only) → check is a graceful no-op there, zero false positives.

## validate-script-sync.js changes
- Today: NO `module.exports`, NO `require.main` guard.
- `COMMON_SCRIPTS` (L39-60, 15 bare filenames) → each maps to `scripts/<name>` ↔ `plugins/kaola-workflow/scripts/<name>` (2-way). plan-validator.js is itself a member.
- `BYTE_IDENTICAL_GROUPS` (L62-112): pre-commit(.sh,4w), closure-contract(.js,4w), resolve-agent-model(.js,4w), phantom-advisor(.sh,3w), adaptive-schema(.js,4w). Explicit repo-relative path arrays.
- Wrap the executable body (~L118-166: `const drift=[]` … `process.exit(1)`) in `if (require.main === module) { ... }`; keep `COMMON_SCRIPTS`/`BYTE_IDENTICAL_GROUPS` at module scope; add at bottom:
  ```js
  module.exports = { COMMON_SCRIPTS, BYTE_IDENTICAL_GROUPS };
  ```
- CLI `node scripts/validate-script-sync.js` (first step of `npm test` claude) behaves identically (guard true when run directly; both exit codes preserved).

## Check semantics (covers AC)
- COMMON_SCRIPTS: a declared path `p` is a member if `COMMON_SCRIPTS.includes(path.basename(p))` AND p ∈ {`scripts/<n>`, `plugins/kaola-workflow/scripts/<n>`}. Peer = the other of those two. Require peer ∈ union.
- BYTE_IDENTICAL_GROUPS: for any declared path equal to a group member, require all other `.js` members of that group ∈ union. (.sh files never appear in write-sets — harmless, but only the .js entries matter in practice.)
- Forge-rename ports (`kaola-gitlab-*`, `kaola-gitea-*`) are in NEITHER list → never flagged → no false positives (AC #3).
- Typed refusal wording, e.g.: `sync-group gap: node <id> declares "scripts/X.js" without its byte-identical peer "plugins/kaola-workflow/scripts/X.js"`.

## The 4 plan-validator editions (all 1075 lines; only L38 differs)
| file | L38 require |
|---|---|
| scripts/kaola-workflow-plan-validator.js (Claude) | `./kaola-workflow-classifier` |
| plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js (Codex) | `./kaola-workflow-classifier` (BYTE-IDENTICAL to Claude) |
| plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js | `./kaola-gitlab-workflow-classifier` |
| plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | `./kaola-gitea-workflow-classifier` |
PORT STRATEGY: edit Claude → `cp` byte-identical to Codex → for gitlab/gitea, `cp` Claude then re-swap L38 classifier token (sed). `validate-script-sync.js` first `npm test` step catches Claude↔Codex drift.

## Test harness
- `scripts/simulate-workflow-walkthrough.js`: `validatePlanFixture(tmp, nodesRows, labels)` ~L800 writes a temp plan.md, runs `spawnSync(planValidatorScript, [planPath,'--json'], tmp)`, returns `JSON.parse(stdout)`. Fixture table = 6 cols (id|role|depends_on|declared_write_set|cardinality|shape).
- Tests named `testAdaptive<Feature>`, invoked in `main()` ~L8200-8242. Add `testAdaptiveSyncGroupGap()` ~L8224.
- Cases: (a) impl node declares `scripts/kaola-workflow-claim.js` w/o `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` → `result==='refuse'`, `errors` ~/sync-group gap/; (b) both declared → `result==='in-grammar'`; (c) a forge-rename port path → in-grammar (no false positive).
- No sibling `test-*.js` exercises plan-validator. Codex/GitLab/Gitea walkthroughs call `--freeze` on valid plans → remain green (syncMeta null).

## Gotchas
1. Byte-identity Claude↔Codex enforced by `npm test` first step — add new lines identically.
2. validate-script-sync.js stays root-only (NO plugin copies) — that is WHAT makes the forge graceful-null work.
3. No circular require / no load-order risk.
4. Check the UNION (plan-level), not per-node.
