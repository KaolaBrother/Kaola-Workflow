evidence-binding: n2-explore 84091db98e34
findings: Cross-tree fact sweep for #645+#646 — issue-scout is sonnet in all 3 intent surfaces with the placeholder wiring absent from install.sh (exact insertion points below); code-reviewer is the end-to-end template; the six routing surfaces + six workflow-init surfaces are enumerated; enforcement uses required-blocks.js (#400) + test-install-model-rendering.js manifest pins; and a #328/#443 regression trap (unrendered {ISSUE_SCOUT_MODEL} must not survive install) is flagged. Full detail below.

## #646 — issue-scout model wiring

### 1. Current tier declarations (all three currently say `sonnet`, consistent)
- `agents/issue-scout.md:4` — frontmatter `model: sonnet`.
- `scripts/kaola-workflow-resolve-agent-model.js:20` — `'issue-scout': 'sonnet',` inside `DEFAULT_AGENT_MODELS` (lines 8-32).
- `.kaola-agent-models.json` is **not a repo file** — it's an install-time artifact `install.sh` writes to `$AGENTS_DIR/.kaola-agent-models.json` (install.sh:432, `emit_agent_model_manifest`). Manifest populated by `resolve_agent_model_for_install()` (install.sh:397-408) reading `agent_source_file()` frontmatter or falling back to `default_agent_model()` (install.sh:365-377), whose `issue-scout` branch (install.sh:367) returns `"sonnet"`. All three intent surfaces agree today: **sonnet, no lever**.
- `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/agents/issue-scout.toml` — none has a `model =` line (grep confirmed empty on all three) — Codex side is prose-only, matches the plan's claim.

### 2. The dispatch gap — exact insertion points
- `install.sh:410-425` — `model_for_placeholder()` case list (12 entries: CODE_EXPLORER_MODEL, KNOWLEDGE_LOOKUP_MODEL, PLANNER_MODEL, CODE_ARCHITECT_MODEL, TDD_GUIDE_MODEL, IMPLEMENTER_MODEL, BUILD_ERROR_RESOLVER_MODEL, CODE_REVIEWER_MODEL, SECURITY_REVIEWER_MODEL, DOC_UPDATER_MODEL, CONTRACTOR_MODEL, WORKFLOW_PLANNER_MODEL). `ISSUE_SCOUT_MODEL` absent — insert a new `case` line here.
- `install.sh:461-474` — `render_command_file()`'s local `placeholders=( … )` array, the SAME 12 entries. `ISSUE_SCOUT_MODEL` absent — insert here too (both lists must move together or the placeholder silently never substitutes).
- Also absent from BOTH lists (by design): `ADVERSARIAL_VERIFIER_MODEL`, `SYNTHESIZER_MODEL`, `METRIC_OPTIMIZER_MODEL` — those roles are dispatched by the adaptive per-node scheduler (reasoning/standard resolved dynamically via `next-action.js`), never by a `{ROLE_MODEL}` command-prose placeholder. issue-scout is joining `code-reviewer`'s family (fixed-path/pre-plan prose dispatch), not that group.
- `install.sh:40` — `REQUIRED_AGENTS` already contains `"issue-scout"` (16 total agents). Registration/count surfaces do NOT need to move — only the placeholder wiring is new.

### 3. Template to copy: `code-reviewer` (an already-wired higher-profile role)
- Base frontmatter: `agents/code-reviewer.md:5` → `model: sonnet`.
- Higher-profile: `agents/profiles/higher/code-reviewer.md:5` → `model: opus`.
- `install.sh:264-266` (`agent_source_file()`) and `install.sh:302-304` (`install_agent_files()`) — BOTH check `PROFILE == "higher" && -f profiles/higher/$file_name` and swap the source. A NEW `agents/profiles/higher/issue-scout.md` plugs into this swap with NO install.sh code change for the swap itself, only the file's existence.
- `install.sh:419` `CODE_REVIEWER_MODEL) resolve_agent_model_for_install code-reviewer ;;` and `install.sh:469` (`placeholders` array) `CODE_REVIEWER_MODEL`.
- Dispatch-prose usage (load-bearing example, fixed-path prose dispatch — same shape issue-scout needs): `commands/kaola-workflow-fast.md:34-41` "## Agent Model Badge" states `model="{PLANNER_MODEL}"` / `model="{TDD_GUIDE_MODEL}"` / `model="{CODE_REVIEWER_MODEL}"`, then literal fenced block at `commands/kaola-workflow-fast.md:312-319`:
  ```
  Agent(
    subagent_type="code-reviewer",
    model="{CODE_REVIEWER_MODEL}",
    description="Fast review {project}",
    prompt="..."
  )
  ```
  Repeats at `commands/kaola-workflow-phase5.md:164` and gitlab/gitea command mirrors (byte-identical, same line numbers).
- **CONTRAST — `commands/workflow-next.md` has NO `Agent(...)` fenced block for issue-scout today.** Dispatch is pure prose ("dispatch the read-only **issue-scout** agent", `commands/workflow-next.md:74,82,137,146,150`; same in `templates/routing/next.skeleton.md:17-23,69-78,80-83,130-150,238-241` for the command variant and `next.skeleton.md:592-666,762-766` for the skill variant). n5 must either (a) add a fenced `Agent(subagent_type="issue-scout", model="{ISSUE_SCOUT_MODEL}", ...)` block mirroring code-reviewer, or (b) add an inline `model="{ISSUE_SCOUT_MODEL}"` in the existing prose. Either way the placeholder must install-render or `test-install-model-rendering.js`'s `model="\{[A-Z_]+_MODEL\}"` regex (line 85) catches the leftover token — KNOWN historical failure mode (see SURPRISE).

### 4. Validator pins for higher-profile roles / the placeholder
- `scripts/validate-workflow-contracts.js:63-76` — `assertEveryDispatchHasModel(file)`: generic scanner over every literal `Agent(` block, requires a `model="{[A-Z_]+_MODEL}"` line before the closing `)`. Invoked at `:168` in a loop over `phaseCommands` (`:150-160`): phase1-5, finalize, fast, adapt, plan-run. **`commands/workflow-next.md` is NOT in `phaseCommands`** — this generic check will NOT auto-cover a new issue-scout `Agent()` block in workflow-next.md. n6 needs an EXPLICIT pin, mirroring the fixed-dispatch pattern at `validate-workflow-contracts.js:814` `assertIncludes('commands/kaola-workflow-adapt.md', 'model="{WORKFLOW_PLANNER_MODEL}"')` (paired with `:813` subagent_type pin).
- `validate-workflow-contracts.js:869-877` — array-of-higher-profile-files pattern (code-reviewer, security-reviewer) used for a `finding: id=` pin — the "add issue-scout's higher-profile path to an array" shape to reuse for a content-presence pin.
- **Model-TIER pin template is in `scripts/test-install-model-rendering.js`:**
  - Higher-profile manifest block: lines 140-159, assertions 146-154 (`assert(manifest['code-reviewer'] === 'opus', …)`) — add `assert(manifest['issue-scout'] === 'opus', …)`.
  - Common-profile manifest block: lines 163-178, assertions 171-176 (mirrors `contractor` staying sonnet under every profile) — add `assert(manifest['issue-scout'] === 'sonnet', …)`.
  - Line 85: `assert(!/model="\{[A-Z_]+_MODEL\}"/.test(allCommands), 'installed commands must not keep model placeholders');` — render-completeness guard, must stay green once `{ISSUE_SCOUT_MODEL}` exists in installed commands.
  - `test-install-model-rendering.js` currently has ZERO issue-scout references — full gap, matches issue text.
- GitLab/Gitea agent-count assertions (`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:185`, `…gitea…:184`, matching `test-{gitlab,gitea}-workflow-scripts.js` "should install 16 agent TOML files") are currently 16 and do NOT need to change — issue-scout is already a registered base agent; only its higher-profile FILE is new. `test-agent-profile-parity.js` is base-agent-driven (reads `agents/` + `.toml` triple, never `profiles/higher/`) so auto-covers — NOT independently re-verified this session (inherited from prior design record).

### >>> SURPRISE — a documented historical decision runs COUNTER to this plan's intent, with a live regression precedent
`kaola-workflow/archive/issue-328/.cache/design.md:15-48` ("Decision 1 — ISSUE_SCOUT_MODEL placeholder: NOT NEEDED. issue-scout follows the adversarial-verifier pattern") explicitly concluded, with the SAME grep evidence, that issue-scout must be dispatched via prose only, NEVER a `model="{ISSUE_SCOUT_MODEL}"` Agent block — argued reason: pre-claim, read-only, selection-only role dispatched before any plan exists (like adversarial-verifier/code-explorer); no `{X_MODEL}` placeholder to be added.
`kaola-workflow/archive/issue-443/.cache/n5-commands.md` (a REPAIR record): someone previously introduced `model="{ISSUE_SCOUT_MODEL}"` into command prose, and it broke `scripts/test-install-model-rendering.js`'s regex at line 85 precisely because `model_for_placeholder()` had no case for it. The fix at the time REMOVED the placeholder text.
This bundle's frozen plan KNOWINGLY reverses that decision (n3-scout + n5-next-seam wire the case/placeholder for real, install-rendered rather than literal prose text). Intentional per #646's own design (the roadmap text calls out "the effective dispatch is ungoverned" as the thing to fix). NOT a plan defect — but n3/n5/n6 must know: (a) the prior failure mode is a KNOWN regression shape (unrendered placeholder must not survive install — exactly what n6's test-install-model-rendering.js pin must catch); (b) do the FULL wiring atomically (both list entries in install.sh AND the manifest assertions) — a partial land (placeholder text without the `model_for_placeholder` case) reproduces the #443 regression.

## #645 — axiom-layer surfaces

### 5. The SIX routing surfaces + needle/pin pattern
Exactly 6 files for the `next` topic (matches n5 write set):
- Claude commands: `commands/workflow-next.md`, `plugins/kaola-workflow-gitlab/commands/workflow-next.md`, `plugins/kaola-workflow-gitea/commands/workflow-next.md`.
- Codex SKILL packs: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`, `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`, `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`.
Needle/pin pattern (Layer 1): `templates/routing/required-blocks.js` — single-source `REQUIRED_BLOCKS` array (`:32-252`) of `{block_id, topic, runtime_tag, surface_type_tag, content_tokens}`; `topic` ∈ `{'plan-run','finalize','next'}` (`:254`). Checker (`scripts/test-route-reachability.js:616` `checkManifest()`) derives the EXACT surface universe from the two tags — never a hand-typed file list, so a 4-of-6 gap is structurally impossible for anything registered here. Two existing `topic:'next'` blocks as templates:
  - `nx-adaptive-route` (`required-blocks.js:221-227`, `both`/`both`) — content_tokens `['kaola-workflow-plan-run', 'auto-bundle']` — shape for a `both`/`both` axiom-reference-line block.
  - `nx-router-command` (`required-blocks.js:235-251`, `claude-live`/`command`) — content_tokens include `'issue-scout'` — shape for a `claude-live`/`command`-only scout-model-line block (matches making the scout model line COMMAND-only).
`checkManifest` invoked at `scripts/test-route-reachability.js:697-698` against live `REQUIRED_BLOCKS`/repo tree; synthetic RED-proof harness (`:789-905`) exercises checker against planted defects — no edit needed for a content-only block addition.
Older hand-typed per-surface pin style still used for some routing prose (`validate-workflow-contracts.js:795-819`, `assertConcept`/`assertIncludes`, e.g. `:814` WORKFLOW_PLANNER_MODEL). Use `required-blocks.js` (newer #400 mechanism) for the axiom line to get automatic 6-of-6 enforcement rather than hand-typed assertIncludes.

### 6. Byte-identity / drift-guard pattern for the axiom file
Exact existing analog: "adaptive-schema constant copies" byte-identical group in `scripts/validate-script-sync.js:172-185`:
```js
{ label: 'adaptive-schema constant copies',
  files: [ 'scripts/kaola-workflow-adaptive-schema.js',
    'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js',
    'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js',
    'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js' ] }
```
Lives in `BYTE_IDENTICAL_GROUPS` (`:100`); runner (`:526-530`) calls `checkByteIdenticalGroup` per group, folds `missing`/`drift` into pass/fail. **Correction to plan wording**: this does NOT live in `simulate-workflow-walkthrough.js` — it's in `scripts/validate-script-sync.js`, chained FIRST (before simulate-workflow-walkthrough.js) in `package.json:37` (test:kaola-workflow:claude) and `:38` (test:kaola-workflow:codex), which is what puts it "under `npm test`". DESIGN FORK for n1/n6: if axioms.md is truly ONE canonical file (referenced by pointer, no per-edition copy), `BYTE_IDENTICAL_GROUPS` does NOT apply (that's for N>1 copies of the same logical file) — the guard is closer to `required-blocks.js` content-token presence than a byte-identical group. If multi-copy embedded, use BYTE_IDENTICAL_GROUPS. Resolve explicitly against n1-architect's placement decision.

### 7. workflow-init consumer template — SIX CLAUDE.md-template surfaces
- Claude commands (3): `commands/workflow-init.md`, `plugins/kaola-workflow-gitlab/commands/workflow-init.md`, `plugins/kaola-workflow-gitea/commands/workflow-init.md`.
- Codex SKILL packs (3): `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`, `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md`, `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md`.
Match n4-axiom's declared write set (`workflow-plan.md:186`). Internals not opened this pass — n4 implementer must locate the exact CLAUDE.md-template embed point inside each.

## Cross-edition grep discipline note
All greps run against `scripts/`, `plugins/kaola-workflow/`, `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/` by SYMBOL (`ISSUE_SCOUT_MODEL`, `issue-scout`, `profiles/higher`, `_MODEL\}`, `adaptive-schema`) not base filename — confirmed no `kaola-gitlab-workflow-*`/`kaola-gitea-workflow-*` port carries these symbols outside cited plugin files. No extra edition port, no miscount risk beyond those flagged.
