# Phase 5 - Review: issue-223

## Code Review Findings
### CRITICAL
none
### HIGH
none
### MEDIUM
none
### LOW
none

All three fixes correct against their bugs. #13 `!abandoned` guard wraps only the two roadmap invariants (others still fire; fires on discard, not normal closure). #14 happy path byte-for-byte unchanged; EEXIST reclaims a stateless orphan, still target_occupied when a state file exists; no risk to subsequent claims. #15 isSafeName→activeByProject→updateState ordering correct.

**Forge-test-bite gap closed:** the forge tests were authored after the forge fixes (not observed RED in Phase 4). Phase 5 revert-probed all three: gitlab #15 revert → testGitlabPatchBranchGuards fails; gitea #13 revert → abandoned-closure test fails with the 2 roadmap violations; gitlab #14 revert → claim-reclaim test fails at the `acquired` assertion. All restored green. The tests genuinely bite.

## Security Review
Ran: **yes** — #15 adds a path-traversal guard on operator-supplied `args.project`; #14 introduces a write-into-pre-existing-dir surface.

### Findings
CLEAN — no CRITICAL/HIGH/MEDIUM.
- Path traversal (#15): `isSafeName` empirically blocks all vectors (`..`, `/`, `\`, null byte, `.`, empty, non-string); applied before any path build; now consistent with claimProject/archiveProjectDir/cmdSinkFallback. Hole CLOSED.
- #14 reclaim: LOW — writeState into a not-self-created dir could follow a planted symlink, but `project` is isSafeName-guarded upstream (claimProject:389) and TOCTOU requires local mid-op write access (out of model for single-operator CLI). Adequately mitigated.
- Injection: none (execFileSync array-form; `--` on worktree calls; args.project never reaches a shell).
- 4 editions byte-consistent + runtime-verified.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | |
| review-fix executors | N/A | | no findings to route (all green first pass) |
| advisor critical gate | N/A | | no CRITICAL findings |

## Fixes Applied
None — implementation passed code + security review on the first pass. (Phase 5 revert-probed the forge tests to close the Phase-4 "not observed RED" gap; production code unchanged, probes reverted.)

## Validation Evidence
- `node scripts/validate-script-sync.js` → OK (10 common scripts, 3 byte-identical groups)
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0)
- gitlab + gitea walkthroughs + test-*-workflow-scripts.js → exit 0

## Follow-Up Items
- LOW (pre-existing, out of scope): `args.branch` in `cmdPatchBranch` is written unvalidated into state content (`'branch: ' + args.branch`); a newline could forge other state fields. Not introduced by #223; operator-controlled; never reaches a path or shell. Candidate for a separate hygiene pass.

## Review Status
PASSED WITH FOLLOW-UPS
