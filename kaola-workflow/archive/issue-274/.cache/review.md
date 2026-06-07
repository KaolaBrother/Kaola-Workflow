# Node `review` evidence — issue #274 (code-reviewer gate, post-dominates impl)

Opus code-reviewer reviewed the full 6-file diff, traced callers/node shape, ran the walkthrough + full `npm test` (all 4 editions, exit 0), and adversarially probed false-positive + graceful-absence paths. APPROVE — no blocking findings.

## AC verification (all PASS)
1. Correct flagging + gate scope: check sits in `validatePlan` after the gate block, before the refuse-return. `validatePlan` callers = `freezePlan` (--freeze) + default CLI validate (--json). `--resume-check`→`revalidateForResume` (never calls validatePlan); `--gate-verify`/`--barrier-check`/`--selector-check`/`--verdict-check` all `return;` before the default validate. So it fires for freeze+json but not the running-plan re-grades. freezePlan returns frozen:false on any non-in-grammar result → a sync-group gap blocks the freeze.
2. No false positives: COMMON membership path-exact (basename∈list AND p===scripts/<n> OR p===plugins/kaola-workflow/scripts/<n>); GROUP membership = members.includes(p) on canonical full paths. Forge-rename ports' basenames absent from both lists (test (d) + live gitlab-port run = in-grammar, 0 gap). Whole block gated by `if (syncMeta)`, inert when null.
3. Single source of truth: grep confirms no second definition of the two lists outside validate-script-sync.js. require.main guard preserves CLI.
4. Byte-identity: codex port byte-identical to root; gitlab/gitea differ at exactly one hunk (L38 classifier). Literal `plugins/kaola-workflow/scripts` substring count = 0 in all 4 validator files (prefix built via join()), so forge contract validators pass under npm test.
5. Graceful absence: relative require resolves against requiring file's dir, no upward search; forge plugin dirs have no such file → throw → caught → null → no-op (confirmed by running the gitlab port). No circular require.
6. Test quality: testAdaptiveSyncGroupGap asserts /sync-group gap/ AND result for refuse cases; real list members; covers refuse (a,c), in-grammar (b), forge-rename no-false-positive (d). RED→GREEN consistent.
7. Edge cases: bare-basename evasion conservatively no-ops (false-negative caught at phase-6 barrier anyway); COMMON basenames and GROUP members disjoint → no double-fire. No defects.

## Test results
- node scripts/simulate-workflow-walkthrough.js → testAdaptiveSyncGroupGap: PASSED + Workflow walkthrough simulation passed, exit 0.
- npm test → all 4 sub-suites pass (Claude, Codex, GitLab, Gitea), exit 0.

## Severity table
CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0 — APPROVE.

verdict: pass
findings_blocking: 0
