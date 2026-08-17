# Step 7 prose landed — implementer record

**Task**: insert authored paragraphs A and B into `templates/routing/finalize.skeleton.md` inside the
`<!-- PIN: forge-is-the-backlog -->` span, and regenerate the surfaces that render from it.

**Verification tier**: `tests-green` — the authored manifest guard (`scripts/test-route-reachability.js`)
passes; it was red before the change and green after, measured by me in both directions.

Source of truth read: `kaola-workflow/bundle-992-993-994/.cache/step7-prose-authored.md` (current
contents, post-amendment). Nothing was paraphrased, reworded, or improved. No test artifact was edited.

---

## Files changed (by me)

Skeleton, hand-edited:

- `templates/routing/finalize.skeleton.md`

Rendered surfaces, produced by `generate-routing-surfaces.js --write` (never hand-edited) — the 6
tracked surfaces that render from this skeleton:

- `commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`

Additionally refreshed by the same `--write` run, in gitignored edition trees (reported by the tool,
not tracked by git):

- `.opencode/command/kaola-workflow-finalize.md`, `.opencode-gitlab/...`, `.opencode-gitea/...`
- `.kimi/skills/kaola-workflow-finalize/SKILL.md`, `.kimi-gitlab/...`, `.kimi-gitea/...`

`--write` reported: `rendered 18 surfaces.` plus `sync-opencode-edition: refreshed 3 present tree(s)`
and `sync-kimi-edition: refreshed 3 present tree(s)`.

## NOT touched — the other agent's files

`git status` in this shared worktree also shows these modified. They are the concurrent agent's work
and I left them exactly as found:

- `scripts/test-bundle-finalize.js`
- `scripts/simulate-workflow-walkthrough.js`
- `scripts/test-finalize-door.js` (appeared modified between my first and last `git status` — the
  other agent is still working)
- `templates/routing/required-blocks.js` (the test artifact; read only, never written)

## Wording fidelity — how it was proven, not asserted

The two paragraphs were extracted programmatically from `step7-prose-authored.md` and compared, after
`\s+ -> ' '` whitespace normalization, against the exact text inserted. Both matched:

```
A match: True
B match: True
```

Re-wrapping is the only transformation applied. The wrap keeps backtick code spans atomic, so
`` `## Proposed remedy (non-binding)` ``, `` `filed: #N` `` and `` `## Run gaps` `` are never split
across a line break. Non-ASCII inventory of the canonical file is exactly `—` (U+2014) and `–`
(U+2013, placement note only); all apostrophes are ASCII — the inserted text uses the same.

## The diff — additive only

`git diff --numstat` over the skeleton and all six rendered surfaces:

```
16	0	commands/kaola-workflow-finalize.md
16	0	plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
16	0	plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
16	0	plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
16	0	plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
16	0	plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
16	0	templates/routing/finalize.skeleton.md
```

**+16 / -0 on every file. Zero deleted lines anywhere** (`git diff -U0 ... | grep -c '^-[^-]'` returns
`0`). That is the byte-identity proof requested: the existing filing paragraph, the existing correction
paragraph, the `independent slices` paragraph, the `KAOLA_GOAL` advisory, the bash fence and the
`## Run gaps` heading are all untouched — an unchanged line cannot appear in an all-additive diff.

Full skeleton diff:

```diff
diff --git a/templates/routing/finalize.skeleton.md b/templates/routing/finalize.skeleton.md
index fee0e7a3..b0b3772e 100644
--- a/templates/routing/finalize.skeleton.md
+++ b/templates/routing/finalize.skeleton.md
@@ -240,6 +240,22 @@ record `noise: <justification>`. If you hand-typed a `## Run gaps` row the scann
 append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the
 scanner, so what is written was actually swept.
 
+Structure the body of the issue you file so the next run can separate evidence from inference. In
+that body, `## Measured` carries only what this run observed, and every figure there names the
+commit it was measured at and the command or artifact it came from — an unstamped number does not
+belong in that section. `## Hypothesis` carries attributions no run has confirmed; a cause derived
+by reading code lands there by default, phrased as a claim to test.
+`## Proposed remedy (non-binding)` is optional and carries that label when it appears. Add one
+`searched:` line recording the duplicate probe you actually ran — its query and its hit count, at
+the mechanism or symbol level, since a title-word search will not find a symbol the forge has
+tokenized. This adds no measurement obligation: it forbids exactly one thing, an unstamped figure
+or an unrun attribution presented as established fact.
+
+After filing, confirm the issue exists and its body is non-empty, and record the issue number and
+the body length you saw in this run's own record — a create that failed silently leaves a
+`filed: #N` pointing at nothing. That record is the mission list's result line, never the
+`## Run gaps` row, whose grammar the scanner owns.
+
 When this run's own findings contradict or correct the issue as filed — a wrong premise, a disproved
 figure, a symptom that never existed, a justification the run replaced — post that correction as a
 comment on the issue before it closes. Never close quietly against text now known to be wrong. A
```

Constraint compliance: no new `<!-- PIN -->` marker, no `<!-- REGION -->`, no forge CLI named
(`the forge has tokenized` uses the neutral term already standard in this file). Wrap is 97 columns
max, inside the file's existing ~99-column style.

## Verification — commands and their own exit codes

Every exit code below is the command's own `$?`, captured immediately after the command, never
through a pipe.

### After the change (in the worktree)

| command | exit code | output |
|---|---|---|
| `node scripts/generate-routing-surfaces.js --write` | **0** | `rendered 18 surfaces.` |
| `node scripts/generate-routing-surfaces.js --check` | **0** | `all 18 surfaces byte-match the skeleton.` |
| `node scripts/test-route-reachability.js` | **0** | `Route-reachability test passed (331 assertions).` |

**Surface count reported by `--check`: 18.**
**Reachability result: PASS, 331 assertions, 0 failures.**

### Before the change — measured, not inherited

I edited the skeleton before running the guard, so rather than repeat the brief's claim I reconstructed
the pre-change state and ran it. The shared worktree was **not** mutated: I `rsync`-copied the worktree
(excluding `.git`) to scratch and restored only my 7 files to their `HEAD` contents there, leaving the
other agent's in-progress `required-blocks.js` manifest exactly as it is in the working tree. That is
precisely the "new manifest, old prose" state.

| command (in the isolated baseline copy) | exit code | output |
|---|---|---|
| `node scripts/generate-routing-surfaces.js --check` | **0** | `all 18 surfaces byte-match the skeleton.` |
| `node scripts/test-route-reachability.js` | **1** | `Route-reachability test FAILED: 85 failure(s), 330 passed.` |

The 85 failures are **84 `missing-token` findings** plus one rollup line
(`MANIFEST: derived-universe presence check clean over 228 obligated file-checks`). This matches the
brief's stated red state exactly. First two findings, for the record:

```
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "`## Measured` carries only what this run observed" absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "every figure there names the commit it was measured at and the command or artifact it came from" absent from commands/kaola-workflow-finalize.md
```

So the transition attributable to this change is **exit 1 / 330 passed / 85 failed → exit 0 / 331
passed / 0 failed**. `--check` was green on both sides, which is the expected shape: the baseline was
an internally consistent skeleton+surface pair, so the only guard that fired was the manifest one.

Baseline artifacts (scratch, disposable):
`/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/607013db-019a-47f2-9fe6-c8063e68a638/scratchpad/baseline/reach-before.txt`

## Scope notes

- Per the brief I ran **only** the two verification commands. No `npm test`, no four-chain run.
- Nothing was committed.
- No test file was written, weakened, or skipped. `templates/routing/required-blocks.js` was read to
  understand the pinned tokens and never modified.
