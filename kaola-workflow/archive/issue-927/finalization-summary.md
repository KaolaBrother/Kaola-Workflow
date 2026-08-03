# Finalization — Summary: issue-927

## Delivered

**#927 asked for a feature. What shipped is the removal of one, and the issue closes premise-refuted
rather than fixed.**

The issue reported that every opencode subagent effort tier this edition ships was inert, and
proposed carrying the tier in `agent.<role>.options` instead of `agent.<role>.variant`. That was
built, adversarially reviewed, and then removed — on a measurement the issue had never taken.

**The measurement (probe C, `.cache/live-oracle/README.md`).** With no `agent` block, no sidecar and
the plugin inert, changing only the parent session's `--variant`:

| parent `--variant` | parent | planner (sub) | implementer (sub) |
|---|---|---|---|
| `nothink` | 0 | 0 | 0 |
| `think` | 26 | 560 | 641 |

opencode already hands a subagent the parent's effort whenever the role pins no model
(`variant: b.model ? void 0 : q` in `TaskTool.execute`, read byte-exact from the 1.18.11 binary). The
~80 subagent sessions that all ran `default` were **inheriting correctly** from parents that were
themselves at `default` — not failing. Per-role tiers override correct native behaviour; no observed
failure forces one to exist.

Two further measurements pointed the same way: the shipped 32000/16000 split had **no demonstrated
effect** on the only provider ever measured (`zhipuai-coding-plan` routes through
`@ai-sdk/openai-compatible`, not the Anthropic contract), and the design's own hook sketch could not
have closed the wrong-contract exposure it existed for, because the sync-time payload is already
inside `output.options` by the time `chat.params` runs.

**Removed** (variant-era remains included, because leaving provably-dead configuration behind is the
defect class that hid this): `renderAdaptiveConfig`, `--adapt`, `--write-effort-tiers-to`, the
`effort-tiers.json` sidecar, the `chat.params` hook, and `CONTRACT_EFFORT_TABLE` /
`contractForProvider` / `effortForProvider` / `mapTier` / `TIER_RANK` from the ×4 anchor.

**Kept, each independent of tiering:**

- **Plugin loader fix.** opencode calls every exported function as a plugin factory, so
  `export { hookPath, findRoot }` made `findRoot` throw and the plugin log a load error on every
  session. Verified live: the fixed copy loads clean, this box's v9.4.2 copy does not.
- **Installer config-drift reporting**, resubjected from "role set differs from the generator's"
  (which has no baseline post-deletion) to "this config carries per-role effort that no longer does
  anything" — the migration path off the tier version.
- **`--adopt-config`** with disclosure and a collision-proof backup.
- **Test guard hardening**: a badge-block anchor miss is now a red, not a silent skip.

**Verified post-removal (probe D).** A fresh install, config exactly as shipped: both `task` calls
routed to the role named in `subagent_type`; both inherited the parent's model; both inherited the
parent's effort, recorded on the subagent's own session row; effort real, 0/0 against 832/334; zero
plugin load errors.

## Files Changed

17 files, commit `162135a8`, +1491/−937.

**opencode-scoped**: `scripts/sync-opencode-edition.js`, `scripts/test-opencode-edition.js`,
`templates/opencode/plugins/kaola-workflow-hooks.js`, `install-opencode.sh`,
`docs/opencode-edition.md`, `docs/audits/opencode-edition-audit.md`, the design record.

**Shared**: `scripts/kaola-workflow-adaptive-schema.js` + its three forge mirrors (84 removed, 6
added — all six comments; four copies still byte-identical), `scripts/sync-kimi-edition.js` (one
comment), `docs/kimi-edition.md`, `docs/decisions/D-544-01.md`, `docs/decisions/D-610-01.md`,
`CHANGELOG.md`, `README.md`.

**Why a shared file was touched at all**, since this was filed as an opencode-only diff: the removed
symbols lived in the ×4 anchor but were opencode-only *in fact*. Census at base commit `c3938174`:
every consumer of every removed symbol was an opencode file or prose. No claude, codex, gitea,
gitlab or kimi script referenced any of them. `normalizeTier` and `dispatchEffort`, which are shared,
were deliberately preserved.

## Test Coverage

`scripts/test-opencode-edition.js`: 514 assertions, exit 0. Test custody held throughout — the
implementers never wrote a test, and the author deleted each block **with** its mechanism, leaving a
note naming what it pinned so nobody re-adds it. No assertion was rewritten to keep passing against
absent machinery.

Coverage added for the survivors, both closing gaps the implementers reported honestly rather than
letting green imply coverage:

- **A29** — loads the plugin the way opencode does (`Object.values(mod)`), asserting exactly one
  factory. Mutation: re-adding `export { hookPath, findRoot }` reproduces the historical `paths[0]`
  failure exactly. Before this, 835 assertions passed over a plugin that threw on every real load.
- **A27-quiet** — closes the over-fire gap: removing the `variant`/`options` filter left the suite
  unmoved while the installer began naming a user's own model pins.
- **A28** — the `--adopt-config` backup and disclosure, with `date` frozen on `PATH` so the
  same-second collision case is testable at all; two real installs are seconds apart, so a
  clock-derived name is unique by accident and the suite would otherwise pass against the very code
  that loses the file.

## Validation

*(The finalize transaction writes its receipt finding here. Do not delete or soften it.)*

Chains run serially (`KAOLA_RUN_CHAINS_CONCURRENCY=serial`) from the worktree at commit `162135a8`.
**This is an edition-touching diff — the full four-chain receipt is owed and was not waived**, because
the ×4 anchor moved. The issue's own roadmap entry said "opencode-edition-only diff; no four-chain run
owed"; that claim became false during the run and is corrected here.

**Receipt: all four chains green at `162135a8`, the implementation commit, with no accepted reds.**
`scope.decision: all-four`, `scope.reason: edition_coupling`, base `c3938174`, 17 changed files —
the runner reached the same conclusion independently. Durations: claude 336s, codex 7s, gitlab 89s,
gitea 91s. `workTreeHash: clean`.

**One thing the receipt does not prove on its own**: the claude chain runs
`simulate-workflow-walkthrough.js --shard auto/12`, so the receipt covers only the shard that came
up. The full-scope walkthrough was run separately and independently — 202/202, exit 0 — so the suite
is verified rather than sampled. Stated because a receipt citing a sharded step reads as full
coverage and is not.

Independently green before the receipt run, real exit codes read from `$?`: opencode edition 514,
kimi 507, walkthrough 202/202, `validate-script-sync` (27 byte-identical groups, 4 identical kernel
copies), `generate-routing-surfaces --check` (18 surfaces), `test-install-all`.

## Changed Paths

*(The finalize transaction writes this. Do not delete or soften it.)*

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. Docs were written across five `doc-updater` rounds, the last two
*after* the pivot; `docs/opencode-edition.md` had 154 lines deleted outright rather than softened,
because they described configuring something that no longer exists.

`docs/api.md`, `docs/architecture.md` and `docs/conventions.md` carry **zero** references to any
removed symbol — checked **before** the receipt run, since `docs/api.md` is test-consumed and a later
edit would have staled it.

## Run gaps

- manual:followup (dispatchEffort exported from the x4 anchor with no production consumer, keeping normalizeTier alive; filed as #928): filed: #928

Its documented consumer `kaola-workflow-adaptive-node.js` no longer exists. Surfaced by this run, not
caused by it, and deliberately left untouched here.

Three further findings were judged **not** defects and so were never seeded as gaps. Recorded here
because "we looked and decided no" is worth more to a reader than silence:

1. **The GLM transport finding.** `zhipuai-coding-plan` routes through `@ai-sdk/openai-compatible`
   rather than the Anthropic contract, which contradicts `D-544-01`'s premise rather than merely its
   mechanism. Not filed: the contract table it governed is deleted by this change, so no live code
   depends on it. Recorded as a dated measurement note on `D-544-01`, with no verdict on the decision.
2. **`docs/decisions/D-544-01.md:119`** names a section deleted here. Not a defect: it records what
   that decision did at the time, and repairing it would edit a decision's account of itself.
3. **Removed symbol names surviving in `test-opencode-edition.js` comments.** Deliberate — they are
   the test author's deletion notes, placed so nobody re-adds the mechanism.

## Follow-Up Items

- **#928** — the `dispatchEffort` / `normalizeTier` closed loop, above.
- **Reinstall the runtimes on this box.** The plugin loader bug is live at v9.4.2:
  `~/.config/opencode/plugins/kaola-workflow-hooks.js` still carries
  `export { hookPath, findRoot };`, so every opencode session logs a failed plugin load.
  **Severity, corrected:** the surviving hooks are *not* dead — reproduced against the installed
  copy, `default` sorts first and registers both hooks, and only then do the named exports throw.
  They survive by an accident of export sort order, and any export name sorting before `default`
  would kill all of them. `./install-all.sh --global --yes` after this merges.
- This box's global `opencode.json` carries three retired roles; the new drift reporting names them
  on the next install, and `--adopt-config` would adopt them behind an explicit opt-in with a backup.

## Corrections made during this run

Recorded because the run's own errors are the part worth keeping.

- I claimed probe A2 "demonstrably" proved the plugin hook applied. The plugin-load error was in my
  own probe logs, unread. The conclusion held, but the adversarial pass established it, not me.
- I twice told the user the loader bug had killed the dispatch-log and compaction hooks. It had not.
  The doc agent refused to write that and was right; I reproduced it and corrected the record.
- I instructed the doc agent to rewrite a dated June audit measurement. It refused, because restating
  it would assert that a June audit had validated an August key. Refusal upheld.
- I listed the `OPENCODE_CONFIG_DIR` resolution as "keep". Implementer B measured it inert and cut
  it; the defect it was added for stays fixed for a better reason.
- One adversarial finding (`google-vertex-anthropic`) was refuted by implementer A on measurement and
  not forwarded.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-927/.cache/badge-heading.md
- kaola-workflow/archive/issue-927/.cache/chain-receipt.json
- kaola-workflow/archive/issue-927/.cache/deletion-blast-radius.md
- kaola-workflow/archive/issue-927/.cache/design-brief.md
- kaola-workflow/archive/issue-927/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-927/.cache/doc-docking.md
- kaola-workflow/archive/issue-927/.cache/doc-updater.md
- kaola-workflow/archive/issue-927/.cache/docs.md
- kaola-workflow/archive/issue-927/.cache/drift-feature-shape-for-tdd-guide.md
- kaola-workflow/archive/issue-927/.cache/impl-a-generator-plugin.md
- kaola-workflow/archive/issue-927/.cache/impl-b-installer.md
- kaola-workflow/archive/issue-927/.cache/live-oracle/README.md
- kaola-workflow/archive/issue-927/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-927/.cache/pivot-brief.md
- kaola-workflow/archive/issue-927/.cache/premise-opencode-mechanism.md
- kaola-workflow/archive/issue-927/.cache/premise-repo-anchors.md
- kaola-workflow/archive/issue-927/.cache/review-adversarial.md
- kaola-workflow/archive/issue-927/.cache/review-code.md
- kaola-workflow/archive/issue-927/.cache/run-gaps-manual.md
- kaola-workflow/archive/issue-927/.cache/run-gaps.json
- kaola-workflow/archive/issue-927/.cache/test-authoring-red-run.txt
- kaola-workflow/archive/issue-927/.cache/test-authoring.md
- kaola-workflow/archive/issue-927/.cache/test-pivot.md
- kaola-workflow/archive/issue-927/finalization-summary.md
- kaola-workflow/archive/issue-927/mission-list.md
- kaola-workflow/archive/issue-927/workflow-state.md
