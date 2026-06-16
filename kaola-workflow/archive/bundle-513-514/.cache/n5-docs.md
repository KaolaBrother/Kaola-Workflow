evidence-binding: n5-docs 9c922a21c36c

role: doc-updater
verdict: pass

## Docs updated (within declared write set: CHANGELOG.md, docs/decisions/D-513-01.md, docs/decisions/D-514-01.md)

- CHANGELOG.md [Unreleased]:
  - ### Changed — added the #513 entry (workflow-planner authoring rubric for speculative-open-eligible
    topologies; follows #500 L3; authoring-only, no mechanism change; parity needle 15→18; "no live probe,
    rubric is the deliverable"; all four editions; points to D-513-01).
  - ### Fixed — added the #514 entry (two cosmetic comment nits: R1 stale "until Slice 3" reworded across
    the 4 adaptive-node.js editions; R2 T9 block-header PIN→CARD typo; comment-only; tests green).
- docs/decisions/D-513-01.md — NEW. Accepted record: planner authoring rubric (prose, zero new grammar/
  mechanism), eligibility ALL-of rule, Meta-key-only control (INV-17), placement adjacent to D-419-01,
  mandatory worked example (#463 anti-inert-rubric lesson), parity-needle enforcement, and the explicit
  non-claim (no live makespan probe — Refs-#513 discipline).
- docs/decisions/D-514-01.md — NEW. Accepted record: the two cosmetic comment fixes (R1 stale temporal
  fragment, R2 PIN→CARD typo), zero behavior change, edition-synced.

Decision-record numbering (#337): D-513-01 and D-514-01 are the first records for their issues (verified
no prior D-513*/D-514* exist).

No README/api/schema change: #513 is an agent-profile authoring rubric (no public API/schema surface);
#514 is comment-only. No fabricated sections.
