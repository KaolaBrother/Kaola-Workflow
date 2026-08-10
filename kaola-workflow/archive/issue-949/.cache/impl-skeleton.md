# impl-skeleton — rename `## Agent Model Badge` → `## Agent Model Dispatch`

**Task**: rename the finalize-skeleton heading to the exact string `## Agent Model Dispatch`, rewrite
its body to state the dispatch mechanism instead of the badge, regenerate the routing surfaces.

**Verification tier**: `build-green` — the authoritative check for a generated-surface edit is
`generate-routing-surfaces.js --check` (byte-compare of all 18 rendered surfaces against the
skeleton). Exit 0 before and after. The behavioural anchor updates are a `tdd-guide` follow-on, so
the validator reds below are expected, not a regression I own.

**Worktree**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949` (branch
`workflow/issue-949`), baseline `HEAD = a348ff5c`.

---

## Files changed (my write set — nothing else)

| file | authoring source or rendered |
|---|---|
| `templates/routing/finalize.skeleton.md` | authoring source (hand-edited) |
| `commands/kaola-workflow-finalize.md` | rendered by `--write` |
| `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md` | rendered by `--write` |
| `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` | rendered by `--write` |

No rendered surface was hand-edited. The 15 skill/SKILL surfaces are unchanged because the block sits
inside a `REGION:command`, which drops on the skill contexts.

```
$ git -C <worktree> diff --stat -- templates/routing/finalize.skeleton.md \
    commands/kaola-workflow-finalize.md \
    plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md \
    plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
 commands/kaola-workflow-finalize.md                              | 9 +++++----
 plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md | 9 +++++----
 .../kaola-workflow-gitlab/commands/kaola-workflow-finalize.md    | 9 +++++----
 templates/routing/finalize.skeleton.md                           | 9 +++++----
 4 files changed, 20 insertions(+), 16 deletions(-)
```

**Concurrent, NOT mine**: `git status` in the same worktree also shows ` M README.md`,
` M docs/architecture.md`, ` M install.sh` — other agents' write sets. I did not touch them.

---

## Skeleton diff

```diff
diff --git a/templates/routing/finalize.skeleton.md b/templates/routing/finalize.skeleton.md
@@ -40,12 +40,13 @@ Read `kaola-workflow/{project}/workflow-state.md` for what this run owns, and
 `kaola-workflow/{project}/mission-list.md` for what it set out to do.

 <!-- REGION:command — the `model="{...}"` placeholders are filled at install time for this surface; the skill surface has no placeholder to fill and resolves each role's model from its installed profile at spawn time -->
-## Agent Model Badge
+## Agent Model Dispatch

 Every subagent dispatch below carries an explicit `model=` line — the installer fills each
-`model="{...}"` placeholder from the agent's own installed profile, and it is what shows the model
-badge. You MUST pass `model="{...}"` in every Agent call exactly as shown; never omit the `model=`
-line on any dispatch.
+`model="{...}"` placeholder from the agent's own installed profile. You MUST pass `model="{...}"`
+in every Agent call exactly as shown; never omit the `model=` line on any dispatch. An installed
+agent's frontmatter `model:` is rewritten to `inherit`, so a dispatch that omits `model=` does not
+fall back to that role's assigned model — it runs the role on this session's model instead.

 <!-- /REGION -->
 ## Step 1 — Final validation
```

The rendered command surfaces carry the identical block (offset only), at `:29`.

## The new body, in full

```markdown
## Agent Model Dispatch

Every subagent dispatch below carries an explicit `model=` line — the installer fills each
`model="{...}"` placeholder from the agent's own installed profile. You MUST pass `model="{...}"`
in every Agent call exactly as shown; never omit the `model=` line on any dispatch. An installed
agent's frontmatter `model:` is rewritten to `inherit`, so a dispatch that omits `model=` does not
fall back to that role's assigned model — it runs the role on this session's model instead.
```

What changed and why:

- the cosmetic clause **"and it is what shows the model badge"** is gone; the word "badge" appears
  nowhere in the block;
- the operative rule ("you MUST pass `model=`; never omit it") is unchanged in force and now carries
  its real consequence — omitting `model=` runs the role on the session's model, not on its assigned
  one;
- no issue number, no history, no provenance.

**The `inherit` claim was verified against source, not assumed**: `install.sh:261`
`const rewritten = source.replace(/^model:\s*\S+\s*$/m, 'model: inherit');`, corroborated by the
awk-path rewrite at `install.sh:392` and by `install.sh:524` ("The source agent frontmatter is the
ONLY model authority for the install"). So the *source* frontmatter fills the `{X_MODEL}` placeholder
while the *installed* agent is left at `inherit` — exactly the asymmetry the new sentence states.

## REGION wrapper — intact and untouched

`<!-- REGION:command — ... -->` at skeleton `:42` is **byte-unchanged**; it appears as a context line
in the diff above, not as a change. Its justification never mentioned the badge (it explains the
install-time placeholder fill vs. the skill surface's spawn-time resolution), so no rewording was
needed and its stated reason remains true. Directive balance in the skeleton: **5 `REGION:` opens, 5
`/REGION` closes**.

## `model="{...}"` placeholders — all three survive, on all three command surfaces

`git grep -n -P 'model="\{[A-Z_]+_MODEL\}"'` → **3 matches per surface, 9 total**:

```
commands/kaola-workflow-finalize.md:88:   model="{TDD_GUIDE_MODEL}",
commands/kaola-workflow-finalize.md:97:   model="{BUILD_ERROR_RESOLVER_MODEL}",
commands/kaola-workflow-finalize.md:156:  model="{DOC_UPDATER_MODEL}",
plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:88,97,156   (same three)
plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:88,97,156    (same three)
```

## Heading presence / survivor sweep

Case-insensitive `git grep -P` over the skeleton dir + all command and skill surface trees:

```
$ git grep -n -P -i '^##\s+Agent Model Dispatch\s*$' -- templates/routing commands plugins/...
commands/kaola-workflow-finalize.md:29:## Agent Model Dispatch
plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:29:## Agent Model Dispatch
plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:29:## Agent Model Dispatch
templates/routing/finalize.skeleton.md:43:## Agent Model Dispatch

$ git grep -n -P -i 'Agent Model Badge' -- templates/routing commands plugins/*/commands ...
(exit 1 — no matches)
```

Old-heading survivors elsewhere in the repo are **out of my write set** and belong to the follow-on
anchor update: the three validators, `test-opencode-edition.js`, plus historical text in
`CHANGELOG.md`, `docs/audits/`, `docs/investigations/` and `kaola-workflow/archive/`.

---

## Verification commands — real exit codes, no piped gating

### Before (pristine `git archive HEAD` export of `a348ff5c` into scratch — all five green)

| command | exit | output |
|---|---|---|
| `node scripts/generate-routing-surfaces.js` (`--check` default) | **0** | `all 18 surfaces byte-match the skeleton.` |
| `node scripts/validate-workflow-contracts.js` | **0** | `Workflow contract validation passed` |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | **0** | `Kaola-Workflow GitLab contract validation passed` |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | **0** | `Kaola-Workflow Gitea contract validation passed` |
| `node scripts/test-opencode-edition.js` | **0** | `opencode-edition test passed (563 assertions).` |

Running the before-set from a pristine export rather than by reverting the worktree keeps the reds
below attributable to this change alone, with no mutation of the shared tree.

### After (worktree)

| command | exit | result |
|---|---|---|
| `node scripts/generate-routing-surfaces.js --write` | **0** | `rendered 18 surfaces.` |
| `node scripts/generate-routing-surfaces.js --check` | **0** | `all 18 surfaces byte-match the skeleton.` — **the green that matters** |
| `node scripts/validate-workflow-contracts.js` | **1** | expected red |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | **1** | expected red |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | **1** | expected red |
| `node scripts/test-opencode-edition.js` | **1** | expected red |

`--write` was confirmed as the correct flag by reading `scripts/generate-routing-surfaces.js:354-366`
(`main()`), not guessed.

## The expected reds, verbatim

Each is the anchor the brief predicted. **No validator or test was edited** — test custody holds; a
`tdd-guide` agent repoints these anchors after me.

```
Error: commands/kaola-workflow-finalize.md must include: ## Agent Model Badge
    at assert (.../scripts/validate-workflow-contracts.js:18:25)
    at assertIncludes (.../scripts/validate-workflow-contracts.js:22:3)
    at Object.<anonymous> (.../scripts/validate-workflow-contracts.js:179:3)
```

```
Error: plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md must include: ## Agent Model Badge
    at assert (.../validate-kaola-workflow-gitlab-contracts.js:19:25)
    at assertIncludes (.../validate-kaola-workflow-gitlab-contracts.js:65:3)
    at Object.<anonymous> (.../validate-kaola-workflow-gitlab-contracts.js:204:3)
```

```
Error: plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md must include: ## Agent Model Badge
    at assert (.../validate-kaola-workflow-gitea-contracts.js:19:25)
    at assertIncludes (.../validate-kaola-workflow-gitea-contracts.js:64:3)
    at Object.<anonymous> (.../validate-kaola-workflow-gitea-contracts.js:203:3)
```

```
FAIL: S2: at least ONE canonical command carries `## Agent Model Badge` (found 0 of 3) — with none,
every per-file check below ranges over an empty expectation and this guard reports green by having
had nothing to read

opencode-edition test FAILED: 1 failure(s), 560 passed.
```

Anchor line numbers for whoever repoints them: `scripts/validate-workflow-contracts.js:179`,
`.../validate-kaola-workflow-gitlab-contracts.js:204`, `.../validate-kaola-workflow-gitea-contracts.js:203`
(and its `assertNotIncludes(file, 'Agent Model Badge Contract')` at `:207`), plus the `BADGE_HEADING`
constant behind `test-opencode-edition.js` S2. The opencode S2 message is itself a mutation-proof:
the guard detected that it had been left ranging over an empty expectation rather than reporting a
vacuous green.

## One observation outside my change

Between two of my runs the opencode drift-check line moved from `3 ABSENT, not checked` to
`3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)`. Those three trees are
**gitignored and untracked** (confirmed via `git check-ignore`), were created at 00:12 by another
agent regenerating the opencode edition, and now carry `## Agent Model Dispatch` at
`.opencode/command/kaola-workflow-finalize.md:28`. I did not create or write them; noted only so the
differing test banner between runs is not read as instability.
