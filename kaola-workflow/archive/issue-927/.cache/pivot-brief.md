# #927 pivot brief — remove per-role effort tiering

Everyone working the pivot reads this. One wording. It supersedes `design-brief.md`, which described
machinery that is now being removed.

## Why

Owner ruling, 2026-08-03, on a measurement — not an argument. Probe C in
`.cache/live-oracle/README.md`: with **no `agent` block, no sidecar, and the plugin inert**, changing
only the parent session's `--variant` moved both subagents together.

| parent `--variant` | parent | planner (sub) | implementer (sub) |
|---|---|---|---|
| `nothink` | 0 | 0 | 0 |
| `think` | 26 | 560 | 641 |

opencode already hands a subagent the parent's effort whenever the role pins no model
(`variant: b.model ? void 0 : q` in `TaskTool.execute`, confirmed byte-exact from the 1.18.11 binary).
The ~80 subagent sessions that all ran `default` were **inheriting correctly** from parents that were
themselves at `default` — not failing. Per-role tiers are an *override* of correct native behaviour,
and no observed failure forces one to exist.

Two further measurements point the same way: the shipped 32000/16000 budget split has no demonstrated
effect on the only provider ever measured (`zhipuai-coding-plan` routes through
`@ai-sdk/openai-compatible`, not the Anthropic contract), and the two subagents in probe C came back
at 560 and 641 — no tier separation, which is the correct result when no per-role payload exists.

## Scope — settled, do not re-litigate

`renderAdaptiveConfig`, `--adapt`, `detectInheritModel` and the `variant` emission **pre-date this
run**; #927 only flipped `variant`→`options` and added the sidecar. Reverting #927 alone would restore
the `variant` form, which is measured inert. **Remove per-role effort tiering entirely, variant-era
remains included.** Leaving provably-dead configuration behind is the defect class that caused this
bug; a dead key that reads as configuration is precisely what hid it for as long as it existed.

## Delete

Measured in `.cache/deletion-blast-radius.md` — read it, and verify before you cut rather than
trusting either that report or this summary.

- **Generator**: `renderAdaptiveConfig`, `renderOpencodeJson`'s branch, `detectInheritModel`,
  `parseModelProvider`, `topTierRoles`, `standardTierRoles`, `renderEffortTiers`,
  `runWriteEffortTiersTo`, `--write-effort-tiers-to`, `--adapt` (threaded through four signatures).
- **×4 anchor**: `mapTier`, `TIER_RANK`, `CONTRACT_EFFORT_TABLE`, `contractForProvider`,
  `effortForProvider`, `PROVIDER_CONTRACT_RULES`, `API_CONTRACT_RULES`, `DEFAULT_PROVIDER_CONTRACT`,
  `PROVIDER_CONTRACT_MATCHERS`.
- **Plugin**: the `chat.params` hook and everything that exists only for it — `loadEffortTiers`,
  `contractForCall`, `detach`, `isPlainObject`, `mergeInto`.
- **Installer**: sidecar deploy and uninstall; the refusal added to guard tiers.
- **Tests**: the blocks pinning the above. A test is deleted with its mechanism, **never repaired
  ahead of it** — do not rewrite an assertion so it keeps passing against machinery that is gone.

## Keep — each has a consumer outside tiering

- `reasoningRoles()` — consumed by `renderNeutralConfig`. `roleTier`, `renderNeutralConfig`,
  `ENV_STANDARD_MODEL` / `ENV_REASONING_MODEL` (the opt-in model-pin path, a different feature).
- `normalizeTier` — survives via `dispatchEffort`.
- `KAOLA_OPENCODE_INHERIT_MODEL` — read by `resolveRuntime()` in `kaola-workflow-claim.js`, four call
  sites across the ×4 copies. **A consumer outside tiering: do not delete it with the rest.**
- **The plugin loader fix** — only `export default`, helpers hung off it as properties. This fixes a
  live bug that has nothing to do with tiering: opencode calls every exported function as a plugin
  factory, so `export { hookPath, findRoot }` made `findRoot` throw and killed the whole plugin. It is
  live on this box at v9.4.2 today, taking the dispatch-log and compaction hooks down with it.
  Verified by a real run: fixed copy loads clean, installed copy does not. **Must survive.**
- Both surviving hooks — `tool.execute.before`, `experimental.session.compacting` — and the
  `deployedPath`/`hookPath` candidate walk they need.
- `--adopt-config`, its disclosure and its collision-proof backup.
- The S2 guard hardening that made an anchor miss a red instead of a silent skip.
- `D0` in the suite — it checks *generated-tree* drift and only collides by name with the installer
  feature.

## Two blockers the blast-radius measurement found

**1. Drift detection loses its subject.** It compares the role set in an existing `opencode.json`
against what the generator emits; post-deletion the generator emits no `agent` block, so
`install-opencode.sh:575` early-exits and the detector goes **completely silent** (measured, with a
positive control). **Reframe, don't delete**: the useful check is now the mirror image — an existing
config carrying an obsolete per-role `agent` block is stale and should be reported as such, because
that block no longer does anything and reads as live configuration. That serves the owner's original
intent (tell me my config is stale; never overwrite it silently) and it is exactly what this box's own
config needs, since it carries three retired roles.

**2. A refusal that will always fire.** `install-opencode.sh:627-635` refuses when the render carries
no tiers but the user's config does. Post-deletion the render *always* carries none, so it fires for
every user with an agent block (measured: exit 1). It guarded tiers; it goes with them. Do not replace
it with another refusal — the surviving destructive-write protection is the backup.

## The agent-facing badge

`## Effort is configured, not passed` was true of the tiers and is false under inheritance. State what
an agent actually gets: **a subagent runs the session's model and effort.** Before carrying forward
the "never pass a per-call `model=`" sentence, check whether it is still accurate for opencode's task
tool rather than keeping it on momentum.

## Verification

`node scripts/test-opencode-edition.js`, `test-kimi-edition.js`,
`simulate-workflow-walkthrough.js`, `generate-routing-surfaces.js --check`,
`validate-script-sync.js` — real exit codes read from `$?`, never through a pipe. The ×4 anchor
re-syncs with `node scripts/edition-sync.js --write`.

The suite is **already red** on entry: 835 passed, 3 failed, all `H1`, because
`scripts/test-opencode-edition.js:1629` uses a named import the loader fix removed. That mechanism
**survives**, so fixing that line is a legitimate repair rather than a pin rewritten against absent
machinery — and by custody it is the test author's, not an implementer's.

---

## Landed — implementer B, `install-opencode.sh` (verified by me, not taken on report)

Sidecar deploy/uninstall gone, `--adapt` gone, the always-firing refusal gone; residue check on
`effort-tiers`, `--write-effort-tiers-to`, `--adapt`, `mapTier`, `contractForProvider`,
`detectInheritModel` → **0 hits each**.

**B cut the `OPENCODE_CONFIG_DIR` resolution that this brief listed as "keep", and was right to.**
It existed to feed `detectInheritModel()`, which is deleted; `renderNeutralConfig` never reads an
inherited model. B measured it inert (two installs, var unset vs set, byte-identical output) rather
than asserting it. The original defect stays fixed for a better reason: the reframed detector needs no
generator baseline and reads the config straight from `DEST_ROOT`, which already resolves from
`OPENCODE_CONFIG_DIR`.

I confirmed that by running the installer against a scratch config dir with four `agent` entries —
three carrying `variant`/`options`, one carrying only a `model` pin:

```
⚠ Config drift: it pins per-role reasoning effort, which no longer does anything.
    3 role entry(ies) carrying an inert effort setting: contractor, issue-scout, planner
    … An entry that only pins a model is yours and is not counted here.
    Nothing was changed. Re-run with --adopt-config to adopt it …
```

Exit 0, config untouched, `my-own-agent` correctly not named. The drift feature kept its subject by
changing it: from "role set differs from the generator's" to "this config carries per-role effort
that no longer does anything" — which is the migration story for anyone who installed the tier
version, and what this box's own config needs.

**Unpinned and load-bearing**: B's mutation N4 removed the `variant`/`options` filter and the suite
did not move, while the installer began naming a user's own model-pin entry. Over-firing is invisible
to the suite because its negative control has no `agent` block. Relayed to the test author.

---

## CORRECTION — the loader bug's severity, as I stated it, was wrong

This brief said the load failure "took the dispatch-log and compaction hooks down with it", and I
repeated that to the user twice. **The doc agent refused to write it and was right.** Reproduced by me
against this box's installed v9.4.2 plugin, driving the loader the way opencode does:

```
export keys, in namespace order: [ 'default', 'findRoot', 'hookPath' ]
  default:  OK -> registered hooks [tool.execute.before, experimental.session.compacting]
  findRoot: THREW -> The "paths[0]" argument must be of type string
  hookPath: THREW -> The "path" argument must be of type string
hook tables collected: 1
```

**Both hooks register and work.** `default` sorts ahead of `findRoot`, so the hook table is collected
before anything throws. What is true: every session logs a plugin load error, and the hooks survive
**only by an accident of export sort order** — any export name sorting before `default` kills all of
them, leaving that one already-normalised error line as the only signal. A's mutation 5 demonstrated
exactly that.

The fix is still worth shipping and the fragility argument is untouched. The user-facing claim was
not supported, and the doc agent's wording — error on every startup, hooks surviving by accident —
is the accurate one. Traceable to me over-reading the adversarial report, which had said plainly that
the hooks survive.
