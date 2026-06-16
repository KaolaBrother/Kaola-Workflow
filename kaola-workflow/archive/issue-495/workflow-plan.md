# Adaptive Plan — issue #495

<!-- plan_hash: b79ff9428c6a75dd919fc9046b82caecf52aa4e0f04093b26251370a1b6a0e71 -->

Bug: the adaptive starting contract (`kaola-workflow-claim.js startup … --workflow-path adaptive`)
fails closed on an opaque, un-retried, transient classifier subprocess fault. Fix = the documented
split (Scripts Own Atomicity; Agent Owns Reasoning; Escalate values, not facts — #44/#287) applied to
the front door: stop swallowing the diagnostic, bounded in-script retry on transient classes only, a
NEW typed `target_set_indeterminate` / `classifier_error` verdict carrying `result: escalate` that
stays DISTINCT from the determinate `target_unavailable`/`target_set_unavailable` (`result: refuse`);
agent-side routes on `result` (refuse → hard stop; escalate → consent-ask the user). Cross-edition
(4 chains, #307) + multi-surface claim-refusal routing prose (#400).

## Meta

labels: bug, area:scripts, area:workflow-router

## Plan Notes

- **Code lives in `claim.js` only, NOT `classifier.js`** (#306 symbol-grep verified): the swallowed
  fault is the *parent's* `execFileSync` throwing when the classifier subprocess dies / cannot spawn
  (`claim.js:690-692`); the classifier's own `ghExec` callers already emit graceful typed reasons and
  exit 0 with JSON. Retry + typed envelope belong in the parent that spawns the subprocess.
- **Edition shape of `claim.js`:** root `scripts/kaola-workflow-claim.js` and the codex twin
  `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` are BYTE-IDENTICAL (a `validate-script-sync.js`
  pair — editing one alone reds the claude chain), so they MUST move together in n1. The forge ports
  `kaola-{gitlab,gitea}-workflow-claim.js` are HAND-MAINTAINED edition mirrors (NOT in
  `edition-sync.js GENERATED_AGGREGATORS`; verified by `edition-sync.js --check`), so they are a
  separate forge-port mirror node (n2) per #340.
- **n2 forge-port canonical spec (#340):** the FULL accumulated root diff of `claim.js` vs the run base
  (`git diff <base>..HEAD -- scripts/kaola-workflow-claim.js`) — mirror EVERY hunk modulo forge nouns
  (forge-neutral; "the forge", never a CLI binary name, #341), never a per-concern re-implementation.
  n2 depends on n1 so the canonical diff exists before the mirror is taken.
- **Pinned tokens shared by n1 + n3 (so script and prose converge by construction, #309):** the new
  verdict name `target_set_indeterminate` (and the per-issue `classifier_error` reasoning class) and
  the envelope field values `result: escalate` (indeterminate/value) vs `result: refuse` (determinate
  fact). Determinate verdicts (`target_set_red`, `target_set_conflicts_active_work`,
  `target_set_has_closed_issue`, `target_unavailable`/`target_set_unavailable`) stay fail-closed with
  `result: refuse` — UNCHANGED behavior.
- **n1 code surface — two catch sites:** (a) single-target `classifyIssue` catch (~`claim.js:690`):
  classify `e` into spawn-fault (`e.code` ENOENT/EAGAIN/EMFILE/ENOMEM, no `status`) / timeout-kill
  (`e.killed`/`e.signal`) / clean-nonzero (`e.status` present, capture truncated `e.stderr`); bounded
  retry N≤2 on the transient classes ONLY (spawn-fault / timeout / kill); a clean verdict or a clean
  non-zero exit is NOT retried; `e.status === 2` stays `owned`. (b) bundle loop (~`claim.js:1172-1182`):
  a member whose classification is *indeterminate after retry* surfaces the escalate path
  (`target_set_indeterminate` / `result: escalate`) instead of collapsing to the determinate
  `target_set_unavailable`; determinate members still hard-stop with `result: refuse`.
- **n1 test seam (PRODUCTION addition):** `classifyIssue` hardcodes the classifier path; to drive the
  REAL retry subprocess path with a crashing classifier (AC #7, "not a rubber-stamping mock") add a
  `KAOLA_CLASSIFIER_MOCK_SCRIPT` env hook following the existing `KAOLA_GH_MOCK_SCRIPT` precedent
  (`claim.js:192`). The mock writes an invocation counter so `test-claim-hardening.js` asserts all
  three AC cases: (a) transient (spawn-fault/kill) → retry fires (counter > 1) → succeeds;
  (b) PERSISTENT transient → typed `target_set_indeterminate` + `result: escalate` (NOT a determinate
  refuse); (c) a clean determinate RED → NOT retried (counter == 1) → stays `result: refuse`.
- **n3 routing-prose surface union (semantically coupled — ONE node per #309/#453, no file-count
  ceiling):** the `result: refuse → stop; escalate → consent-ask the user` rule across the front-door
  routing surfaces. Each logical command is a #400 **6-surface** set = 3 editions × {Claude command,
  Codex SKILL} (root command + gitlab command + gitea command + 3 SKILL twins) — the earlier
  surface-grep that searched only `commands/` + `skills/` missed `plugins/*/commands/`; the forge
  Claude commands DO exist and DO carry the refusal block, so they are included:
    - `kaola-workflow-adapt` (6 surfaces — the canonical `claim_verdict NOT acquired/owned → fail
      closed` refusal block + the bundle-refusal line);
    - `workflow-next` (6 surfaces — the typed-refusal `escalate to the user` routing);
    - `kaola-workflow-auto` (6 surfaces — the autopilot consent-halt routing table; the AC names
      autopilot explicitly);
  plus the `workflow-planner` agent profile (root `agents/workflow-planner.md` + 3 byte-identical
  `.toml` twins, its own claim-refusal routing block), and the two machine enforcers:
  `test-route-reachability.js` gets a NEW assertion pinning the escalate-routing literal across the
  **adapt 6-surface set** (mirroring the existing T5 plan-run 6-surface pattern); the pinned surface
  list MUST equal n3's adapt write-set exactly. `test-agent-profile-parity.js` gets the new routing
  feature-token added to `FEATURE_TOKENS` (any token added to `workflow-planner.md` must appear in all
  three `.toml` twins). The `.toml` prose must stay forge-neutral (#341). Total n3 = 24 files
  (3 commands × 6 surfaces = 18, workflow-planner ×4, 2 enforcers). The contract validators
  (`validate-*-contracts.js` ×4) drive the route-reachability contract via the shared mechanism — no
  per-surface content pin to add there; n3 covers the prose, route-reachability machine-enforces it.
- **Why no parallel split of n1/n3:** n1+n3 both write under `scripts/` and n2+n3 both write under
  `plugins/`; they lane-serialize at top-level-dir granularity regardless of dep edges, so widening
  the DAG buys no makespan. Concurrency lives in the read-only gates (n4 adversarial-verifier and the
  downstream review run after the code lands; n4 is a single sequence node — one adversarial angle,
  no degenerate one-member fan). n3 carries NO true dep on n1
  (prose + test-pins are authored from the shared token spec, not n1's compiled code), so n1 and n3 are
  left as an antichain (validator derives the schedule).
- **Adversarial gate (n4) — the correctness hinge the scope context demanded:** a separate
  `adversarial-verifier` subagent (read-only, has Bash) RUNS the real-subprocess `test-claim-hardening.js`
  and tries to REFUTE two claims: (1) the new `target_set_indeterminate` (`result: escalate`) is
  genuinely DISTINCT from the determinate `target_unavailable`/`target_set_unavailable` (`result:
  refuse`) — not a relabel; (2) transient retry does NOT bleed into determinate refusals (a clean
  non-zero exit / clean RED is never retried). Refute against the live test + claim.js behavior.
- **Docs (n6):** `docs/api.md` already documents the claim/startup verdict envelope (the
  `target_unavailable`/`target_set_*` table) — add the new `target_set_indeterminate` verdict + the
  `result: refuse|escalate` field there. Decision record `D-495-01` (next free in `docs/decisions/`;
  series continues after D-476-01 (existing), no existing D-495) records the three-bucket front-door split.
- **Sink (n7):** docs/state only — `CHANGELOG.md` `[Unreleased]` entry. NOT a release (no version bump
  — that is out of the barrier allowlist).
- **4-chain green (#307):** the cross-edition diff (forge claim.js ports + edition contract validators
  via prose) requires all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green,
  run sequentially. claude runs `test-claim-hardening.js` (n1's test) + `test-route-reachability.js` +
  `test-agent-profile-parity.js` + `validate-workflow-contracts.js`; codex runs
  `simulate-kaola-workflow-walkthrough.js`; gitlab/gitea run `edition-sync.js --check` (catches a
  forge-port byte-mirror drift) + the forge contract validators + walkthroughs. n5 (code-reviewer)
  verifies all four green before finalize.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-claim-retry-envelope | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/test-claim-hardening.js | 3 | sequence | sonnet |
| n2-forge-claim-ports | implementer | n1-claim-retry-envelope | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js | 2 | sequence | sonnet |
| n3-result-routing-prose | implementer | — | commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, commands/kaola-workflow-auto.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-auto.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-auto.md, plugins/kaola-workflow/skills/kaola-workflow-auto/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-auto/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-auto/SKILL.md, agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, scripts/test-route-reachability.js, scripts/test-agent-profile-parity.js | 24 | sequence | sonnet |
| n4-adversarial-distinctness | adversarial-verifier | n1-claim-retry-envelope, n2-forge-claim-ports | — | 1 | sequence | opus |
| n5-code-review | code-reviewer | n1-claim-retry-envelope, n2-forge-claim-ports, n3-result-routing-prose, n4-adversarial-distinctness | — | 1 | sequence | opus |
| n6-docs | doc-updater | n5-code-review | docs/api.md, docs/decisions/D-495-01.md | 2 | sequence | sonnet |
| n7-finalize | finalize | n6-docs | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-claim-retry-envelope | complete |
| n2-forge-claim-ports | complete |
| n3-result-routing-prose | complete |
| n4-adversarial-distinctness | complete |
| n5-code-review | complete |
| n6-docs | complete |
| n7-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-claim-retry-envelope) | subagent-invoked | evidence-binding: n1-claim-retry-envelope f95ff6f883d7 | |
| implementer (n2-forge-claim-ports) | subagent-invoked | evidence-binding: n2-forge-claim-ports 529990fd3536 | |
| adversarial-verifier (n4-adversarial-distinctness) | subagent-invoked | evidence-binding: n4-adversarial-distinctness d676a5ea94e7 | |
| implementer (n3-result-routing-prose) | subagent-invoked | evidence-binding: n3-result-routing-prose 5fc9c5b2fc43 | |
| code-reviewer | subagent-invoked | evidence-binding: n5-code-review f3761612d2cc | |
| doc-updater (n6-docs) | subagent-invoked | evidence-binding: n6-docs 7860d84e0468 | |
| finalize (n7-finalize) | main-session-direct | evidence-binding: n7-finalize 303515e36cd7 | |
