# Code Explorer — issue-151: Forge-neutral README and Gitea workflow wording fix

## Key Files

| File | Role | Importance |
|------|------|------------|
| `README.md` | Main user doc; GitHub-specific wording at lines 461, 467, 482, 502, 504, 559, 583, 601-602, 611, 613, 704 | Primary target |
| `plugins/kaola-workflow-gitea/commands/workflow-next.md` | Gitea router command; line 154 says "MRs" instead of "PRs" | Bug fix target |
| `plugins/kaola-workflow-gitlab/commands/workflow-next.md` | GitLab router command; consistent, no bug | Reference for correct pattern |
| `scripts/validate-workflow-contracts.js` | Doc drift guard; line 208 guards "No lease/session layer remains." on README line 482 | Must not break |
| `docs/api.md` | Best existing forge-neutral pattern; uses `(GitHub) / (GitLab) / (Gitea)` triads | Reference pattern |

## Affected README.md Sections

### Lines 459-468 — Operational scripts table

Issues:
- Line 461: only lists GitHub script `kaola-workflow-claim.js`; should include `kaola-gitlab-workflow-claim.js` and `kaola-gitea-workflow-claim.js`
- Line 461: `watch-pr` subcommand listed — GitLab uses `watch-mr`
- Line 466: `kaola-workflow-sink-merge.js` — GitHub-only name
- Line 467: `kaola-workflow-sink-pr.js` — GitHub-only; description says "open a GitHub PR via `gh pr create`"

### Line 482 — Active folder coordination

```
Kaola-Workflow treats `kaola-workflow/{project}/workflow-state.md` plus GitHub issue/PR state as the durable coordination contract. No lease/session layer remains.
```

- "GitHub issue/PR state" → forge-neutral
- **CONSTRAINT**: "No lease/session layer remains." is contract-guarded in `validate-workflow-contracts.js` line 208 — must be preserved verbatim

### Lines 496-506 — Active-folder subcommands table

Issues:
- All `Usage` column examples use `kaola-workflow-claim.js` (GitHub-only)
- Line 502: "clears advisory GitHub labels when online"
- Line 504: `watch-pr` description says "when GitHub reports MERGED or CLOSED"

### Additional occurrences
- Line 559: "Fetch open GitHub issues"
- Line 583: `watch-pr` and `kaola-workflow-sink-pr.js` without forge qualification
- Lines 595-603: `watch-pr` section GitHub-framed
- Line 611: heading "## GitHub roadmap cycle"
- Line 613: "create or refine GitHub issues" and "fetches open GitHub issues"
- Line 704: "GitHub issue state used to reject closed issues and PR state used by `watch-pr`"

## Affected Plugin File

### `plugins/kaola-workflow-gitea/commands/workflow-next.md` lines 153-154

Current (bug):
```
153: or malformed, stop for repair. On startup, also run `watch-pr` to archive PR
154: folders for merged or closed MRs before selecting new work.
```

Should be:
```
153: or malformed, stop for repair. On startup, also run `watch-pr` to archive PR
154: folders for merged or closed PRs before selecting new work.
```

One-word change: "MRs" → "PRs". The `watch-pr` on line 153 is correct for Gitea.

GitLab version (correct, for reference):
```
153: or malformed, stop for repair. On startup, also run `watch-mr` to archive MR
154: folders for merged or closed MRs before selecting new work.
```

## Naming Conventions

| Layer | GitHub | GitLab | Gitea |
|-------|--------|--------|-------|
| Script prefix | `kaola-workflow-` | `kaola-gitlab-workflow-` | `kaola-gitea-workflow-` |
| Claim script | `kaola-workflow-claim.js` | `kaola-gitlab-workflow-claim.js` | `kaola-gitea-workflow-claim.js` |
| PR/MR sink | `kaola-workflow-sink-pr.js` | `kaola-gitlab-workflow-sink-mr.js` | `kaola-gitea-workflow-sink-pr.js` |
| Merge sink | `kaola-workflow-sink-merge.js` | `kaola-gitlab-workflow-sink-merge.js` | `kaola-gitea-workflow-sink-merge.js` |
| Watch subcommand | `watch-pr` | `watch-mr` | `watch-pr` |
| Forge term | PR | MR | PR |

## Reference Pattern (from `docs/api.md`)

```
- **Script**: `kaola-workflow-sink-merge.js` (GitHub) / `kaola-gitlab-workflow-sink-merge.js` (GitLab) / `kaola-gitea-workflow-sink-merge.js` (Gitea)
```

Inline triads `(GitHub) / (GitLab) / (Gitea)` are the established forge-neutral documentation pattern.

## Validate-Workflow-Contracts.js Guards

- Line 208: `assertIncludes('README.md', 'No lease/session layer remains.')` — must preserve
- Line 82: `assertIncludes('commands/workflow-next.md', 'watch-pr')` — applies to GitHub `commands/` not plugin commands

## Test Commands

```bash
node scripts/validate-workflow-contracts.js
node scripts/simulate-workflow-walkthrough.js
```
