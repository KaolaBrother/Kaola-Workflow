# Code Explorer: issue-42 — Remove /workflow-next-pr + Prompt-Intent + Merge-to-PR Auto-Fallback

## Files to DELETE
- `commands/workflow-next-pr.md` (36 lines) — sets KAOLA_SINK=pr, delegates to /workflow-next
- `plugins/kaola-workflow/skills/kaola-workflow-next-pr/SKILL.md` (30 lines) — Codex equivalent, line 19 sets export KAOLA_SINK=pr

## Files to MODIFY

| File | Relevant Lines | Change Type |
|------|----------------|-------------|
| `commands/workflow-next.md` | 78 (pick-next --sink flag), 91-100 (startup KAOLA_SINK_FLAG) | Add NLU intent block before startup |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | 72-73, 91-100 | Add NLU intent block before startup |
| `scripts/kaola-workflow-sink-merge.js` | 114, 134, 212, 219 | Add exit code 3 for branch-protected/non-ff/permission-denied |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Same | Mirror — must be byte-identical |
| `scripts/kaola-workflow-claim.js` | 712-724 (buildSinkBlock), 769-799 (updateSinkLease) | Add sink_fallback_reason field support |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Same | Mirror — must be byte-identical |
| `commands/kaola-workflow-phase6.md` | 617-621 (read SINK_KIND), 630-653 (dispatch case) | Add auto-fallback pivot after merge exit 3 |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | 176-228 (dispatch logic) | Add auto-fallback pivot after merge exit 3 |
| `scripts/validate-workflow-contracts.js` | 295-308 (pr-sink assertion block, esp. 299-301) | Remove next-pr existence/line-count assertions |
| `scripts/validate-kaola-workflow-contracts.js` | 73 ('kaola-workflow-next-pr' in skills array) | Remove that one entry |
| `README.md` | 181 (skills list), 414-418 (PR Sink section) | Remove skill, rewrite PR-sink docs |
| `scripts/simulate-workflow-walkthrough.js` | Epic Case 7 area (~line 1253+) | Add Epic Case 18: branch-protection auto-fallback |
| `CHANGELOG.md` | Under [Unreleased] | Add entry |

## How --sink pr Flows End-to-End

1. Agent sets KAOLA_SINK=pr (currently: from workflow-next-pr.md; after #42: from NLU in workflow-next.md)
2. cmdStartup/cmdPickNext: parses --sink pr (line 160); validates (line 878/1331/2403); buildLockData() line 893: sink: (args.sink === 'pr') ? 'pr' : 'merge'
3. updateSinkLease() lines 769-799 writes ## Sink block to workflow-state.md with sink: pr
4. Phase 6 finalize reads SINK_KIND via awk '/^## Sink/,0' (phase6.md L617-621 / finalize SKILL.md L176-184)
5. Dispatch: sink: pr → kaola-workflow-sink-pr.js; sink: merge → kaola-workflow-sink-merge.js

## buildSinkBlock() (lines 712-724)
Constructs the ## Sink markdown block. Emits: branch:, issue_number:, claimed_at:, sink:, optional pr_url:, optional pr_number:
No sink_fallback_reason: field yet — must be added.

## sink-merge.js Exit Codes
- Exit 0: success (merge + push completed)
- Exit 1: any failure — generic catch(err) at line 219 — covers ALL errors (branch-protected, permission, transient, network)
- Exit 2: FF race exhausted — line 212

Gap: No distinction between branch-protected/non-ff/permission-denied (should pivot to PR) vs transient (should not).
Fix: Add exit code 3 for merge-impossible failures by checking stderr for:
  - "remote: error: GH006: Protected branch update failed"
  - "! [remote rejected]" + "protected branch"
  - "non-fast-forward"
  - "permission denied" / "403"

## Validator Assertions to Remove
- validate-workflow-contracts.js lines 299-301: assert exists('commands/workflow-next-pr.md') + line count check
- validate-kaola-workflow-contracts.js line 73: 'kaola-workflow-next-pr' entry in skills array

## NLU/Intent Pattern
No existing precedent — this is entirely new. The NLU block should be added as prose instructions in commands/workflow-next.md and plugins/.../kaola-workflow-next/SKILL.md before the startup block. The agent reads $ARGUMENTS or the conversation for PR intent keywords: "pr", "pull request", "open pr", "create pr", "publish as PR", "finish with PR mode". If detected, set KAOLA_SINK=pr before the startup call.

## simulate-workflow-walkthrough.js Test Naming
- Top-level: // Epic Case N: description
- Sub-tests: N[A-Z] uppercase suffix (e.g., 7A, 7G, 18A)
- Assert messages: 'Epic Case N: message' or 'Nsuffix: message'
- New test: Epic Case 18: branch-protection auto-fallback from merge to PR

## Script Parity Enforcement
validate-script-sync.js enforces byte-identity between scripts/ and plugins/kaola-workflow/scripts/ for 7 COMMON_SCRIPTS including kaola-workflow-sink-merge.js and kaola-workflow-claim.js.

## plugin.json
Uses "skills": "./skills/" directory reference (line 22) — no per-skill enumeration. Deleting kaola-workflow-next-pr/ directory requires no plugin.json change.

## Files NOT Needing Changes
- install.sh, uninstall.sh — zero references to workflow-next-pr
- scripts/validate-script-sync.js — does not reference command/skill files
- plugin.json — directory-based skills reference

## sink_fallback_reason
Zero existing usage. Net-new design. Must be added as optional field in ## Sink block via buildSinkBlock() and updateSinkLease().
