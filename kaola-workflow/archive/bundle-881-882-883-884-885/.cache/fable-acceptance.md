# Fable acceptance verification — bundle 881/882/883/884/885 (FINAL, round 3)

Adversarial verification of the claim: "issues #881–#885 have each had their stated acceptance
criteria met by the diff on `workflow/bundle-881-882-883-884-885`." Three rounds: read-only,
execution round 1 (which refuted the then-current tree on F1/F4), and this round 3 re-verification
after the F1–F4 repairs landed. Round-3 mutations ran on a FRESH mirror rebuilt from the current
worktree (`…/scratchpad/fable-exec2`), green baseline established BEFORE any mutation
(parity 768, validate-workflow-contracts 0); every mutated file cmp-verified back to worktree
bytes afterwards; the worktree itself was never written. Exit codes captured directly.

I did not accept the team-lead's transcripts for F1/F4 — both were re-derived with my own
mutations on my own mirror.

## Round-3 verdict changes

### F1 — test-custody guard: **CLOSED, verified by execution**
`ROLE_PINS` now carries six polarity-bearing custody pins (test-agent-profile-parity.js:37-50),
normalized-matched, presence-first, mirrored into all three toml trees. My mutations:
- Full inversion of `agents/implementer.md` (same bytes as my round-1 refutation) → exit 1,
  **3 pin failures naming each inverted sentence**; restore → exit 0 (768).
- Custody line deleted from ONE codex `implementer.toml` (canonical intact) → exit 1,
  "in agents/implementer.md but MISSING from …" + triple-identity failure.
- Reciprocal half inverted in `agents/tdd-guide.md` ("Custody governs writing, not reading." →
  laissez-faire) → exit 1 naming the tdd-guide pin.
The four-vs-three runtime split that opened #883 is no longer reachable silently.

### F4 — init-template ban scope: **CLOSED, verified by execution**
`validate-workflow-contracts.js` (~:470-509) now bans the full 8-term `retiredExecutor` list
INSIDE the KW-CLAUDE-TEMPLATE region on BOTH the skeleton and the rendered root surface, plus
seven positive mission-list needles, plus marker-presence and empty-region vacuity fences. My
mutations, each restored to green:
- Full DAG sentence into the skeleton region → exit 1, 'found "workflow-plan.md" inside the
  KW-CLAUDE-TEMPLATE region'.
- `running-set` ALONE into the region → exit 1 naming "running-set" (second ban term proven in
  isolation — not a single-needle guard).
- `workflow-plan.md` into the RENDERED `commands/workflow-init.md` region → exit 1 (rendered
  direction armed independently of regeneration).
- Positive needle "Three write moments" removed → exit 1, "must teach the mission list — …
  missing" (a blanked/neutered region cannot pass the bans vacuously).

### F2 — `node-id` era token: **CLOSED, verified**
Zero occurrences across `generate-reviewer-profiles.js` render output, the 3 canonical reviewer
.mds, all 9 tomls, and all six `.opencode*`/`.kimi*` trees (dot-dirs named explicitly). The only
remaining hits are the generator's own `RETIRED_VOCABULARY_BAN` regex (:192) and its comment.
The ban is ARMED, proven by mutation: reintroducing `gate_effect` into
`templates/reviewers/behavior-contracts.json` → `generate-reviewer-profiles.js --check` exit 1,
`retired_vocabulary_forbidden: agents/code-reviewer.md: gate_effect`. Restored, green.

### F3 — #881 stale wordings: **CLOSED, verified from the running CLI**
`kaola-workflow-release.js --cut --json` (executed) now emits: "run the offline full chain
receipt **(skip if a green receipt already carries over)**"; `docs/api.md` `--cut` block carries
the identical step literal; `docs/conventions.md:572-577` is rewritten — "`--tag` no longer
performs its own separate check — it binds to candidate HEAD via the same route … so the two
cannot disagree"; the "candidate-bound offline receipt" phrase is gone.

### CHANGELOG.md:9 — "All three now catch what they were built to catch": **NOW TRUE**
All three named catches re-proven live on the CURRENT tree by my own mutations: custody inversion
→ parity exit 1 (3 pins); generator two-line-stub → test-opencode-edition exit 1 (39 fails);
`SHARED_STATE_FIELDS` rename → field-parity exit 1. My round-1 refutation of this sentence is
resolved by the fix, not withdrawn — it was true when taken (parity was then 720, pre-pin).

## Carried forward from rounds 1–2 (unchanged, all executed)

- **#881 end-to-end**: test-release.js 301/301; independent 3-class typed-reason driver 18/18
  (`chains_stale` on a non-prep gap / pass with `binding: release_prep_carry_over` and a landed
  tag over an untouched receipt / `chains_waived` on a waived receipt over a prep-only gap) —
  both CLIs matched MY per-class expectations, not merely each other.
- **#882**: two bans proven in isolation (each red naming its own label), full DAG revert red,
  positive mission-list anchor red on removal, restores green.
- **#883 armed-guard sweep**: six defect injections each redded the intended guard with the
  intended message (safety-rule .md and .toml deletions, field rename, generator stub, kimi
  roster drop against the filesystem-anchored floor, `emittedSkillTargets` vacuity fence).
- **#884**: 17/17 regions reasoned (15 capability, 2 declared known residuals), vendor note gone
  from Claude command surfaces, codex init dead-end closed, badge fix fail-closed.

## Remaining residue — LOW severity, non-blocking, non-shipping

- F5: three orphan references to deleted machinery in non-shipping repo tooling:
  `templates/routing/rename-table.js:22` (design-invariant comment names `repair-state.js`),
  `scripts/measure-site-execution.drivers.txt:20,29` and
  `scripts/test-spawn-classification.js:102` (rows for the deleted `test-plan-validator.js` /
  `test-replan.js`). None reaches a consumer or operator surface; a one-commit sweep.
- F6: two dead A14 blocklist entries (`test-opencode-edition.js:306-308`) whose universal now
  lives upstream in `assertNoBadgeResidue`; harmless, kept rather than deleted with their
  mechanism.

## Final verdicts

| issue | verdict |
|---|---|
| #881 | **MET** — one implementation (kernel), one wording (CLI + api.md byte-identical step, conventions rewritten), oracle executed end to end with independent typed-reason expectations |
| #882 | **MET** — mutation-proven both directions, two bans isolated, positive anchor proven |
| #883 | **MET** — custody pins and template-region bans landed and were broken/restored by my own mutations in every direction; all added guards proven able to fail; residue F6 only |
| #884 | **MET** |
| #885 | **MET** on what ships — `node-id` eradicated with an armed recurrence ban; residue F5 only |

**Bundle shippability: shippable.** Every blocking finding from rounds 1–2 is closed and was
re-verified by independent mutation on the current tree; F5/F6 are cheap cosmetic sweeps that can
ride any later commit.

verdict: pass
findings_blocking: 0
domain_outcome: not_refuted
claim_outcome: not_refuted

finding: id=F5 scope=in_scope action=defer status=open severity=low fix_role=implementer rationale=orphan refs to deleted machinery in non-shipping tooling: rename-table.js:22 repair-state.js; drivers.txt:20,29 + test-spawn-classification.js:102 rows for deleted test files
finding: id=F6 scope=in_scope action=defer status=open severity=low fix_role=tdd-guide rationale=two dead A14 blocklist entries (test-opencode-edition.js:306-308); their universal moved upstream into assertNoBadgeResidue
