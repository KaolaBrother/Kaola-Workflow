# Finalization Summary — bundle-623-627-628

Closes: #623, #627, #628 (all-or-nothing bundle closure)

## Path

`workflow_path: adaptive`. 8-node DAG. A 3-member parallel_safe write LANE GROUP:
n1-plan-run-debloat (implementer/reasoning — 6 plan-run surfaces) ∥ n2-finalize-surfaces
(implementer/standard — 6 finalize surfaces + docs/api.md) ∥ n3-workflow-next-resolver
(implementer/standard — 6 workflow-next surfaces) as isolated legs → n4-cards-planner-topup
(implementer/standard — serialized behind n2 by the planner's own parallel_allowband_collision
self-repair, both declared `docs/**`) → n5-review (code-reviewer/reasoning) → n6-adversary
(adversarial-verifier/reasoning) → n7-docs (doc-updater) → n8-finalize.

## What shipped

- **#627 (PARTIAL)** — routing-surface skeleton debloat restoring ~480 → toward the ~150-line target.
  fix#1 (ladder → `join-protocol.md` card pointer, commands-only), fix#3 (Goal-Attestation compression +
  enum → `docs/api.md`), fix#4 (`$CLAIM_JS` resolver self-containment), fix#5 (rot-scar section-cites)
  SHIPPED. **fix#2 (runtime-dead-prose fencing) DESCOPED → #636** — the Codex dispatch + Claude
  Teammate-Mode blocks are machine-pinned on all six surfaces (route-reachability T5b/T14 + four contract
  validators), so honest fencing needs cross-runtime pin relocation (script logic this prose bundle
  excluded). ADR: `docs/decisions/D-627-01.md`.
- **#623** — the false "rolling top-up drains a wide write frontier as members close" promise on three
  surfaces (plan-run command, workflow-planner, frontier-batch card) scoped to READ frontiers; wide WRITE
  frontiers documented to run in fixed group waves (membership/write_union/baseline fixed at formation).
  Chose prose honesty over live-group member admission (deferred — invariant blast radius). ADR:
  `docs/decisions/D-623-01.md`.
- **#628** — three-tier speculation rows (`auto`/`consent`/`off`) added to the frontier-batch card +
  workflow-planner; the freeze-illegal directory-shaped write-set example replaced with a freeze-legal
  exact-path pair (`api/routes.js`, `cli/main.js`); README speculative-open row reworded to three-tier
  (R1, trivial-inline finalize edit).

## Production validation landed in this bundle

**#633 lane-group fix VALIDATED on a 3-member group.** n1∥n2∥n3 legs merged via the synthesizer
(`102b3411 kw-synth`) to `barrier: group_passed, synthesized: true` with NO merge conflict and NO manual
pre-seed — the tracked-evidence-stub seeding (`kw-stub:` on the parent before legs branch) held on a
three-way octopus merge. Second production confirmation of #633 this session (after the 2-member
bundle-632-635), now on a wider group.

## Gates

- n5-review (code-reviewer, model=fable): verdict pass, 0 blocking. 1 LOW finding R1 (README:17 stale
  consent-only framing failing #628's directory-wide grep AC) — RESOLVED in-run via a main-session
  trivial-inline three-tier reword (`docs/**` is the barrier-invisible allowband, so the out-of-write-set
  edit cannot trip unattributed_change). n5 evidence updated: R1 `status=resolved`.
- n6-adversary (adversarial-verifier, model=fable): verdict pass, 0 blocking. Execution-based content-diff
  proving every removed line has a live card home, every machine-pinned token survives on all six surfaces,
  #628 freeze-legality proven by running the validator both directions, and R1 fix confirmed
  correct+complete+attribution-safe.
- Script-enforced gates (final committed tree, headSha 45be0011): --resume-check pass, --gate-verify pass,
  --barrier-check pass (0 errors/unattributed), --verdict-check pass (n5+n6 both verdict:pass, R1 resolved).
- --finalize-check (chain-receipt, UNWAIVED): pass — all four chains genuinely green, no `:635` waiver
  (#635 fixed).

## Run gaps

- **#627 fix#2 (runtime-dead-prose fencing) deferred → `filed: #636`.** Not achievable as prose (cross-runtime
  pins T5b/T14 machine-required on all six surfaces); needs cross-edition pin relocation. Roadmap source
  `.roadmap/issue-636.md` added; ADR D-627-01 records the rationale.
- **R1 (code-reviewer finding, README:17) → `noise: resolved-in-run-trivial-inline-edit`.** A stale
  consent-only framing on a `docs/**` allowband file that no frozen-plan node's write set covered; fixed
  in-run by a one-line three-tier reword (Trivial Inline Edit Exception), independently confirmed by
  n6-adversary. Not a product defect; no follow-up warranted. NOT an `in_run_repair` reopen (main-session
  inline edit, no node reopened), so the machine gap-sweep records no swept class.

## Implementation commits

- `e661d2b8` / `36eb8ece` (lane-group legs n1/n2) + `102b3411` (kw-synth 3-way octopus merge) — the
  n1/n2/n3 routing-surface debloat, committed by the lane-group synthesizer.
- `3464da53` — `fix(routing): #627 partial debloat carry-overs` (n4 planner top-up + README R1 fix).
- `45be0011` — `docs: D-623-01 + D-627-01 ADRs + CHANGELOG`.

## Goal attestation

`KAOLA_GOAL` reflects the standing session goal — `goal_check: satisfied` expected.
