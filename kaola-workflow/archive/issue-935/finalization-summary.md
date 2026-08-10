# Finalization — Summary: issue-935

Issue #935 — resolve the `build-error-resolver` / `adversarial-verifier` tier divergence **upward** on
every runtime, and delete `install.sh`'s dead model fallback.

The issue was re-scoped before the run: Stage B (moving the Codex standard tier to `gpt-5.6-luna` /
`max`) was dropped by owner ruling, and Stage C was refuted by measurement — the contract assertion it
asked for already existed and was armed at `test-agent-model-resolver.js:58-78`, green because the
divergence was *declared* rather than undetected. Its "land it and observe it fail" step was
unsatisfiable. Stage A survived intact.

## Delivered

- **Both roles now dispatch at the reasoning tier**, stated once and agreed on every surface: the
  reviewer-profile generator's adapter, both agents' source frontmatter, `DEFAULT_AGENT_MODELS` and its
  three edition copies, the README role table, the README model-badge visibility lists, and the
  generated `opencode.json`. `CODEX_PINNED_*_ROLES` were already correct and did not change.
- **`CLASS_DIVERGENCE` deleted, not emptied.** The resolver's contract test now applies one
  unconditional rule to all 14 roles with no declared exceptions.
- **`install.sh`'s `default_agent_model()` removed** — a fourth, drifted copy of the role/tier table.
  `extract_agent_model` is now the sole authority.
- **Two false inline comments corrected** in the resolver (×4 copies): one asserting
  `adversarial-verifier` ships standard, and a pre-existing one asserting a retired wait-budget class
  *and* that Codex children inherit the parent session's pair — false since #925.

Behavioural consequence, intended: Claude resolves both roles to the reasoning tier; Codex moves them
from `gpt-5.6-sol`/`medium` to `gpt-5.6-sol`/`xhigh`; opencode's derived reasoning list grows 5 → 7;
Kimi is unaffected (no tier axis). The per-tier model/effort pairs themselves are unchanged. **This
costs more on every runtime that has a tier** — `adversarial-verifier` is the highest-fan-out role.
Ruled deliberately: correctness before cost.

## Files Changed

14 files. `CHANGELOG.md` · `README.md` · `agents/adversarial-verifier.md` (regenerated, never
hand-edited) · `agents/build-error-resolver.md` · `docs/opencode-edition.md` · `install.sh` ·
`opencode.json` (regenerated) · `scripts/kaola-workflow-resolve-agent-model.js` + its 3 plugin copies ·
`scripts/generate-reviewer-profiles.js` · `scripts/test-agent-model-resolver.js` ·
`scripts/test-install-model-rendering.js`.

Cross-edition byte identity holds: one distinct hash across the four resolver copies (`49e8c1fc`), and
one across the four `kaola-workflow-adaptive-schema.js` copies — the latter correctly **unchanged**,
since the Codex role lists did not move.

## Test Coverage

Test artifacts were authored under custody by an agent that made no production change:

- `test-agent-model-resolver.js` — `CLASS_DIVERGENCE` removed; the surviving unconditional assert
  **mutation-proven armed**: baseline 0; moving one role between the two Codex lists with the map
  untouched → red naming the role; changing one map value with the lists untouched → red. No mutation
  passed.
- `test-install-model-rendering.js` — 14 `sonnet` hits enumerated, 4 stale, fixed, 10 correctly left.
  The render path was traced end-to-end *before* any expectation changed, so the new value is verified
  rather than fitted.

`EXPECTED_ROLE_MODELS` carries an explicit "do not fix a failure here by editing this table to match
the resolver." It was edited anyway, and the call was reviewed by hand and accepted: the prohibition
forbids silencing a failure, not recording a ruling. The prohibition was kept intact, a paragraph naming
the two moved entries and the ruling was added, and the table's provenance sentence — which claimed the
pre-axis-removal resolution — was corrected before it went false.

## Validation

Self-host repo. Four-chain receipt at `.cache/chain-receipt.json`: **all four chains green**
(`claude`, `codex`, `gitlab`, `gitea`, all `exitCode: 0`), **none waived, none accepted-red**.
`scope.decision: all-four` via `reason: edition_coupling`, `changedFileCount: 16`, `base: 660fec1d`.
Finalize's own classification at `--check`: `validation: chains_green`.

Also green: the walkthrough at **full scope, 209/209** (not the rotating shard); opencode (516),
kimi (507) and edition-sync (30) suites; reviewer-profile `--check`; `validate-vendored-agents` (14
agents); `sync-opencode-edition --check` in parity; routing surfaces 18/18.

**Reuse boundary, stated rather than absolutised:** the chains ran after the CHANGELOG landed and after
all code and test-consumed prose was final. The finalize-phase documentation pass changed **no file**,
so nothing edited the tree after the receipt was written.

**An error worth recording:** the first full-scope walkthrough ran from the *main* checkout, because cwd
resets between shell calls and main still held the pre-change tree. It reported 209/209 and proved
nothing. Caught by confirming main still read `'build-error-resolver': 'sonnet'`, then re-run inside the
worktree with `pwd` and an `opus` grep as preconditions.

**For the eventual release:** this receipt's `headSha` is the pre-implementation commit and the tree was
uncommitted when it ran, so it does **not** satisfy the pre-tag gate. A release must re-run the chains at
the release commit.

## Changed Paths

Recorded on the finalize envelope and reproduced by the transaction. The 14 paths above are the whole
diff; nothing outside the tier surfaces, `install.sh`, and their two test artifacts moved.

## Documentation Docking

**DOCKED** — `.cache/doc-docking.md`. Seven gaps found and fixed, including two the issue had not
anticipated: README's model-badge visibility block sorts all 14 roles by dispatched tier, and
`docs/opencode-edition.md` had a wrong *count* on `:122` **and** a wrong *list* on `:123` — fixing the
numeral alone would have shipped a correct count above a wrong list.

`docs/api.md` and `docs/architecture.md` verified as needing no change: both describe the tier→pair
mapping, which is unchanged, never role→tier membership. `docs/api.md` is test-consumed, so leaving it
untouched is also what keeps the receipt valid. Historical records under `kaola-workflow/archive/**`,
`docs/investigations/**`, `docs/audits/` and `kaola-workflow/.origin/**` were deliberately left —
editing them would falsify a point-in-time record.

## Run gaps

- manual:dead-mechanism (The reasoning floor is enforced for no role): filed: #940
- manual:misleading-remediation (prints an unconditional `--check` footer advising `--write`): filed: #941
- manual:coverage-overstated (materializes the `.opencode-gitlab`/`.opencode-gitea` trees as it runs): filed: #942
- manual:unpinned-role (holds 13 of 14 roles): filed: #943
- manual:deferred-verification (cannot run from the worktree): noise: not a defect but this issue's own A10, and the reason #935 is being KEPT OPEN rather than closed; filing it separately would split the verification away from the change it verifies.

The most consequential is **#940**: `--enforce-floor` has zero production consumers, so the reasoning
floor is enforced for no role at all, `synthesizer` included. A7's claim that "no new refusal path
appears" held partly because there is no live refusal path to add one to.

A7 was also **refuted as worded**. "Nothing keys on tier" is false — `sync-opencode-edition.js:146`,
`install.sh`'s finalize-block rendering, and the Codex per-spawn tier→effort mapping all key on it.
Only "nothing *gates* on tier" survives, and the CHANGELOG was written to claim only that.

## Follow-Up Items

- **#935 stays OPEN** pending A10: reinstall all four runtimes, then read the effective model and
  effort back from a live spawn per runtime — Claude at the reasoning tier, Codex at
  `gpt-5.6-sol`/`xhigh` — rather than inferring them from the authored files.
  **Known trap:** `install-opencode.sh` *preserves* an existing user `opencode.json`, so the installed
  copy will keep the stale 5-role scaffold unless `--adopt-config` is passed. Check it explicitly.
- #940, #941, #942, #943 as filed above.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-935/.cache/chain-receipt.json
- kaola-workflow/archive/issue-935/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-935/.cache/doc-docking.md
- kaola-workflow/archive/issue-935/.cache/doc-updater.md
- kaola-workflow/archive/issue-935/.cache/item1-tier-flip.md
- kaola-workflow/archive/issue-935/.cache/item2-opencode.md
- kaola-workflow/archive/issue-935/.cache/item4-install-fallback.md
- kaola-workflow/archive/issue-935/.cache/item5-9-test-custody.md
- kaola-workflow/archive/issue-935/.cache/item6-no-refusal-path.md
- kaola-workflow/archive/issue-935/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-935/.cache/run-gaps-manual.md
- kaola-workflow/archive/issue-935/.cache/run-gaps.json
- kaola-workflow/archive/issue-935/finalization-summary.md
- kaola-workflow/archive/issue-935/mission-list.md
- kaola-workflow/archive/issue-935/workflow-state.md
