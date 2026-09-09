# #1054 documentation custody, part 2 — docs/api.md, docs/architecture.md, docs/conventions.md,
docs/workflow-state-contract.md, docs/README.md, CHANGELOG.md, ADR 0024

## Sources checked
- `kaola-workflow/bundle-1054/.cache/`: `implementation-finalize.md`, `implementation-v2.md`,
  `sync-guard-trace.md`, `roles-rewrite.md`, `implementation-roles.md`, `implementation-constants.md`,
  `implementation-validators.md`, `runtime-inheritance.md` (Inferences section),
  `source-classification.md`, `acceptance-red-v3.md`, `acceptance-red-roles.md`,
  `joint-design/INDEX.md`, and `docs-part1.md` (part 1's own record, read for scope-boundary
  context only — its files are not in this custody).
- `gh issue view 1054 --json body,comments` — the rewritten body (Codex/Fable 31-item joint audit,
  baseline `662bcd339c6efef5f0e29dbe13f33189a27f2848`) and the correction comments.
- Live tree: `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`,
  `docs/workflow-state-contract.md`, `docs/README.md`, `CHANGELOG.md`, and every existing ADR named
  in the dispatch (`D-435-01.md`, `D-653-01.md`, `D-676-01.md`, `0017-the-mission-list.md`,
  `0023-agent-owned-project-instructions.md` for format), read in full or by targeted grep before
  editing.

## docs/api.md
**No edit needed — already fixed by production work.** Grepped for every retired token this
custody was asked to check (`run-gaps-manual.md` except in past-tense/retirement-describing
sentences, `doc-updater.md`, `net_backlog_delta`, `follow_ups_filed`, `follow_up_numbers`,
`probeMissionListCoherence`, `persistMissionListToSummary`, `countComplete`, `gap-sweep --check`,
`smoke-integration`, `finding: id=`, `200-line`/AGENTS.md line budget, `prose-census`/`proportional`/
`--fail-on-regression`): zero live hits. The "### The two reports" section (was "three"), the
`kaola-workflow-ledger-compare.js` module-export entry (content-based `compareLedgers`, no
`countComplete`), and the "## Run-gap sweep" section (optional, non-gating diagnostic) all already
read as retired per `implementation-finalize.md`'s own report that this file was in that mission's
scope. Verified, not re-edited.

## docs/architecture.md
1. **"### The finalize transaction" — "Three measurements ride the emitted envelope"** still listed
   `mission_list` → `## Mission List` as a live third measurement. Fixed: "Two measurements", the
   `mission_list` bullet removed and replaced with one sentence stating `#1054` retired it and why
   (finalize reads the record and the evidence directly; no gate, no landing place for its own
   findings there).
2. Checked `templates/agents/behavior-contracts.json` / provenance / model-intent sections
   (lines ~503–536) against the role-rewrite and source-classification records: already describes the
   authority abstractly (purpose/inputs/custody/writes/deliverable/verification/stop conditions,
   matching the new positioning+deliverable+custody+stop shape) and never claimed ECC framing or a
   fixed body length. No edit needed.
3. Line 86 ("Finalization, Issue closure, archive, and sink are not Mission List items...") already
   correct — left untouched.

## docs/conventions.md
1. **"## Run-gap capture at finalize (#435)"** — the whole four-step MUST procedure (manual seeding,
   the exact `## Run gaps` grammar, `--check` gate classification by typed reason) described a fully
   retired mechanism. Replaced with **"## Run-gap sweep (#435, #653, retired as a gate by #1054)"**:
   states the script is now an optional, non-gating diagnostic, names what was retired
   (`--check`/`--summary`/`--offline`/the manual-seed sidecar) and why (the audit's own finding that
   an equivalent legitimate record shape was accepted/refused/misread as zero depending on shape
   alone), and points to D-435-01/D-653-01 for the retired mechanism's history.
2. **Agent-set-delta table, `templates/agents/provenance.json` row** — said "exactly one
   origin/local classification and source record per role", schema-1 vocabulary
   (`kaola_local`/derived) that no longer exists. Fixed to name schema 2's real fields
   (`source_kind`, optional `history` record).
3. Checked and left untouched (already accurate, or out of #1054's actual scope): line 99 (Mission
   List recovery-index description, unchanged mechanism), line 185 (gap-sweep.js still named as a
   generated aggregator — still true, the script still exists), lines 489–492 (`final-validation.md`
   candidate-hash binding — D-653-01 §C, unaffected by this issue), the validator/kernel-constant
   mentions at lines 37, 156, 168, 205, 210, 743–744, 774, 788, 852 (all describe mechanisms #1054
   did not change the shape of — `edition-sync` ownership, routing generation, kernel byte-identity
   — the internal Codex-schema-constant consolidation and the 80-assertion validator subtraction have
   no existing doc claim in this file that they contradict, so there is nothing to fix; flagged here
   rather than inventing a new section for an internal refactor with no prior doc surface).

## docs/workflow-state-contract.md
1. **"finalize transaction's own three measurements... (`## Validation`, `## Changed Paths` and
   `## Mission List`)"** — fixed to "two measurements" (`## Validation`, `## Changed Paths`) plus one
   sentence stating finalize reads but does not gate on or write into the Mission List (#1054).
2. **Archive-completeness sidecar list** — "Five fixed `.cache/*.md` finalize sidecars are optional
   (`final-validation.md`, `run-gaps-manual.md`, `selection-evidence.md`, `doc-docking.md`,
   `doc-updater.md`)" — fixed to the real current three-name set
   (`final-validation.md`, `selection-evidence.md`, `doc-docking.md`), with a one-line note that the
   other two were dropped by `#1054`. This matches `ARCHIVE_CACHE_SIDECAR_MD`'s current shipped
   content per `implementation-finalize.md`.
3. **`## Closure` block description** — "measured follow-up/backlog facts" — fixed to name
   `issues_closed` explicitly and state that `follow_ups_filed`/`follow_up_numbers`/
   `net_backlog_delta` were retired as format-dependent, per `implementation-finalize.md`.
4. Verified the `KERNEL_ARTIFACT_REGISTRY` table (Layer-0 Durable-Artifact Ruling) already has no
   `run-gaps-manual.md` row — `implementation-constants.md` reports this was already removed from
   both the kernel table and this doc's mirror; confirmed absent by direct read. The `run-gaps.json`
   row's "its writer refuses to overwrite a prior cycle" claim is still accurate (the write-safety
   refusals T12–T16/#675/#679/#681 survive the rewrite per `acceptance-red-v3.md`) — left unedited.

## docs/README.md
Added one index entry for the new ADR under "## Decisions" (the only change this custody was
authorized to make here): a bullet for **0024 — Finalize measures; roles state positioning; one
authority per constant**, plus one clause in the section's lead paragraph naming what it does.
Verified this does not collide with `docs-1054-readme`'s edit to the "Agent Behavior Sources and
Provenance" bullet under "## Core" (a different section, different line range). All 28 links in the
file resolve on disk (checked programmatically).

## CHANGELOG.md
Added five `[Unreleased]` → `### Changed` bullets, one per area named in the dispatch, each
referencing `#1054`, appended after the existing `#1053` Changed entry (no other section of the file
touched): (1) finalize record-parsing retirement (two measurements, closure-block field drop,
gap-sweep becoming a diagnostic, the one-sidecar docking file, content-based mirror guard); (2) the
fourteen-role rewrite (positioning/deliverable/custody/stop, natural-language reviewer findings,
`RECOVERY_FULL_DISPATCH_RUNTIMES`, the Claude appendix hash-field drop); (3) the Codex-constant/
tier-roster single-authoring-source consolidation and the prose-census verdict removal; (4) the
80-assertion validator subtraction plus the role-body wording-pin-to-concept-check rewrite; (5)
source classification (schema 2, `kaola_authored`, the shingle measurement), stated in one line
without quoting the per-role percentages, per the dispatch's instruction, and pointing to
`docs/agents-source.md` for the full record (that file is `docs-1054-readme`'s custody, not
duplicated here).

## New ADR — docs/decisions/0024-finalize-measures-roles-state-one-authority.md
Number: `0024`, the next free number after the highest existing (`0023`). Format follows
`0023-agent-owned-project-instructions.md` (Status/Date/Issue header line; Context; Decision;
Consequences; a Withdrawn section naming rejected mechanism shapes; Supersession; Rejected
alternatives) plus a `## Pointers` section naming the archived run-record location, per the
dispatch's explicit ask. Every fact transcribed from the `.cache/` records listed above; two
self-corrections made while drafting after re-checking sources against the record rather than my
first paraphrase:
- The `net_backlog_delta` example originally implied a third (`0`) observed value; only `+1`
  (canonical bullets) and `-1` (free prose) are directly evidenced in `acceptance-red-v3.md` — fixed
  to cite only those two.
- The role-body size-reduction consequence bullet originally used a word-count range that belonged
  to a different measurement (the six historical-origin roles' shingle-analysis word counts, not all
  fourteen roles' body sizes) and an incorrect "five to six times shorter" ratio. Fixed to the correct
  measurement and unit — `685–1,001` characters across all fourteen roles (were `1,170–8,832`), from
  `roles-rewrite.md` — with no invented ratio.
- The Context item on hand-mirrored constants originally described `DEFAULT_AGENT_MODELS` as
  "hand-mirrored between files" (true of the Codex profile-schema constants, false of
  `DEFAULT_AGENT_MODELS`, which lived in exactly one hand-kept map with no check against the
  generator's real authority) — split into two accurately-scoped sentences.
- The "Rejected alternatives" bullet on staged per-role migration originally attributed the
  redundancy to "shared-boundary content already in the machine-global contract" — `roles-rewrite.md`
  measured the opposite (neither old nor new bodies ever carried that content) — fixed to attribute
  the redundancy to the actually-measured cause (repeated fixed-phase/threshold/review-format
  ritual).

Added a scoped one-line "Superseded by ADR 0024" note to each of the three named existing ADRs,
without rewriting their content:
- **D-435-01.md** — note after the header block, before `## Context`: the whole gate and its
  six-surface wiring are retired; the record stays as history.
- **D-653-01.md** — note scoped to `### D. Selection evidence + run-gap reverse containment` only
  (§D.1, the reverse-containment gate): superseded. States explicitly that §D.2/§D.3
  (selection-evidence docking, the closure-receipt field) and sections A/B/C (attestation, sink
  journals, candidate-hash binding) are unaffected and remain active — verified against
  `implementation-finalize.md`/`sync-guard-trace.md`, which describe the candidate-hash binding and
  citation-field machinery as untouched by this issue.
- **D-676-01.md** — note before `## Decision`: the fixed-name sidecar exemption list is narrowed from
  five to three; the source-relative gate principle the record establishes is unchanged.
- **0017-the-mission-list.md** — a one-paragraph note after the watch-list table (not inside any
  table cell, to avoid corrupting the table's own markdown), stating the `## Run gaps`-shaped-so-the-
  scanner-cannot-read-it row is moot for finalize now that `parseGapSection` no longer gates
  anything, while the row remains accurate history. ADR 0017's own Mission List design (four fields,
  three write moments) is explicitly stated as unchanged.

## Not touched (outside this custody, per the dispatch)
`README.md`, `docs/agents-source.md`, `kaola-workflow/archive/*`, all other existing ADRs, templates,
scripts, tests. No git operations were run.

## Addendum — team-lead re-check (sidecar sentence + Layer-0 table parity)

Team lead asked me to re-verify the sidecar sentence at `docs/workflow-state-contract.md` ~line 177
and confirm the Layer-0 table stays in sync with `KERNEL_ARTIFACT_REGISTRY`. Re-read the live file:
the sentence already reads the correct three-name set (`final-validation.md`, `selection-evidence.md`,
`doc-docking.md`) — this was fixed in this same custody pass, before the team-lead's message arrived.
Verified directly against the live source:
- `grep -n "ARCHIVE_CACHE_SIDECAR_MD" -A4 scripts/kaola-workflow-claim.js` — the live `Set` has exactly
  those three entries; no `run-gaps-manual.md` or `doc-updater.md`.
- Wrote a one-off Node script comparing `docs/workflow-state-contract.md`'s Layer-0 table row-by-row
  (matcher text + ruling column) against `scripts/kaola-workflow-adaptive-schema.js`'s
  `KERNEL_ARTIFACT_REGISTRY` in declaration order: **21 rows on each side, every matcher and every
  ruling equal at the same index** — this is the same comparison `test-kernel-conformance.js` Part B
  performs. `run-gaps-manual.md` does not appear in either the table or the registry.
- Also started `node scripts/test-kernel-conformance.js` directly to get the suite's own verdict; it
  did not finish within the session (Part F spawns full `test-sink-merge.js`/`test-claim-hardening.js`/
  `simulate-workflow-walkthrough.js` subprocesses under a write-observer, a multi-minute run per prior
  sessions' notes) — left running in the background, not used as blocking evidence here since the
  direct row-for-row comparison above already answers the specific question asked (table/registry
  parity), independent of Part F's unrelated subprocess chain.

No further edit was needed; reported back to team lead confirming the sentence and the table are
already correct.

## Addendum 2 — review findings R3, R4, R5 (candidate `5743eb15`, review-1054.md)

Team lead relayed three findings from the independent code-reviewer's review. All three verified
against the review's own anchors and the live source before editing.

**R3 (medium) — CHANGELOG.md and ADR 0024 Decision 4 falsely claimed a concept-level replacement.**
Verified against the review's reconciled assertion counts (754→676, 598→590, 540→534, 508→502
across the four validators) and the code's own comments (`validate-workflow-contracts.js:819`,
`:844`; the gitlab/gitea/codex `.toml` validators each citing "#1054 owner ruling (19:03
heartbeat)"): 22 role-body-concept assertions (`smoke-integration`, `finding: id=`,
`verdict: pass`) were deleted outright with nothing added in their place — not replaced by
`assertConcept`. `assertConcept` calls do exist in the validators (item-28/outcome-B fixture
assertions on `compareLedgers`/`mirrorFinalizationArtifacts`), but none of them targets a role
body. Fixed both passages to state the deletion plainly and name what now carries that
responsibility instead of a wording gate (generation integrity — `generate-agent-profiles --check`,
`validate-vendored-agents.js`, hash binding — and native behavior acceptance), per the review's own
framing. Grepped both files plus `docs/README.md`'s ADR-0024 index bullet for
`concept-level`/`assertConcept` afterward: no remaining false claim.

**R4 (low) — docs/api.md documented a retired bidirectional mirror and a retired `sync_required`
self-settling state.** Fixed both spots named in the review (the transaction-summary sentence and
the `checks`/`reasons` split paragraph), transcribing from `mirrorFinalizationArtifacts` (only
`mergeCopyDir(srcDir, destDir, ...)`, main→worktree, exists) and `probeFinalizeMirror` (the
`#1054` comment at `scripts/kaola-workflow-claim.js` stating `sync_required` is retired and a
diverged compare is unconditionally `sync_failed`). While fixing this in `docs/api.md`, grepped the
rest of this custody's docs for the same "worktree→main"/"both directions" phrasing and found the
identical error in **`docs/architecture.md`** (two spots, "### The finalize transaction" section) —
not named in the review but in this custody and the same fact, so fixed both there too.

**R5 (low) — docs/api.md's `compareLedgers` reason enumeration omitted `diff_unavailable`.**
Confirmed via `node scripts/kaola-workflow-ledger-compare.js --help` and the source
(`{ safe: false, reason: 'diff_unavailable', diff: '' }` when neither `diff` nor
`git diff --no-index` produces output). `prior_mirror` is not present in the live source or
`--help` yet (grepped `scripts/kaola-workflow-ledger-compare.js` and `scripts/kaola-workflow-claim.js`
for `prior_mirror`: zero hits), so documented the four current reasons only, per the team lead's
instruction to wait for the fifth.

### Files changed this round
- `CHANGELOG.md` — R3.
- `docs/decisions/0024-finalize-measures-roles-state-one-authority.md` — R3.
- `docs/api.md` — R4 (two spots), R5 (one spot).
- `docs/architecture.md` — same R4 finding, found independently in this custody's own file while
  fixing `docs/api.md`.

## Addendum 3 — R1 landed: `prior_mirror` (fifth `compareLedgers` reason, `.cache/mirror-digest.json`)

Team lead reported R1 is implemented and asked me to transcribe it into docs/api.md, docs/architecture.md,
ADR 0024, CHANGELOG [Unreleased], and to verify docs/workflow-state-contract.md's Layer-0 row.

### Verified against live source before editing
- `scripts/kaola-workflow-ledger-compare.js` — `compareLedgers(srcText, destText, opts)` now checks
  `opts.priorDigest` after `first_sync`/`identical` and before the diff comparison: dest hashing to
  `priorDigest` → `{ safe: true, reason: 'prior_mirror' }`. The bare CLI (`--source`/`--dest`) never
  builds or passes `opts`, so `--help` correctly still lists only the four non-`prior_mirror` outcomes
  — `prior_mirror` is reachable only through the exported function with a caller-supplied digest.
- `scripts/kaola-workflow-claim.js` — `MIRROR_DIGEST_REL = '.cache/mirror-digest.json'`;
  `readMirrorDigest`/`writeMirrorDigest` (degrade-to-null on missing/corrupt, best-effort write,
  documented in the source's own comments as "transaction state, not a run record", left unexcluded
  from the archive on purpose). `mirrorFinalizationArtifacts` (the write path) reads the receipt
  BEFORE comparing and writes a fresh one (keyed by `mission-list.md`'s basename → sha256 of the bytes
  just copied) AFTER a successful copy. **`probeFinalizeMirror` (the `finalize --check` read-only
  twin) calls `compareLedgers` with only two arguments — it never reads the receipt or supplies
  `priorDigest`.** This asymmetry is not something I fixed (it's production behavior, not a doc
  error), but I documented it explicitly wherever I described `--check`'s mirror prediction, since a
  reader would otherwise expect `--check` and the real transaction to agree, per the code's own
  now-partially-stale "the prediction must agree with what the transaction will actually do" comment.
- `docs/workflow-state-contract.md`'s Layer-0 row for `.cache/mirror-digest.json` (line 47, added by
  `impl-1054-finalize`) — verified word-for-word accurate against the source and, more importantly,
  verified row-FOR-row (matcher + ruling, in declaration order) against the live
  `KERNEL_ARTIFACT_REGISTRY`: 22 rows on each side, no mismatch, `mirror-digest.json` at index 4 on
  both sides. No edit needed. Also confirmed its `record` ruling is earned: `writeMirrorDigest` calls
  `claim.js`'s `writeFile`, which resolves to `adaptiveSchema.writeFileAtomicReplace` — the atomic-write
  obligation the `record` ruling requires.

### Fixed
- **docs/api.md** — the finalize-transaction paragraph gained a new paragraph describing the receipt,
  its path, the `priorDigest` mechanism, and the `--check`-does-not-consult-it gap; the `checks`/
  `reasons` split paragraph gained one sentence naming the same gap; the `compareLedgers` module-export
  entry now documents all five reasons (including the CLI-vs-library distinction for `prior_mirror`
  reachability) and the receipt/caller relationship.
- **docs/architecture.md** — the finalize-transaction paragraph (already fixed for direction in
  Addendum 2) now also names the content-identity-plus-receipt decision and states plainly that a
  worktree copy unchanged since the mirror's own last write is treated as forward progress, not a
  conflict.
- **docs/decisions/0024-...md`** — Decision 1's mirror sentence now lists all four base reasons plus
  `prior_mirror` as a fifth, framed as the review (R1) catching a real regression in the first shipped
  shape; the Consequences bullet on mirror divergence now carries the `prior_mirror` exception instead
  of an unqualified "always stops."
- **CHANGELOG.md** — the finalize-record-parsing bullet's mirror-guard sentence now lists all four base
  reasons and adds one sentence on `prior_mirror`/the receipt closing the review-caught regression.

### Not touched
`docs/README.md`'s ADR-0024 index bullet — re-checked, makes no claim `prior_mirror` contradicts
("decides by content, not a count" remains true), and the team lead's ask did not name this file, so
left as-is rather than over-editing a summary line.

### Flagged for the team lead (not a doc fix — a possible follow-on)
`finalize --check`'s mirror prediction cannot see `prior_mirror`: it can report `sync_failed` for a
divergence the actual `finalize` write would accept and proceed past. I documented this precisely
rather than silently smoothing over it, but did not decide whether it's worth a `--check`-side fix
(reading the same receipt read-only) — that's a production call, not mine.

### Files changed this round
- `docs/api.md`
- `docs/architecture.md`
- `docs/decisions/0024-finalize-measures-roles-state-one-authority.md`
- `CHANGELOG.md`
- `docs/workflow-state-contract.md` — verified only, no edit needed.

## Addendum 4 — precision: module API (five reasons) vs CLI (four reachable reasons)

Team lead asked for a crisper split in the `compareLedgers` entry: the module API's five reasons,
the CLI's four, and which is which — my prior wording folded the CLI caveat into a trailing clause
of the module description instead of giving it its own statement.

Re-ran `node scripts/kaola-workflow-ledger-compare.js --help` before editing (per habit of never
trusting a prior read against a shared worktree) and found its own text had changed since Addendum 3
— it now explicitly names `prior_mirror` as a parenthetical aside under `exit 0`, explaining it is a
"programmatic callers... only, passing `{ priorDigest }`, not reachable from this CLI" outcome. This
does not add a real fifth CLI-reachable case (the CLI still builds no `opts` and the flag does not
exist), but it does mean team lead's framing ("`--help` correctly lists only first_sync/identical")
is no longer a literal quote of the current text, only of its functional content — so I matched the
doc to the ACTUAL current `--help` wording rather than the summary in the instruction.

Rewrote `docs/api.md`'s `compareLedgers` entry into two explicit, separately headed statements:
**"Module API — five reasons"** (the full five-reason description, unchanged in substance from
Addendum 3) and **"CLI ... — four reachable reasons"** (states plainly that `prior_mirror` cannot
fire from the CLI, that `--help` names it only as an explanatory aside about the module API, and
that it does not add a fifth CLI exit code or JSON reason). Re-ran `--help` once more immediately
after editing to confirm it was still stable before finishing.

### Files changed this round
- `docs/api.md` only.

## DOCKED

All deliverables complete. No BLOCK. Files changed:
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/architecture.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/conventions.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/workflow-state-contract.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/README.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/CHANGELOG.md`
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/decisions/0024-finalize-measures-roles-state-one-authority.md` (new)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/decisions/D-435-01.md` (one-line supersession note)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/decisions/D-653-01.md` (one-line supersession note, scoped to §D)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/decisions/D-676-01.md` (one-line supersession note)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054/docs/decisions/0017-the-mission-list.md` (one-paragraph moot-row note, outside the table)
- `docs/api.md` — checked, no edit needed (already fixed by `impl-1054-finalize`).

## Addendum 5 (orchestrator)
After impl-1054-finalize made `probeFinalizeMirror` read the mirror receipt (ledger-guard R1e/R1f green, 96 assertions), the `docs/api.md` paragraph that documented the `--check`-vs-transaction disagreement was replaced with the shipped fact: both paths read `.cache/mirror-digest.json` through the same helper, `--check` never writes it, and prediction and transaction agree on `prior_mirror` and on a genuine divergence.

## Addendum 6 (orchestrator) — review R6
A second copy of the retired "--check does not read the receipt" statement survived at docs/api.md ~440 (the `--check` section); replaced with the shipped fact (the prediction reads the receipt through the same helper; prior_mirror is passable on both paths). grep confirms no remaining "does not read the" / "One gap" text in docs/api.md.
