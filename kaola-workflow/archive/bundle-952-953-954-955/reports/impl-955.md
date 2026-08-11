# Implementation — issue #955 (runtime capability divergence table)

- Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955`
- Branch `workflow/bundle-952-953-954-955`, HEAD `483a5e5e`. **Nothing committed by me.**
- Source of truth: `kaola-workflow/bundle-952-953-954-955/reports/premise-955.md`, read in full. No
  fact re-derived; no premise fact silently corrected. One premise absolute I could not adopt
  verbatim is named under "Where I departed from the premise pass".
- **Docs-only.** No script, no test, no agent profile, no skeleton touched.

## Verification tier

`build-green` — the work is inert documentation prose with no behavioral surface, so the
type-appropriate check is the generated-surface guard plus mechanical resolution of every pointer
written. Both are below. No suite asserts this table's content, and I authored no test.

## Files changed

| file | change |
|---|---|
| `docs/architecture.md` | +1 subsection `### Runtime capability divergence` (inside the existing `## Editions and runtimes`, before `### Agent profiles`); +1 paragraph rewritten in `### Model resolution` to repoint the codex tier restatement |
| `docs/README.md` | Architecture line in `## Core` gains a sub-pointer to the new subsection |

Diffstat: `docs/README.md | 5 ++++-`, `docs/architecture.md | 47 +++++++++++++++++++++++++++++++++----`.

## Before / after

**Before** (baseline, `git status --short`, all pre-existing from other agents, none mine):

```
 M agents/{code-architect,implementer,planner}.md
 M docs/decisions/0017-the-mission-list.md
 M plugins/kaola-workflow-gitea/agents/{code-architect,implementer,planner}.toml
 M plugins/kaola-workflow-gitlab/agents/{code-architect,implementer,planner}.toml
 M plugins/kaola-workflow/agents/{code-architect,implementer,planner}.toml
 M scripts/test-agent-profile-parity.js
```

`docs/architecture.md` and `docs/README.md` were **clean** at baseline — my write set does not
overlap any concurrent agent's.

**After** — `git status --short -- docs/architecture.md docs/README.md`:

```
 M docs/README.md
 M docs/architecture.md
```

`CHANGELOG.md` appeared as modified between my baseline snapshot and my final check. It is **not
mine** — I ran no edit against it; its diff is impl-953's solution-ladder entry (`## [Unreleased]` →
"The three code-producing roles now carry one solution ladder … #953"). Confirmed by reading the
diff. The other 13 pre-existing modifications are untouched by me.

## Verification commands

| command | exit | output |
|---|---|---|
| `node scripts/generate-routing-surfaces.js --check` (before) | `0` | `generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.` |
| `node scripts/generate-routing-surfaces.js --check` (after) | `0` | `generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.` |
| `git status --short` | `0` | see above |
| pointer extraction + resolution (below) | — | 26 of 27 tokens resolve; the 1 non-resolving token is a filename *class*, not a pointer — explained below |
| `grep -n 'gpt-5.6-sol' docs/architecture.md` | `1` (no match) | the restated codex tier literals are gone from the doc |

**Surface count: 18**, unchanged before and after. Real exit code captured with `; echo $?`, never
through a pipe.

## Pointer resolution

Every backticked token on my added lines was extracted mechanically from the diff (not from memory)
and resolved against the filesystem:

```
$ git diff -U0 docs/architecture.md docs/README.md | grep '^+' | grep -v '^+++' \
  | grep -oE '`[^`]+`' | tr -d '`' | grep -E '/|\.(sh|js|md|json|toml)$' \
  | sed 's|^plugins/\*/agents/\*\.toml$|plugins/kaola-workflow/agents/planner.toml|' | sort -u \
  | while read -r p; do
      if   [ -e "$p" ];        then echo "OK   $p"
      elif [ -e "docs/$p" ];   then echo "OK   docs/$p (bare, resolves from docs/architecture.md)"
      elif [ -e "scripts/$p" ];then echo "OK   scripts/$p (bare, matches file idiom)"
      else echo "DEAD $p"; fi
    done

OK   agents/
OK   commands/kaola-workflow-finalize.md
OK   docs/conventions.md (bare, resolves from docs/architecture.md)
OK   docs/conventions.md
OK   docs/decisions/0011-oracle-test-and-kernel-extraction.md
OK   docs/decisions/D-703-01.md
OK   docs/kimi-edition.md
OK   docs/opencode-edition.md
DEAD hooks.json
OK   hooks/hooks.json
OK   install-all.sh
OK   install-kimi.sh
OK   install-opencode.sh
OK   install.sh
OK   scripts/kaola-workflow-adaptive-schema.js (bare, matches file idiom)
OK   plugins/kaola-workflow/agents/planner.toml     <- stands in for the glob plugins/*/agents/*.toml
OK   plugins/kaola-workflow/config/agents.toml
OK   plugins/kaola-workflow/config/hooks.json
OK   plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
OK   scripts/generate-routing-surfaces.js
OK   scripts/kaola-workflow-adaptive-schema.js
OK   scripts/kaola-workflow-resolve-agent-model.js
OK   scripts/sync-kimi-edition.js
OK   scripts/sync-opencode-edition.js
OK   scripts/test-kimi-edition.js
OK   templates/opencode/plugins/kaola-workflow-hooks.js
OK   templates/routing/
```

`ls plugins/*/agents/*.toml | wc -l` → **42** (14 × 3 trees), so the glob resolves.

### The one `DEAD` line, explained — not a defect

`hooks.json` appears bare in this sentence:

> **No runtime registers a `PreToolUse` or `PostToolUse` hook.** That absence, established across
> every edition's `hooks.json`, is `docs/decisions/0011-oracle-test-and-kernel-extraction.md`.

It is a **filename class** (the six per-edition copies), not a pointer — the pointer in that sentence
is the ADR path, which resolves. This matches existing house style in the same file
(`agents/<name>.md` at line 302). I left it deliberately: rewriting it to `hooks/hooks.json` would be
*wrong* (that is one of six), and rewriting it to "hooks config" would lose the searchable filename.
Flagging it because any reviewer running the same extraction will hit the same line.

### Heading anchors

I cited **zero bare line numbers** — every non-code pointer is a heading anchor or a symbol name, per
the brief's preference. All 13 cited headings were confirmed verbatim with `grep -qxF` against `## `
and `### ` forms:

```
OK   docs/opencode-edition.md § What gets generated
OK   docs/opencode-edition.md § Installer command set
OK   docs/opencode-edition.md § Hooks
OK   docs/opencode-edition.md § Model and effort — inherited from the session
OK   docs/opencode-edition.md § Deploy layout — project vs global (scope-dependent)
OK   docs/kimi-edition.md § Roles as Skills
OK   docs/kimi-edition.md § Installer command set
OK   docs/kimi-edition.md § Hooks
OK   docs/kimi-edition.md § One model tier — every subagent inherits the session model
OK   docs/kimi-edition.md § Deploy layout — project vs global (scope-dependent)
OK   commands/kaola-workflow-finalize.md § Agent Model Dispatch
OK   docs/architecture.md § Agent profiles
OK   docs/architecture.md § Runtime capability divergence
```

Two anchors are **prefix form**, matching the established house idiom rather than inventing one:

- `docs/conventions.md § Bundle Lane` → `## Bundle Lane — Cross-Edition Requirement (issue #328)` (:191)
- `install-all.sh § Codex marketplace-plugin convergence` → `# Codex marketplace-plugin convergence.` (:246)

Precedent for prefix form already in `docs/architecture.md`: `See conventions.md § Two validation
tiers` points at `## Two validation tiers — the fast gate is SAMPLED (#801)`.

### Symbol anchors

```
CODEX_PINNED_STANDARD_ROLES  in scripts/kaola-workflow-adaptive-schema.js -> 2 hits
CODEX_PINNED_REASONING_ROLES in scripts/kaola-workflow-adaptive-schema.js -> 2 hits
COMMAND_EDITIONS             in scripts/generate-routing-surfaces.js      -> 4 hits
SKILL_EDITIONS               in scripts/generate-routing-surfaces.js      -> 4 hits
KIMI_RUNTIME_NATIVE          in scripts/test-kimi-edition.js              -> 3 hits
MERGE_SETTINGS               in install.sh                                -> 3 hits
commandSources               in scripts/sync-opencode-edition.js          -> 2 hits
commandSources               in scripts/sync-kimi-edition.js              -> 2 hits
```

### README anchor

`architecture.md#runtime-capability-divergence`. `grep -cixE '^#+ *runtime capability divergence *$'`
→ **1**, so the GFM slug is unambiguous (no `-1` disambiguation suffix).

## The label set

Five labels, defined once above the table and used across all 20 cells:

| label | meaning |
|---|---|
| `full` | the shared mechanism covers this runtime directly |
| `partial` | covered, with a limitation the pointer names |
| `rendered` | generated from a shared source, which the runtime consumes and never authors |
| `substituted` | the runtime lacks the shared primitive, so the workflow routes through a different one |
| `inherited` | no control exists at any level; the session's value carries |

Distribution: dispatch carrier `full/full/full/substituted` · command-skill surface all `rendered` ·
hooks `full/full/substituted/partial` · model & tier `full/full/partial/inherited` · install path
`full/partial/substituted/substituted`.

The all-`rendered` row is a real finding, not a filler: the four command/skill surfaces diverge in
*form* but not in *provenance*, and the pointer (the routing registry) is what discloses which
runtime gets commands and which gets SKILLs — so the form never needed restating.

`inherited` vs `partial` in the model row is deliberate and is why `inherited` is defined as *no
control at any level*: opencode inherits by default **but has an opt-in pin**, so it is `partial`;
kimi has no opt-in at any level, so it is `inherited`. Collapsing both to `inherited` would have
erased a genuine divergence.

## The five hard cells — what I chose and why

The premise pass ranked five cells as having no single authoritative target. None was papered over
with a restated fact; none got an invented pointer.

1. **claude / dispatch carrier — the weakest pointer in the table.** No prose anywhere states "claude
   dispatches named subagents via the Agent tool"; the `agents/` directory *is* the fact. I pointed
   at `agents/` plus the sibling `§ Agent profiles` subsection immediately below, and I said so in
   plain text under the table rather than letting the cell look as solid as its neighbours. This is
   the cell I would most want a reviewer to look at.

2. **claude and codex have no per-edition doc.** Structural; not fixable by this table. Handled by
   one honest sentence under the table explaining *why* those two columns point at code where
   opencode's and kimi's point at prose — so a reader does not read the asymmetry as sloppiness.
   The missing docs remain a finding for a separate issue (below).

3. **codex / model & tier — one cell, two files → I pointed at BOTH.** Source constants
   (`CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` in
   `scripts/kaola-workflow-adaptive-schema.js`) **and** `docs/conventions.md § Bundle Lane`. I took
   the premise pass's second-agent refinement here: the conventions section is the better second
   pointer than the SKILL PIN alone, because the tier fact has **four** authoring sites (kernel, six
   SKILL PINs, `kaola-workflow-codex-preflight.js`, `install-codex-agent-profiles.js` ×3) and that
   one section enumerates every copy *and* names the T19b guard binding them. Pointing at the SKILL
   PIN would have silently dropped half the carrier set.

4. **codex / install path — described only in a shell comment.** I pointed at
   `install-all.sh § Codex marketplace-plugin convergence` (the comment block, cited by its heading
   text rather than by `:248-253`, since line numbers drift) **plus**
   `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`, and labelled the cell `partial`
   so the split is visible from the label without restating it. Pointing at a shell comment is
   fragile; it is also the most honest target that exists, and the second pointer is executable code.

5. **kimi / dispatch carrier — readable target ≠ enforced target → I pointed at BOTH.**
   `docs/kimi-edition.md § Roles as Skills` (readable) and `KIMI_RUNTIME_NATIVE` in
   `scripts/test-kimi-edition.js` (machine-enforced). The brief correctly noted the issue's
   "name the issue or ADR" escape hatch does not literally cover this cell, since the establishing
   record is an edition doc. Naming both files is the honest resolution and needs no escape hatch.
   Label is `substituted`, not `none`: the capability is absent but the roles do ship, via a
   different primitive — `none` would have been false.

## The mandatory repoint (`docs/architecture.md` § Model resolution)

**Was** (a third copy of a fact sourced from `CODEX_PINNED_*`):

> Codex keeps the same role classification but maps it at spawn time: `standard` to
> `gpt-5.6-sol` / `medium`, and `reasoning` to `gpt-5.6-sol` / `xhigh`. Both mappings are fixed, so a
> standard-tier task never changes model or reasoning effort for task-specific reasons. No other
> runtime's model resolution changes.

**Now**:

> Codex keeps the same role classification but maps it to a model / reasoning-effort pair at spawn
> time. That pair is declared once, by `CODEX_PINNED_STANDARD_ROLES` and
> `CODEX_PINNED_REASONING_ROLES` in `kaola-workflow-adaptive-schema.js`, and rendered from there into
> the Codex SKILL surfaces — see `conventions.md` § Bundle Lane for every carrier copy and the guard
> that binds them to the constants. Both mappings are fixed, so a standard-tier task never changes
> model or reasoning effort for task-specific reasons. No other runtime's model resolution changes.

Repointed, not duplicated, and not destroyed: every surviving claim of the original paragraph is
preserved — same role classification, mapped at spawn time, both mappings fixed, therefore no
task-specific variation, and no other runtime's resolution changes. Only the two rotting literals
left, replaced by their source. `grep -n 'gpt-5.6-sol' docs/architecture.md` → exit 1, no match.

This paragraph uses bare `conventions.md` / `kaola-workflow-adaptive-schema.js` to match its own
surrounding prose idiom (`See api.md § Closure Contract`, `See conventions.md § Two validation
tiers`, and bare `kaola-workflow-adaptive-schema.js` at :291). The **table** uses repo-relative paths
throughout, per the brief. Both forms resolve; the split is intentional and is the only style
inconsistency I introduced.

## Where I departed from the premise pass

One departure, and it is a correction to my **own** first draft rather than to the premise pass's
measurements.

The brief asked me to state that "claude and codex are multiplied by the forge axis (three forges
each)". My first draft rendered that as *"so every claude and codex cell below is really ×3"* —
copying the premise pass's line 47, *"every claude and codex cell is really ×3 forges"*. **That
absolute is false for at least two cells.** claude's dispatch carrier is a single forge-independent
`agents/` tree (codex's is three: `plugins/*/agents/*.toml`), and the premise pass's own row 5 records
that claude's installed agents and commands are "**both forge-independent — the three forges collide
there**". So the ×3 holds for claude's *command sources* and for codex generally, but not for every
claude cell — and I would have shipped a prose absolute contradicted by the same document two
sections down.

Shipped instead:

> **The forge axis multiplies two of the four columns.** claude and codex each ship against three
> forges (github, gitlab, gitea), so a claude or codex pointer may resolve to three trees rather than
> one — where it does, the pointer's own path says so, and where the artifact is forge-independent it
> does not. opencode and kimi take `--forge` inside their own standalone installers instead. Runtimes
> and forge editions are different axes; this table is indexed by runtime.

This keeps the required statement (forge axis multiplies claude and codex; opencode and kimi carry
`--forge` internally; runtimes ≠ editions) and makes the pointer itself the disclosure — `agents/`
shows ×1, `plugins/*/agents/*.toml` shows ×3 — instead of asserting a count that is wrong for some
cells and would rot for the rest. Recording it here rather than silently correcting, as instructed.

Two further self-corrections made while reviewing my own diff, both against the issue's own rule:

- **"the same skeletons"** in the codex command-surface cell → `skeletons in templates/routing/`.
  The sameness is now *shown* by the identical pointer in both cells rather than *asserted* as a
  fact that could rot.
- **"the two-part split"** in the codex install cell → "the split stated at". The count `two` was a
  restated mechanism fact; the `partial` label already carries that there is a split.

## Findings NOT imported into the table

Per the brief, the premise pass's "findings for a per-edition doc" stay out of the table. Recording
them here for the orchestrator, unmodified and unverified by me (they are the premise pass's
measurements, not mine):

1. `README.md:1231-1233` — **STALE.** Tells the reader to tune `PreToolUse`/`PostToolUse` matchers
   that exist in no edition.
2. `docs/opencode-edition.md:374` — **STALE, and cross-runtime.** Says Codex models are "baked
   per-agent"; every Codex agent TOML omits `model`. This is precisely the defect class #955 exists
   to prevent — a per-edition doc restating *another* runtime's mechanism, and rotting. The new table
   does not fix it; it is a one-line repair in that doc.
3. `docs/architecture.md:287` — **axis conflation**, two lines above where the table now sits: "Four
   forge editions … `plugins/kaola-workflow/` (Codex)" counts a runtime tree as a forge edition. I
   did **not** touch it: it is outside my assigned scope, and rewording an "editions" count is a
   judgement about what the four editions *are*. My new subsection states the axis distinction
   correctly, so the two now sit adjacent and disagree — worth a follow-up.
4. `docs/README.md:17` — **STALE.** Advertises an opencode "provider-open two-tier effort mapping"
   that was *removed, not deprecated*. I edited line 9 of this file and deliberately left line 17
   alone (out of scope), so the stale line survives directly below my new sub-pointer.
5. `docs/architecture.md:295-296` — **half-true absolute.** Says the additive editions are not wired
   into "the routing-surface propagation set"; both sync scripts render their commands *from the same
   routing registry*, so a routing-prose edit reaches 24 surfaces across four runtimes, not 18. This
   sentence is the paragraph **immediately above** my new subsection. Not touched — same reason as 3.
6. **No claude or codex per-edition doc exists.** The structural cause of the weak claude/codex
   pointers; explicitly named under the table, and worth filing separately.

Items 3, 4 and 5 are all in the two files I edited, within a screen of my changes. I left them
because they are out of the assigned scope and each is a small judgement call rather than a
mechanical repair — but a reviewer will see them adjacent to my work, so they are named here rather
than left to be discovered.

## What I could not verify

- No edition suite was run (`test-opencode-edition.js`, `test-kimi-edition.js`,
  `test-route-reachability.js` T19b). Docs-only diff; the premise pass likewise left them unrun, so
  the roster/constant agreement my codex cell points at is read from shipped bytes and
  `docs/conventions.md`, not from a green guard.
- I did not run the walkthrough or any chain. `generate-routing-surfaces.js --check` is the only
  guard that reads a surface my diff could plausibly affect, and it is green at 18 before and after.
- Nothing renders `docs/architecture.md` into another surface, so there is no propagation step owed
  for this change — but I did not prove that negative beyond the routing check.
