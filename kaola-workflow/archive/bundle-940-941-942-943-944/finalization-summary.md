# Finalization — Summary: bundle-940-941-942-943-944

Closes #940, #941, #942, #943, #944 — the five audit findings left over from #935's verification.

## Delivered

**#940 — the reasoning-tier floor is removed.** It was enforced for no role, including `synthesizer`.
Its only production consumer, `kaola-workflow-next-action.js`, was deleted by `c0b48043` (the ADR-0017
mission-list rewrite) along with nine DAG scripts; what remained ran solely inside its own test. Two
measurements decided it: wiring it back was proved a *no-op* one-liner (the dispatch-log hook's
`2>/dev/null || printf ''` eats the resolver's exit 1, and it fires at `SubagentStart` — after the
model is chosen), so making it bite meant building a new refusal seam against a failure class never
observed; and removal lowers nobody's tier, since `DEFAULT_AGENT_MODELS['synthesizer']` stays `opus`.
Net −446 lines. **User-ruled.**

**#941 — `sync-opencode-edition.js --check` now advises a remedy that works.** The footer was
unconditional `--write` and is the last line a reader acts on. Measured across all 14 mismatch
classes, `--write` is right for 12; a stale user-owned `opencode.json` needs `--write-config`, and an
unregistered plugin needs a `PLUGIN_SCRIPTS` source edit that no flag performs. Each mismatch now
carries its remedy from where it is constructed, and the advice derives from the remedies present,
mixtures included. `--write-config` is never advised blanketly — it discards user model pins, and the
footer says so when it does advise it. **The issue was wider than filed: 2 broken classes, not 1.**

**#942 — refuted by measurement; no code change.** The claim was that the drift-check banner "reads as
coverage either way". It does not: a first run prints `NO tree verified; 3 ABSENT, not checked (…)`
plus three per-tree `SKIPPED` lines, and the suite's own comment at `:41-64` states that distinction
was the design intent. The proposed remedy was measured *harmful* — reordering the check after
materialization makes it vacuous (a tree drifting one command earlier passed post-write) and destroys
the only position from which drift is observable. **User-ruled to close on the measurement.**

**#943 — `investigator` is pinned, and the table can no longer go short.** `EXPECTED_ROLE_MODELS`
held 13 of 14 roles, and its consuming loop iterates the table rather than the registry, so the
omission could not notice itself. Mutation-proved: a coherent re-tier of `investigator` passed an
unwaived four-chain green; the same re-tier of a pinned role reds. Added the missing pin, derived from
a fresh sandboxed install rather than copied from the resolver, plus a keys-only completeness
assertion reusing the shape already at `test-agent-model-resolver.js:27-31`. Values stay independently
pinned.

**#944 — the Codex role→tier roster now ships.** The routing PIN ordered every spawn at its role's
"existing classification" while no installed Codex *prompt* surface said which roles were in which
tier, so the `medium`/`xhigh` split was unreachable except for `synthesizer`. The roster now renders
from `CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` through a new
`<!-- SLOT:codex-tier-roster -->` into all six Codex SKILL surfaces. Generated, not written: adding a
role to the constants without regenerating reds T19b on all six. **User-ruled** over the two rejected
alternatives — emitting tiers into role TOMLs is foreclosed by the installer's own validator
(`install-codex-agent-profiles.js:736-737`), and hand-written prose would be a 7th uncompared
enumeration.

## Files Changed

38 files, **+920 / −510**. Full diffstat in the branch; by area:

- 4 × `kaola-workflow-resolve-agent-model.js` (byte-identical, `cp`-synced), 5 contract validators
- `scripts/sync-opencode-edition.js`, `templates/routing/slots.js`, both routing skeletons
- 6 regenerated Codex `SKILL.md` surfaces
- tests: `test-opencode-edition.js`, `test-kimi-edition.js`, `test-install-model-rendering.js`,
  `test-route-reachability.js`, `test-generate-routing-surfaces.js`, `test-agent-model-resolver.js`,
  `test-agent-profile-parity.js`
- prose: `agents/synthesizer.md`, 3 × `synthesizer.toml`, 3 × `config/agents.toml`
- docs: `CHANGELOG.md`, `docs/conventions.md`, `docs/opencode-edition.md`,
  `docs/decisions/D-687-01.md`, `docs/decisions/0017-the-mission-list.md`

## Test Coverage

Test custody held throughout: `tdd-guide` authored every test, `implementer` never wrote one, and
`impl-944` reported a fixture collision rather than editing a test file.

- **#941** — band A30 (`test-opencode-edition.js`), an *outcome* check that the advised command
  actually clears what was reported; plus K12 in `test-kimi-edition.js`, armed to red if kimi's
  correct footer is changed in sympathy. Failing baseline: exit 1, 7 failures.
- **#943** — the `investigator` pin (armed: reds under the leg-C coherent re-tier, which was green
  before) and the completeness assertion (armed both directions: a deleted key and a bogus key each
  red).
- **#944** — T19b (`test-route-reachability.js`), surface universe *derived* from the PIN rather than
  listed, so a 7th surface inherits the obligation with no edit. Runs in `test:kaola-workflow:claude`
  at full coverage. Failing baseline: 6 reds.
- **#940** — no new tests; the mechanism's tests fell out with it, after each deleted block was
  checked for a unique non-floor assertion (none had one).

Adversarial verification by a fresh-context `adversarial-verifier` over the whole branch: **all four
claims UPHELD**, nothing refuted. It attacked lines the dispatch named and several it did not — tried
and failed to construct a mismatch set #941 advises wrongly (all 7 mixtures correct), and proved
#944's roster genuinely derived rather than a literal that agrees. It also ran `test-claim-hardening`
(766 assertions) precisely because that suite is full-tier-only and never mandated, and #944 modified
a skeleton it reads.

## Validation

Four chains, serial, **all GREEN and unwaived**: claude 376s/35 steps, codex 8s, gitlab 93s, gitea
93s, plus 11 preamble steps all zero. Scope `all-four` by `edition_coupling`, `changedFileCount: 37`
— the chains demonstrably saw this diff. `codeTreeHash` re-measured after the finalize-phase doc edits
and unchanged, so the receipt is still fresh; the one code-visible doc edit (`CHANGELOG.md`) was
already in the tree when the chains ran.

Coverage caveat stated rather than glossed: the `claude` chain samples the walkthrough at a rotating
1/12 shard, so its green is a sampled green. `impl-940` and the adversarial verifier each ran the
walkthrough independently at **full scope, 209/209**, which covers that gap.

One methodology correction worth recording: the first chain invocation was discarded because it piped
to `tail` and read `${PIPESTATUS[0]}` — a bashism that silently yields `tail`'s status under zsh.
Re-run without a pipe.

## Changed Paths

_(the finalize transaction's finding lands here)_

## Documentation Docking

**DOCKED.** See `.cache/doc-docking.md`. Five documents updated, four checked and left with explicit
no-impact reasons. `docs/api.md` deliberately untouched — its row for the changed script documents
neither flags nor output, and it is test-consumed. `README.md` measured accurate: no role was
re-tiered.

## Run gaps

- manual:vacuous-assertion (7 assertions in `scripts/test-generate-routing-surfaces.js` PASS vacuously when the sandbox is dead): filed: #945
- manual:dead-code (`{INVESTIGATOR_MODEL}` is a dead placeholder): filed: #946
- manual:dangling-reference (the installed Codex skill `kaola-workflow-next/SKILL.md:251-253`): filed: #947
- manual:test-coverage (`A30.SCENARIOS` in `scripts/test-opencode-edition.js` omits the `{WRITE + SOURCE_EDIT}` mixture): filed: #948
- manual:watch-list (nothing asserts that a `sync-opencode-edition.js` mismatch carries a `remedy`): noise: recorded this run as an ADR 0017 watch-list row instead of an issue, per the user's ruling and the ADR's own statement that a permanently-open issue which is explicitly not work is "a standing invitation to schedule it" — no producer exists today, since all 14 classes carry a remedy

## Follow-Up Items

- #945, #946, #947, #948 as above.
- Not a defect, recorded for whoever next syncs: the installed Codex plugin cache is stale at
  v9.5.5/`660fec1d`, so its `DEFAULT_AGENT_MODELS` still predates #935. A reinstall resolves it.
- Not a defect, assessed and dismissed this run: `install-opencode.sh:156-160` encodes the old
  `--check || --write` advice, but `OPENCODE_JSON` is the repo-root file and not part of the tree it
  copies from, and preserve-and-proceed is deliberate — `--adopt-config`, the CONFIG DRIFT banner, a
  drift reporter and a staleness reporter all exist for it.
- No release cut. `[Unreleased]` now carries #935's entry plus this bundle's.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-940-941-942-943-944/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-940-941-942-943-944/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-940-941-942-943-944/.cache/doc-docking.md
- kaola-workflow/archive/bundle-940-941-942-943-944/.cache/doc-updater.md
- kaola-workflow/archive/bundle-940-941-942-943-944/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-940-941-942-943-944/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-940-941-942-943-944/.cache/run-gaps.json
- kaola-workflow/archive/bundle-940-941-942-943-944/finalization-summary.md
- kaola-workflow/archive/bundle-940-941-942-943-944/impl-940.md
- kaola-workflow/archive/bundle-940-941-942-943-944/impl-941.md
- kaola-workflow/archive/bundle-940-941-942-943-944/impl-944.md
- kaola-workflow/archive/bundle-940-941-942-943-944/mission-list.md
- kaola-workflow/archive/bundle-940-941-942-943-944/premise-940.md
- kaola-workflow/archive/bundle-940-941-942-943-944/premise-941.md
- kaola-workflow/archive/bundle-940-941-942-943-944/premise-942.md
- kaola-workflow/archive/bundle-940-941-942-943-944/premise-943.md
- kaola-workflow/archive/bundle-940-941-942-943-944/premise-944.md
- kaola-workflow/archive/bundle-940-941-942-943-944/test-941.md
- kaola-workflow/archive/bundle-940-941-942-943-944/test-943.md
- kaola-workflow/archive/bundle-940-941-942-943-944/test-944.md
- kaola-workflow/archive/bundle-940-941-942-943-944/verify.md
- kaola-workflow/archive/bundle-940-941-942-943-944/workflow-state.md
