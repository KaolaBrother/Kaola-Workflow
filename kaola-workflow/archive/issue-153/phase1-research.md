# Phase 1 - Research / Discovery: issue-153

## Deliverable
Inherit-decouple the subagent model badge: rewrite every INSTALLED agent
frontmatter `model:` to `inherit`, while filling each command-file
`model="..."` placeholder from the *intended* concrete model (the source/profile
frontmatter value, captured before the rewrite). Result: every dispatched
`model=` literally differs from the installed `inherit` frontmatter → Claude Code
renders the badge on every subagent card, with no parent-equal edge case.

## Why
~74% of post-#152 dispatches render no badge because the dispatched model equals
the agent's frontmatter default (a no-op override). The badge is an *override*
indicator: it renders only when `model=` differs from the agent's installed
`model:`. Making installed frontmatter `inherit` turns every concrete dispatched
model into a genuine override → always badges. The explicit `model=` still
controls which model the agent runs on, so cost profiles are preserved.

## Affected Area
- `install.sh`: `install_agent_files` (253–327, esp. cmp 281 / manifest 286–298 /
  copy 301 / hash record 311), `extract_agent_model` (345–361, reads INSTALLED
  file), `resolve_agent_model_for_install` (363–374, inherit→empty at 370),
  `model_for_placeholder` (376–388), `render_command_file` (390–424, drops
  `model=` line on empty at 413–416). Profile select 269–271.
- `scripts/kaola-workflow-resolve-agent-model.js` (runtime resolver, inherit→'' at 48)
  + `scripts/test-agent-model-resolver.js`.
- `agents/*.md` (9 base) + `agents/profiles/higher/*.md` (3 overrides) — source `model:`.
- `commands/*.md` (7 phase/fast files) + `plugins/kaola-workflow-gitlab/commands/*`
  + `plugins/kaola-workflow-gitea/commands/*` — command templates (mirrored).
- `scripts/test-install-model-rendering.js`, `scripts/validate-workflow-contracts.js`,
  `scripts/validate-vendored-agents.js`.

## Key Patterns Found
1. **Core tension**: `resolve_agent_model_for_install` (install.sh:363–374) reads
   the INSTALLED agent file via `extract_agent_model` (345–361), but
   `install_agent_files` already copied source→installed at line 329. So if
   installed frontmatter becomes `inherit`, resolution returns empty →
   `render_command_file` (413–416) DROPS the `model=` line → command files lose
   their concrete model → `test-install-model-rendering.js` fails. The fix MUST
   source the concrete model from the SOURCE agent file (profile-applied),
   captured before/independent of the inherit rewrite.
2. **Parallel resolver in JS** (`scripts/kaola-workflow-resolve-agent-model.js:44–49`)
   mirrors bash semantics; both already map `inherit → ""`. Tests at
   `test-agent-model-resolver.js:37–38` already expect `inherit→''` — no break there.
3. **Profile mechanism** (install.sh:269–271): `--profile=higher` swaps source to
   `agents/profiles/higher/<name>.md` when present; only code-architect,
   code-reviewer, security-reviewer have higher (→opus) variants; planner is
   opus in both. The intended model = the profile-selected source frontmatter.
4. **sha256/cmp coupling** (install.sh:281 cmp, 286–298 manifest hash, 311 record):
   after the rewrite, installed ≠ source byte-for-byte, so the "already installed"
   cmp fast-path at 281 never fires — always falls to the manifest path.
   Behavioral change, not a test break. `source-sha256` in agent frontmatter
   (validate-vendored-agents.js:63) is upstream provenance, NOT an install hash —
   unaffected by changing the `model:` value, but the line must survive the rewrite.

## Test Patterns
- Framework: hand-rolled `assert` (no test framework). Node scripts.
- Location: `scripts/test-*.js`, `scripts/validate-*.js`.
- Structure: `npm test` runs claude/codex/gitlab/gitea suites. Claude suite =
  validate-script-sync → validate-vendored-agents → `bash -n install.sh` →
  test-agent-model-resolver → test-install-model-rendering → validate-workflow-contracts
  → simulate-workflow-walkthrough.
- `test-install-model-rendering.js` runs a REAL `install.sh --profile=higher` into
  a temp HOME and asserts installed COMMAND files keep concrete `model="opus|sonnet|haiku",`.
  This is the test that breaks under a naive fix and must keep passing.

## Config & Env
- `--profile=common|higher` (install.sh:43,76–88). No new env vars needed.
- `.kaola-workflow-agent-manifest` (install hash manifest). `kaola-workflow-managed-agent: true` marker.

## External Docs
N/A - internal patterns sufficient. Claude Code badge mechanics are empirically
verified (see project memory `cc-subagent-model-badge-mechanics`): badge renders
when dispatched `model=` differs literally from installed frontmatter `model:`;
`inherit` baseline differs from every concrete model with no parent-equal edge.
Caveat: frontmatter is cached at session start → reinstall + Claude Code restart
required to observe the badge change.

## GitHub Issue
KaolaBrother/Kaola-Workflow#153

## Completeness Score
10/10 (goal 3/3, outcome 3/3, scope 2/2, constraints 2/2)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | external behavior already verified in project memory; internal patterns sufficient | no library/API behavior in scope |

## Notes / Future Considerations
- Tradeoff to record in Phase 2 decision: under `inherit`, `model=` becomes
  correctness-critical — if the orchestrator drops it, the agent silently runs on
  the parent (Opus). Post-#152 dispatch compliance is 100%, so risk is low, but
  it must be acknowledged in the decision record.
- Non-goal (do not address): parallel-dispatch badge visibility (two `Agent`
  calls in one turn can hide the badge) — separate UI concern.
- Open design question for Phase 2/3: HOW to make resolution read the source
  (profile-applied) model before the inherit rewrite — capture intended models
  into a map during `install_agent_files`, or rewrite frontmatter to inherit
  during the copy and resolve from a separately-read source. Confirm approach
  with advisor before Phase 3 write set.
