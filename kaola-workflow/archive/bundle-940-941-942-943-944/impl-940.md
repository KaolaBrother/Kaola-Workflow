# Implementation — issue #940: remove the reasoning floor

**Task:** remove the reasoning-floor machinery (dead since `c0b48043` deleted its only production
consumer, `kaola-workflow-next-action.js`). Per the user's ruling, the mechanism goes and its tests
fall out with it. Worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-940-941-942-943-944`,
branch `workflow/bundle-940-941-942-943-944`. Nothing committed.

**Verification tier:** `regression-green` — the full existing suite green before AND after. This is a
behaviour-preserving removal of an unreachable mechanism: no new behaviour was added, so there is no
new test to pass, and the claim is that every surviving behaviour is unchanged.

**Line delta:** 19 files, **+48 / −494** (net −446).

---

## Files touched

### The four byte-identical resolver copies (−105 each)

- `scripts/kaola-workflow-resolve-agent-model.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js`

Removed: `REASONING_FLOOR_ROLES`; `isReasoningClass`; `enforceReasoningFloor` (with its `#463`/`#775`
comment block); the `options.enforceFloor` branch in `resolveAgentModel`; the `--enforce-floor` arg
parsing and its `enforceFloor: false` default; the flag in the usage string; the CLI
`reasoning_floor_violation` refusal branch; three export entries.

The three plugin copies were produced by `cp` from the root copy, so byte-identity is by construction,
not by hand. All four hash `46fcbd3774a2fba6b811e486b84e5edd536cb0d90b0b9d9a15182954faf40fea`
(was `49e8c1fc…`).

**Judgment call — one sentence preserved.** The deleted `isReasoningClass` comment was the *only*
record anywhere in the repo of a constraint that outlives the floor: the dispatch-log hook copies the
resolver standalone, so the resolver must stay dependency-free. I kept that clause (wording lifted
from the deleted comment, not newly authored) as a two-line note where the declaration stood. Grep
proof that it was the sole carrier is in "What the premise report missed", item 4.

Three in-code comments in `DEFAULT_AGENT_MODELS` were left dangling by the removal and were trimmed,
not rewritten: `adversarial-verifier` and `metric-optimizer` each said "it is NOT a reasoning-floor
role", and `synthesizer` said "a plan may RAISE but never LOWER this floor (see REASONING_FLOOR_ROLES)".

### Tests deleted with the mechanism

- `scripts/test-agent-model-resolver.js` (−81): the floor comment + the `enforceReasoningFloor`
  export assertion, and the three `tmpFloor{Ok,Lower,Inherit}` blocks.
- `scripts/test-agent-profile-parity.js` (−2): the `{ role: 'synthesizer', token: 'REASONING_FLOOR_ROLES' }`
  pin. That file's own header (`:35-36`) states "Deleting a pin whose mechanism is gone is the correct
  repair", so this is the sanctioned move, not a repair.

**No coverage was lost.** Before deleting the three floor blocks I checked whether they carried any
non-floor assertion that was unique. They did not:

| assertion inside a floor block | already covered by |
|---|---|
| `synthesizer` → `opus` (`:508`) | the loop at `:43-50` (every role must equal its Codex class tier) and `:59-66` (source frontmatter byte-equal to the map) |
| frontmatter override lowers (`:548`) | `:101-102` (`doc-updater` → `haiku`), `:137-138` (`planner` → `opus`) |
| `inherit` falls through to the static default (`:570`) | `:106-107` (`planner` inherit → `opus`), `:129-132` |

I did not touch the completeness assertion at `:27-31`, nor `CODEX_PINNED_*_ROLES`.

### Contract-validator pins (−3 each: two comment lines + the assert)

- `scripts/validate-workflow-contracts.js`
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — byte twin, in `validate-script-sync.js`'s
  `COMMON_SCRIPTS`; synced by `cp`, both now hash `9ce6c373…`
- `scripts/validate-kaola-workflow-contracts.js`
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

### Prose

- `agents/synthesizer.md:14` — "…which is why it is reasoning-class and held to a non-lowerable floor
  (REASONING_FLOOR_ROLES)." → "…which is why it is reasoning-class." Sentence kept, clause removed.
- `plugins/{kaola-workflow,-gitlab,-gitea}/agents/synthesizer.toml` — **two** sites each, not one:
  the `:18` bullet *and* the `:2` `description` field.
- `plugins/{kaola-workflow,-gitlab,-gitea}/config/agents.toml:62` — the same description string, a
  third copy. See "What the premise report missed", item 1.
- `docs/conventions.md:208` — "`DEFAULT_AGENT_MODELS`, and `REASONING_FLOOR_ROLES` where the role has
  a floor" → "`DEFAULT_AGENT_MODELS`".

The toml triplet stayed byte-identical (`57254915…`). The toml rewrite was scripted with an
exact-occurrence guard (abort unless exactly 1 match per file) rather than done by hand ×6.

---

## Hard constraint 1: `synthesizer` still resolves to `opus`

Checked four ways, plus a whole-map diff:

```
map value, all four resolver copies         -> opus / opus / opus / opus
CLI --raw, default agent dir                -> opus            exit=0
CLI --json                                  -> {"agent":"synthesizer","model":"opus"}   exit=0
CLI --raw --agent-dir <empty tmpdir>        -> opus            exit=0   (pure DEFAULT_AGENT_MODELS)
CLI --raw --agent-dir agents                -> opus            exit=0   (frontmatter path)
```

Whole-map before/after (HEAD blob vs working copy), which proves **no** role was re-tiered, not just
the synthesizer:

```
roles before: 14 | roles after: 14
map byte-equal (keys+values+order): true
map_unchanged_exit=0
```

The retired flag now fails honestly instead of silently no-op'ing:
`node …resolve-agent-model.js synthesizer --raw --enforce-floor` → `unexpected argument: --enforce-floor`, exit 2.

---

## Verification commands and real exit codes

Exit codes captured with `echo $?` on its own line, never off a pipeline tail. (`PIPESTATUS` is a
bashism — this box is zsh — so one early reading was discarded and re-taken without a pipe.)

**Before (baseline, at `d2ab06c2` + other agents' in-flight edits):**

```
node scripts/test-agent-model-resolver.js        exit=0
node scripts/validate-script-sync.js             exit=0
node scripts/test-agent-profile-parity.js        exit=0
node scripts/simulate-workflow-walkthrough.js    exit=0
```

**After:**

```
node scripts/test-agent-model-resolver.js                                             exit=0
node scripts/validate-script-sync.js                                                  exit=0   (4-copy byte identity holds)
node scripts/test-agent-profile-parity.js                                             exit=0   (784 assertions)
node scripts/validate-workflow-contracts.js                                           exit=0
node scripts/validate-kaola-workflow-contracts.js                                     exit=0
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js exit=0
node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js   exit=0
node scripts/simulate-workflow-walkthrough.js                                         exit=0   (209/209, FULL scope, not a shard)
```

Walkthrough shard line, proving full scope rather than the 1/12 fast-gate sample:
`##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":209,"ran":209,"passed":209,"failed":0}`

**Additional chain suites touching what I changed:**

```
node scripts/validate-vendored-agents.js                                    exit=0
node scripts/test-validate-script-sync.js                                   exit=0
node scripts/test-install-adaptive-config.js                                exit=0
node scripts/test-suite-registration.js                                     exit=0
node scripts/test-spawn-classification.js                                   exit=0
node scripts/test-install-model-rendering.js                                exit=0
node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js  exit=0
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js  exit=0
node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js    exit=0
node --check <all four resolver copies>                                     exit=0
```

I did not run the four chains — the orchestrator runs those at finalize.

### Two non-green results, both proven NOT mine

**1. `node scripts/test-route-reachability.js` → exit 1** (6 failures / 325 passed).

All six are `T19b roster: …/SKILL.md must ship the role->tier membership its own instruction demands`.
`git show HEAD:scripts/test-route-reachability.js | grep -c "T19b roster"` → **0**: the test does not
exist at HEAD. `git diff --stat HEAD` shows **+232 lines** on that file from another agent — it is the
#941/#944 roster test, authored and waiting on its implementation.

Control run: I rsync'd the worktree to a scratch mirror, reverted **only my 19 files** to their HEAD
blobs (leaving every other agent's edit in place), and re-ran:

```
control_exit=1
Route-reachability test FAILED: 6 failure(s), 325 passed.
```

Identical failure count and pass count with my change absent. My change is not a contributor.

**2. `node plugins/kaola-workflow/scripts/validate-workflow-contracts.js` → exit 1.**

Fails at `:177` with `commands/kaola-workflow-finalize.md is missing` — nothing to do with the floor.
This copy computes `root = path.resolve(__dirname, '..')` = `plugins/kaola-workflow`, and
`plugins/kaola-workflow/commands/` **does not exist** (`ls` → No such file or directory). It is a
byte-copy that exists only to satisfy `COMMON_SCRIPTS` byte-identity; `validate-script-sync.js:63-65`
says as much ("only the claude validator (run from repo-root scripts/) ever invokes its probes").

Control: full-tree scratch mirror of `plugins/kaola-workflow`, run once with my version and once with
HEAD's byte-for-byte version swapped in, everything else identical:

```
mine_exit=1   Error: commands/kaola-workflow-finalize.md is missing
HEAD_exit=1   Error: commands/kaola-workflow-finalize.md is missing
```

Pre-existing and unaffected. The runnable copy, `scripts/validate-workflow-contracts.js`, is exit 0.

---

## Grep proof the cluster is gone

`git grep -nP` (the box's `grep` is ugrep and skips dot-directories; `git grep -E` here lacks `\b`/`\s`):

```
git grep -nP "REASONING_FLOOR_ROLES|isReasoningClass|enforceReasoningFloor|enforceFloor|--enforce-floor|reasoning_floor_violation" \
  -- . ':!kaola-workflow/archive' ':!kaola-workflow/.origin' ':!CHANGELOG.md' \
       ':!docs/decisions' ':!docs/investigations' ':!scripts/prose-census-baseline.json'
rc=1        <- ZERO hits
```

Per-copy count, with a positive control that the file was actually read (`synthesizer: 'opus'` still
present in each):

```
cluster=0 synthesizer_opus=1  scripts/kaola-workflow-resolve-agent-model.js
cluster=0 synthesizer_opus=1  plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js
cluster=0 synthesizer_opus=1  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js
cluster=0 synthesizer_opus=1  plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js
```

### What the exclusions are, and why each stays

Every excluded path is an **immutable historical record**, not a live surface:

- `CHANGELOG.md`, `docs/decisions/D-646-01.md`, `D-687-01.md`, `docs/investigations/2026-06-15-463-*`
  — records of what was decided and when. `validate-workflow-contracts.js:959` states outright that
  rewriting them "would falsify the record".
- `kaola-workflow/archive/**` (24 files), `kaola-workflow/.origin/877/loadbearing.md` — archived run
  records.
- `scripts/prose-census-baseline.json:401` (`"reasoning_floor_violation"`) — **deliberately frozen.**
  See "What the premise report missed", item 2.

---

## What the premise report missed

**1. The `description` field is a THIRD copy, and it is machine-bound.** The premise named
`synthesizer.toml:18` but not `synthesizer.toml:2`, whose `description` also read "held to a
non-lowerable reasoning-tier floor" — and the identical string is a third time in
`plugins/*/config/agents.toml:62`. These are not free prose: `scripts/kaola-workflow-codex-preflight.js:1685-1686`
refuses with `"top-level 'description' does not match config/agents.toml"` when they diverge. Editing
one without the other would have shipped a Codex preflight failure. Both were edited, in all three
trees (6 files), and the gitlab/gitea `test-*-workflow-scripts.js` suites (which read
`config/agents.toml`) are exit 0.

**2. `scripts/prose-census-baseline.json:401` carries `reasoning_floor_violation` — and must NOT be
updated.** It is the committed "before" snapshot of the refusal census. `CHANGELOG.md:1595` is
explicit: *"captures the 'before' at this commit, which is time-critical: a before/after whose
'before' is taken after the deletions it measures is not a measurement."* The tool is read-only,
wired into no chain, and is a measuring tool rather than a gate. Rewriting it would destroy the
measurement this very removal is supposed to be measured by. Left untouched, deliberately.

**3. Five untracked generated edition files still carry the stale sentence — I did not touch them.**

```
.opencode-gitea/agent/synthesizer.md:13
.opencode-gitlab/agent/synthesizer.md:13
.kimi/skills/kaola-role-synthesizer/SKILL.md:13
.kimi-gitea/skills/kaola-role-synthesizer/SKILL.md:13
.kimi-gitlab/skills/kaola-role-synthesizer/SKILL.md:13
```

These are untracked build outputs generated from `agents/synthesizer.md`. Evidence that regeneration
fixes them: `.opencode/agent/synthesizer.md:13` **already carries my new wording** ("…reasoning-class.
A clean agentic merge is a WEAK signal…"), because that tree was regenerated after my edit. I did not
regenerate the other five: their generators (`scripts/sync-opencode-edition.js`) and their suites
(`test-opencode-edition.js`, `test-kimi-edition.js`) are being edited by another agent right now, and
running a generator mid-edit risks a mixed output. **Flagging for the orchestrator**, not fixing.

**4. The premise listed the `isReasoningClass` comment for deletion without noting it was the sole
carrier of the dependency-free constraint.** Verified sole carrier:
`git grep -nP "dependency-free|copies THIS resolver|resolver standalone"` returned only the four
resolver copies (plus two unrelated `docs/decisions/D-585-01.md` hits about lock primitives).

**5. Line numbers.** The premise's own correction held: the issue's numbers are +2 off at HEAD. All
edits were made against text matched exactly, never against a line number.

---

## Not done, and why

- **`CHANGELOG.md`** carries no `[Unreleased]` section (the release-prepare flow consumes it), and the
  brief did not assign it. The user-visible change here is the retirement of the `--enforce-floor` CLI
  flag and three module exports. **Owed to the orchestrator at finalize.**
- **`docs/api.md` / `docs/architecture.md` need no edit.** Both describe only the resolution chain
  (`caller → frontmatter → DEFAULT_AGENT_MODELS → ''`), which is unchanged; neither mentions the floor,
  the flag, or the removed exports. Checked by grep, not assumed. (`docs/api.md` is test-consumed, so
  an unnecessary edit there would have staled the chain receipt for no gain.)
- **No commit**, per the brief.
- **Stayed out of** `sync-opencode-edition.js`, `test-opencode-edition.js`, `test-kimi-edition.js`,
  `test-install-model-rendering.js`, `templates/routing/next.skeleton.md`,
  `generate-routing-surfaces.js`. None needed editing. `test-install-model-rendering.js` was *run*
  (exit 0) but not modified.
