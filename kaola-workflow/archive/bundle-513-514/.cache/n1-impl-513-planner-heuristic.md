evidence-binding: n1-impl-513-planner-heuristic 0c19a8197de0

non_tdd_reason: prose/agent-profile authoring (planner shaping rubric across 4 profile surfaces + a parity needle + a doc card) — no natural failing unit test; verified by test-agent-profile-parity.js (twin parity + needle).

verification_tier: build-green

build-green: node scripts/test-agent-profile-parity.js -> PASS (18 assertions, was 15 baseline; +3 = the new needle enforced across all 3 .toml twins, proving it is byte-present in agents/workflow-planner.md and not vacuously skipped)

## Files changed
- agents/workflow-planner.md — added the fuller "Speculative-open-eligible shaping — when to set `speculative_open_policy: consent`" subsection (heading + eligibility bullets + how-to-author + when-NOT-to + worked example), placed adjacent to the D-419-01 scheduler-default posture.
- plugins/kaola-workflow/agents/workflow-planner.toml — added ONE dense forge-neutral paragraph conveying the same rubric, adjacent to the D-419-01 SCHEDULER-DEFAULT POSTURE paragraph.
- plugins/kaola-workflow-gitlab/agents/workflow-planner.toml — byte-identical mirror of the codex twin.
- plugins/kaola-workflow-gitea/agents/workflow-planner.toml — byte-identical mirror of the codex twin.
- scripts/test-agent-profile-parity.js — added needle token `unsatisfied predecessor is a high-probability-pass gate` (present in the .md, enforced across all 3 twins).
- docs/plan-run-cards/speculative-open.md — added a short "## Authoring (planner)" note pointing to the new planner rubric + the worked-example topology; the card otherwise stays operator-focused.

## Needle string added to test-agent-profile-parity.js
`unsatisfied predecessor is a high-probability-pass gate`
(byte-exact substring present in all 4 profile surfaces; no apostrophe so it is safe in the single-quoted JS array)

## Verification commands
- `node scripts/test-agent-profile-parity.js` -> PASS, 18 assertions, exit 0 (baseline was 15)
- `diff` codex twin vs gitlab/gitea twins -> GITLAB-IDENTICAL / GITEA-IDENTICAL (byte-identity preserved after edit)
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/agents/workflow-planner.toml` -> passed (no forge-noun leak)
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/agents/workflow-planner.toml` -> passed (no forge-noun leak)

## Heuristic summary
Teaches the planner to recognize a speculative-open-eligible topology and set the `## Meta`
`speculative_open_policy: consent` key (default `off`). The lever: a READ-ONLY node whose SOLE
unsatisfied predecessor is an in-progress GATE need not idle — when the gate is very likely to pass,
the executor opens it speculatively and runs it ahead, hiding its latency behind the gate (a critical-
path makespan win). Eligibility requires ALL of: (a) the candidate node is read-only
(`declared_write_set: —`) — never a write node; (b) its only unsatisfied predecessor is a single
in-progress gate, not multiple deps; (c) the gate is high-probability-pass. Authoring control is the
Meta key ONLY — the planner never hand-adds a `speculative: true` row annotation (eligibility stays
validator/runtime-derived, same INV-17 discipline as `parallel_safe`). When NOT to: the speculative
node runs while the gate is `in_progress`, so on `verdict: fail` the operator keeps or discards its
output — set the key only where pass is very likely AND rework cost is low/bounded; not for an
uncertain gate, not for a write node, not when no post-gate read-only node benefits (no-op key).
Worked in-grammar example: a read-only `adversarial-verifier`/`code-explorer` node depending only on
a `code-reviewer` gate over a small mechanical change → set the Meta key so the read node overlaps the
review. This is an AUTHORING rubric only; the #500 mechanism (plan-run skeleton, operator card,
route-reachability T9) was untouched.
