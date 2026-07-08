evidence-binding: n2-validator b9f4c0b286d0

# n2-validator — validator grammar + registry (tdd-guide, RED-first)

Read n1-architect's blueprint (`.cache/n1-architect.md`) — sections "#642 Channel design (a)",
"#643 Registry (a)", FLAG 2 (V6 close-refusal is n3's, NOT mine), and the "Per-node routing →
n2-validator" line anchors — plus the frozen plan's Plan Notes. Scope held to n2: the validator
grammar + registry + the two claude-only test surfaces. Did NOT touch checkEvidenceShape /
adaptive-node.js / the walkthrough (n3), per FLAG 2.

## RED → GREEN (failing-test-first)

RED: test-adaptive-handoff.js — briefs-unknown "an unknown-node ## Node Briefs entry refuses brief_unknown_node, got {"result":"in-grammar"}"; briefs-hash "a one-line ## Node Briefs edit changes plan_hash (briefs are hash-covered)"; briefs-resume "post-freeze brief edit fails --resume-check plan_hash_mismatch, got {"ok":true,"reasonCode":null}"; briefs-backcompat/parse (nodeBriefsPresent/parseNodeBriefs undefined) — 11 failures, 140 passed (pre-impl: briefs ignored, not hash-covered, exports absent).
RED: test-adaptive-node.js — SEED-arch "required_tokens carries files_to_create|files_to_modify, got ["evidence-binding"]" + "files_to_create stub key seeded, got:\nevidence-binding: design deadbeefcafe" — 4 failures (pre-impl: code-architect has no ROLE_TOKEN_REGISTRY row → seed + required_tokens carry only evidence-binding).

GREEN: test-adaptive-handoff.js passes (151 assertions, exit 0) — brief_unknown_node refuse via default --json, plan_invalid via the handoff, hash-coverage + plan_hash_mismatch on a post-freeze brief edit, byte-identical briefless back-compat, and parseNodeBriefs trimming all green.
GREEN: test-adaptive-node.js passes (1558 assertions, 0 FAIL, exit 0) — SEED-arch: open-next over a code-architect node seeds files_to_create + build_sequence stub keys into .cache/design.md and emits them in required_tokens; the doc-updater registry change broke nothing in this file.

## Implementation (canonical scripts/kaola-workflow-plan-validator.js)

- `nodeBriefsPresent(content)` + `parseNodeBriefs(content)` — NEW, exported. Fence-aware: section
  sliced via `classifier.sectionBody(content,'Node Briefs')` (h3 does not close the h2); `### <id>`
  headers scanned fence-aware (a fenced `### x` inside a brief body is NOT a header); brief body has
  leading/trailing blank lines trimmed, internal newlines preserved; `[]` when the section is absent.
- `computePlanHash` — CONDITIONAL append `'\n---BRIEFS---\n' + norm('Node Briefs')` iff
  `nodeBriefsPresent`. Verified: a briefless plan hashes BYTE-IDENTICALLY to the pre-briefs formula
  (Meta + Nodes) — the back-compat test computes the legacy hash inline and asserts equality.
- `brief_unknown_node` — EARLY typed refusal in `validatePlan`, immediately after
  `const ids = new Set(...)`, mirroring the policy-token refusals. Freeze-only (NOT in
  `revalidateForResume` — briefs are hash-covered). + OPERATOR_HINT_REGISTRY entry.
- 8 ROLE_TOKEN_REGISTRY rows exactly per blueprint: code-architect (files_to_create|files_to_modify +
  build_sequence), code-explorer (findings), knowledge-lookup (findings + sources), planner
  (recommendation), issue-scout (recommendation), build-error-resolver (build-green), synthesizer
  (merge_outcome), doc-updater (evidence-binding + docs_updated — was evidence-binding only).
- Exported `PRODUCER_ROLES` (NEW: code-architect, planner, code-explorer, knowledge-lookup,
  issue-scout, synthesizer) + `IMPLEMENT_ROLES`.
- No issue refs / decision IDs in any code comment or agent-facing prose I touched (rule-only).

## Files changed (declared write set — all 6)

- scripts/kaola-workflow-plan-validator.js (canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js (codex twin, edition-sync)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js (edition-sync)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js (edition-sync)
- scripts/test-adaptive-node.js (SEED-arch block appended)
- scripts/test-adaptive-handoff.js (Node Briefs block appended)

## Verification commands + exit codes

- node -c scripts/kaola-workflow-plan-validator.js — syntax OK
- node scripts/edition-sync.js --write — 3 files updated (codex twin + gitlab/gitea ports)
- node scripts/edition-sync.js --check — exit 0 (10 forge ports, 24 COMMON_SCRIPTS mirrors, 27 byte-identical groups in parity)
- node scripts/test-adaptive-handoff.js — exit 0 (151 assertions passed)
- node scripts/test-adaptive-node.js — exit 0 (1558 assertions passed, 0 FAIL)
- git status --porcelain — exactly the 6 declared files, no stray artifacts

## Notes / hand-off to n3 (serial n2→n3)

- The ROLE_TOKEN_REGISTRY `expect` mirror in simulate-workflow-walkthrough.js (~:3417-3432) still lists
  the OLD 7-role map (doc-updater = evidence-binding only, no new rows) → it will red until n3 updates
  it to match the new registry (7 new rows + doc-updater += docs_updated). Walkthrough is n3's file.
- V6 (truncated producer evidence → evidence_shape_failed at close) is n3's — checkEvidenceShape lives
  in adaptive-node.js and still uses the else non-empty fallback for producer roles; my registry rows
  only drive SEED + required_tokens + --verify (FLAG 2 honored).
- A transient test-pollution artifact (kaola-workflow/.roadmap/issue-9.md) was created by the pre-impl
  RED run of the handoff e2e (the handoff reached roadmap staging when brief_unknown_node did not yet
  refuse); removed it, and hardened the e2e shell to stub non-validator scripts so a future RED cannot
  repollute the live .roadmap mirror.
