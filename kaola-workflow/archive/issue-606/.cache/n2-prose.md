evidence-binding: n2-prose cb6acdc8ade0
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: cross-edition agent-facing prose hardening (teammate-mode dispatch subsection across six
plan-run surfaces + a Claude dispatch-posture config-audit line across three workflow-init commands) plus
the mechanical needle guards that pin that prose. No behavioral unit under test — this is prose
authoring/propagation with machine-checked regex/substring contracts (validate-*-contracts.js,
test-route-reachability.js), not new runtime logic.
<!-- regression-green|build-green|smoke-integration -->
regression-green: node scripts/validate-workflow-contracts.js -> "Workflow contract validation passed" exit=0;
node scripts/validate-kaola-workflow-contracts.js -> "Kaola-Workflow Codex contract validation passed" exit=0;
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> "Kaola-Workflow GitLab
contract validation passed" exit=0; node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
-> "Kaola-Workflow Gitea contract validation passed" exit=0; node scripts/test-route-reachability.js ->
"Route-reachability test passed (245 assertions)" exit=0 (233 baseline + 12 new T14 assertions across the six
plan-run surfaces); node scripts/validate-script-sync.js -> "OK: 24 common scripts, 25 byte-identical groups..."
exit=0 (confirms the claude validator twin stays byte-identical); node scripts/simulate-workflow-walkthrough.js
-> "Workflow walkthrough simulation passed" exit=0. Before-state: all six validators/route-reachability green
on unmodified prose (needles did not yet exist, so nothing asserted them — verified separately via RED proof:
`git show HEAD:<file> | grep -F "<needle>"` returned nothing for every needle on every one of the 9 prose files
pre-edit). After writing the prose AND the needles together, all six commands above are green with real exit
codes captured directly (never piped through tail/head).

## Work summary

**Arm A — teammate-mode dispatch subsection (verbatim-identical across all six plan-run surfaces):**
Inserted a new `#### Teammate-Mode Dispatch` subsection into "### 3. Dispatch the role agent" (Loop Skeleton),
immediately after the existing `{task_name}` announcement-contract sentence and before each file's next
dispatch-mechanics paragraph (Codex effort-proof rules on the commands; "Delegate to the base role profile..."
on the SKILL packs). Placed identically in:
- commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md

Content (byte-identical across all six): named-teammate spawn under `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
(env probe first, settings env-block fallback), SendMessage for the existing bounded repair nudges instead of
re-dispatch, synchronous spawn only when a blocking result is genuinely required; the required verbatim
one-nudge idle-race sentence; the classic-mode no-op statement; the "transport not contract" closing line.

**Arm B — Claude dispatch-posture config-audit line (three workflow-init COMMAND surfaces only):**
Added a `> **Claude dispatch posture note:**` blockquote immediately after the existing `> **Codex hooks
note:**` blockquote and before "Keep the working-principle bullets concise." — entirely OUTSIDE the
`<!-- KW-CLAUDE-TEMPLATE-START/END -->` region, in:
- commands/workflow-init.md
- plugins/kaola-workflow-gitlab/commands/workflow-init.md
- plugins/kaola-workflow-gitea/commands/workflow-init.md

Content: env-probe-first / settings-env-block-fallback audit of `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`,
reports `claude_dispatch_posture: teams | classic`, explicitly report-only (never writes user config),
remediation leads with the always-available classic path and only then notes agent teams as experimental
+ flag-gated. The three `plugins/*/skills/kaola-workflow-init/SKILL.md` packs were left BYTE-UNCHANGED
(not edited at all — confirmed via `git diff --stat`, which shows zero changes to any kaola-workflow-init
SKILL.md file).

**Template-block byte-unchanged verification:** ran a script that extracts the
`<!-- KW-CLAUDE-TEMPLATE-START/END -->` slice from each of the three edited workflow-init commands (old
HEAD version vs new working-tree version) and diffed them — all three report `template-block-unchanged: true`.

**Arm C — machine guards (RED before prose, GREEN after):**
- `scripts/validate-workflow-contracts.js` (+ byte-identical twin `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`):
  added an ALL-SIX-SURFACE loop (`planRunSurfaces606`, mirrors the existing `#486 adaptSurfaces486` pattern)
  pinning the teammate sentinel + idle-race sentence across all six plan-run surfaces, plus a single
  `assertIncludes('commands/workflow-init.md', 'claude_dispatch_posture: teams | classic')` (this validator's
  established scope is the root command only).
- `scripts/validate-kaola-workflow-contracts.js` (codex github + owns the root-command cross-check for
  workflow-init): added two flat `assertIncludes` on the github codex SKILL for the teammate needles (matching
  the existing `#602/#604/#605` flat-assertion convention on this file), and a new `workflowInitCommands606`
  array covering all three workflow-init COMMAND files (this file already owns the cross-edition
  `KW-CLAUDE-TEMPLATE` byte-identity + phase-ban checks spanning all three commands, so it is the natural
  cross-edition home for Arm B).
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` and
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`: extended each file's
  existing `for (const planRunSurface of [command, skill])` loop (the same loop that already carries the
  `#602/#604/#605` needles) with the two new teammate-mode assertIncludes calls, and added one
  `assertIncludes` on that edition's own `commands/workflow-init.md` for the posture line — each edition's
  `npm run test:kaola-workflow:<edition>` chain is self-sufficient without depending on the claude/codex
  validators.
- `scripts/test-route-reachability.js`: added a new `T14` block (same shape/style as the existing `T12`
  block — unconditional `assert()` per surface, `norm()`-normalized comparison) pinning the teammate sentinel
  + idle-race sentence across all six plan-run surfaces.

**Surprise / gotcha found and fixed:** the teammate sentinel sentence line-wraps across two source lines in
the authored markdown ("...a NAMED\nteammate, name = node id..."). The five `validate-*-contracts.js`
`assertIncludes` helpers already whitespace-normalize via `norm()`, so they passed immediately. My first cut
of `T14` in `test-route-reachability.js` used a raw (non-normalized) `content.includes(...)` and went RED
across all 12 assertions even though the prose was correct — fixed by reusing the file's existing `norm()`
helper (the same normalization `T12` uses two blocks above), matching the file's own established convention.
This was caught and fixed before declaring done — final `T14` run is green (245 total assertions, 233
baseline + 12 new).

**Write set (15 files, all inside the declared write set, zero scope creep — confirmed via `git diff --stat`):**
commands/kaola-workflow-plan-run.md, commands/workflow-init.md,
plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md,
plugins/kaola-workflow-gitea/commands/workflow-init.md,
plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js,
plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md,
plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md,
plugins/kaola-workflow-gitlab/commands/workflow-init.md,
plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js,
plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md,
plugins/kaola-workflow/scripts/validate-workflow-contracts.js,
plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md,
scripts/test-route-reachability.js, scripts/validate-kaola-workflow-contracts.js,
scripts/validate-workflow-contracts.js.

**PROVENANCE_BAN:** scanned all 9 edited prompt-surface files (the 6 plan-run surfaces + 3 workflow-init
commands) against the `/#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/` regex — all
clean (zero matches). The `#606`-prefixed comments I added live only in the `.js` validator files (tooling,
not prompt surfaces), matching this repo's own established convention of issue-numbered validator comments
(e.g. the pre-existing `#602`/`#604`/`#605`/`#486` comments this diff sits next to).
