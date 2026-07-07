evidence-binding: n8-docs 4441d8e91127

# n8-docs — documentation for the #630 two-layer routing-surface generation seam

## Files written (exactly the declared two-file write set; no code, no CHANGELOG touched)

1. `docs/conventions.md` (modified, +2 lines) — added one new bullet immediately after the
   existing "Routing / adaptive prose propagates to SIX prose surfaces" bullet (§ Routing /
   adaptive prose area), before the "Shared engine `workflow-state.md` field parity" bullet.
   Records: the 12 template-shaped plan-run/next surfaces (3 commands + 3 SKILLs each) are now
   GENERATED from `templates/routing/plan-run.skeleton.md` / `next.skeleton.md` +
   `templates/routing/slots.js` + `templates/routing/rename-table.js` via
   `scripts/generate-routing-surfaces.js`; never hand-edit those 12 — edit the
   skeleton/slots/rename-table and run `node scripts/generate-routing-surfaces.js --write`; a
   `--check` byte-guard is wired into all four `npm run test:kaola-workflow:*` chains; the 6
   finalize surfaces stay hand-authored (~2:1 command/SKILL divergence), guarded only by
   `templates/routing/required-blocks.js`, the single-source required-block manifest whose
   derived-universe presence checker (in `scripts/test-route-reachability.js`) computes each
   block's obligated surface set from its tags so a subset-obligation (the #624 whole-block-drop
   class) is impossible by construction; manifest is additive-superset over the pre-existing
   token pins (unchanged).

2. `docs/decisions/D-630-01.md` (new) — confirmed free via `ls docs/decisions/ | grep D-630`
   (no prior D-630-NN existed). Followed the house ADR format (Title/Date/Status/Issue/
   Related/Context/Decision/Consequences/Non-goals/Alternatives), modeled on D-636-01.md and
   D-627-01.md. Content grounded in `.cache/n1-plan.md` (build spec), `.cache/n6-review.md` and
   `.cache/n7-adversary.md` (both verdict: pass, findings_blocking: 0): the two-layer design
   (Layer 1 presence manifest over all 18 surfaces incl. finalize; Layer 2 byte-generator over
   the 12 plan-run/next surfaces only), the behavior-preserving no-op capture (12/12 surfaces
   byte-unchanged, live-proven by both reviewer and adversary), the #624-class closure, the
   accepted finalize residual (fn-closure-audit's marker-substring token, tracked as a follow-up),
   and the untouched GitLab/Gitea `mr|pr)` finalize-sink pins.

## Verification of scope

- `git status --porcelain docs/ CHANGELOG.md` before/after this node's edits shows only
  `docs/conventions.md` (modified) and `docs/decisions/D-630-01.md` (new, untracked) under
  `docs/`; `CHANGELOG.md` was not touched (that belongs to the finalize node per the task).
- No file under `scripts/`, `templates/`, `commands/`, or `plugins/` was written by this node.
- Every claim in both documents traces to a line in the diff, `templates/routing/`,
  `scripts/generate-routing-surfaces.js`, or the n1/n6/n7 evidence; nothing fabricated.

delegation_outcome: completed
