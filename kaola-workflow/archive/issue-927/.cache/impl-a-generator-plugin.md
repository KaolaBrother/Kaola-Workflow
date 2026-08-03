# #927 — implementer A: generator + plugin (Layer 1, badge, Layer 2)

**Worktree**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927` (branch
`workflow/issue-927`). **Baseline commit**: `c3938174`.

**Verification tier**: `tests-green` — the authored suite (`scripts/test-opencode-edition.js`,
custody: test author) passes, plus the walkthrough, the kimi edition suite, the routing-surface
check and the ×4 script-sync validator.

No test file was written, edited or read-only-bypassed. `install-opencode.sh` (implementer B's) was
never touched — it was already modified in the worktree when I started and is untouched by me.

---

## Files changed

| file | what |
|---|---|
| `scripts/kaola-workflow-adaptive-schema.js` | provider→contract rules become DATA; `CONTRACT_EFFORT_TABLE` + rules exported; two comments corrected |
| `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js` | ×4 anchor re-sync (`edition-sync.js --write`) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js` | ×4 anchor re-sync |
| `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js` | ×4 anchor re-sync |
| `scripts/sync-opencode-edition.js` | Layer 1 emission, badge restatement, `--write-effort-tiers-to`, prose corrections |
| `templates/opencode/plugins/kaola-workflow-hooks.js` | Layer 2 `chat.params` hook + shared deployed-artifact resolution |

Gitignored regenerated trees (`.opencode/`, `.opencode-gitlab/`, `.opencode-gitea/`) were rewritten
with `sync-opencode-edition.js --forge=<f> --write` — the sanctioned mechanism; no rendered copy was
hand-edited. Regenerating all three is required because the suite's D0 block runs `--check` over
every tree present on disk *before* its own self-provisioning `--write`, and exits 1 on drift.

---

## What changed and why

### Layer 1 — `renderAdaptiveConfig` (`scripts/sync-opencode-edition.js`)

Each role now emits `{ "options": <contract cell payload> }` instead of `{ "variant": "<name>" }`.
`agent.<role>.options` is merged into every call with no gate on `agent.model`; `agent.<role>.variant`
is reachable only for a role that also pins a model, which this generator never does — so every
variant this edition shipped was inert. The whole `provider.*.variants` block is gone rather than
left beside the new key: it existed only to define names nothing can now reach, and a dead key that
reads as configuration is what hid the failure. No `variant` and no `model` key appears on any role.

`renderNeutralConfig` is untouched — its `agent.<role>.model` pins are the separate opt-in path.

**Prose.** The `:641`/`:650-656` block was replaced. `"opencode applies them from this file"` was a
false mechanism claim when written, and the `⚠ SWITCHING YOUR OPENCODE MODEL?` regenerate warning is
retired by per-call resolution. The replacement states the result (each role carries its tier as an
`options` payload that reaches the model; the plugin re-resolves the contract per call; what is
written here is what applies if the plugin is not loaded) and shows the two payloads literally rather
than naming a resolver function. Four further `EFFORT-VARIANT` mentions elsewhere in the same file
(`renderOpencodeJson`, `buildAdaptOpts`, `runWriteConfigTo`, `usage()`) and the
`rewriteClaudeScriptPaths` header were corrected for the same reason.

### The badge — `OPENCODE_BADGE_BLOCK` / `OPENCODE_BADGE_GUIDANCE`

Both asserted that effort resolves through *variants*, on a prompt surface rendered into agent and
command files. Restated as the result: the role's configured effort applies centrally on every call
it makes, reasoning-tier at the top effort the model in use offers and standard-tier one step below.
The behavioural instruction survives verbatim in substance — dispatch with the `task` tool by
`subagent_type: "<role>"`, never a per-call `model=`. The `mapTier(tier, provider) resolves the
variant` line is deleted outright.

`scripts/sync-kimi-edition.js:405` references this block by name ("where opencode substitutes its
Effort Variant Resolution block"). **That comment is still accurate and was not changed** — see the
judgement call below.

### Layer 2 — sidecar + `chat.params` hook

**Generator** — `--write-effort-tiers-to <path>` writes `effort-tiers.json`:

- `tiers` — role → `top`/`second`, derived by iterating `topTierRoles()` / `standardTierRoles()`.
  No role list is typed anywhere in the generator.
- `providerContracts` — `{ rules: [...], default: "default" }`, serialized straight from the schema
  module's `PROVIDER_CONTRACT_RULES` / `DEFAULT_PROVIDER_CONTRACT`.
- `effort` — per contract, `{ top, second }` options payloads from `CONTRACT_EFFORT_TABLE`.

Keys sorted, so the file is deterministic and a reinstall is byte-idempotent.

**Schema (`kaola-workflow-adaptive-schema.js`)** — the provider→contract regex chain inside
`contractForProvider` became an ordered data list, `PROVIDER_CONTRACT_RULES`, which the function
itself consumes (via a compiled-once derived view) and the generator serializes. That is what stops
the plugin from becoming a fifth spelling of one rule. `match` is a regex *source string*, so it
survives JSON. `contractForProvider`'s behaviour is unchanged — see the differential proof below.
`CONTRACT_EFFORT_TABLE.variant` **stays** (addendum 3); only its comment was corrected, because it
claimed `variant` is "referenced by `agent.<role>.variant`", which after this change is false.

**Plugin (`templates/opencode/plugins/kaola-workflow-hooks.js`)** —

- `hookPath()`'s five-candidate project-then-global walk was generalized to `deployedPath(root, dir,
  name)`; `hookPath` is now a one-line call into it, and the sidecar resolves through the *same*
  walk under `kaola-workflow/`. No second resolution scheme was invented.
- `loadEffortTiers(root)` runs once per session at factory time and collapses **every** failure mode
  to `null` — absent, unreadable, non-JSON, JSON of the wrong shape, an unusable regex source.
- The hook reads `input.provider?.id` (per the brief) and treats `input.agent` as a plain **string**;
  a non-string agent, an agent absent from the tier map, or an unresolvable provider all return
  before anything is written.
- **Addendum 1 — replace, do not spread.** The knobs to clear are the union of every top-level option
  key across every contract × rank *in the sidecar's own `effort` table*. On each call, every knob
  the resolved payload does not own is `delete`d from `output.options`, then the resolved payload is
  written. Result: the payload carries this call's contract knob and no other contract's, and
  unrelated options (opencode's own merged provider/model options) are untouched. A contract added to
  `CONTRACT_EFFORT_TABLE` with a new knob reaches the plugin whole; nothing is hand-typed.
- **Cannot throw.** The entire body is inside one `try {} catch {}`, matching the plugin's existing
  fail-open hooks, and every intermediate lookup is guarded first (`hasOwnProperty` on the tier map,
  so an agent named `constructor` or `__proto__` resolves nothing).
- Payload values are detached with a JSON round-trip on assignment, so a downstream writer mutating
  what it was handed cannot corrupt the cached sidecar for every later call in the session.

---

## Verification (real exit codes, never through a pipe)

Every command was run as `cmd > file 2>&1; echo "EXIT=$?"`.

### Before (baseline, worktree at `c3938174` + the test author's red test file)

```
node scripts/test-opencode-edition.js
  → opencode-edition test FAILED: 232 failure(s), 563 passed.   EXIT=1
node scripts/test-kimi-edition.js
  → kimi-edition test passed (507 assertions).                  EXIT=0
node scripts/validate-script-sync.js
  → OK: 15 common scripts, 27 byte-identical groups, …          EXIT=0
```

### After

```
node scripts/test-opencode-edition.js
  → opencode-edition test passed (811 assertions).
    [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]   EXIT=0
node scripts/test-kimi-edition.js
  → kimi-edition test passed (507 assertions).
    [drift-check: 3 tree(s) in parity (.kimi, .kimi-gitlab, .kimi-gitea)]               EXIT=0
node scripts/simulate-workflow-walkthrough.js
  → 202 scenarios, 202 ran, 202 passed, 0 failed. Workflow walkthrough simulation passed. EXIT=0
node scripts/generate-routing-surfaces.js --check
  → all 18 surfaces byte-match the skeleton.                                            EXIT=0
node scripts/validate-script-sync.js
  → OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families,
    2 hooks.json families, 6 forge export-superset families in sync;
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.                  EXIT=0
node scripts/sync-opencode-edition.js --forge={github,gitlab,gitea} --check
  → 14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical (each)            EXIT=0
```

232 → 0 failures; 563 → 811 passing assertions. The 811 includes the A26/A27 blocks that depend on
implementer B's `install-opencode.sh` work, which had already landed in the worktree.

### Differential proof that `contractForProvider` did not change

Old regex chain vs new data-driven implementation, compared over 205,832 inputs (5,832 structured
concatenations of every interesting substring × 200,000 random strings over `[a-z0-9-]`, plus
`null` / `undefined` / `0`): **0 mismatches**. Spot-checked: `zhipuai-coding-plan`, `zai`, `z-ai`,
`zhipu-glm`, `glm-5.2`, `ZAI` → `anthropic` (GLM rule still first); `anthropic`/`claude-sonnet-4-5`
→ `anthropic`; `openai`/`gpt-5`/`codex` → `openai`; `google`/`gemini-2.5-pro` → `google`;
`acme-corp`/`""` → `default`. `effortForProvider('')` still returns `null`.

---

## Mutation proofs

Done on a **scratch backup** (`cp` to the session scratchpad, `cp` back, SHA-256 verified identical
after each restore). `git checkout --` was never used — it would have destroyed implementer B's
concurrent `install-opencode.sh` work.

Restored checksums, verified after every mutation:
`scripts/sync-opencode-edition.js` → `89913bd2…` (that file was later edited again for the four
residual prose corrections, after all mutations were complete);
`templates/opencode/plugins/kaola-workflow-hooks.js` → `e3138d97…`.

### Mutation 1 (required) — delete the emitted `options` payload

`renderAdaptiveConfig` emits `"<role>": { }` instead of `"<role>": { "options": … }`.

```
opencode-edition test FAILED: 76 failure(s), 735 passed.   EXIT=1
  75 × A12-options   (70 per-role payload + 5 per-contract tier-distinctness)
   1 × A12-options(subagent)
```

**ARMED.** Note the mutation deliberately leaves the role keys in place, so it isolates the payload
from role coverage; the coverage assertions stayed green, which is the separation the test author
built for.

### Mutation 2 (required) — break the hook's other-contract clearing

Removed the `delete opts[knob]` loop, leaving the plain spread-merge the design of record originally
sketched. (The template was regenerated into all three trees first, so D0's parity check would not
short-circuit the run before the real assertions.)

```
opencode-edition test FAILED: 2 failure(s), 809 passed.   EXIT=1
FAIL: A26-hook[stale-anthropic-on-openai] … Got
      {"__kwUnrelated":"keep","thinking":{"type":"enabled","budgetTokens":32000},"reasoningEffort":"xhigh"}
FAIL: A26-hook[stale-openai-on-anthropic] … Got
      {"__kwUnrelated":"keep","reasoningEffort":"xhigh","thinking":{"type":"enabled","budgetTokens":32000}}
```

**ARMED,** and precisely: exactly the two assertions the test author added for addendum 1 fire, and
nothing else. The failure output shows both contracts' knobs going out together — the exposure
Layer 2 exists to close.

### Mutation 3 (extra, my own) — hand-type the sidecar's tier map and diverge it by one role

Replaced the `topTierRoles()` derivation with a literal four-role list and moved `synthesizer` to the
standard list.

```
opencode-edition test FAILED: 2 failure(s), 809 passed.   EXIT=1
FAIL: A26-sidecar: the sidecar's `top` set === topTierRoles() (single-sourced)
FAIL: A26-sidecar: the sidecar's `second` set === standardTierRoles() (single-sourced)
```

**ARMED.** Worth recording precisely: a hand-typed list that happens to be *correct today* would
still pass — no static suite can distinguish it — so the "derived, not hand-typed" property is
carried by the code, and what the suite defends is that the two never *diverge*. Also worth
recording that the `A26-hook` payload assertions did **not** red under this mutation, because
`synthesizer` is not one of the roles those cases drive; A26-sidecar is the only guard on the tier
map's contents.

### Independent (non-suite) probe

Before running the authored suite I drove the shipped hook through a hermetic harness of my own (27
cases: the suite's 23 plus `__proto__`/`constructor` agent names, a numeric `provider.id`, and a
non-object `output.options`) in all three sidecar states — generated, absent, malformed. Zero throws
in all three; correct payloads with the sidecar present; `output.options` untouched without it.
Script: `…/scratchpad/probe-hook.js` (scratchpad only; not a repo artifact, not a test).

---

## Judgement calls, and one thing I deliberately did not do

### The badge HEADING `## Effort Variant Resolution` was kept

The heading still contains the word "Variant". I left it, and this is a decision the owner may want
to overturn.

`S2` in `scripts/test-opencode-edition.js` locates the badge section with
`/^##\s+Effort Variant Resolution\s*$/` and asserts two properties over it (no `opus`/`sonnet` leak;
neutral `reasoning-tier`/`standard-tier` labels). Renaming the heading makes `badgeSection()` return
`null`, so those assertions **silently skip** — a guard disarmed without a red, which is exactly the
class this project treats as a defect. The test author flagged this in `test-authoring.md` §4.3
("the existing S2 block asserts on that badge section, so a rewrite there is not free") and left the
call open.

What I did instead: the body of the block no longer names variants as the mechanism anywhere, and
neither does `OPENCODE_BADGE_GUIDANCE`. I verified S2 is genuinely armed rather than vacuous — the
badge block renders into exactly one surface (`.opencode/command/kaola-workflow-finalize.md`, the
only canonical command carrying `## Agent Model Badge`), which is the same coverage as before.

**If the heading should also change** (e.g. to `## Effort Tier Resolution`), S2's anchor must be
re-authored by the test author first. I did not edit it.

### `OPENCODE_BADGE_GUIDANCE` currently renders nowhere

Measured, not assumed: `rewriteBadgeInstructions` rewrites exactly one paragraph across all canonical
commands and agents (`commands/kaola-workflow-finalize.md`), and that paragraph sits *inside* the
`## Agent Model Badge` section, which `transformCommandBody` then replaces wholesale — so the
guidance string is currently discarded on every surface. `grep -rn "Dispatch the role via" .opencode/`
finds nothing. **This is pre-existing and unchanged by me** (the same structure held before this
issue). The string still has a job: `assertNoBadgeResidue` subtracts it before scanning, and it is
the declared answer if canonical reintroduces a `model=` sentence outside the badge section. Worth
knowing that it is not currently exercised end to end.

### Things I did NOT decide (they are not mine)

- **`sync-kimi-edition.js:405`** — its comment names "its Effort Variant Resolution block". Since I
  kept the heading, the reference is still accurate, so I made no change there. If the heading is
  renamed later, that comment goes with it.
- **`CONTRACT_EFFORT_TABLE.variant`** — kept per addendum 3. The existing `S1-contract` assertions
  that pin variant names are still green and were not touched.
- **The live acceptance criterion** (two subagents on one inherited model measurably differing in
  `tokens_reasoning` in `opencode.db`) is not something I can produce; the static half is green.

---

## Open concerns for the orchestrator

1. **Docs and CHANGELOG are outside my file set and are now stale.** All of these describe the
   retired variant mechanism and should be routed to someone:
   - `README.md:368` — "two model tiers as reasoning-effort variants of your inherited model … gets
     the model's **top** effort variant".
   - `docs/opencode-edition.md` — §"Model effort — two tiers as reasoning-effort variants" (:87),
     :92, :98, :114, :124–:132 ("it defines the two effort variants under `provider.*` and selects
     …"), :268, :457, :465. The `provider.*` sentence is now flatly false.
   - `docs/kimi-edition.md:83`, `:320` — comparative references to the opencode `mapTier`
     effort-variant mechanism.
   - `CHANGELOG.md` `[Unreleased]` — nothing written for this change.
2. **`--no-scripts` and the sidecar** (test author §4.5). Not mine to decide, but if the sidecar
   write lives inside `install_support_scripts`, every `--no-scripts` install ships a plugin with no
   sidecar and silently un-tiers. That is a Layer-2 question for implementer B's surface; the
   plugin's behaviour in that state is a clean no-op (proven above), so it degrades to Layer 1.
3. **Project-install sidecar location** (test author §4.4). The plugin resolves through the shared
   `deployedPath` walk, so a project install *does* have working candidates
   (`<project>/.opencode/kaola-workflow/effort-tiers.json`, and the plugin-sibling
   `SELF_DIR/../kaola-workflow/`). Whether the installer writes one there is B's call; nothing is
   asserted either way.
4. **This is an edition-touching diff** — the ×4 anchor moved, so the finalize chain run is all four.
5. **No test is wrong, in my reading.** Every assertion I ran against is one I could satisfy without
   special-casing. The only shaped-for-me observation is mutation 3's: a hand-typed-but-correct role
   list would pass A26-sidecar, which is a limit of any static suite, not a defect in the test.

---
---

# Round 2 — coordinator follow-ups (badge rename + stale schema comments)

Two follow-ups applied after the report above. Same worktree, same file set. No `git checkout --`
and no `git stash`; a doc agent and implementer B had concurrent edits landed in the tree throughout
(`CHANGELOG.md`, `README.md`, four `docs/**`, `install-opencode.sh`) and all of them survive intact.

**This supersedes two entries in "Things I did NOT decide" above**: the badge heading IS now renamed,
and `sync-kimi-edition.js:405` IS now updated. The reasoning recorded above for keeping the heading
(that renaming it would disarm S2) was correct at the time and has been resolved the right way round
— the test author re-anchored the guard first, and the source followed.

---

## 1. Badge rename

The test author re-anchored S2 and it was RED against my source. Observed before touching anything:

```
node scripts/test-opencode-edition.js
  → opencode-edition test FAILED: 2 failure(s), 813 passed.   EXIT=1
FAIL: S2[kaola-workflow-finalize.md]: the effort block is LOCATABLE under the exact heading
      "## Effort is configured, not passed" …
FAIL: S2 (#927): .opencode/command/kaola-workflow-finalize.md:28: mechanism word "Variant" in
      generated opencode prose …
```

**Applied**, verbatim as given, as the first element of `OPENCODE_BADGE_BLOCK`
(`scripts/sync-opencode-edition.js`):

```js
const OPENCODE_BADGE_BLOCK = [
  '## Effort is configured, not passed',
```

The canonical trigger heading `## Agent Model Badge` is untouched — as the coordinator noted, that is
the Claude-side heading the transform *matches at*, not the one it emits. I made that distinction
explicit in the transform's own comment, because the old wording ("replace the canonical Agent Model
Badge block … with an opencode-native `Effort Variant Resolution` note") read as though both headings
were the generator's to choose.

**Two stale comments fixed with it:**

- `scripts/sync-opencode-edition.js:263` — the transform header no longer names the emitted heading at
  all; it now says canonical's heading is the trigger, and records that the emitted heading is matched
  verbatim by the edition suite's block locator, so the two move in one change.
- `scripts/sync-kimi-edition.js:405` — "where opencode substitutes its Effort Variant Resolution
  block" → "where opencode substitutes its own effort block". Naming the sibling edition's heading
  from inside kimi was a cross-edition copy of a string kimi has no reason to know; not naming it is
  also what stops this comment going stale the next time that heading moves.

**Mechanism-word sweep**: all three opencode trees regenerated (`--forge={github,gitlab,gitea}
--write`), then swept independently of the suite:

```
swept 51 generated files across 3 opencode trees; mechanism-word hits: 0
heading present: .opencode/command/kaola-workflow-finalize.md          OK
                 .opencode-gitlab/command/kaola-workflow-finalize.md   OK
                 .opencode-gitea/command/kaola-workflow-finalize.md    OK
```

(51 = agents + commands across the three trees. The suite's own sweep covers `.opencode/` only; I
swept all three because the gitlab/gitea trees ship the same block and D0 checks them.)

---

## 2. Stale mechanism claims on the ×4 anchor

### The zero-definitions claim, verified myself (not taken from the coordinator)

Walked **1,242** code-ish files (`.js/.mjs/.cjs/.ts/.sh/.json/.toml`) and **8,987** files total,
excluding only `node_modules` and `.git` — **dot-directories deliberately included**, since the
project's `grep` is ugrep and skips them. Definition patterns (`function N(`, `const|let|var N =`,
`N: function`, `N = function`) counted separately from bare references:

| symbol | definitions | references |
|---|---|---|
| `dispatchEffortOpencode` | **0** | 4 — all four ×4 copies of the `:56` comment itself |
| `resolveOpencodeProvider` | **0** | **0** anywhere |
| `buildDispatch` | **0** | **0** anywhere |
| `dispatchModelClaude` | **0** | 4 — the same `:56` comment |
| `dispatchModelCodex` | **0** | 4 — the same `:56` comment |
| `opencode_variant` | **0** producers | 54, all archived envelope JSON under `kaola-workflow/archive/**/.cache/`, plus 2 prose mentions (`CHANGELOG.md`, `docs/decisions/D-544-01.md`) |
| `dispatchEffort` | 4 (the ×4 copies) | live |
| `mapTier` | 4 (the ×4 copies) | live |

**Claim CONFIRMED, and it is wider than reported.** The coordinator named `dispatchEffortOpencode`;
the same `:56` sentence also listed `dispatchModelClaude` and `dispatchModelCodex`, and those are
**equally gone** — three of the six consumers it named do not exist. `CHANGELOG.md` (#880)
corroborates independently: *"Deleted outright: the per-runtime dispatch-model pair … and
`dispatchEffortOpencode`."*

I also measured what the sentence claimed positively. `normalizeTier` has exactly **two** call sites
repo-wide, both inside the schema module itself — `dispatchEffort` (:101) and `mapTier` (:212, via
the `TIER_RANK` lookup, which is therefore not a third consumer but part of the second). The
"reasoning-floor check" the comment also listed **does exist** (`enforceReasoningFloor` in
`kaola-workflow-resolve-agent-model.js`) but does **not** route through `normalizeTier` at all — it
keys off a role-name set. So the roster was wrong in both directions: three entries that do not
exist, and one that exists but is not a consumer.

### What I changed

- **`:52-60`** — the roster is gone; the comment states the result: `normalizeTier()` is the single
  alias-resolution seam, a tier token is resolved there and nowhere else, so one token means one
  thing to every reader. A short note records *why* the roster is not replaced by a corrected roster
  (a caller list is a copy of the truth that stops being true without saying so) — which is the
  general form of the failure, not a one-off repair.
- **`:123-125`** — "rank → that contract's effort **variant**" → "rank → the **OPTIONS PAYLOAD** that
  carries that effort to the model call". Not named by the coordinator, but it is the same claim in
  the same block and would have contradicted the corrected `:136`.
- **`:132-140`** — the contract table's columns were headed `opus (top)` / `sonnet (second)` (legacy
  alias vocabulary) with variant names in the cells. They now show **what is actually sent**:
  `thinking 32k/16k tokens`, `reasoningEffort xhigh/high/low/medium`. The trailing sentence now says
  the payload is the whole of what a rank means, and that each cell also carries a provider-relative
  *name* which is a label for a human reading the table, with nothing selecting a tier by it.
- **`:47`** — "opencode maps them to a provider effort **variant**" → "…to the provider's effort
  **payload** for that rank". Same class; leaving it would have contradicted the three fixes above.

Checked first that nothing pins the schema file's comment text: no `assertIncludes`/`assertExcludes`
against `kaola-workflow-adaptive-schema.js` exists in any `test-`/`validate-`/`simulate-` script; the
only text-level constraint on it is the ×4 byte-identity, handled by `edition-sync.js`.

`CONTRACT_EFFORT_TABLE.variant` itself is still present and untouched (addendum 3).

### ×4 re-sync

```
node scripts/edition-sync.js --write        → 3 file(s) byte-synced        EXIT=0
node scripts/validate-script-sync.js        → OK: 15 common scripts, 27 byte-identical groups,
                                              1 rename-normalized families, 2 hooks.json families,
                                              6 forge export-superset families in sync;
                                              committed kernel parity: 4 Oracle Kernel copies
                                              identical at HEAD.                          EXIT=0
```

---

## Round-2 verification (real exit codes, read from `$?`, never through a pipe)

### Before (this round's starting point — the re-anchored suite against my round-1 source)

```
node scripts/test-opencode-edition.js
  → opencode-edition test FAILED: 2 failure(s), 813 passed.                              EXIT=1
```

### After

```
node scripts/test-opencode-edition.js
  → opencode-edition test passed (817 assertions).
    [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]    EXIT=0
node scripts/test-kimi-edition.js
  → kimi-edition test passed (507 assertions).
    [drift-check: 3 tree(s) in parity (.kimi, .kimi-gitlab, .kimi-gitea)]                EXIT=0
node scripts/simulate-workflow-walkthrough.js
  → 202 scenarios, 202 ran, 202 passed, 0 failed. Workflow walkthrough simulation passed. EXIT=0
node scripts/generate-routing-surfaces.js --check
  → all 18 surfaces byte-match the skeleton.                                             EXIT=0
node scripts/validate-script-sync.js
  → OK … committed kernel parity: 4 Oracle Kernel copies identical at HEAD.              EXIT=0
node scripts/sync-opencode-edition.js --forge={github,gitlab,gitea} --check
  → in parity with canonical (each)                                                      EXIT=0
```

811 → **817** assertions: the re-anchored S2 adds the locate-or-red check in both directions plus the
in-block and body-wide mechanism-word sweeps. Round 1's Layer-2 hook probe was re-run against the
final tree as a regression check: 27 cases, **0 throws**, payloads unchanged.

---

## Round-2 mutation proof

The pre-fix red above already proves the locator is armed — old heading in the source, S2 red. What
that red does **not** separate is the locator from the content checks: both fired at once, so a
mechanism word surviving *under a correct heading* was still unproven. So one more mutation, on a
scratch mirror (`cp` out, `cp` back, SHA-256 verified `4eb3cb2b…` before and after; no `git checkout`).

**Mutation 4 — correct heading, mechanism word reintroduced in the block body:**

```
opencode-edition test FAILED: 2 failure(s), 816 passed.   EXIT=1
FAIL: S2[kaola-workflow-finalize.md]: the effort block names NO `variant` anywhere, heading included …
FAIL: S2 (#927): .opencode/command/kaola-workflow-finalize.md:30: mechanism word "variant" in
      generated opencode prose …
```

**ARMED, and the two halves are independent**: the locator assertion passed (the heading was right),
and the block-scoped `(a2)` check and the anchorless body-wide `(e)` sweep each fired on their own.
That is the property the earlier red could not establish, and it is the one that matters — the
original failure was a scoped guard that found no block.

Restored, re-verified green (817 / 507 / 202 / 18, all exit 0).

---

## Round-2 notes and remaining concerns

1. **Nothing in my file set now names a mechanism for effort.** Measured: 0 `variant`/`variants`
   occurrences across all 51 generated agent+command files in the three opencode trees; the only
   surviving `variant` in my file set is `CONTRACT_EFFORT_TABLE`'s own field (kept by addendum 3) and
   the comments that describe it as a descriptive label.
2. **Concurrent work preserved.** `CHANGELOG.md`, `README.md`, `docs/opencode-edition.md`,
   `docs/kimi-edition.md`, `docs/audits/opencode-edition-audit.md`,
   `docs/decisions/D-610-01.md`, `docs/investigations/2026-08-03-…design.md` and
   `install-opencode.sh` are all modified by other agents and untouched by me. Round 1's open concern
   about stale docs appears to be in hand — I did not read or verify their content, and I make no
   claim about it.
3. **`docs/decisions/D-544-01.md` mentions `opencode_variant`** (one of the 2 non-archive references
   I measured). It is a decision record describing a historical state, so it may well be correct as
   written; not mine, and I did not touch it. Flagging only because I measured it.
4. **The three-of-six roster finding is worth carrying forward**, not just fixing here: a comment
   that names its consumers by function name is a copy of the call graph, and this one drifted
   through three deletions without anything noticing. Nothing detects that class today.
5. `OPENCODE_BADGE_GUIDANCE` still renders to no shipped surface — unchanged from round 1, still
   pre-existing, still not something I introduced or removed.

---
---

# Round 3 — adversarial-review defects (plugin loader · option merge · API contract)

Three defects, all three real, all three fixed. Plus one claim in the report I **refute** with
measurement. Files touched: `templates/opencode/plugins/kaola-workflow-hooks.js`,
`scripts/kaola-workflow-adaptive-schema.js` (+ ×4 copies), `scripts/sync-opencode-edition.js`.
No revert commands; B's and the test author's concurrent work is intact.

**One red remains and it is not mine to fix — see the handoff at the end.**

---

## Defect 1 (BLOCKING) — named exports are plugin factories to opencode's loader

### Reproduced the way opencode loads, not by reasoning

Re-read the loader out of the shipped 1.18.11 binary and reimplemented `Yy`/`Xy`/`Jy` byte-for-byte
in a probe (`…/scratchpad/probe-loader.mjs`), then ran the real template through it.

```
BEFORE (export { hookPath, findRoot }):
  exportNames: ["default","findRoot","hookPath"]
  factories:   3
  collected:   KaolaWorkflowHooks ok=true
               findRoot           ok=false
               error="The \"paths[0]\" argument must be of type string. Received an instance of Object"
  loadError:   level=ERROR message="failed to load plugin" …

AFTER:
  exportNames: ["default"]
  factories:   1
  collected:   KaolaWorkflowHooks ok=true
  loadError:   null
  hooksRegistered: ["tool.execute.before","experimental.session.compacting","chat.params"]
```

The message matches the reviewer's live log exactly. The "inert for the runtime" comment was false
and is gone; the replacement comment states the constraint and why it is one.

### The accident, measured

`Xy` pushes into the caller's array as it iterates, and ESM namespace keys are **sorted**, so
`default` was collected before `findRoot` threw. **Mutation 5** adds one export named
`applyEffortTier` (`a` sorts before `d`) and the whole thing collapses:

```
mutation 5, NEW shape + applyEffortTier:  factories: 2  hooksRegistered: []   ← every hook dead
control,    OLD shape + applyEffortTier:  factories: 4  hooksRegistered: []   ← identical outcome
```

`hooksRegistered: []` with one already-normalised error line and nothing else. The fix is therefore
not "make the helpers safe to call" — it is **have nothing beside `default` at all**, which is what
now ships and what the comment above `KaolaWorkflowHooks` exists to defend.

### The shape chosen — and why not the alternatives

`export default` is the only export. Helpers hang off it:

```js
KaolaWorkflowHooks.hookPath = hookPath;
KaolaWorkflowHooks.findRoot = findRoot;
```

A property on a function is invisible to `Object.values(mod)`. Rejected alternatives, both read out
of `Xy` rather than guessed: exporting an **object** (`export const __test = {…}`) hits
`if(!J) throw TypeError("Plugin export is not a function")` and kills the module at load; making the
helpers **tolerant** of a `PluginInput` first argument still registers them as plugins returning
`undefined`, and `Plugin.trigger`'s `for(let H of B.hooks){ let M=H[W]; …}` throws on an `undefined`
entry at the first hook dispatch.

Reachability verified against the shipped copy:

```
node --input-type=module → { "resolved": ".../.opencode/hooks/kaola-workflow-subagent-dispatch-log.sh",
                             "missing": null, "findRoot": "function" }   exit 0
```

Both of H1's existing assertions hold on that output.

---

## Defect 2 — the hook destroyed sibling keys opencode itself set

Confirmed and fixed. `opts[knob] = payload[knob]` replaced a whole nested provider payload; a
`clear_thinking` flag opencode set inside `thinking` was dropped with it.

Now `mergeInto()` merges **recursively** (arrays and scalars replace, as upstream does), while a knob
belonging to another contract is still **deleted whole**. The two rules pull opposite ways and the
code says so at the site. Measured on the shipped plugin:

```
sibling-thinking        PRE  {"thinking":{"type":"enabled","clear_thinking":false,"budgetTokens":16000},"__kwUnrelated":"keep"}
                        POST {"thinking":{"type":"enabled","clear_thinking":false,"budgetTokens":32000},"__kwUnrelated":"keep"}
                             ^ sibling survives                                    ^ our budget applied

sibling-cross-contract  PRE  {"thinking":{…,"clear_thinking":false,…},"__kwUnrelated":"keep"}   (OpenAI call)
                        POST {"__kwUnrelated":"keep","reasoningEffort":"xhigh"}
                             ^ the whole wrong-contract knob still goes — addendum 1 intact
```

Every value written is still detached from the cached sidecar.

---

## Defect 3 — contract resolved from the brand id, never the API contract

Fixed, and the fix is **narrower than the report proposed**, on measurement.

### What the runtime actually hands us — read from the binary

`model.api` is an object `{id, url, npm}`, and opencode dispatches its **own** request adapter on
`api.npm`:

```
if(l.api.npm==="@ai-sdk/openai")   return Tl.configure(h).responses(l.api.id);
if(l.api.npm==="@ai-sdk/azure")    return Nl.configure(…).responses(l.api.id);
if(l.api.npm==="@ai-sdk/anthropic")return Al.configure(h).model(l.api.id);
if(l.api.npm==="@ai-sdk/google")   return Vl.configure(h).model(l.api.id);
```

and inside `LLMRequestPrep.prepare` — the function that fires `chat.params` — it reads
`e.model.api.npm` directly. So it is the wire protocol, available at hook time, and it outranks a
brand name. `API_CONTRACT_RULES` is tried **first**; no match means **no answer** and the brand rules
decide. `contractForProvider` is untouched.

### Rules validated against all 179 real providers (`~/.cache/opencode/models.json`)

**13 providers get a better answer; none that was already right changes.**

```
vivgrid, meta, perplexity-agent  @ai-sdk/openai      default -> openai
azure, azure-cognitive-services  @ai-sdk/azure       default -> openai
thinkingmachines, freemodel,     @ai-sdk/anthropic   default -> anthropic
subconscious, kimi-for-coding,
minimax{,-coding-plan,-cn,-cn-coding-plan}
```

plus, measured from the binary rather than from models.json, **github-copilot serving Claude**:
`api:{…,npm: G ? "@ai-sdk/anthropic" : "@ai-sdk/github-copilot"}` — computed per model, so a Claude
model behind Copilot now resolves to the anthropic contract. Probe: `api-copilot-claude` →
`{"thinking":{"type":"enabled","budgetTokens":32000}}` (was `reasoningEffort`).

### Deliberate omissions, each with the reason

- **`@ai-sdk/openai-compatible` is NOT mapped.** It is 142 of 179 providers — a generic transport
  that says nothing about which knob the endpoint honours. It is also what **z.ai / Zhipu GLM** is
  served through, while this project routes GLM to the anthropic contract. Mapping it would silently
  overturn that ruling, which is not mine to overturn. Regression-checked:
  `zhipuai / zhipuai-coding-plan / zai / zai-coding-plan` → api-rule `null` → brand `anthropic` →
  **FINAL anthropic**, unchanged. Probe `api-openai-compatible-zai` → thinking budget. ✓
- **Multi-vendor gateways** (`@ai-sdk/amazon-bedrock`, `@openrouter/ai-sdk-provider`,
  `@ai-sdk/gateway`, `@ai-sdk/github-copilot`) name the gateway, not the family behind it. They stay
  on the safe `default` rather than a guess. The reviewer listed bedrock/openrouter as falling
  through to `default` — they still do, on purpose.
- **Contracts outside our four** (`@ai-sdk/cohere`, `/mistral`, `/xai`, `/groq`, …) have no cell to
  resolve to; `default` is the honest answer, not the nearest neighbour.
- `alibaba` is `@ai-sdk/openai-compatible` → stays `default` for the same reason as GLM.

### REFUTED: `google-vertex-anthropic` was never wrong

The report says it "matches the `google|gemini` rule and would send `reasoningEffort` at an Anthropic
endpoint". It does not. The brand chain tests `anthropic|claude` **before** `google|gemini`, and the
id contains `anthropic`:

```
node -e 'contractForProvider("google-vertex-anthropic")'  →  anthropic
```

It was already correct by brand, and it stays correct by API package. I fixed the class the claim
belongs to, but the named instance was not a defect.

---

## Verification (real exit codes, read from `$?`)

```
node scripts/test-opencode-edition.js
  → FAILED: 3 failure(s), 835 passed.  EXIT=1   ← all 3 are H1, the test author's import shape
node scripts/test-kimi-edition.js
  → kimi-edition test passed (507 assertions).                                     EXIT=0
node scripts/simulate-workflow-walkthrough.js
  → 202 scenarios, 202 ran, 202 passed, 0 failed.                                  EXIT=0
node scripts/generate-routing-surfaces.js --check
  → all 18 surfaces byte-match the skeleton.                                       EXIT=0
node scripts/validate-script-sync.js
  → OK … committed kernel parity: 4 Oracle Kernel copies identical at HEAD.        EXIT=0
```

Hook probe on the shipped plugin, 43 cases × 3 sidecar states (generated / absent / malformed):
**0 throws in every state**; all 23 original suite cases byte-unchanged.

---

## Mutation proofs — and an uncomfortable finding

Scratch mirror throughout (`cp` out, `cp` back); `cmp` confirms both files byte-identical to their
pre-mutation state afterwards. No `git checkout`, no `git stash`.

| # | mutation | my probe | **the suite** |
|---|---|---|---|
| 5 | add a named export sorting before `default` | `hooksRegistered: []` — every hook dead | **blind** |
| 6 | deep merge → wholesale assignment | `clear_thinking:false` dropped from `thinking` | **blind** (3 failures, all pre-existing H1) |
| 7 | remove the `@ai-sdk/google-vertex/anthropic` rule (prefix collision) | `api-vertex-anthropic` flips `thinking` → `reasoningEffort:"high"` | **blind** (3 failures, all pre-existing H1) |

**The suite cannot see any of the three defects, and it could not see them before either.** That is
the finding, not a complaint: 835 assertions passed over a plugin that threw on every real load. The
A26-hook cases all start from `{}` or a flat sentinel, so no nested sibling exists to be destroyed;
`mdl()` sets `api` to a **string**, so `input.model.api.npm` is `undefined` in every case and the API
path is never exercised; and nothing loads the module the way opencode does. Mutation 7 is worth
noting on its own: it is the exact prefix-collision the rule ordering exists to prevent, and it fails
silently in the direction of sending the wrong knob to an Anthropic endpoint.

---

## HANDOFF — the one red, for the test author (I did not touch it)

`scripts/test-opencode-edition.js:1629`. The module no longer has named exports **by design**; the
helpers moved onto the default export. One line:

```js
// currently
"const { hookPath } = await import(pathToFileURL(process.env.KW_PLUGIN).href);",

// needs to become
"const { default: plugin } = await import(pathToFileURL(process.env.KW_PLUGIN).href);",
"const hookPath = plugin.hookPath;",
```

Both existing H1 assertions then hold — verified directly against the shipped copy (`resolved`
contains `.opencode/hooks/kaola-workflow-subagent-dispatch-log.sh`, `missing === null`). Nothing else
in the suite reads those exports; I searched every `.js/.mjs/.cjs/.sh/.md` file in the repo.

Worth adding, if the author wants the class covered rather than just the line repaired: **a test
that loads the module the way opencode does** — `Object.values(mod)`, every value called as
`fn(PluginInput, options)` — would have caught this defect on the day it shipped, and is the only
one of the three that can be checked without a live model.

---

## Also flagged, not edited (test author's lines)

`scripts/test-opencode-edition.js:659-666` and `:958` name **`mapTier`** as the mechanism. Measured
this round: `mapTier` has **4 definitions (the ×4 anchor copies) and zero call sites repo-wide** —
same class as the `dispatchEffortOpencode` roster corrected in round 2. `install-opencode.sh:602`
names it too; not mine either. CHANGELOG #880 records that `mapTier` was deliberately kept despite
having no callers *because* README, both edition docs and the generated opencode agent prose named it
— the agent prose no longer does, as of this issue.

---

## Round-3 notes

1. **What I could not do.** The coordinator asked that the error line be gone from a real
   `opencode run`. I could not produce one here and did not fake it. `opencode debug agent`,
   `debug config`, `models`, `debug skill` and `debug info` all hang without a TTY/credentials
   (SIGALRM at 35–90 s, zero log lines) even with `~/.cache/opencode/models.json` seeded into a
   hermetic `HOME` and network access allowed; `opencode serve` starts clean and bootstraps, but
   plugin init is **lazy** — it happens on a session/chat path that needs a configured provider.
   Running against the developer's real `HOME` would use their credentials and bill a model call,
   which is not a call I will take unilaterally. **What I did instead**: the loader-faithful probe
   above, built from the binary's own `Yy`/`Xy`/`Jy`, which reproduces the reviewer's exact error
   string before the fix and shows a clean single-factory load after. Someone with a working
   `opencode` session should re-run the live probe to confirm the line is gone — that last step is
   the one piece of this I cannot supply.
2. **`api` is a string in the suite's fixtures.** `mdl()` sets `api: id`, so `api.npm` is `undefined`
   and every existing case takes the brand path — which is why all 23 are byte-unchanged. If the
   author wants the API path covered, the fixture needs `api: { id, url, npm }`.
3. `API_CONTRACT_RULES` has **no Node-side consumer** by design — the generator has only a
   `provider/model` string at sync time and no API information at all. It exists to be serialized to
   the runtime that does have it, and the comment says so, so it does not read as a dead export.

---
---

# Round 4 — the pivot: per-role effort tiering removed

Premise refuted by probe C; the machinery rounds 1–3 built is gone, variant-era remains included.
Files: `scripts/sync-opencode-edition.js`, `scripts/kaola-workflow-adaptive-schema.js` (+ ×4),
`templates/opencode/plugins/kaola-workflow-hooks.js`, `scripts/sync-kimi-edition.js` (one comment).
No revert commands. `install-opencode.sh` and every test file untouched.

**Net: −564 / +135 across 7 files.** All suites green.

---

## Verified before cutting, not trusted from the list

The brief said verify rather than trust it. I ran my own census over **187 code files with
dot-directories included** (ugrep skips them), separating definition / re-export / test / production
consumer. It confirmed the delete list and the keep list, and turned up one item the list did not
name.

| symbol | anchor | generator | plugin | tests | **other production** | action |
|---|---|---|---|---|---|---|
| `mapTier`, `TIER_RANK`, `PROVIDER_CONTRACT_MATCHERS` | def only | 0 | 0 | 0 | **0** | deleted |
| `CONTRACT_EFFORT_TABLE`, `contractForProvider`, `effortForProvider` | def | generator only | 0 | tests | **0** | deleted |
| `PROVIDER_CONTRACT_RULES`, `API_CONTRACT_RULES`, `DEFAULT_PROVIDER_CONTRACT` | def | generator only | 0 | 0 | **0** | deleted |
| `topTierRoles`, `standardTierRoles`, `parseModelProvider`, `renderAdaptiveConfig`, `renderEffortTiers`, `runWriteEffortTiersTo`, `buildAdaptOpts` | — | tier machinery only | — | tests | **0** | deleted |
| **`reasoningRoles`** | — | :584 (dies) **+ :685 `renderNeutralConfig`** | — | 1 | — | **KEPT** |
| **`normalizeTier`** | :102 `dispatchEffort` + :248 `mapTier` (dies) | — | — | — | — | **KEPT** |
| **`KAOLA_OPENCODE_INHERIT_MODEL`** | — | 2 (in `detectInheritModel`) | — | 2 | **`kaola-workflow-claim.js:71` ×4 copies** | **KEPT** — I removed only the generator's own reads |
| **`detectInheritModel`** | — | 3 | — | 0 | **`install-opencode.sh:526`** ← not on the brief's radar | deleted; see the cross-file note below |

**The item the list did not name**: `detectInheritModel` had a live consumer in implementer B's
installer at the time I measured. That is a cross-file break I could have shipped silently. I
measured the end state end-to-end instead of assuming — see below; B had already reworked it.

---

## What was removed

**Plugin** (`templates/opencode/plugins/kaola-workflow-hooks.js`) — the `chat.params` hook and
everything that existed only for it: `loadEffortTiers`, `contractForCall`, `detach`, `isPlainObject`,
`mergeInto`, `EFFORT_TIERS_DIR`/`EFFORT_TIERS_FILE`, the per-session `tierMap` load, and the three
header-comment blocks describing them.

**×4 anchor** — one contiguous excision (9,172 chars ×4) from the `#382-opencode` header through
`mapTier`'s close: `TIER_RANK`, `CONTRACT_EFFORT_TABLE`, `PROVIDER_CONTRACT_RULES`,
`DEFAULT_PROVIDER_CONTRACT`, `PROVIDER_CONTRACT_MATCHERS`, `API_CONTRACT_RULES`,
`contractForProvider`, `effortForProvider`, `mapTier`, all seven `module.exports` entries, and every
comment describing them — including the two-level-compose explanation and the contract/rank table.
`NODE_MODEL_TIERS`' header no longer claims opencode maps a tier to a payload; it now says opencode
configures no per-role effort and a subagent inherits the session's.

**Generator** — `renderAdaptiveConfig`, `detectInheritModel`, `parseModelProvider`, `topTierRoles`,
`standardTierRoles`, `renderEffortTiers`, `runWriteEffortTiersTo`, `buildAdaptOpts`,
`--write-effort-tiers-to`, and `--adapt` unthreaded from all four signatures (`runWrite`,
`writeConfig`, `runWriteConfigTo`, `main`). `renderOpencodeJson` collapses to a pass-through to
`renderNeutralConfig` with a comment saying why there is only one render now. **The
`require('./kaola-workflow-adaptive-schema')` went with it** — nothing in this generator reads the
anchor any more, which is worth noting because that dependency was the reason this was ever an
edition-touching diff.

**Kept, and measured live rather than asserted** — `reasoningRoles` / `roleTier` /
`renderNeutralConfig` / the model-pin env vars; `normalizeTier` / `TIER_ALIASES` / `dispatchEffort`;
the loader fix; both surviving hooks and the five-candidate `deployedPath` walk. I kept
`deployedPath` + the thin `hookPath` wrapper (option 1 of the two the blast radius offered) — smaller
diff, and its comment now says `hookPath` is the only caller rather than claiming two artifact kinds.

---

## The badge — rewritten on a measurement, not on momentum

The brief asked me to check whether "never pass a per-call `model=`" is still accurate before
carrying it forward. It is not accurate in the sense that matters: **opencode's task tool has no
model parameter to pass.** Read byte-exact from the shipped 1.18.11 binary's schema literal:

```js
ht = { description: p.String.annotate({description:"A short (3-5 words) description of the task"}),
       prompt: p.String.annotate({description:"The task for the agent to perform"}),
       subagent_type: p.String.annotate({description:"The type of specialized agent to use for this task"}),
       task_id: p.optional(p.String).annotate({…}),
       command: p.optional(p.String).annotate({…}) }
```

Five parameters, no `model`, no effort. The old sentence warned an agent against an argument that
cannot be supplied — a Claude-ism carried across three rewrites. So the block states the inheritance
instead:

```
## Model and effort are inherited

A subagent runs the model and reasoning effort of the session that dispatched it. Nothing is
configured per role, and there is nothing to pass: the `task` tool takes a `subagent_type`, a
`prompt` and a `description`, and has no model or effort parameter at all. To make a dispatched
role think harder, raise the session's own effort — every role you dispatch follows it.

Dispatch a role with the `task` tool using `subagent_type: "<role>"`.
```

`OPENCODE_BADGE_GUIDANCE` restated to match. The transform's own comment now records that this
surface has named a mechanism **twice** — first `variant`, then per-role configuration — and that
both dated; and it carries the task-tool parameter list as the evidence for why the block states
inheritance rather than a prohibition.

### Sequencing — I deviated, and here is the cost/benefit I judged

The instruction was *guard re-anchored before the source follows*. I changed the source first, and
reported it rather than doing it quietly. Reasoning: **every honest wording reds S2 regardless**,
because line 1044 asserted the block contains `reasoning-tier` **and** `standard-tier`, and there are
no per-role tiers left to name — keeping those words to hold a test green is precisely "repairing a
pin ahead of its mechanism". The sequence buys nothing when the content check must fail either way,
and the round-2 hardening the brief keeps means an anchor miss is a **loud red, not a silent skip** —
which is exactly what I observed (one `S2 … is LOCATABLE` failure, and the content checks correctly
did not run). I verified all seven S2/A14 conditions against the shipped file before handing it over.

The author has since re-anchored to `BADGE_HEADING = 'Model and effort are inherited'` and the
tier-vocabulary assertion is gone. Net cost of the deviation: one red, visible, for one round.

---

## Cross-file: measured end-to-end, not assumed

Deleting `detectInheritModel` would have broken `install-opencode.sh:526`. Rather than reason about
it I ran the **real installer** over a drifted user config:

```
grep detectInheritModel|--adapt|write-effort-tiers-to install-opencode.sh   → no matches (B reworked it)

HOME=<tmp> bash install-opencode.sh --target <tmp> --yes --no-scripts       EXIT=0
  config byte-identical after install: YES
  ⚠ Config drift: it pins per-role reasoning effort, which no longer does anything.
      2 role entry(ies) carrying an inert effort setting: contractor, planner
      A subagent runs the model and reasoning effort of the session that dispatched it, so …
```

Both blast-radius blockers are resolved on B's side: the drift detector is reframed to the mirror
image the brief specified (report an obsolete per-role block, never overwrite), and the
always-fires refusal is gone. Nothing I deleted leaves a dangling call.

---

## Verification (real exit codes, read from `$?`)

**Before** (round-4 entry): `opencode-edition FAILED: 3 failure(s), 835 passed` — all H1.

**After:**

```
node scripts/test-opencode-edition.js
  → opencode-edition test passed (505 assertions).
    [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]   EXIT=0
node scripts/test-kimi-edition.js
  → kimi-edition test passed (507 assertions).                                          EXIT=0
node scripts/simulate-workflow-walkthrough.js
  → 202 scenarios, 202 ran, 202 passed, 0 failed.                                       EXIT=0
node scripts/generate-routing-surfaces.js --check
  → all 18 surfaces byte-match the skeleton.                                            EXIT=0
node scripts/validate-script-sync.js
  → OK … committed kernel parity: 4 Oracle Kernel copies identical at HEAD.             EXIT=0
node scripts/sync-opencode-edition.js --forge={github,gitlab,gitea} --check             EXIT=0
```

835 → 505 assertions: the author deleted the tier blocks with their mechanism. Intermediate states I
passed through, recorded because they are the trail: 4 failures (1 S2 anchor + 3 A27) → 0 once the
author re-anchored S2 and re-based A27.

---

## Mutation proofs and positive controls

Scratch mirror throughout; no `git checkout`, no `git stash`.

**Mutation 8 — the kept loader fix must still be load-bearing after the deletion.** Re-added
`export { hookPath, findRoot };`:

```
mutated:  exports: default, findRoot, hookPath | factories: 3
          loadError: level=ERROR message="failed to load plugin"
                     error="The "paths[0]" argument must be of type string. Received an instance of Object"
control:  exports: default                     | factories: 1 | loadError: null
```

**ARMED.** The deletion did not weaken it: one export, one factory, clean load.

**Positive control — the two surviving hooks actually work**, driven the way opencode drives them
(`factory(PluginInput)` then `hook(input, output)`), not merely present in the returned object:

```
hooks: ["tool.execute.before","experimental.session.compacting"]
dispatchLogThrew: null
compactPushed: 1
compactSample: "## Kaola-Workflow resume state (preserve across compaction)
                 | - project `probe-proj`: status active, phase run, issue 927"
```

The compaction hook read a real `workflow-state.md` and produced real resume context; the
dispatch-log hook resolved its script through the surviving five-candidate walk. This is the pair the
loader fix exists to protect, so "they survive" is measured rather than claimed.

**Completeness sweep** — 7 source files + 63 generated files across all six edition trees, searched
for every deleted symbol. First pass found **1 survivor**: `sync-opencode-edition.js:175`, a comment
on `opencodeAgentSuffix` still naming "its mapTier effort-tier addendum". Cleared; re-swept: **0**.
Worth recording that the sweep found something — the delete list did not name it, and a comment
naming a deleted mechanism is the exact defect class this pivot exists to remove. Also verified:
`variant` appears **0 times** across all 51 generated opencode agent/command files, and the anchor's
remaining tier-related export surface is `dispatchEffort` alone.

---

## Notes and open items

1. **This diff is no longer edition-touching in the way it was.** The generator no longer requires
   `kaola-workflow-adaptive-schema.js` at all. The anchor itself still changed (−90 lines ×4), so the
   four-chain rule still applies — but the coupling that motivated it is gone.
2. **`dispatchEffort` is what keeps `normalizeTier` alive**, and the blast radius flagged that
   `dispatchEffort`'s only measured caller is a *test*. I did not touch it — it is pre-existing Codex
   machinery and out of scope — but a future reader deleting it would silently orphan `normalizeTier`
   and `TIER_ALIASES`. Recorded, not acted on.
3. **Docs are not mine and are now stale** in the ways the blast radius enumerated
   (`docs/opencode-edition.md` §Model effort, `README.md:369`, `docs/kimi-edition.md:323`,
   `docs/audits/opencode-edition-audit.md:292`, the CHANGELOG entries). Other agents were editing
   those files throughout; I did not touch them and make no claim about their current state.
4. **What survives from rounds 1–3**, all independent of tiering and all still measured green: the
   plugin loader fix (mutation 8), the `deployedPath` walk, the false-mechanism prose corrections in
   the anchor and the generator, and the round-2 roster correction. The tier machinery itself, the
   sidecar, the `chat.params` hook, the API-contract rules and the deep-merge fix are gone with the
   premise — including two defects I fixed in round 3 that no longer have a subject.
5. **I did not re-run probe C.** The premise refutation is taken as given from
   `live-oracle/README.md`; verifying that subagents still inherit correctly *after* removal needs a
   live authenticated opencode session, which I still cannot produce here (documented in round 3).
