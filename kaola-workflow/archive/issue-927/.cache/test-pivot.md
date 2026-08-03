# #927 pivot — test author's pass over `scripts/test-opencode-edition.js`

Custody: `scripts/test-opencode-edition.js` only. No production file was written; every mutation was
applied in a scratch mirror and deleted afterwards. No `git checkout --`, `git stash`, or any
reverting command was run at any point.

Suite on entry: **835 passed, 3 failed, exit 1** — all three `H1`.
Suite on exit: **514 passed, 0 failed, exit 0** (read from `$?` on the process, never through a pipe).

Per the coordinator's caution, every red below is anchored to an **assertion label**, not a count.

---

## 1. The H1 repair — the one that was legitimate

`H1 (#F3)` drove `hookPath` through a **named import**:

```js
"const { hookPath } = await import(pathToFileURL(process.env.KW_PLUGIN).href);"
```

The loader fix removed the named exports; `mod.hookPath` is now `undefined`, so the harness threw and
took all three H1 assertions with it. Repaired to the access path the plugin documents:

```js
"const { default: plugin } = await import(pathToFileURL(process.env.KW_PLUGIN).href);",
"const hookPath = plugin.hookPath;",
```

**Why this is a repair and not a pin rewritten ahead of its mechanism**: the mechanism H1 asserts —
the five-candidate `deployedPath` walk that resolves a hook from the plugin's own directory when the
project and config dir have none — is untouched and shipping. Only how a test reaches it changed. The
three assertions are unchanged in content and all three pass. The block's comment now records why a
named export here is not free, and points at A29 as the guard that holds the export shape to one.

---

## 2. Deleted with their mechanism

Nothing below was re-anchored, re-based or reworded to keep passing. Each deletion left a note in
place naming what the block pinned and why the subject is gone, so a later reader cannot re-add it by
accident.

| block | what it pinned | why it is gone |
|---|---|---|
| **A12** | `topTierRoles()` / `standardTierRoles()` — the role→tier split | both functions removed with per-role effort tiering |
| **S1-contract** | `effortForProvider` / `contractForProvider` — provider→API-contract resolution and its per-contract effort payloads | both removed from the ×4 anchor |
| **A12-options** | `renderOpencodeJson({inheritModel})`'s `agent.<role>.options` payload per contract, tier distinctness, `variant`/`variants` absence, the subagent-criterion half | the adaptive render is gone; `inheritModel` is no longer an argument |
| **A26 band** (harness, contract case table, A26-sidecar, A26-hook, A26-degraded) | the plugin's `chat.params` hook resolving a tier per call against a generated `effort-tiers.json` | the hook and the sidecar are both removed |
| **S2 (a)'s companion** — `assert(/reasoning-tier/ && /standard-tier/)` | that the badge block names the two tiers in neutral vocabulary | there is no tier split left to name |
| **A27's two role-set loops** (3 "EXTRA role" + 3 "MISSING role") | the config's role set vs the set the generator emits | the generator emits no `agent` block, so the baseline — and the whole "missing" direction — has no subject |
| helpers `stableJson`, `deepHasKey` | — | private to A12-options and A26; verified no other caller before removing |
| `require('./kaola-workflow-adaptive-schema.js')` | — | its only consumers here were `effortForProvider` / `contractForProvider` / `CONTRACT_EFFORT_TABLE` |
| two prior deletion notes (the `variant`-era assertions A12-options replaced) | — | a note about a deletion inside a block that is itself deleted documents nothing |

**Verified against the source, not the blast-radius list.** Two of that list's calls I checked and
disagreed with — see §5. The `A26 (#646)` / `A26 (#789)` assertions at what are now lines 976/978 are
a label collision (issue-scout placeholder checks inside A22) and were left alone, as the report
itself flagged.

---

## 3. Re-anchored, because the subject moved rather than vanished

### A27 — onto the reframed drift check
B's contract (`drift-feature-shape-for-tdd-guide.md`) was read **and independently confirmed against
`install-opencode.sh` itself** before anything was pinned: `staleEntries()` selects `agent.<role>`
entries carrying `variant` or `options`, computes no baseline, and the tier-protection refusal is
gone. What is pinned is the **result**, never B's sentences:

- every role whose entry carries a per-role effort setting is **named** — the fixture now carries
  **both** shapes this edition ever wrote (`options` on `planner`/`contractor`, the older `variant`
  on `issue-scout`/`workflow-planner`), so dropping either shape from the filter reds here;
- a role whose entry pins **only a model** is **not** named — `code-reviewer` in the same fixture;
- the config is left byte-identical; exit 0; the report names a flag; that flag adopts;
- after adoption the file is exactly `sync.renderOpencodeJson()` — the `{ inheritModel }` argument
  went with its mechanism rather than being left as an argument the generator now ignores.

`KAOLA_OPENCODE_INHERIT_MODEL` was removed from the A27 and A28 fixture environments for the same
reason: the installer no longer reads it, and a knob set by a test that nothing consumes is the dead
configuration this whole change exists to remove.

### S2 — onto the new badge heading
`BADGE_HEADING` is now `'Model and effort are inherited'`.

**The anchor-miss hardening proved itself in production during this pass.** When A's rewording
landed, the suite went red on
`S2[kaola-workflow-finalize.md]: the effort block is LOCATABLE under the exact heading …` — the
guard reported that its subject had moved instead of silently ranging over `null`. That is the
failure mode the Part One work existed to remove, observed live rather than in a mutation.

---

## 4. Added for the survivors

### A29 — the plugin loads, and opencode's loader walk finds exactly one factory
The A26 band was the **only** block that actually loaded the plugin. Deleting it would have dropped
the two surviving hooks from "registered" to "the source contains this string" (A11 is a grep, which
cannot tell a registered hook from a mentioned one and is blind to the export shape entirely). A29
loads the **shipped** `.opencode/plugins/` copy the way opencode does and asserts:

- **(a)** `Object.keys(mod)` is exactly `["default"]` — stated as the whole list, so a new export name
  nobody thought to exclude fails too;
- **(b)** opencode's own `for (const value of Object.values(mod))` walk meets no non-function export,
  throws nothing, and yields **exactly one** hook table;
- **(c)** `tool.execute.before` and `experimental.session.compacting` are functions on that table,
  neither throws when driven, a non-task call passes through untouched, and compaction pushes
  **nothing** when there is no workflow state under the root.

Deliberately **not** driven: `tool.execute.before` with `tool === "task"`. That branch runs the
deployed dispatch-log hook, which enumerates the repository's git worktrees and appends to its run
records — a test that writes into the tree it is testing, and into other agents' files. The reason is
recorded in the block.

### A27-quiet — the three inputs on which the check must say nothing
This closes the gap B named (its N4: over-firing was invisible because the negative control has no
`agent` block at all, so a check that lost its `variant`/`options` filter still passed it).

| case | fixture | asserted |
|---|---|---|
| `model-pins-only` | a full `agent` block whose every entry pins **only** a model | exit 0, **no** report, file byte-identical |
| `not-json` | `this is not json at all { "` | exit 0, no report, file byte-identical |
| `agent-wrong-shape` | `agent` present as an **array** | exit 0, no report, no crash |

Rows 1, 3 and 4 of B's six-row contract were already covered by the re-anchored A27 and A27-neg; these
are rows 2, 5 and 6.

---

## 5. What I refused to delete, and why

**S2 (a2) — the block-scoped `variant` check — and S2 (e), the body-wide mechanism-word sweep.**
The blast-radius report lists both as dying with the mechanism. I verified against the source and
disagree: neither reads any tier machinery. Their subject is the **generated prose tree**, which
survives whole, and their claim — this edition's prose must not present effort as a `variant`
mechanism — is *more* true after the pivot, not less, since `variant` is precisely the mechanism the
measurement showed never applied. Both are green against the reworded block.

> **One collision to be aware of, flagged rather than pre-solved.** opencode's own session-level
> `--variant` flag is a legitimate user-facing thing, and the pivot's rationale names it. If a future
> rewording of the badge block says something like "raise the session's effort with `--variant
> think`", sweep (e) will red. That red is correct-by-default and lands on me to narrow — it must not
> be silenced by widening the block. No such wording exists today, so nothing was changed for it.

**A14** (model-prose consistency) — listed as "possibly" dying. It asserts the absence of
`MUST pass model=` / `do not omit the model= line`, which is true under inheritance and under tiers
alike. Nothing tier-specific. Kept, unchanged.

**D0** — kept entirely, as the pivot brief says. It is *generated-tree* drift and collides with the
installer feature only by name.

**A28** — kept entirely; only the dead inherit-model env was removed from its fixture.

> **Incidental finding, not mine to fix.** D0 fired for real mid-pass: `.opencode/plugins/` had
> drifted from `templates/opencode/plugins/` after A's plugin edit landed without a regenerate. I
> regenerated all three forge trees (`sync --write` ×3, gitignored output) to proceed. Whoever lands
> the plugin change should regenerate as part of it, or D0 will exit 1 for the next reader.

---

## 6. Mutation proof — every new and re-anchored assertion is armed

Mirror (`cp -R`, `.git` removed, generated trees deleted so the suite self-provisions from the
mirror's own mutated sources). Production files in the worktree were never written to.

| mutation | reds (by label) | exit |
|---|---|---|
| none (control) | — `passed (514 assertions)` | **0** |
| `M-A29-nonfunction-export` — append `export const KW_TEST_HANDLE = 1;` | `A29: … exports EXACTLY ["default"] … Got ["KW_TEST_HANDLE","default"]`; `A29: … walk meets NO non-function export … Found: ["number"]` | **1** |
| `M-A29-named-helper-export` — append `export { hookPath, findRoot };` | `A29: … Got ["default","findRoot","hookPath"]`; `A29: NOTHING throws while the walk calls each exported value as a factory … Threw: ["The \"paths[0]\" argument must be of type …"]` | **1** |
| `M-A27-name-every-role` — drop the `variant`/`options` filter (**B's N4**) | `A27: the report does NOT name "code-reviewer" …`; `A27-quiet[model-pins-only]: NO drift report …` | **1** |
| `M-A27-silent-report` — silence `report_config_drift` | all four `A27: the report NAMES the role …`; `A27: … names an explicit opt-in flag …`; three `A28:` report-derived legs | **1** |
| `M-A27-always-fires` — remove the `stale.length === 0` early exit | `A27-neg`; `A27-quiet[model-pins-only]`; `A27-quiet[agent-wrong-shape]` | **1** |

`M-A29-named-helper-export` reproduces the historical failure exactly — the loader calling a helper
as a plugin factory and throwing `The "paths[0]" argument must be of type string`, which is what once
killed every hook in the file.

`M-A27-name-every-role` is the one B asked for: under it the installer starts naming a user's own
model-pin entry, and the suite now goes red on **two** distinct assertions instead of staying at the
same count.

---

## 7. Final state

```
cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927
node scripts/test-opencode-edition.js ; echo "REAL_EXIT=$?"
→ opencode-edition test passed (514 assertions). [drift-check: 3 tree(s) in parity]
→ REAL_EXIT=0
```

Green here is a lock-in over behaviour the implementers landed, not my verdict on it — §6 is the
evidence the locks are armed. `test-kimi-edition.js`, `simulate-workflow-walkthrough.js`,
`generate-routing-surfaces.js --check` and `validate-script-sync.js` are named in the pivot brief's
verification list but are not my artifact and were not run as part of this pass.

Files: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927/scripts/test-opencode-edition.js` (only file written).
Logs: `…/scratchpad/pivot-entry.log`, `…/scratchpad/pivot-final.log`; harness `…/scratchpad/mutate2.js`.
