# Workflow Plan — issue 580

<!-- plan_hash: bdb06f6f82a1c33a1f1ae6bd80a1dfffa3d1d9c489edd097f95d9fb4d1a9eb04 -->

## Meta
labels: enhancement, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Plan Notes

**Goal (580).** Close the *class* the #579 fix left open: there is no contract pinning the forge
`active-folders` ports to parse the same SHARED engine `workflow-state.md` fields as canonical. The
ports are hand-ported per edition with forge-specific additions (gitlab `mr_*`/`project_id`; gitea
`full_name`/`pr_*`), so they are NOT byte-identical and `validate-script-sync.js` does not pin them —
the next shared field added to canonical `parseStateFile` can silently miss a forge port again, and the
chains (which assert claim-record SHAPE, not end-to-end field round-trip) would not catch it.

**Audit done at authoring time (no port edits needed).** Grepping `field(content, '<key>')` across all
four `active-folders` ports confirms every one of the 13 SHARED engine fields
(`issue_number, phase, issue_numbers, status, bundle_id, closure_policy, next_command, branch,
worktree_path, sink, main_root, session_marker, claim_ts`) is already parsed in canonical, codex,
gitlab, AND gitea (#579 aligned `main_root`/`session_marker`/`claim_ts`). So NO `active-folders` port is
currently missing a field — the ports stay out of every write set, matching the issue's "none expected".

**Canonical spec (settled here — the implement node carries it out; do NOT re-decide).** Lighter
sufficient option from the issue: a single source of truth + a behavior-based parity gate.
- **`SHARED_STATE_FIELDS` constant** added + exported in `kaola-workflow-adaptive-schema.js` (the
  forge-neutral, byte-identical ×4 drift anchor already pinned by `validate-script-sync.js`), seeded
  with EXACTLY the 13 shared fields above as a `Object.freeze([...])` array, in the same module.exports
  style as the file's other constants. Because the four schema copies are byte-identical, every edition
  sees the same list automatically and a future shared field is added in ONE byte-mirrored place. ALL
  FOUR copies move in this ONE node (the schema is a `mirror_write` SYNC-GROUP — it is NOT a
  `generated_port_split` aggregator; its forge files keep the canonical name and are never renamed).
- **New behavior gate `scripts/test-active-folders-field-parity.js`** (root-only, like
  `validate-script-sync.js`/`test-edition-sync.js` — NOT mirrored into editions, NOT in
  COMMON_SCRIPTS). For EACH of the four editions it `require`s that edition's `active-folders` module
  and exercises the REAL consumer path the issue names: build a temp
  `<tmp>/kaola-workflow/<proj>/workflow-state.md` populating every `SHARED_STATE_FIELDS` key with a
  distinct, TYPE-APPROPRIATE non-empty sentinel, call
  `readActiveFolders(tmpRoot, { excludeClosedIssues: false })` (the exported-by-all-four entry point —
  `parseStateFile` is exported only by the forge ports, so it is NOT a cross-edition-uniform entry; and
  `excludeClosedIssues:false` keeps the call hermetic with no forge-CLI/`gh` round-trip), and assert
  every `SHARED_STATE_FIELDS` key is SURFACED on the returned item. Mirror the #579
  `readActiveFolders(tmpDir, {excludeClosedIssues:false})` shape in `test-claim-hardening.js`,
  generalized to the full shared set × all four editions in one loop. NON-VACUITY DISCIPLINE: numeric
  fields are typed-parsed (`issue_number`/`phase` → positive int, `issue_numbers` → int array) and
  `sink`/`status` carry defaults (`'merge'`/`'unknown'`) — so sentinels MUST be chosen so a *missing*
  field is distinguishable from a *surfaced* one (e.g. `sink` sentinel ≠ `'merge'`, numeric sentinels
  are positive ints, string sentinels are distinct non-empty) and the assertion checks the surfaced
  value matches the sentinel, never a value the default would also produce.
- **Wire the gate into all four chains** by appending `&& node scripts/test-active-folders-field-parity.js`
  to each of `test:kaola-workflow:{claude,codex,gitlab,gitea}` in `package.json`, so a missing field reds
  the #307 cross-edition obligation regardless of which chain runs. The existing chain-content contract
  assertions (`validate-*-contracts.js`) are substring "must run X" checks, so appending a new script
  does not break them. A `package.json` edit is in-scope for this follow-up.

**Why ONE implement node.** The `SHARED_STATE_FIELDS` constant (×4 byte-identical), the parity gate
that consumes it, and the `package.json` wiring that runs it are one semantically-coupled change that
must move atomically — the test fails without the constant; the constant is dead without the gate; the
gate is unenforced without the wiring. The four schema copies are a byte-mirror group (forced together).
There is no genuinely-independent lane to fan out, so a serial chain is the cheapest sufficient shape.

**RED-first cycle (genuine `tdd-guide`).** Write the parity gate first: before `SHARED_STATE_FIELDS`
exists the gate cannot resolve the constant → RED; add the ×4 constant → all editions already parse the
13 fields → GREEN. The issue's acceptance also demands the gate FIRE on regression — deleting any one
shared field (e.g. `session_marker`) from a forge port's parser reds the gate; appending a new key to
`SHARED_STATE_FIELDS` (one byte-mirrored place) reds every edition not yet parsing it. The suite IS the
external oracle, so no `adversarial-verifier` node is needed (cheapest sufficient shape, precedence #3).

**Accuracy gate (precedence #1).** n3 `code-reviewer` (opus) post-dominates the code-producing implement
node and the doc node, and runs the recorded `validation_command` — all four chains sequentially (#307;
a green claude chain alone is insufficient — `npm test`'s `&&` short-circuits, so the codex/gitlab/gitea
chains must be run explicitly). The reviewer must falsify: (a) the gate is non-vacuous (a deleted shared
field actually reds it; the typed-field sentinels don't make an assertion always-true via a default),
(b) `SHARED_STATE_FIELDS` is byte-identical across all four schema copies, and (c) the gate runs in all
four chains. opus because that falsification is the reasoning floor; sonnet on the implement node, which
carries out a fully-specified spec.

**Docs.** n2 `doc-updater` writes `docs/decisions/D-580-01.md` (the next free number — no `D-580-*`
record exists yet; this records the new convention: a SHARED engine `workflow-state.md` field is
declared once in `SHARED_STATE_FIELDS` in the byte-identical `kaola-workflow-adaptive-schema.js` ×4 and
every edition's `active-folders` must parse it, enforced behaviorally by
`test-active-folders-field-parity.js` in all four chains) and adds a cross-edition-discipline note to
`docs/conventions.md`. Parent record is `D-579-01 (existing)`. Neither doc is a runtime fixture the
parity gate parses, so no `validation_test_consumes` entry is needed and the doc node's timing is
suite-neutral. `CHANGELOG.md` ([Unreleased]) is written by the finalize sink (docs/state only).

**Acceptance mapping.** AC `SHARED_STATE_FIELDS` exists + byte-identical ×4 listing the 13 fields → n1
schema edit. AC behavior gate asserts every edition surfaces every key + runs in all four chains → n1
test + `package.json` wiring, verified by n3. AC RED-first (delete a field reds) / forward-proof (new
key reds an unaligned edition) → n1 test design, falsified by n3. AC forge-specific fields NOT pinned →
the gate keys only on `SHARED_STATE_FIELDS` (the strict intersection), never the per-edition fields. AC
all four chains green → n3 runs `validation_command`. Docs + `D-580-01` → n2.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-shared-field-parity | tdd-guide | — | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/test-active-folders-field-parity.js, package.json | 6 | sequence | sonnet | — |
| n2-docs | doc-updater | n1-shared-field-parity | docs/decisions/D-580-01.md, docs/conventions.md | 2 | sequence | sonnet | — |
| n3-review | code-reviewer | n2-docs | — | 1 | sequence | opus | — |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-shared-field-parity | complete |
| n2-docs | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-shared-field-parity) | subagent-invoked | evidence-binding: n1-shared-field-parity 1c649110c365 | |
| doc-updater (n2-docs) | subagent-invoked | evidence-binding: n2-docs 4c2975e7f291 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 60196a87b4df | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 803294a63d31 | |
