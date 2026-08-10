# impl-sync — re-anchor the opencode/kimi edition transforms to `## Agent Model Dispatch`

**Task**: re-anchor both edition generators to the renamed canonical heading, make a missed anchor
observable instead of silent, and reword badge-shaped identifiers/comments — keeping every mechanism
and every emitted wording.

**Verification tier**: `tests-green` for the kimi edition (its authored suite passes) plus the
generators' own `--check` parity assertion across all six trees and a mutation proof of the new
guard. The opencode edition suite is RED on two assertions in a file I do not own, both pinned to
the pre-rename heading string — detail below.

**Worktree**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949` (branch
`workflow/issue-949`, base `a348ff5c`).

## Files changed (exactly two — my whole write set)

- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949/scripts/sync-opencode-edition.js`
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949/scripts/sync-kimi-edition.js`

```
$ git -C <worktree> diff --stat -- scripts/sync-opencode-edition.js scripts/sync-kimi-edition.js
 scripts/sync-kimi-edition.js     | 79 ++++++++++++++++++++++++----------
 scripts/sync-opencode-edition.js | 91 +++++++++++++++++++++++++++-------------
 2 files changed, 120 insertions(+), 50 deletions(-)
```

Nothing else was touched. The other modified paths in `git status` (`README.md`, `install.sh`,
`docs/architecture.md`, `commands/kaola-workflow-finalize.md`, the two plugin finalize copies, the
four `kaola-workflow-resolve-agent-model.js` copies, `templates/routing/finalize.skeleton.md`)
belong to the concurrent agents.

## BEFORE — the silent miss, measured on this tree

The skeleton rename to `## Agent Model Dispatch` had already landed in the working tree when I
started (`templates/routing/finalize.skeleton.md:43`, `commands/kaola-workflow-finalize.md:29`). I
regenerated all six edition trees with the **unmodified** generators and measured:

| probe | result |
|---|---|
| `sync-opencode-edition.js --forge={github,gitlab,gitea} --check` | exit **0** ×3 — silent |
| `sync-kimi-edition.js --forge={github,gitlab,gitea} --check` | exit **0** ×3 — silent |
| `grep -c '^## Model and effort are inherited$' .opencode/command/kaola-workflow-finalize.md` | **0** — the edition block was NOT shipped |
| Claude-shaped `## Agent Model Dispatch` heading present in `.opencode/…/finalize` | **yes**, verbatim from canonical |
| Claude-shaped `## Agent Model Dispatch` heading present in `.kimi/skills/kaola-workflow-finalize/SKILL.md` | **yes**, verbatim from canonical |
| `node scripts/test-opencode-edition.js` | exit **1** — 1 failure (`S2: at least ONE canonical command carries \`## Agent Model Badge\` (found 0 of 3)`), 560 passed |
| `node scripts/test-kimi-edition.js` | exit **0** — 516 assertions |

So the briefed hazard reproduces exactly: no throw, no non-zero exit, `carries edition marker=false`.
Worth recording precisely — the surfaces were **degraded, not empty**. `rewriteBadgeInstructions`
still rewrote the section's `model=` prose paragraph into the edition guidance, so both editions kept
a one-line true statement; what was lost was opencode's five-line block (the one place naming the
`task` tool, the `subagent_type` dispatch form and how to raise effort) and, on both editions, the
Claude-only heading was shipped to a runtime that has no such concept.

## What changed

### 1. Re-anchored, exact string

Both generators now match `/^##\s+Agent Model Dispatch\s*$/`, hoisted out of the loop into a named
constant `MODEL_DISPATCH_HEADING` (opencode `:413`, kimi `:397`). Every mechanism is unchanged:
opencode still substitutes its block and skips the canonical body to the next heading; kimi still
drops the section and leaves its one-line guidance with a single-blank seam.

### 2. The missed anchor now reports

New in each file, immediately above `transformCommandBody`:

- `MODEL_DISPATCH_HEADING_NEAR_MISS = /^##\s+.*\bModel\b/` — an H2 whose title contains the word
  "Model". Deliberately looser than the anchor; its only job is to notice the anchor going stale.
  `^##\s+` rejects `###`, so it cannot fire on a child heading.
- `assertModelDispatchAnchorMatched(canonBody, substituted, label)` — throws when the anchor did NOT
  match **and** the canonical body carries a near-miss heading, naming the heading it found and the
  constant to re-anchor. Called right after the transform loop, before the residue guard, so the
  anchor failure is reported as itself rather than as downstream residue.

It scans the canonical `body` parameter, never the output — opencode's own emitted block heading
(`## Model and effort are inherited`) contains "Model" and would otherwise self-trigger.

A surface with no such section stays silent. That is not a weakening: only one of the three canonical
commands carries the section, and the other two must render without complaint.

Tracking flags: `substitutedModelDispatch` (opencode), `strippedModelDispatch` (kimi).

### 3. Identifiers and comments reworded (mechanism and meaning unchanged)

| old | new |
|---|---|
| `OPENCODE_BADGE_BLOCK` | `OPENCODE_MODEL_DISPATCH_BLOCK` |
| `OPENCODE_BADGE_GUIDANCE` | `OPENCODE_MODEL_DISPATCH_GUIDANCE` |
| `KIMI_BADGE_GUIDANCE` | `KIMI_MODEL_DISPATCH_GUIDANCE` |
| `rewriteBadgeInstructions` | `rewriteModelDispatchInstructions` |
| `rewriteBadgeParagraph` | `rewriteModelDispatchParagraph` |
| `assertNoBadgeResidue` | `assertNoModelDispatchResidue` |
| — (new) | `MODEL_DISPATCH_HEADING`, `MODEL_DISPATCH_HEADING_NEAR_MISS`, `assertModelDispatchAnchorMatched` |

All are renamed in `module.exports` too. **No back-compat aliases** — an alias would let a stale
consumer keep passing against a name that no longer describes the thing.

The residue guard's error text now states the fact rather than the retired noun:

- opencode: ``sync-opencode-edition: a Claude-only `model=` instruction survived into <surface> — this runtime has no model parameter to honour it, and the anchored rewrite did not match this wording:``
- kimi: ``sync-kimi-edition: a Claude-only `model=` instruction survived into <surface> — this runtime has no per-dispatch model override to honour it, and the anchored rewrite did not match this wording:``

Comments that record **why** the transform exists are kept and reworded, not deleted — the opencode
block's derivation note (the task tool's real parameter list read from the 1.18.11 binary; the two
earlier wordings that named a mechanism and dated), kimi's declared divergence, and the
anchored-vs-token-strip rationale all survive verbatim apart from the noun. Zero case-insensitive
occurrences of "badge" remain in either file (`git grep -P -i 'badge'` → exit 1).

The emitted wordings are byte-unchanged, including opencode's *"Dispatch the role via
`subagent_type`. It runs the session's own model and reasoning effort — the task tool has no model or
effort parameter."*

## AFTER — verification, with real exit codes

```
node --check scripts/sync-opencode-edition.js                       exit 0
node --check scripts/sync-kimi-edition.js                           exit 0

node scripts/sync-opencode-edition.js --forge=github --write        exit 0   (1 file regenerated)
node scripts/sync-opencode-edition.js --forge=gitlab --write        exit 0   (1 file regenerated)
node scripts/sync-opencode-edition.js --forge=gitea  --write        exit 0   (1 file regenerated)
node scripts/sync-kimi-edition.js     --forge=github --write        exit 0   (1 file regenerated)
node scripts/sync-kimi-edition.js     --forge=gitlab --write        exit 0   (1 file regenerated)
node scripts/sync-kimi-edition.js     --forge=gitea  --write        exit 0   (1 file regenerated)

node scripts/sync-opencode-edition.js --forge=github --check        exit 0   14 agents + 3 commands + 1 plugin in parity
node scripts/sync-opencode-edition.js --forge=gitlab --check        exit 0
node scripts/sync-opencode-edition.js --forge=gitea  --check        exit 0
node scripts/sync-kimi-edition.js     --forge=github --check        exit 0   14 role skills + 3 command skills + 2 hook files in parity
node scripts/sync-kimi-edition.js     --forge=gitlab --check        exit 0
node scripts/sync-kimi-edition.js     --forge=gitea  --check        exit 0

node scripts/test-kimi-edition.js                                   exit 0   516 assertions, 3 trees in parity
node scripts/test-route-reachability.js                             exit 0   331 assertions
node scripts/test-opencode-edition.js                               exit 1   2 failures, 561 passed  ← not mine, see below
```

The six trees were deliberately regenerated (not left stale) before every `--check`, so no D0 drift
check masked a result. `.opencode*` / `.kimi*` are gitignored, and `git status` confirms they added
nothing to the diff.

### Edition marker IS present (the measured before-failure is closed)

```
.opencode        : 1 command file carries `## Model and effort are inherited`
.opencode-gitlab : 1
.opencode-gitea  : 1
.kimi            : 1 skill carries `Never pass a per-call model override; sub-agents inherit the session model.`
.kimi-gitlab     : 1
.kimi-gitea      : 1
```

Rendered opencode surface (`.opencode/command/kaola-workflow-finalize.md`):

```
## Model and effort are inherited

A subagent runs the model and reasoning effort of the session that dispatched it. Nothing is
configured per role, and there is nothing to pass: the `task` tool takes a `subagent_type`, a
`prompt` and a `description`, and has no model or effort parameter at all. To make a dispatched
role think harder, raise the session's own effort — every role you dispatch follows it.

Dispatch a role with the `task` tool using `subagent_type: "<role>"`.
```

Rendered kimi surface (`.kimi/skills/kaola-workflow-finalize/SKILL.md:29`):
`Never pass a per-call model override; sub-agents inherit the session model.`

### Residue predicate: nothing survives

`grep -rn 'model=' .opencode{,-gitlab,-gitea}/command .kimi{,-gitlab,-gitea}/skills` → **exit 1**, no
match. Same over `.opencode*/agent` → exit 1. And `grep -rn 'Agent Model Dispatch\|Agent Model Badge'`
over all six trees → **exit 1**: the Claude-shaped heading no longer leaks into either edition.

### The new guard is mutation-proven (armed, with both controls)

`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad/prove-anchor-guard.js`
— reads the real canonical bodies, mutates only the in-memory copy, touches no file. Exit 0.

```
--- positive control: unmutated canonical ---
OK   opencode finalize (anchor matches) -> returned :: marker present=true
OK   kimi finalize (anchor matches) -> returned :: marker present=true
--- negative control: surfaces that carry no such section (must stay silent) ---
OK   opencode workflow-next.md  -> returned
OK   kimi workflow-next.md      -> returned
OK   opencode workflow-init.md  -> returned
OK   kimi workflow-init.md      -> returned
--- MUTATION: canonical heading renamed out from under the anchor ---
OK   opencode w/ "## Agent Model Badge"     -> threw
OK   kimi     w/ "## Agent Model Badge"     -> threw
OK   opencode w/ "## Model Dispatch"        -> threw
OK   kimi     w/ "## Model Dispatch"        -> threw
OK   opencode w/ "## Agent Model Selection" -> threw
OK   kimi     w/ "## Agent Model Selection" -> threw
```

The thrown text:

```
sync-opencode-edition: model-dispatch anchor missed in .opencode/command/kaola-workflow-finalize.md
 — canonical carries a section this transform did not substitute at, so the edition would ship
 without its dispatch instruction. Re-anchor MODEL_DISPATCH_HEADING to the heading canonical now uses:
  - ## Agent Model Badge
```

Three mutation variants matter separately: `## Agent Model Badge` proves the guard catches a revert
to the exact heading that produced the measured silent miss; `## Model Dispatch` proves it survives a
rename that drops the "Agent" prefix; `## Agent Model Selection` proves it is not pinned to the word
"Dispatch". The negative controls prove it is not simply always-throwing — the two commands with no
such section render clean, which is why all six `--check` runs exit 0.

The before-measurement is the pre-change control for this proof: with the identical canonical text,
the unmodified generators returned normally, `--check` exited 0 six times, and the block was absent.

## Expected reds in files I do not own

1. **`scripts/test-opencode-edition.js` — 2 failures, exit 1** (owned by `tdd-guide`; I did not touch
   it). Both pin the pre-rename string at `:815`
   (`/^##\s+Agent Model Badge\s*$/m.test(canonical source)`):

   ```
   FAIL: S2: at least ONE canonical command carries `## Agent Model Badge` (found 0 of 3) — with
   none, every per-file check below ranges over an empty expectation and this guard reports green by
   having had nothing to read
   FAIL: S2[kaola-workflow-finalize.md]: NO effort block — its canonical source carries no
   `## Agent Model Badge`, so the generator had nothing to substitute here; a block present anyway is
   stale output
   ```

   The first failure **pre-existed my change** (it is in the baseline above, caused by the skeleton
   rename). The second is a direct and correct consequence of my fix: the generator now substitutes
   the block again, and a test computing `canonCarriesBadge` from the old string therefore asserts the
   block must be *absent*. The repair is to move `## Agent Model Badge` → `## Agent Model Dispatch` at
   `:815` (and the three message strings at `:811,818,833,839`). Passed count rose 560 → 561, so the
   rename cost no coverage. **I did not edit it — that is the test author's artifact.**

2. **`scripts/validate-workflow-contracts.js` (and the three plugin copies) — exit 1**, pre-existing
   and untouched by me:
   `Error: commands/kaola-workflow-finalize.md must include: ## Agent Model Badge` (`:179`, plugin
   copies at `:203/:204`). Caused by the skeleton rename; it reads `commands/`, not the edition trees,
   so my change cannot affect it either way. Owned by another agent in this run.

## Consumer check (no unowned production code broken by the rename)

`git grep -P '\b(OPENCODE_BADGE_BLOCK|OPENCODE_BADGE_GUIDANCE|KIMI_BADGE_GUIDANCE|rewriteBadgeInstructions|rewriteBadgeParagraph|assertNoBadgeResidue)\b' -- '*.js' '*.sh' '*.json'`
returns only two **comment** lines in `scripts/test-opencode-edition.js` (`:387`, `:757`). No code
anywhere imports a renamed export.

The other two `require()` consumers — `scripts/simulate-workflow-walkthrough.js:11982-11983` and
`scripts/test-route-reachability.js:694-695` — use only `outDirs`, `renderCommand` and `skillRel`,
all preserved. `install-opencode.sh` / `install-kimi.sh` invoke the CLI (`--check`, `--write`,
`--write-config-to`); that surface is unchanged.

## Scope note

I did not run `simulate-workflow-walkthrough.js` at full scope. Reason: the tree currently carries
four other agents' in-flight edits (README, install.sh, architecture docs, the resolver, the
skeleton), so a walkthrough result now would report their half-landed state, not mine. The
walkthrough's only path through my files is `renderCommand` on the init surfaces, and
`test-route-reachability.js` exercises a strict superset of that — `renderCommand` for **every**
command surface × 3 forges × both editions — and passed at exit 0. The full-scope walkthrough is the
orchestrator's call once the concurrent write sets land.
