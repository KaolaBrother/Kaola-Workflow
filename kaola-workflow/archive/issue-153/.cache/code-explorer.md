# code-explorer — issue #153 inherit-decouple model resolution surface

Raw research output (agent a1659a51a928f1008, model=sonnet, 2026-05-22).

## 1. install.sh model resolution functions

File: `install.sh`

### `install_agent_files` (lines 253–327)
- Agent-copy loop over `REQUIRED_AGENTS` (9 names). Called at **line 329**, BEFORE any model resolution.
- Profile selection (269–271): if `--profile=higher` AND `agents/profiles/higher/$file_name` exists → use higher source; else `agents/$file_name`.
- If installed file exists:
  - **line 281**: `cmp -s "$source_file" "$dest"` byte-compare; if identical → skip ("already installed").
  - else (286–298): `recorded_hash` from manifest `.kaola-workflow-agent-manifest`, `current_hash = sha256_file "$dest"`; if hashes match AND installed has `kaola-workflow-managed-agent: true` marker → `cp` source over ("Updated managed agent"); else skip "user-owned or modified".
- New install: `cp "$source_file" "$dest"` (301).
- **line 311**: records `sha256_file "$dest"` (hash of NOW-INSTALLED file) into manifest.
- Verify (305–309): installed file must contain `MANAGED_AGENT_MARKER`.
- **Coupling:** after fix (installed frontmatter `model: inherit`, source concrete), `cmp -s` at 281 NEVER matches → always falls to manifest path. Behavior change, not a breakage.

### `sha256_file` (239–245)
`sha256sum`/`shasum -a 256` on a file. Operates on INSTALLED file bytes. Used at 311 (record) and 287 (verify).

### `manifest_lookup` (247–251)
Reads tab-separated `.kaola-workflow-agent-manifest`; used at 286.

### `default_agent_model` (331–343)
Hardcoded fallback when installed agent file has no `model:`:
- sonnet: code-explorer, docs-lookup, code-architect, tdd-guide, build-error-resolver, code-reviewer, security-reviewer
- opus: planner
- haiku: doc-updater

### `extract_agent_model` (345–361)
awk reads `model:` from frontmatter of given agent file; strips ws + quotes. Reads `$AGENTS_DIR/$agent.md` = the **INSTALLED** file (because install_agent_files already ran at 329).

### `resolve_agent_model_for_install` (363–374)
1. `extract_agent_model` from installed `$AGENTS_DIR/$agent.md`.
2. fallback `default_agent_model "$agent"`.
3. **line 370–373**: if resolved == "inherit" (case-insensitive) → return EMPTY string.
4. else return concrete model.
Today: installed files carry concrete models → inherit branch never triggers.

### `model_for_placeholder` (376–388)
Dispatch table: 9 placeholder tokens → `resolve_agent_model_for_install <agent>`:
CODE_EXPLORER_MODEL→code-explorer, DOCS_LOOKUP_MODEL→docs-lookup, PLANNER_MODEL→planner, CODE_ARCHITECT_MODEL→code-architect, TDD_GUIDE_MODEL→tdd-guide, BUILD_ERROR_RESOLVER_MODEL→build-error-resolver, CODE_REVIEWER_MODEL→code-reviewer, SECURITY_REVIEWER_MODEL→security-reviewer, DOC_UPDATER_MODEL→doc-updater.

### `render_command_file` (390–424)
- iterate source command file lines; for each, check 9 placeholder tokens.
- if line has `{PLACEHOLDER}` → `model_for_placeholder` to get model string.
- **413–416**: if returns EMPTY AND line is exactly `model="{PLACEHOLDER}"` → entire line DROPPED (`skip_line=1`). This is the `inherit` suppression.
- else substitute `{PLACEHOLDER}` with resolved value.

### `verify_installed_file` (593–600)
Only checks path exists (`-f`). No content/hash/model check. No regression risk.

## 2. JS resolver

File: `scripts/kaola-workflow-resolve-agent-model.js`
- `resolveAgentModel` (44–49): read `model:` via `extractFrontmatterModel` from `$AGENT_DIR/$agentName.md`; fallback `DEFAULT_AGENT_MODELS[name]`; if `inherit` (case-insensitive, line 48) → return `""`.
- `formatAgentArgument` (51–54): wraps in `model="...",`; `""` for empty.
- `DEFAULT_AGENT_MODELS` (8–18): same map as bash. Parallel implementation, same semantics, used at runtime by command files.

File: `scripts/test-agent-model-resolver.js`
- L28 fallback tdd-guide→'sonnet'; L31 file model: opus→'opus'; L32 formatAgentArgument('opus')→'model="opus",'; L35 quoted "haiku"→'haiku'; L37–38 model: inherit→''; L39 formatAgentArgument('')→''; L41 no frontmatter→''.
- Tests use self-written temp files, not repo agents. `inherit→''` ALREADY expected → no break.

## 3. Agent source files

`agents/` base:
| File | model: | line |
|---|---|---|
| build-error-resolver.md | sonnet | 5 |
| code-architect.md | sonnet | 4 |
| code-explorer.md | sonnet | 4 |
| code-reviewer.md | sonnet | 5 |
| doc-updater.md | haiku | 5 |
| docs-lookup.md | sonnet | 5 |
| planner.md | opus | 5 |
| security-reviewer.md | sonnet | 5 |
| tdd-guide.md | sonnet | 5 |

`agents/profiles/higher/` overrides:
| File | model: | line |
|---|---|---|
| code-architect.md | opus | 4 |
| code-reviewer.md | opus | 5 |
| security-reviewer.md | opus | 5 |

planner has no higher override (already opus). Profile selection: install.sh 269–271; PROFILE var set at 43 (default common), overridden by `--profile=higher` at 76–88.

## 4. Command-file templates & placeholder tokens

Format: `{TOKEN_NAME}` inside `model="{TOKEN_NAME}"`. 9 distinct tokens (see model_for_placeholder).

| Command file | tokens (lines) |
|---|---|
| commands/kaola-workflow-phase1.md | CODE_EXPLORER_MODEL (110), DOCS_LOOKUP_MODEL (143) |
| commands/kaola-workflow-phase2.md | PLANNER_MODEL (90) |
| commands/kaola-workflow-phase3.md | CODE_ARCHITECT_MODEL (84) |
| commands/kaola-workflow-phase4.md | BUILD_ERROR_RESOLVER_MODEL (127), TDD_GUIDE_MODEL (261) |
| commands/kaola-workflow-phase5.md | TDD_GUIDE_MODEL (89), BUILD_ERROR_RESOLVER_MODEL (104), CODE_REVIEWER_MODEL (172), SECURITY_REVIEWER_MODEL (205) |
| commands/kaola-workflow-phase6.md | TDD_GUIDE_MODEL (123), BUILD_ERROR_RESOLVER_MODEL (138), DOC_UPDATER_MODEL (310) |
| commands/kaola-workflow-fast.md | PLANNER_MODEL (92), TDD_GUIDE_MODEL (142), CODE_REVIEWER_MODEL (193) |

All 7 mirrored in `plugins/kaola-workflow-gitlab/commands/` and `plugins/kaola-workflow-gitea/commands/`.

## 5. Regression tests & contract validation

### scripts/test-install-model-rendering.js (1–71)
Runs real `install.sh --profile=higher` into temp HOME; asserts on installed COMMAND file content:
- L35 phase3 has `model="opus",` (higher code-architect); L37 phase4 `model="sonnet",` (tdd-guide); L41 phase5 `model="opus",`; L42 phase6 `model="haiku",` (doc-updater); L44–58 routed-fix blocks `subagent_type="build-error-resolver",\n  model="sonnet",` etc.; L59 fast `model="opus",`; L61–65 no unreplaced `model="{[A-Z_]+_MODEL}"`.
- **BREAK RISK:** none check agent frontmatter. BUT resolve_agent_model_for_install reads installed agent file → after fix returns empty → render drops `model=` → L35/37/41/42/44–58 FAIL. **This is the core tension.** Fix must capture concrete model from SOURCE before rewriting installed frontmatter to inherit.

### scripts/validate-workflow-contracts.js (67–76)
Per 7 command SOURCE files: L72 `assertIncludes(file,'model="{')`; L73 `assertIncludes(file,'You MUST pass \`model=')`. L91–96 routed-fix source assertions. All SOURCE checks → survive.

### scripts/validate-vendored-agents.js
- L63 `/source-sha256: [0-9a-f]{64}/` must be present in agent SOURCE files (provenance of upstream vendored file, NOT install hash). Survives.
- L54 `content.startsWith('---\n')` SOURCE frontmatter at byte 0. Survives.
- No assertion checks source `model:` value. No break from changing source models.

### Plugin validators (validate-kaola-workflow-gitlab/gitea-contracts.js)
gitlab 124–128 / gitea 122–127: per kaola-workflow command file: `## Agent Model Badge`, `You MUST pass \`model=`, `model="{`. SOURCE checks → survive.

## 6. Test entry points

`npm test` (package.json:36): claude && codex && gitlab && gitea suites.
`test:kaola-workflow:claude`: validate-script-sync → validate-vendored-agents → `bash -n install.sh uninstall.sh` → JSON.parse check → test-agent-model-resolver → test-install-model-rendering → validate-workflow-contracts → simulate-workflow-walkthrough.

scripts/test-*.js & validate-*.js:
- test-agent-model-resolver.js — JS resolver unit
- test-install-model-rendering.js — install integration, command-file content
- validate-vendored-agents.js — agent source structure, markers, source-sha256
- validate-workflow-contracts.js — source command placeholders, contracts
- validate-kaola-workflow-contracts.js — codex plugin contracts
- validate-script-sync.js — scripts/ vs plugins/kaola-workflow/scripts/ byte-identical drift guard

## 7. sha256/cmp coupling risk

- install.sh:281 `cmp -s source vs installed` → after fix never identical → always manifest path. Behavior change, no test failure.
- install.sh:286–298 manifest hash check: current_hash of installed (inherit) vs recorded_hash (also inherit if fix applied consistently) → match → managed-update path fires. OK assuming first install writes manifest with inherit-rewritten hash.
- install.sh:311 records hash of installed (inherit) file. Correct for re-install.
- validate-vendored-agents.js:63 `source-sha256` = provenance field in SOURCE, not install hash; only checks regex present. No coupling.
- test-install-model-rendering.js reads installed COMMAND files only, no agent hashing. No risk.
- Only two content-comparison points: install.sh:281 cmp, install.sh:286–291 manifest hash — both in install_agent_files.

## CORE ARCHITECTURAL FINDING
`resolve_agent_model_for_install` (363–374) reads the INSTALLED agent file (`$AGENTS_DIR/$agent.md`) AFTER install_agent_files copied it (line 329). If installed frontmatter becomes `inherit`, it returns empty → `render_command_file` drops `model=` lines → test-install-model-rendering.js fails. The fix must read the concrete model from the SOURCE agent file (with profile applied) BEFORE/independent of the inherit rewrite.
