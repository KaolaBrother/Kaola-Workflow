# scout-forge-fix — implementer evidence

## task
Fix a forge-neutrality defect introduced by the scout-role node: line 10 of the three edition plugin `issue-scout.toml` files referenced the `gh` CLI by name, which is forbidden by the GitLab edition's `assertNoForbidden` validator. The fix removes the CLI-specific parenthetical `(gh issue list, gh issue view)` so the line reads `- Open issues via the forge CLI;` — forge-neutral, matching the convention of every other toml in the plugin trees.

## non_tdd_reason
**Config / IaC** — forge-neutrality correction to declarative agent-profile prose. The three `.toml` files contain no behavioral logic; they are static developer-instruction strings consumed at agent boot. Proof is the green forge chains (all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` pass + `node scripts/simulate-workflow-walkthrough.js` exit 0).

## write_set
- `plugins/kaola-workflow/agents/issue-scout.toml`
- `plugins/kaola-workflow-gitlab/agents/issue-scout.toml`
- `plugins/kaola-workflow-gitea/agents/issue-scout.toml`

## change summary

### before (line 10, all three files)
```
- Open issues via the forge CLI (gh issue list, gh issue view);
```

### after (line 10, all three files)
```
- Open issues via the forge CLI;
```

## 3-way byte-diff confirmation
```
diff plugins/kaola-workflow/agents/issue-scout.toml \
     plugins/kaola-workflow-gitlab/agents/issue-scout.toml
(no output)

diff plugins/kaola-workflow/agents/issue-scout.toml \
     plugins/kaola-workflow-gitea/agents/issue-scout.toml
(no output)
```
All three files are byte-identical after the change.

## verification_commands and exit codes

| chain | command | exit |
|-------|---------|------|
| gitlab | `npm run test:kaola-workflow:gitlab` | 0 |
| gitea | `npm run test:kaola-workflow:gitea` | 0 |
| claude | `npm run test:kaola-workflow:claude` | 0 |
| codex | `npm run test:kaola-workflow:codex` | 0 |
| simulate | `node scripts/simulate-workflow-walkthrough.js` | 0 |

## build-green

All five verification commands exited 0. The `gitlab` chain (which was previously failing on the `gh` forbidden-reference in `issue-scout.toml`) now passes cleanly. The `assertNoForbidden` check no longer flags `issue-scout.toml`. All four edition chains and the simulate-workflow-walkthrough pass.
