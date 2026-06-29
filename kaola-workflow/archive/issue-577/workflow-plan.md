# Workflow Plan — issue 577

<!-- plan_hash: 0dae33c7a7398059b248f4e6cb568a90e482cdf47e852ade83a8dad88b790fc4 -->

## Meta
labels: bug, area:scripts
validation_command: node scripts/test-opencode-edition.js

## Plan Notes

**Goal (577).** `.opencode/plugins/kaola-workflow-hooks.js` (the opencode-edition hook adapter) has
**no tracked source anywhere** and is **not generated** by `sync-opencode-edition.js`. It exists only
as an untracked, gitignored artifact in an already-installed tree. A clean checkout / fresh git
worktree cannot reproduce it, with two verified consequences:
1. **Install bug** — `install-opencode.sh:170` deploys the plugin by copying from the repo's OWN
   `$SCRIPT_DIR/.opencode/plugins/*.js` with `2>/dev/null || true`, a self-referential copy that
   silently no-ops when that dir is empty (the fresh-clone case) → an opencode install with no hooks.
2. **Test bug** — `scripts/test-opencode-edition.js` assertions **A11 / P1 / G1 / H1** fail in any
   clean checkout or fresh git worktree (A11/H1 read `REPO/.opencode/plugins/kaola-workflow-hooks.js`
   directly; P1/G1 install it into temp dirs). They pass only on an installed repo, masking the gap.

**Scope is single-edition (opencode only) — D-530-02 (existing).** Verified at authoring: the four
`npm` chains do NOT reference any opencode file; `scripts/sync-opencode-edition.js` /
`scripts/test-opencode-edition.js` are NOT mirrored into the plugin editions; `validate-script-sync.js`
and `edition-sync.js` do not touch opencode. So this diff triggers **no #307 four-chain obligation**;
its gate is the opencode suite (`node scripts/test-opencode-edition.js`), recorded as
`validation_command`. The decisive proof is that the executor runs in a **fresh git worktree**
(`.kw/worktrees/issue-577/`) where `.opencode/plugins/` is absent (gitignored + untracked) — exactly
the bug's failing environment — so a green opencode suite there, from tracked sources alone (no manual
seeding), IS the falsification oracle.

**Canonical spec (settled by the issue diagnosis + authoring investigation — implementer carries it out).**
The fix tracks a canonical source OUTSIDE the gitignored `.opencode/` tree and threads it through
sync + install + test:
- **Tracked source:** `templates/opencode/plugins/kaola-workflow-hooks.js` (verified NOT gitignored).
  Its content is the current live `.opencode/plugins/kaola-workflow-hooks.js`, moved/copied
  byte-for-byte so the deployed adapter is unchanged.
- **`scripts/sync-opencode-edition.js`:** add a `writePlugin()` step mirroring the existing
  `writeHooks()` byte-copy (`HOOK_SCRIPTS`): byte-copy `templates/opencode/plugins/*.js` →
  `.opencode/plugins/`, invoke it from `--write`, and assert it in `--check` (a missing/drifted
  regenerated plugin is a parity failure).
- **`install-opencode.sh`:** source the plugin from the tracked `$SCRIPT_DIR/templates/opencode/plugins/`
  (NOT the self-referential `$SCRIPT_DIR/.opencode/plugins/`) and **drop the silent `2>/dev/null || true`**
  so a missing plugin is a loud install error, not a silent no-op. Preserve the existing self-dev guard
  (`-ef`) semantics for the agent/command/hooks copies.
- **`scripts/test-opencode-edition.js`:** self-provision via `sync --write` (regenerate
  `.opencode/plugins/` from the tracked template) before A11/H1 so the suite is green from tracked
  sources in a clean worktree; keep P1/G1 (they run `install-opencode.sh`, which now deploys from the
  tracked source). Add an assertion that the tracked canonical source EXISTS and that the regenerated
  `.opencode/plugins/kaola-workflow-hooks.js` is byte-identical to it (so the gap cannot silently
  reopen). `.opencode/plugins/kaola-workflow-hooks.js` itself stays gitignored and is therefore NOT in
  any write set — only the tracked `templates/...` source and the three threading scripts are.

**Why ONE implement node.** The tracked source, the sync regeneration, the install deploy path, and the
test self-provisioning all agree on the SAME canonical-source path and byte-copy semantics — a single
cohesive change. Splitting them would risk divergence on the path/semantics with no genuine independence
to gain. The opencode suite (A11/P1/G1/H1) failing in the worktree is the RED; the fix is the GREEN — a
genuine `tdd-guide` cycle, strengthened by the new "tracked source is byte-identical to the regenerated
artifact" assertion.

**Accuracy gate (precedence #1).** n3 `code-reviewer` (opus) post-dominates the code-producing node and
runs the recorded `validation_command` (`node scripts/test-opencode-edition.js`) **in the fresh
worktree** — the hard, falsifiable proof that a clean tree now self-provisions a green opencode suite
from tracked sources, with no manual `.opencode/` seeding. A full `npm test` is a no-op on this diff
(no opencode file is in the four chains), so the opencode suite is the real gate. No `adversarial-verifier`
node: the suite-in-a-clean-worktree IS the external oracle, not a judgment call.

**Decision record.** `docs/decisions/D-577-01.md` is the next free number for this issue. It records the
new convention: the opencode hook-adapter plugin has a tracked canonical source under
`templates/opencode/plugins/`, regenerated by `sync-opencode-edition.js` and deployed by
`install-opencode.sh` (no self-referential `.opencode/` copy). The only pre-existing opencode-edition
records are `D-530-01 (existing)`/`D-530-02 (existing)`. `docs/opencode-edition.md` documents the
canonical-source + regeneration path. Neither doc is read by `test-opencode-edition.js` (it references
`docs/conventions.md` only as a failure-message string), so no `validation_test_consumes` entry is
needed and the doc node's timing is suite-neutral.

**Acceptance mapping.** AC1 (fresh-clone `install-opencode.sh` deploys the hooks plugin; missing plugin
is a loud error) → n1 install fix. AC2 (A11/P1/G1/H1 green in a clean worktree from tracked sources) →
n1 source + sync + test self-provision, verified by n3. AC3 (canonical source tracked + regenerable +
byte-identical) → n1 source + sync `writePlugin`/`--check` + the new test assertion. AC4 (docs +
`D-577-01`) → n2.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-opencode-plugin-source | tdd-guide | — | templates/opencode/plugins/kaola-workflow-hooks.js, scripts/sync-opencode-edition.js, install-opencode.sh, scripts/test-opencode-edition.js | 4 | sequence | sonnet | — |
| n2-docs | doc-updater | n1-opencode-plugin-source | docs/opencode-edition.md, docs/decisions/D-577-01.md | 2 | sequence | sonnet | — |
| n3-review | code-reviewer | n2-docs | — | 1 | sequence | opus | — |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-opencode-plugin-source | complete |
| n2-docs | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-opencode-plugin-source) | subagent-invoked | evidence-binding: n1-opencode-plugin-source eeb29e4e9e6f | |
| doc-updater (n2-docs) | subagent-invoked | evidence-binding: n2-docs f5d06a00c10b | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 71344f2d050f | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize d485308900b8 | |
