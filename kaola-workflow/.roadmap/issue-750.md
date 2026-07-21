issue: #750
title: bug(plan-validator): interior-gate freshness trusts attempt.candidate_declared verbatim — tampering one blob entry re-freshens a genuinely-stale gate
status: ready — filed 2026-07-21 from BATCH 1 adversarial verification; pre-existing (predates the batch-1 diff), deliberately scoped out
workflow_project: —
next_step: BATCH 1b (interior-gate trust completion, with #751) — immediately after BATCH 1 commits, same function, hot context. Recompute or corroborate the seal-time blob map instead of reading it verbatim; fall back to whole-candidate when uncorroborated. Covers the adversarial-verifier arm too, not just the reviewer arm. Cross-edition -> four chains.
