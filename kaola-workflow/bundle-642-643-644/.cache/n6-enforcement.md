evidence-binding: n6-enforcement 06a8f01d4196
upstream_read: n1-architect 416c5fde30b3

# n6-enforcement (tdd-guide) — machine-enforcement walls, RED-first

RED: future-agent wall fixture — a $TMPDIR Write-manifest agent lacking a registry row throws `agent_contract_registry_missing: node-role agent "widget-writer" needs a ROLE_TOKEN_REGISTRY row with >=2 tokens or a PRESENCE_ONLY_RATIONALE entry`; with a row but no SELF-WRITE section it throws `agent_contract_needle_missing: write-kind agent "widget-writer" must carry the SELF-WRITE + evidence-binding evidence contract`; the mutation test (real tdd-guide.md with SELF-WRITE stripped, real code-architect.md with record-evidence stripped) throws `agent_contract_needle_missing` for each — proving both wall halves are load-bearing (pre-impl the wall did not exist, so nothing refused).
GREEN: with the wall added, the fixed fixture (row + SELF-WRITE + evidence-binding) passes, a single-token role admitted by an explicit PRESENCE_ONLY_RATIONALE entry passes, and the LIVE repo is green — `node scripts/validate-vendored-agents.js` → "Vendored agent validation passed for 16 agents" (14 node-roles walled) exit 0; the scratch RED-first harness ends "SCRATCH WALL TEST PASSED" exit 0. All five affected validators + reachability green (counts below).

## Deliverables (all in the 7 declared write-set files — no overflow)

1. `scripts/validate-vendored-agents.js` — future-agent wall. Over every node-role agent (the
   managed roster derived from the `agents/` listing MINUS the orchestration roles
   contractor/workflow-planner): (a) a `ROLE_TOKEN_REGISTRY` row with >=2 tokens OR membership in
   the new `PRESENCE_ONLY_RATIONALE` allowlist (ships EMPTY — every current node role reaches the
   floor); (b) a role-kind evidence needle whose KIND is DERIVED from the agent's front-matter
   `tools:` manifest (Write OR Edit present => write-kind needs `SELF-WRITE` + `evidence-binding`;
   else read-kind needs `RETURN` + `record-evidence`) — never a hand-list. `checkFutureAgentWall`
   is exported for the RED-first fixture harness. Gate-role read agents (code-reviewer,
   security-reviewer, adversarial-verifier) pass the read-kind `.md` needle AS-IS (all carry
   RETURN + record-evidence in their `.md`) — no regex variant needed and no agent file edited.
2. `.toml` needle mirror (the forge/codex side of the wall) added to the three plugin contract
   validators: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`,
   `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`, and the codex
   github check `scripts/validate-kaola-workflow-contracts.js`. KIND derived the same way (from the
   canonical root `agents/<role>.md` tool manifest). Needle-REGEX variant for the read-kind `.toml`
   (per the blueprint's "adjust the needle, not the agent files"): the gate-role `.toml` files carry
   "Return content suitable for ... the orchestrator persists your returned output" but NOT the
   all-caps `RETURN`/`record-evidence` tokens their `.md` twins use, so the `.toml` read-kind needle
   is the common denominator `/RETURN/i` + `/orchestrator persists/i`, which BOTH read-producer
   `.toml` (RETURN + "the orchestrator persists it verbatim ... record-evidence --stdin") and gate
   `.toml` ("Return content ... the orchestrator persists your returned output there") satisfy.
   Write-kind `.toml` needle stays `SELF-WRITE` + `evidence-binding`.
3. `scripts/validate-workflow-contracts.js` (+ its byte-twin
   `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`, kept byte-identical via
   `node scripts/edition-sync.js --write`) — the Claude command-prose side: pinned the
   `<!-- PIN: node-briefs-relay -->` anchor, the goal_line relay literal, the `upstream_read:
   <node-id> <nonce>` consumed-proof instruction, and the manifest-derived enumeration sentence in
   `commands/kaola-workflow-plan-run.md`, plus grep-REFUSE of the stale `**READ-ONLY roles**` /
   `**WRITE-role agents**` exclusive-contract headers.
4. `scripts/test-route-reachability.js` — new T16 block pinning across ALL SIX plan-run surfaces (3
   Claude commands + 3 Codex SKILLs): the `<!-- PIN: node-briefs-relay -->` anchor + goal_line relay
   literal + upstream_read instruction literal + resume re-hydration line (`re-derived from the
   cached .cache/<op>-envelope.json`) + the manifest-derived role-kind sentence (`derived from each
   role's tool manifest`); AND a fail-closed grep-REFUSE per surface of the stale exclusive
   enumerations (`**READ-ONLY roles**`, `**WRITE-role agents**`). +42 assertions (287 -> 329).

## No issue refs / decision IDs in any wall needle string or comment (provenance-out rule honored).

## Files changed (git status --short — exactly the 7 declared write-set files, no overflow)
- scripts/validate-vendored-agents.js
- scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js   (edition-sync codex twin, byte-identical)
- scripts/validate-kaola-workflow-contracts.js
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- scripts/test-route-reachability.js

## Verification commands + exit codes (leg cwd .kw/legs/bundle-642-643-644/n6-enforcement)
1. RED-first scratch harness ($TMPDIR fixtures + real-agent mutation, never the live repo root):
   `node $SCRATCH/wall-redfirst.js` -> 4 RED-OK (registry-missing, needle-missing, 2 real-agent
   mutations) + 2 GREEN-OK (fixed fixture, presence-only allowlist) -> "SCRATCH WALL TEST PASSED" exit 0.
2. `node scripts/validate-vendored-agents.js` -> "Vendored agent validation passed for 16 agents" exit 0.
3. `node scripts/test-route-reachability.js` -> "Route-reachability test passed (329 assertions)." exit 0.
4. `node scripts/validate-kaola-workflow-contracts.js` -> "Kaola-Workflow Codex contract validation passed" exit 0.
5. `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> "Kaola-Workflow GitLab contract validation passed" exit 0.
6. `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> "Kaola-Workflow Gitea contract validation passed" exit 0.
7. `node scripts/validate-workflow-contracts.js` -> "Workflow contract validation passed" exit 0.
8. `node scripts/edition-sync.js --write` -> "write complete (1 file(s) updated)" (only the codex
   twin validate-workflow-contracts.js); `--check` -> "10 forge aggregator ports, 24 COMMON_SCRIPTS
   mirrors, and 27 byte-identical groups in parity with canonical." exit 0.

## Walkthrough (simulate-workflow-walkthrough.js) — RED is an UPSTREAM lane-group artifact, NOT this node
`node scripts/simulate-workflow-walkthrough.js` fails at `testBundle424432433ValidatorGates` (#433
(5)): the test's hardcoded expect-map pins `ROLE_TOKEN_REGISTRY['doc-updater']` to
`["evidence-binding"]`, but n2's registry rows (already in this leg) set it to
`["evidence-binding","docs_updated"]`. PROVEN upstream: with all 7 of my write-set files
`git stash`ed, the mismatch persists (registry value comes from plan-validator.js; the expect-map
lives in simulate-workflow-walkthrough.js — BOTH outside my write set; this leg is an n3 STUB, and
n3 owns the walkthrough). To confirm my 7 changes break nothing downstream, I temporarily patched
ONLY that one-line stale expect-map (doc-updater -> ["evidence-binding","docs_updated"]) and the
FULL walkthrough passed ("Workflow walkthrough simulation passed" exit 0), then restored
simulate-workflow-walkthrough.js exactly via `git checkout` (git status clean for that file). The
one-line expect-map fix belongs to n3's declared walkthrough write; I did NOT edit it (outside my
write set — noted here per instruction).

## Note for reconciliation
- `simulate-workflow-walkthrough.js` #433 (5) expect-map needs the doc-updater row updated to
  `["evidence-binding","docs_updated"]` (and, if it later enumerates the full registry, the seven
  new n2 rows). This is n3's file/scope, not n6's. Verified: that single line is the ONLY blocker
  to a green walkthrough in the reconciled tree.
