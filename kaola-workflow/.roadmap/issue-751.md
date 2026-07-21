issue: #751
title: bug(plan-validator): schema-2 group certifier arm performs no candidate staleness check — finalCertifierLive treats it as a live whole-candidate wall
status: ready — filed 2026-07-21 from BATCH 1 adversarial verification; defense-in-depth divergence, not a demonstrated end-to-end fail-open
workflow_project: —
next_step: BATCH 1b (interior-gate trust completion, with #750) — MUST follow BATCH 1: the cheapest fix modifies finalCertifierLive, which BATCH 1 just changed. Prefer the tighten-only option (decline to treat a group certifier as a live whole-candidate wall) over teaching the group arm to check staleness. Only reachable when the epoch contract is active. Cross-edition -> four chains.
