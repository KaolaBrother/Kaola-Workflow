# issue-1007 — guard half: the axiom-pointer pin

Baseline commit: `66ac0442` (worktree `.kw/worktrees/issue-1007`, clean at start).
Test custody: `tdd-guide`. No routing skeleton, no rendered surface, no `templates/axioms.md`,
no doc was edited.

## Files written

- `templates/routing/required-blocks.js` — restores the `nx-first-principles` manifest block
  (content-led, `topic:'next'`, `runtime_tag:'both'`, `surface_type_tag:'both'`, five tokens).
- `scripts/test-route-reachability.js` — hoists `readRealSurface`; adds the AXIOM POINTER SANITY
  band; adds RED-PROOF (8), a per-surface arming loop.

`docs/conventions.md` is modified in this worktree by another agent. Not mine, untouched.

## THIS PIN CANNOT BE RED AT BASELINE

All 12 `next` surfaces carry the pointer at `66ac0442`. This restores an absent guard; it does not
catch a live defect. What IS measured at baseline is that the suite was blind:

```
$ git archive HEAD | tar -x -C scratch/base && cd scratch/base
$ node scripts/test-route-reachability.js
Route-reachability test passed (368 assertions).   EXIT=0
$ node strip.js commands/workflow-next.md          # pointer paragraph removed from a shipped surface
$ node scripts/test-route-reachability.js
Route-reachability test passed (368 assertions).   EXIT=0     <-- BLIND
```

With the pin installed, same tree, same mutation:

```
FAIL: MANIFEST missing-token: block nx-first-principles token "When nothing already settles a situation" absent from commands/workflow-next.md
Route-reachability test FAILED: 17 failure(s)     EXIT=1
```

## Mutation table — one mutant at a time, scratch copy only

Surface mutants (pointer paragraph removed from ONE surface, pin installed):

| mutant (tracked next surface)                                   | exit | surfaces NAMED in the failure |
|---|---|---|
| `commands/workflow-next.md`                                     | 1 | itself + `.opencode/command/workflow-next.md` + `.kimi/skills/workflow-next/SKILL.md` |
| `plugins/kaola-workflow-gitlab/commands/workflow-next.md`       | 1 | itself + `.opencode-gitlab/...` + `.kimi-gitlab/...` |
| `plugins/kaola-workflow-gitea/commands/workflow-next.md`        | 1 | itself + `.opencode-gitea/...` + `.kimi-gitea/...` |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`    | 1 | itself only |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | 1 | itself only |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`  | 1 | itself only |
| all restored                                                    | 0 | 376 assertions |

Guard-machinery mutants:

| mutant | fires | message |
|---|---|---|
| delete the `nx-first-principles` block (the historical `ea84673d` edit) | YES | `axiom pointer: the manifest must carry the nx-first-principles block …` |
| `surface_type_tag: 'both'` -> `'command'` | YES (both width asserts) | `… must obligate all 12 next surfaces (both/both), got 9` |
| token list replaced by prose that survives the strip (vacuous pin) | YES | `RED-PROOF axiom-pointer: … reddened no failure naming it` |
| one survivor token + one real token | no (by design: floor, not ceiling) | — |
| drop the `gitea` forge from both edition tables (universe 12 -> 8) | LITERAL fires, DERIVED does not | `… obligated on 8 next surface(s), expected 12` |

The forge-drop row is the reason the literal exists: the derived `everyTree` comparison went green
over a universe that had shrunk by four surfaces.

## Chains

`node scripts/test-route-reachability.js` runs in `test:kaola-workflow:claude` and
`test:kaola-workflow:claude:full`. `npm test` = claude && codex && gitlab && gitea, so it runs.
Not sharded (that is the walkthrough only). Not hoisted (hoisting is for steps in >1 chain).
Neither changed file is an edition-coupling path by `isEditionCouplingPath` — `templates/` is not a
`ROOT_EDITION_READ_PREFIX`, and `scripts/test-route-reachability.js` has no
`plugins/kaola-workflow/scripts/` mirror and is executed by no forge chain — so a finalize diff
limited to these two files selects `claude-only`, which is exactly the chain that runs the suite.

## Additive editions — measured, not assumed

`readRealSurface` branch taken by each of the 12 obligated next surfaces:

```
DISK READ        commands/workflow-next.md
DISK READ        plugins/kaola-workflow-gitlab/commands/workflow-next.md
DISK READ        plugins/kaola-workflow-gitea/commands/workflow-next.md
IN-MEMORY RENDER ../../../.opencode/command/workflow-next.md
IN-MEMORY RENDER ../../../.opencode-gitlab/command/workflow-next.md
IN-MEMORY RENDER ../../../.opencode-gitea/command/workflow-next.md
IN-MEMORY RENDER .kimi/skills/workflow-next/SKILL.md
IN-MEMORY RENDER .kimi-gitlab/skills/workflow-next/SKILL.md
IN-MEMORY RENDER .kimi-gitea/skills/workflow-next/SKILL.md
DISK READ        plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
DISK READ        plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
DISK READ        plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
```

The 6 additive-edition renders are TRANSITIVELY protected, not independently watched: each is
rendered in memory from its forge's tracked command surface, which is why stripping one tracked
command surface names three paths. Hermetic and provisioning-free — the `.opencode`/`.kimi` trees
are gitignored and absent from this worktree, and the check neither reads them nor skips when they
are missing.

## What this pin cannot witness

- **An on-disk `.opencode`/`.kimi` tree that has gone stale.** The pin reads the render, never the
  installed tree. A tree left behind by an older `--write` can have lost the pointer with nothing
  here to see it. That surface is read only by `test-opencode-edition.js` A25, in
  `test:kaola-workflow:editions`, still outside `npm test`.
- **A pointer that is present and wrong.** Five substrings in the right surface prove nothing about
  what sits between them. A paragraph could name the block, the file and the order, and still send
  a reader somewhere useless.
- **A pointer whose referent stopped existing.** The band asserts `templates/axioms.md` exists; it
  does not check that a consumer's `CLAUDE.md` actually carries a `## First Principles` block. On a
  repo initialised before the axiom layer, the pointer resolves to nothing and this stays green.
- **One vacuous token among several.** The red-proof enforces a floor — at least one token dies
  with the paragraph — not that every token does. Measured: one survivor plus one real token passes.
- **A reworded pointer that keeps all five rules.** By design. It is not the pin's job to freeze
  the sentence, and a rewrite that dropped a rule reds on that rule.
- **The `**First Principles.**` lead being renamed** does not go unnoticed, but it disarms nothing
  quietly: the red-proof reports the surface as unwitnessed rather than skipping it.

## Stale prose this change creates — NOT fixed here (doc half owns it)

- `docs/conventions.md:866-867` — "The six `next` routing surfaces carry a short reference pointer …
  that pointer is prose the generator renders, **not a `required-blocks.js` entry**." Both halves are
  now false: it IS an entry, and the obligated set is twelve, not six.
- `docs/decisions/D-645-01.md:42-49` — "all six generated `next` surfaces". Twelve.

## Observation, reported not fixed

`D-645-01` §5 says "The axiom text itself states this: never cite an axiom to justify skipping a
typed gate, refusal, or barrier." That clause is present in NEITHER `templates/axioms.md` NOR any
`next` surface at `66ac0442` — measured, 0 occurrences. It was `c4ae5c43`'s second `nx-first-principles`
token and it is gone. That is why the restored block does not pin it, and why the subordination
token (`'When nothing already settles a situation'`) is the surface's only remaining carrier of that
boundary. Whether the tighten-only clause should come back is a values call, not mine.
