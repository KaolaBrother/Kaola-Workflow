# Documentation update — issue-927

**No finalize-time `doc-updater` dispatch was made, deliberately.** The documentation work for this
run was already done by a `doc-updater` subagent across **five rounds** during the run itself, the
last two of them *after* the pivot, so a sixth dispatch at finalize would have had nothing to find.
Its report is `.cache/docs.md`; this file records the reasoning and the verification.

## Why the docs needed two distinct passes

Rounds 1–3 documented the feature #927 asked for. The owner then ruled that feature removed on a
measurement, so rounds 4–5 documented its **removal**. Text written in the first phase was not
softened in the second — `docs/opencode-edition.md` had 154 lines deleted outright rather than
reworded, because they described how to configure something that no longer exists.

## Checklist from the project-root `CLAUDE.md`

> On any user-visible change, update: `README.md` · API docs · `CHANGELOG.md` under `[Unreleased]` ·
> architecture docs if structure changed · inline comments where public interfaces changed.

| checklist item | disposition |
|---|---|
| `README.md` | **Updated** — opencode paragraph restated as inheritance; `mapTier` / `CONTRACT_EFFORT_TABLE` / `contractForProvider` dropped from the front page; `--adopt-config` documented. |
| API docs (`docs/api.md`) | **No impact, verified not assumed.** Grepped for every removed symbol — `CONTRACT_EFFORT_TABLE`, `contractForProvider`, `effortForProvider`, `mapTier`, `TIER_RANK`, `effort-tiers`, `renderAdaptiveConfig`, `chat.params`, the `--adapt` flag: **zero hits**. The only `adapt` matches are `adaptive-schema` (the module's filename, which still exists) and `adapters`. This check was run **before** the chain receipt, because `docs/api.md` is test-consumed and editing it after would have staled the receipt. |
| `CHANGELOG.md` `[Unreleased]` | **Rebuilt** around `### Removed` rather than `### Added`, carrying probe C's numbers. Written *before* the receipt run, per the standing ordering rule. |
| Architecture docs | **No impact, verified.** `docs/architecture.md` and `docs/conventions.md` carry zero references to any removed symbol. No structural change: the module, its four copies and their sync mechanism are unchanged in shape — a block was excised from inside one file. |
| Inline comments on public interfaces | **Updated.** The `agent`-facing generated badge now reads `## Model and effort are inherited`; the ×4 anchor's comments were corrected where they named deleted consumers; `sync-kimi-edition.js`'s one comment naming opencode's removed block was reworded. |

## Beyond the checklist

Also updated, because each carried a statement that the deletion made false: `docs/opencode-edition.md`
(net −213/+293), `docs/kimi-edition.md` (comparative claims about opencode), the audit supersession
note, the design record (flipped to BUILT, MEASURED, THEN REMOVED with its body preserved), and the
decision records `D-610-01` (four citation sites, three different dispositions) and `D-544-01` (a
dated measurement note, nothing rewritten).

## Anti-fabrication

Nothing structured was invented. The doc agent verified against source in every round and, on three
occasions, **declined an instruction rather than write an unsupported claim** — refusing to restate a
dated June audit measurement as though it had validated an August key, and refusing to write that the
plugin load failure had killed the surviving hooks. Both refusals were correct; I reproduced the
second myself and corrected my own record. See `.cache/pivot-brief.md` § CORRECTION.
