evidence-binding: n1-runtime c8d8366941c6

# n1-runtime — runtime correctness (code-explorer, read-only)

## Dimension #2 — Model tiers / two-tier opencode.json / reasoning-set completeness

**A — committed `opencode.json` is the NEUTRAL template; both tiers inherit at runtime.** `opencode.json:1-22` has only `$schema`, `default_agent: "build"`, commented pins (no `provider`, no `agent`). This is `renderNeutralConfig()` (`sync-opencode-edition.js:369-428`); `ENV_*_MODEL` empty by default. So on a fresh install NO per-role effort variant resolves — every agent inherits the user default. A7 `read('opencode.json') === renderOpencodeJson()` no-args holds.

**B — `--adapt` is the ONLY path materializing per-agent effort.** `renderOpencodeJson(opts)` → `renderAdaptiveConfig` only when `opts.inheritModel` parses to a known provider (`:313-323`); emits `provider.<id>.models.<model>.variants.{top,second}` + `agent.<role>.variant` (`:325-367`). Installer runs `--write-config-to "$cfg" --adapt` once (`install-opencode.sh:125`); `seed_config` preserves existing (`:116-119`). File is user-owned thereafter.

**C — reasoning/top-tier set is COMPLETE; higher-profile Opus roles ARE included.**
- `topTierRoles()` = `higherProfileRoles() ∪ reasoningRoles()` (`:271-278`).
- `higherProfileRoles()` reads `agents/profiles/higher/*.md` → {code-architect, code-reviewer, security-reviewer} (`:262-266`; each carries `model: opus`).
- `reasoningRoles()` scans canonical `agents/*.md` for `model: opus` → {planner, synthesizer, workflow-planner}.
- **Top tier (6):** code-architect, code-reviewer, security-reviewer, planner, synthesizer, workflow-planner. **Standard (9):** adversarial-verifier, build-error-resolver, code-explorer, contractor, doc-updater, implementer, issue-scout, knowledge-lookup, tdd-guide.

**Verdict on issue open question:** NO gap. `agents/profiles/higher/` Opus profile is included via `higherProfileRoles()`. "User promotes via `--adapt`" IS sufficient; without `--adapt` both tiers intentionally inherit (user-owned contract).

defects (#2): none. (Caveat, not defect: fresh-clone consumer who never runs installer sees no tier differentiation — documented "user-owned" contract; `--write` preserves opencode.json `:482-486`.)

## Dimension #3 — Hooks

**Adapter model.** `.opencode/plugins/kaola-workflow-hooks.js` is ESM (`import`/`export default`), signature `KaolaWorkflowHooks({directory, worktree})` matches opencode plugin contract (`{project,client,$,directory,worktree}` → `{...hooks}`). Bun auto-detects ESM regardless of `"type"`. Returns `tool.execute.before` + `experimental.session.compacting`.

**opencode vs Claude.** `tool.execute.before` is `async (input, output)`, `input.tool`=tool name, `output.args`=args. `throw`=deny is documented (`.env` example). Adapter follows: `if (r.status===2){ throw new Error(...) }` (`:114-116, :124-128`). Shell scripts byte-copied from canonical `hooks/` (A10 `test-opencode-edition.js:269-276`).

**Per-hook payload trace:**
1. pre-commit — adapter sends `{tool_input:{command: args.command}}` (`:113`); hook reads `d.tool_input.command` (`pre-commit.sh:14`). MATCH ✓.
2. write-lane — adapter `fp = args.filePath||args.path||args.file_path` (`:121`), sends `{tool_input:{file_path:fp}}` (`:123`); hook reads `d.tool_input.file_path` (`write-lane.sh:31`). MATCH ✓. (Dormant unless `KAOLA_LANE_CONTAINMENT` set.)
3. dispatch-log — adapter `st=args.subagent_type||args.agent` (`:136`), sends `{agent_type:st, agent_id:"", cwd}` (`:137`); hook reads `p.agent_type`/`p.agent_id`/`p.cwd`. MATCH ✓. **Limitation:** `agent_id` hardcoded `""` — closure attestation keys on `agent_type+cwd` so non-blocking data degradation.
4. session.compacting — adapter `output.context.push(resume)` (`:144-151`); matches compaction example. ✓

**Coverage vs canonical `hooks.json` (4 entries):** SessionStart→compacting ✓; PreToolUse Bash→tool.execute.before ✓; Write|Edit→tool.execute.before ✓; SubagentStart→tool.execute.before ✓. All 4 covered; none uncovered.

**`node --check` concern:** A11 (`test-opencode-edition.js:286`) runs `node --check` on the ESM `.js` plugin. `.opencode/package.json` has NO `"type":"module"` (and is gitignored `.opencode/.gitignore:2-3`). Under Node CommonJS-by-default this is fragile; Bun loads fine. Robustness/portability concern, not a runtime defect.

defects (#3):
- D1 [follow-up] `agent_id` hardcoded `""` in dispatch-log payload — `:137`; opencode input carries `sessionID`/`callID`. Non-blocking.
- D2 [follow-up] `node --check` on ESM-`.js` without `"type":"module"` is Node-version-fragile; production (Bun) unaffected.

## Dimension #4 — Script resolution

**Resolver** (canonical one-liner in every `.opencode/command/*.md` + contractor): self-dev branch (`package.json` name = `kaola-workflow`): `./scripts/<n>` → `$CLAUDE_PLUGIN_ROOT/scripts/<n>` → `~/.claude/kaola-workflow/scripts/<n>`. Consumer branch: `$CLAUDE_PLUGIN_ROOT/scripts/<n>` → `~/.claude/kaola-workflow/scripts/<n>` → `./scripts/<n>`.

**CONSUMER opencode trace:** opencode does NOT set `CLAUDE_PLUGIN_ROOT`. `${CLAUDE_PLUGIN_ROOT:+...}` `:+` guard correctly skips when unset → effective chain: `~/.claude/kaola-workflow/scripts/<n>` (first hit) → `./scripts/<n>`. `install-opencode.sh:100` copies scripts to `dest="$HOME/.claude/kaola-workflow/scripts"`. **Resolver WORKS end-to-end for opencode consumers with NO Claude runtime.** Does NOT assume `CLAUDE_PLUGIN_ROOT`.

**Test coverage:** `test-plan-run.js:78-103` (consumer w/ CLAUDE_PLUGIN_ROOT + self-dev); `test-bash-block-guards.js:183-188` runs finalize guard with `CLAUDE_PLUGIN_ROOT=''` (the opencode-consumer shape) — covered.

**Edge cases:** linked worktrees — plan-run resolves `KAOLA_SCRIPTS` from MAIN root BEFORE `cd worktree` (`plan-run.md:27-49`), consumer resolves to absolute `~/.claude/...` → non-issue ✓. `git -C` — resolver only does `[ -f ]` file checks, no git ✓. `--global` install — scripts still go to `~/.claude/kaola-workflow/scripts/` (`install-opencode.sh:93-111`) ✓. `KAOLA_SCRIPTS` defined before first use (`plan-run.md:33`); no bare validator path (`test-bash-block-guards.js:103-104`) ✓.

defects (#4): none blocking. D3 [follow-up, polish] opencode consumers get a `~/.claude/kaola-workflow/scripts/` path (Claude-namespace dir in non-Claude runtime); functional + documented; consider opencode-native mirror for symmetry.

## Defect inventory (this node)
1. [follow-up] D1 dispatch-log `agent_id` hardcoded empty.
2. [follow-up] D2 `node --check` ESM-`.js` fragility (no `"type":"module"`); Bun fine, Node-version-sensitive.
3. [follow-up, polish] D3 opencode consumers use `~/.claude/kaola-workflow/scripts/` path.
No fix-now defects: reasoning set complete; hooks cover all 4 canonical behaviors w/ correct field names; resolver works end-to-end without `CLAUDE_PLUGIN_ROOT`.

## Decision inputs (for n2)
- #5: opencode hook surface is correct-by-construction (byte-identical shell scripts; A10/A11). The route-reachability T-set case is about COMMAND/agent content parity (n1-parity owns), not hook correctness.
- #6: two runtime-portability facts bear on CI wiring: (a) `node --check` (A11) is Node-version-sensitive (D2); (b) opencode has NO plugin-root env analog — any CI/route-reachability sim of opencode-consumer must replicate the `install-opencode.sh` install step (copy to `~/.claude/kaola-workflow/scripts/`), not assume an env var. `${CLAUDE_PLUGIN_ROOT:+...}` guard handles this gracefully today.
- Committed `opencode.json` (neutral) is the correct canonical form (confirms n1-schema A7); two-tier resolution is installer-time personalization, not a committed artifact.
