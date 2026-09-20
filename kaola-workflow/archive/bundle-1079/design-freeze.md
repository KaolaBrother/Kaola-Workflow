# Issue #1079 — design freeze (verified facts + minimal design)

Date: 2026-09-19. Sources: issue body, /tmp/kpr-zcode-native-live-cMR6oa/NATIVE-SKILL-LIVE-MATRIX.md,
KaolaBrother/kaola-project-runner#94, this repo's routing/edition authorities.

## Verified facts (live-proven upstream)

- ZCode 3.12.3 + GLM-5.3 + KPR ACP adapter 0.3.3: workspace `.zcode/skills/<name>/SKILL.md`
  (frontmatter `name:` + `description:`) is natively discovered; `/<name>` produces ACP
  `tool_call title=Skill` pending→in_progress→completed and loads the body (unique-marker
  verified). `/$<name>` also routes natively.
- Real `/compact` completes; a previously-uninvoked Skill and a re-invoked Skill both emit
  fresh `Skill` tool calls after it. Agent need not detect compact.
- `~/.zcode/skills/` user scope is equally proven (`kaola-project-runner` resolved there).
- KPR #75: ZCode's AGENTS.md prefix survives compaction.
- ACP exposes no `available_commands_update`; no command-catalog visibility claim is made.
- Real GLM 1M auto-compact was not run upstream; the auto-compact leg must be bounded or
  marked NOT VERIFIED.

## Verified repo facts

- Canonical skill basenames (templates TOPICS): `kaola-workflow-next`,
  `kaola-workflow-init`, `kaola-workflow-finalize` — the names the issue cites exist.
- ZCode edition today renders the three command surfaces into `.zcode/commands/` via
  `sync-zcode-edition.js` (`--runtime zcode`, ZCODE_HOME resolver, native_only adapter).
- Kimi precedent: directory-form `skills/<name>/SKILL.md` rendered FROM command surfaces —
  "skill-shaped but command-lane" (test-route-reachability).
- `RECOVERY_FULL_DISPATCH_RUNTIMES` = grok/cursor/devin/droid: their `~` global carrier
  renders the full compact-recovery prompt and their generated surfaces defer the dispatch
  block to a pointer.
- ZCode global carrier: managed region in `${ZCODE_HOME:-~/.zcode}/AGENTS.md` (registry
  `zcode-local`, survives compact per #75). Project `AGENTS.md` is never written.
- `--runtime zcode` is already accepted by kaola-workflow-claim.js.

## Design

1. ZCode workflow surfaces ship as native Skills: `.zcode/skills/<skill-basename>/SKILL.md`
   rendered from the canonical COMMAND surfaces (content lane unchanged) + ZCode
   transforms: `--runtime zcode`, ZCODE_HOME resolver, zcode adapter block, deferred
   dispatch block, and route renames `/workflow-next`→`/kaola-workflow-next`,
   `/workflow-init`→`/kaola-workflow-init`. `.zcode/commands/` retires.
2. zcode joins RECOVERY_FULL_DISPATCH_RUNTIMES: `~/.zcode/AGENTS.md` managed region gains
   the compact-recovery render (contract + Resume + dispatch contract + zcode adapter).
3. zcode adapter: `compact_protocol` records the measured carrier; `delegation_guidance`
   states the reload entry — native `/kaola-workflow-next` / `/kaola-workflow-finalize`
   Skill invocation, never a manual `read`.
4. Registry `zcode-local.reload` updated to the measured lifecycle.
5. install-zcode.sh deploys `skills/` to `<project>/.zcode/skills/` or
   `${ZCODE_HOME}/skills/` (--global); retires the three deployed command basenames;
   uninstall mirrors. No hooks/plugins/scheduler/ledger; receipts stay the only state.
6. Tests/docs updated; live legs via the proven ACP adapter.

## Boundaries

- No dependency on unfrozen KPR #94 interfaces; the ACP evidence is sufficient.
- Codex compact hook untouched; no cross-host recovery framework.
- Auto-compact leg bounded or explicitly NOT VERIFIED.
