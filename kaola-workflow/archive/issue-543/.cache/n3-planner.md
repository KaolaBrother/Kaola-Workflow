evidence-binding: n3-planner 4caebbf32bf7

# n3-planner Design Spec — Codex --with-fast/--with-full Partition (issue #543)

## CHOSEN MECHANISM: Option A — installer config-writer in install-codex-agent-profiles.js triplet
Runtime legality gate already shipped+enforced (kaola-workflow-claim.js:849-863 → path_not_installed; adaptive-schema.js:504,528-532 reads installed_paths from ~/.config/kaola-workflow/config.json). Only missing piece = install-time WRITER. Cheapest sufficient mechanism; invariant-preserving; mirrors Claude install.sh D4 byte-semantically; zero runtime/script surface. Plugin-split REJECTED (massively invasive, no native UNION state, runtime gate already enforces).

Falsification checkmarks: (1) default install → installed_paths:[] → gate refuses fast/full ✅; (2) --with-fast/--with-full UNION into installed_paths → gate allows ✅; (3) four chains green (triplet byte-identical) ✅; (4) mirrors install.sh:704-741 D4 ✅; (5) byte-twin invariants preserved ✅.

## NARROWED WRITE SET (what n6 implements)
1. plugins/kaola-workflow/scripts/install-codex-agent-profiles.js ×3 (codex/-gitlab/-gitea byte-identical triplet, validate-script-sync.js:205-211) — PRIMARY. Adds --with-fast/--with-full arg parsing + D4 config UNION writer.
2. plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js (codex chain only) — extend runInstallProfiles helper (extraArgs param) + add partition-scenario block.
3. plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-workflow-scripts.js (paired-by-convention, NOT byte-twins) — smoke parity assertion.
4. scripts/test-install-model-rendering.js (claude chain — OPTIONAL/low-priority) — cross-edition behavioral-identity assertion.
5. plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/skills/kaola-workflow-init/SKILL.md ×3 (paired-by-convention, no byte-twin entry) — add --with-fast/--with-full opt-in prose subsection after the install-codex-agent-profiles.js "$PWD" block (~:113-134).

NOT TOUCHED: plugin.json ×3 (skills:"./skills/" validator-pinned ×3); agents/*.toml (role-based not path-based); kaola-workflow-fast SKILL.md (validator-mandatory ×3); adaptive-schema.js (4-tree read-only); codex-preflight.js (4-tree, no RETIRED_PROFILE_FILES change); claim.js (gate shipped); any manifest version (release-surface drift + lockstep); README pinned version lines (:528-533,550).

## ALGORITHM SPEC — arg parsing + config-UNION-write (mirror install.sh:101-109,704-741 + install-opencode.sh:156-192)

### A. Arg parsing (module top, after constants ~:65)
```js
const WITH_FAST = process.argv.includes('--with-fast');
const WITH_FULL = process.argv.includes('--with-full');
if (process.argv.some(a => a === '--enable-adaptive' || a.startsWith('--enable-adaptive='))) {
  console.warn('Kaola-Workflow Codex installer: --enable-adaptive is retired (#538); adaptive is the unconditional default. Ignoring.');
}
```
(process.argv.includes is position-robust so SKILL init `node install-codex-agent-profiles.js "$PWD" --with-fast` works regardless of arg order. Unknown args IGNORED, never hard-fail — preflight kaola-workflow-codex-preflight.js:718,727 + tests invoke positionally.)

### B. Config writer (PURE-JS port, NOT python3 shell-out — node guaranteed present)
```js
function seedKaolaConfig(homeDir, withFast, withFull) {
  const configDir = path.join(homeDir, '.config', 'kaola-workflow');
  const configFile = path.join(configDir, 'config.json');
  let config = {};
  if (fs.existsSync(configFile)) {
    let parsed;
    try { parsed = JSON.parse(read(configFile)); }
    catch (e) {
      console.warn(`Kaola-Workflow Codex installer: ${configFile} is not valid JSON (${e.message}); leaving it untouched.`);
      return { status: 'skipped_corrupt' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`Kaola-Workflow Codex installer: ${configFile} is not a JSON object; leaving it untouched.`);
      return { status: 'skipped_non_object' };
    }
    config = parsed;
  }
  if (config.parallel_mode === undefined) config.parallel_mode = 'auto';   // setdefault, never overwrite user value
  const existing = Array.isArray(config.installed_paths) ? config.installed_paths : [];
  const paths = new Set(existing);
  if (withFast) paths.add('fast');
  if (withFull) paths.add('full');
  config.installed_paths = ['fast', 'full'].filter(p => paths.has(p));    // canonical order, {fast,full} only
  delete config.enable_adaptive;                                           // migrate retired field
  fs.mkdirSync(configDir, { recursive: true });
  const tmp = configFile + '.tmp-' + process.pid;                          // crash-safety parity w/ copyAgentProfiles :353-355
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(tmp, configFile);
  console.log(`Kaola-Workflow Codex installer: installed_paths (adaptive always; opt-ins: ${JSON.stringify(config.installed_paths)}) in ${configFile}`);
  return { status: 'updated', installed_paths: config.installed_paths };
}
```

### C. Integration
- Call seedKaolaConfig(os.homedir(), WITH_FAST, WITH_FULL) immediately AFTER updateHooks() (between step 6 updateHooks and step 7 pruneStaleProfiles) — mirrors install-opencode.sh ordering where seed_kaola_config follows seed_config. WARN-first guarantees it cannot break success path; a profile/hooks failure short-circuits before reaching it.
- Home source: os.homedir() (imported :3, used :18; honors process.env.HOME on POSIX — matches hermetic-HOME test pattern).
- Exports: add seedKaolaConfig to module.exports block :649-663 (unit-testable without main(); parity w/ buildManagedHooks/mergeHooks).

### D. SKILL.md init prose ×3 — add subsection after install-codex-agent-profiles.js "$PWD" block (~:113-134)
"### Opting into the fast / full paths — Adaptive is the unconditional default. To make fast/full reachable at runtime: `node "$plugin_root/scripts/install-codex-agent-profiles.js" "$PWD" --with-fast` (and/or --with-full). Records opt-ins via UNION into ~/.config/kaola-workflow/config.json installed_paths — re-running without flags PRESERVES prior opt-ins; uninstall→reinstall resets to adaptive-only. Until a path is recorded, the runtime gate refuses it with path_not_installed (no silent fallback)."

## CONDITIONAL-DEPLOY VERDICT: D2 = NO (config-writer alone sufficient)
1. kaola-workflow-fast SKILL.md validator-mandatory (validate-kaola-workflow-contracts.js:85,90-97) — can't remove/conditional. Stays on-disk; only runtime reachability gated.
2. 15 agent profiles (agents/*.toml) are ROLE-based, NOT path-based — no fast/full subset.
3. plugin.json "skills":"./skills/" asserted byte-identical ×3 validators.
4. Runtime gate (claim.js:849-863) IS the enforcement point. Net: R1 (UNION compute) + D4 (config write) only.

## TEST PLAN
1. simulate-kaola-workflow-walkthrough.js (codex chain PRIMARY): extend runInstallProfiles(target, extraEnv, extraArgs); add testCodexInstalledPathsPartition543() with FRESH tmp HOME per sub-case (mkdtempSync, do NOT reuse module-top kwSandboxHome). Sub-cases: (a) default→[]; (b) --with-fast→["fast"]; (c) --with-full→["full"]; (d) both→["fast","full"] canonical order; (e) UNION never removes (--with-fast then no-flags → still ["fast"]); (f) reinstall-after-uninstall reset→[]; (g) enable_adaptive migration (pre-seed {enable_adaptive:true}→absent + []); (h) corrupt JSON WARN-first (file unchanged, exit 0); (i) non-object "[]" WARN-first (unchanged); (j) parallel_mode setdefault ({}→"auto"; {"parallel_mode":"off"}→stays "off").
2. test-{gitlab,gitea}-workflow-scripts.js (smoke parity, NOT byte-twins): spawn forge installer NO flags→assert installed_paths:[]; --with-full→["full"].
3. test-install-model-rendering.js (claude, OPTIONAL): assert ~/.config/kaola-workflow/config.json exists + installed_paths:[] after default installer run under chome. Defer if minimizing surface.

## INVARIANTS PRESERVED
1. Installer triplet byte-identity (:205-211) — SAME edit ×3 ✅
2. plugin.json skills ×3 validators — NO plugin.json touched ✅
3. kaola-workflow-fast SKILL.md mandatory — NO files removed ✅
4. adaptive-schema 4-tree (:181-188) — read-only ✅
5. codex-preflight 4-tree (:193-200) — no schema change ✅
6. agent-profile .toml triples (:215-224) — no .toml touched ✅
7. release-surface drift / manifest version-lockstep — NO version bump, lands under 4.7.0 ✅
8. validate-workflow-contracts.js root↔codex twin (:52) — neither touched ✅
9. release twin (:85) — no release script touched ✅
README pinned version lines (:528-533,550) undisturbed.

## RISKS / EDGE CASES
1. Edition-agnostic shared config clobbering — algorithm byte-semantically identical (UNION, canonical order, delete enable_adaptive, parallel_mode setdefault). Cross-edition correct.
2. python3-absent — NONE (pure node port, strictly more robust than bash mirrors). Commit msg must cite "node-native port; semantics byte-identical to install.sh:712-734 + install-opencode.sh:166-184 — no python3 dependency".
3. Corrupt existing config — WARN-first (try/catch + type-check), return without throwing, file untouched.
4. Crash-mid-write — write-temp-then-rename (copyAgentProfiles :353-355 pattern).
5. Arg parsing — process.argv.includes position-robust; --enable-adaptive warns+ignores; unknown args ignored (preflight + tests positional).
6. parallel_mode — setdefault only, never overwrite user value.
7. SKILL.md triplet — paired-by-convention NOT byte-twin-enforced; add prose to all 3 for UX parity; keep find-path line (:118) forge-specific.
8. Exports — seedKaolaConfig in module.exports (:649-663) for unit-testability.
9. Hermetic HOME — partition sub-cases MUST use FRESH mkdtempSync HOME per sub-case (reusing shared kwSandboxHome → cross-sub-case installed_paths leakage → flaky).
10. No silent fallback (#538) — runtime gate refuses path_not_installed; default [] keeps fast/full unreachable until opted in.

## VERSION DISCIPLINE
DO NOT bump any manifest version. Land under current 4.7.0. (release-surface drift guard + lockstep triplet check treat version bump as release event.)

## n6 IMPLEMENTATION ORDER
1. Apply A+B+C to install-codex-agent-profiles.js (codex tree first), byte-replicate to -gitlab + -gitea.
2. Extend codex test surface (Test Plan 1) + gitlab/gitea smoke (2) + optional claude assertion (3).
3. Add SKILL.md opt-in prose ×3 (Section D).
4. Run ALL FOUR chains sequentially, record green before finalize (#307):
   npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
5. NO version bump; commit msg cites install.sh:712-734 + install-opencode.sh:166-184 mirrored semantics.
