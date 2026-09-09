# #1053 generation evidence — source edit and full-target regeneration

Candidate: worktree `workflow/bundle-1053` (uncommitted at time of writing; baseline `d02f82b7`).

## Source edit (the only authoring source)
`templates/routing/next.skeleton.md` (+14/-1):
1. Intake section, after "State the selection aloud…": new paragraph **Task clarity.** carrying the five meanings from issue #1053 §1 (clear+authorized → continue, no fixed requirement format; missing fact → read/reproduce/look up first, implementation detail is the Agent's judgment; ask only for unresolved scope/authorization/acceptance choices while continuing independent investigation; when maintaining the issue, plain-language observable outcome + verification basis, cite what is sufficient; research/design request authorizes research/design only — no implementation, forge writes, or claim).
2. Run it section, after "An implementer may not delete, weaken, or reinterpret that acceptance to pass.": one judgment sentence (explain by communication need; verify by behavioral impact and existing requirements; short explanation or small change never lowers acceptance; sufficient existing evidence may be cited rather than reproduced).
No file path pointer to `docs/task-quality.md` was placed in the prompt: installed surfaces run in consumer repositories where that file does not exist.

## Regeneration (no hand edits to any mirror)
- `node scripts/generate-routing-surfaces.js --write` → 6 tracked Next surfaces rewritten (github/gitlab/gitea × command/skill). The same command runs each `sync-<edition>-edition.js --refresh-present`, which re-rendered all 15 present additive trees under the MAIN checkout (`TREE_ROOT` resolves a linked worktree to its main root): `.opencode{,-gitlab,-gitea}`, `.kimi{,-gitlab,-gitea}`, `.grok{,-gitlab,-gitea}`, `.cursor{,-gitlab,-gitea}`, `.zcode{,-gitlab,-gitea}`.
- `node scripts/edition-sync.js --write` → 0 files (kernel/aggregators unaffected).

## Coverage measurement (grep for one distinctive clause from each passage)
21/21 Next renders carry both passages (p1 = research/design clause, p2 = evidence-citation clause), see the table below. Compact-recovery prompts (`hooks/kaola-workflow-compact-recovery.md`, codex variant) do NOT embed the Next body (0 hits for the section heading) — no target there.

| target | p1 | p2 |
|---|---|---|
| commands/workflow-next.md (github, claude) | 1 | 1 |
| plugins/kaola-workflow-gitlab/commands/workflow-next.md | 1 | 1 |
| plugins/kaola-workflow-gitea/commands/workflow-next.md | 1 | 1 |
| plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md (codex github) | 1 | 1 |
| plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md | 1 | 1 |
| plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md | 1 | 1 |
| .opencode{,-gitlab,-gitea}/commands/workflow-next.md | 1 | 1 |
| .kimi{,-gitlab,-gitea}/skills/workflow-next/SKILL.md | 1 | 1 |
| .grok{,-gitlab,-gitea}/commands/workflow-next.md | 1 | 1 |
| .cursor{,-gitlab,-gitea}/commands/workflow-next.md (one surface per forge serves CLI/App/Cloud; product/host distinctions are in-prompt, per the cursor generator) | 1 | 1 |
| .zcode{,-gitlab,-gitea}/commands/workflow-next.md | 1 | 1 |

## Focused checks on this candidate (all exit 0)
generate-routing-surfaces --check (24 surfaces byte-match) · test-generate-routing-surfaces (480) · validate-workflow-contracts · test-bash-block-guards (49) · test-issue-1051-global-contract (55) · test-issue-1046-global-contract (141) · test-runtime-agent-architecture (859) · test-route-reachability (172) · edition-sync --check · validate-kaola-workflow-contracts.

Unexecuted here: edition suites, `npm test`, walkthrough (mission 5); install-time bytes (post-sink).
