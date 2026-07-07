# Finalization Summary — bundle-630-636 (SHAPING RUN — checkpoint, NOT a closure)

Issues: #630, #636 — **STAY OPEN**. This is the read-only SHAPING half of the bundle (Case B); it
produces a settled design and re-plans the implementation as two fresh build runs. No issue closes here.

## Path

`workflow_path: adaptive`, DECISION/DESIGN-shaped (Case B: shape-first read-only shaping run, then
RE-PLAN). 7-node investigation DAG: n1/n2/n3 probes (read fan-out, concurrent) → n4-assume-design
(planner opus) → n5-critique-design (adversarial-verifier fable) → n6-converge-shape (planner opus) →
n7-finalize (docs/state sink).

## What shipped (docs only)

- `docs/investigations/2026-07-08-630-636-routing-generation-seam.md` — the settled two-layer design.
- `CHANGELOG.md` [Unreleased] ### Documentation entry.

## Design outcome

**Repaired Candidate D (two-layer):** a single-source required-block MANIFEST giving a *presence*
guarantee across all 18 routing surfaces (finalize included; closes the #624 whole-block-drop class by
construction — the per-block surface set is derived from runtime/surface-type tags, so 4-of-6 is
structurally impossible) + byte-generation confined to the template-shaped plan-run/next topics.
Finalize stays hand-authored but manifest-guarded (its 2:1 rewrite makes generation a precedence-#1
accuracy risk). **Coupling:** ship #636 first standalone (its validator relocation is a prerequisite
for #630's fenced generation), then #630 on the fenced base.

## Gates

- n5-critique-design (adversarial-verifier, fable): verdict FAIL, findings_blocking 3 — an INVESTIGATION
  adversary (post-dominates no code node → verdict-check EXEMPT). It RAN the chains and empirically
  refuted the design AS FIRST DRAFTED (R1 #636 write-set gap proven four-chain-red; R2 by-construction
  under-specified; R3 drift-class premise + gitea booby-trap), while validating the two-layer
  architecture as the right shape. Its 3 findings were FOLDED into the design by n6 (not deferred).
- Script-enforced gates (final tree): --resume-check pass, --gate-verify pass, --barrier-check pass
  (0 errors/unattributed — docs/** allowband + CHANGELOG attributed to n7), --verdict-check pass
  (n5 investigation-exempt).
- Chain receipt: docs-only changes (design doc not chain-asserted; CHANGELOG is) — receipt runs green
  (no code changed).

## Run gaps

- **n5-critique-design verdict:fail → `noise: investigation-adversary refined the design in-run`.** The
  adversary's three findings (R1/R2/R3) are analytical design critique, not product defects; all three
  were folded into the settled design (`docs/investigations/2026-07-08-...md`) by n6-converge-shape. No
  code exists to be defective (read-only run); no follow-up issue warranted. NOT an `in_run_repair`
  swept class (no node reopened — the fail fed n6 organically).
- **#630 and #636 intentionally remain OPEN** — this is the shaping half; the two build runs (Run 1
  #636, Run 2 #630) close them. This is by design, not an unswept gap.

## Implementation commits

- (docs) `docs: #630/#636 routing-generation-seam settled design + CHANGELOG` — the design doc + CHANGELOG.
- (archive) `chore: archive bundle-630-636` — the shaping-run project folder (issues kept open,
  roadmap sources for #630/#636 preserved).

## Goal attestation

`KAOLA_GOAL` set. This is the SHAPING half — goal_check satisfied by using the skills + delegating the
subagents the workflow demanded + producing/surfacing the design; NOT by end-state closure. #630/#636
stay open for the build runs. `goal_check: satisfied`.
