# Workflow Plan — bundle-415-416

<!-- plan_hash: d38ee53e1374750c2bc64caa244dcf1f32fb9268366301ed22783c7d29a444d8 -->

## Meta
issues: 415, 416
labels: bug, area:scripts
summary: Two adaptive-correctness bug bundles. #415 — the #381/#388 freeze wall accepts an
  absolute-path write-set token (and its drive-letter twin), which freezes auto-run yet is dead at
  the repo-relative exact-path barrier → guaranteed mid-run write_set_overflow consent halt. Fix:
  refuse tok.startsWith('/') + ^[A-Za-z]: drive-letter in the same freeze-only block. #416 — Part A:
  the barrier_base_mismatch recovery hint ("re-run --record-base") cannot converge because
  --record-base's idempotent-reuse branch returns early without re-anchoring the ref; correct the
  wording to steer toward --drop-base+--record-base or ref-restore. Part B: cmdFinalize misclassifies
  an ONLINE probe failure (catch → 'skipped_offline') as close_pending, suppressing the
  remote-members-closed invariant; exclude 'skipped_offline' from the close-pending classification and
  surface the degraded probe. plan-validator.js + claim.js are COMMON_SCRIPTS (byte-identical
  canonical↔codex peer — must co-occur in one node, #274/#301) and the gitlab/gitea ports are
  rename-normalized hand-ported twins (#291 grep-the-symbol-across-4-trees).

## Nodes
| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-validator-fix | tdd-guide | — | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence | sonnet |
| n2-claimjs-partB | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-claim-hardening.js | 1 | sequence | sonnet |
| n3-regen-forge-ports | implementer | n1-validator-fix | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 1 | sequence | sonnet |
| n4-review | code-reviewer | n1-validator-fix, n2-claimjs-partB, n3-regen-forge-ports | — | 1 | sequence | opus |
| n5-docs | doc-updater | n4-review | CHANGELOG.md, docs/decisions/0009-freeze-wall-absolute-path-and-finalize-probe-classification.md | 1 | sequence | sonnet |
| n6-finalize | finalize | n5-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- **n1-validator-fix (#415 + #416 Part A — plan-validator, COMMON_SCRIPTS pair):** edit canonical
  `scripts/kaola-workflow-plan-validator.js`. plan-validator.js is a COMMON_SCRIPT (#274) whose
  canonical and `plugins/kaola-workflow/scripts/` copy are byte-identical (claude↔codex peer), so
  BOTH are in this write set and the codex peer is synced via `npm run sync:editions` (the validator
  refuses the canonical without its byte-peer — sync-group #301). (#415) In the #388 freeze-only
  write-set block (~787-808), add — alongside the existing backslash / trailing-`/` / `..` / bare-dir
  checks — a refusal of `tok.startsWith('/')` (typed reason, e.g. `absolute_path`) AND a drive-letter
  `^[A-Za-z]:` check (symmetry with the existing Windows-ism backslash refusal). Freeze-only;
  `revalidateForResume` MUST NOT be touched (a legacy in-flight plan must never brick — the same #388
  invariant the surrounding comment states). (#416 Part A) Correct the `barrier_base_mismatch`
  recovery-hint wording at BOTH sites — `--barrier-check` (~:1588) and `--node-end` (~:1637) — from
  "re-run `--record-base`" to "run `--drop-base` then `--record-base`, or restore the ref"; the
  idempotent-reuse branch (~:1508-1522) returns early on a non-empty base file WITHOUT re-anchoring
  the ref, so the old hint loops forever. The corrected wording must note that a fresh re-record after
  work was done would launder the crashed attempt, so steer toward ref-restore where work exists.
  Also edit `scripts/simulate-workflow-walkthrough.js`: add the freeze-wall scenario anchor for the
  absolute-path case (and the drive-letter twin) inside the existing #388 freeze-wall block
  (~1612-1700, mirroring the (c)/(d) backslash assertions) — a plan declaring an absolute
  `declared_write_set` token must `result === 'refuse'` with the new typed reason. tdd-guide: write
  the failing freeze-wall assertion first (validatePlanFixture absolute-path token → currently freezes
  in-grammar → must flip to refuse), then make it pass.
- **n2-claimjs-partB (#416 Part B — claim.js COMMON pair + 2 forge twins):** claim.js is a
  COMMON_SCRIPT (canonical `scripts/kaola-workflow-claim.js` byte-identical to the codex peer
  `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — both in this write set, codex peer synced
  via `sync:editions`), PLUS the rename-normalized hand-ported forge twins
  `kaola-{gitlab,gitea}-workflow-claim.js`. In `cmdFinalize` the ONLINE probe error path
  `catch (_) { remoteIssueClosed = 'skipped_offline'; }` produces `skipped_offline`, but
  `closePendingFinalize = !keepIssueOpen && !OFFLINE && remoteIssueClosed !== 'already_closed' &&
  remoteIssueClosed !== 'closed'` is still true → a forge outage at finalize silently downgrades the
  `remote-members-closed` invariant. Fix in canonical (~:1870) AND both forge twins (gitlab ~:1769,
  gitea ~:1748): exclude `'skipped_offline'` from the close-pending classification (treat
  probe-failure as "unknown", not "pending") AND surface the degraded probe in the receipt. Forge
  prose must stay forge-neutral (#341): the twins reference "the forge", never a forge brand/CLI.
  Add the probe-failure-classification unit to `scripts/test-claim-hardening.js`. #291 lesson: the
  twins are edition-named ports NOT found by base-filename grep — both are explicitly in this write
  set. tdd-guide: write the failing classification unit first (online probe error must NOT classify as
  close_pending), then fix all three claim copies.
- **n3-regen-forge-ports (regen the rename-normalized plan-validator forge ports):** plan-validator.js
  is an edition-sync `GENERATED_AGGREGATOR` (#401 Part 2); its gitlab/gitea ports are forge-renamed
  (`kaola-{gitlab,gitea}-workflow-plan-validator.js`), NOT byte-identical to canonical, so they are a
  SEPARATE regen step (the byte-identical codex peer is already synced inside n1). Depends on n1 (the
  canonical fix must land first). Regenerate via `npm run sync:editions`
  (`node scripts/edition-sync.js --write`) and COMMIT the two regenerated forge ports. Verify with
  `node scripts/edition-sync.js --check` (must report no drift) — this is the gate the gitlab/gitea
  npm chains run. implementer (no natural failing unit test — mechanical codegen of byte-derived forge
  ports; correctness is asserted by `edition-sync.js --check`, not a failing-first unit test).
  non_tdd_reason: mechanical regeneration of rename-normalized forge ports from the fixed canonical;
  verification is `edition-sync.js --check`, which has no failing-first unit-test form.
- **n4-review (G1):** code-reviewer post-dominates every code-producing node (n1, n2, n3). opus —
  the changes are subtle freeze-wall / barrier-recovery / probe-classification correctness across the
  edition-port surface; a strong reviewer earns its keep. Confirm: #415 freeze-only (resume untouched),
  drive-letter symmetry; #416 Part A hint at BOTH sites + reuse-branch reasoning; Part B excludes
  skipped_offline in ALL THREE claim copies + degraded-probe surfaced + forge-neutral twin prose; the
  regenerated forge ports + codex peers are drift-clean. Cross-edition diff → ALL FOUR npm chains
  (`test:kaola-workflow:{claude,codex,gitlab,gitea}`) must be green, run sequentially (a green claude
  chain alone is insufficient — #307).
- **n5-docs (#337 decision record + CHANGELOG):** the next free decision-record number is 0009
  (existing series runs 0001-0008). Write
  `docs/decisions/0009-freeze-wall-absolute-path-and-finalize-probe-classification.md` recording the
  freeze-wall absolute-path refusal + the finalize probe-classification correction, and add a CHANGELOG
  `[Unreleased]` entry under `### Fixed` covering both #415 and #416. No public-interface/API change
  beyond the validator's new typed refusal reason, so docs/api.md/README are not required.
- **n6-finalize (sink):** docs/state only — the CHANGELOG entry is the sole write. Phase-6 finalize
  runs the four-chain cross-edition verification (#307) and the bundle close (both #415 and #416 are
  members; remote-members-closed fires truthfully at sink).

## Node Ledger
| id | status |
| --- | --- |
| n1-validator-fix | complete |
| n2-claimjs-partB | complete |
| n3-regen-forge-ports | complete |
| n4-review | complete |
| n5-docs | complete |
| n6-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-validator-fix) | subagent-invoked | evidence-binding: n1-validator-fix fa0346f5537f | |
| tdd-guide (n2-claimjs-partB) | subagent-invoked | evidence-binding: n2-claimjs-partB 986dd1a2c571 | |
| implementer (n3-regen-forge-ports) | subagent-invoked | evidence-binding: n3-regen-forge-ports bcd2de5dbb83 | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review ce4fd439ac3d | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 3a4df3662693 | |
