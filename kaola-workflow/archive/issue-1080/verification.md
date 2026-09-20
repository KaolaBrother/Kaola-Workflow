# Issue #1080 — verification evidence

Candidate: `151aeba212d6ffa2309024f7372de9850141e15b` on branch `workflow/issue-1080`
(child worktree `.kw/worktrees/issue-1080`; base `920ca7ce`).

## Focused suites (all green)

| Command | Result |
|---|---|
| `node scripts/validate-workflow-contracts.js` | `Workflow contract validation passed` |
| `node scripts/test-runtime-agent-architecture.js` | `730 assertions` |
| `node scripts/test-generate-routing-surfaces.js` | `480 assertions` |
| `node scripts/test-route-reachability.js` | `148 assertions` |
| `node scripts/validate-kaola-workflow-contracts.js` | passed |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | passed |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | passed |
| `node scripts/validate-script-sync.js` | 14 common scripts + 18 groups in sync |
| `node scripts/test-validate-script-sync.js` | 56 assertions |
| `node scripts/test-issue-1044-runtime-adapters.js` | 65 passed |
| `node scripts/test-issue-1046-global-contract.js` | 171 passed |
| `node scripts/test-issue-1051-global-contract.js` | 50 passed |
| `node scripts/test-kimi-edition.js` | 434 assertions |
| `node scripts/generate-routing-surfaces.js --check` | all 24 surfaces byte-match |
| `node scripts/edition-sync.js --check` | 6 forge aggregator ports in parity |
| `node scripts/generate-agent-profiles.js --check` | 42 native renders current |

## Integration walkthrough

`node scripts/simulate-workflow-walkthrough.js` →
`##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":178,"ran":178,"passed":178,"failed":0}`
`Workflow walkthrough simulation passed`

## Additive edition lane

`env -u DSH_HOME npm run test:kaola-workflow:editions` → `edition test lane passed: all 11 suites executed successfully.`

`DSH_HOME` is unset for the lane so the shared global-contract installer resolves every carrier
under the hermetic fixture `HOME`; with the inherited machine `DSH_HOME=/Users/ylminiserver/.dsh`
the Devin/Droid fixture installs try to write the user DSH carrier and the sandbox denies it. That is
test isolation, not a candidate regression. No `~/.dsh` path was written at any point.

## Four-chain receipt

`node scripts/kaola-workflow-run-chains.js --project issue-1080 --json` →
`kaola-workflow/issue-1080/.cache/chain-receipt.json`

- `headSha`: `151aeba212d6ffa2309024f7372de9850141e15b`
- `scope`: `decision=all-four`, `reason=edition_coupling`, base `920ca7ce`, 38 changed files
- claude: 35 steps, 1 non-zero — `scripts/test-issue-1052-cursor-cli-startup-prep.js` exit 1
- codex / gitlab / gitea: all steps exit 0

The single red step is environmental. On Darwin the #1052 test reads the parent command line with
`ps -ww -p PID -o args=`; this sandbox denies that call (`/bin/ps: Operation not permitted`,
exit 126), so all 14 `ps`-dependent assertions fail (`ps=""`). `git diff 920ca7ce HEAD --
scripts/test-issue-1052-cursor-cli-startup-prep.js` is empty — the candidate does not touch the
test or the claim path it exercises. Retrying the run with `danger-full-access` requires approval
and no approval channel is available, so the claude leg cannot be turned green in this environment.
A four-chain receipt must be re-run on an unrestricted Darwin host for a green release receipt.

## Negative-pin mutant proof

```
printf '# planted\n' > CLAUDE.md
node scripts/validate-workflow-contracts.js
# exit 1: Error: AGENTS.md is the only repository-level instruction surface; remove CLAUDE.md
#         (any repository CLAUDE.md shadows AGENTS.md for Claude Code)
node scripts/test-runtime-agent-architecture.js
# exit 1: FAIL: A2: no root CLAUDE.md — AGENTS.md is the only repository-level instruction surface
rm CLAUDE.md
node scripts/validate-workflow-contracts.js   # Workflow contract validation passed
```

## Live Claude Code probe

`claude --version` → `2.1.277 (Claude Code)`

```
cd .kw/worktrees/issue-1080
claude -p --model haiku --max-turns 1 \
  "In one short line, quote the exact command this repository's project instructions name for the integration walkthrough."
# -> `node scripts/simulate-workflow-walkthrough.js`
```

The command exists only in root `AGENTS.md`, so `AGENTS.md` is loaded directly with no root
`CLAUDE.md` present. (`claude -p` did not print the interactive `no CLAUDE.md found; AGENTS.md
loaded:` diagnostic line; `--debug` produced no matching trace. The project-fact answer is the
recorded evidence.)

## Invariants preserved

- `git diff 920ca7ce HEAD -- install.sh hooks/hooks.json` → empty (byte-identical).
- `~/.claude/rules/kaola-workflow-global.md` sha256 `7b66221b117fb160f916e686061e65569ef3554628fdb12ebb767eb1dbaf79aa`, mtime `Sep 18 21:05:11 2026` — untouched.
- `git ls-files | grep -E '^(CLAUDE\.md|\.claude/CLAUDE\.md|CLAUDE\.local\.md)$'` → none.
- No `~/.dsh` content was created or modified (sandbox denied the one attempt; the lane run used a hermetic/unset `DSH_HOME`).
