evidence-binding: n1-architect e657acf314c9
# n1-architect spec — Issue #571: Codex agent profiles global by default

All paths absolute under worktree root `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-571/`. Line numbers cite files as read.

## 1. Decision resolutions
- **Q1 — Keep project-local as an opt-in override (do NOT remove).** Installer derives targets from `projectRoot = path.resolve(process.argv[2] || process.cwd())` (installer L8) → `targetCodexDir = projectRoot/.codex` (L13). Removing project-local = breaking deletion for zero benefit. Global becomes the documented default; project-local stays as override.
- **Q2 — Accept EITHER valid scope; fail closed when NEITHER is valid.** `inspectScope({codexDir, templateRoles})` (preflight L286-357) is already scope-agnostic — doctor mode already calls it on `userCodex = path.join(home,'.codex')` (L714-715) and `projectCodex` (L723-724). Implement as **global-first short-circuit**: fresh global scope ⇒ PASS without touching project scope (kills the redundant project-local autofix copy). "Prefer global" = evaluation ORDER only, not a different predicate.
- **Q3 — Add `--global` (additive) AND keep positional `$HOME`/projectRoot form.** Flags read position-robustly via `process.argv.includes(...)` (L75-77); positional projectRoot is `process.argv[2]` (L8). `--global` joins the includes() family; forces `projectRoot = os.homedir()`. Positional form untouched.

## 2. Preflight change spec (the gate predicate)
### Files — byte-identical sync group "codex-preflight copies" (validate-script-sync.js L190-196), ALL FOUR byte-identical:
- `scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js`

### inspectScope already works on ~/.codex with ZERO change — takes codexDir param, derives agentsDir/configPath (L287-288); doctor proves it on userCodex (L715). Just call it again with codexDir = <home>/.codex.

### Predicate change:
**(a) Thread `home` into `runPreflight`.** CLI entry (L803-808) passes `{projectRoot, planPath, noAutofix, scriptDir}`. `resolvedHome` already computed L778 (`rawHome ? path.resolve(rawHome) : os.homedir()`) but only passed to runDoctor. Add `home: resolvedHome`. In runPreflight destructure (L396-401) add `home`, then `const homeDir = home || os.homedir();`. (os.homedir() honors process.env.HOME here — relied on by installer L668 + hooks tests — this makes new tests hermetic.)

**(b) Add `scopeIsFresh` helper** next to `scopeIsStale` (L640-651). scopeIsStale encodes full freshness predicate but is guarded by `s.exists` (absent scope reads "not stale"). So:
```js
// #571: a scope is "fresh" iff it exists and inspectScope finds nothing stale.
function scopeIsFresh(s) {
  return s.exists && !scopeIsStale(s);
}
```
(Declarations hoist; callable from runPreflight though defined later.) The `&& s.exists` is LOAD-BEARING — without it an absent ~/.codex reads "fresh" and wrongly PASSes.

**(c) Global-first short-circuit** — insert between L444 (after `requiredRoles` built) and L445/446 (before project-scope inspectScope). AFTER `template_missing` (L408) + `role_not_in_template` (L426) refusals (integrity stops fire first); BEFORE project conflict/manifest/autofix:
```js
  // --- #571: global scope satisfies the gate (install once, all repos — Claude parity).
  // Plan roles ⊆ template roles (role_not_in_template above guarantees it), so a global
  // scope fresh for every template role is fresh for every plan role too. Check global
  // FIRST: a fresh global scope PASSES without inspecting/installing a redundant
  // project-local copy. A non-fresh global scope falls through to the existing
  // project-scope inspection + autofix path UNCHANGED (back-compat + fail-closed preserved).
  const globalCodexDir = path.join(homeDir, '.codex');
  const globalScope = inspectScope({ codexDir: globalCodexDir, templateRoles });
  if (scopeIsFresh(globalScope)) {
    return {
      exitCode: 0,
      result: {
        status: 'ok',
        scope: 'global',
        roles_checked: requiredRoles,
        extra_unmanaged: globalScope.extraUnmanaged,
        autofixed: false,
      },
    };
  }
```
Everything from L445 onward UNCHANGED.

### Fail-closed: "NEITHER valid" handled by EXISTING project-scope paths (short-circuit only ADDS a PASS, removes no refusal): global-not-fresh AND project-stale + --no-autofix → staleResult() refusal exit 1; AND project unfixable/installer-missing/still-stale → installer_failed exit 5; AND foreign [agents.*] → autofix_unsafe exit 4. Fail-closed semantics provably unchanged.

### Autofix target under global — DO NOT change. Still runs runInstaller(installerPath, projectRoot) (L582) → project-local. The per-repo gate must NOT silently write the user's machine-wide ~/.codex. Gate READS global; only ever WRITES project-local.

### Optional symmetry: add `scope: 'project'` to the two existing OK returns (L498-505, L624-632). Additive; existing assertions read only status/autofixed.

## 3. Installer --global spec
### Files — byte-identical sync group (validate-script-sync.js L204-206), THREE plugin trees (NO root scripts/ copy), byte-identical:
- `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js`

### Change — L8:
```diff
-const projectRoot = path.resolve(process.argv[2] || process.cwd());
+// #571: `--global` targets ~/.codex (install once, all repos) regardless of cwd/arg-order.
+// Position-robust like --with-fast/--with-full. The positional projectRoot form ("$PWD" /
+// "$HOME") still works: take the first non-flag argv, never a leading --flag.
+const GLOBAL = process.argv.includes('--global');
+const firstPositional = process.argv.slice(2).find(a => !a.startsWith('--'));
+const projectRoot = GLOBAL
+  ? os.homedir()
+  : path.resolve(firstPositional || process.cwd());
```
`os` already required (L3). All downstream targets derive from projectRoot.

### Semantics: sets projectRoot=os.homedir() regardless of cwd (ternary); composes with --with-fast/--with-full (independent includes() L75-76; seedKaolaConfig(os.homedir(),...) L669 unaffected); position-robust; back-compat (`"$HOME"` → firstPositional=os.homedir() identical target; `"$PWD"` → project-local unchanged). Bonus: fixes latent bug where leading flag (`--with-fast "$PWD"`) was mis-read as projectRoot.

### Relative config_file under global config.toml CONFIRMED: template uses `config_file = "./agents/kaola-workflow/<role>.toml"` (config/agents.toml L6,11,16). Codex resolves config_file relative to the config.toml's dir. For ~/.codex/config.toml → ~/.codex/agents/kaola-workflow/<role>.toml — exactly where copyAgentProfiles writes under --global. Managed block copied verbatim (L129-135, no path rewriting). Works end-to-end.

## 4. Init-surface spec
### Step-5 files (edition-specific, NOT byte-paired; each has own plugin_root):
- `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` (Step 5: L116-156)
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md`
### Command peers (the "Codex hooks note"):
- `commands/workflow-init.md` (L162-167)
- `plugins/kaola-workflow-gitlab/commands/workflow-init.md`
- `plugins/kaola-workflow-gitea/commands/workflow-init.md`

### DROP: the mandate that init installs project-local profiles per repo — the `install-codex-agent-profiles.js "$PWD"` invocation + "installs the project-local agent profiles" framed as a per-repo step.
### KEEP (contract-pinned): the installer-locator bootstrap block (find … -path '*/kaola-workflow{,-gitlab,-gitea}/*/scripts/install-codex-agent-profiles.js', SKILL L119-124). gitlab/gitea validators pin the find-path (gitlab L525 assertIncludes `*/kaola-workflow-gitlab/*/scripts/install-codex-agent-profiles.js`; gitea L532) and forbid bare `*/kaola-workflow/*` (L527/L534). Removing locator reds those chains.

### Canonical new Step-5 (github; forge editions differ only in plugin_root + find-path noun):
> **5. Agent role profiles are a one-time GLOBAL install — `workflow-init` does NOT install them per repo.**
> Profiles install once into `~/.codex` and are available in every repo (parity with Claude global agents). `workflow-init` only scaffolds the project. If not yet installed (or after upgrade), run the one-time global install:
> ```bash
> plugin_root="plugins/kaola-workflow"
> if [ ! -f "$plugin_root/scripts/install-codex-agent-profiles.js" ]; then
>   script_path="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/install-codex-agent-profiles.js' -print -quit 2>/dev/null)"
>   plugin_root="$(dirname "$(dirname "$script_path")")"
> fi
> test -f "$plugin_root/scripts/install-codex-agent-profiles.js"
> node "$plugin_root/scripts/install-codex-agent-profiles.js" --global
> ```
> Writes `~/.codex/agents/kaola-workflow/*.toml` + the managed block in `~/.codex/config.toml`, refreshes global hooks — one install, all repos. The preflight gate accepts the global scope. (To pin to one repo instead, pass the repo path positionally — `… "$PWD"` — optional override.)

The --with-fast/--with-full examples (SKILL L146-148): change `"$PWD"` → `--global`.

### Command-peer "Codex hooks note" (L162-167 + forge peers): "Running `install-codex-agent-profiles.js --global` installs the agent profiles **globally** into `~/.codex` (one install, all repos) AND refreshes the global hooks." Keep trust-via-/hooks + remove-stale-project-hooks.json guidance.

## 5. Contract-validator spec
### Files: `scripts/validate-kaola-workflow-contracts.js` (codex), `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`, `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`.
### HONEST FINDING: NO existing assertion REQUIRES change. Installer-path assertIncludes (gitlab L525-528, gitea L532-534) assert the find-path locator (KEPT) → green. Installer module require() (validateSourceProfiles codex L588-591, gitlab L776-779) validate SOURCE tree — --global doesn't touch it; require() stays safe (require.main guard L711; top-level os.homedir() can't throw). No validator pins "$PWD"/"project-local" in the SKILL (grep returned nothing).
### n4 contribution = ADDITIVE regression locks (one per edition validator):
1. `assertIncludes(<initSkill>, 'install-codex-agent-profiles.js --global');`
2. Forbid retired per-repo mandate: `assert(!/install-codex-agent-profiles\.js"?\s+"\$PWD"/.test(read(<initSkill>)), '<edition> init SKILL must not mandate a per-repo "$PWD" agent install (#571)');` — choose regex to match exact quoting; EXCLUDE the optional-override example line if it shows `"$PWD"` (prefer asserting primary invocation is `--global` + mandate prose gone, over a blanket $PWD ban).

## 6. Docs rewrite map (n7)
| File | Line area | Change |
|------|-----------|--------|
| README.md | L441-442 ("remain **project-local**… only hook files global") | profiles + managed config install globally into ~/.codex by default; project-local optional override |
| README.md | L466-482 (update flow; L479 `install-codex-agent-profiles.js <project-root>`) | documented form → `--global`; keep doctor L481 |
| README.md | L499-505 (doctor: "profiles are project-local, project scope authoritative") | user(global) scope authoritative by default; project optional; gate accepts EITHER, fails closed when neither |
| README.md | L550-556 ("copies role configs into `.codex/agents/kaola-workflow/`") | reframe to `~/.codex/agents/kaola-workflow/`. **Do NOT touch** the role-list ```text block L535-543 — validate-kaola-workflow-contracts.js L616-627 pins it (set-equality + no docs-lookup) |
| README.md | L888-895 (hooks "global since #447") | light edit only if needed; no semantic change |
| docs/architecture.md | L62 (Preflight gate bullet) | add: gate accepts valid global ~/.codex OR project scope, fails closed when neither (#571); autofix remains project-local |
| docs/architecture.md | L64 ("agent profiles and config remain project-local under .codex/") | rewrite to global-default; project-local optional |
| docs/api.md | L1167-1175 (Behavior: "Resolves --project-root … checks .codex/agents/...") | add step: fresh global ~/.codex PASSES first (scope:'global'); else project + autofix; fail closed when neither |
| docs/api.md | L1189-1196 (JSON output ok) | note additive `scope:'global'|'project'` field on ok |
| docs/api.md | L1208-1218 (installer description) | document `--global` (targets os.homedir()/.codex); positional projectRoot = override; --with-fast/--with-full compose |
| docs/api.md | L1317-1345 (L1322 "agent profiles remain project-local under <project>/.codex/") | rewrite L1322 to global-default |
| CHANGELOG.md | top (no [Unreleased]; top is `## [6.12.0]` L3) | add `## [Unreleased]` above L3 with #571 entry |
| docs/decisions/D-571-01.md | new | ADR body (section 8) |

## 7. Test spec for n2 (RED-first)
### Surfaces (claude chain does NOT exercise preflight gate → out of scope for these tests):
1. codex — `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`, inside/after `testCodexPreflight266()` (L954-1053, invoked L1602). In-scope fixtures: installProfilesScript(L29), repoRoot(L27), pluginRoot(L26), preflightScript(L912), runScript(L946), os(L5).
2. gitlab — `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (preflight block ~L3557+).
3. gitea — `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`.

### Mirror existing pattern: runScript(preflightScript, ['--project-root', root, '--no-autofix', '--json']) + JSON.parse(stdout) + assert(json.status===…) (L966-989).

**Test (a) — global-only install ⇒ gate PASSES (RED-first discriminator; FAILS old, GREEN after):**
```
tempHome=mkdtemp(); env={...process.env, HOME:tempHome, USERPROFILE:tempHome};
spawnSync(node,[installProfilesScript,'--global'],{cwd:repoRoot,env});      // exercises --global e2e
assert exists tempHome/.codex/agents/kaola-workflow/workflow-planner.toml
assert exists tempHome/.codex/config.toml
emptyProject=mkdtemp();                                                       // repo with NO .codex
r=runScript(preflightScript,['--project-root',emptyProject,'--no-autofix','--json'],{env});
assert r.status===0                                                          // OLD → non-zero (RED)
json=JSON.parse(r.stdout); assert json.status==='ok'; assert json.scope==='global';
assert NOT exists emptyProject/.codex                                         // no redundant project copy
```
**Test (b) — neither scope valid ⇒ FAILS CLOSED (green before+after; proves no hole):**
```
tempHome2=mkdtemp(); env2={...,HOME:tempHome2,USERPROFILE:tempHome2}; emptyProject2=mkdtemp();
r=runScript(preflightScript,['--project-root',emptyProject2,'--no-autofix','--json'],{env:env2});
assert r.status!==0; assert JSON.parse(r.stdout).status==='profiles_missing'  // or config_stale — fail-closed
```
**Test (c) — STALE global does NOT short-circuit (locks scopeIsFresh):**
```
install --global into tempHome3(env3), then delete one role toml from tempHome3/.codex/agents/kaola-workflow/
emptyProject3=no project .codex
r=runScript(preflightScript,['--project-root',emptyProject3,'--no-autofix','--json'],{env:env3});
assert r.status!==0   // stale global not "fresh"; project absent → fail closed
```

### MANDATORY hermeticity retrofit (REQUIRED n2 work, NOT optional): every EXISTING preflight gate invocation in testCodexPreflight266 (L959,966,981,1002,1021,…) and in gitlab/gitea test-*-workflow-scripts.js preflight blocks must spawn with `env:{...process.env, HOME:<empty-temp-dir>, USERPROFILE:<empty-temp-dir>}` so the global scope is ABSENT and the test falls through to project-scope assertions. Without this, on any machine with a real ~/.codex the new short-circuit returns ok and breaks config_stale/profiles_missing discriminators. MUST land in the SAME commit as the gate change.

## 8. ADR D-571-01 body (drop into docs/decisions/D-571-01.md)
```markdown
# D-571-01. Make Codex agent profiles global by default; preflight gate accepts either the global (~/.codex) or project scope and fails closed when neither is valid

Date: 2026-06-27
Status: Accepted
Issue: #571
Related: #266/#332 (the preflight schema-valid gate this widens), #447 (Codex hooks already
         global in ~/.codex — the parity precedent), #409 (version-less stable hook home),
         #543 (--with-fast/--with-full install-time opt-ins this composes with),
         #307 (four-chain cross-edition parity), #400 (init-surface propagation).

## Context

Codex lifecycle hooks were made global in #447 (~/.codex/hooks.json + ~/.codex/kaola-workflow/
{hooks,scripts}) — one install, every repo. Agent profiles and the managed .codex/config.toml
block, however, defaulted to project-local: the three Codex init SKILLs (Step 5) mandated
`install-codex-agent-profiles.js "$PWD"` on every repo. The installer already supported a global
install (pass $HOME as projectRoot → ~/.codex/agents/kaola-workflow/*.toml + ~/.codex/config.toml;
the managed block's config_file lines are relative — "./agents/kaola-workflow/<role>.toml" — and
resolve correctly under ~/.codex/config.toml), so a global install already worked end-to-end.

The real coupling forcing per-repo setup was the hard gate kaola-workflow-codex-preflight.js,
which inspected ONLY the project scope (codexDir = projectRoot/.codex). Under a global-only install
it reported the profiles "missing" for the repo and autofix-installed a redundant project-local copy
— defeating the install-once intent and littering every repo with a .codex/ tree. inspectScope was
already scope-agnostic (doctor mode already grades user/project/plugin_cache scopes), so the gate had
all the machinery to honor a global scope; it simply never looked there.

## Decision

1. Flip the documented default to a one-time GLOBAL install. The three Codex init SKILLs stop
   mandating a per-repo "$PWD" agent install; workflow-init is scaffolding-only (CLAUDE.md / AGENTS.md
   / roadmap / docs), at parity with the Claude edition. They point to the one-time global
   install/upgrade flow.

2. Add a self-documenting `--global` flag to install-codex-agent-profiles.js that sets
   projectRoot = os.homedir() regardless of cwd/arg-order (position-robust, like --with-fast/
   --with-full). The positional projectRoot form ("$PWD"/"$HOME") is retained as an optional
   project-local override — back-compatible, nothing removed.

3. The preflight gate accepts EITHER a valid global ~/.codex scope OR a valid project scope, and
   FAILS CLOSED when neither is valid. Implemented as a global-first short-circuit: a fresh global
   scope PASSES (status: ok, scope: 'global') before any project inspection, so no redundant
   project-local copy is installed; a non-fresh global scope falls through to the existing
   project-scope inspection + autofix path unchanged. Autofix continues to target project-local only
   — the per-repo gate never silently writes the user's machine-wide ~/.codex.

## Consequences

- Install once into ~/.codex; every repo's gate passes with no per-repo agent step (the AC).
- The gate's fail-closed semantics are unchanged: the short-circuit only widens the PASS set by the
  fresh-global case; every existing typed refusal (--no-autofix stale, installer_failed,
  autofix_unsafe, schema_version_unsupported) still fires when global is not fresh.
- Project-local remains a fully supported override (pass a repo path positionally).
- The gate now depends on the ambient ~/.codex (via os.homedir(), which honors $HOME). All preflight
  gate tests must run under a hermetic temp HOME so the global scope is deterministic — existing
  project-scope fixtures are pinned to an empty temp HOME; the new global-PASS / fail-closed tests
  set HOME to the fixture's global home.
- Cross-edition obligation (#307): the preflight is byte-identical across all four trees and the
  installer across the three plugin trees; the init SKILLs/commands and docs change per edition. All
  four chains plus simulate-workflow-walkthrough.js must be green.

## Alternatives considered

- Remove project-local entirely. Rejected: deletes a working, back-compatible capability for no
  benefit and breaks the autofix safety net and existing fixtures.
- "Prefer global, fall back to project" as a distinct predicate. Rejected as over-engineered:
  "accept either, global checked first" is the literal AC and needs no preference machinery.
- Make autofix install globally. Rejected: a per-repo gate must not silently perform a machine-wide,
  user-owned write; the one-time global install is an explicit, escalated action.
- Keep "$HOME" as the only documented form (no --global flag). Rejected: --global is self-documenting
  and position-robust.
```

## 9. Risks / gotchas
1. **Ambient ~/.codex breaks existing tests (#1 risk).** Gate now consults os.homedir()/.codex; existing tests that corrupt PROJECT scope and expect config_stale/profiles_missing will short-circuit to ok on a machine with a real global install (dev machine has all 3 runtimes installed). n2 MUST retrofit hermetic empty-HOME env onto ALL existing preflight invocations. Non-negotiable, same commit as gate change.
2. **Byte-identical sync groups (validate-script-sync.js runs FIRST in every chain).** Preflight ×4 (group L190-196: scripts/ + 3 plugins). Installer ×3 (group L204-206: 3 plugins only, no scripts/ copy). Identical edits or the sync check fails before any walkthrough.
3. **#307 four-chain obligation.** Touches forge init SKILLs + preflight (byte-port) + installer (port) → all four chains green SEQUENTIALLY + simulate-workflow-walkthrough.js. opencode additive (D-530-02) — keep test-opencode-edition.js green; opencode profiles regenerated from canonical codex tree — verify no drift.
4. **README role-catalog contract adjacent to rewritten prose.** validate-kaola-workflow-contracts.js L616-638 pins the ```text role-list block (after "installs Codex-native role profiles", L535-543) with set-equality + no-docs-lookup. n7 must NOT touch that block.
5. **No new fail-closed path.** scopeIsFresh = s.exists && !scopeIsStale(s) — the `&& s.exists` is load-bearing (absent global would read "fresh" and wrongly PASS). Tests (b)/(c) lock this.
6. **--global arg parsing** also fixes latent leading-flag bug. No test relied on old broken behavior.
7. **CHANGELOG has no [Unreleased]** (top is ## [6.12.0]); n7 creates it.
8. gh issue view 571 needs --json in this sandbox.

## Build sequence
1. n2 — preflight ×4 + installer --global ×3 + RED tests (a/b/c) + hermetic-HOME retrofit. Run all four chains.
2. n3 — init SKILLs ×3 + command peers ×3 (drop per-repo mandate, point to --global).
3. n4 — additive regression locks in 3 codex validators.
4. n7 — docs rewrite map + ADR D-571-01 + CHANGELOG [Unreleased].
