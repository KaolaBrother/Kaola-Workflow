# Adaptive Workflow Plan — bundle-540-541

<!-- plan_hash: 615660ace70b93c4525f8d4dfc1069cdc99c4daf95c4e5f05f1c3ccfe471e897 -->

opencode/cross-edition follow-ups filed by #539's finalization-summary, authored as one
same-scope bundle. **#540** (opencode-only, enhancement) purges the remaining stale inline
`(Step 0a-1)` references from the GENERATED `.opencode/command/workflow-next.md` by extending
the opencode-only strip-transform in `scripts/sync-opencode-edition.js`. **#541** (canonical
cross-edition, bug) forwards `--base` (sourced the same way `cmdFinalize` already forwards it
to `--finalize-check`) to the whole-plan `--barrier-check` call in the finalize command + its
codex/forge twins, so shared/multi-issue-branch finalization passes BOTH gates end-to-end.
The two issues are **file-disjoint at top-level-directory granularity** (#540 writes
`scripts/` + `.opencode/`; #541 writes `commands/` + `plugins/`), so they are a genuine
parallel antichain — not the serial chain #539 was forced into by its shared `scripts/` lane.

## Meta

labels: enhancement, area:workflow-router, bug, area:scripts

### Parallel antichain design — D-419-01 (existing)

`n1` and `n2` declare write sets whose top-level directories are disjoint
(`scripts/`,`.opencode/` vs `commands/`,`plugins/`), so the validator derives
`parallel_safe` and the scheduler overlaps them on the ready frontier. No dep edge is added
between them — serializing independent disjoint work would add its full duration to the
makespan for no benefit. `n3-code-review` is the join gate over both, then `n4-doc-update`
writes CHANGELOG, then the unique `n5-finalize` sink.

### #540 — opencode inline-ref purge (n1, tdd-guide, opencode ADDITIVE → no #307)

Per D-530-02 (existing) the opencode edition is an ADDITIVE runtime edition, NOT a forge: it is not wired
into `npm test`, `edition-sync.js`, `install.sh`, or the SIX routing surfaces. An opencode-only
diff therefore triggers **NO #307 four-chain obligation**. The stale inline `(Step 0a-1)`
residue (3 occurrences, `.opencode/command/workflow-next.md` ~L72/L159/L464) is the leftover
from #539's opencode path-flip (mechanism B); the `switch-OFF` / `KAOLA_ENABLE_ADAPTIVE` refs
were already purged by a prior rebase-regeneration. **tdd-guide**: write the failing assertion
FIRST in `scripts/test-opencode-edition.js` (generated `workflow-next.md` must contain no
`(Step 0a-1)`), then extend the opencode-only strip-transform in
`scripts/sync-opencode-edition.js` to purge those inline refs, then regenerate
`.opencode/command/workflow-next.md` so the assertion goes GREEN. **NO canonical
`commands/*.md` touch** — the purge is opencode-only. Verify with
`node scripts/test-opencode-edition.js` + `node scripts/sync-opencode-edition.js --check`
(drift-free). `#306` symbol-scope: the `(Step 0a-1)` token appears ONLY in
`.opencode/command/workflow-next.md` across the opencode tree, so the regenerated write set is
exactly that one file plus the transform + test.

### #541 — forward `--base` to the whole-plan `--barrier-check` (n2, implementer, #307 four-chain)

The whole-plan `--barrier-check` is invoked as `node "$VALIDATOR" "$PLAN" --barrier-check --json`
in the finalize command prose (canonical `commands/kaola-workflow-finalize.md` ~L37) and its
codex/forge twins. The validator's `--barrier-check` already ACCEPTS `--base`
(`scripts/kaola-workflow-plan-validator.js:2161`, default `origin/main`), but the finalize
prose does not forward it, so on a shared/multi-issue branch the whole-plan barrier diffs
`main...HEAD` and refuses `foreign_archive` (prior issues' archived folders sweep in). This is
a **canonical `commands/*.md` edit propagating to the codex/gitlab/gitea twins → it DOES carry
the #307 four-chain obligation** (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`,
run sequentially — a green claude chain alone is insufficient evidence).

`#306` symbol-scope determined the EXACT 4 surfaces that hold the `--barrier-check` call: the
canonical Claude GitHub command, the github-Codex finalize `SKILL.md`, and the GitLab/Gitea
Claude commands. The GitLab/Gitea finalize **SKILL twins are excluded** — they have NO adaptive
barrier branch (the forge editions expose adaptive via their `commands/kaola-workflow-finalize.md`,
per the #285 codex-barrier work). Source `--base` the same way `cmdFinalize` already does for
`--finalize-check` (a `--base <ref>` flag and/or `KAOLA_FINALIZE_BASE` env, **default unset →
byte-equivalent current behavior** for the branch-per-issue case). **implementer /
non_tdd_reason**: command-prose flag-forwarding (bash-in-markdown) across 4 edition mirrors is
integration glue/wiring — the `--base` acceptance logic already lives in `plan-validator.js`
(shipped); there is no isolated behavioral unit under test. Verified by the four npm chains
(cross-edition consistency) + the opus code-review.

### Security-adjacent review (n3, opus) — per #539 precedent

#539's companion finalize-`--base` work was reviewed with security-adjacent scrutiny; #541 is
the same class (it alters how a security gate — the anti-laundering whole-plan barrier — is
invoked). The single opus `code-reviewer` join explicitly verifies, for #541: (a) the
default-unset path is byte-equivalent (no weakening of the barrier for branch-per-issue), (b)
`--base` is forwarded to `--barrier-check` identically across all 4 surfaces (no cross-edition
drift — the #254 parity-defect class), and (c) the forwarding cannot launder an undeclared
write past the per-node barrier (which REJECTS `--base`). For #540: (d) the strip-transform
touches NO canonical `commands/*.md` (opencode-only, additive) and strips exactly the stale
`(Step 0a-1)` residue without over-stripping live adaptive prose. No `security` label is
present on either issue → G2 is not machine-triggered; the security-adjacent verification is
folded into the opus code-review (matching #539, which used no separate security-reviewer).

### Shared-branch finalization note (affects n5, not the DAG shape)

This bundle runs and finalizes on the SHARED multi-issue branch `feature/opencode-support`
(current HEAD, carrying #539's already-committed + archived work). At finalization the
whole-plan `--barrier-check` will see `kaola-workflow/archive/issue-539/` as foreign unless the
base is scoped. **#541's own fix lands first** (n2 edits the finalize command; n5 runs the
updated prose), so the orchestrator/contractor MUST pass `--base` (e.g. `--base HEAD` or
`KAOLA_FINALIZE_BASE=HEAD`) at finalize so this bundle's barrier passes end-to-end — exactly
the capability #541 adds. (For #539 the orchestrator passed `--base HEAD` manually; #541 bakes
that into the command.)

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-purge-opencode-refs | tdd-guide | — | scripts/sync-opencode-edition.js, .opencode/command/workflow-next.md, scripts/test-opencode-edition.js | 3 | sequence | sonnet |
| n2-forward-barrier-base | implementer | — | commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, .opencode/command/kaola-workflow-finalize.md | 5 | sequence | sonnet |
| n3-code-review | code-reviewer | n1-purge-opencode-refs, n2-forward-barrier-base | — | 1 | sequence | opus |
| n4-doc-update | doc-updater | n3-code-review | CHANGELOG.md | 1 | sequence | sonnet |
| n5-finalize | finalize | n4-doc-update | kaola-workflow/bundle-540-541/workflow-state.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-purge-opencode-refs | complete |
| n2-forward-barrier-base | complete |
| n3-code-review | complete |
| n4-doc-update | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-purge-opencode-refs) | subagent-invoked | evidence-binding: n1-purge-opencode-refs fd53d8031139 | |
| implementer (n2-forward-barrier-base) | subagent-invoked | evidence-binding: n2-forward-barrier-base a59fea4781a8 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-code-review 6122cb39bbdf | |
| doc-updater (n4-doc-update) | subagent-invoked | evidence-binding: n4-doc-update 863d77d2e671 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 8ef3c23fd0a0 | |
