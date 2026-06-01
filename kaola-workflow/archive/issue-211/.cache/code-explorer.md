# code-explorer raw output — issue-211 (Delegation Contract parity check)

## 1. `scripts/validate-workflow-contracts.js` structure
- Single flat script (lines 1–401). No exports. Linear: helpers defined, then top-level assert calls; exits via uncaught throw or implicit 0.
- Helpers (lines 9–55): `read(rel)` (resolves from repo root, L9), `exists(rel)` (L13), `assert(cond,msg)` throws Error on false (L17), `assertIncludes` (L21), `assertNotIncludes` (L25), `assertConcept` (L29), `assertBefore` (L35), `assertEveryDispatchHasModel` (L42).
- Failure reporting: `assert(false,msg)` → `throw new Error(msg)` → Node exits 1, prints stderr. No try/catch. Success: prints `'Workflow contract validation passed'` (L401), implicit exit 0.
- Existing cross-forge parity checks: lines 328–361 compare Codex `plugin.json` versions across 3 plugin dirs:
  - L334–341: reads `plugins/kaola-workflow-{forge}/.claude-plugin/plugin.json` for gitlab/gitea, asserts each `version === rootVersion`.
  - L343–361: reads the three `.codex-plugin/plugin.json`; maps to `{name,file,version}`; asserts every version after first equals `codexManifests[0].version`.
  - Uses `JSON.parse(read(file))` full-file read + scalar compare. NO markdown section extraction here.
- Markdown comparisons available: only `assertIncludes`/`assertNotIncludes`/`assertConcept`/`assertBefore` (substring/regex on full content).
- Invocation: `package.json` L36 `test:kaola-workflow:claude` runs `node scripts/validate-workflow-contracts.js`. Walkthrough L3946–3989 (`testContractValidatorOfflineSkip`, `testContractValidatorMissingTag`) only test git-tag behavior via spawnSync.

## 2. `scripts/validate-script-sync.js` COMMON_SCRIPTS (L39–51)
```
kaola-workflow-claim.js
kaola-workflow-active-folders.js
kaola-workflow-classifier.js
kaola-workflow-closure-audit.js
kaola-workflow-repair-state.js
kaola-workflow-resolve-agent-model.js
kaola-workflow-roadmap.js
kaola-workflow-sink-merge.js
kaola-workflow-sink-pr.js
release-surface-drift.js
validate-workflow-contracts.js      <-- L50
```
- `validate-workflow-contracts.js` IS in the list (L50). Editing it requires keeping `scripts/` and `plugins/kaola-workflow/scripts/` copies BYTE-IDENTICAL.
- `kaola-workflow-classifier.js` also in list (so its copies are byte-synced too).
- Sync mechanism L81–89: reads both copies, asserts `a.equals(b)` (Buffer). Failure prints `cp` fix command, exits 1. Collect-all-errors style (L78–126).

## 3. Test wiring — insertion points
`npm test` (package.json L35): `test:kaola-workflow:claude && :codex && :gitlab && :gitea`.

`test:kaola-workflow:claude` (L36) chain:
```
validate-script-sync.js
validate-vendored-agents.js
bash -n install.sh uninstall.sh
node -e "JSON.parse(...)"
test-agent-model-resolver.js
test-install-model-rendering.js
test-install-upgrade-rewrite.js
test-release-surface-drift.js
validate-workflow-contracts.js        <-- insertion point A
test-fast-audit.js
simulate-workflow-walkthrough.js
```
`:codex` (L37): validate-script-sync → validate-kaola-workflow-contracts.js → simulate-kaola-workflow-walkthrough.js
`:gitlab` (L38): validate-vendored-agents → validate-kaola-workflow-gitlab-contracts.js → 2 gitlab walkthroughs
`:gitea` (L39): validate-vendored-agents → validate-kaola-workflow-gitea-contracts.js → 2 gitea walkthroughs

The simulate-workflow-walkthrough.js does NOT invoke the validators as part of its run() chain (only behavioral git-tag tests). So wiring = add an assertion inside an existing validator (runs once), OR add a new `node scripts/<new>.js` step to the claude chain.

## 4. `## Delegation Contract` section in the 3 SKILL.md
- Heading `## Delegation Contract` at **line 27** in ALL three files.
- Section ends at next heading `## Agent Issue Selection (Required Before Startup)` at **line 53** in all three. So body = lines 27–51 (blank L52 precedes next heading).
- Section is BYTE-IDENTICAL across all three (verified side-by-side).
- First 5 lines (github baseline L27–31):
```
## Delegation Contract

Codex subagent delegation is the default. The session delegation policy defaults to `delegate` and is established without prompting the user; the workflow complies with its delegated-role contract automatically rather than asking the user to choose.

**Skip this step if `delegation_policy:` is already set in `workflow-state.md`.**
```
- Resume clause `On resume, extract and reassign \`delegation_policy:\``:
  - github L220, gitlab L232, gitea L232. Two-line clause, BYTE-IDENTICAL across all three.
  - Lives inside `## Routing` section (github L216, gitlab/gitea L228).
  - IMMEDIATELY FOLLOWED by a bash fence with forge-specific `repair_script=` path (github L224 `plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js`; gitlab L236 `kaola-gitlab-workflow-repair-state.js`; gitea L236 `kaola-gitea-workflow-repair-state.js`). So a whole-`## Routing`-section compare would FALSELY FLAG — the resume clause must be matched as an isolated line/paragraph, not the whole Routing section.

## 5. Existing markdown-section-extraction helpers
- `sectionBody(content, heading)` in `scripts/kaola-workflow-classifier.js` L124–140 — the ONLY markdown section slicer in the repo:
```javascript
function sectionBody(content, heading) {
  const lines = String(content || '').split('\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headRe = new RegExp('^##\\s+' + escaped + '\\s*$');
  let i = 0;
  for (; i < lines.length; i++) { if (headRe.test(lines[i])) { i++; break; } }
  if (i >= lines.length) return '';
  const out = [];
  for (; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}
```
  Matches `## {heading}` exactly, collects until next `#`/`##` or EOF, returns body without heading line. Call as `sectionBody(read('...SKILL.md'), 'Delegation Contract')`. NOTE: not confirmed exported from classifier; may need re-implement inline (~12 lines) since validator can't necessarily require it.
- `extractRedirectBlock`/`extractClaudeTemplate` in `scripts/validate-kaola-workflow-contracts.js` L357–387 — sentinel-string extractors comparing sub-regions byte-identically across files (pattern precedent).

## 6. Conventions
- Error reporting: single `assert(cond,msg)` throws Error → uncaught → exit 1. Fail-fast (first failure stops). Exception: validate-script-sync.js collects all errors then exits 1.
- Exit codes: 0 success (implicit), 1 on any assert failure. Git-tag block in validate-workflow-contracts.js is conditionally skipped on `KAOLA_WORKFLOW_OFFLINE==='1'`.
- Naming: root validators `scripts/validate-*.js`; forge validators `plugins/kaola-workflow-{forge}/scripts/validate-kaola-workflow-{forge}-contracts.js`. All `'use strict'`, `read(rel)` from `root`, success message `'... passed'`.
- Forge validators use `assertNoForbidden(file)` to block cross-forge CLI token leakage (`/\bgh\b/`, `/\bglab\b/`, `GitLab`, etc.) — existing precedent for "don't falsely flag forge-specific prose" requirement.
