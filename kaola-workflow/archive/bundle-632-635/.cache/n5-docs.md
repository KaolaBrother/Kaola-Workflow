evidence-binding: n5-docs 05d6480c6a44

## Task

Write ONE new decision record for bundle-632-635, `docs/decisions/D-632-01.md`, capturing:
1. #632's substantive decision — closing the second fail-open `chainReceiptGreenness` consumer
   with a `chains_empty` guard (mirroring the #618 precedent), and the resolved value-call that
   `--cut` stays informational-only (does not gate on chain greenness).
2. A brief companion note on #635's test-harness determinism fix (deterministic in-process
   signal-death seam in `test-run-chains.js`), since this is the bundle's only ADR.

No other file touched: no CHANGELOG.md (finalize node's job), no api.md /
workflow-state-contract.md (verified — `chainReceiptGreenness`'s reason enum is not documented
there), no code/test file.

## Grounding

Confirmed `D-632-01` is the next free id: `ls docs/decisions/ | grep -E 'D-632|D-635'` → no
matches (exit 1) before writing.

Read for grounding: `.cache/n1-release-greenness.md` (the RED/GREEN evidence for the
`chains_empty` guard and the `--cut` comment fix), `.cache/n2-runchains-flake.md` (the #635
deterministic-seam fix), `.cache/n3-review.md` (code-reviewer APPROVE verdict, confirms guard
precedence slot + edition parity + comment-only `--cut` change), `.cache/n4-adversary.md`
(adversarial-verifier NOT-REFUTED verdict, 19 zero-verified-chains shapes + 22-run
load-insensitivity proof), and the frozen `workflow-plan.md` (VALUE-CALL RESOLUTION bullet — the
authoritative #632 reasoning: `--cut` cannot gate on a receipt that doesn't exist yet at cut
time because the offline pre-cut check runs before the online `npm test` that produces it).

Also directly verified against the live source (not just the cache evidence) before writing,
to avoid fabricating line numbers or wording:
- `scripts/kaola-workflow-release.js:249-266` — `chainReceiptGreenness`, confirmed the
  `chains_empty` guard's exact location (after the `chains_stale` HEAD-bound check, before the
  red-chain loop) and its comment citing the #618 precedence order.
- `scripts/kaola-workflow-release.js:373-378` — confirmed the corrected `runVerify` comment
  already states reality (informational `chain_warning`, `--cut` does not gate, offline-before-
  online sequencing) and already cites `D-632-01` — the record this node creates.
- `scripts/kaola-workflow-plan-validator.js:86-92,2709-2818` — confirmed the #618 precedent's
  exact precedence order (`chains_unverified > chains_stale > chains_empty > chains_red`) and
  operator-hint wording that this decision's guard mirrors.

Read a recent ADR for house style: `docs/decisions/D-619-01.md` and `D-622-01.md` (header
block with Date/Status/Issue/Related, Context/Decision/Consequences/Non-goals/Alternatives
considered shape).

## Write

Wrote `docs/decisions/D-632-01.md` (NEW file, confirmed via `ls` pre-check it did not already
exist). Structure follows house style: header (Date/Status/Issue/Related), Context (the
fail-open bug + the stale `--cut` comment), Decision (three numbered items: the guard, the
resolved `--cut` value-call, atomic four-edition porting), validation summary, Consequences,
Non-goals, Alternatives considered, then a short "Companion fix" section for #635 (explicitly
framed as not a design decision in its own right, per the task brief).

Content is grounded exclusively in the cache evidence + verified source reads above — no
fabricated line numbers, reason strings, or test names. Every specific claim (guard location,
precedence order, `--cut` never reading `green`, the four-edition porting, the #635 seam
mechanism, the 22-run adversarial proof) traces to one of the read files above.

## Write set touched (exactly one file)

- `docs/decisions/D-632-01.md` (new)

Confirmed no other file touched: `git status --short docs/` shows only
`?? docs/decisions/D-632-01.md`. `git status --short kaola-workflow/bundle-632-635/.cache/`
shows this evidence file plus the pre-existing untracked bundle scaffolding (barrier
receipts, dispatch/provenance logs, running-set.json, sibling nodes' evidence) — none of it
touched by this node beyond this evidence file itself.

## Verification

- `ls docs/decisions/D-632-01.md` → exists.
- No code, test, or other doc file edited (Read-only reads of `scripts/kaola-workflow-release.js`
  and `scripts/kaola-workflow-plan-validator.js` for grounding; no Edit/Write calls against
  either).
- Did not touch CHANGELOG.md, docs/api.md, or docs/workflow-state-contract.md per the task
  brief's explicit exclusions.
