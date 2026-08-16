# `test-generate-routing-surfaces.js` — `requiredByTopic.init` re-pointed off the retired mirror

## 1. Dropped `'kaola-workflow/ROADMAP.md'`

Removed from `requiredByTopic.init` in `scripts/test-generate-routing-surfaces.js:288`. Confirmed
before touching anything that it's genuinely absent from all six rendered init surfaces (`grep -c`
= 0 on `commands/workflow-init.md`, both plugin command copies, and all three skill copies) — the
token had no home to be re-pointed to; the rule it named is retired, not moved.

`'kaola-workflow/.roadmap/'` on the next line — left untouched, verified it still propagates
(`grep -c` = 2 on all six surfaces: `.roadmap/_rules.md` is the one optional local file that
survives).

## 2. Added `'there is no local mirror to refresh'`

Chosen over the other two candidates you named, and only after reading the rendered surfaces, not
by assumption:

- `KW-CLAUDE-MANAGED-START` — present in all six, but it's the *region* marker, not the rule; it
  would pass regardless of whether the backlog rule's own prose ever reached the surface. Doesn't
  pin the thing that needs pinning.
- `<!-- PIN: forge-is-the-backlog -->` — present in all six, but it wraps **three** separate
  chunks in `init.skeleton.md` (the `.roadmap/_rules.md` note at :176-181, the backlog rule at
  :183-185, and the `priority_top_tier_labels` note at :190-192). As a token it can't distinguish
  "the rule that replaced ROADMAP.md" from either of the other two — a mutation to any of the
  three chunks alone wouldn't necessarily be the one this token was meant to catch.
- **`'there is no local mirror to refresh'`** — the distinctive tail of the actual rule prose
  (`init.skeleton.md:184`: "Roadmap/research sessions create or refine issues on the forge;
  workflow runs implement one selected set — there is no local mirror to refresh."). Verified
  present in all six rendered init surfaces before adding it (`grep -c` = 1 each). It's also the
  style already used by every other `init` entry in this list — literal content substrings, not
  markers — so it stays consistent with its neighbors rather than borrowing the marker-token style
  `next`/`finalize` use for their `<!-- PIN: ... -->` entries.

## 3. Mutation proof (teeth check)

Snapshotted `templates/routing/init.skeleton.md`, then at line 184 replaced the phrase with
`workflow runs implement one selected set. /* MUTATION-984 */` (removing "there is no local mirror
to refresh" entirely). Regenerated via `node scripts/generate-routing-surfaces.js --write`
(succeeded, 18 surfaces rendered — the writer itself doesn't validate content), then ran
`node scripts/test-generate-routing-surfaces.js`:

```
FAIL: real init token there is no local mirror to refresh propagates to commands/workflow-init.md
FAIL: real init token there is no local mirror to refresh propagates to plugins/kaola-workflow-gitlab/commands/workflow-init.md
FAIL: real init token there is no local mirror to refresh propagates to plugins/kaola-workflow-gitea/commands/workflow-init.md
FAIL: real init token there is no local mirror to refresh propagates to plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
FAIL: real init token there is no local mirror to refresh propagates to plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
FAIL: real init token there is no local mirror to refresh propagates to plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
test-generate-routing-surfaces: 6 assertion(s) FAILED (428 passed).
```

All six named, naming exactly the new token. Restored `init.skeleton.md` from snapshot (`diff`
clean, `grep -c MUTATION-984` = 0), regenerated `--write` again, and re-ran the test: back to
`all 434 assertions passed`. `git status --porcelain` after the whole round-trip shows only the
intended `scripts/test-generate-routing-surfaces.js` edit — the skeleton and all 18 generated
surfaces are back to the committed byte-for-byte state (nothing hand-touched, per your
instruction — every edit to a surface went through `--write`/`--check`).

## Gates

All four run standalone, exit codes echoed separately, none piped:

- `node scripts/test-generate-routing-surfaces.js` — **EXIT 0**, `all 434 assertions passed`
- `node scripts/generate-routing-surfaces.js --check` — **EXIT 0**,
  `all 18 surfaces byte-match the skeleton`
- `node scripts/test-route-reachability.js` — **EXIT 0**, `Route-reachability test passed
  (331 assertions)`
- `node scripts/simulate-workflow-walkthrough.js` (full, unsharded) — **EXIT 0**,
  `##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":185,
  "ran":185,"passed":185,"failed":0}`, `Workflow walkthrough simulation passed`

Nothing committed. Diff is one line changed in `scripts/test-generate-routing-surfaces.js`
(1 insertion, 1 deletion, the `requiredByTopic.init` entry).
