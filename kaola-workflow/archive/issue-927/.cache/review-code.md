# #927 — adversarial code review of the full working diff

**Candidate**: worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927`,
branch `workflow/issue-927`, `git diff c3938174` (16 files, +1936/−356).
**Mode**: read-only. No tracked file was edited; `git status` at the end of the review is
byte-identical to the list at the start (verified). All probes ran in the session scratchpad or in
`mkdtemp` dirs with a hermetic `HOME`.

**Verdict: 2 real defects (1 high, 1 medium), 1 owner decision, 2 low prose/dead-claim findings.**
The plugin hook, the other-contract clearing, the regex→data refactor and the ×4 anchor are clean —
I could not break any of them and I say so plainly below with what I tried. The defects are both on
the installer's `--adopt-config` / drift seam, and both are measured end to end, not reasoned.

---

## R1 — HIGH: `--adopt-config` can replace a working effort config with the effort-LESS neutral template, while printing that it adapted the tiers

**Anchor**: `install-opencode.sh:608` (`node … --write-config-to "$cfg" --adapt`) and
`install-opencode.sh:609` (`echo "Seeded $cfg — effort tiers adapted to your inherited model (contract-keyed)."`).
Secondary: `scripts/sync-opencode-edition.js:602-618` (`detectInheritModel`),
`scripts/sync-opencode-edition.js:625-629` (`renderOpencodeJson` fall-through),
`install-opencode.sh:553` (the guard that exists on the READ path), `README.md:366`,
`docs/opencode-edition.md:171-183`.

**Failure class**: silent capability loss + false success report.

**Trigger, measured, no env vars, default global layout**

```
1. ~/.config/opencode/opencode.json  = {"$schema":…, "model":"zhipuai-coding-plan/glm-5.2", "mcp":{…}}
2. ./install-opencode.sh --global --yes         → "⚠ Config drift: … 14 role(s) shipped now that it lacks: …
                                                   Re-run with --adopt-config …"
3. ./install-opencode.sh --global --yes --adopt-config
                                                → correct adaptive config, 14 roles, thinking 32000/16000.
                                                   NOTE: the adaptive render carries NO "model" key, by design.
4. ./install-opencode.sh --global --yes --adopt-config      ← the same documented command, again
                                                → "Seeded … — effort tiers adapted to your inherited model
                                                   (contract-keyed)."
```

Observed content of `opencode.json` after step 4 (verbatim, whole file):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "default_agent": "build"

  // Kaola-Workflow · opencode edition — TWO model tiers:
  …
  // "model": "<inherits your opencode default>",
  // Pin the reasoning tier only to put it on a different model:
  // "agent": {
  …
}
```

**No `agent` block. No `options` payload on any role. Zero effort tiers.** Expected: the file keeps
carrying each role's tier payload — that is what the flag, the README line and the drift report all
promise. The installer nevertheless prints the "effort tiers adapted … (contract-keyed)" line.

**Why**: `--adapt` resolves the model through `detectInheritModel()`, which reads only
`$HOME/.config/opencode/opencode.json` / `$HOME/.opencode/opencode.json` for a `"model"` key
(`sync-opencode-edition.js:602-618`). At global scope with the default config dir, that file *is*
`$cfg` — the file adoption just wrote — and the adaptive render deliberately carries no `model` key.
So detection returns `''`, `renderOpencodeJson` falls through to `renderNeutralConfig`
(`:628-629`), and the whole-file replace lands the neutral template on top of the working one.

The installer's own comment at `install-opencode.sh:606-607` states this fall-through
("A falsy/absent model still renders the neutral template") — and the `echo` on the very next line
asserts the opposite unconditionally.

**A second, one-step trigger for the same defect**: any global config that has no top-level `"model"`
key (a user who picks their model in the TUI, or whose config only carries `provider`/`mcp`). The
README presents `./install-opencode.sh --adopt-config` as a standalone command (`README.md:366`);
running it there writes the neutral template on the first attempt.

**Why existing guards do not catch it**
- `A27` (`test-opencode-edition.js:2419-2424`) and `A28` (`:2564-2571`) both set
  `KAOLA_OPENCODE_INHERIT_MODEL=openai/gpt-5` on every spawn, so `detectInheritModel()`'s
  fall-through is never reached in the suite.
- `A27`'s adoption assertion (`:2490-2493`) pins byte-equality with
  `sync.renderOpencodeJson({ inheritModel: INHERIT })` — i.e. against the adaptive render only. The
  neutral outcome is structurally outside what that assertion can see.
- `A12-options` reads `renderOpencodeJson({inheritModel})` directly and never goes through
  `seed_config`.
- The read path has exactly the missing guard: `report_config_drift`'s
  `if (emitted.length === 0) process.exit(0)` (`install-opencode.sh:552-553`, the design brief's
  §4.6 protection). The write path has no equivalent.

**Blast radius**: Layer 2 (plugin + sidecar) still tiers per call, so this is not a full de-tier —
but Layer 1 is the documented fallback ("The payloads written here are what applies if that plugin
is not loaded", `sync-opencode-edition.js:668`), and it is removed silently. Recovery is by hand from
the `.bak`. Confidence: **high** (measured end to end, twice).

---

## R2 — MEDIUM: the new drift detector is inert whenever `OPENCODE_CONFIG_DIR` is set, and disarms itself after the adoption it recommends

**Anchor**: `install-opencode.sh:545-553` (`sync.detectInheritModel()` → `emitted.length === 0` →
`exit 0`). Secondary: `scripts/sync-opencode-edition.js:602-618`, `install-opencode.sh:621`
(`DEST_ROOT="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"`).

**Failure class**: guard that reports nothing in a supported layout.

**Trigger A — measured.** Identical drifted config (`model` + `mcp`, no `agent` block), two layouts:

| layout | drift report |
|---|---|
| `HOME=<tmp>`, config at `$HOME/.config/opencode/opencode.json` | full report: 14 roles named, flag named |
| `OPENCODE_CONFIG_DIR=<tmp/cfg>`, config at `<tmp/cfg>/opencode.json` | **nothing at all** (exit 0, silent) |

The installer resolves the entire global layout from `$OPENCODE_CONFIG_DIR` (`:621`) and the docs
describe every deployed path as `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/…`, but
`detectInheritModel()` never consults it. So the drift baseline is empty and the check bails.

**Trigger B — measured, chains off R1.** After one `--adopt-config` at the default global path, the
config no longer carries a `"model"` key, so `detectInheritModel()` returns `''` on every subsequent
install and the drift check is silent from then on. Verified: a third install over the freshly
adopted config printed only `Preserved existing …`, no drift lines. That is correct *today* (nothing
has drifted yet) and wrong the moment the role set changes again — the detector is disarmed exactly
on the machines that have adopted, which is the population it exists to serve.

This is the same shape as the backup-collision defect implementer B caught in its own work: the
mechanism recreates its own failure one level down.

**Why existing guards do not catch it**: `A26`'s global install sets `OPENCODE_CONFIG_DIR` but
asserts only the sidecar and the plugin; `A27`/`A27-neg`/`A28` all use `--target` (project scope)
plus `KAOLA_OPENCODE_INHERIT_MODEL`. No assertion exercises drift reporting at global scope, and
none exercises detection-from-the-file-being-compared. Confidence: **high** (both branches measured).

---

## R3 — MEDIUM, owner decision: the first install over ANY pre-existing user config calls it "drift" and points at a whole-file replace that removes `model` and `mcp` credentials

**Anchor**: `install-opencode.sh:530-543` (the report text), `install-opencode.sh:586-598`
(backup + replace), `README.md:366`.

**Measured** on this box's real config shape (`model` + four `mcp` servers carrying API keys, no
`agent` block), hermetic copy:

```
./install-opencode.sh --global --yes
  ⚠ Config drift: its role set is not the role set this workflow ships now.
      14 role(s) shipped now that it lacks: adversarial-verifier, …, tdd-guide
      Nothing was changed. Re-run with --adopt-config to adopt it: that REPLACES this
      file rather than merging (hand edits and model pins go), after copying it to opencode.json.<timestamp>.bak.

./install-opencode.sh --global --yes --adopt-config
  → live config now has NO "model" and NO "mcp"; both survive only in opencode.json.<ts>.bak (0644)
```

Nothing "drifted" here — the file simply predates the edition. The report does not distinguish
*"your kaola role set is stale"* from *"this config never had kaola roles"*, and the action it names
for the second case removes the user's model choice and their MCP credentials from the live config.
Disclosure and a collision-proof backup are both present and both work (measured), and the design
brief's owner ruling explicitly authorized "report exactly what drifted … act only behind an explicit
opt-in", so this is not a rule violation. Implementer B flagged it as an open judgement
(`impl-b-installer.md` §7.3). Recording it as a **user-decision** item, not a defect: whether the
report should fire — and recommend a whole-file replace — for a config with zero kaola roles is a
values call, and the docs already point such users at the merge recipe instead.

---

## R4 — LOW: stale mechanism claims left in text this diff re-authored

`mapTier` has **zero call sites repo-wide** — verified at both `c3938174` and HEAD; the only
references are comments. The emission path uses `effortForProvider`. Yet:

- `install-opencode.sh:602` — a `+` line in this diff: *"The effort KNOB is CONTRACT-KEYED (mapTier +
  CONTRACT_EFFORT_TABLE + contractForProvider in kaola-workflow-adaptive-schema.js)"*. This is the
  same "roster that outlived its members" class implementer A deliberately removed from
  `kaola-workflow-adaptive-schema.js:52-60` in this very diff — reintroduced one file over.
- `scripts/test-opencode-edition.js:659-666` — the A12 header comment still describes the retired
  mechanism (*"emits the two-tier EFFORT-VARIANT config … get the provider's TOP variant … The
  per-tier variant names are provider-relative (mapTier)"*) over a block that no longer asserts any
  of it.
- `scripts/test-opencode-edition.js:958` — *"OPENCODE_BADGE_BLOCK's `mapTier` line"*; that line was
  deleted by this diff.

Comments only, no runtime effect. Flagged because the issue's own thesis is that a dead claim that
reads as fact is what hid the failure for ~80 sessions. Confidence: high.

---

## R5 — LOW: one doc sentence is true at global scope only

`docs/opencode-edition.md:364-368`: *"the effort-tier sidecar lands in the same directory but ships
with the plugin, so `--no-scripts` still leaves the tiers working."* Measured: at **project** scope
the sidecar lands at `<project>/.opencode/kaola-workflow/effort-tiers.json` while the support scripts
go to `<config>/kaola-workflow/scripts/` — different directories. The load-bearing half of the
sentence (`--no-scripts` still leaves the tiers working) is correct and measured (below).

---

## What I tried to break and could not

### The `chat.params` hook — 36 hostile cases, ZERO throws

Drove the shipped template (`templates/opencode/plugins/kaola-workflow-hooks.js`) directly, as a real
ESM import, per case, with hermetic `HOME`/`OPENCODE_CONFIG_DIR`. Every case returned; every
unresolvable case left `output.options` byte-identical.

*Sidecar hostility*: JSON array root · `null` · number · string · `{}` · `tiers` an array · `effort`
an array · `providerContracts.rules` a string · a rule whose `match` is an invalid regex source
(`"(["`) · a catastrophic-backtracking source (`"(a+)+$"`) against a 41-char provider id · a contract
literally named `__proto__` · a contract named `constructor` · a rank token `__proto__` · a knob key
`__proto__` (no prototype pollution: `{}` afterwards carried no `polluted`) · non-JSON bytes ·
sidecar absent entirely.

*Input hostility*: `agent` = `__proto__` / `constructor` / `toString` / `hasOwnProperty` (all no-ops
— `hasOwnProperty.call` at `:255` is doing real work) · `provider.id` a number / an object ·
`provider` a string / an array · `input` = `null` · `input.provider` a throwing getter · `input` a
`Proxy` that throws on every property read.

*Output hostility*: `output.options` frozen · sealed · an array · a string · a getter-only
non-configurable property · `output` itself frozen · `output` = `null`. The frozen/sealed cases abort
the hook mid-way (the `delete` throws under ESM strict mode) and fail open, leaving `output.options`
as found — correct posture, and unreachable in practice since opencode builds `d` fresh each call.

**File I/O**: `loadEffortTiers()` runs **once per plugin factory** (`:210`), not per call. Up to five
`existsSync` probes plus one `readFileSync` at load; the hook itself touches no filesystem. Cached
correctly, and `detach()` (`:141-148`) stops a downstream writer corrupting the cache.

### Other-contract clearing — derived, and it does not over-reach

`:267-269` clears the union of every top-level key across every `effort[contract][rank]` payload in
the **sidecar's own table** (`:115-123`), so a new contract with a new knob reaches the plugin whole;
nothing is hand-typed. Measured on the real sidecar:

| pre-existing `output.options` | provider | after the hook |
|---|---|---|
| `{reasoningEffort:'minimal', toolStreaming:false}` | `anthropic` | `{toolStreaming:false, thinking:{…32000}}` |
| `{thinking:{type:'disabled'}, cacheControl:'x'}` | `openai` | `{cacheControl:'x', reasoningEffort:'xhigh'}` |

The other contract's knob goes; unrelated options survive. That is exactly addendum 1. It *does*
remove a value a user set for another contract's knob — which is the required behaviour, since that
knob is wrong for the resolved contract, and it is scoped to the 14 tier-mapped agent names only
(`build` and every unknown agent are untouched, measured). **Watch item, not a finding**: the knob set
is a union across contracts, so the day a contract adds a knob that is also a general-purpose option,
that option becomes deletable for every other contract.

### The regex-chain → data refactor — behaviour-identical, order preserved

Independent differential of the original inline chain against the shipped `contractForProvider`:
**205,840 inputs, 0 mismatches** (5,832 structured concatenations of every interesting substring ×
3 nesting positions, 200,000 random `[a-z0-9-]{1,12}` strings, plus `null`/`undefined`/`0`/`''`/
`false`/`NaN`/`[]`/`{}`). Order is genuinely load-bearing and genuinely preserved: `gpt-glm` →
`anthropic`, `openai-zai` → `anthropic`, `claude-glm` → `anthropic`, `zhipuai-coding-plan` →
`anthropic`. `PROVIDER_CONTRACT_MATCHERS` is compiled once from the same frozen list the generator
serializes, and the plugin's copy consumes that serialization — one rule, three readers, no fourth
spelling.

### The ×4 byte-identical anchor

All four copies hash `6d92dcf0c9defc529f1f52b9b063e0533d6352098b56f72b4ff8c7f6accd27f9`.
`node scripts/validate-script-sync.js` → exit 0 (4 Oracle Kernel copies identical at HEAD).
`node scripts/generate-routing-surfaces.js --check` → exit 0, 18 surfaces.

### Installer deployment (excluding R1/R2)

Measured, all exit 0:

| case | result |
|---|---|
| project `--target … --no-scripts` | sidecar at `<proj>/.opencode/kaola-workflow/effort-tiers.json`; §4.5 hazard genuinely closed |
| project `--uninstall` | sidecar, its dir and `.opencode/` all gone; `opencode.json` preserved |
| global `--global --no-scripts` | sidecar at `<cfg>/kaola-workflow/effort-tiers.json`, mode 0644 |
| `--adopt-config` backup | written before the replace, path printed, content byte-identical to the original; collision suffix `-1`, `-2` works |
| backup unwritable | `cp` fails → loud `exit 1`, config untouched (A28 case 3) |

`mktemp` with no template works on this box's BSD userland (checked, not assumed). The
`node … --write-effort-tiers-to "$tmp" && [[ -s "$tmp" ]]` gate is the right shape — the generator
does print usage and exit 0 for an unknown mode. Sidecar output is deterministic and byte-idempotent
(sorted keys, `JSON.stringify(…, null, 2)`).

### Scope discipline

- `renderNeutralConfig` (`sync-opencode-edition.js:679-738`) is **untouched in behaviour** — verified
  line by line against the diff; the only hunks near it are the new `renderEffortTiers` below it.
- No `variant` / `variants` string survives in any of the 51 generated agent+command files across the
  three opencode trees (re-swept independently: 0 hits).
- `docs/api.md` does not enumerate the schema module's exports, so the three new exports owe it
  nothing.
- The schema comment overhaul (`:47`, `:52-60`, `:123-125`, `:132-140`) goes beyond the minimum this
  issue forced. It corrects false mechanism claims in a file the diff was already moving and it is
  comment-only across the ×4 anchor, so I am not calling it scope creep — recording that it widened
  the anchor's diff for reasons the issue did not demand.

### Live acceptance — already met, and it settles the one thing I could not verify statically

`.cache/live-oracle/README.md` probe A1 (350 vs 0 reasoning tokens, two subagents, one parent, one
inherited model, nothing pinned, sidecar removed) closes the only real gap I had left: whether
`agent.<role>.options` in `opencode.json` survives opencode's merge with the markdown agent record
(whose decoded `options` is `{}` for our known-keys-only frontmatter). It does. Probe A2 proves the
sidecar overrides the static payload per call. Both layers are measured, not asserted.

### Churn

`scripts/test-opencode-edition.js` was still being edited during this review (mtime 15:03 against a
15:07 read; the `A28` block postdates implementer B's report). I read it as it stood and treated the
churn as churn, not as a defect. `A28` is well built — the frozen-clock PATH shim at `:2680-2697`
with its own `realDate` positive control is the right way to test a collision that the real clock
would never produce.

---

## Suggested disposition

- **R1** needs a fix before this ships: `seed_config` should refuse to replace an existing config
  with a render carrying no `agent` block (the same `emitted.length === 0` test the read path already
  has), or `--adapt` should learn `$OPENCODE_CONFIG_DIR` and the file it is about to replace. Either
  way `install-opencode.sh:609` must stop claiming tiers it did not write. The assertion that would
  have caught it is *"adoption never reduces the emitted role count"* — which is `tdd-guide`'s to
  author, not the implementer's.
- **R2** is the same root cause seen from the read side; one fix to `detectInheritModel`'s inputs
  closes both.
- **R3** is the owner's call, in conversation.
- **R4 / R5** are cheap prose corrections.

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=--adopt-config replaces a working effort config with the effort-less neutral template while printing that it adapted the tiers; no suite assertion can reach the fall-through
finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=drift detector is silent under OPENCODE_CONFIG_DIR and disarms itself after the adoption it recommends, because its baseline comes from detectInheritModel
finding: id=R3 scope=user_decision action=none status=open severity=medium fix_role=none rationale=first install over any pre-existing user config reports it as drift and recommends a whole-file replace that removes model and mcp credentials; disclosed, backed up, owner-authorized framing
finding: id=R4 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=install-opencode.sh:602 re-authored with a mapTier mechanism claim that has zero call sites; two matching stale comments in the test file
finding: id=R5 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=docs claim the sidecar lands in the same directory as the support scripts, true at global scope only

verdict: fail
findings_blocking: 2

review_conclusion: The plugin hook, the derived other-contract clearing, the provider-rule refactor and the byte-identical anchor all held under direct adversarial probing, but the installer adoption seam carries a high-severity silent capability loss that every green assertion structurally cannot see.
