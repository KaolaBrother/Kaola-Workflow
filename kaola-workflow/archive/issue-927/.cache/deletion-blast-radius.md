# Investigation: deletion blast radius for #927's per-role effort-tier machinery

Read-only measurement. No tracked file was modified (verified: `git status --porcelain` returns the
same 16 modified files before and after, no additions).

---

## Setup

- **Worktree**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927`
- **Branch / base commit**: `workflow/issue-927` @ `c39381748ad80cc09afbc42ac07ff4f65ff18012`
- **Working tree**: the #927 work is **UNCOMMITTED** — 16 modified files, +2229 / −364.
  "Deletion" therefore means reverting parts of a live diff, not removing committed code.
- **Search tooling**: `rg` is **not installed** on this box. `grep` is ugrep 7.5.0, which **skips
  dot-directories** — measured directly: `grep -rn "hookPath" . --include="*.js"` returns **0** hits
  under `./.` paths. All censuses below therefore ran a two-pass helper (non-dot tree, then
  `.opencode .opencode-gitea .opencode-gitlab .kimi .kimi-gitea .kimi-gitlab .agents .claude`
  named explicitly with `--hidden`). Positive control: the explicit pass finds
  `.opencode/plugins/kaola-workflow-hooks.js:84`.

### Commands run (verbatim, load-bearing ones)

```
node scripts/sync-opencode-edition.js --write-config-to <scratch>/neutral.json
KAOLA_OPENCODE_INHERIT_MODEL=zhipuai-coding-plan/glm-5.2 \
  node scripts/sync-opencode-edition.js --write-config-to <scratch>/adaptive.json --adapt
sed -n '512,594p' install-opencode.sh > <scratch>/drift.js      # the drift detector, extracted verbatim
KW_MODE=drift KW_CFG=<stale> ... KAOLA_OPENCODE_INHERIT_MODEL=zhipuai-coding-plan/glm-5.2 node <scratch>/drift.js
env -u KAOLA_OPENCODE_INHERIT_MODEL HOME=<scratch>/fakehome KW_MODE=drift ... node <scratch>/drift.js
HOME=<scratch> KAOLA_OPENCODE_INHERIT_MODEL=openai/gpt-5 bash install-opencode.sh --target <scratch> --yes --no-scripts
env -u KAOLA_OPENCODE_INHERIT_MODEL HOME=<scratch> bash install-opencode.sh --target <scratch> --yes --no-scripts
env -u KAOLA_OPENCODE_INHERIT_MODEL HOME=<scratch> bash install-opencode.sh --target <scratch> --yes --no-scripts --adopt-config
node scripts/test-opencode-edition.js
node --input-type=module -e '<import the deployed plugin, enumerate Object.keys(mod)>'
```

---

## Observations

| # | Measurement | Command | Result | Exit |
|---|---|---|---|---|
| 1 | Neutral render emits an `agent` block? | `--write-config-to` (no `--adapt`) | **No** — only commented-out `// "agent": {` example lines | 0 |
| 2 | Adaptive render emits an `agent` block? | `--write-config-to --adapt` w/ inherit model | **Yes** — 14 roles, each `{ "options": … }` | 0 |
| 3 | Drift detector vs stale config, adaptive baseline | extracted `drift.js`, inherit model set | Full report: 1 extra role, 13 missing | 0 |
| 4 | Drift detector vs stale config, **neutral** baseline | extracted `drift.js`, `env -u` + empty HOME | **Silence — no output at all** | 0 |
| 5 | Control for #4: was the fixture actually drifted? | `KW_MODE=roles` on same fixture | **2 roles** (parses fine) — silence is the empty-**baseline** path, not a parse failure | 0 |
| 6 | Real installer, drifted config, inherit model set | `install-opencode.sh --target … --yes --no-scripts` | `⚠ Config drift:` + names `contractor, issue-scout` + 13 missing | 0 |
| 7 | Real installer, drifted config, **no** inherit model | same, `env -u KAOLA_OPENCODE_INHERIT_MODEL` | **No drift line printed** | 0 |
| 8 | Control for #7: config on disk | `cat` + `KW_MODE=roles` | 3 roles incl. 2 retired — genuinely drifted | 0 |
| 9 | `--adopt-config` under neutral-only render | real installer `--adopt-config`, no inherit model | **`Install error: … Refusing to replace them with none.`** config left byte-identical | **1** |
| 10 | Suite baseline | `node scripts/test-opencode-edition.js` | **3 failures, 835 passed** — all 3 in `H1` | **1** |
| 11 | Plugin module export surface | `node --input-type=module` import of deployed plugin | `MODULE KEYS: ["default"]`; `named hookPath: undefined`; `default.hookPath: function` | 0 |
| 12 | ×4 anchor byte-identity | `shasum -a 256` on the four copies | all `994cfd38…2720a4` — identical | 0 |

> Note on #9: the exit code was first read through `… | tail -8`, which reported `EXIT=0`. Re-run
> without the pipe it is **exit 1**. Recorded because the piped reading is wrong.

---

## Reproduction

**Reproduces.** The premise refutation in `live-oracle/README.md` (probe C) is taken as given; what
this investigation reproduced is the *consequence structure* of removing the machinery. Two findings
below (#4/#7 and #9) are new failures that removal would introduce, both measured end-to-end through
the real installer, each with a positive control.

---

## 1. The opencode generator — `scripts/sync-opencode-edition.js`

**Crucial scoping fact, measured from `git diff`:** most of what reads as "the tier system"
**pre-existed at `c3938174`**. #927 did *not* create `renderAdaptiveConfig`, `detectInheritModel`,
`parseModelProvider`, `topTierRoles`, `standardTierRoles`, `buildAdaptOpts` or `--adapt`. It
**flipped `renderAdaptiveConfig` from emitting `agent.<role>.variant` to `agent.<role>.options`** and
**added** the sidecar (`renderEffortTiers`, `runWriteEffortTiersTo`, `--write-effort-tiers-to`).

This forces a scope decision that is **not mine to make** — see *Open question A*.

| symbol | line(s) | pre-existing? | consumers (measured) | verdict |
|---|---|---|---|---|
| `renderAdaptiveConfig` | 632–677 | yes (body rewritten) | `renderOpencodeJson`:628; re-export :1126 | **wholly dead** once per-role tiers go — it does nothing else. Its entire body builds the `agent` block + its explanatory comment header. |
| `renderOpencodeJson` branch | 620–630 | yes | `writeConfig`:856, `runWriteConfigTo`:977, `install-opencode.sh`:568 | the **`if (parsed && profile) return renderAdaptiveConfig(...)` branch (628) dies**; the function itself survives as a pass-through to `renderNeutralConfig`. Consider collapsing. |
| `detectInheritModel` | 602–618 | yes | `buildAdaptOpts`:843; `install-opencode.sh`:567; re-export :1136 | **dies** with the adaptive path (both call sites are adaptive-only). |
| `parseModelProvider` | 593–598 | yes | `renderOpencodeJson`:626 only; re-export :1136 | **dies** — single call site is the branch above. |
| `topTierRoles` | 583–585 | yes | `standardTierRoles`:588, `renderAdaptiveConfig`:633, `renderEffortTiers`:758, `runWriteEffortTiersTo`:786; tests | **dies** — it is a one-line `return reasoningRoles()`; every caller is tier machinery. |
| `standardTierRoles` | 587–590 | yes | `renderAdaptiveConfig`:634, `renderEffortTiers`:759, `runWriteEffortTiersTo`:786; tests | **dies** — all callers are tier machinery. |
| `renderEffortTiers` | 756–779 | **NEW (#927)** | `runWriteEffortTiersTo`:783; re-export :1127 | **dies**. |
| `runWriteEffortTiersTo` | 782–788 | **NEW (#927)** | `main()`:1117; re-export :1127 | **dies**. |
| `--write-effort-tiers-to` | 1085–1086 (usage), 1114–1118 (main) | **NEW (#927)** | `install-opencode.sh`:305 | **dies**. |
| `--adapt` mode | 1087–1088 (usage), 1095/1105 (main), `buildAdaptOpts` 841–848, `writeConfig(force, adapt)` 850–860, `runWriteConfigTo(target, adapt)` 975–980, `runWrite(...)` 958 | yes | `install-opencode.sh`:623 | **dies** if the adaptive path goes. Note the `adapt` parameter threads through **four** function signatures. |
| **`reasoningRoles`** | 556–565 | yes | **`renderNeutralConfig`:685** ← *the live one*, plus `topTierRoles`:584, test:647 | **KEEPS.** Confirmed: it has a consumer beyond tiering — the neutral config's reasoning-tier model-pin scaffold. |
| `roleTier` | 173–175 | yes | `reasoningRoles`:560 | **KEEPS** (transitively, via `reasoningRoles`). |
| `renderNeutralConfig` | 679–738 | yes | `renderOpencodeJson`:629 | **KEEPS** — becomes the only render. |
| `ENV_STANDARD_MODEL` / `ENV_REASONING_MODEL` | 123–124 | yes | `renderNeutralConfig`:683–684 | **KEEPS** — the opt-in model-pin path survives. |

**Prose inside the generator that becomes false:**

- Header block **lines 26–41** — the whole "Two reasoning-effort tiers, on ONE inherited model … Two
  layers deliver it … effort-tier SIDECAR" paragraph.
- **lines 49–51** (`--write-effort-tiers-to` usage), **52–57** (`--adapt` usage), **60**
  (`KAOLA_OPENCODE_INHERIT_MODEL` doc).
- **line 33** — `CONTRACT_EFFORT_TABLE names the payload per API CONTRACT`.
- **`OPENCODE_BADGE_BLOCK` lines 276–286** — the generated agent/command badge block. Ships as
  `## Effort is configured, not passed` and asserts *"Each role's reasoning effort is configured
  centrally and applies to every call that role makes: reasoning-tier roles run at the top effort …
  standard-tier roles one step below."* **That sentence is false after removal.** The behavioural
  instruction it also carries — *dispatch by `subagent_type`, never pass a per-call `model=`* — is
  still true and still needed.
  Measured reach: this block lands in exactly **3 generated files** —
  `.opencode/command/kaola-workflow-finalize.md`, `.opencode-gitlab/…`, `.opencode-gitea/…`.
  Canonical carrier is the single file `commands/kaola-workflow-finalize.md`.
- **`OPENCODE_BADGE_GUIDANCE` lines 290–293** — same false claim in one-sentence prose form.
- **lines 260–271** — the transform's explanatory comment.
- **line 203** — `opencodeAgentSuffix`'s comment names "its mapTier effort-tier addendum". The
  function already returns `''` (inert); comment-only.
- **lines 740–755** — the `renderEffortTiers` doc comment.
- **lines 838–840** — `buildAdaptOpts` comment.
- **lines 971–974** — `runWriteConfigTo` comment.

---

## 2. The ×4 byte-identical anchor — `kaola-workflow-adaptive-schema.js`

All four copies are byte-identical right now (`994cfd38…2720a4`), so any edit must land in all four
in one commit.

Census method per symbol: definition / re-export in `module.exports` / test assertion / **genuine
production consumer** — only the last keeps something alive.

| symbol | def | re-export | test-only | **production consumer** | verdict |
|---|---|---|---|---|---|
| `mapTier` | :247 | :1761 | comments only in `test-opencode-edition.js` :502, :664, :958, :1041 | **NONE — zero call sites repo-wide** | **VERIFIED independently. Already dead before #927.** `CHANGELOG.md:1100` records it was *deliberately kept* in #880 only because README + both edition docs + generated agent prose named it. Those references are being removed anyway → the last reason to keep it goes with them. |
| `TIER_RANK` | :141 | not exported | — | `mapTier`:248 **only** | **dies with `mapTier`.** |
| `CONTRACT_EFFORT_TABLE` | :148 | :1758 (**added by #927**) | `test-opencode-edition.js` :660, :777, :2224, :2229 | `effortForProvider`:241 (internal); `sync-opencode-edition.js` :763–764 (`renderEffortTiers`) | **dies** — after `renderEffortTiers` and `effortForProvider` go, nothing reads it. The `module.exports` entry is #927-added and must go regardless. |
| `effortForProvider` | :238 | :1760 | `test-opencode-edition.js` :722–752, :2227 | `mapTier`:250; **`sync-opencode-edition.js`:627** | **dies** — :627 is the `renderOpencodeJson` adaptive branch; `mapTier` is itself dead. |
| `contractForProvider` | :229 | :1750 | `test-opencode-edition.js` :727–749, :804 | `effortForProvider`:241; **`sync-opencode-edition.js`:637** | **dies** — :637 is inside `renderAdaptiveConfig`. |
| `PROVIDER_CONTRACT_RULES` | :177 (**NEW**) | :1755 (**NEW**) | — | `PROVIDER_CONTRACT_MATCHERS`:223; `sync-opencode-edition.js`:774 | **dies** (added by #927 purely to serialize into the sidecar). |
| `PROVIDER_CONTRACT_MATCHERS` | :223 (**NEW**) | not exported | — | `contractForProvider`:231 | **dies with `contractForProvider`.** If `contractForProvider` were kept, this is the internal refactor that replaced the inline regex chain. |
| `DEFAULT_PROVIDER_CONTRACT` | :186 (**NEW**) | :1756 (**NEW**) | — | `contractForProvider`:232; `sync-opencode-edition.js`:775 | **dies.** |
| `API_CONTRACT_RULES` | :213 (**NEW**) | :1757 (**NEW**) | — | **`sync-opencode-edition.js`:771 only** | **dies.** Its own comment (:210–212) already says *"No function here consumes this list"* — it exists solely to be serialized into the sidecar. |
| **`normalizeTier`** | :62 | not exported | — | **`dispatchEffort`:102** and `mapTier`:248 | **KEEPS** — survives via `dispatchEffort`, which is the Codex tier-metadata seam, unrelated to opencode. |
| `TIER_ALIASES` | :59 | not exported | — | `normalizeTier` | **KEEPS.** |

**Cross-edition consumption — measured answer: NONE.** The only production consumer of
`contractForProvider` / `effortForProvider` / `CONTRACT_EFFORT_TABLE` / the rule lists anywhere in
the repo is `scripts/sync-opencode-edition.js`. The claude, codex, gitlab and gitea editions consume
**none** of them. The three `plugins/kaola-workflow{,-gitea,-gitlab}/scripts/` copies contain only
the byte-identical definitions and re-exports — no other script under `plugins/` calls them.

⚠ **Comment cleanup that must ride along** — the ×4 header comments at
**:44–47** (NODE_MODEL_TIERS: *"opencode maps them to the provider's effort payload for that rank"*),
**:53–58** (the normalizeTier seam note), **:118–137** (the whole two-level compose explanation +
the contract/rank table), **:143–147** (the `CONTRACT_EFFORT_TABLE` doc) and **:226–228 / :234–236 /
:244–246** all describe machinery that is going. Leaving them is the exact "dead configuration that
reads as live" defect class this issue exists for.

⚠ **`dispatchEffort` note (out of scope, flagged not recommended):** its only measured caller is
`scripts/test-agent-model-resolver.js:79` — a **test**. It has no production call site. It is
pre-existing Codex machinery, **not** part of this deletion, and I am **not** proposing touching it.
Recording it because it is what keeps `normalizeTier` alive, and a future reader deleting
`dispatchEffort` would silently orphan `normalizeTier` too.

---

## 3. The plugin — `templates/opencode/plugins/kaola-workflow-hooks.js`

### Dies with `chat.params`

| element | lines | note |
|---|---|---|
| `EFFORT_TIERS_DIR` / `EFFORT_TIERS_FILE` | 40–41 | sidecar path constants |
| `loadEffortTiers` | 88–134 | sidecar load + `knobs` derivation |
| `contractForCall` | 136–158 | per-call contract resolution |
| `detach` | 160–169 | **used only by `mergeInto`:184** → dies |
| `isPlainObject` | 171–173 | used by `mergeInto`:183 **and** `chat.params`:313 → dies |
| `mergeInto` | 175–187 | recursive option merge |
| `const tierMap = loadEffortTiers(root)` | 260 | per-session load |
| `"chat.params"` hook + its comment | 291–325 | the hook itself |
| header comment line 13 | 13 | `chat.params → apply the role's reasoning-effort tier` |
| header comment lines 17–19 | 17–19 | the "chat.params must not throw AT ALL" rationale |
| comment lines 36–39 | 36–39 | sidecar description |

### Must survive

- **`tool.execute.before`** (262–280) → `runHook`(189–202) → **`hookPath`**(84–86) →
  **`deployedPath`**(66–82) → `findRoot`(45–54). The dispatch-log hook needs the whole walk.
- **`experimental.session.compacting`** (282–289) → `buildResumeContext` (207–239).
- **The loader fix — lines 241–255 (the comment) + 334–335 (`KaolaWorkflowHooks.hookPath = hookPath;`
  / `.findRoot = findRoot;`).** Measured armed: `Object.keys(mod)` on the deployed plugin returns
  **exactly `["default"]`**, `mod.hookPath` is `undefined`, `mod.default.hookPath` is a `function`.
  At base `c3938174` the file carried `export { hookPath, findRoot };` (base line 66) — the bug.
  **This fixes a live defect unrelated to tiering and must not be reverted.**

### The shared helper, precisely

`deployedPath` is a **strict generalization** of base `hookPath`: base (`c3938174` lines 52–63) had
the identical 5 candidates with `"hooks"` and `script` hard-coded; the run parameterized them to
`dir` / `name` so the sidecar could reuse the walk, and added a per-candidate `try/catch`.

Two acceptable shapes post-deletion, **implementer's choice**:
1. **Keep `deployedPath` + the thin `hookPath` wrapper** (smaller diff; one generic walk with a
   single caller).
2. **Collapse back to a single `hookPath` with `"hooks"` inlined** (closer to base; removes an
   abstraction with one consumer).

Either preserves all five candidates. **Do not delete the walk** — the global-install layout
(`SELF_DIR/../hooks`, `OPENCODE_CONFIG_DIR/hooks`) depends on it and `H1` pins it.

---

## 4. The installer — `install-opencode.sh`

### Tier-only → dies

| element | lines | note |
|---|---|---|
| `EFFORT_TIERS_DIR_NAME` / `EFFORT_TIERS_NAME` | 190–191 | |
| sidecar deploy in `copy_tree` | 285–315 (constants 301–302, generate 303–313) | incl. the `--write-effort-tiers-to` call at **305** and the warn-and-continue at 312–313 |
| sidecar uninstall | 416–419 | `rm -f …/effort-tiers.json` + `rmdir` |
| `--adapt` invocation | **623** | `--write-config-to "$rendered" --adapt` |
| **tier-protection refusal** | **627–635** | see the blocker below |
| tier success/failure messages | 652–662 | both branches |
| header prose | 24–26, 30–31 (partly), 33–36 | |
| `KAOLA_OPENCODE_INHERIT_MODEL` resolution block | 671–688 | incl. `export` at 686 |
| comment 608–620 | 608–620 | `seed_config`'s adaptive explanation |

### Owner is keeping → must survive

- **drift detection**: `config_probe` (504–596), `config_backup_path` (490–494)
- **`--adopt-config`**: flag 77/83/134, usage 97–98, `seed_config` 601–606, 636–651
- **the backup**: 640–648 (`cp` before `mv`, fail-loud on backup failure)

### ⚠ BLOCKER 1 — the tier-protection refusal breaks `--adopt-config` if left in place

`seed_config` lines **627–635**:

```bash
if [[ "$landing" -eq 0 && "$existing_roles" -gt 0 ]]; then
  echo "Install error: no inherited model could be detected, so the generated config would carry" >&2
  echo "  NO effort tiers, while $cfg carries $existing_roles. Refusing to replace them with none." >&2
```

Post-deletion `landing` (`config_probe roles "$rendered"`) is **always 0** — measurement #1 proves the
neutral render emits no `agent` block. So this refuses for **any** user whose existing config carries
an agent block. **Measured (#9)**: real installer, `--adopt-config`, no inherit model, config with one
role → **exit 1**, `Refusing to replace them with none.`, config unchanged. This block must be
**deleted with the tiers**, or `--adopt-config` is permanently broken for exactly the users it exists
to serve.

### ⚠ BLOCKER 2 (the open question you asked me to answer, not assume) — the drift detector loses its subject

**Answer: nothing is left for it to compare, and the feature has no subject.**

The detector's baseline is built at `install-opencode.sh` **564–575**:

```js
const sync = require(process.env.KW_DRIFT_SYNC);
const inheritModel = sync.detectInheritModel();
generated = parse(sync.renderOpencodeJson(inheritModel ? { inheritModel } : {}));
...
const emitted = roleSet(generated);
if (emitted.length === 0) process.exit(0);      // ← line 575
```

Its own comment at **571–573** already states the dependency outright:

> *"The baseline has to be the ADAPTIVE render. With no inherited model detected the generator renders
> the NEUTRAL template, which carries no agent block at all — every role in the user's file would then
> read as 'extra'. An empty baseline is no baseline: say nothing."*

**Measured, two ways, each with a positive control:**

- Extracted detector, stale fixture (2 roles): adaptive baseline → full report (#3); neutral baseline
  → **complete silence** (#4). Control (#5): the fixture parses and reports 2 roles, so the silence is
  the `emitted.length === 0` early-exit, not a parse failure.
- **Real installer**, drifted config (3 roles, 2 retired): with inherit model → `⚠ Config drift:` naming
  `contractor, issue-scout` + 13 missing (#6); without → **no drift line at all** (#7). Control (#8):
  the config on disk was genuinely drifted.

**What the remaining/neutral render actually produces** (measured, verbatim): `$schema`,
`default_agent: "build"`, an explanatory comment block, `// "model": "<inherits…>"` commented out, and
a **commented-out** `// "agent": { … }` scaffold listing the five reasoning roles. `roleSet()` reads
**parsed JSON**, and comments are stripped — so it sees **zero** roles.

**Consequence:** drift detection and `--adopt-config` are features the owner is keeping, but their
*subject* — a role set in the generated config — is produced **only** by `renderAdaptiveConfig`.
Removing the tier machinery removes the thing they compare against. This is a genuine design conflict
and **the single most important item in this report.**

Options exist (compare against the canonical role roster rather than the rendered config; compare only
when the user's file has an agent block; drop drift detection). **Choosing among them is not mine** —
it is a value call about what "drift" should mean once the workflow no longer ships a role set. Escalate
to the owner.

---

## 5. The tests — `scripts/test-opencode-edition.js` (2799 lines)

**Baseline (#10): 3 failures, 835 passed, exit 1.** The suite is **already red before any deletion** —
see the H1 finding below.

*Per the custody rule I list what falls out; I do not propose rewriting any assertion to keep it
passing.*

### Dies entirely with the mechanism

| block | lines | why |
|---|---|---|
| **A12** | 658–681 | `topTierRoles()` / `standardTierRoles()` pins. (682–713 are the `stableJson`/`deepHasKey` helpers + a prior deletion note; `stableJson` and `deepHasKey` are used **only** by A12-options → die with it.) |
| **S1-contract** | 715–752 | every assertion calls `effortForProvider` / `contractForProvider`. |
| 753–760 | 754–760 | the prior-deletion note about `variant` assertions. |
| **A12-options** | 762–885 | incl. `ADAPTIVE_CONTRACT_CASES` (782–795), the per-contract loop (796–862) and the subagent-criterion sub-block (864–885). Every leg calls `renderOpencodeJson({inheritModel})`. |
| **A26 (Layer 2)** | 2041–2383 | the whole `chat.params` block: `HOOK_HARNESS` (2065–2090), `driveHook` (2095–2110), `A26-sidecar` (2201–2236), `A26-hook` (2243–2325), `A26-degraded` (2362–2374). **NB:** `A26 (#646)`/`A26 (#789)` at **1169/1171** are a *label collision* — they are issue-scout placeholder checks inside A22 and are **unrelated**; they KEEP. |

### Dies because its subject is gone (see Blocker 2)

| block | lines | why |
|---|---|---|
| **A27** | 2385–2517 | Sets `KAOLA_OPENCODE_INHERIT_MODEL: INHERIT` at **2422** for *every* leg and compares against `sync.renderOpencodeJson({ inheritModel: INHERIT })` at **2490** and **2504**. With the adaptive render gone, the drift report at 2448–2457 cannot be produced — **measured (#7)**. A27 tests a KEPT feature, but only the deleted machinery gives it a subject. `A27-neg` (2500–2516) would pass **vacuously**. |
| **A28** | 2519–2792 | Same `INHERIT` env at **2567**. Tests the backup (a KEPT feature) but drives it through `--adopt-config` on an adaptive render. Needs re-basing on whatever replaces the baseline. |

### Partial — only some assertions die

| block | lines | dies | keeps |
|---|---|---|---|
| **S2** | 956–1111 | **(a2)** the block-scoped mechanism-word check **1046–1054**; **(e)** the body-wide sweep **1087–1110** incl. `S2 (#927)` at 1095–1107; `MECHANISM_WORD` (988) if unused after | (a) opus/sonnet leak **1042–1043**; (b) opus-tier/sonnet-tier **1059–1060**; (d) `S2 (#609)` B2 sweep **1066–1085**; the badge-presence pins **1011–1038** |
| | | ⚠ **`BADGE_HEADING = 'Effort is configured, not passed'` (981)** is a verbatim literal locating the block. Its own comment (975–980) warns that a rename without a matching change here leaves every content check ranging over `null` — **vacuous, can never go red**. If the badge block is reworded, **981 must move in the same change.** | |
| | | ⚠ **line 1044** asserts the block contains `/reasoning-tier/` **and** `/standard-tier/`. If the reworded block stops naming tiers, **this fails**. Flagging, not resolving. | |
| **D0** | 39–108 | **nothing** | **KEEPS ENTIRELY.** D0 is *generated-tree* drift (`sync --check` per forge), not installer *config* drift. It sits outside every diff hunk (hunks start at 683) — unchanged by #927 and independent of tiering. The name collision with the installer's drift feature is the only connection. |
| **A14** | 381–400 | possibly — model-prose consistency, reads the badge prose | verify against the reworded block |
| **A22** | 1113–1191 | nothing tier-specific | KEEPS |

### ⚠ BLOCKER 3 — H1 is red now, for a reason unrelated to tiering

`H1` (1616–1651) is the **cause of all 3 baseline failures**. Line **1629**:

```js
"const { hookPath } = await import(pathToFileURL(process.env.KW_PLUGIN).href);",
```

is a **named** import. The loader fix removed the named exports. Measured (#11): the module exports
exactly `["default"]`; `mod.hookPath` is `undefined`. The plugin's own comment (332–333) documents
the replacement pattern, and I verified it works:

```
{ "resolved": "…/.opencode/hooks/kaola-workflow-subagent-dispatch-log.sh", "missing": null }   exit 0
```

— exactly what H1 asserts. **H1's mechanism (the 5-candidate walk) survives**, so this is a legitimate
repair of the access path, not a pin rewritten against absent machinery. It must be fixed regardless
of the deletion, and by test custody it is **`tdd-guide`'s** artifact, not the implementer's.

---

## 6. Docs and prose that become false

| file | lines | content |
|---|---|---|
| **`docs/opencode-edition.md`** | **88–293** (whole `## Model effort — two tiers on one inherited model` section, up to `## Path selection` at 294) | Sub-sections: `### Tier membership` (121–128), `### Default install: adaptive (--adapt)` (129–170), `### Switching models` (171–188), `### Why not variant` (189–202), `### Computer-wide activation` (203–274, incl. the merge recipe at 232–255), `### Adaptive effort selection in the workflow` (275–282). **`### Opt-out: pin tiers to different models` (283–293) describes `renderNeutralConfig` and SURVIVES.** |
| | 114 | `CONTRACT_EFFORT_TABLE` + `contractForProvider` pointer |
| | 177 | `effort-tiers.json` sidecar |
| | 367 | `--no-scripts` / sidecar note |
| | **426–427** | **deploy-layout table** — a whole column for `…/kaola-workflow/effort-tiers.json` (project + global rows) |
| | 438 | "The **effort-tier sidecar** is generated at install time…" |
| | 456 | uninstall list naming the sidecar |
| | 469 | "the seed adapts the two effort tiers to your **inherited** model" |
| | 485 | `--write-effort-tiers-to PATH` in the command list |
| | 508 | verification list naming `S1-contract` / `A12-options` |
| | 397–418 | `### Config drift and --adopt-config` — **KEEPS**, but re-check against Blocker 2 |
| **`README.md`** | **369** | The `install-opencode.sh` paragraph. #927 rewrote it; it now claims *"the two tiers run at different reasoning effort on one inherited model … re-resolved against the model actually in use on every call"* — **false after removal**. The `--adopt-config` half of the same paragraph is **true and keeps**. Line **366** (`--adopt-config` in the code fence) keeps. |
| **`docs/kimi-edition.md`** | **323** | comparison-table cell: *"plus a generated effort-tier sidecar beside the plugin"* |
| **`docs/audits/opencode-edition-audit.md`** | **292** | *"It emits `agent.<role>.options` — the effort payload"* |
| **`docs/decisions/D-610-01.md`** | 10, 27, 42 | names `mapTier` and the opencode-edition "Model effort" section. **ADR — historical record.** Amend or annotate rather than silently rewrite; owner's call. |
| **`docs/investigations/2026-08-03-opencode-inherited-effort-tiers-design.md`** | 13 hits | The design doc for the machinery being removed. **Historical record of the investigation** — I'd expect it to stay with a superseded/refuted note, not be deleted. Owner's call. |
| **`CHANGELOG.md`** | `[Unreleased]` | #927 added 4 entries: 2 under `### Added` (`--adopt-config`; the `effort-tiers.json` deploy) and 2 under `### Fixed` (*"opencode subagent effort tiers now actually apply"*; *"Switching your opencode model no longer needs a config regenerate"*). **Both `### Fixed` entries and the `effort-tiers.json` `### Added` entry describe machinery that will not ship — remove.** The `--adopt-config` entry **keeps**. |
| **`scripts/sync-kimi-edition.js`** | **401–406** | comment only, referencing *"where opencode substitutes its own effort block"*. #927 already touched it. Trivial; update if the block is renamed. |
| **`docs/api.md`** | 1472 | **false positive** — generic prose about reasoning-effort escalation in a role contract. **Unrelated. Keep.** |
| **`templates/routing/next.skeleton.md`** | 2, 6–12 | **false positive** — Codex `reasoning_effort`/`gpt-5.6-sol` routing. **Unrelated. Keep.** |

---

## 7. Things left dangling

| # | item | location | risk |
|---|---|---|---|
| **D1** | **`KAOLA_OPENCODE_INHERIT_MODEL` has a consumer OUTSIDE the tier machinery** | `scripts/kaola-workflow-claim.js:71` + the 3 `plugins/…` copies — `resolveRuntime()` infers `runtime: 'opencode'` from it | **HIGH.** 4 live call sites (`claim.js` 821, 1250, 1621, 1809). If the var is retired, the comment at **:63** and the condition at **:71** point at a knob nothing sets. `KAOLA_OPENCODE_STANDARD_MODEL` (the other half of the same `||`) survives, so detection still works — but the reference rots. **Any edit hits 4 byte-identical copies.** |
| **D2** | the tier-protection refusal | `install-opencode.sh:627–635` | **BLOCKER 1** — permanently breaks `--adopt-config`. Measured exit 1. |
| **D3** | drift detector's empty baseline | `install-opencode.sh:571–575` | **BLOCKER 2** — silent no-op. Measured. |
| **D4** | `BADGE_HEADING` literal | `test-opencode-edition.js:981` | vacuous-guard risk if the block is reworded without moving it. Its own comment says so. |
| **D5** | `mapTier` + `TIER_RANK` | anchor :247, :141 (×4) | zero consumers already; the doc references that kept them alive are being deleted. Leaving them = dead code that reads as the live tier mechanism. |
| **D6** | `CONTRACT_EFFORT_TABLE` in `module.exports` | anchor :1758 (×4) | #927-added purely for the sidecar. |
| **D7** | anchor header comments | :44–47, :53–58, :118–137, :143–147, :226–228, :234–246 (×4) | describe removed machinery; the "dead config that reads as live" class. |
| **D8** | `opencodeAgentSuffix` comment | `sync-opencode-edition.js:203` | names "its mapTier effort-tier addendum"; function already returns `''`. |
| **D9** | `--adapt` threaded through 4 signatures | `sync-opencode-edition.js` 850, 958, 975, 1095/1105 | a half-removal leaves an ignored parameter. |
| **D10** | `.gitignore` | `.opencode/`, `.opencode-*/` (lines 5, 9) | already covers the sidecar's location — **no change needed**, and no `effort-tiers.json` is tracked. Verified: `find` returns none in-repo. |
| **D11** | deploy-layout table column | `docs/opencode-edition.md:426–427` | a whole table column becomes empty. |
| **D12** | generated trees on disk | `.opencode/`, `.opencode-gitlab/`, `.opencode-gitea/` | carry the current badge block in `command/kaola-workflow-finalize.md`; must be regenerated (`sync --write --forge=…` ×3) or **D0 exits 1**. |
| **D13** | routing-surface registry | `templates/routing/` | **clean** — no effort/sidecar entry. `generate-routing-surfaces.js --check` unaffected. |
| **D14** | installer support-script manifest | `install-opencode.sh` | the sidecar is **not** in the support-script manifest; it is written directly in `copy_tree` (301–309) and removed directly in uninstall (416–419). No manifest entry to orphan. |

---

## Inferences (labelled; not measurements)

1. **`renderAdaptiveConfig` is wholly dead once per-role tiers go** — confidence **high**. Its whole
   body builds the `agent` block; its only caller is the branch at :628. *Refuted by*: a decision to
   keep an adaptive path that emits something other than per-role effort.
2. **Reverting to the pre-existing `variant` form would reinstate a known-inert mechanism** —
   confidence **high**. `live-oracle/README.md` records ~80 subagent sessions where no `variant` ever
   resolved above `default`, and `docs/opencode-edition.md:189–202` explains why (`variant` needs the
   agent to pin a model; this generator pins none). That is exactly the "dead configuration" defect
   class. *Refuted by*: a measurement showing `variant` applying to a model-less agent.
3. **Drift detection cannot survive unchanged** — confidence **high**, measured twice end-to-end
   (#4/#7) with controls (#5/#8).
4. **A27 will fail, not merely weaken** — confidence **high**; assertions 2448–2457 require role names
   in the output, and #7 shows none are printed. *Refuted by*: re-basing the baseline on something
   other than the rendered config.
5. **H1 is fixable without violating the custody rule** — confidence **high**; the mechanism survives
   (#11 + the working default-export probe), only the access path changed.
6. **`normalizeTier` survives; `TIER_RANK` does not** — confidence **high**, from the call graph.

---

## Open — the calls that are NOT mine

**A. Scope of "the machinery" — the decision that changes everything below it.** The task frames the
tier system as "built by #927", but `git diff` shows `renderAdaptiveConfig`, `--adapt`,
`detectInheritModel`, `parseModelProvider`, `topTierRoles`, `standardTierRoles` **pre-existed at
`c3938174`**; #927 flipped `variant`→`options` and added the sidecar. So:

- **Reading 1 (revert #927 only)** → back to the `variant` form. Drift detection keeps working
  (an `agent` block is still emitted). **But** it restores a mechanism measured inert — inference 2.
- **Reading 2 (remove per-role effort tiering entirely)** → what this report assumes throughout, and
  what the owner's stated rationale (*native inheritance is already correct*) implies. Triggers
  Blockers 1 and 2.

I have measured both consequences but **cannot choose** — it is a value call about what the edition
should ship. **Ask the owner.**

**B. What "config drift" means with no shipped role set** (Blocker 2). Needs an owner ruling.

**C. Whether `--adopt-config` retains a purpose** if the generated config is always the neutral
template. It would then replace a user's config with a commented-out scaffold. Not measured — depends
on B.

**D. Fate of `docs/decisions/D-610-01.md` and the investigation doc** — amend vs. annotate-as-superseded
is an editorial/records call.

**E. Not measured: the four-chain / walkthrough impact.** I ran only `test-opencode-edition.js`.
`npm test` and `simulate-workflow-walkthrough.js` were not run — the anchor is byte-identical ×4 and
the claim.js `resolveRuntime` reference (D1) is the one place a non-opencode suite could notice. Per
the project rule an edition-only diff owes no four-chain run, but **an anchor edit is not edition-only**
— all four copies change, so the full chain set applies.

**F. Not measured: live opencode behaviour after removal.** Verifying that subagents still inherit the
parent's effort with no `agent` block is probe C in `live-oracle/`, already run. I did not re-run it.
