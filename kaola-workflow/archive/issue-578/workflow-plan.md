# Workflow Plan — issue 578

<!-- plan_hash: d06a2f15eac288c68367d367b97b9bf016d68a525114c54d8be6188ba8c64491 -->

## Meta
labels: enhancement, area:scripts
validation_command: node scripts/test-opencode-edition.js

## Plan Notes

**Goal (578).** Two consumers of `templates/opencode/plugins/` disagree on which files count as
plugins and can silently drift on a future second plugin:
- `install-opencode.sh` deploys `templates/opencode/plugins/*.js` via a **glob** (every `.js`).
- `scripts/sync-opencode-edition.js` regenerates `.opencode/plugins/` from an **explicit allowlist**
  (`PLUGIN_SCRIPTS = ['kaola-workflow-hooks.js']`); `--write` only copies, and `--check` only asserts
  parity for, the allowlisted file(s).

Today only one plugin file exists, so glob and allowlist resolve to the same single file and agree —
there is **no current defect** (enhancement / hardening, future-proofing only). The latent gap: if a
second `.js` is added under `templates/opencode/plugins/` **without** registering it in
`PLUGIN_SCRIPTS`, the installer glob would deploy it while sync `--write`/`--check` would be blind to
it — re-opening the "unmanaged plugin" class that the prior opencode source-tracking fix closed for the
first file.

**Canonical spec (settled here — implementer carries it out; do NOT re-decide).** The issue offers two
alternatives; this plan selects the **loud-failure single-source-of-truth guard in
`sync-opencode-edition.js --check`** (the issue's second option) and does NOT touch the installer glob.
Rationale: it is purely additive to the existing parity machinery (`runCheck()` already iterates
`PLUGIN_SCRIPTS`), it is opencode-internal (no bash→node coupling that touching `install-opencode.sh`
would require), and once `--check` enforces set-equality the templates dir can never hold an
unregistered `.js`, so the installer glob and the allowlist are provably equal — no installer change is
needed. Concretely:
- **`scripts/sync-opencode-edition.js`** — in `runCheck()`, after the existing `PLUGIN_SCRIPTS` parity
  loop, add a guard asserting the **set of `*.js` files in `CANON_PLUGINS_DIR`
  (`templates/opencode/plugins/`) EQUALS the `PLUGIN_SCRIPTS` set** (both directions: every on-disk
  `.js` must be registered, every registered entry must exist on disk — the existing per-script loop
  already covers a missing registered file, so the new clause closes the unregistered-on-disk
  direction). On mismatch, push a clear typed mismatch (e.g. a `templates/opencode/plugins/` entry that
  reads "unregistered plugin `<file>` present in templates/opencode/plugins/ but absent from
  PLUGIN_SCRIPTS — add it to the allowlist") so `--check` exits non-zero (the suite goes red) the moment
  a second plugin is added without registering it.
- **`scripts/test-opencode-edition.js`** — add a RED-first assertion near the existing A11-canon plugin
  checks that (a) positively asserts the current set-equality holds, and (b) proves the guard FIRES:
  drop a transient extra `.js` into `templates/opencode/plugins/`, run `sync-opencode-edition.js
  --check`, assert it exits non-zero with the unregistered-plugin mismatch, then remove the transient
  file (restore the tree). Before the guard exists this transient-file `--check` PASSES, so the
  assertion FAILS (RED); after the guard it GREENs — a genuine `tdd-guide` cycle whose external oracle
  is the suite, not a judgment call.

**Scope is single-edition (opencode only) — D-530-02 (existing).** `scripts/sync-opencode-edition.js`
and `scripts/test-opencode-edition.js` are NOT mirrored into the plugin editions (no
`plugins/*/scripts/` copies), are NOT in `GENERATED_AGGREGATORS`, and no `npm` chain / `edition-sync.js`
/ `validate-script-sync.js` references any opencode file. So this diff triggers **no four-chain
cross-edition obligation** — its gate is the opencode suite (`node scripts/test-opencode-edition.js`),
recorded as `validation_command`. The executor runs in a fresh git worktree (`.kw/worktrees/issue-578/`)
where `.opencode/plugins/` is gitignored/absent; `test-opencode-edition.js` self-provisions via
`sync --write` from the tracked `templates/opencode/plugins/` source, so a green suite there from
tracked sources is the falsification oracle.

**Why ONE implement node.** The `runCheck()` guard and its RED/GREEN test are one cohesive change over
two disjoint-from-everything-else opencode scripts that must agree on the exact mismatch semantics;
splitting them would risk message/semantics divergence with no genuine independence to gain. The
transient-extra-`.js` assertion is the RED; the `runCheck()` guard is the GREEN.

**Accuracy gate (precedence #1).** n3 `code-reviewer` (opus) post-dominates the code-producing node and
runs the recorded `validation_command` in the fresh worktree — the hard, falsifiable proof that the
guard fires on an unregistered plugin and the suite is green from tracked sources. A full `npm test` is
a no-op on this diff (no opencode file is in the four chains), so the opencode suite is the real gate.
No `adversarial-verifier` node: the suite (with the new guard-fires test) IS the external oracle, not a
judgment call — keeping the run to the cheapest sufficient shape (precedence #3).

**Decision record.** `docs/decisions/D-578-01.md` is the next free number (no `D-578-*` record exists).
It records the new convention: `sync-opencode-edition.js --check` enforces that the set of `*.js` files
in `templates/opencode/plugins/` equals `PLUGIN_SCRIPTS`, so the installer glob and the sync allowlist
can never silently drift on a future second plugin. The only pre-existing opencode-edition records are
`D-530-01 (existing)` / `D-530-02 (existing)`. `docs/opencode-edition.md` documents the new `--check`
allowlist-equality guarantee. Neither doc is read by `test-opencode-edition.js` (it references
`docs/conventions.md` only as a failure-message string), so no `validation_test_consumes` entry is
needed and the doc node's timing is suite-neutral.

**Acceptance mapping.** AC1 (`sync --check` fails loudly when a `templates/opencode/plugins/*.js` file
is unregistered in `PLUGIN_SCRIPTS`) → n1 `runCheck()` guard. AC2 (the suite proves the guard fires and
stays green from tracked sources in a clean worktree) → n1 test, verified by n3. AC3 (docs +
`D-578-01`) → n2.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-allowlist-guard | tdd-guide | — | scripts/sync-opencode-edition.js, scripts/test-opencode-edition.js | 2 | sequence | sonnet | — |
| n2-docs | doc-updater | n1-allowlist-guard | docs/opencode-edition.md, docs/decisions/D-578-01.md | 2 | sequence | sonnet | — |
| n3-review | code-reviewer | n2-docs | — | 1 | sequence | opus | — |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-allowlist-guard | complete |
| n2-docs | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-allowlist-guard) | subagent-invoked | evidence-binding: n1-allowlist-guard 8c57e74c6954 | |
| doc-updater (n2-docs) | subagent-invoked | evidence-binding: n2-docs 22f6b38d1174 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review b7d7ed9904ff | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize b36ae854d4d8 | |
