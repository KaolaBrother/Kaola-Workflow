# impl-947 — retire the dangling "Codex Profile Freshness Gate" cross-reference

**Task**: issue #947. Remove the cross-reference to a section that exists on no surface, without
restoring the gate (refuted) and without changing what the `REGION:skill` directive renders.

**Verification tier**: `tests-green` — `scripts/test-route-reachability.js` is the authored suite for
this change; it was red before and is green after.

**Worktree**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-945-946-947-948`
(branch `workflow/bundle-945-946-947-948`).

## Files changed

| file | change |
|---|---|
| `templates/routing/next.skeleton.md` | authoring source — REGION justification rewritten; prose clause dropped |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | regenerated |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` | regenerated |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` | regenerated |

No rendered surface was hand-edited. All three came from `node scripts/generate-routing-surfaces.js
--write`.

## Skeleton diff

```diff
-<!-- REGION:skill — it defers to the Codex Profile Freshness Gate above as the authority on profile availability, and that gate renders on this surface only -->
+<!-- REGION:skill — it directs every spawn to the Codex Per-Spawn Model Routing contract above and to pass an explicit `model` and `reasoning_effort` pair on the call; that contract renders on this surface only, and command runtimes route each role's model from its installed profile with no per-spawn pair to pass -->
 ## Delegation

 Subagent delegation is the default posture and is established without asking the user. Invoke the
@@
 selected by the role's existing tier. Per-task model or reasoning-effort exceptions are not allowed.
 If the runtime genuinely cannot spawn a role agent, do the work inline and say so — that is a fact
-about tool availability, not a choice to present as a question. The Codex Profile Freshness Gate
-above is authoritative for profile availability; profile drift is not tool unavailability and must
-not be recorded as one.
+about tool availability, not a choice to present as a question. Profile drift is not tool
+unavailability and must not be recorded as one.
```

### The rewritten REGION justification

The directive is **kept**; only its recorded reason changed. The surviving reason is the one already
visible in the block it guards: the `## Delegation` prose sends every spawn to the `## Codex
Per-Spawn Model Routing` contract and requires an explicit `model` + `reasoning_effort` pair on the
call. That contract is itself inside a `REGION:skill` (`next.skeleton.md:2`), so it renders on the
Codex skill surface only, and the command runtimes resolve each role's model from its installed
profile with no per-spawn pair to pass. That is a genuine capability difference, matching the
convention every other region in these skeletons follows (each names a path, tool or channel present
on one runtime and absent on the other).

### The two clauses

- **Clause 1 — "The Codex Profile Freshness Gate above is authoritative for profile availability"**:
  **removed**. It is the dangling pointer; no section of that name renders anywhere. Restoring the
  gate is refuted (the responsibility now lives in the install/upgrade transaction and the explicit
  `--doctor` step on the init surface), and the removed section carried 6 of the 9 tokens T19
  forbids, so restoring it would red the guard.
- **Clause 2 — "profile drift is not tool unavailability and must not be recorded as one"**:
  **kept**, promoted to its own sentence. It states a live rule, it reads cleanly standing alone, and
  keeping it required **inventing no new cross-reference** — which is why it stayed rather than being
  dropped. It is the smallest honest edit.
- The immediately preceding live sentence ("If the runtime genuinely cannot spawn a role agent, do
  the work inline and say so — that is a fact about tool availability, not a choice to present as a
  question.") is **unchanged**; only its line wrap moved, because the paragraph reflowed.
- No provenance was written into the prose: the text carries the rule, never the issue number or the
  fact that a gate was removed.

## Regenerated-surface diffstat

```
 plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md  | 5 ++---
 plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md | 5 ++---
 plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md        | 5 ++---
 templates/routing/next.skeleton.md                                | 7 +++----
 4 files changed, 9 insertions(+), 13 deletions(-)
```

Each rendered surface loses exactly the three prose lines and gains the two that replace them —
nothing else moved. The REGION comment itself does not appear in the diff of the rendered files
because the generator consumes directives rather than emitting them, so rewriting the justification
changes the skeleton alone. `templates/routing/finalize.skeleton.md` and all three
`kaola-workflow-finalize/SKILL.md` were not touched and remain clean.

**Region behaviour unchanged** (the subtlety the brief flagged). Surfaces carrying `^## Delegation$`,
before vs. after — identical sets, so nothing gained or lost a section:

```
HEAD:  3 skill surfaces (github, gitlab, gitea kaola-workflow-next) + the skeleton
after: 3 skill surfaces (github, gitlab, gitea kaola-workflow-next) + the skeleton
```

## Verification commands — real exit codes, no pipes

| command | before | after |
|---|---|---|
| `node scripts/generate-routing-surfaces.js --check` | exit 0 — `all 18 surfaces byte-match the skeleton.` | exit 0 — `all 18 surfaces byte-match the skeleton.` |
| `node scripts/generate-routing-surfaces.js --write` | — | exit 0 — `rendered 18 surfaces.` |
| `node scripts/test-route-reachability.js` | **exit 1** — `Route-reachability test FAILED: 4 failure(s), 327 passed.` | **exit 0** — `Route-reachability test passed (331 assertions).` |
| `node scripts/test-generate-routing-surfaces.js` | not run | exit 0 — `all 434 assertions passed.` |

The four `before` failures were exactly the four T19 flags this change clears:

```
FAIL: T19 install boundary: templates/routing/next.skeleton.md contains no recurring Codex profile/config gate
FAIL: T19 install boundary: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md contains no recurring Codex profile/config gate
FAIL: T19 install boundary: plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md contains no recurring Codex profile/config gate
FAIL: T19 install boundary: plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md contains no recurring Codex profile/config gate
```

327 + 4 = 331: every previously-failing assertion now passes and no assertion was lost.

Note on why the skeleton was in that flagged set: T19's needle list is lowercased and matched against
lowercased content, and `profile freshness gate` is one of the nine tokens. The `REGION:skill`
comment at `:237` contained that phrase in title case, so the skeleton was flagged by its *comment*
even though the comment never renders. Rewriting the justification was therefore load-bearing for the
guard, not only for accuracy.

## Residual-occurrence search

`git grep -niP 'profile freshness gate'` over T19's full scope — the 2 skeletons and the 6 Codex
`SKILL.md` files — returns **no match** (exit 1). Repo-wide, the phrase survives only where it
belongs and where no prompt reads it: `CHANGELOG.md` (2 historical entries), `kaola-workflow/.origin/`
and `kaola-workflow/archive/bundle-940-941-942-943-944/` (the run records that filed this issue).
None is a prompt surface; all are correctly retained.

## Notes

- One process correction worth recording: an early `git diff --stat -- templates/routing/ 'plugins/*/skills/'`
  printed an empty rendered-surface diff. That pathspec (trailing-slash glob) matches nothing in git;
  it was a bad query, not an unchanged tree. `git status --porcelain` showed all three SKILL.md files
  modified, and the diffstat above is from the corrected pathspec.
- No unexpected failures were seen, so no serial re-run was needed.
- `git status` in this worktree also shows `install.sh`, `scripts/test-route-reachability.js`,
  `scripts/test-generate-routing-surfaces.js` and `scripts/test-opencode-edition.js` modified by
  other agents. None of those is mine and none was touched by me. In particular the
  case-insensitive matching in `test-route-reachability.js` landed before this change, on purpose —
  it is what made the suite red, and I did not alter it.
