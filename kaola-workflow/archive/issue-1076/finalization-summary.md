# Finalization - Summary: issue-1076

## Delivered

Subtracted the eleven audited restatements of already-loaded rules from the Next and Finalize
operation prompts, per the issue's duplication table: project-exception scope clause,
`workflow-state.md` field enumeration, done/frontier resume restatement, "Three writes only" +
immutable-result/one-dispatch sentences, BLOCKED definition, frontier formula, executor/reporting
clause, Finalize readiness/terminal-truth sentence, the duplicate claim/Mission-List read, the
failed-command sentence (Finalize copy only — Next keeps its pinned one), and the follow-up
tautology. Every removal maps to a surviving authority (machine-global contract, dispatch contract,
or earlier text in the same prompt) — `evidence-1076-dedup.md` carries the full table. Consent
blocks, custody/acceptance rules, per-surface stop/all-or-nothing, all 7 standalone script-resolver
blocks, and every behavioral mutation pin are unchanged. Re-measured the README token table and
`docs/prompt-size.md` raw-word table on the final candidate per the documented method and labelled
the baseline `v12.0.1`; restored the `test-issue-1052`-pinned Cursor CLI prep sentences the `4ef4b755`
reorganization had dropped from README (fixed a red main inherited from the documentation commit).

## Files Changed

Authoring: `templates/routing/next.skeleton.md`, `templates/routing/finalize.skeleton.md`,
`templates/routing/required-blocks.js`, `scripts/test-issue-1053-next-task-quality.js`.
Generated: `commands/workflow-next.md`, `commands/kaola-workflow-finalize.md`, 10 plugin
command/skill mirrors, `scripts/fixtures/issue-1055-render-baseline.json` (recaptured per
`--write-baseline` policy).
Docs: `README.md`, `docs/prompt-size.md`, `docs/api.md`, `CHANGELOG.md`,
`docs/decisions/0022-machine-global-workflow-contract.md`.

## Test Coverage

Hand-rolled assert suites (no coverage tooling). Behavioral guards live: all mutation-RED pins
(consent, BLOCKED-remaining, failed-command, `It is not a Mission List item.`, write-moment schema)
verified green after retune. `test-issue-1055` render oracle recaptured under its documented
same-commit baseline policy.

## Validation

- Binding receipt: `node scripts/kaola-workflow-run-chains.js --project issue-1076` — claude/codex/
  gitlab/gitea all exit 0, unwaived; receipt `kaola-workflow/issue-1076/.cache/chain-receipt.json`
  bound headSha `54058d969f9bfb1223d109c92f5e129f7fa07d44` (pushed branch tip), workTreeHash clean,
  completedAt 2026-09-13T07:19:05Z.
- Focused re-runs at `54058d96` family: `generate-routing-surfaces --check` 24/24 byte-match;
  `test-release` 247; `test-generate-routing-surfaces` 480; `test-issue-1055` oracle 5/132;
  `test-issue-1052` 251.
- `npm test` (all 4 chains) at `cc077eeb`: exit 0 — same render bytes as the binding candidate;
  the delta since is docs/version strings only.
- Finalize gate `finalize --check`: ok:true.

## Changed Paths

(from finalize transaction — filled by the check report)

commands/kaola-workflow-finalize.md, commands/workflow-next.md,
plugins/kaola-workflow{,-gitlab,-gitea}/commands/* + skills/* (10 mirrors),
scripts/fixtures/issue-1055-render-baseline.json, scripts/test-issue-1053-next-task-quality.js,
templates/routing/{finalize,next}.skeleton.md, templates/routing/required-blocks.js,
README.md, docs/prompt-size.md, docs/api.md, CHANGELOG.md,
docs/decisions/0022-machine-global-workflow-contract.md

## Documentation Docking

DOCKED — `.cache/doc-docking.md` (one gap found and fixed: the 1052 README pin regression from
`4ef4b755`; token tables re-measured to the final candidate and relabelled v12.0.1).

## Follow-Up Items

- Recorded, not filed: `4ef4b755` on main shipped a README that fails `test-issue-1052`
  (`c4-readme-prep`, `c4-readme-app-cloud`). The fix rides this branch (`cc077eeb`) into main via
  the sink, so no separate issue is opened; Codex was notified through the handoff.

## Closure Decision

All nine audited duplication rows resolved (11 deletions + 10 examined-and-kept with reasons);
issue #1076 acceptance — subtraction per its own table, behavior preserved — is met by the render
oracle + mutation pins + green receipt. #1076 closes at the sink.

## Commit And Push

Branch `workflow/issue-1076` pushed through `54058d96`; sink-merge publishes to mainline and the
v12.0.1 release commit/tag follows on main per the release transaction.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1076/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1076/.cache/doc-docking.md
- kaola-workflow/archive/issue-1076/.cache/mirror-digest.json
- kaola-workflow/archive/issue-1076/evidence-1076-dedup.md
- kaola-workflow/archive/issue-1076/finalization-summary.md
- kaola-workflow/archive/issue-1076/mission-list.md
- kaola-workflow/archive/issue-1076/workflow-state.md
