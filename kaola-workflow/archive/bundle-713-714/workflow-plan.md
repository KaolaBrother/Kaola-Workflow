# Workflow Plan — bundle #713, #714

<!-- plan_hash: 8bcb4f6904ae9350e319bdd764cc4e2095835fd4bd09a94fc0f99b96dc086b1b -->

## Meta

project: bundle-713-714
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
| n1-lifecycle-producer-fixes | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js | 10 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-documentation | doc-updater | n1-lifecycle-producer-fixes | CHANGELOG.md, docs/plan-run-cards/reopen-complete-node.md | 2 | sequence | — | standard | — | — | — | — | — | — |
| n3-code-review | code-reviewer | n2-documentation | — | 1 | sequence | — | reasoning | — | — | both producer fixes implement the diagnosed root causes exactly — the folded-pass repair wedge is unreachable end-to-end and every compliance emission path produces a validateRequiredAgentCompliance-conforming table — carry RED-first regression proof in every touched edition copy, and leave every unchanged lifecycle behavior (repair-journal strictness, anti-laundering baseline reuse, legacy bare-cell matching, idempotent re-close) intact | complete candidate: the adaptive-node and adaptive-schema four-edition families, their claude-chain test surfaces, and the documentation delta | sequence | — |
| n4-falsify-lifecycle-fixes | adversarial-verifier | n3-code-review | — | 1 | sequence | — | reasoning | — | — | a serial pass-then-later-fail repair now drives to finalize without releasing the claim, folded-pass gates reopen through a sanctioned delta path, any still-reachable wedge refusal names a documented recovery, and every compliance emission path (pre-seeded advance, legacy append, review-role re-close) yields a validator-conforming table — with no previously-passing repair, reopen, or fan-out-fold path regressed | the schema-2 repair/fold/reopen matrix (serial multi-gate pass-then-fail, mid-gate repair, adversarial fan-out group fold, crash-window retry) and the compliance emission matrix (legacy no-section append, pre-seeded in-place advance, review-role cells, heading adjacency) across all four edition copies | sequence | n1-lifecycle-producer-fixes |
| n5-finalize | finalize | n4-falsify-lifecycle-fixes | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Plan Notes

This bundle fixes two same-scope adaptive-lifecycle producer bugs, both living on the
schema-2 repair / close-node emission surface shared by `kaola-workflow-adaptive-node.js` and
`kaola-workflow-adaptive-schema.js`. Both issues arrive with root causes diagnosed and verbatim
reproductions recorded, so no probe or design node is needed; the implementation direction is
settled here and recorded in the node brief (compact-plan posture).

#713 is the pass-then-later-fail fold wedge: `runRepairNodeCore`
(`scripts/kaola-workflow-adaptive-node.js`, fold at the `gatesReset`/`gatesFolded` step and the
`completedJournalGates` evidence purge) folds an already-PASSED post-dominating gate to pending,
and the schema-2 open path then refuses its reopen with `review_repair_delta_unavailable` because
`deriveRepairDelta` (`scripts/kaola-workflow-adaptive-schema.js`) requires the previous attempt in
the gate's lineage to be a settled fail while the folded lineage holds only a sealed pass. #714
is the compliance-table emission drift: the append path of `addCloseCompliance`
(`legacyRequirement || canonicalRequirement` emits a bare `code-reviewer` cell) plus
`spliceComplianceSection`'s insert-at-`sec.next` splice (a pre-existing trailing blank migrates
into the table, and no blank survives before the next heading) emit tables that
`validateRequiredAgentCompliance` (`scripts/kaola-workflow-plan-validator.js`) rejects.

Both fixes are carried in ONE writer node. Each fix spans both lifecycle families
(`adaptive-node` for the fold / close producers, `adaptive-schema` for `deriveRepairDelta` /
`spliceComplianceSection`); `adaptive-node` is a GENERATED_AGGREGATOR whose canonical edit and
three edition ports must move atomically (`generated_port_split`), and a port mirror must follow
ALL root edits of its base (`forge-port ordering gap`) — so the two fixes cannot be split across
serialized writer nodes without splitting each semantic change across nodes. One node holds the
full coherent set: edit the canonical `scripts/` copies only, regenerate the three adaptive-node
ports with `node scripts/edition-sync.js --write` (prove `--check` green), byte-replicate the
three adaptive-schema copies (prove `node scripts/validate-script-sync.js` green); the canonical
spec for every port is the full accumulated root diff from the run base, mirrored in every hunk
modulo forge nouns. `scripts/simulate-workflow-walkthrough.js` rides in the write set because it
pins repair-node scenarios and cycle-level compliance assertions that either fix may force to
move.

`n2-documentation` precedes the common certifier because `CHANGELOG.md` is a self-host
test-consumed freshness surface and #713's acceptance criteria require a documented recovery
path (the `repair-node` plan-run card). `n3-code-review` is the named common code certifier wall
post-dominating the producer; `n4-falsify-lifecycle-fixes` is the standalone adversarial change
gate certifying it — warranted by #713's unrecoverable-claim severity in the review-journal
core. No `security-reviewer`: the frozen labels carry no sensitive label and no declared path
matches the sensitive patterns. No `main-session-gate`: acceptance is fully machine-checkable
(RED-first regressions, the adversarial matrices, and the recorded validation command at
finalize).

The recorded `validation_command` is `npm test` (the four edition chains, sequential — this is a
cross-edition diff) plus the two additive-edition suites, which install and exercise the same
canonical lifecycle scripts but are not wired into `npm test`. Nodes run only focused RED/GREEN
checks while producing; Finalization runs the full recorded command once over the final
post-documentation tree. Decision records were checked: no `D-713-*` or `D-714-*` record or
mention exists, and these two diagnosed bug fixes warrant no new ADR, so none is allocated.

## Node Briefs

### n1-lifecycle-producer-fixes

Fix #713 and #714 in the canonical `scripts/` copies, then propagate: regenerate the three
adaptive-node ports (`node scripts/edition-sync.js --write`; `--check` must be green) and
byte-replicate the three adaptive-schema copies (`node scripts/validate-script-sync.js` green).
Read both issue bodies first; their reproductions are the specification.

#713 — a serial pass-then-later-fail sequence must repair and drive to finalize without
releasing the claim. The issue's six-step reproduction (writer → gate A pass → gate B fail →
`repair-node` → B re-pass → reopen A refuses `review_repair_delta_unavailable`) is the RED
scenario. Bug anatomy (verified against source): `runRepairNodeCore`
(`scripts/kaola-workflow-adaptive-node.js`, ~line 7501-7616) computes `gatesReset` from
post-dominating gates plus journal gates bound to the same candidate — including gate A whose
latest attempt outcome is `pass` (`completedJournalGates`) — folds every one to pending, and
purges A's sealed-pass evidence. When A later reopens, the schema-2 open path
(`scripts/kaola-workflow-adaptive-node.js` ~line 1280) and the journal validator
(`scripts/kaola-workflow-adaptive-schema.js` ~line 2569) call `deriveRepairDelta`
(~line 1977), which refuses unless the gate's previous lineage attempt is a settled, consumed
FAIL (`previous.outcome === 'fail'`, `repair.settled`, `consumed_by === selected_writer`). A's
lineage holds only the sealed pass, so the reopen is refused and no sanctioned unlock exists
(replan `prepare` has no `.cache/replan-source.json` because the triggering refusal was not
`repair_requires_replan`).

Fix direction — preferred option (b) from the issue: teach the fold to record its own boundary
and teach `deriveRepairDelta` (and its two consumers) to accept a folded-pass lineage. When
repair-node folds a gate whose latest attempt is a settled pass, durably record a fold marker
capturing the boundary tuple (the folding repair's attempt id, its selected writer, the sealed
pass candidate digest/declared map). On reopen of that gate, `deriveRepairDelta` synthesizes the
delta from the marker — `repair_attempt_id` = the folding attempt, `selected_writer` = the
folding repair's writer, before = sealed pass candidate, after = current candidate, paths = the
declared-blob diff — instead of refusing. Constraints: the marker must survive the fold's own
evidence purge (do not store it in the purged `.cache/<gate>.md`); any journal-schema extension
must round-trip the strict canonicalJson validators (journal validate, resume-check, and the
journal's phase/lineage checks); the fold semantics themselves stay conservative — keep purging
the stale pass evidence (a pass over the pre-repair tree must never certify the repaired tree),
keep the anti-laundering `baselineReused: true` invariant, and keep mid-gate (`in_progress`)
folds and the adversarial fan-out group purge exactly as they are. Option (a) (skip folding
passed gates whose surface the repair delta leaves untouched) is acceptable ONLY if (b) proves to
violate a journal invariant; record the choice and its evidence in the node evidence file. Option
(c) is the floor, not the goal: whatever wedge path (if any) remains reachable must refuse with a
detail that names the sanctioned, documented recovery (release-and-adopt or replan), and that
recovery is what `n2-documentation` writes into the repair-node plan-run card — coordinate the
refusal-text surface with n2 through your evidence file.

RED first for #713, in `scripts/test-adaptive-node.js`: build the schema-2 serial writer → gate
A → gate B scenario (the repo already has review-journal scenario harnesses near the existing
repair tests ~line 17750) and drive the issue's exact six steps; assert the folded-pass gate A
reopens without `review_repair_delta_unavailable` and the sequence reaches a finalize-ready state
with the claim intact. Extend `scripts/simulate-workflow-walkthrough.js` beside the existing
repair-node scenarios (~lines 15438, 16316) only if the semantics change forces those fixtures to
move — keep existing repair/fold/orphan-guard assertions green unchanged.

#714 — every `## Required Agent Compliance` emission path must produce a table that
`validateRequiredAgentCompliance` accepts byte-untouched. The issue's verbatim drift (stray blank
line splitting the table, a bare `code-reviewer` row lacking its `(node-id)` suffix, no blank
line before the following heading) is the specification. Bug anatomy (verified against source):
the append path of `addCloseCompliance` (`scripts/kaola-workflow-adaptive-node.js` ~line 2039)
emits `legacyRequirement || canonicalRequirement`, which is the BARE role for
code-reviewer/security-reviewer, while the validator
(`scripts/kaola-workflow-plan-validator.js` ~line 956) requires exactly `role (node-id)` for
every node. `spliceComplianceSection` (`scripts/kaola-workflow-adaptive-schema.js` ~line 3626)
inserts `'\n' + row` at `sec.next`: when the section already ends with a blank line before the
next heading, that blank migrates INTO the table on the next append, and the final row lands
immediately before the following `##` heading with no separating blank. Fix the producers:
appended rows ALWAYS carry the canonical `role (node-id)` cell (the node id is known at close
time — keep legacy bare-cell READ/match compatibility in `complianceRowExists` and the in-place
advance path so already-emitted legacy rows still advance, but never EMIT a bare cell); the
splice normalizes whitespace so table rows stay contiguous and exactly one blank line separates
the table from the following heading (or EOF). Keep the validator STRICT — do not relax
`validateRequiredAgentCompliance`; producer-side correctness is the fix (the issue's tolerance
option is explicitly secondary). Schema-2 freeze pre-seeds canonical pending rows and the
in-place advance path is already conforming; the round-trip test must pin BOTH the pre-seeded
advance path and the legacy no-section append path.

RED first for #714, in `scripts/test-adaptive-node.js`: the issue's round-trip — run close-node
over a 3-node plan (writer, code-reviewer, finalize) through a full open/close cycle, then feed
the untouched plan file straight into `validateRequiredAgentCompliance` and assert ok; pin the
three defects explicitly (no blank line inside the table, every row is `role (node-id)`, exactly
one blank before the next heading) for the legacy append path AND a schema-2 pre-seeded cycle
including a gate re-close after repair (the re-close must advance, not duplicate or drift). If
`scripts/simulate-workflow-walkthrough.js` cycle-level compliance assertions pin the drifted
format, update them to the conforming format.

GREEN for both fixes:
`node scripts/test-adaptive-node.js && node scripts/simulate-workflow-walkthrough.js && node scripts/edition-sync.js --check && node scripts/validate-script-sync.js`.
Also run `node scripts/test-replan.js` (the wedge fix sits adjacent to the replan-prepare
contract) and `node scripts/test-adaptive-handoff.js && node scripts/test-claim-hardening.js`
(compliance fixtures that must stay green), plus `node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js`
before closing — `npm test` does not run the two additive-edition suites.

### n2-documentation

Read the n1 evidence file first. Add one `[Unreleased]` CHANGELOG entry covering both fixes
(bundle closes #713 and #714 together). Update `docs/plan-run-cards/reopen-complete-node.md`
(the `repair-node` card) so it documents the folded-pass behavior after the #713 fix: what
repair-node now records when it folds an already-passed gate, how the folded gate's reopen
obtains its repair delta, and — satisfying #713's third acceptance criterion — the sanctioned,
documented recovery path for any wedge state that remains reachable, matching the refusal detail
text n1 actually shipped (read n1's evidence for the exact wording; do not invent a recovery
that the code does not offer). Docs only; no decision record is allocated for this bundle.

### n3-code-review

Act as the named schema-2 common code certifier for the producer. Read both issue bodies, the
n1 RED/GREEN evidence, and the n2 documentation diff. Verify each issue's acceptance criteria
against the actual diff: for #713 — the serial pass-then-later-fail sequence repairs and reaches
finalize-readiness without claim release, folded-pass gates reopen through the synthesized delta
(or passed gates with untouched surfaces are not folded, if n1 recorded that justified choice),
any residual wedge refusal names a sanctioned recovery, and the anti-laundering / orphan-guard /
fan-out-purge semantics are provably unchanged; for #714 — every emission path (pre-seeded
advance, legacy append, review-role re-close) produces a validator-conforming table, the
validator itself was NOT relaxed, and legacy bare-cell read compatibility is preserved. Confirm
no edition port was hand-edited (generated headers intact, `edition-sync --check` and
`validate-script-sync.js` green in evidence) and the three adaptive-schema copies are
byte-identical. Zero findings is a valid verdict; admit only concrete candidate-caused defects
with an exact trigger and proof.

### n4-falsify-lifecycle-fixes

Standalone adversarial change gate certifying the producer. Try to refute the headline claim
with the strongest falsification you can construct. For #713: build the serial pass-then-fail
matrix — vary which gate fails (first vs second), gate roles (code-reviewer / security-reviewer /
adversarial fan-out group), and repair timing (mid-gate in_progress fold, crash-window retry of
repair-node, re-close idempotency) — and show any sequence that still wedges, any folded-pass
reopen that certifies a stale tree, any synthesized delta that mis-attributes paths, or any
previously-passing repair/reopen path that newly refuses; run the issue's six-step reproduction
against the candidate. For #714: emit compliance rows through every path (legacy no-section
append, pre-seeded advance, review-role re-close after repair, batch/lane close) and show any
table `validateRequiredAgentCompliance` rejects — stray interior blanks, bare cells, heading
adjacency, duplicated rows — including CRLF and missing-trailing-newline inputs. Record a gate
verdict, not implementation advice; pass only if no counterexample survives.

### n5-finalize

Unique sink. Run the Meta `validation_command` once over the final post-documentation tree — all
four edition chains sequentially green via `npm test`, then `node scripts/test-kimi-edition.js`
and `node scripts/test-opencode-edition.js` — record the content-addressed receipt, verify the
named code certifier and the standalone adversarial gate are complete and fresh, then close
issues 713,714 together under the bundle all-or-nothing closure policy. Write no tracked file
from this node.

## Node Ledger

| id | status |
| --- | --- |
| n1-lifecycle-producer-fixes | complete |
| n2-documentation | complete |
| n3-code-review | complete |
| n4-falsify-lifecycle-fixes | complete |
| n5-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
| --- | --- | --- | --- |
| tdd-guide (n1-lifecycle-producer-fixes) | subagent-invoked | evidence-binding: n1-lifecycle-producer-fixes 76608b1dae09 | |
| doc-updater (n2-documentation) | subagent-invoked | evidence-binding: n2-documentation a6649907cf19 | |
| code-reviewer (n3-code-review) | subagent-invoked | evidence-binding: n3-code-review aa00ad32a72e | |
| adversarial-verifier (n4-falsify-lifecycle-fixes) | subagent-invoked | evidence-binding: n4-falsify-lifecycle-fixes a1f81fd47c13 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 2580ceca4882 | |
