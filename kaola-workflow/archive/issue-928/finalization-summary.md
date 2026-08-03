# Finalization — Summary: issue-928

Issue #928 — *`dispatchEffort` is exported from the x4 anchor with no production consumer, keeping
`normalizeTier` alive behind it*. Implementation commit `73f49bf4` on `workflow/issue-928`.

## Delivered

The issue asked one deciding question — whether `dispatchEffort` has a live consumer on the **Codex**
side, in prose the JS grep could not see — and made the cut conditional on the answer.

**The answer is no, and it was measured, not assumed.** `codex_reasoning_effort` appears in exactly
five tracked files: the four byte-identical schema copies and one test. Zero hits in `commands/`,
`agents/`, `skills/`, `templates/routing/` or any edition's prompt surfaces. The #880 precedent that
kept `mapTier` alive — shipped documentation naming it as the live mechanism — therefore has no
counterpart here, and there was no entanglement to record instead of cutting.

Deleted from all four copies of `kaola-workflow-adaptive-schema.js`: `dispatchEffort` (and its export
entry), `normalizeTier`, `NODE_MODEL_TIERS`, `TIER_ALIASES`.

**The cut went wider than the issue named, by explicit user ruling taken in conversation.** #928 named
two symbols; removing only those would have left `NODE_MODEL_TIERS` and `TIER_ALIASES` with zero
readers — the same defect one level down. The whole closed loop went instead.

Two findings beyond the filed scope:

- **`dispatchEffort` was inert, not merely unused.** It computed a tier via `normalizeTier` and never
  used the value; only its truthiness picked between the `parent_session` and `role_default` source
  labels, while the model and effort came wholly from the session proof. Its one test called it with
  no proof, so it asserted null against null.
- **A stale comment left with the constant it described.** The schema claimed the tier list was
  defined there "so the validator, the executor, and every edition share one list." Nothing outside
  `normalizeTier` had read it for some time — the same rot the file warns about eight lines below.

Two premise corrections against the issue text, both recorded rather than quietly absorbed:

- `normalizeTier` has **one** call site, not the "exactly two" filed — and it is inside
  `dispatchEffort`. The loop is tighter than reported, which strengthens the case.
- `dispatchEffort` is defined at `:102`; `:1616` cited in the issue is its export entry.

The tier vocabulary itself is untouched: the lowercase `opus`/`sonnet` tokens are still carried by the
resolver's `DEFAULT_AGENT_MODELS` and the agent frontmatter it is pinned against.
`kaola-workflow-resolve-agent-model.js` — which always inlined its own alias check so the
subagent-dispatch-log hook can copy it standalone — is now the only alias-resolution seam rather than
a mirror of one.

## Files Changed

13 files, +29 / −255.

| File | Change |
|---|---|
| `scripts/kaola-workflow-adaptive-schema.js` ×4 (incl. 3 plugin mirrors) | the four symbols and the export entry deleted; all four remain byte-identical |
| `scripts/kaola-workflow-resolve-agent-model.js` ×4 | comment only — now states it IS the alias seam, keeps the dependency-free rationale |
| `scripts/validate-workflow-contracts.js` ×2 | comment only — cites live carriers instead of the deleted `TIER_ALIASES` |
| `scripts/test-agent-model-resolver.js` | 5 `dispatchEffort` assertions deleted with the mechanism; the "asserted below" parenthetical removed |
| `scripts/test-opencode-edition.js` | comment only — no longer cites `NODE_MODEL_TIERS` |
| `CHANGELOG.md` | new `## [Unreleased]` / `### Removed` entry |

## Test Coverage

A test is deleted **with** its mechanism, never repaired ahead of it. The five removed lines asserted
only `dispatchEffort`'s return shape; the bidirectional `CLASS_DIVERGENCE` assertions and the
`INSTALL-INVARIANT TIER` block around them are untouched and still fire. Nothing was rewritten to keep
passing, and no field was re-added to satisfy a test.

- **Walkthrough at FULL scope** — `scenarios: 202, ran: 202, passed: 202, failed: 0` at shard `1/1`,
  2145 spawns, exit 0. Not the fast gate's rotating 1/12 sample.
- **Touched suites, all chain-wired** — `test-agent-model-resolver.js` and
  `validate-workflow-contracts.js` run in the `claude` chain; `test-opencode-edition.js` runs in
  `test:kaola-workflow:editions`. All exit 0.
- **Require-time smoke, all four editions** — module loads, export count 52 (was 53), none of the four
  names present, survivors `CODEX_PINNED_*_ROLES` / `PLAN_FILE` / `MISSION_LIST_FILE` still exported.
- **`generate-routing-surfaces.js --check`** — all 18 surfaces byte-match the skeleton.

**Adversarial pass found no defect in the diff.** Beyond the planned checks: no `docs/api.md` entry or
test pins the export count or an export list, so dropping an export breaks no snapshot; and there is
**no dynamic `schema[...]` access and no `Object.keys/entries` iteration over the module anywhere** —
which is what makes the static name-sweep a complete measurement of consumers rather than a hypothesis.

**Positive control against a vacuous green.** The receipt's `headSha` is `9e308348`, the pre-change
base — exactly the shape that would appear if the chains had tested main's untouched copy instead of
the worktree. Refuted directly: main's tree is clean and still contains `dispatchEffort`, while the
worktree carried exactly 13 modified files, matching the receipt's own `changedFileCount: 13` whose
`touchedEditionPaths` name the modified files. The chains ran against the modified tree.

## Validation

## Changed Paths

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`.

`CHANGELOG.md` was the only edit owed, and it was authored **before** the chain-receipt run so the
receipt is not staled by documentation; confirmed afterwards by `finalize --check` reporting
`validation: chains_green`. `docs/api.md`, `README.md`, `docs/architecture.md`,
`docs/opencode-edition.md` and `docs/conventions.md` all carry an explicit no-impact reason: measured,
none of them names any of the four symbols. The deleted function was unreachable from every documented
surface — which is the same measurement that settled the issue.

## Run gaps

None. `kaola-workflow-gap-sweep.js` reports `sweptClasses: []`.

One candidate was measured and **refuted rather than filed**: the surviving `CODEX_PINNED_*_ROLES`
looked like the same dead-export class, but they have real production consumers —
`install-codex-agent-profiles.js:733` and `kaola-workflow-codex-preflight.js:1705` both branch on
them, and the per-forge contract validators pin the schema copy against the installer and preflight
copies. They are load-bearing, so the cut was correctly scoped and there is no follow-up here.

## Follow-Up Items

None blocking.

One standing operational fact, not a defect and not fixable from this branch: the **installed** copies
still carry the deleted symbols — `~/.claude/kaola-workflow/scripts/`,
`~/.config/opencode/kaola-workflow/scripts/`, and the Codex plugin cache at `.../kaola-workflow/7.5.0/`.
Installed surfaces lag the repo by design until reinstall, so the routine `./install-all.sh --global
--yes` after this merges is what drops the dead code from the shipped surfaces.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-928/.cache/chain-receipt.json
- kaola-workflow/archive/issue-928/.cache/doc-docking.md
- kaola-workflow/archive/issue-928/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-928/.cache/run-gaps.json
- kaola-workflow/archive/issue-928/finalization-summary.md
- kaola-workflow/archive/issue-928/mission-list.md
- kaola-workflow/archive/issue-928/workflow-state.md
