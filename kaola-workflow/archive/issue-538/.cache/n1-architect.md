evidence-binding: n1-architect 3883f2339316

# n1-architect SPEC — issue #538 (flip the path switch: adaptive is the unconditional default)

Scope: file-by-file decision-locked implementation blueprint. Citations are `file:line` against the
worktree at `.kw/worktrees/issue-538`. The locked design (config field flip, legality = {adaptive} ∪
installed_paths, no auto-fallback, installer opt-ins, dead-code removal) is given; this SPEC refines it
into concrete edits. Cross-edition rule: schema is BYTE_IDENTICAL ×4; claim.js + classifier are
COMMON/rename-normalized, so every `scripts/` edit below ALSO lands in the three
`plugins/kaola-workflow{,-gitlab,-gitea}/scripts/` copies (byte-identical for schema; rename-normalized
for claim/classifier). n7b owns the propagation/write-set completeness; §F is its backstop.

---

## A. Schema kernel — `scripts/kaola-workflow-adaptive-schema.js` (the ×4 byte-identical anchor)

### A1. Constants: keep / change / remove
- KEEP `WORKFLOW_PATHS` (L22, `['fast','full','adaptive']`) as the closed universe of path NAMES. The
  frozen array is unchanged; only its doc comment (L20-21) loses the "claimProject whitelists … when the
  adaptive switch is OFF/ON" wording.
- REMOVE `WORKFLOW_PATHS_NO_ADAPTIVE` (L23). It is the retired switch-OFF whitelist; no legality path
  keeps it. Delete from `module.exports` (L573).
- KEEP `ADAPTIVE_PATH` (L24, `'adaptive'`) — the implicit-always member + resume target.
- REMOVE `ENABLE_ADAPTIVE_FIELD` (L390, `'enable_adaptive'`) and `ENABLE_ADAPTIVE_ENV` (L391,
  `'KAOLA_ENABLE_ADAPTIVE'`). Delete both from `module.exports` (L621-622).
- ADD `INSTALLED_PATHS_FIELD = 'installed_paths'` where `ENABLE_ADAPTIVE_FIELD` was (~L390); export it.
  No env field — `KAOLA_ENABLE_ADAPTIVE` retired with NO successor env (justified A3).
- KEEP `CONFIG_REL_PATH` (L389), `FANOUT_CAP_ENV`, `FANOUT_CAP_READONLY_ENV`, `LANE_CONTAINMENT_ENV`.
- Rewrite the block comment L386-388 ("the switch field and its env mirror. Precedence: env … > config
  enable_adaptive > default OFF") to describe `installed_paths` (default `[]`, no env override).

### A2. `isLegalWorkflowPath` — new signature
Today (L541-543): `function isLegalWorkflowPath(value, adaptiveEnabled) { return (adaptiveEnabled ?
WORKFLOW_PATHS : WORKFLOW_PATHS_NO_ADAPTIVE).includes(value); }`
NEW:
```js
function isLegalWorkflowPath(value, installedPaths) {
  return value === ADAPTIVE_PATH || (Array.isArray(installedPaths) && installedPaths.includes(value));
}
```
- Adaptive is legal UNCONDITIONALLY (`value === ADAPTIVE_PATH` short-circuits); never in the array,
  never needs install. `Array.isArray` guard => a malformed config degrades to adaptive-only, never throws.
- Export name unchanged (L633). CALLERS (confirmed by the `isLegalWorkflowPath per file` grep): ONLY
  `scripts/kaola-workflow-claim.js` (2 sites, §B) + schema self + the 3 forge copies. No other consumer.

### A3. Replace `resolveEnableAdaptive` (L406-415) with `resolveInstalledPaths`
```js
// Resolve the installed opt-in paths from config. Adaptive is implicit-always and is NEVER in this
// array (legality short-circuits adaptive in isLegalWorkflowPath). No env override: the per-session
// KAOLA_ENABLE_ADAPTIVE switch is retired (#538) — "installed" is an install-time fact, not a per-run
// toggle. Returns a frozen, de-duplicated subset of {fast, full}; any unknown token in config is
// dropped, so a hand-edited junk value cannot make a bogus path legal.
function resolveInstalledPaths(config) {
  const raw = (config && Array.isArray(config[INSTALLED_PATHS_FIELD])) ? config[INSTALLED_PATHS_FIELD] : [];
  const optIn = WORKFLOW_PATHS.filter(p => p !== ADAPTIVE_PATH); // ['fast','full'] — the only opt-ins
  return Object.freeze(optIn.filter(p => raw.includes(p)));
}
```
- SIGNATURE: drops the `env` param entirely (callers drop the 2nd arg, §B). No env override justified:
  the issue retires `KAOLA_ENABLE_ADAPTIVE`; "is fast/full installed?" is an on-disk fact. An env that
  *claims* a path is installed would select a path whose command/skill files are absent => broken route.
  Fail-closed: only installer-written config confers legality.
- RETURN: frozen `string[]`, subset of `['fast','full']`. Default `[]` when config absent/malformed
  (the `readAdaptiveConfig() => {}` path keeps working).
- FILTER-AGAINST-KNOWN-OPTINS (not raw passthrough): a junk token (`['adaptive','garbage']`) cannot
  widen legality — adaptive is already implicit, `garbage ∉ WORKFLOW_PATHS` is dropped.
- Export `resolveInstalledPaths` (replace `resolveEnableAdaptive` at L626); add `INSTALLED_PATHS_FIELD`
  (replace the two ENABLE_ADAPTIVE_* exports at L621-622).

### A4. `module.exports` delta (L571-636)
- REMOVE: `WORKFLOW_PATHS_NO_ADAPTIVE` (L573), `ENABLE_ADAPTIVE_FIELD` (L621), `ENABLE_ADAPTIVE_ENV`
  (L622), `resolveEnableAdaptive` (L626).
- ADD: `INSTALLED_PATHS_FIELD`, `resolveInstalledPaths`.
- UNCHANGED: `WORKFLOW_PATHS`, `ADAPTIVE_PATH`, `isLegalWorkflowPath`, all else.

### A5. Byte-identity / propagation
The 3 forge copies receive the IDENTICAL edit (enrolled in `validate-script-sync.js`). n7b's write set
MUST list all four schema copies or sync fails (mirror_write overflow subtype).

---

## B. `scripts/kaola-workflow-claim.js`

Every reader of the retired vocabulary, from the grep (`claim.js : all relevant token sites`). There
are FOUR switch-reading sites + supporting comments. `deriveRunPosture` (L51) is UNTOUCHED (confirmed —
it reads only `worktreePath`, no switch).

### B0. `readAdaptiveConfig` (L28-34) — UNCHANGED body
Still reads `~/.config/kaola-workflow/config.json` and returns `{}` on error. Only its comment (L27
"the strict `=== true` on-test in resolveEnableAdaptive falls to OFF") is rewritten to reference
`resolveInstalledPaths` (absent/malformed field => `[]` => adaptive-only legal).

### B1. `claimProject` toggle guard (L826-868) — the SELECTION gate (covers cmdClaim + cmdStartup→claimExplicitTarget)
Current: L832 `requestedPath`; L833 `resolveEnableAdaptive(readAdaptiveConfig(), process.env)`;
L834-845 `isLegalWorkflowPath(requestedPath, adaptiveEnabled)` => `workflow_path_refused`; L847-868 the
`path_requires_explicit_opt_in` block.

NEW logic:
```js
const requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'adaptive';   // (B5: default flips full->adaptive)
const installedPaths = adaptiveSchema.resolveInstalledPaths(readAdaptiveConfig());
if (!adaptiveSchema.isLegalWorkflowPath(requestedPath, installedPaths)) {
  const legal = [adaptiveSchema.ADAPTIVE_PATH, ...installedPaths].join(', ');
  return {
    status: 'path_not_installed',
    result: 'refuse',
    claim: 'none',
    issue: issueNumber,
    project,
    reasoning: 'workflow_path "' + requestedPath + '" is not installed. Installed paths: ' + legal +
      ' (adaptive is always available). Re-run install with --with-fast / --with-full to add it. ' +
      'Refusing to silently substitute adaptive (#538/#44).'
  };
}
```
- AC7 TYPED NOTICE: `status: 'path_not_installed'` + `result: 'refuse'`. DECISION — it is a `result:
  refuse` HARD STOP, matching the existing refusal family. Evidence the family is `result:refuse`:
  `adapt.md` L110-113 enumerates `workflow_path_refused`/`target_occupied`/etc. as `result: refuse`
  HARD STOPs ("do not retry a different issue … determinate RED is final"). A non-installed path named
  by the user is a determinate user error, not a transient — so refuse, NOT escalate, and explicitly
  NOT a silent adaptive substitution (the AC7 requirement). Renaming `workflow_path_refused` ->
  `path_not_installed` is correct because the OLD reason ("not permitted; adaptive switch is OFF") no
  longer describes the world; the new reason is "named path isn't installed". (n7b: this is the only
  refusal STATUS string that changes; update the contract pin at validate-workflow-contracts.js L826
  which asserts the literal `workflow_path_refused` — see §F.)
- `result: refuse` was ABSENT on the old L836 envelope (it had only `status`); adding it makes the
  envelope match the `adapt.md` consumer's `result === 'refuse'` branch uniformly (improvement, not a
  regression — the consumer already treats any non-acquired/owned as refuse).

### B2. DELETE the `path_requires_explicit_opt_in` block (L847-868) entirely
This block enforced "under ON switch, defaulting to fast/full is the silent bypass — refuse it." Under
#538 the DEFAULT IS adaptive (B5), so a defaulted `requestedPath` is `'adaptive'`, which is always legal
and is exactly what we WANT — there is no silent downgrade left to guard. Removing it also retires the
`pathWasDefaulted` local (L856). The whole block + its comment (L847-855) is deleted.

### B3. `claimProjectBundle` (L1284-1303) — the `target_set_not_adaptive` early-return + redundant legality
Current Step-3 (L1285-1289): `requestedPath !== ADAPTIVE_PATH` => `target_set_not_adaptive`. Then
L1290-1303 re-checks `isLegalWorkflowPath` => `workflow_path_refused`.
- KEEP the bundle-is-adaptive-only constraint (the bundle lane is adaptive by design), but the issue's
  removal list names `target_set_not_adaptive` for retirement. DECISION: KEEP the constraint, RENAME the
  status to reuse the canonical refusal vocabulary. Replace L1285-1303 with:
```js
const requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'adaptive';
if (requestedPath !== adaptiveSchema.ADAPTIVE_PATH) {
  return { status: 'bundle_requires_adaptive', result: 'refuse', claim: 'none', project: null, issue: null,
    reasoning: 'the bundle lane is adaptive-only; got workflow_path "' + requestedPath + '"' };
}
```
  Rationale: the bundle still must be adaptive (fast/full have no multi-issue lane), so this is NOT a
  legality-of-installed question — it is "this lane only accepts adaptive." The redundant
  `isLegalWorkflowPath` re-check (L1290-1303) is now DEAD (adaptive is unconditionally legal) and is
  DELETED. Status renamed `target_set_not_adaptive` -> `bundle_requires_adaptive` to retire the literal
  per the issue while preserving the guard. (n7b: update CHANGELOG/README/api.md/test-bundle-claim.js
  references to `target_set_not_adaptive` — §F.) If n7b prefers MINIMAL churn, an acceptable alternative
  is to keep the `target_set_not_adaptive` literal and only delete the dead L1290-1303 re-check — but
  the issue's removal list names the token, so rename is the faithful read; lock RENAME.

### B4. `cmdAuthoringAllowed` (L1391-1405) — the adaptive-under-OFF typed refusal (the `authoring_refused` path)
This is the "adaptive-under-OFF typed refusal" the issue's removal list item 5 targets (the task text
says "cmdPickNext"; the ACTUAL site is `cmdAuthoringAllowed`, the `/kaola-workflow-adapt` authoring
guard — `cmdPickNext` at L1488 has NO switch read, confirmed below). Current L1393 reads
`resolveEnableAdaptive`; L1394-1402 emits `authoring_refused` when OFF.
- DECISION: adaptive authoring is now ALWAYS allowed (adaptive is the unconditional default — there is
  no switch to be OFF). Collapse the body to the unconditional allow:
```js
function cmdAuthoringAllowed() {
  const args = parseArgs(process.argv.slice(3));
  output({ status: 'authoring_allowed', allowed: true, project: args.project || null });
}
```
  Remove the `resolveEnableAdaptive` read (L1393) and the entire `if (!adaptiveEnabled)` /
  `authoring_refused` branch (L1394-1403). Keep the subcommand registered (`authoring-allowed` at
  L3216) — it still returns the allow envelope so the adapt command's mechanical gate keeps its shape;
  it simply never refuses. (Rewrite the comment L1384-1390 to drop "reads the SAME switch … emits a
  TYPED refusal when OFF".)

### B5. Default-path flip: `'full'` -> `'adaptive'` at the three `|| 'full'` sites
`grep` shows `args.workflowPath || process.env.KAOLA_PATH || 'full'` at L832 (claimProject), L1285
(bundle), and L957 (the `workflow_path:` persisted field in writeState). Under #538 the unconditional
default is adaptive, so all three `|| 'full'` become `|| 'adaptive'`.
- L832 & L1285: handled in B1/B3 above.
- L957 (`workflow_path: args.workflowPath || process.env.KAOLA_PATH || 'full'`): flip to `|| 'adaptive'`
  so the PERSISTED state records adaptive when nothing was named. NOTE this is reached only after the
  B1 legality gate passed, so a defaulted claim persists `adaptive` and resume routes via plan-run
  (consistent with `reconcileNextCommand`/`resumeFallbackCommand`, which are toggle-agnostic and
  UNCHANGED — L1522 comment "never reads resolveEnableAdaptive" stays true; both already key on
  `workflow_path: adaptive` / a `workflow-plan.md`).

### B6. `cmdPickNext` (L1488-1497) — NO switch read; UNCHANGED
Confirmed: it only validates a target is named, delegates to cmdStartup, else refuses `no_target`. No
`resolveEnableAdaptive`/`enable_adaptive` reference. The task's "cmdPickNext adaptive-under-OFF refusal"
maps to `cmdAuthoringAllowed` (B4) — there is no adaptive-under-OFF refusal in cmdPickNext.

### B7. Comment-only edits
- L27 (readAdaptiveConfig comment): rewrite per B0.
- L826-831 (claimProject toggle-guard comment): rewrite to describe legality = {adaptive} ∪ installed,
  refuse `path_not_installed`, no switch.
- L1384-1390 (cmdAuthoringAllowed comment): rewrite per B4.

---

## C. `scripts/kaola-workflow-classifier.js`

Only ONE site touches the retired field (grep `classifier readOrCreateConfig usages`): the default-
config object in `readOrCreateConfig` (L175). The classifier itself reads ONLY `parallel_mode`
(L692-694) at runtime — it never reads `enable_adaptive`. But `readOrCreateConfig` CREATES the config
file with defaults when absent (L171-179), so its default shape IS part of the config contract and MUST
match the new schema.

### C1. Change the default-config object (L175)
Today: `const defaults = { parallel_mode: 'auto', enable_adaptive: false };`
NEW: `const defaults = { parallel_mode: 'auto', installed_paths: [] };`
- `installed_paths: []` = adaptive-only (the new unconditional default). This keeps the classifier's
  auto-created config consistent with what the installer writes (§D) and what `resolveInstalledPaths`
  expects. No other change in classifier.js. The runtime `parallel_mode` read (L692-694) is untouched.
- Propagate to the 3 forge classifier copies (rename-normalized:
  `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` — all show 1 hit in §F).

---

## D. Installer — `install.sh` + `uninstall.sh`

### D1. Flag parsing — retire `--enable-adaptive`; add `--with-fast` / `--with-full`
- L51 `ENABLE_ADAPTIVE=yes` default var: REMOVE. ADD `WITH_FAST=0` and `WITH_FULL=0` (default OFF =
  adaptive-only).
- L99-111 (`--enable-adaptive=*` / `--enable-adaptive` arms): REPLACE the value-bearing arms with a
  WARN-AND-IGNORE arm that accepts the flag (any value or bare) and prints a deprecation warning, then
  shifts WITHOUT setting anything (the issue: `--enable-adaptive` warns-and-ignores). ADD two new arms
  `--with-fast` (sets `WITH_FAST=1`) and `--with-full` (sets `WITH_FULL=1`):
```sh
--enable-adaptive|--enable-adaptive=*)
  echo "warning: --enable-adaptive is retired (#538); adaptive is the unconditional default and is always installed. Ignoring." >&2
  shift ;;
--with-fast)  WITH_FAST=1; shift ;;
--with-full)  WITH_FULL=1; shift ;;
```
  (Place BEFORE the `*)` unknown-arg catch-all at L112, so `--with-fast`/`--with-full` are recognized.)
- L129-136 (the `case "$ENABLE_ADAPTIVE" in yes|no)` validation): REMOVE entirely (no value to validate).
- L53-57 `usage()`: drop the `--enable-adaptive` line; add `[--with-fast] [--with-full]` to the Usage
  string and one help line each ("install the fast path (opt-in)", "install the full 6-phase path
  (opt-in)"). Update the L47-50 header comment block to describe the new model.

### D2. Per-path FILE install/spare — what belongs to fast vs full
The current command loop (L517-526) copies EVERY `*.md` in `SOURCE_COMMANDS_DIR` unconditionally, and
the skill loop similarly. Under #538 the installer must install adaptive-only by default and add
fast/full files only on opt-in. Enumerate the per-path file sets (from `ls commands/` + `ls
plugins/kaola-workflow/skills/`):

- **ADAPTIVE (always installed)** — commands: `workflow-init.md`, `workflow-next.md`,
  `kaola-workflow-adapt.md`, `kaola-workflow-plan-run.md`, `kaola-workflow-auto.md`,
  `kaola-workflow-finalize.md`. (Plus any non-path-specific shared command.)
- **FAST path files (install only when `WITH_FAST=1`)** — command: `kaola-workflow-fast.md`; Codex
  skill dir: `skills/kaola-workflow-fast/`. (The fast skill on the codex/forge trees.)
- **FULL path files (install only when `WITH_FULL=1`)** — commands: `kaola-workflow-phase1.md` …
  `kaola-workflow-phase5.md` (the 6-phase ladder commands; phase6 is the finalize, shared); Codex
  skills: `skills/kaola-workflow-research/`, `skills/kaola-workflow-plan/`,
  `skills/kaola-workflow-execute/`, `skills/kaola-workflow-review/`, `skills/kaola-workflow-ideation/`
  (the full-path phase skills — n7b VERIFY this skill grouping against the route-reachability map at
  `test-route-reachability.js` L29-32: `full -> kaola-workflow-research/(phase1)`).
- IMPLEMENTATION: in the command loop (L517), guard each `command_file` basename: skip `kaola-workflow-
  fast.md` unless `WITH_FAST=1`; skip `kaola-workflow-phase[1-5].md` unless `WITH_FULL=1`. Concretely
  add a `case "$(basename "$command_file")" in` filter before `render_command_file`. Do the same in the
  skill-install loop (codex/forge). Keep the `installed=0` fail-closed check (L528-535) — adaptive files
  always install, so `installed` is never 0 on a real tree.

### D3. Stale-file cleanup loop (L225-249) must SPARE installed paths
TWO loops: the command-stale loop (L225-233, pattern `kaola-workflow-*.md` etc.) and the script-stale
loop (L236-249). The command loop `rm -f`s ANY `kaola-workflow-*.md` not freshly written — TODAY that's
fine because every file is reinstalled, but under D2 a fast/full file is NOT reinstalled when its path
is off, so the loop would wrongly delete an opt-in path's file on an adaptive-only re-install. The issue
requires re-install to UNION (never remove an installed path's files).
- FIX: the stale-cleanup must SPARE files that belong to a path recorded as installed in the EXISTING
  config (read `installed_paths` from `~/.config/kaola-workflow/config.json` BEFORE the union-write in
  D4). Build a "keep set" = adaptive files ∪ (fast files if fast ∈ existing installed_paths OR
  WITH_FAST=1) ∪ (full files if full ∈ existing installed_paths OR WITH_FULL=1). The stale loop deletes
  a `kaola-workflow-*.md` ONLY if it is in NEITHER the freshly-installed set NOR the keep set. Simplest
  concrete form: compute the union FIRST (D4), then drive the stale loop off the resolved union so the
  installer reinstalls all union-path files in D2 and the stale loop only removes genuinely-retired
  filenames. This makes "reinstall preserves what's installed" hold by construction.

### D4. Config write — `installed_paths` UNION read-modify-write (L700-747)
Replace the python3 heredoc (L710-732) that writes `enable_adaptive`. The new heredoc unions the
existing `installed_paths` with the newly-requested opt-ins (NEVER removes):
```python
import json, os, sys
path = sys.argv[1]
with_fast = sys.argv[2] == '1'
with_full = sys.argv[3] == '1'
config = {}
if os.path.exists(path):
    try:
        with open(path) as f: config = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"warning: {path} is not valid JSON ({e}); leaving it untouched.", file=sys.stderr); sys.exit(2)
    if not isinstance(config, dict):
        print(f"warning: {path} is not a JSON object; leaving it untouched.", file=sys.stderr); sys.exit(2)
config.setdefault("parallel_mode", "auto")
existing = config.get("installed_paths")
paths = set(existing) if isinstance(existing, list) else set()
if with_fast: paths.add("fast")
if with_full: paths.add("full")
config["installed_paths"] = [p for p in ("fast", "full") if p in paths]   # canonical order, {fast,full} only
config.pop("enable_adaptive", None)   # migrate away the retired field on any touched config
with open(path, "w") as f: json.dump(config, f, indent=2); f.write("\n")
print(f"Installed paths (adaptive always; opt-ins: {config['installed_paths']}) in: {path}")
```
- UNION semantics: a prior `--with-fast` install, then a bare `./install.sh`, keeps fast in
  `installed_paths` (existing set is unioned, never cleared). `config.pop('enable_adaptive')` migrates
  an old install's stale field away (clean cutover).
- Invocation (L710): pass `"$WITH_FAST" "$WITH_FULL"` instead of `"$ENABLE_ADAPTIVE"`. Update the
  python-not-found / write-failed warnings (L735-746) to reference `installed_paths` not `enable_adaptive`.
- This config write must run BEFORE OR the keep-set in D3 must read the PRE-union config — order so the
  stale loop spares correctly (D3 reads existing, D4 writes union).

### D5. `uninstall.sh` — remove config (reset = uninstall -> reinstall)
uninstall.sh today removes agents/commands/scripts but does NOT touch
`~/.config/kaola-workflow/config.json` (grep confirms no `config.json` / `installed_paths` reference in
the $HOME config region; the only `config` hits are the Codex `.codex/config.toml` agents-block strip at
L278-337, unrelated). ADD a config-removal step (guarded, like the agent-manifest `rm -f` at L86):
```sh
# #538: uninstall clears the shared config so reset = uninstall -> reinstall (back to adaptive-only).
KAOLA_CONFIG_FILE="$HOME/.config/kaola-workflow/config.json"
if [[ -f "$KAOLA_CONFIG_FILE" ]]; then
  rm -f "$KAOLA_CONFIG_FILE" && echo "Removed $KAOLA_CONFIG_FILE"
fi
```
  Place in the forge-neutral cleanup region (after the agent-model-manifest rm ~L86). Gate so a
  `--forge=all` (default bare uninstall) removes it; a single-forge uninstall MAY also remove it since
  the config is a single shared file with no per-forge namespace (CONFIG_REL_PATH is one path) — remove
  unconditionally is acceptable and simplest (reset semantics). n7b: confirm no other edition expects
  the config to survive a single-forge uninstall (it should not — it is the shared switch state).

---

## E. Router prose — 6 surfaces + 2 forge copies

CANONICAL-SOURCE RULE: `commands/workflow-next.md` (Claude) is authoritative; the other surfaces MIRROR
it modulo forge nouns. The 6 routing surfaces (per CLAUDE.md #400): the 3 Claude commands
(`commands/workflow-next.md`, `commands/kaola-workflow-adapt.md`, + the auto/finalize where relevant) +
the 3 Codex SKILL packs (`plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-next/SKILL.md`
and the adapt SKILLs). The route-reachability contract
(`scripts/test-route-reachability.js` + the four `validate-*-contracts.js`) machine-enforces propagation.

### E1. `commands/workflow-next.md` Step 0a-1 "Path Intent" (L198-275) — REWRITE
Current structure: a "Switch resolution" sub-step (L204-206 reads `KAOLA_ENABLE_ADAPTIVE`/config), then
**Branch A — switch OFF** (L210-238) and **Branch B — switch ON** (L242-275). Under #538 there is no
switch, so collapse to a SINGLE flow:
- DELETE the "Switch resolution" sub-step (L204-206) entirely — nothing to resolve.
- DELETE **Branch A (switch OFF)** wholesale (L208-240): the OFF menu, the auto-fast trivial-fix rubric
  (L218-234), the level-4 structure question, and the `KAOLA_PATH=adaptive` typed-refusal-under-OFF
  note (L216-217). None of it exists post-#538.
- REPLACE **Branch B** (L242-275) with the new unconditional flow (no "switch ON" framing):
  1. **Explicit `KAOLA_PATH`** — honor `adaptive` always; honor `fast`/`full` ONLY IF that path is
     installed. If `KAOLA_PATH` names a path that is NOT installed, the claim returns the typed
     `path_not_installed` refusal (§B1) — surface it, do NOT silently fall to adaptive (AC7).
  2. **Explicit path-name verbal escapes** (the ONLY keyword escapes), CONDITIONAL ON INSTALL:
     - "fast path" / "fast mode" => `KAOLA_PATH=fast` ONLY IF fast is installed; else stay adaptive
       (and optionally note "fast not installed; running adaptive — re-install with --with-fast").
     - "full path" / "full mode" / "full review" / "all phases" => `KAOLA_PATH=full` ONLY IF full is
       installed; else stay adaptive.
     - Task descriptors ("typo", "one-line", "trivial", "quick fix", "rename", "thorough",
       "carefully", "deep dive") are NOT escapes — they hit the default => adaptive.
  3. **Default => adaptive.** No path-name keyword + no explicit KAOLA_PATH => `export
     KAOLA_PATH=adaptive` and proceed to Step 0a-2. Adaptive just runs.
  - DELETE the **"Adaptive fallback => full"** sub-bullet (L261-264) — NO automatic fallback between
    paths (locked design #3). Replace with the in-adaptive exhaustion floor pointer (see E2).
  - Rewrite the "State the chosen path" examples (L266-275) to drop all "switch ON/OFF" phrasings; keep
    `Path: adaptive (default)`, `Path: fast (explicit "fast path" escape; fast installed)`,
    `Path: full (explicit "full review" escape; full installed)`.
- How the SKILL knows what's installed: the router prose instructs the agent to read `installed_paths`
  from `~/.config/kaola-workflow/config.json` (or treat a fast/full escape as best-effort and let the
  claim's `path_not_installed` refusal be the hard gate — the claim is the fail-closed backstop, so
  prose may simply hand the escape to the claim and surface its refusal). LOCK: prose hands the escape to
  the claim; the claim's `path_not_installed` is the authority. This keeps the agent from re-deriving a
  config read the script already owns (matches the "scripts own atomicity" principle).

### E2. `commands/kaola-workflow-adapt.md` exhaustion floor (L134) — REWRITE the repair loop tail
Current L134: bounded repair loop, then "After repeated failure => a REAL decision: **downgrade to full
path** / discard+restart / STOP+ask." The "downgrade to full path" clause is an AUTO-FALLBACK between
paths — RETIRE it. New floor (locked design #3): bounded planner repair (~2x) => discard+restart fresh
adaptive => stop+ask. Rewrite L134's tail to:
  "After repeated failure (~2x) => a REAL decision: **discard+restart a fresh adaptive run**
  (`kaola-workflow-claim.js discard --project {project}` then a fresh adaptive start) / **STOP + surface
  a concrete blocker** with validator evidence. NEVER downgrade to fast/full — there is no automatic
  fallback between paths (#538); the only fallbacks are inside adaptive (bounded repair, in-place
  posture)."
- Also scan `kaola-workflow-adapt.md` for `target_set_not_adaptive` (grep §F shows it appears here) and
  update it to `bundle_requires_adaptive` per B3, OR confirm it is prose that simply names the bundle
  refusal — update the literal in lockstep with B3.

### E3. Forge / Codex mirrors
Apply the IDENTICAL prose deletions/rewrites to:
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md`, `…-gitea/commands/workflow-next.md`
  (forge command mirrors; grep §F shows each has the `enable_adaptive`/`target_set_not_adaptive` hits).
- `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-next/SKILL.md` (the 3 Codex next SKILLs;
  each shows `KAOLA_ENABLE_ADAPTIVE`/`enable_adaptive`/`target_set_not_adaptive` hits).
- `plugins/kaola-workflow{,-gitlab,-gitea}/commands/kaola-workflow-adapt.md` +
  `…/skills/kaola-workflow-adapt/SKILL.md` (the adapt mirrors — `target_set_not_adaptive` hits in §F).
Forge nouns only differ (gh->glab etc.); the routing logic is identical. n7b: this is the #400 SIX-
surface propagation — a change reaching only 4/6 is a gap the route-reachability contract catches.

### E4. Contract / route-reachability validators MUST move in lockstep (machine-enforcement)
`scripts/validate-workflow-contracts.js` pins the OLD vocabulary and WILL FAIL after the edits unless
updated (these are NOT optional):
- L749 `assertIncludes('install.sh', '--enable-adaptive')` => change to assert `--with-fast` /
  `--with-full` (and assert install.sh NO LONGER requires `--enable-adaptive` as a live flag, or assert
  the warn-and-ignore string).
- L773-775 `assertConcept('commands/workflow-next.md', 'adaptive path selection', ['KAOLA_ENABLE_ADAPTIVE',
  'adaptive', 'fast|full|adaptive', 'default', 'typed refusal'])` => drop `KAOLA_ENABLE_ADAPTIVE`;
  update the concept tokens to the new model (e.g. `'installed_paths'`, `'adaptive'`, `'default'`,
  `'path_not_installed'`).
- L825 `assertIncludes('scripts/kaola-workflow-claim.js', 'resolveEnableAdaptive')` => change to
  `'resolveInstalledPaths'`.
- L826 `assertIncludes('scripts/kaola-workflow-claim.js', 'workflow_path_refused')` => change to
  `'path_not_installed'` (the new refusal literal, §B1).
- L830 `assertIncludes('scripts/kaola-workflow-adaptive-schema.js', 'resolveEnableAdaptive')` => change
  to `'resolveInstalledPaths'`.
- L835-838 `assertNotIncludes(... 'enable_adaptive' / 'KAOLA_ENABLE_ADAPTIVE')` on repair-state +
  plan-validator: KEEP (those scripts must still NOT reference the field) — still true, no change.
- The same pins exist in `scripts/validate-kaola-workflow-contracts.js` (L486, L556-557) and the 3
  forge `validate-*-contracts.js` copies — update ALL FOUR in lockstep (CLAUDE.md cross-edition rule).
- `scripts/test-route-reachability.js` (L29-32 path->skill map; L486 concept tokens) — confirm the
  fast/full skill groupings used in §D2 match its map; no logic change needed unless a skill name moves.

---

## F. Complete config-consumer inventory (write-set-completeness backstop for n7b)

Grouped by the 4 node clusters. LIVE = must move; OOS = consciously out-of-scope point-in-time record
(existing ADRs, `docs/investigations/*`, archived `kaola-workflow/archive/*` evidence — these stay
UNCHANGED). Counts/paths from the per-token greps run this session.

### Cluster 1 — schema / claim / classifier (CODE; LIVE)
- `scripts/kaola-workflow-adaptive-schema.js` (3 hits) + the 3 byte-identical copies:
  `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js` (3 each). [§A — BYTE-IDENTICAL ×4]
- `scripts/kaola-workflow-claim.js` (resolveEnableAdaptive/enable_adaptive/WORKFLOW_PATHS_NO_ADAPTIVE/
  isLegalWorkflowPath/target_set_not_adaptive sites) + 3 forge claim copies:
  `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`. [§B — rename-normalized]
- `scripts/kaola-workflow-classifier.js` (1 hit, L175) + 3 forge classifier copies:
  `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`. [§C]

### Cluster 2 — installer (CODE; LIVE)
- `install.sh` (11 enable_adaptive hits + `--enable-adaptive` flag arms + config-write heredoc). [§D1-D4]
- `uninstall.sh` (NO current config-removal — ADD per §D5). [§D5]

### Cluster 3 — router prose (PROSE; LIVE — the #400 six surfaces + forge copies)
- `commands/workflow-next.md` (Step 0a-1 Branch A/B) + `commands/kaola-workflow-adapt.md` (exhaustion
  floor + target_set_not_adaptive). [§E1, E2]
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md`, `…-gitea/commands/workflow-next.md`. [§E3]
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md`, `…-gitea/commands/kaola-workflow-adapt.md`. [§E3]
- `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-next/SKILL.md` (3 Codex next SKILLs). [§E3]
- `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-adapt/SKILL.md` (3 Codex adapt SKILLs —
  target_set_not_adaptive hits). [§E3]

### Cluster 4 — contracts / walkthroughs / docs (LIVE) + OOS records
LIVE contracts & tests (machine-enforcement — MUST move or chains go RED):
- `scripts/validate-workflow-contracts.js` (L749, L773-775, L825, L826, L830; keep L835-838). [§E4]
- `scripts/validate-kaola-workflow-contracts.js` (L486, L556-557) + 3 forge validators:
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`,
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`,
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`. [§E4 — ×4 lockstep]
- `scripts/simulate-workflow-walkthrough.js` (9 enable_adaptive + KAOLA_ENABLE_ADAPTIVE + --enable-adaptive
  hits — the integration suite; assertions about the switch/legality/refusal MUST be rewritten to the new
  model: installed_paths default [], path_not_installed refusal, no switch) + the 3 forge walkthroughs:
  `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`,
  `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` (+ `-codex-`),
  `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` (+ `-codex-`). [LIVE]
- `scripts/test-install-adaptive-config.js` (16 hits — the installer-config unit test; rewrite to assert
  installed_paths union + --with-fast/--with-full + --enable-adaptive warn-ignore + uninstall removes config). [LIVE]
- `scripts/test-claim-hardening.js` (4 hits), `scripts/test-bundle-claim.js`/`test-bundle-state.js`
  (target_set_not_adaptive / KAOLA_ENABLE_ADAPTIVE) — rewrite refusal-status assertions to the renamed
  vocabulary (path_not_installed / bundle_requires_adaptive). [LIVE]
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`,
  `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (2 each). [LIVE — forge tests]
LIVE docs (user-facing — MUST move):
- `README.md` (5 enable_adaptive + KAOLA_ENABLE_ADAPTIVE rows incl. L300, L662, L803 env-var table) — rewrite
  the switch narrative to "adaptive is the unconditional default; --with-fast/--with-full opt-ins"; DELETE
  the `KAOLA_ENABLE_ADAPTIVE` env-var table row. [LIVE]
- `docs/api.md` (4 hits — schema/config field + refusal vocabulary), `docs/workflow-state-contract.md`
  (5 hits), `docs/architecture.md` (2 hits), `CHANGELOG.md` (add [Unreleased] entry; the existing
  target_set_not_adaptive/KAOLA_ENABLE_ADAPTIVE mentions are historical CHANGELOG rows — leave OLD entries,
  ADD a new one). [LIVE for api/state-contract/architecture; CHANGELOG = additive]
- `CLAUDE.md` (1 hit — the #538 principle block already added in cf43da3f; verify it matches; likely no edit). [verify]
OOS — point-in-time records that STAY UNCHANGED (do NOT edit):
- `docs/decisions/0007-adaptive-default-under-switch-on.md` (the SUPERSEDED ADR — leave as historical;
  the NEW D-538-01 records the supersession, §G). `docs/decisions/D-515-01.md`, `D-526-01.md` (mention
  the field in passing — historical).
- `docs/investigations/dynamic-workflow-composition-2026-06-02.md` (16), `…/adaptive-path-audit-2026-06-03.md`
  (2) — investigation snapshots, OOS.
- ALL `kaola-workflow/archive/*/.cache/*.md`, `…/workflow-plan.md`, `…/finalization-summary.md` (issue-254,
  515, 522, 523, 526, 528, 263, 242, 250, 328, bundle-510-511-519) — archived run evidence, OOS.
- `kaola-workflow/issue-538/workflow-plan.md` + this run's `.cache/*` — the CURRENT run's own plan/evidence
  (describe the change; not a code surface to edit).

n7b CAUTION: the `simulate-*-walkthrough.js` (×4+codex) and `test-install-adaptive-config.js` are the
HEAVIEST live edits (the switch/legality is exercised throughout). The contract validators (×4) are the
fail-RED tripwires if the renamed vocabulary is missed in any edition.

---

## G. ADR — `docs/decisions/D-538-01.md`

VERIFIED numbering: the current scheme is `D-{issue}-01.md` (the sequential `00NN` scheme stopped at
`0010`; every record since ~D-419 uses `D-NNN-NN`). Neither `0011*` nor `D-538*` exists. So the planner's
`D-538-01` is CORRECT — create `docs/decisions/D-538-01.md` (NOT `0011-…`).

Header block (match D-528-01 shape): `# D-538-01. Adaptive is the unconditional default; fast/full are
install-time opt-ins; the on/off switch + auto-fallbacks retire`; `Date: 2026-06-19`; `Status: Accepted`;
`Issue: #538`; `Supersedes: docs/decisions/0007-adaptive-default-under-switch-on.md` (the switch-ON-default
ADR this replaces); `Related: #227 (original adaptive path), #254 (adaptive-default-under-switch), #44
(agent-owns-reasoning / typed refusals), #501 (self-sufficient by default — same direction).`

Load-bearing decisions to record (each a paragraph):
1. **Switch-axis flip.** Retire the boolean `enable_adaptive` config field (+ its `KAOLA_ENABLE_ADAPTIVE`
   env mirror) for a list-valued `installed_paths: []`. Adaptive is implicit-always and NEVER appears in
   the array. The only "switch" is now which EXTRA paths are installed — an install-time fact, not a
   per-run toggle. No per-session env override survives (a path's legality follows from on-disk install,
   never a fabricated env claim).
2. **Legality = {adaptive} ∪ installed_paths.** `isLegalWorkflowPath` short-circuits adaptive
   unconditionally and otherwise requires membership in installed_paths. A `KAOLA_PATH` naming a
   non-installed path is a TYPED `path_not_installed` refusal (`result: refuse`) — NOT a silent adaptive
   substitution, NOT a crash (AC7).
3. **Union/preserve re-install.** The installer read-modify-writes `installed_paths` as a UNION (never
   removes); re-install preserves what is installed; the stale-file cleanup loop spares installed paths'
   files. uninstall removes the shared config; reset = uninstall -> reinstall (back to adaptive-only).
4. **No automatic fallback between paths.** Adaptive never silently downgrades to fast/full. The
   exhaustion floor is INSIDE adaptive: bounded planner repair (~2x) -> discard+restart a fresh adaptive
   run -> stop+ask. The retired clauses: the adapt.md "downgrade to full path" tail, the router
   "Adaptive fallback => full" sub-bullet, and the `target_set_not_adaptive`/adaptive-under-OFF refusals.

Consequence note: `0007` is left in place as a superseded historical record (the ADR-supersession
convention, mirroring how 0010 "fulfills, not reverses" 0008).

---

## Build sequence (dependency order, for tdd-guide / implementer)
1. Schema kernel (§A) — types/constants the rest import. BYTE-IDENTICAL ×4.
2. claim.js (§B) + classifier (§C) — core legality + config default. Rename-normalized ×4.
3. Installer + uninstall (§D) — config writer/cleanup must match the new field.
4. Router prose (§E1-E3) — 6 surfaces + forge copies.
5. Contract validators + walkthroughs + unit tests (§E4, §F cluster 4) — RED->GREEN: rewrite the pinned
   vocabulary FIRST so the suite proves the rename, then implement. All four chains green (cross-edition).
6. Docs (§F cluster 4 LIVE docs) + ADR D-538-01 (§G).

---

## REVISIONS (post-advisor — these SUPERSEDE the conflicting passages above; implement THESE)

### R1. Installer — single `EFFECTIVE_*` gate (supersedes the D2/D3 conflict)
D2 ("install fast unless WITH_FAST") and D3 ("reinstall all union-path files") conflicted: a bare
re-install on a system where fast was previously installed would SPARE the old fast file but never
REFRESH it (stale after a package upgrade — the exact class the cleanup loop exists to kill). FIX:
compute ONE effective set EARLY, BEFORE the L225 stale loop, and gate D2-install, D3-spare, AND
D4-config-write on the SAME variable:
```sh
# Read the pre-union config ONCE, up front (before the stale loop + before D4 writes).
EXISTING_PATHS="$(node -e 'try{const c=require(process.env.HOME+"/.config/kaola-workflow/config.json");const p=Array.isArray(c.installed_paths)?c.installed_paths:[];process.stdout.write(p.join(" "))}catch(e){}' 2>/dev/null || true)"
case " $EXISTING_PATHS " in *" fast "*) EFFECTIVE_FAST=1;; *) EFFECTIVE_FAST=$WITH_FAST;; esac
case " $EXISTING_PATHS " in *" full "*) EFFECTIVE_FULL=1;; *) EFFECTIVE_FULL=$WITH_FULL;; esac
```
- D2 install loop: install fast files iff `EFFECTIVE_FAST=1`; full files iff `EFFECTIVE_FULL=1`. So a
  bare reinstall REFRESHES a previously-installed path (spare AND refresh); `--with-X` only ever ADDS.
- D3 stale loop: spare a fast/full file iff its `EFFECTIVE_*=1` (same variable) — because D2 just
  reinstalled it, it is in the fresh set and the stale loop leaves it; a genuinely-off path's files are
  deleted (correct — a path you never opted into and isn't recorded stays absent).
- D4 config write: union `EFFECTIVE_FAST`/`EFFECTIVE_FULL` (not raw WITH_*) so the persisted
  installed_paths reflects what was actually installed. (The D4 python `paths.add` union is otherwise
  unchanged; pass `"$EFFECTIVE_FAST" "$EFFECTIVE_FULL"`.)
- Reading config via `node -e` (not python) keeps the read consistent with the rest of the JS toolchain;
  python remains the WRITER in D4. Either is fine — the load-bearing point is ONE effective set, read
  from the PRE-union config, gating all three.

### R2. Router E1 point-2 — DELETE the soft fall-through (supersedes E1 point-2 + resolves the LOCK conflict)
E1 point-2's "else stay adaptive (with a note)" CONTRADICTS the E1 LOCK and re-introduces the silent
substitution AC7 forbids (once the keyword sets `KAOLA_PATH=fast`). RESOLVE toward the LOCK (consistent
with AC7 + "scripts own atomicity"):
- A path-name keyword ("fast path"/"full review"/etc.) and an explicit `KAOLA_PATH` BOTH simply EXPORT
  the named path and hand it to the claim. NO router-side install check, NO "else stay adaptive."
- The claim's `path_not_installed` typed refusal (§B1) is the SINGLE authority — if the named path
  isn't installed, the run surfaces that refusal (hard stop), it does not silently run adaptive.
- DELETE every "ONLY IF fast/full is installed; else stay adaptive" clause from E1 point-1 and point-2.
  The router prose does NOT read `installed_paths`. One behavior across B1 and E1.

### R3. ADR 0007 — mark Superseded (supersedes the §F "OOS-untouched" classification for 0007 ONLY)
`docs/decisions/0007-adaptive-default-under-switch-on.md` IS edited: update its header `Status:` line to
`Status: Superseded by D-538-01` (leave the body unchanged — the supersession convention, distinct from
0008->0010's "fulfills-not-reverses"). 0007 moves from OOS to a one-line LIVE edit. All other §F OOS
records (investigations, archives, D-515/D-526 passing mentions) stay untouched.

### R4. B3 bundle — RENAME is locked; the "acceptable alternative" hedge is WITHDRAWN
Implement EXACTLY: rename `target_set_not_adaptive` -> `bundle_requires_adaptive` (with `result: refuse`)
and DELETE the dead `isLegalWorkflowPath` re-check (old L1290-1303). No fork for n7b.

### R5. auto.md — confirmed clean
`commands/kaola-workflow-auto.md` carries NO "fall back to full / 6-phase safety floor" prose (grep:
zero hits). No edit needed; the Branch-B replacement (E1/R2) introduces no "full = safety floor" wording.
