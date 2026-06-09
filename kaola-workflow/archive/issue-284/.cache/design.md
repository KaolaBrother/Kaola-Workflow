# design node (code-architect) — issue #284 implementation blueprint

Read-only design node. Full architect output below.

## Architecture: Wire native Codex lifecycle hooks (issue #284)

### Design Decisions
- **D1** — `.codex/hooks.json` is project-local (`$PWD/.codex/`), merged-by-id (managed marker = entry `id` prefix `kaola-workflow:`, the same convention `uninstall.sh` `is_managed` uses), NOT comment-marked (JSON can't carry TOML BEGIN/END comments). Installer parses existing hooks.json, drops `kaola-workflow:`-prefixed entries, re-inserts the 4 managed entries, writes back — idempotent, user-entry-preserving.
- **D2** — installer stays edition-neutral; the 3 installers stay byte-identical. The ONLY per-edition difference (compact-resume script filename) is carried in each edition's `config/hooks.json` template, mirroring how each edition ships its own `config/agents.toml`.
- **D3** — the `.sh`/`.js` hook producers are reused, not re-authored (Codex hooks.json schema == Claude's). github-codex tree is missing only phantom-advisor + subagent-dispatch-log; hookports adds those 2 + registers in validate-script-sync.js.
- **D4** — four Codex-CLI runtime facts are unresolvable from in-repo evidence/context7; each handled with a decision rule + falsifier, not a guess. Fact B is byte-locked (see Risk Register).
- **D5** — node-boundary hygiene: installer authors ALL 4 hooks.json entries incl SessionStart/compact wiring; compact touches ONLY the 3 .js output shapes (never hooks.json); neither installer nor compact creates a test file — all assertions land in the tests node's 5 files.

### Risk Register — four unresolved Codex-CLI facts
- **A (compact output shape)** — does Codex SessionStart/compact inject plain stdout or require `hookSpecificOutput.additionalContext` envelope? Owner: compact node (3 .js, in frozen write-set). Rule: leave plain `process.stdout.write` UNLESS envelope required; if required wrap `JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:packet}})`. Default: plain (the working Claude compact-context.js emits plain; these scripts mirror it). Falsifier: tests node asserts packet present in injected context post-/compact.
- **B (SubagentStart payload field) — LINCHPIN for AC3, BYTE-LOCKED** — is the field literally `agent_type` and its value the agents.toml table key (`workflow-planner`/`contractor`)? Repo confirms agents.toml keys ARE those exact strings checkDispatchAttestations matches (claim.js:82-83). NO confirmation Codex emits a top-level agent_type carrying that key. Owner: NONE — the .sh is in validate-script-sync.js BYTE_IDENTICAL_GROUPS; a Codex-specific rename would break the sync gate → resolving a divergence is a PLAN-REPAIR event, not an in-node fix. Falsifier: live adaptive Codex run with multi_agent on asserts claim_planner_attested/finalize_contractor_attested == attested; if they stay missing despite populated dispatch-log.jsonl, the field diverges → escalate.
- **C (matcher tool names)** — `Bash` and `Write|Edit` are CLAUDE tool names; Codex shell/edit tools likely differ. Owner: installer (config/hooks.json matcher strings). Rule: use Codex tool-names if resolvable; else ship Claude names as documented best-known default + flag in docs. Trivially patchable (string in template, not byte-locked .sh). Falsifier: tests assert hooks registered (structural); behavioral block-parity AC4 only verifiable live.
- **D (command path resolution)** — Claude uses $CLAUDE_PLUGIN_ROOT; Codex has none. Producers live in plugin tree, not copied into .codex/. Owner: installer (hooks.json command strings). Rule: in updateHooks() replace `__KW_PLUGIN_ROOT__` token with absolute pluginRoot at install time (installer knows pluginRoot=path.resolve(__dirname,'..')). Falsifier: tests assert installed hooks.json command path points at an existing file.

### Files to CREATE
- plugins/kaola-workflow/config/hooks.json (github-codex template; compact entry → kaola-workflow-codex-compact-resume.js) — installer
- plugins/kaola-workflow-gitlab/config/hooks.json (compact → kaola-gitlab-workflow-codex-compact-resume.js) — installer
- plugins/kaola-workflow-gitea/config/hooks.json (compact → kaola-gitea-workflow-codex-compact-resume.js) — installer
- plugins/kaola-workflow/hooks/kaola-workflow-phantom-advisor.sh (byte-identical copy of hooks/...) — hookports
- plugins/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh (byte-identical copy) — hookports

### Files to MODIFY
- plugins/kaola-workflow{,-gitlab,-gitea}/scripts/install-codex-agent-profiles.js — add updateHooks() + /hooks trust line; call from main() (byte-identical edit ×3) — installer
- scripts/validate-script-sync.js — add the 2 github-codex hook paths to the phantom-advisor + subagent-dispatch-log groups — hookports
- uninstall.sh — project-local $PWD/.codex/hooks.json managed-entry cleanup (asymmetry: install is project-local; uninstall cleans only the dir it runs from — document) — hookports
- plugins/kaola-workflow{,-gitlab,-gitea}/scripts/*codex-compact-resume.js — CONDITIONAL output wrap (Fact A); default leave plain — compact
- tests node 5 files (assertions only): plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js; plugins/kaola-workflow-gitlab/scripts/{test-gitlab-workflow-scripts.js, simulate-gitlab-codex-workflow-walkthrough.js}; plugins/kaola-workflow-gitea/scripts/{test-gitea-workflow-scripts.js, simulate-gitea-codex-workflow-walkthrough.js}
- docs/architecture.md, docs/api.md, README.md — docs; CHANGELOG.md — finalize

NO write-set gaps. Adjacencies (no expansion needed): (1) validate-workflow-contracts.js asserts ONLY repo-root hooks/hooks.json, NOT plugins/kaola-workflow/hooks/ → no validator edit for the 2 new .sh; validate-script-sync.js is the sole gate. (2) simulate-gitlab-workflow-walkthrough.js testGitlabDispatchHookExists asserts the gitlab plugin's own hooks/hooks.json (different artifact) → no change.

### installer (tdd-guide) blueprint
config/hooks.json template (github edition; gitlab/gitea differ ONLY in compact command script name): 4 events —
- SessionStart matcher "compact" → `node "__KW_PLUGIN_ROOT__/scripts/kaola-workflow-codex-compact-resume.js"` timeout 5, id kaola-workflow:compact-context
- PreToolUse matcher "Bash" → `bash "__KW_PLUGIN_ROOT__/hooks/kaola-workflow-pre-commit.sh"` timeout 5, id kaola-workflow:pre-commit-guard
- PostToolUse matcher "Write|Edit" → `bash "__KW_PLUGIN_ROOT__/hooks/kaola-workflow-phantom-advisor.sh"` timeout 10, id kaola-workflow:phantom-advisor
- SubagentStart matcher "*" → `bash "__KW_PLUGIN_ROOT__/hooks/kaola-workflow-subagent-dispatch-log.sh"` timeout 5, id kaola-workflow:subagent-dispatch-log
Command path resolution (Fact D): updateHooks() reads template, replaces __KW_PLUGIN_ROOT__ with absolute pluginRoot, writes resolved JSON to $PWD/.codex/hooks.json.
Insertion sites (github copy, replicate ×3 byte-identically): after endMarker consts add sourceHooksTemplate=path.join(pluginRoot,'config','hooks.json'), targetHooks=path.join(targetCodexDir,'hooks.json'), PLUGIN_ROOT_TOKEN, MANAGED_HOOK_ID_PREFIX='kaola-workflow:'. Add updateHooks() near updateConfig() (~L95): mkdir targetCodexDir; read+token-replace template→managedHooks; read existing targetHooks or {hooks:{}} (tolerate parse failure as empty, WARN never throw); per event drop id-prefixed entries then append managed; write JSON.stringify(merged,null,2)+'\n' if changed; return updated|unchanged. In main() after updateConfig() (~L113): const hooksStatus=updateHooks(); console.log status + console.log the /hooks trust step line. Add assert(existsSync(sourceHooksTemplate)).
WARN-first: malformed pre-existing hooks.json treated as empty (still install managed); never throw. multi_agent-off: SubagentStart entry still registered (harmless, never fires).

### hookports (implementer) blueprint
- cp hooks/kaola-workflow-phantom-advisor.sh → plugins/kaola-workflow/hooks/ (byte-for-byte, verify cmp, preserve 0755)
- cp hooks/kaola-workflow-subagent-dispatch-log.sh → plugins/kaola-workflow/hooks/ (byte-for-byte, 0755)
- validate-script-sync.js: in BYTE_IDENTICAL_GROUPS add 'plugins/kaola-workflow/hooks/kaola-workflow-phantom-advisor.sh' to the phantom-advisor group and 'plugins/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh' to the subagent-dispatch-log group (after the canonical hooks/... reference). Both groups become 4 paths, symmetric with the pre-commit group. Gate fails RED until both files exist byte-identical = the failing→green signal (non_tdd_reason: no unit test; validate-script-sync.js under npm test is the gate).
- uninstall.sh: add managed-entry stripper for $PWD/.codex/hooks.json reusing is_managed predicate (id startswith kaola-workflow: OR command contains kaola-workflow); remove only matching entries; no-op if absent. ASYMMETRY: install writes project-local, uninstall cleans only the dir it runs from — document the limitation in docs node.

### compact (implementer) blueprint
Touch ONLY the 3 edition compact-resume .js. Conditional (Fact A): current ends process.stdout.write(`${lines.join('\n')}\n`). If plain injects → leave untouched (expected default). If envelope required → process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:lines.join('\n')}})+'\n'), identically ×3. Keep early-return-on-no-workflow (empty stdout) unchanged so determinism + empty-root RED tests (L519-530) still pass.

### tests (tdd-guide) assertion placement
Install (AC1): github simulate-kaola-workflow-walkthrough.js extend testInstallProfilesFeaturesTableHandling — after runInstallProfiles(fresh) read $fresh/.codex/hooks.json, assert parses + 4 events each have a kaola-workflow: id entry + SessionStart/compact command references the edition compact script + idempotency (2 runs → one managed entry per event, user entries preserved) + /hooks trust line in stdout. gitlab test-gitlab-workflow-scripts.js (~L1946) + gitea test-gitea-workflow-scripts.js (~L1981) same, edition compact script names. (gitlab reached by npm run test:kaola-workflow:gitlab via simulate-gitlab-workflow-walkthrough.js → run('test-gitlab-workflow-scripts.js').)
Attestation go-live (AC3): github walkthrough already has field-presence (L583-600 allowing missing OR attested); add POSITIVE case — seed .cache/dispatch-log.jsonl with {"agent_type":"workflow-planner"...} + {"agent_type":"contractor"...} before finalize, assert claim_planner_attested==='attested' AND finalize_contractor_attested==='attested' AND closure_invariants.ok. gitlab/gitea simulate-*-codex-walkthrough.js (L26-27, static text checks today): add behavioral seed-log-then-finalize attested assertion (or at least a checkDispatchAttestations-level unit assertion against a seeded log dir). ALSO add a PRODUCER test: spawn the subagent-dispatch-log.sh with stdin {"agent_type":"workflow-planner"...} against tmp repo w/ active workflow-state.md, assert one JSONL line lands in .cache/dispatch-log.jsonl + exit 0 on empty stdin (fail-open) — closest in-repo proxy for Fact B (pins producer side).
AC2 (compact): github testCodexCompactResume266 (L468-532) already runs script + asserts 7-line packet; extend to match the shape the compact node settled (plain → 7 lines hold; enveloped → parse JSON + assert hookSpecificOutput.additionalContext contains the packet). Falsifier for Fact A.
Evidence bar: cross-edition → all 4 chains green SEQUENTIALLY (npm run test:kaola-workflow:claude && :codex && :gitlab && :gitea; && short-circuits so green claude alone insufficient, #307) + node scripts/validate-script-sync.js.

### docs (doc-updater) blueprint
README.md add 4 Codex hooks to hooks table (~L812, mirror Claude rows), note project-local .codex/hooks.json via install-codex-agent-profiles.js. docs/architecture.md (~L56 M1 SubagentStart section) update "Codex deferred to #266" — Codex now wires producer, AC3 live when multi_agent on. docs/api.md document .codex/hooks.json managed-entry contract (id-prefix kaola-workflow: marker, 4 events/matchers/ids). /hooks trust step (AC1): after install run /hooks once to trust (content-hash; editing re-marks untrusted); automation uses codex exec --dangerously-bypass-hook-trust. multi_agent-off precondition (AC5): SubagentStart needs multi_agent enabled (stable+on by default 0.137.0); off → never fires, attestation reads missing, non-fatal WARN-first (closure still succeeds). Record Fact-C matcher caveat + Fact-D project-local-only uninstall limitation.

### Build sequence
1. installer + hookports (concurrent off design, disjoint). 2. compact (after installer). 3. tests (after installer+hookports+compact): all 4 chains sequential + validate-script-sync. 4. review (G1) → docs → finalize (CHANGELOG + sink).

### Load-bearing facts
- plugins/kaola-workflow/hooks/ currently holds ONLY kaola-workflow-pre-commit.sh; gitlab/gitea hold all 4 + a hooks.json.
- The 3 install-codex-agent-profiles.js are byte-identical TODAY — keep them so.
- checkDispatchAttestations keys EXACTLY on agent_type==='workflow-planner' / ==='contractor' (kaola-workflow-claim.js:82-83); agents.toml table keys are those exact strings.
- validate-workflow-contracts.js asserts repo-root hooks/hooks.json only — validate-script-sync.js is the sole gate for the 2 new .sh.
