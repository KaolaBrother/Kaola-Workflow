# impl — resolver `DEFAULT_AGENT_MODELS` header comment scope fix

**Task**: narrow the `DEFAULT_AGENT_MODELS` header comment in
`kaola-workflow-resolve-agent-model.js` to what the map actually governs, keeping the correct
frontmatter-never-fires point, and keep all four copies byte-identical.

> **Wave 2 appended** — the lead accepted finding (b) and directed the in-map sentence to be
> qualified in the same write set. That work is at the end of this file under
> "Follow-up: finding (b) actioned", and it **supersedes the hashes below**. Final shipped hash for
> all four copies: `a50edf6bef5409000e90f607028097fe0705bd4464810b20dd65f29904a1180c`.

**Verification tier**: `regression-green` — the change is comment-only (proven below); the full
existing suite for this file (`test-agent-model-resolver.js`) and the parity guard
(`validate-script-sync.js`) were green before AND after.

---

## Files changed (4, byte-identical)

- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949/scripts/kaola-workflow-resolve-agent-model.js`
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949/plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js`
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949/plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js`
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949/plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js`

Nothing else was touched. Edited canonical once, then propagated by byte copy (`cp`) — the same
operation `edition-sync.js --write` step (c) performs for the `resolve-agent-model module copies`
byte group. I deliberately did **not** run `edition-sync --write`, because it also regenerates
aggregators and every other byte group tree-wide and would have collided with the four agents
concurrently editing the skeleton, the rendered command surfaces, the sync scripts, and
README/architecture/install.sh.

## The new comment, in full

Replaces lines 8–12; now lines 8–21.

```js
// WHAT THIS MAP ANSWERS FOR: each role's declarative tier, and the effective tier for the consumers
// that read it — the dispatch-log hook's advisory `model_planned`, and, through the pins holding it
// equal to the source frontmatter and to the kernel's Codex tier classes, the Codex per-spawn
// reasoning effort and the opencode reasoning-role list.
//
// IT DOES NOT DECIDE A CLAUDE CODE `Agent(...)` DISPATCH. There the explicit `model=` argument wins,
// and its absence means `inherit` — the spawning conversation's model. Nothing on that path consults
// this map, so dropping a `model=` does not fall back to the tier declared here.
//
// Within this script's own resolution the map IS the last word for an installed agent: the installer
// rewrites each installed agent's frontmatter to `model: inherit`, so the frontmatter step below can
// never fire for one. Keep an entry byte-equal to its source `agents/<role>.md` frontmatter: the two
// are one declaration seen from two sides, and a divergence silently re-tiers the role on every
// install.
```

Removed (the defective text):

```js
// THIS MAP IS THE EFFECTIVE TIER OF EVERY INSTALLED AGENT. The installer rewrites each installed
// agent's frontmatter to `model: inherit`, so the frontmatter step below can never fire for an
// installed agent and resolution always lands here. Keep an entry byte-equal to its source
// `agents/<role>.md` frontmatter: the two are one declaration seen from two sides, and a divergence
// silently re-tiers the role on every install.
```

The comment was narrowed, not deleted; the byte-equality invariant and the frontmatter-never-fires
point are both preserved verbatim in substance. No provenance, no issue numbers, no history. Line
widths reach 101 chars, within this file's existing comment convention (pre-existing comment lines
already reach 103).

## I did not write the brief's consumer list verbatim — I measured it first

The brief named three consumers the map governs: "Codex per-spawn effort, the opencode reasoning-role
derivation, and the dispatch-log hook's advisory `model_planned`". Measured, only the third reads
this map **directly**; the other two receive it **transitively**, through the pins that hold the map
equal to other carriers. Writing the brief's phrasing unqualified would have put a second false scope
claim in the same comment. What I measured:

- **Only runtime caller of this resolver**: the dispatch-log hook, all four copies
  (`hooks/kaola-workflow-subagent-dispatch-log.sh:34` resolves it; `:77` emits `model_planned`).
  `git grep` for non-test `require`/exec of `resolve-agent-model` returns the four hook copies and
  nothing else. Field name `model_planned` verified present at line 77 in all four hook copies.
- **`DEFAULT_AGENT_MODELS` readers** outside this file and tests: `validate-workflow-contracts.js:960`
  (the frontmatter-pin comment) and `README.md`. Nothing else.
- **Codex per-spawn effort**: the shipped tier roster in the SKILL surfaces
  (`plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:13-18`) renders from
  `CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` in the **kernel**
  (`kaola-workflow-adaptive-schema.js:46,55`) via `templates/routing/slots.js:81-84,105-110` — a
  separate registry, **not** this map. It is held in lockstep with this map by
  `test-agent-model-resolver.js:43-50` (standard↔sonnet, reasoning↔opus, asserted for every role).
  The Codex per-role TOML profiles (`plugins/kaola-workflow/agents/*.toml`) carry **no** model or
  `model_reasoning_effort` field, and `install-codex-agent-profiles.js` never references this
  resolver. So the map reaches Codex only through that pinned equality.
- **opencode reasoning-role list**: `sync-opencode-edition.js:144-146` derives the tier from the
  **source `agents/<role>.md` frontmatter** (`opus → reasoning`, else `standard`), not from this map;
  `reasoningRoles()` at `:531-538` feeds the seeded config's per-role overrides at `:594-604`. It
  never requires the resolver. Again transitive, via the frontmatter byte-equality invariant.

Hence the comment's wording: "through the pins holding it equal to the source frontmatter and to the
kernel's Codex tier classes". That is the measured relationship.

## Verification

All commands run from `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949`. Exit codes
captured directly from `$?`, never through a pipe.

| command | before | after |
|---|---|---|
| `node --check` × 4 copies | (n/a) | **0, 0, 0, 0** |
| `node scripts/validate-script-sync.js` | **0** | **0** |
| `node scripts/test-agent-model-resolver.js` | **0** | **0** |

`validate-script-sync.js` output, identical before and after:

```
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
```

`test-agent-model-resolver.js` output, before and after: `Agent model resolver tests passed`.

### What the parity check actually compared — the brief's mechanism claim was off

The brief said this validator "asserts these four copies are byte-identical at HEAD (it reports
`committed kernel parity: 4 … copies identical at HEAD`)", and asked me to flag a green earned only
because my change is uncommitted. That is not what happened, and the two things are different checks:

- The four resolver copies are a **working-tree** byte group — `BYTE_IDENTICAL_GROUPS` entry
  `resolve-agent-model module copies` at `scripts/validate-script-sync.js:158-166`, compared by
  `checkByteIdenticalGroup()` at `:377-395`, which reads bytes off **disk** via `readOrNull`.
- The `committed kernel parity … at HEAD` line belongs to a **different family**: `KERNEL_COPIES` at
  `:93-99` is `kaola-workflow-adaptive-schema.js`, checked against git blob OIDs by
  `checkCommittedKernelParity()` at `:408+`. It says nothing about the resolver.

So the green **is** earned on my uncommitted working-tree bytes. No caveat needed.

### Mutation proof that the guard is armed on my new bytes

A green suite is not proof a guard is armed, so I proved it. Built a scratch mirror at
`/private/tmp/claude-501/.../scratchpad/mirror` holding only the four paths (not a git repo at all),
and called the exported `checkByteIdenticalGroup()` against it:

```
CONTROL (all four = my new bytes): {"missing":[],"drift":[]}
MUTANT (one copy, one comment word changed): {"missing":[],"drift":["resolve-agent-model module copies: plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js differs from scripts/kaola-workflow-resolve-agent-model.js"]}
GUARD ARMED ON MY NEW COMMENT BYTES: true
```

The mutation changed one word **inside the comment I added** (`DECIDE` → `decide`), so this proves
the guard sees comment bytes, not just code. The mutation was asserted non-vacuous (the script throws
if the replace is a no-op). That the scratch mirror has no git metadata and the check still ran
independently confirms it reads the working tree, not HEAD.

### The change is comment-only

```
$ git diff --stat -- <the four paths>
 4 files changed, 56 insertions(+), 20 deletions(-)   (14 added / 5 removed per copy)

$ git diff -U0 -- <the four paths> | grep '^[+-]' | grep -v '^\(+++\|---\)' | grep -v '^[+-][[:space:]]*//' | grep -v '^[+-]$'
NONE — every added/removed line is a // comment line
```

No executable line changed. `DEFAULT_AGENT_MODELS`' values are untouched, the file is not
restructured, and `test-agent-model-resolver.js` did not move (0 → 0). The prose census cannot be
perturbed either: it runs on comment-stripped source (`kaola-workflow-prose-census.js:56`).

## Findings for the orchestrator — two things I did not act on

**1. Three contract validators are RED in this worktree, and it is NOT my change.** All three abort
on the same assertion:

```
scripts/validate-workflow-contracts.js          EXIT=1  Error: commands/kaola-workflow-finalize.md must include: ## Agent Model Badge
…gitlab…/validate-kaola-workflow-gitlab-contracts.js  EXIT=1  Error: plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md must include: ## Agent Model Badge
…gitea…/validate-kaola-workflow-gitea-contracts.js    EXIT=1  Error: plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md must include: ## Agent Model Badge
```

(`scripts/validate-kaola-workflow-contracts.js` — the Codex one — is **EXIT=0**.) The three failing
surfaces are in another agent's write set and are modified in the worktree; the skeleton and the
rendered surfaces look mid-render. **Consequence for my verification**: each validator throws at that
assertion (`validate-workflow-contracts.js:179`) and therefore aborts **before** reaching its
resolver assertions at `:328`, `:331`, `:961`. Those did not run, so those validators neither confirm
nor refute my change. I checked their resolver requirements directly instead: the strings
`.codex-plugin` (×1) and `isCodexPluginScriptDir` (×3) are present in all three plugin copies, and
the `VENDOR_MODEL_NOUN_BAN` at `:961` scans only `.md`/`.toml` under `commands/`, `agents/`, and
`plugins/*/{commands,skills,agents}` — a `scripts/*.js` comment is outside its roots, and it
deliberately does not match lowercase `opus`/`sonnet` anyway. Re-run these three once the badge work
lands.

**2. A sentence inside `DEFAULT_AGENT_MODELS` now sits in tension with the new header.** At lines
27-30 (was 18-21), inside the map body:

> These defaults are each role's declarative tier, and that tier is what the other runtimes read:
> the Codex dispatch contract selects a role's per-spawn reasoning effort from it, and the
> opencode sync derives its reasoning-role list from the frontmatter this map is held equal to.
> **A change here reaches every runtime, not Claude alone.**

The last sentence is literally true (the Claude-side dispatch-log hook does read the map) but invites
exactly the misreading this issue exists to kill — that a change here reaches a Claude Code
*dispatch* tier. It does not. My brief scoped me to the header comment, so I left it alone rather
than expanding scope unilaterally. Recommend a follow-up touch, in this same four-file write set, to
either delete that sentence or qualify it to "reaches the dispatch-log record and, through the pins,
the other runtimes — never a Claude Code dispatch."

**RESOLVED in wave 2** — the lead ruled qualify-not-delete. See the next section.

---

# Follow-up: finding (b) actioned — the in-map sentence qualified

**Task**: qualify (not delete) the sentence inside `DEFAULT_AGENT_MODELS` that implied this map
carries dispatch-time authority, naming what actually propagates and how. Same four-file write set,
same constraints.

**Verification tier**: `regression-green` — still comment-only; the same two checks green before and
after this second edit.

## The new text, in full

Replaces lines 27-30; now lines 27-32.

```js
  // These defaults are each role's declarative tier, and that tier does reach the other runtimes —
  // transitively, through the pins above, never as a dispatch-time lookup. The Codex tier classes are
  // held in lockstep with this map and the opencode reasoning-role list derives from the frontmatter
  // this map is held equal to, so re-tiering a role here re-tiers it there at the next sync; the
  // dispatch-log hook, the one component reading this map directly at runtime, follows immediately.
  // A Claude Code dispatch follows none of it.
```

Removed:

```js
  // These defaults are each role's declarative tier, and that tier is what the other runtimes read:
  // the Codex dispatch contract selects a role's per-spawn reasoning effort from it, and the
  // opencode sync derives its reasoning-role list from the frontmatter this map is held equal to.
  // A change here reaches every runtime, not Claude alone.
```

The reach is kept and made precise rather than denied: **transitive, through the pins, never a
dispatch-time lookup**. The three propagation paths are now named with their mechanism — Codex tier
classes held in lockstep, opencode derived from the source frontmatter, the dispatch-log hook as the
one direct runtime reader — and the two differ in *timing*, which the text says: the synced runtimes
follow at the next sync, the hook follows immediately. The closing sentence removes the dispatch-time
implication outright. It cross-references "the pins above", i.e. the header block, so the two read as
one argument rather than two enumerations. No provenance, no issue numbers, no history. Widths reach
102, within the file's existing comment convention (max elsewhere 103).

## Verification (wave 2)

Run from `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949`; exit codes from `$?`.

| command | before (wave-1 state) | after (b) |
|---|---|---|
| `node --check` × 4 copies | 0, 0, 0, 0 | **0, 0, 0, 0** |
| `node scripts/validate-script-sync.js` | 0 | **0** |
| `node scripts/test-agent-model-resolver.js` | 0 | **0** |

Validator output unchanged: `OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized
families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.`
Resolver test output unchanged: `Agent model resolver tests passed`.

### Four matching hashes (final, shipped)

```
a50edf6bef5409000e90f607028097fe0705bd4464810b20dd65f29904a1180c  scripts/kaola-workflow-resolve-agent-model.js
a50edf6bef5409000e90f607028097fe0705bd4464810b20dd65f29904a1180c  plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
a50edf6bef5409000e90f607028097fe0705bd4464810b20dd65f29904a1180c  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js
a50edf6bef5409000e90f607028097fe0705bd4464810b20dd65f29904a1180c  plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js
```

Progression: `46fcbd37…` (HEAD) → `d549c190…` (wave 1, header) → `a50edf6b…` (wave 2, shipped).

### Mutation proof re-run against the SHIPPED bytes

Fresh scratch mirror (`…/scratchpad/mirror2`, again not a git repo), seeded from the shipped
canonical file. The mutation target is a sentence introduced by **this** edit, and the script asserts
the shipped bytes actually contain it before proceeding — so the proof cannot pass against the old
wording:

```
CONTROL (all four = shipped bytes): {"missing":[],"drift":[]}
MUTANT (gitea copy, one word inside the NEW (b) sentence): {"missing":[],"drift":["resolve-agent-model module copies: plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js differs from scripts/kaola-workflow-resolve-agent-model.js"]}
GUARD ARMED ON SHIPPED (b) BYTES: true
```

Mutation was `follows none of it` → `follows some of it` in the gitea copy; asserted non-vacuous.
A different copy was drifted than in wave 1 (gitea, not gitlab), so the proof is not reusing one
lucky path.

### Still comment-only

```
$ git diff --stat -- <the four paths>
 4 files changed, 80 insertions(+), 36 deletions(-)   (20 added / 9 removed per copy, both waves)

$ git diff -U0 -- <the four paths> | grep '^[+-]' | grep -v '^\(+++\|---\)' | grep -v '^[+-][[:space:]]*//' | grep -v '^[+-]$'
NONE — every added/removed line is a // comment line

$ git diff -- scripts/kaola-workflow-resolve-agent-model.js | grep -E "^[+-].*'(sonnet|opus)'"
NONE — no DEFAULT_AGENT_MODELS value line added or removed
```

No executable line moved, no map value changed, file not restructured.

## Not touched, per instruction

The three red contract validators (`validate-workflow-contracts.js` and the two forge validators) were
left alone. Confirmed by the lead as expected: a concurrent agent renamed the canonical heading to
`## Agent Model Dispatch`, so they abort at `:179` on the old string, and a `tdd-guide` agent
re-anchors them after wave 1. The lead will re-run those three plus the resolver assertions at
`:328`/`:331`/`:961` mechanically once that lands, rather than carrying my hand-check.
