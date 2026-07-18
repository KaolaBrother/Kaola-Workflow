# Workflow Plan — issue #715

<!-- plan_hash: 78fdaa3254651a6ea2a408bd602fe2f1b47c2da1017b367eedce4642a1d48abf -->

## Meta

project: issue-715
labels: workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
validation_command: npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: n3-code-review
security_certifier: none
inherited_frontier_digest: none
inherited_frontier_classes: none

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-residue-fixes | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/test-sink-merge.js, scripts/simulate-workflow-walkthrough.js | 10 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-documentation | doc-updater | n1-residue-fixes | CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md | 3 | sequence | — | standard | — | — | — | — | — | — |
| n3-code-review | code-reviewer | n2-documentation | — | 1 | sequence | — | reasoning | — | — | the release path commits every .discarded- archive it creates (claim.js release and the watch-pr CLOSED sweep) at the ACTUAL dest with the commit verifiable at HEAD and failure reported — never thrown — in the emitted JSON, and the sink preflight exempts exactly the live/archive sink-receipt.json of ANY project while every other sibling path still refuses as foreign dirt — with codex byte-mirror and forge-port parity proven and every pre-existing sink/claim/release behavior intact | complete candidate: the claim.js and sink-merge.js four-edition families (canonical, codex byte twins, gitlab and gitea hand ports), the claude-chain test surfaces (test-sink-merge.js, simulate-workflow-walkthrough.js), and the documentation delta | sequence | — |
| n4-falsify-residue-fixes | adversarial-verifier | n3-code-review | — | 1 | sequence | — | reasoning | — | — | a released claim's discard archive never again blocks a sink as foreign_dirt, an interrupted sink's receipt is exempt for every project without masking any genuinely foreign path or being touched by the sinking run, the release commit cannot strand or misreport the release transaction (diff-quiet, commit-failure, offline), and no previously-passing release/sink/resume path regressed | the release→discard→sibling-sink matrix (commit success, diff-quiet skip, commit failure, watch-pr CLOSED sweep) and the preflight classification matrix (own/sibling × live/archive receipt × porcelain status, deceptive look-alike paths, sibling non-receipt archive files) across all four edition copies | sequence | n1-residue-fixes |
| n5-finalize | finalize | n4-falsify-residue-fixes | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Plan Notes

#715 is a diagnosed two-part bug with verbatim reproductions and a proposed design recorded in
the issue body, so no probe or design node is needed; the implementation direction is settled
here and recorded in the n1 brief (compact-plan posture).

Part (a): `cmdRelease` (`scripts/kaola-workflow-claim.js` ~line 3248) and the watch-pr
CLOSED-state sweep (~line 4233) both archive via
`archiveProjectDirSafely(root, project, 'abandoned', '.discarded-' + ts)` and leave the archive
untracked, so the next `sink-merge` refuses `foreign_dirt` on the workflow's own artifact. The
fix mirrors the sink's #700 `archive_commit` step (`scripts/kaola-workflow-sink-merge.js` ~line
1609): stage the ACTUAL returned dest and commit it, diff-quiet guarded, as part of the release
action. Part (b): `sinkPreflight` (~line 1183) exempts only THIS sink's own-project receipt
(#518), so a sibling project's in-progress receipt
(`kaola-workflow/archive/<other>/.cache/sink-receipt.json`) classifies as foreign dirt; the fix
widens the exemption to the exact receipt path of ANY project (live and archive spellings) while
every other sibling path stays bucket-3.

Both fixes are carried in ONE writer node. Each is a single semantic change spanning the four
edition trees: `kaola-workflow-claim.js` and `kaola-workflow-sink-merge.js` are COMMON_SCRIPTS
(canonical ↔ codex byte-identical, enforced by `validate-script-sync.js`) with HAND-PORTED
gitlab/gitea ports (not GENERATED_AGGREGATORS — `edition-sync.js --write` does NOT regenerate
them; the ports are mirrored by hand modulo forge nouns, canonical spec = the full accumulated
root diff vs the run base). File-disjoint port legs would risk prose/logic drift on one semantic
change, so the cohesive set moves atomically in n1; there is no file-count ceiling forcing a
split. `scripts/test-sink-merge.js` and `scripts/simulate-workflow-walkthrough.js` ride in the
write set because they carry the RED-first scenarios; the standalone forge suites
(`test-gitlab-sinks.js` / `test-gitea-sinks.js`) pin nothing in this classification (verified:
zero `sink_blocked` assertions) and run as evidence-only.

`n2-documentation` precedes the common certifier because all three doc surfaces are #547/#709
test-consumed (CODE-tier) prose — the certifier must review the final tree and the finalize
validation receipt hashes the post-docs state — and #715's acceptance criterion names the
documented operator checks (docs/api.md § Sink journal disposal, docs/workflow-state-contract.md
§ Terminal journal disposal). `n3-code-review` is the named common code certifier wall
post-dominating the producer; `n4-falsify-residue-fixes` is the standalone adversarial change
gate certifying it — warranted by the load-bearing foreign-dirt safety invariant (an
over-exemption silently un-guards the concurrent-WIP protection, the #328 lesson) and by a git
commit now living inside the release transaction. No `security-reviewer`: the frozen labels
carry no sensitive label and no declared path matches the sensitive patterns. No
`main-session-gate`: acceptance is fully machine-checkable (RED-first regressions, the
adversarial matrices, and the recorded validation command at finalize).

The recorded `validation_command` is `npm test` (the four edition chains, sequential — this is a
cross-edition diff touching all four script trees) plus the two additive-edition suites, which
install the same manifest scripts (`kaola-workflow-install-manifest.js` ships claim.js and
sink-merge.js to the kimi/opencode editions) but are not wired into `npm test`. Nodes run only
focused RED/GREEN checks while producing; Finalization runs the full recorded command once over
the final post-documentation tree. Decision records were checked: no `D-715-*` record or mention
exists, and these two diagnosed bug fixes warrant no new ADR, so none is allocated.

## Node Briefs

### n1-residue-fixes

Fix both halves of #715 in the canonical `scripts/` copies RED-first, then propagate to the
codex byte twins and the gitlab/gitea hand ports. Read the issue body first; its reproductions
and acceptance criteria are the specification.

(a) — release commits its discard archive. Seam: `cmdRelease`
(`scripts/kaola-workflow-claim.js` ~line 3248) and the watch-pr CLOSED-state sweep (~line 4233);
both call `archiveProjectDirSafely(root, project, 'abandoned', '.discarded-' + ts)` and never
commit the result. After a successful `.discarded-` archive, stage the ACTUAL `result.dest`
(never a reconstructed plain path — the #700 collision-suffix lesson) and commit it on the
current checkout, mirroring the sink's `archive_commit` step
(`scripts/kaola-workflow-sink-merge.js` ~lines 1609-1709): `git add` the dest, a diff-quiet
guard skips the commit when nothing staged, then verify the archive landed at HEAD. Implement
the logic ONCE as a shared helper beside `archiveProjectDirSafely` (~line 2303) and call it from
BOTH `.discarded-` sites. Record the outcome on the emitted JSON (e.g.
`discard_archive_committed: true|false` + detail) — the release result must stay truthful.
Error semantics: a failed commit must NOT strand the release — the live folder is already gone —
so report the failure loudly in the emitted JSON (pre-#715 behavior plus an operator-facing
detail), never throw past the emit. The commit is local git: `KAOLA_WORKFLOW_OFFLINE` must not
skip it.

(b) — any-project receipt exemption. Seam: `sinkPreflight`
(`scripts/kaola-workflow-sink-merge.js` ~lines 1183-1187): the #518 `sinkReceiptPaths` set is
keyed on THIS sink's `project`, so a sibling project's in-progress receipt falls to bucket 3.
Replace the project-keyed set membership with an EXACT-path match for
`kaola-workflow/<seg>/.cache/sink-receipt.json` and
`kaola-workflow/archive/<seg>/.cache/sink-receipt.json` where `<seg>` is exactly one path
segment — any project, live or archived. Keep it exact: no prefix or directory exemption —
`kaola-workflow/archive/<other>/workflow-state.md` (or anything else under a sibling tree) stays
bucket-3 foreign dirt, and look-alikes (`sink-receipt.json.tmp`, a nested
`x/.cache/sink-receipt.json`, a trailing-slash form) must NOT match. Keep the exemption
unconditional across porcelain statuses (the current code exempts `??` and `D ` alike). Update
the #518 comment to record the sibling rationale: exemption is classification-only — the sink
never stages, touches, or mutates the sibling receipt (the never-touches-another-project
invariant is about mutation; not-refusing is not mutation). Out of scope: `sink-fallback.json`
stays unexempted (the issue names only `sink-receipt.json`).

RED first, before any producer edit:
- `scripts/test-sink-merge.js` — new scenarios on the existing OFFLINE-safe subprocess harness:
  (1) seed an untracked sibling archive receipt
  (`kaola-workflow/archive/<sibling>/.cache/sink-receipt.json`, mid-cycle steps) at main and run
  `--sink` for the test project → must NOT refuse `sink_blocked` on the receipt, and the receipt
  file is byte-untouched afterward; (2) seed a sibling NON-receipt file
  (`kaola-workflow/archive/<sibling>/workflow-state.md`) → still refuses `sink_blocked` listing
  that exact path (over-exemption guard); (3) own-project live + archive receipts remain exempt
  (regression lock for #518).
- `scripts/simulate-workflow-walkthrough.js` — (a) beside the existing release-archive scenario
  (~line 6817): after `release` reports `archived:true`, assert the discarded dest is COMMITTED
  (no `.discarded-` path in `git status --porcelain`; the dest is present at HEAD) and a
  following sink preflight for another project does not refuse on it; (b) beside the #429
  foreign-dirt scenario (~line 15004): an interrupted-sink fixture (sibling project archived,
  only `.cache/sink-receipt.json` untracked) must NOT appear in `foreign_dirt`, while the planted
  genuinely-foreign file still does. Keep every existing assertion green unchanged.

Propagation (one semantic change, four trees, ONE node): byte-replicate the canonical edits into
`plugins/kaola-workflow/scripts/` (COMMON_SCRIPTS twins) — do NOT run `edition-sync.js --write`,
these bases are not generated. Hand-mirror EVERY hunk into
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-{claim,sink-merge}.js` and
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-{claim,sink-merge}.js` modulo forge
nouns; the canonical spec is the full accumulated root diff vs the run base
(`git diff <base>..HEAD -- scripts/kaola-workflow-claim.js scripts/kaola-workflow-sink-merge.js`),
never a per-concern enumeration. The ported preflight/release code is line-faithful today
(verified: gitlab sink-merge ~lines 1179-1185 mirrors canonical ~lines 1183-1187), so the mirror
is mechanical. If you add a module export in a canonical script, add it in all three edition
copies — `validate-script-sync.js` enforces the forge module.exports superset. Plugin scripts
are code, not prose: keep each port's existing forge nouns.

GREEN before closing:
`node scripts/test-sink-merge.js && node scripts/simulate-workflow-walkthrough.js && node scripts/test-claim-hardening.js && node scripts/validate-script-sync.js && node scripts/edition-sync.js --check`
plus the standalone (not chain-wired) forge behavioral suites for evidence:
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js && node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
and `node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js` (the additive
editions install these same scripts) before closing — `npm test` does not run them.

### n2-documentation

Read the n1 evidence file first. Add one `[Unreleased]` CHANGELOG entry covering both halves of
#715. Update `docs/api.md`: the Sink journal disposal section (~lines 3449-3484) currently tells
operators a stray `sink-receipt.json` found on a clean-and-synced check "must be deleted, never
committed" — distinguish an IN-PROGRESS receipt (any project's, live or archive path), which is
sink-owned, exempt from foreign-dirt classification, and must NOT be manually deleted or
committed mid-cycle (it IS the resume ledger; re-running the owning sink resumes, completes, and
disposes/commits it), from a TERMINAL stray (post-`status:sinked`, or pre-#653 residue), which
stays delete-never-commit. Update the `claim.js release` documentation wherever api.md describes
it: the discard archive is now committed as part of the release action, and the emitted JSON
carries the commit outcome (mirror the exact field name n1 shipped — read it from the evidence,
do not invent it). Update `docs/workflow-state-contract.md` § Terminal journal disposal (~line
426) with the same in-progress-vs-stray distinction in one or two sentences. Docs only; no
decision record is allocated for this issue.

### n3-code-review

Act as the named schema-2 common code certifier for the producer. Read the issue body, the n1
RED/GREEN evidence, and the n2 documentation diff. Verify each acceptance criterion against the
actual diff: (a) both `.discarded-` creation sites commit the ACTUAL dest with a diff-quiet
guard and a HEAD verification, a commit failure is reported in the emitted JSON rather than
thrown or silently swallowed, and offline mode does not skip the local commit; (b) the exemption
matches exactly the two receipt spellings for any single-segment project and nothing else —
prove a sibling non-receipt path still refuses, deceptive look-alikes do not match, a
tracked-deletion own receipt still exempts, and the foreign-dirt NEVER-mutates invariant is
intact. Confirm parity: codex twins byte-identical and forge module.exports superset green
(`validate-script-sync.js` in evidence), `edition-sync.js --check` green, and the gitlab/gitea
ports mirror every hunk of the accumulated root diff with no missed site. Confirm the docs match
the shipped behavior (field names, classification contract). Zero findings is a valid verdict;
admit only concrete candidate-caused defects with an exact trigger and proof.

### n4-falsify-residue-fixes

Standalone adversarial change gate certifying the producer. Try to refute the headline claim
with the strongest falsification you can construct. Build the release→discard→sibling-sink
matrix: release commit success; the diff-quiet skip (an already-committed or empty archive must
not produce an empty commit); a commit failure (detached HEAD, missing git identity) must
surface truthfully in the release JSON without stranding the release; the watch-pr CLOSED sweep
path creates no untracked residue either. Build the classification matrix: own/sibling ×
live/archive receipt across porcelain statuses (`??`, `D `, `M `); deceptive names
(`sink-receipt.json.tmp`, nested `sub/.cache/sink-receipt.json`, a two-segment project path,
trailing-slash forms) must NOT be exempted; a sibling's non-receipt file must still block with
zero mutation; and prove the sinking run never stages, modifies, or deletes the sibling receipt
it now tolerates. Run the issue's two reproductions end-to-end against the candidate. Record a
gate verdict, not implementation advice; pass only if no counterexample survives.

### n5-finalize

Unique sink. Run the Meta `validation_command` once over the final post-documentation tree — all
four edition chains sequentially green via `npm test`, then `node scripts/test-kimi-edition.js`
and `node scripts/test-opencode-edition.js` — record the content-addressed receipt, verify the
named code certifier and the standalone adversarial gate are complete and fresh, then close
issue 715. Write no tracked file from this node.

## Node Ledger

| id | status |
| --- | --- |
| n1-residue-fixes | complete |
| n2-documentation | complete |
| n3-code-review | complete |
| n4-falsify-residue-fixes | pending |
| n5-finalize | pending |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-residue-fixes) | subagent-invoked | evidence-binding: n1-residue-fixes 9e9683c09f7c | |
| doc-updater (n2-documentation) | subagent-invoked | evidence-binding: n2-documentation 83219ce14dda | |
| code-reviewer (n3-code-review) | subagent-invoked | evidence-binding: n3-code-review cee943909c3f | |
| adversarial-verifier (n4-falsify-residue-fixes) | pending | | |
| finalize (n5-finalize) | pending | | |
