issue: #639
title: harden metric-optimizer OPT freeze rules (R1 metric_command required · R2 dir-shaped metric_paths · R3 duplicate optimize block)
status: open
workflow_project: —
next_step: P3: three non-blocking freeze-rule hardening rules in plan-validator.js parseOptimizeContracts/OPT-1..6 (surfaced by #634 n5-review + n6-adversary). R1 refuse metric_command absence at freeze (implicitly required by D2, no OPT rule reads it). R2/R5 refuse directory-shaped and ../-alias metric_paths (exact-string disjointness misses bench/ and bench/../src/hot.js). R3/R7 refuse duplicate / fenced-decoy optimize(<id>) blocks (Map.set last-win). R6 (numeric hex/exp form) is documentation-only — cap binds on the converted value, no unbounded escape. Non-shipping-blocking (change-gate reproduction + evidence-shape backstop bound impact to one wasted dispatch); each fix = canonical plan-validator.js + a walkthrough refuse fixture; regen sync:editions; cross-edition #307
