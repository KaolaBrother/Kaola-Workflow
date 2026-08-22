# Independent code review - issue #1014

finding: id=R1 scope=in_scope action=fix status=resolved severity=high fix_role=implementer rationale=COMMON_SCRIPTS-validator-mirror-copied-in-e25ac72b

## Admitted findings

### R1 - COMMON_SCRIPTS drift: validate-workflow-contracts.js mirror not updated

- Failure class: contract-drift / shared-script desync.
- Trigger: commit `019a4062` edits `scripts/validate-workflow-contracts.js` (next heading pin, phaseCommands exclusion, overlay rewrite pin) and does not copy the same bytes to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.
- Expected: the pair stays byte-identical. `validate-workflow-contracts.js` is in `COMMON_SCRIPTS` in `scripts/validate-script-sync.js`. `node scripts/validate-script-sync.js` exits 0. `test:kaola-workflow:claude` and `test:kaola-workflow:codex` both run that guard first.
- Observed: `node scripts/validate-script-sync.js` from the issue-1014 worktree exits 1 with `Out of sync (scripts/ vs plugins/kaola-workflow/scripts/): validate-workflow-contracts.js`. The plugin copy still lacks the #1014 next/overlay assertions.
- Primary anchor: `scripts/validate-workflow-contracts.js` vs `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` at `019a4062`.
- Secondary anchors: `scripts/validate-script-sync.js:45-53` (`COMMON_SCRIPTS` includes `validate-workflow-contracts.js`); `package.json` `test:kaola-workflow:claude` and `test:kaola-workflow:codex` both invoke `validate-script-sync.js`; `kaola-workflow/issue-1014/suites-green.md` lists generate-check, contract validators, edition suites, and walkthrough 186/186, and does not run script-sync.
- Why existing guards did not stop the close-out: Layer 5 / `suites-green.md` never invoke `validate-script-sync.js`. `simulate-workflow-walkthrough.js` does not run it. `test-cursor-edition.js` does not compare COMMON_SCRIPTS. Direct `node scripts/validate-workflow-contracts.js` reads the updated canonical file and stays green. That is how GREEN can lie for the listed suites while both forge chains fail.
- Reproducer: from `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1014` run `node scripts/validate-script-sync.js`.
- Repair: copy canonical `scripts/validate-workflow-contracts.js` onto the Codex plugin path. No new test is required; the existing sync guard already fails.

## Focus checks that did not become findings

- `templates/routing/next.skeleton.md` REGION:command heading is after Consent and before Step 1. Canonical `commands/workflow-next.md` (and gitlab/gitea twins) carry `## Agent Model Dispatch`, contain `You MUST pass \`model=`, and do not contain `model="{`.
- `CURSOR_MODEL_DISPATCH_BLOCK` omits per-call `model` including `inherit`, forbids `generalPurpose` impersonation, names `subagent_type: "<role>"` only, and carries catalog preflight / cold-start / Invalid-enum fail-closed. Generated `.cursor/commands/workflow-next.md` and `kaola-workflow-finalize.md` share that block; cursor `workflow-init.md` receives the same block via `transformCommandBody`.
- `copyListCanonAgents` copies only `listCanonAgents()` names; G9 mutation rejects stray `user-agent.md`. Production catalog preflight is command-card prose, not a call of this helper. That matches Layer 1.3 (injected snippet). Not admitted.
- `install-cursor.sh --global` still writes un-nested `${CURSOR_HOME}/{agents,commands}`. From a git cwd it dual-writes `$(git rev-parse --show-toplevel)/.cursor/{agents,commands}`. A non-git cwd does not invent a project `.cursor/` tree. G8 installer fixtures cover both. No nested `.cursor/` under `CURSOR_HOME`.
- Overlay rewrite is in `templates/routing/init.skeleton.md` and the generated init command/skill surfaces. Old `configured model` / `ships its model in its installed profile` needles are gone from those overlays. Codex `kaola-workflow-next` skills have no `## Agent Model Dispatch` and no T19 conflict needles (`REGION:command` stripped).
- `phaseCommands` in the canonical validator is still only finalize. next is a separate pin and is not folded into the `model="{` loop.
- Diff `3a289108..019a4062` does not touch `kaola-workflow-claim.js`, does not restamp #1013 agent frontmatter, does not add `Task(model=)`, and does not change Grok effort pins.

## Live close evidence (independent parse)

- Probe A stream SHA-256 matches `live-cursor.md`. Session `acddc60d-...`. Named `implementer` omit-model is schema-rejected against the five builtins. No retry as `generalPurpose`.
- Probe 23: 34/34 JSON lines. Session `223ae129-...`. `implementer` envelope `cursor-grok-4.6-medium` -> `STANDARD_CHILD_1014`. `code-reviewer` envelope `cursor-grok-4.6-high` -> `REASONING_CHILD_1014`. No authored inherit. No `generalPurpose`.
- Probe 4: 102/102 JSON lines. Zero `taskToolCall`. Fail-closed text prints `./install-cursor.sh --target "$PWD"` and tells the operator to start a new chat. `generalPurpose` appears only in the user prompt and thinking about the card, not as a Task type.

## GREEN can lie

- Yes, for the close-out suite list: cursor-edition 584, the three contract validators, generate --check, other edition suites, and walkthrough 186/186 can all pass while `validate-script-sync.js` fails. `npm test` / both claude and codex chains would not pass.
- Cursor-edition pins for next heading, shared dispatch block, G8 dual-write, and G9 copy-filter are real and mutation-shaped. They do not cover COMMON_SCRIPTS identity.
- Live Cursor envelopes are not a lie: the raw streams distinguish medium vs high and Probe 4 does not impersonate.

verdict: fail
findings_blocking: 1
review_conclusion: The Cursor next catalog and live envelopes hold, but the COMMON_SCRIPTS validator mirror is desynced so the listed GREEN suites can pass while both forge chains fail.
