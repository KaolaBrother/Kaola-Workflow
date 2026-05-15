# Phase 1 - Research / Discovery: cross-machine-hardening

## Deliverable

Four cross-machine safety features for the Kaola-Workflow claim protocol:
1. **Claim race tiebreaker**: when two machines both post a claim comment, the one with the earliest `created_at` (integer `id` as secondary) wins; the loser calls `releaseSession()` and yields
2. **In-phase heartbeat ticker**: background 15-min timer in each of the six phase commands calling `claim.js heartbeat`
3. **Remote sweeper extension**: `cmdSweep` queries GitHub for stale leases (24h+ with no fresh comment edit) and posts `:released-stale`, removes assignee+label
4. **Adoption protocol**: yielded session pushes feature branch and lists it in yielded comment for the winner to adopt

## Why

Single-machine `O_EXCL` lock is invisible across machines. Without the tiebreaker, two concurrent multi-machine claims both succeed locally and both update GitHub, leaving the issue in an inconsistent state. The ticker and remote sweeper protect against stalled sessions silently holding leases.

## Affected Area

| File | Change |
|------|--------|
| `scripts/kaola-workflow-claim.js` | Tiebreaker (insert between postGitHubClaim and lock re-write); cmdSweep remote extension + `--remove-assignee`; regex bug fix at line 179; adoption protocol comment posting |
| `scripts/simulate-workflow-walkthrough.js` | New Epic 9: tiebreaker tests using PATH shim |
| `commands/kaola-workflow-phase1.md` lines 26-30 | One-shot heartbeat → background ticker |
| `commands/kaola-workflow-phase2.md` lines 30-34 | One-shot heartbeat → background ticker |
| `commands/kaola-workflow-phase3.md` lines 28-32 | One-shot heartbeat → background ticker |
| `commands/kaola-workflow-phase4.md` lines 18-23 | One-shot heartbeat → background ticker |
| `commands/kaola-workflow-phase5.md` lines 32-36 | One-shot heartbeat → background ticker |
| `commands/kaola-workflow-phase6.md` lines 33-37 | One-shot heartbeat → background ticker |
| `commands/workflow-next.md` | Adoption protocol entry: fetch + checkout yielded branch |

## Key Patterns Found

1. **Claim tiebreaker insert point** — `claim.js:222-232`: between `postGitHubClaim()` returning (step 9) and the final lock re-write with `claim_comment_id` (step 11). After posting own claim, fetch all comments via `gh api repos/{owner}/{repo}/issues/{N}/comments`, filter to claim bodies, find winner by `(created_at ASC, id ASC)`, yield if not winner.

2. **releaseSession reuse** — `claim.js:239-260`: canonical release function — label removal + file deletion. Yielder MUST call this, not reimplement. Adds `--remove-assignee @me` to existing `gh issue edit --remove-label` call.

3. **ghExec pattern** — `claim.js:26-29`: `execFileSync('gh', args, { encoding: 'utf8' }).trim()`. Returns `''` when OFFLINE. All new gh calls must go through this wrapper.

4. **PATH shim test pattern** — `walkthrough.js:748-771` (Epic 6E), `walkthrough.js:835-861` (Epic 7): shell script `gh` in temp `bin/` prepended to PATH. Returns per-command JSON. Requires `HOME: isolatedTmp` for machine-id isolation. **Required for tiebreaker tests** (OFFLINE=1 cannot test JSON parsing).

5. **Regex bug** — `claim.js:179`: `/comments\/(\d+)/` should be `/issuecomment-(\d+)/`. `gh issue comment` stdout is `#issuecomment-NNN` format, not REST API URL. Currently masked by OFFLINE=1 in tests.

6. **--remove-assignee gap** — Neither `cmdRelease` (`claim.js:262`) nor `cmdSweep` (`claim.js:314`) calls `--remove-assignee @me`. Both need it added alongside the existing `--remove-label workflow:in-progress`.

7. **Tiebreaker sort key** — Use REST `gh api .../comments` (returns integer `id`, `created_at`, `updated_at`). Do NOT use `gh issue view --json comments` (returns GraphQL string `id`, no `updatedAt`). Winner = minimum `created_at`; use integer `id` as secondary.

8. **Remote sweeper updated_at check** — `gh api repos/{owner}/{repo}/issues/comments/{claim_comment_id}` to get `updated_at` for the stored claim comment. If `updated_at` is within 24h, do not sweep (active heartbeat editing the comment from another machine).

## Test Patterns

- **Framework**: hand-rolled `assert(cond, msg)` at `walkthrough.js:10-14`; run with `node scripts/simulate-workflow-walkthrough.js`
- **Location**: `scripts/simulate-workflow-walkthrough.js` — new Epic 9 before `walkthrough.js:1263`
- **gh mock for tiebreaker**: PATH shim (shell script returning JSON), NOT OFFLINE=1
- **Exit-code capture**: `spawnSync` + `.status` check (Epic 8 pattern)
- **Isolation**: `mkdtempSync` + `HOME: isolatedTmp` + clean in `finally`
- **Existing cross-machine tests**: none — all net-new

## Config & Env

| Variable | Where | Purpose |
|----------|-------|---------|
| `KAOLA_WORKFLOW_OFFLINE` | `claim.js:26-29`, `walkthrough.js` tests | Suppresses all ghExec calls; incompatible with tiebreaker tests |
| `HOME: workdir` | phase command env, test worktrees | Isolates machine-id to per-worktree; also used in `getMachineId()` (`claim.js:195`) |
| `KAOLA_SESSION_ID` | phase commands | Session identifier passed to heartbeat one-liner |
| `CLAUDE_PLUGIN_ROOT` | phase commands | Prefix for script path in heartbeat call |

**machine-id**: `getMachineId()` reads/creates `~/.config/kaola-workflow/machine-id` (UUID). With `HOME` override, each test worktree gets its own machine-id.

## External Docs

From docs-lookup (gh CLI ~2.40–2.67, GitHub REST API 2022-11-28):

- REST comment endpoint: `GET /repos/{owner}/{repo}/issues/{N}/comments` — fields: integer `id`, `body`, `created_at`, `updated_at`, `user.login`
- Single comment: `GET /repos/{owner}/{repo}/issues/comments/{id}` — same fields
- `gh api repos/{owner}/{repo}/issues/{N}/comments` invokes this REST endpoint
- `--remove-assignee @me` confirmed correct syntax (stable gh 2.0+)
- `gh issue list --json comments` returns only count, not comment objects — use view/REST for full objects

## GitHub Issue

KaolaBrother/Kaola-Workflow#9

## Completeness Score

10/10

- Goal clarity: 3/3 — four deliverables with algorithmic detail in issue
- Expected outcome: 3/3 — acceptance criteria with specific scenarios
- Scope boundaries: 2/2 — explicit out-of-scope, adoption protocol marked optional
- Constraints: 2/2 — algorithm, intervals, grace periods, fallbacks all specified

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | invoked | .cache/docs-lookup.md | gh API and comment ID shape needed for tiebreaker implementation |

## Notes / Future Considerations

- **Adoption protocol scope**: issue marks this as "optional polish." Phase 2 should evaluate whether to include or defer.
- **Ticker in phase commands**: phase commands are markdown files with bash blocks, not shell scripts. Ticker must be a `node -e` background process (`& disown` + wait in trap/cleanup). Confirm mechanism in Phase 2.
- **Latent regex bug** (`claim.js:179`): in scope to fix as part of tiebreaker work since it affects `claim_comment_id` correctness, which the tiebreaker depends on.
- **`--remove-assignee` gap**: in scope for cmdRelease and cmdSweep as part of remote sweeper deliverable.
- **Repo owner/name for REST calls**: `gh repo view --json owner,name` or parse from `git remote get-url origin`.
