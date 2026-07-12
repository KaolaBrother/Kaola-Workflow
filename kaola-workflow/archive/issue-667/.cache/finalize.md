evidence-binding: finalize 48fb8e815aaa

## sink
role: finalize (main-session-direct). Merge-sink for #667.
The CHANGELOG [Unreleased] entry and docs/decisions/D-667-01.md were authored by the record-fail-closed-decision node (this finalize node has no write set). No further docs/state writes on the sink.

## decision
The #667 value call (fail-open vs fail-closed on a structurally-ambiguous fast-summary Scope) was resolved by the operator via the consent valve on 2026-07-12: FAIL-CLOSED. Implemented consumer-only in scanClaimedOverlap across all 4 classifier editions; recorded in D-667-01.

## four_chain
Cross-edition diff (classifier ×4 incl. gitlab/gitea plugin trees). Finalization runs all four npm chains sequentially before the sink.

## run_gaps
Two out-of-scope LOW review observations (R1: an unclosed fence anywhere in a claimed fast-summary now conservatively reds even without a Scope heading — strictly safer, primitive unchanged; R2: immaterial newline in forge ports) — action=none, non-defect consequences of the settled fail-closed decision; no follow-up filed.
