# Implementation record — issue #892

Executed against `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895`
(branch `workflow/bundle-888-889-890-892-893-894-895`, HEAD `fa5157b3`). Nothing committed.

**Verification tier: `regression-green`** — every guard that reads the touched surfaces was green
before the change and is green after, plus three mutation probes proving the new pins are armed.

---

## 1. Files changed

### Authoring surfaces (the only ones edited by hand)

| file | change |
|---|---|
| `templates/routing/next.skeleton.md` | **4.1.** Replaced the three-line pointer sentence at `:205-207` with the inlined file shape: fenced `markdown` example, the four-field table, and the two facts that otherwise died with the deleted doc — `M` (*"Items are identified by their order in the file; nothing depends on a stable ID"*) and `P` (*"Fields appear in the order above and absent fields are simply absent"*). Both `dispatched` placeholders carry the locator half; the table's `dispatched` row uses root `CLAUDE.md:23`'s locator wording, not the deleted doc's. Surrounding paragraphs, the write moments (`:232-242`) and the resume rule (`:244-255`) untouched. |
| `templates/routing/init.skeleton.md` | **4.5(a)** — added the locator clause to the three-write-moments bullet in the KW-CLAUDE-TEMPLATE region (`:155`), reusing `next.skeleton.md`'s exact clause so init stays a strict subset. **4.5(d)** — deleted the redundant format restatement inside the skill-only `### How a run is coordinated` block; the paragraph now names the file and says no script owns it, with the four field names gone (copy count 7 → 6). **Part 5** — dropped the `docs/workflow-state-contract.md` line from the template's Documentation Map (`:198`). Step 4's scaffold list is byte-unchanged — no `docs/mission-list.md` line added. |
| `templates/routing/required-blocks.js` | **4.2** — `nx-mission-list.content_tokens`: removed `'docs/mission-list.md'`, added `'nothing depends on a stable ID'` and `'absent fields are simply absent'`; leading comment rewritten to say the format is *carried*, not pointed at. **4.5(b)** — added the new `in-mission-list` block (topic `init`, `both`/`both`) with the plan's six tokens and its derivation comment, immediately after `in-consent-in-conversation`. |

### Generated surfaces (regenerated, never hand-edited)

`node scripts/generate-routing-surfaces.js --write` → 18 surfaces; 12 changed (init ×6, next ×6):

```
commands/workflow-init.md                                       commands/workflow-next.md
plugins/kaola-workflow-gitlab/commands/workflow-init.md         …/workflow-next.md
plugins/kaola-workflow-gitea/commands/workflow-init.md          …/workflow-next.md
plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md      …/kaola-workflow-next/SKILL.md
plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md   …/kaola-workflow-next/SKILL.md
plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md    …/kaola-workflow-next/SKILL.md
```

The 6 finalize surfaces are unchanged.

### Deletion

- `docs/mission-list.md` — **`git rm`'d** (staged deletion, not committed). Landed in the same
  working state as 4.1/4.2 and every call site, per the plan's ordering note.

### Guards and call sites

| # (plan) | file | change |
|---|---|---|
| 5 | `scripts/test-route-reachability.js:805-806` | Deleted the `exists('docs/mission-list.md')` assert. Not repaired onto another path — the mechanism it guarded is gone. |
| 6 | `scripts/test-route-reachability.js` LEGACY_PAIRS | Deleted the `{ token: 'docs/mission-list.md', surfaces: NX_ALL }` row. `'mission-list.md'` kept. |
| 12 | `scripts/test-route-reachability.js:156` | The RED-ON-FIX assert. Second conjunct changed from `norm('docs/mission-list.md')` to `norm('nothing depends on a stable ID')`; message now reads *"names the run's mission list AND carries the format itself"*. First conjunct kept. |
| 8 | `scripts/validate-workflow-contracts.js:245` | `assertIncludes(file, 'docs/mission-list.md')` → two asserts, `'nothing depends on a stable ID'` and `'absent fields are simply absent'`. Comment at `:242-243` rewritten (*"carry the format itself rather than pointing at it"*), with the consumer-repo reason spelled out. |
| 9 | `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:245` | Identical edit — the pair is byte-identical again (`validate-script-sync.js` does not list it as drifted). The gitlab/gitea validators carry zero mission-list references, confirmed. |
| 10 | `scripts/test-generate-routing-surfaces.js:300` | `'docs/mission-list.md'` → `'nothing depends on a stable ID'` in the `next:` required-token list. `'mission-list.md'` (:299) and the `init:` entry (:290) left alone. |
| 20 | `scripts/test-ledger-compare.js:11,29` | Comments re-pointed. `:11` now reads *"lines of the mission-list format"*; `:29` cites `docs/decisions/0017-the-mission-list.md` (reflowed to 3 lines). No assertion depended on the path. |
| 21 | `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:479,542` | Both comments re-pointed at the ADR. |
| 22 | `scripts/validate-kaola-workflow-contracts.js:304` | **See item-22 judgment below — I removed the dead path.** |

### Documentation (dead references only; prose not rewritten)

| # | file | change |
|---|---|---|
| 2 | `CLAUDE.md:10-12` | Dropped the second link; the sentence now names ADR 0017 alone. |
| 2 | `CLAUDE.md:191` | Removed the `docs/mission-list.md` Documentation Map entry and reflowed the bullet. The field table at `:14-35` is **kept**, per the scope ruling. |
| 4 | `docs/README.md:3-5` | `[The mission list](mission-list.md)` → `(decisions/0017-the-mission-list.md)`; dropped the now-redundant trailing *"Its design record is [ADR 0017](…)"* sentence, which pointed at the same file. |
| 4 | `docs/README.md:9` | Deleted the `## Core` bullet for the removed file. The ADR is already listed under `## Decisions` at `:26`. |
| 13 | `README.md:923` | Deleted *"Full convention: [docs/mission-list.md](docs/mission-list.md)."* |
| 14 | `README.md:911` | Fixed the internally inconsistent fenced placeholder: the `done` item's `dispatched` now reads `<what went out and to whom, and where its output was to land>`, matching the `in-flight` item at `:907`. No other README prose touched. |
| 15 | `docs/api.md:7` | `mission-list.md` → `decisions/0017-the-mission-list.md` (reflowed to 2 lines). |
| 16 | `docs/architecture.md:27` | *"See `decisions/0017-…` for the derivation and `mission-list.md` for the file format"* → *"…for the derivation and the file format."* The field table at `:30-55` untouched, per the scope ruling. |
| 18 | `docs/workflow-state-contract.md:7` | `see mission-list.md for its format` → `see decisions/0017-the-mission-list.md for its format`. |
| 19 | `docs/workflow-state-contract.md:109` | Same re-point. |

`docs/decisions/0017-the-mission-list.md` — **not touched**, per the ruling.

---

## 2. Item-22 judgment: I removed the dead path

`scripts/validate-kaola-workflow-contracts.js:304` read:

```js
// #882: ADR 0017 (docs/decisions/0017-the-mission-list.md, docs/mission-list.md) retired the frozen
```

The plan recommended leaving it as an accurate description of a past state. **I removed the second
path**, leaving `// #882: ADR 0017 (docs/decisions/0017-the-mission-list.md) retired the frozen`.
Three reasons:

1. The parenthetical is a **locator**, not a historical claim. It says "ADR 0017 — you can read it at
   these paths." One of those paths now resolves to nothing. The sentence's historical content ("ADR
   0017 retired the frozen task-shaped DAG…") is untouched and still accurate.
2. The lead's own verification command — `git grep -n "docs/mission-list" …` expecting **no output**
   — cannot pass while this line stands. Leaving it would have meant reporting a failed verification
   over a comment nobody reads for its second path.
3. It is the only site where "leave it" and "the acceptance criterion" disagree, and the criterion is
   the cheaper thing to satisfy correctly.

---

## 3. Carved-out edits I did NOT make

### (a) `docs/conventions.md:5-6` — plan item 3

Currently (line 5-7, unchanged by me):

```markdown
**The workflow itself is `docs/mission-list.md`** (design record:
`docs/decisions/0017-the-mission-list.md`). Nothing here restates it. These are the rules for
building, testing, and releasing *this repository* and the surfaces it ships.
```

The edit I would have made — collapse the dead path into the design record already named on the next
line:

```markdown
**The workflow itself is `docs/decisions/0017-the-mission-list.md`.** Nothing here restates it. These
are the rules for building, testing, and releasing *this repository* and the surfaces it ships.
```

### (b) `kaola-workflow-adaptive-schema.js` ×4 — plan items 11, 23, 24, 25

Delete the line `  'docs/mission-list.md',` from `SELF_HOST_TEST_CONSUMED`. Note the root copy has
**moved**: it is now at `scripts/kaola-workflow-adaptive-schema.js:964` (the file shrank under
another agent's in-flight demolition), while the three plugin copies are still at `:1016`. The
explanatory comment block above the array never named the path, so nothing else changes.

---

## 4. New assert tokens added — for the tdd-guide to harden

Six literals are newly load-bearing. All are pinned; three are mutation-proven armed (§5).

| token | pinned in | reaches |
|---|---|---|
| `nothing depends on a stable ID` | `required-blocks.js` (`nx-mission-list`), `validate-workflow-contracts.js` + plugin twin, `test-generate-routing-surfaces.js` (`next:`), `test-route-reachability.js:156` | 6 tracked next surfaces + 6 additive-edition next surfaces |
| `absent fields are simply absent` | `required-blocks.js` (`nx-mission-list`), `validate-workflow-contracts.js` + plugin twin | same |
| `kaola-workflow/{project}/mission-list.md` | `required-blocks.js` (`in-mission-list`, new) | 6 init surfaces |
| `Three write moments` | `required-blocks.js` (`in-mission-list`, new) | 6 init surfaces |
| `BEFORE the work goes out` | `required-blocks.js` (`in-mission-list`, new) | 6 init surfaces |
| `where the output was to land` | `required-blocks.js` (`in-mission-list`, new) | 6 init surfaces |

(`the list minus done minus in-flight` and `mission, not a specification` are also in the new
`in-mission-list` block but were already pinned elsewhere for init.)

**Not pinned anywhere, and worth the tdd-guide's attention:** the fenced example block itself and the
four-field table rendered onto the next surfaces. `nx-mission-list` pins `status: todo`,
`in-flight` and `dispatched: self`, which the fence carries, but nothing asserts the **table** rows
or the locator wording *inside the table* (`and **where the output was to land**` on the `dispatched`
row) survives on the next surfaces. That row is the single site binding the locator to the field
definition on a shipped surface.

---

## 5. Mutation proofs — the new pins are armed

Backup/restore by `cp` from
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f018e2ef-7526-4575-bcc6-e529af9f0e2f/scratchpad/pristine/`.
No `git checkout --`, no `git stash`.

| mutation | `test-route-reachability.js` | `validate-workflow-contracts.js` |
|---|---|---|
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`: `nothing depends on a stable ID` → `items carry no ID` | exit 1 (**RED — armed**) | exit 1 (**RED — armed**) |
| same file: `absent fields are simply absent` → `unused fields are omitted` | exit 1 (**RED — armed**) | exit 1 (**RED — armed**) |
| `commands/workflow-init.md`: `where the output was to land` → `where its work happens` | exit 1 (**RED — armed**) | exit 0 (green — expected; the validator's `missionListVocabulary` set does not include the locator, and the new `in-mission-list` manifest block is its guard) |

After restore:

```
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
Route-reachability test passed (323 assertions).
Workflow contract validation passed
```

---

## 6. Verification

### Before (baseline at the start, tree as other agents left it)

```
generate-routing-surfaces.js --check   -> exit 0   all 18 surfaces byte-match the skeleton.
test-route-reachability.js             -> exit 0   Route-reachability test passed (325 assertions).
validate-workflow-contracts.js         -> exit 0   Workflow contract validation passed
test-generate-routing-surfaces.js      -> exit 0   all 432 assertions passed.
test-ledger-compare.js                 -> exit 0   Ledger-compare fence regression passed (40 assertions)
```

### After

```
node scripts/generate-routing-surfaces.js --write   -> exit 0   rendered 18 surfaces.
node scripts/generate-routing-surfaces.js --check   -> exit 0   all 18 surfaces byte-match the skeleton.
node scripts/test-route-reachability.js            -> exit 0   Route-reachability test passed (323 assertions).
node scripts/validate-workflow-contracts.js        -> exit 0   Workflow contract validation passed
node scripts/test-generate-routing-surfaces.js     -> exit 0   all 432 assertions passed.
node scripts/test-ledger-compare.js                -> exit 0   Ledger-compare fence regression passed (40 assertions)
node scripts/validate-kaola-workflow-contracts.js  -> exit 0   Kaola-Workflow Codex contract validation passed
```

325 → 323 assertions is exactly the two deleted asserts (the `exists()` check and the LEGACY_PAIRS row).

### Additional surface-adjacent suites (not on the lead's list; run because the diff touches prompt surfaces)

```
test-bash-block-guards.js            -> exit 0   all 7 assertions passed (#361 bash-block execution)
test-gap-sweep.js                    -> exit 0   gap-sweep tests passed (127 assertions)
test-suite-registration.js           -> exit 0   40 test-*.js files, 37 registered, 3 exempt / 472 assertions
test-validate-script-sync.js         -> exit 0   59 assertions
test-edition-sync.js                 -> exit 0   30 assertions
test-active-folders-field-parity.js  -> exit 0   119 assertions
validate-vendored-agents.js          -> exit 0   14 agents
test-agent-profile-parity.js         -> exit 0   768 assertions
```

### `edition-sync.js --check`

```
node scripts/edition-sync.js --check  -> exit 0
  edition-sync: 8 forge aggregator ports in parity with canonical.
  edition-sync: committed kernel parity verified at HEAD.
```

Green — it reads the kernel at HEAD, so the carved-out adaptive-schema edit does not reach it.

### `validate-script-sync.js` — **RED, and none of it is mine**

```
node scripts/validate-script-sync.js  -> exit 1
Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):
  - kaola-workflow-run-chains.js
  - kaola-workflow-release.js
  - adaptive-schema kernel copies (cross-edition drift anchor): plugins/kaola-workflow/scripts/… differs
  - adaptive-schema kernel copies: plugins/kaola-workflow-gitlab/scripts/… differs
  - adaptive-schema kernel copies: plugins/kaola-workflow-gitea/scripts/… differs
```

All five entries are files on the carved-out / do-not-touch list, held by other agents right now.
`validate-workflow-contracts.js` — the one twin pair I did edit — does **not** appear, confirming I
kept it in sync. Reported as expected, not worked around.

I did **not** run `npm test` / the claude fast gate: its first step is
`node scripts/edition-sync.js --materialize-kernel`, a **write** that would overwrite the three
carved-out plugin adaptive-schema copies from another agent's in-flight root file.

### The dead-pointer sweep

```
git grep -n "docs/mission-list" -- . ':!kaola-workflow/archive' ':!kaola-workflow/.origin' ':!CHANGELOG.md'
docs/conventions.md:5
plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js:1016
plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js:1016
plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js:1016
scripts/kaola-workflow-adaptive-schema.js:964
```

**Five hits, and all five are exactly the carved-out files** (§3). Every site in my scope is clear.
The sweep goes to zero the moment the lead lands the two carve-outs.

### The additive editions

Run in the **worktree** (`REPO = path.resolve(__dirname, '..')`, so the syncs write beside the
skeletons they read — the worktree is where the fix can be proven):

```
node scripts/sync-opencode-edition.js --write   -> exit 0   write complete (19 file(s) updated).
node scripts/test-opencode-edition.js           -> exit 0   opencode-edition test passed (490 assertions).
node scripts/sync-kimi-edition.js --write       -> exit 0   write complete (19 file(s) updated).
node scripts/test-kimi-edition.js               -> exit 0   kimi-edition test passed (505 assertions).
# plus --forge=gitlab and --forge=gitea for both: exit 0, "tree already in sync"
```

All six generated trees, grepped in the worktree:

```
grep -rn "docs/mission-list" .opencode .opencode-gitlab .opencode-gitea .kimi .kimi-gitlab .kimi-gitea
(no output — exit 1)
```

And each of the six installed next surfaces carries both new facts:

```
.opencode/command/workflow-next.md            stableID=1 absent=1
.opencode-gitlab/command/workflow-next.md     stableID=1 absent=1
.opencode-gitea/command/workflow-next.md      stableID=1 absent=1
.kimi/skills/workflow-next/SKILL.md           stableID=1 absent=1
.kimi-gitlab/skills/workflow-next/SKILL.md    stableID=1 absent=1
.kimi-gitea/skills/workflow-next/SKILL.md     stableID=1 absent=1
```

`opencode.json` is tracked and was **preserved** by the sync (`preserve opencode.json (user-owned;
use --write-config to overwrite)`) — it shows as unmodified in `git status`. The six trees are
gitignored (`.opencode/`, `.kimi/`, `.opencode-*/`, `.kimi-*/`), so nothing untracked leaks onto the
branch.

**The MAIN checkout's six trees still carry the pointer** — measured, all six files. That is correct
and not a gap: they were generated from `main`, which does not carry this change. They are generated
artifacts and go clean on the next sync/reinstall after this branch merges. Regenerating them now
would have synced them *to `main`*, which proves nothing and would disturb the owner's installed
state.

---

## 7. Not done / flagged

- **`CHANGELOG.md` has no `[Unreleased]` entry for this change.** Not in my brief, and a
  `changelog-draft-2` agent is active in this run — left to whoever owns that file so two agents do
  not write the same section.
- **`scripts/simulate-workflow-walkthrough.js` not run.** It is on the do-not-touch list, is
  currently mid-edit by another agent, and — measured — contains **zero** references to
  `mission-list`, `workflow-next.md`, or any token in this diff. A full-scope run (~10 min,
  spawn-bound, contending with concurrent agents) would have proven nothing about this change and
  risked a false red attributable to someone else's in-flight edit. Flagging rather than claiming it.
- **Consumer-repo acceptance** (*"initializing a fresh repo with no `docs/` reports nothing
  missing"*) was not executed — it needs a scratch repo, an `install.sh` run and a `/workflow-init`
  run. It is the plan's own open item and the only check that measures the *reading* site.
