# impl-prose — badge prose strip in README.md, docs/architecture.md, install.sh

**Worktree**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949` (branch `workflow/issue-949`)
**Write set**: exactly `README.md`, `docs/architecture.md`, `install.sh`. Nothing else touched.
**Verification tier**: `build-green`.

---

## Verification commands + exit codes

| command | exit |
|---|---|
| `git show HEAD:install.sh \| bash -n /dev/stdin` (BEFORE) | 0 |
| `bash -n install.sh` (AFTER) | 0 |
| `git grep -n -P -i 'badge' -- README.md docs/architecture.md install.sh` (BEFORE) | 0 — **14 hits** |
| `git grep -n -P -i 'badge' -- README.md docs/architecture.md install.sh` (AFTER) | 1 — **0 hits** |

**Surviving-hits search: ZERO.** Nothing to justify — the case-insensitive sweep across all three
files returns no match. (`git grep -P` was used, not the shell `grep`, which is ugrep and skips
dot-directories.)

`git diff --stat`, my three files only:

```
 README.md            | 32 ++++++++------------------------
 docs/architecture.md |  5 +++--
 install.sh           |  2 +-
 3 files changed, 12 insertions(+), 27 deletions(-)
```

## Assertion-safety check (done independently, not taken from the brief)

- `git grep -P "readFileSync\([^)]*README" -- scripts/` → three hits, none content-asserting on my
  edits: `kaola-workflow-release.js:214` rewrites two **version** strings (Codex plugin manifest,
  Claude Code command install) and `:236` re-reads to confirm those landed — my edits touch neither
  line; `simulate-workflow-walkthrough.js:1917` asserts on a **temp fixture** README, not the repo's.
- `git grep -P "readFileSync\([^)]*architecture" -- scripts/` → no hits.
- `git grep -P -i 'model badges use|Removed the managed Kaola subagentStatusLine|Badge visibility|Badge not showing|built-in model badge' -- scripts/ tests/` → no hits. The `install.sh` string I
  reworded is not pinned anywhere.
- The `badge` hits that do exist in `scripts/` belong to `sync-kimi-edition.js` /
  `sync-opencode-edition.js` — another agent's write set, untouched.

No suite covers this prose, so `build-green` (`bash -n`) is the honest tier. I did **not** run the
walkthrough: it asserts nothing about these bytes, and 8 other files in this worktree are being
edited concurrently by other agents, so a run here would report their in-flight state, not mine.

---

## MIXED splits — before/after, showing exactly where I cut

### 1. `README.md:201-219` → now `:201-206`

**BEFORE** (functional part in the first three lines, cosmetic from "This makes…"):

```
When agents are installed, their frontmatter `model:` field is rewritten to
`inherit`. Command files render each agent's concrete assigned model (e.g.,
`model="sonnet"`) into the dispatched `Agent(...)` call via install-time
substitution. This makes Claude Code's built-in model badge render on every      <- CUT FROM HERE
subagent dispatch (the badge renders only when a concrete `model=` literal
differs from the agent's frontmatter). **After installing or re-running
`install.sh`, restart Claude Code for the model badges to take effect.**

> **Badge visibility by session model (Claude Code platform behaviour):**       <- whole blockquote
> - **Session on Sonnet** — only Opus subagents show a badge. Sonnet-dispatched     deleted, incl.
>   agents (`code-explorer`, `investigator`, `tdd-guide`, `implementer`,            the two role
>   `knowledge-lookup`, `doc-updater`, `metric-optimizer`) run silently.            roster lists
>   Opus-dispatched agents (`planner`, `synthesizer`, `code-architect`,
>   `code-reviewer`, `security-reviewer`, `build-error-resolver`, and
>   `adversarial-verifier`) badge as expected.
> - **Session on Opus** — all subagents show a badge, regardless of their model.
>
> The badge is a model-switch indicator: it renders when the subagent's model
> differs from the session's default. This is by design in Claude Code.
```

**AFTER**:

```
When agents are installed, their frontmatter `model:` field is rewritten to
`inherit`. Command files render each agent's concrete assigned model (e.g.,
`model="sonnet"`) into the dispatched `Agent(...)` call via install-time
substitution. That rendered literal is what puts the role on its assigned
model: a dispatch that carries no `model=` runs on the session's own model
instead.
```

The cut is exactly at the sentence boundary after "…via install-time substitution." The two
functional sentences (frontmatter → `inherit`; install-time substitution of the concrete model)
survive verbatim. The brief invited a clause saying what the substitution *achieves* — I added it,
stating both halves of the measured behaviour: with a `model=` literal the role runs at its assigned
model, without one it runs on the session's model. Blank-line/heading structure preserved: one blank
line now separates the paragraph from `## Installation`.

### 2. `README.md:258-260` → now `:245-247`

**BEFORE** — subject functional, trailing purpose clause cosmetic:

```
During install, slash commands render each installed Kaola agent's frontmatter
model into concrete `Agent(..., model="...")` examples so spawned subagents can
show Claude Code's built-in model badge.                                        <- purpose clause replaced
```

**AFTER**:

```
During install, slash commands render each installed Kaola agent's frontmatter
model into concrete `Agent(..., model="...")` examples so each spawned subagent
runs on its assigned model.
```

Cut at "so spawned subagents can show…"; replaced with the real purpose rather than dropped, so the
sentence keeps its "so …" rationale shape.

### 3. `README.md:1264-1269` → now `:1251-1253`

**BEFORE** — first bullet mixed (split at the colon), second bullet wholly cosmetic:

```
- Model badges are enforced by slash-command dispatch, not by a status-line     <- subject cosmetic
  override: the installer renders each installed agent's resolved model into    <- after the colon:
  concrete `model="..."` lines in the slash commands.                              FUNCTIONAL, kept
- **Badge not showing for some subagents?** By design: on a Sonnet session,      <- whole bullet
  only Opus subagents show a badge. On an Opus session, all subagents badge.        deleted
  See the vendored-agents note above for details.
```

**AFTER**:

```
- Subagent model selection comes from slash-command dispatch, not from a
  status-line override: the installer renders each installed agent's resolved
  model into concrete `model="..."` lines in the slash commands.
```

The post-colon clause is byte-preserved apart from the line re-wrap forced by the new subject. The
"not from a status-line override" contrast is kept deliberately — it is what makes the neighbouring
bullet at `:1265-1267` (the installer removing the legacy managed `subagentStatusLine`) legible, and
that removal logic is functional.

### 4. `docs/architecture.md:341-343`

**BEFORE**:

```
For Claude Code, commands carry an explicit `model="{...}"` placeholder on every dispatch, which the
installer fills from the agent's own installed profile; that is what renders the model badge.
opencode applies its resolved tier dynamically.
```

**AFTER**:

```
For Claude Code, commands carry an explicit `model="{...}"` placeholder on every dispatch, which the
installer fills from the agent's own installed profile; the filled literal is what selects the model
the dispatched role runs on — without it the role inherits the session's model. opencode applies its
resolved tier dynamically.
```

Per the brief, "on every dispatch" was left **untouched** — it is a true claim held true by
`assertEveryDispatchHasModel`, not an overclaim. Only the trailing clause after the semicolon was
replaced. The opencode sentence is unchanged (re-wrapped only, at the file's ~99-col width).

### 5. `install.sh:786`

**BEFORE**:

```python
    print("Removed the managed Kaola subagentStatusLine; model badges use explicit Agent model dispatch.", file=sys.stderr)
```

**AFTER**:

```python
    print("Removed the managed Kaola subagentStatusLine; each Agent dispatch carries its own model.", file=sys.stderr)
```

Reworded, not dropped, per the owner's ruling — the operator still learns the settings key was
popped. The surrounding `is_managed_subagent_statusline(...)` / `settings.pop(...)` removal logic is
untouched.

---

## Judgement calls I made, and where I departed from / extended the brief

1. **Extended, not departed** — the brief said "consider whether the surviving functional sentences
   now need one clause"; I judged yes and added it, because without it the paragraph explains *how*
   the substitution works and never says *why* it matters. The added clause states the measured
   fallback (no `model=` → parent/session model), which is the fact the deletion would otherwise
   have taken with it.
2. **Kept "not by a status-line override"** at `README.md:1251` even though the original sentence
   subject was cosmetic. Dropping it would orphan the `subagentStatusLine`-removal bullet three
   lines below; the contrast is doing real work.
3. **install.sh wording**: I wrote "each Agent dispatch carries its own model" rather than the
   brief's paraphrase "each dispatch carries its own model", to keep the noun the operator can grep
   for (`Agent(...)`, the thing the installer renders into) — same claim, one word more specific.
4. **No heading reference needed.** I searched for a reference to the canonical heading being
   renamed (`## Agent Model Badge` → `## Agent Model Dispatch`): `git grep -P -i 'Agent Model
   (Badge|Dispatch)' -- README.md docs/architecture.md install.sh` matched only the install.sh
   string I rewrote, and that is prose, not a heading cross-reference. So none of my three files
   links to the renamed heading and nothing needed updating for the concurrent rename.
5. **No provenance written.** No issue numbers, no "used to say", no history in any of the three
   files.
6. **Nothing outside the write set.** `git status` shows four files modified by other agents
   (`commands/kaola-workflow-finalize.md`, the two plugin copies, and
   `templates/routing/finalize.skeleton.md`) — not mine, not claimed, not touched.

## Known downstream effect (expected, flagged not fixed)

`README.md` is a member of `SELF_HOST_TEST_CONSUMED`, so this edit is a code-relevant change and
**stales any existing chain receipt**. That is anticipated by the brief and is why this edit lands
now rather than at finalize. `docs/architecture.md` and `install.sh` carry no such membership.
