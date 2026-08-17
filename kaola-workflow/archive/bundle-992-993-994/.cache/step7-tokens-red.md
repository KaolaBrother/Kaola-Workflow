# Step 7 manifest tokens — RED proof

Worktree `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-992-993-994`,
branch `workflow/bundle-992-993-994`.

```
RED: MANIFEST missing-token × 84 (7 new tokens × 12 obligated finalize surfaces)
     block fn-forge-is-the-backlog — the authored Step 7 prose is not in the skeleton yet
baseline: c62e8a3fb6c38ae17c721211065233dca1f38442
```

Only file touched: `templates/routing/required-blocks.js`. The skeleton and every rendered surface
are untouched (`git status --porcelain` shows exactly one `M`). Not committed.

---

## 1. Clean baseline — PASS

Tree clean at `c62e8a3fb6c38ae17c721211065233dca1f38442` (`git status --porcelain` empty), before any edit:

```
$ node scripts/test-route-reachability.js
Route-reachability test passed (331 assertions).
EXIT=0
```

That is the suite's entire stdout — it prints one line on success. I am not on a red baseline.

---

## 2. The diff

```diff
diff --git a/templates/routing/required-blocks.js b/templates/routing/required-blocks.js
index 959eed8f..8faf063e 100644
--- a/templates/routing/required-blocks.js
+++ b/templates/routing/required-blocks.js
@@ -345,10 +345,26 @@ const REQUIRED_BLOCKS = [
     ],
   },
   {
-    // One span at Step 7 — the run-gap-sweep filing rule and the correction-posting
-    // rule that follows it. The correction paragraph is the newer half: it is what
-    // makes "the forge is the backlog truth" survive contact with a run that finds
-    // the filed issue was wrong, rather than closing quietly over stale text.
+    // One span at Step 7, carrying four independent rules: what to file, how the
+    // filed body is typed, that the filing was verified to have landed, and what to
+    // do when the run's own findings correct the issue it is closing. The correction
+    // rule is what makes "the forge is the backlog truth" survive contact with a run
+    // that finds the filed issue was wrong, rather than closing quietly over stale
+    // text; the typed-body and verification rules are what keep the thing it files
+    // from being unreadable to the next run, or from not existing at all.
+    //
+    // Tokens are drawn from every one of the four rules, one per obligation rather
+    // than one per paragraph, so gutting a single obligation — the stamping duty,
+    // the reading-derived-cause default, the non-binding remedy label, the duplicate
+    // probe, the existence-and-body check, or where that check is recorded — reds
+    // this block even with the marker and the other obligations intact. None is a
+    // substring of the marker.
+    //
+    // NOT pinned, deliberately: the scope-limiting close of the typed-body rule
+    // ("This adds no measurement obligation…") states what the rule does NOT demand,
+    // and the negative restatement of the stamping duty ("an unstamped number does
+    // not belong in that section") re-expresses an obligation already pinned below.
+    // Pinning either would freeze wording that carries no obligation of its own.
     block_id: 'fn-forge-is-the-backlog',
     topic: 'finalize',
     runtime_tag: 'both',
@@ -360,6 +376,19 @@ const REQUIRED_BLOCKS = [
       'post that correction as a comment on the issue before it closes.',
       'Never close quietly against text now known to be wrong.',
       'A correction is not a follow-up: a follow-up is new work with its own `filed: #N`; a correction is the record of what this issue turned out to be, and it lands on the issue it corrects.',
+      // The typed body: the section that carries only observation, the stamping duty
+      // that makes it observation, the section unconfirmed attributions default into,
+      // the label the optional remedy must wear, and the duplicate probe.
+      '`## Measured` carries only what this run observed',
+      'every figure there names the commit it was measured at and the command or artifact it came from',
+      '`## Hypothesis` carries attributions no run has confirmed; a cause derived by reading code lands there by default',
+      '`## Proposed remedy (non-binding)` is optional and carries that label when it appears.',
+      'Add one `searched:` line recording the duplicate probe you actually ran — its query and its hit count',
+      // The filing verification: the check itself, and the record it lands in. The
+      // second is not decoration — routing it to the `## Run gaps` row instead would
+      // put free text through a strict parser-owned grammar the scanner owns.
+      'confirm the issue exists and its body is non-empty, and record the issue number and the body length you saw in this run\'s own record',
+      'That record is the mission list\'s result line, never the `## Run gaps` row',
     ],
   },
```

Constraints held:

- **Five existing tokens untouched and unreordered** — the diff appends only; the `-` lines are all
  comment.
- **No new block, no new PIN marker.** The seven tokens join the existing
  `fn-forge-is-the-backlog` block, so the reverse orphan-sentinel is unaffected and no
  `orphan-surface` appears anywhere in the red output.
- **Every token verified a substring of the canonical prose before the run**, by normalizing
  `step7-prose-authored.md` with the suite's own `norm` and testing `includes()` — not by eye.
  All 7: `inProse=true`. None is a substring of `<!-- PIN: forge-is-the-backlog -->`, so the
  non-vacuity floor (`test-route-reachability.js:986-1020`) is satisfied by construction.
- Token lengths 8–25 words: each spans one obligation's verb and object, not a whole paragraph.

### Token → obligation map

| # | token (abbrev.) | obligation |
|---|---|---|
| 1 | ``​`## Measured` carries only what this run observed`` | A — the section carries observation *only* |
| 2 | `every figure there names the commit it was measured at and the command or artifact it came from` | A — the stamping duty |
| 3 | ``​`## Hypothesis` carries attributions no run has confirmed; a cause derived by reading code lands there by default`` | A — the read-derived-cause default |
| 4 | ``​`## Proposed remedy (non-binding)` is optional and carries that label when it appears.`` | A — the non-binding label |
| 5 | ``Add one `searched:` line recording the duplicate probe you actually ran — its query and its hit count`` | A — the duplicate probe |
| 6 | `confirm the issue exists and its body is non-empty, and record the issue number and the body length you saw in this run's own record` | B — existence + non-empty body + what to record |
| 7 | ``That record is the mission list's result line, never the `## Run gaps` row`` | B — recorded in the run's own record, not the parser-owned row |

Tokens 1 and 2 both serve paragraph A's stamping duty deliberately: 1 pins the heading and its
restriction, 2 pins the provenance requirement. Splitting costs no extra pinned words and makes the
failure diagnostic name which half went missing.

---

## 3. RED — the failing run

```
$ node scripts/test-route-reachability.js
EXIT=1
Route-reachability test FAILED: 85 failure(s), 330 passed.
```

85 = **84 `missing-token` findings** + 1 rollup (`FAIL: MANIFEST: derived-universe presence check
clean over 228 obligated file-checks`, the summary assert the same check emits when its failure list
is non-empty). **Every one of the 84 names `block fn-forge-is-the-backlog`.** There is no
`orphan-surface`, no `absent-surface`, no `orphan-manifest`, and no failure outside the manifest
check. Baseline 331 passed → red 330 passed: the single lost assertion is that rollup, so nothing
unrelated regressed.

Verbatim, the seven findings for `commands/kaola-workflow-finalize.md` (the other eleven surfaces
report the identical seven, differing only in the trailing path):

```
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "`## Measured` carries only what this run observed" absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "every figure there names the commit it was measured at and the command or artifact it came from" absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "`## Hypothesis` carries attributions no run has confirmed; a cause derived by reading code lands there by default" absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "`## Proposed remedy (non-binding)` is optional and carries that label when it appears." absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "Add one `searched:` line recording the duplicate probe you actually ran — its query and its hit count" absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "confirm the issue exists and its body is non-empty, and record the issue number and the body length you saw in this run's own record" absent from commands/kaola-workflow-finalize.md
FAIL: MANIFEST missing-token: block fn-forge-is-the-backlog token "That record is the mission list's result line, never the `## Run gaps` row" absent from commands/kaola-workflow-finalize.md
```

Full log: `kaola-workflow/bundle-992-993-994/.cache/step7-tokens-red-run.log`.

### Obligated surfaces that reported: 12

The survey's derived set, confirmed by the run — every token reported on all 12, so the per-token
tally is a uniform `12`:

```
commands/kaola-workflow-finalize.md
plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
../../../.opencode/command/kaola-workflow-finalize.md
../../../.opencode-gitlab/command/kaola-workflow-finalize.md
../../../.opencode-gitea/command/kaola-workflow-finalize.md
.kimi/skills/kaola-workflow-finalize/SKILL.md
.kimi-gitlab/skills/kaola-workflow-finalize/SKILL.md
.kimi-gitea/skills/kaola-workflow-finalize/SKILL.md
```

3 claude commands + 3 codex skills (on disk) + 3 opencode + 3 kimi (rendered in memory). The six
generated trees are gitignored, so their reporting confirms the in-memory render path
(`test-route-reachability.js:794-812`) is live in this worktree — the check is not vacuous here.

### Why the red is the missing-prose red and not pre-existing breakage

Four independent confirmations:

1. The same command exited **0** on the clean tree at the same SHA (§1).
2. All 84 findings are `missing-token` on `fn-forge-is-the-backlog`; the only other failure is that
   check's own rollup.
3. Before editing, I normalized all six tracked finalize surfaces and searched for each token:
   `present: 0` on every surface. The tokens are absent because the prose is absent.
4. The mutation proof below shows the identical tokens go **green** the moment the authored prose is
   inserted.

---

## 4. Mutation proof — each token is independently armed

A red suite proves the prose is missing; it does not prove each token would catch a *gutting* once
the prose lands. `kaola-workflow/bundle-992-993-994/.cache/step7-tokens-mutation-proof.js` (re-runnable:
`node <that path>`) replicates the suite's matching exactly
(`norm` at `:23`, `includes` at `:915`), builds the would-be surface in memory — today's
`commands/kaola-workflow-finalize.md` with paragraphs A and B read verbatim from
`step7-prose-authored.md` and inserted at the authored anchor — and runs one mutant per obligation.
**The skeleton was never written to.**

```
[0] green simulation (authored prose inserted verbatim): all 13 tokens present
[1] A1 Measured restriction: drop "only"                        -> missing=[1]
[2] A2 stamping duty: drop the provenance half                  -> missing=[2]
[3] A3 "lands there by default" -> "may land there"             -> missing=[3]
[4] A4 remedy label: drop "(non-binding)"                       -> missing=[4]
[5] A5 searched: drop the probe sentence opener                 -> missing=[5]
[6] B1 filing check: drop the non-empty-body half               -> missing=[6]
[7] B2 record location: "never" -> "or"                         -> missing=[7]
MUTATION PROOF PASSED — each of the 7 tokens is independently armed.
EXIT=0
```

Each mutant reds **exactly one** token — no over- or under-coverage — and the five pre-existing
tokens stay green under all seven, so the new tokens do not overlap the old.

Step `[0]` is the load-bearing one for the implementer: **inserting the canonical prose verbatim
turns this block green with no manifest change.** If the implementer's insertion leaves the suite
red, the prose diverges from `step7-prose-authored.md`, not the manifest.

---

## 5. Blast radius of this edit

`templates/routing/required-blocks.js` has four consumers:
`test-route-reachability.js` (claude chain), `measure-validator-duplication.js`,
`kaola-workflow-prose-census.js`/`prose-census-baseline.json`, and itself. Neither census tool is
referenced by `package.json` or the walkthrough — they are standalone measurement tools, not gates.
So this edit reds `test-route-reachability.js` and nothing else. `generate-routing-surfaces.js
--check` is unaffected: the manifest is not a rendered surface.

---

## 6. Wording in the authored prose — one substantive item, two nits

I changed nothing. Raising, per the brief:

**Substantive — paragraph A never names the artifact it structures.** It opens "Structure what you
file", and every obligation after that is about markdown sections (`## Measured`, `## Hypothesis`,
`## Proposed remedy (non-binding)`, the `searched:` line). Nothing says these are headings *in the
issue body*. Step 7's surrounding prose is about `## Run gaps` rows and `finalization-summary.md`
headings — two other artifacts that also carry `##` sections — so a reader can plausibly land on the
wrong one, and paragraph B then has to disambiguate a different record ("this run's own record …
the mission list's result line, never the `## Run gaps` row"). Naming the artifact once in A's first
sentence would close it. This is a *values* call about the shipped rule's meaning, so it is the
orchestrator's, not mine — and if A is reworded, tokens 1–5 must be re-derived from the new text
before the implementer lands it.

**Nit 1 — "carries that label" (A).** `## Proposed remedy (non-binding)` is optional and "carries
that label when it appears": "that label" could read as the parenthetical `(non-binding)` or the
whole heading. Both readings produce the same heading, so nothing breaks; it is only ambiguous
prose. Token 4 pins the heading literal, so either reading is enforceable.

**Nit 2 — "record … in this run's own record" (B).** Verb and noun in one clause, then "That record"
resumes the noun. Readable, mildly clunky. No mechanism depends on it.

Neither nit affects a token; both sit inside spans I pinned, so re-wording either requires
re-deriving that token.

---

## 7. State left behind

- `templates/routing/required-blocks.js` — **edited, red-producing.** Not committed. The implementer
  lands the prose in `templates/routing/finalize.skeleton.md`, regenerates the 18 surfaces, and this
  block goes green.
- Nothing else in the worktree modified; the skeleton and all rendered surfaces are untouched.
- I wrote no production code and no prose.

**After the prose lands, the full green requires both** `node scripts/test-route-reachability.js`
**and** `node scripts/generate-routing-surfaces.js --check` — the second is what catches a skeleton
edit that was never regenerated, and this manifest cannot see that class at all.
