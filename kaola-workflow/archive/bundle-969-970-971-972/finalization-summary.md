# Finalization — Summary: bundle-969-970-971-972

Closes #969, #970, #971, #972 — the entire open backlog at claim time. Reviewers ran on the Fable
model, as the user directed.

## Delivered

**#969 — a sync from a linked worktree now writes the main checkout's edition trees.** Canonical
sources resolve to the invoking checkout; the generated tree resolves to the main checkout; where no
main checkout resolves — an unpacked tarball, which is how a consumer installs — the tree belongs
beside the script. The mandated `generate-routing-surfaces.js --write` additionally refreshes every
edition tree that already exists and creates none. `--check` is deliberately unchanged.

*The filed wording asked that a skeleton edit "cannot reach a green four-chain receipt while an
edition tree still carries the old prose". That is NOT literally what shipped, and the deviation is
the user's explicit ruling, not a shortfall.* Measurement showed the literal reading was unreachable:
a bare check reds every fresh clone and every worktree, and a presence-gated one is inert in the
worktree where the receipt is made — a guard that cannot fail. The alternative would have reversed a
recorded ruling and the rule at `CLAUDE.md:181`. The stale state is instead made unreachable in main.
**That cost was then observed live**: the kimi finalize surface was found stale by three changes at
finalize while `--check` reported all 18 tracked surfaces byte-matching at exit 0. Nothing reds; the
editions suite is what catches it, and it did.

**#970 — finalize reports a run record that contradicts itself.** Envelope key `mission_list`,
durable `## Mission List`, naming the count and the offending `item:` line numbers. Reports and never
refuses. The condition is outcome-present-and-status-not-`done`, never status-is-`in-flight`.
Measured over all 36 archived records: **34 items across 11 of them**, out of 445 items.

**#971 — the run-gap sweep resolves the run folder against the tree that holds it**, in both modes.
The filed issue described a confusing message; the real defect was worse and was fixed instead: a
scanner re-run from the worktree turned a loud red into a **silent green** that certified nothing.
Finalize Step 9's sink-metadata capture carried the same defect and was fixed with it — `SINK_BRANCH`
bound empty from a worktree and was consumed by the sink.

**#972 — `install-all.sh` decides Codex currency on version OR content.** Compared against the
directory the plugin row states it is installed from — never the invoking tree, and never a path
reconstructed by assuming a marketplace's layout — gated to local marketplaces. An unanswerable
comparison is reported as PARTIAL rather than a bare PASS.

*The filed wording said "differs from the tree". The oracle is the plugin's stated source instead,
and that deviation is deliberate:* comparing against the invoking tree lets the wrapper demand a
refresh the refresh mechanism cannot satisfy. That loop was observed, not argued — remove+add
reissued on a second invocation with `codex FAIL` both times.

**Not filed, delivered anyway — both edition installers.** Once the tree moved to main, they still
deployed from beside themselves. opencode failed loudly; **kimi exited 0 having deployed zero
skills.** That silent empty install is why an earlier decision to accept the consequence was
reversed. Both now take their source tree from the generator, verified at 14 agents + 3 commands and
17 skills from both postures. This also repaired a validation step that had gone red in the interim:
`test-install-adaptive-config.js` runs the real opencode installer and is a literal claude-chain step.

## Files Changed

38 tracked files. Production: `install-all.sh`, `install-opencode.sh`, `install-kimi.sh`,
`kaola-workflow-claim.js` ×4, `kaola-workflow-gap-sweep.js` ×4, `sync-opencode-edition.js`,
`sync-kimi-edition.js`, `generate-routing-surfaces.js`, `validate-workflow-contracts.js` ×2,
`templates/routing/finalize.skeleton.md`, `templates/routing/required-blocks.js`, 6 regenerated
routing surfaces. Docs: `README.md`, `docs/api.md`, `docs/architecture.md`,
`docs/workflow-state-contract.md`, `docs/conventions.md`, `docs/opencode-edition.md`,
`docs/kimi-edition.md`, `CHANGELOG.md`. Tests: `test-gap-sweep.js`, `test-install-all.js`,
`test-opencode-edition.js`, `test-kimi-edition.js`, `test-bash-block-guards.js`,
`simulate-workflow-walkthrough.js`.

## Test Coverage

Authored under test custody — `tdd-guide` held every test artifact, implementers never wrote one.
Every guard landed RED on the baseline first, and each was mutation-proven armed rather than assumed.

- walkthrough `testFinalizeReportsMissionListOutcomeWithoutDone` — 3 legs, negative control green on
  baseline, 8 simulated wrong readings each redding the assertion they should. 209 → 210 scenarios.
- `test-gap-sweep.js` 127 → 151 — pins the **silent green** as the primary assertion, not the error
  string, plus armed `KAOLA_GAP_ROOT` precedence against a third tree.
- `test-bash-block-guards.js` 7 → 49 — executes Step 9 from all six *rendered* surfaces, both cwds.
- `test-install-all.js` 131 → 254 — stub grew a content dimension; every negative control
  mutation-proven, and re-armed against the SHIPPED bytes after the implementation landed.
- `test-opencode-edition.js` 570 → 631, `test-kimi-edition.js` 528 → 589 — worktree/main root, the
  regenerate step, and the bare-repo/submodule placement. Both suites now run from **both** postures.

One pin was **removed rather than rewritten**: the verbatim `SINK_STATE_FILE` literal in
`validate-workflow-contracts.js` froze the one token that had to change, and the two valid fix shapes
share no text, so any substring check must reject one of them. Its coverage was mutation-proven to
survive in the executable replacement, which reaches six surfaces where the old pin reached one.

## Validation

*(the finalize transaction appends its own finding below — do not rewrite it)*

Self-host. Chain receipt at `.cache/chain-receipt.json`, produced from the worktree AFTER the last
write, because `docs/api.md` and `docs/workflow-state-contract.md` are test-consumed and move the
code-tree hash.

**All four chains exit 0**, `accepted_red: false`, no timeouts, no signals — claude 366s, codex 6s,
gitlab 86s, gitea 85s. Scope resolved **all-four** on `edition_coupling` over 38 changed files.
Full walkthrough re-run at FULL scope: **210/210, exit 0** (real exit code, not a piped one).
Editions suites, which no chain runs: opencode **631**, kimi **589**, both exit 0, all six trees in
parity.

The receipt still binds: the code-tree hash after the last regenerate is byte-identical to the one
recorded in the receipt.

## Changed Paths

*(the finalize transaction appends its own finding below — do not rewrite it)*

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. Two gaps were real fixes rather than additions:
`docs/architecture.md:299` was **false**, not incomplete, and the additive-edition boundary sentence
was ambiguous in the one direction that matters. Five suspected README locations were checked and
verified not-stale with stated reasons.

## Run gaps

- manual:installer-destructive-prune (install-kimi.sh copy_skills prunes the deployed skill directories BEFORE copying): filed: #973
- manual:gap-sweep-pollution-residue (a tree already polluted by the pre-fix bug's stray kaola-workflow/<project>/ folder still false-greens): filed: #974
- manual:fixture-escaped-sandbox (a self-referential symlink plugins/plugins -> plugins was created inside the provisioned worktree): filed: #975

**#973** — an install that deploys nothing still removes what was there. Pre-existing; the mutation
repro took a target from 17 skills to 0. This bundle made an existing SILENT loss loud.

**#974** — residue of #971, byte-identical pre/post fix: the fix prevents NEW pollution and detects
no OLD pollution, so a tree a pre-fix run already polluted still takes the vacuous-pass branch.

**#975** — the artifact survived a full four-chain run and appears in the receipt's own
`touchedEditionPaths`; nothing detected it. Removed by hand at finalize.

## Follow-Up Items

- **Accepted, not fixed (#970 R3):** column-0 prose at the front of a line can fake an outcome or
  suppress one under last-wins. Constructed only — **zero** instances across all 36 archived records.
  Accepting it is a recorded decision, not an oversight.
- **Coverage deliberately not pinned (#972):** the `--check` row's wording under the worktree shape,
  and a forge edition combined with a marketplace source that differs from the invoking tree.
- **Post-merge:** main's six edition trees currently carry this branch's prose rather than main's,
  which is the designed cost of the #969 rule. The merge resolves it; the reinstall verifies it.
- A false claim in `impl-971.md` is corrected here rather than in the file: a worktree scan does
  **not** miss `project_archived` for tracked archives — the refusal fires. Measured.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Mission List

items: 22
carrying an outcome while their status is not `done`: 0

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-969-970-971-972/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-969-970-971-972/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-969-970-971-972/.cache/doc-docking.md
- kaola-workflow/archive/bundle-969-970-971-972/.cache/doc-updater.md
- kaola-workflow/archive/bundle-969-970-971-972/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-969-970-971-972/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-969-970-971-972/.cache/run-gaps.json
- kaola-workflow/archive/bundle-969-970-971-972/finalization-summary.md
- kaola-workflow/archive/bundle-969-970-971-972/impl-969.md
- kaola-workflow/archive/bundle-969-970-971-972/impl-970.md
- kaola-workflow/archive/bundle-969-970-971-972/impl-971.md
- kaola-workflow/archive/bundle-969-970-971-972/impl-972.md
- kaola-workflow/archive/bundle-969-970-971-972/impl-docs.md
- kaola-workflow/archive/bundle-969-970-971-972/impl-installers.md
- kaola-workflow/archive/bundle-969-970-971-972/mission-list.md
- kaola-workflow/archive/bundle-969-970-971-972/premise-969.md
- kaola-workflow/archive/bundle-969-970-971-972/premise-970.md
- kaola-workflow/archive/bundle-969-970-971-972/premise-971.md
- kaola-workflow/archive/bundle-969-970-971-972/premise-972.md
- kaola-workflow/archive/bundle-969-970-971-972/review-969.md
- kaola-workflow/archive/bundle-969-970-971-972/review-970.md
- kaola-workflow/archive/bundle-969-970-971-972/review-971.md
- kaola-workflow/archive/bundle-969-970-971-972/review-972.md
- kaola-workflow/archive/bundle-969-970-971-972/tests-969.md
- kaola-workflow/archive/bundle-969-970-971-972/tests-970.md
- kaola-workflow/archive/bundle-969-970-971-972/tests-971.md
- kaola-workflow/archive/bundle-969-970-971-972/tests-972.md
- kaola-workflow/archive/bundle-969-970-971-972/workflow-state.md
