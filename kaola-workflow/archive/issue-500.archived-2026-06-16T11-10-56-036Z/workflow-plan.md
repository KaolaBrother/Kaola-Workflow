# Workflow Plan — issue-500

<!-- plan_hash: fd1d15c0196dc0dc64517787a6002463d28713b1ff1034b05413c5fe9d7581c8 -->

Build run implementing the owner-approved (2026-06-16) per-lever decision recorded in
decision-record D-500-01 (existing): WIRE all three #500 makespan levers the SAFE way and CLOSE #500.

- **L1** — `write_overlap_policy` relaxation: leg-COUPLED safe wire (forward `--write-overlap-consent`
  into `tryFormLaneGroup`/lane-group formation ONLY under `resolveLegIsolation(process.env) &&
  opts.writeOverlapConsent`, mirroring the provisioning conjunction at adaptive-node.js:~3899) so a
  shared-infra co-open can never form unless legs are actually provisioned + a NEW shared-infra-coarse
  end-to-end test in `scripts/test-adaptive-node.js` exercising form→provision→synthesize→barrier.
- **L2** — `KAOLA_LEG_ISOLATION` honesty wire: document the FULL activation recipe
  (`KAOLA_LANE_CONTAINMENT` + `KAOLA_LEG_ISOLATION` + `--write-overlap-consent`) across the six
  plan-run surfaces and FIX the stale "DORMANT" comments at adaptive-node.js:~3366-3370 / ~3890-3897
  (reword to ADR-0010 "containment-not-construction"; no behavior change).
- **L3** — `speculative_open_policy:consent` prose wire: a new `docs/plan-run-cards/speculative-open.md`
  card + six `<!-- CARD: speculative-open -->` markers + a driver line. (The planner-rubric for the
  proactive win is OUT OF SCOPE — filed as #513.)

Cross-edition diff: adaptive-node.js is byte-identical ×4 (generated forge ports); prose propagates to
the #400 six surfaces. ALL FOUR `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be
green before finalize. Known infra caveat #512: the claude chain runs ~574s standalone-green but
`run-chains.js`'s hardcoded 600s timeout can record a false `chains_red` — use the `--accept-known-red
claude:512` waiver with standalone-green evidence; do NOT hand-edit the receipt or bump the timeout; run
one chain at a time.

## Meta

labels: enhancement, area:scripts
sink: CHANGELOG.md

## Plan Notes

- **n1-design** (planner, opus): the L1 safe-coupling is the load-bearing correctness claim — the
  leg-couple conjunction (`resolveLegIsolation(process.env) && opts.writeOverlapConsent`) gating
  lane-group FORMATION, not just provisioning, so a shared-infra co-open can NEVER form when
  `KAOLA_LEG_ISOLATION=0`. n1 fixes the spec: exactly how `tryFormLaneGroup` threads the consent flag
  to the validator's `--parallel-safe --write-overlap-consent`, the coupling site (~3815-3816 vs the
  ~3899 provisioning conjunction it mirrors), and how the NEW shared-infra-coarse e2e test must
  exercise the full relaxation→form→provision→synthesize→barrier path (the existing `makeLaneRepo`,
  test-adaptive-node.js:~4918, is disjoint-only and never runs the relaxation path). Read-only.
- **n2-code-leg-couple** (tdd-guide, sonnet): test-FIRST — author the failing shared-infra-coarse e2e
  test in `scripts/test-adaptive-node.js` (RED: relaxation path never runs end-to-end today), then the
  leg-coupled L1 wire + the L2 stale-comment reword (~3366-3370, ~3890-3897 — ADR-0010
  containment-not-construction, NO behavior change) in canonical `kaola-workflow-adaptive-node.js`.
  GENERATED_AGGREGATOR: edit canonical, run `node scripts/edition-sync.js --write` to regenerate the
  codex byte-twin + gitlab/gitea rename ports, declare ALL FOUR ports. The new test runs only on the
  claude chain (`test-adaptive-node.js` is root-only); the codex/gitlab/gitea chains exercise the
  edition adaptive-node.js ports via their contract validators + walkthroughs.
- **n3-prose-wire** (implementer, sonnet): non_tdd_reason — doc/prose wiring with no natural failing
  unit test. L2 activation-recipe prose (name `KAOLA_LEG_ISOLATION` + `--write-overlap-consent` +
  `write_overlap_policy`/`coarse` alongside the existing `KAOLA_LANE_CONTAINMENT`) + L3 card markers
  across the six #400 surfaces (forge-NEUTRAL prose — no CLI binary names in the edition plugin
  trees), the new `docs/plan-run-cards/speculative-open.md` card (driver: on `open-next` →
  `gate_not_complete` with a speculative gate AND plan policy consent → `open-ready
  --speculative-consent`; drive `discard-speculative` on gate verdict:fail) + the
  `docs/plan-run-cards/README.md` index row, and fail-closed route-reachability T-pins in
  `scripts/test-route-reachability.js` (mirror the T6 closure-audit pattern — unconditional `assert()`
  per surface, NOT the self-disarming T5 `anyHasPin` gate) for `<!-- PIN: leg-isolation-recipe -->`
  and `<!-- PIN: speculative-open -->`. Depends on n2 to keep the shared `scripts/` lane serial
  (n2 + n3 both touch `scripts/` — not a disjoint top-level lane — so n3 follows n2).
- **n4-adversarial** (adversarial-verifier, opus): adversarially refute the L1 safe-coupling claim —
  (a) does the leg-couple conjunction actually prevent the #283/#303 corruption mode when
  `KAOLA_LANE_CONTAINMENT=1 --write-overlap-consent` but `KAOLA_LEG_ISOLATION=0` (group must NOT
  form)? (b) does the new e2e test genuinely traverse the relaxation→form→provision→synthesize→barrier
  path, not the disjoint green short-circuit at plan-validator.js:~1895? Has Bash; read-only.
- **n5-review** (code-reviewer, opus): G1 post-dominator over n2 + n3; run `--forbidden-only` for the
  forge-touching edition ports + verify the four-port byte/rename parity (`edition-sync.js --check`).
- **n6-docs** (doc-updater, sonnet): MINT a NEW decision record `docs/decisions/D-500-02.md` (next free
  number after reading `docs/decisions/`) recording that D-500-01 (existing) was accepted (owner-approved
  2026-06-16) and implemented in this run — the per-lever wire direction is now live. Do NOT in-place
  edit D-500-01 (existing): it stays accurate as the investigation recommendation record; D-500-02
  supersedes it cleanly with the acceptance + implementation outcome.
- **n7-finalize** (finalize, sink): CHANGELOG [Unreleased] entry + closure. Before finalize, run all
  four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green (one at a time); on a
  #512 claude-chain false timeout use `--accept-known-red claude:512` with standalone-green evidence.
  GOAL: every #500 makespan lever is reachable on the live path (wired).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-design | planner | — | — | 1 | sequence | opus |
| n2-code-leg-couple | tdd-guide | n1-design | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | sonnet |
| n3-prose-wire | implementer | n2-code-leg-couple | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, docs/plan-run-cards/speculative-open.md, docs/plan-run-cards/README.md, scripts/test-route-reachability.js | 9 | sequence | sonnet |
| n4-adversarial | adversarial-verifier | n2-code-leg-couple | — | 1 | sequence | opus |
| n5-review | code-reviewer | n2-code-leg-couple, n3-prose-wire, n4-adversarial | — | 1 | sequence | opus |
| n6-docs | doc-updater | n5-review | docs/decisions/D-500-02.md | 1 | sequence | sonnet |
| n7-finalize | finalize | n6-docs | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-design | complete |
| n2-code-leg-couple | complete |
| n3-prose-wire | complete |
| n4-adversarial | complete |
| n5-review | complete |
| n6-docs | complete |
| n7-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner (n1-design) | subagent-invoked | evidence-binding: n1-design 7011b4f18b80 | |
| tdd-guide (n2-code-leg-couple) | subagent-invoked | evidence-binding: n2-code-leg-couple 64cd686e86b3 | |
| adversarial-verifier (n4-adversarial) | subagent-invoked | evidence-binding: n4-adversarial db7d3a321a71 | |
| implementer (n3-prose-wire) | subagent-invoked | evidence-binding: n3-prose-wire 229f3e139d15 | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review 9b6e842ab553 | |
| doc-updater (n6-docs) | subagent-invoked | evidence-binding: n6-docs c2dc3398df70 | |
| finalize (n7-finalize) | main-session-direct | evidence-binding: n7-finalize 6f3c202116c0 | |
