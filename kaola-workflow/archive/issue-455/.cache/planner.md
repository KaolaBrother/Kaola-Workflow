# Planner output — fast plan for issue #455

## 1. Approach confirmation
Exactly ONE sensible approach. No materially-different second design. Fast-eligible.
Decided approach: derive codex version by default (same bump-kind as root applied to the
codex baseline) + `--codex-version A.B.C` explicit override; never silently fall back to
root; report `codex_version_source: derived|explicit`; codex-axis monotonic guard
(`non_monotonic_codex_version`); fail closed (`codex_version_underivable`) when no last
root tag and no override. Derivation is by KIND not magnitude (5.0.0→5.1.0 ⇒ 3.0.0→3.1.0;
5.0.0→6.0.0 ⇒ 4.0.0).

## 2. Write set — 4 hand-edited + 1 auto-synced = 5 changed paths (fast-eligible)
1. scripts/kaola-workflow-release.js                                  (canonical, all logic)
2. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js  (forge port, byte-copy)
3. plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js    (forge port, byte-copy)
4. scripts/test-release.js                                            (fixture + RED tests, root-only)
Auto-synced (do NOT hand-edit; `npm run sync:editions` regenerates it because release ∈ COMMON_SCRIPTS):
5. plugins/kaola-workflow/scripts/kaola-workflow-release.js           (codex byte copy)

NOTE: `npm run sync:editions` does NOT regenerate the gitlab/gitea release ports (they live in
validate-script-sync.js RENAME_NORMALIZED_FAMILIES, not edition-sync GENERATED_AGGREGATORS) — they
must be propagated by explicit `cp` (byte-identical is correct: the canonical file is forge-port-safe).

## 3. Exact change per file

### A. scripts/kaola-workflow-release.js
A1. New constant CLAUDE_MANIFEST_RELPATHS after CODEX_MANIFEST_RELPATHS (~L46), forge-port-safe
    construction (PLUGIN_BASE + '-gitlab/.claude-plugin/plugin.json', + '-gitea/...'). Only gitlab+gitea
    (no github-base .claude-plugin manifest exists).
A2. New helpers near semverCompare (~L172):
    - bumpKind(fromVer,toVer) -> 'major'|'minor'|'patch'|null (compare maj,min,pat in order).
    - deriveCodexVersion(codexBaseline, kind) -> string (major->[+1,0,0]; minor->[maj,+1,0]; patch->[maj,min,+1]).
A3. Parse `--codex-version` in main() --cut branch (flagVal), thread into runCut opts as codexVersionOverride.
A4. Codex-version RESOLUTION + BOTH guards INSERTED IN THE PRE-MUTATION BLOCK (after lockstep guard ~L399,
    BEFORE in-process re-verification / Step 1) so an underivable/non-monotonic refuse never half-mutates.
    Use lastVer (L376) as root baseline; lockstep.baseline as codex baseline.
      if override -> codexVersion=override, source='explicit'
      else: if lastVer===null -> refuse codex_version_underivable; else kind=bumpKind(lastVer,version);
            codexVersion=deriveCodexVersion(codexBaseline,kind); source='derived'
      monotonic: if semverCompare(codexVersion,codexBaseline)<=0 -> refuse non_monotonic_codex_version
A5. Step 3 (codex manifests, ~L476-486): write codexVersion not version; keep isStepDone keyed on root version;
    add codexVersion audit field to receipt.
A6. NEW Step 3b: bump the 2 .claude-plugin manifests to ROOT version (receipt keys claude_manifest_0/1, keyed root version).
A7. Step 4 (README, ~L488-502): codex regex replacement target -> codexVersion; ADD replacement for the 3
    "Claude Code command install, (GitHub|GitLab|Gitea) edition: `<X>`" lines -> ROOT version (currently untouched).
A8. runCut success JSON (~L514): add codex_version + codex_version_source.

### B. gitlab/gitea release ports
cp scripts/kaola-workflow-release.js -> the two ports (byte-identical; renameNormalize is a no-op since forge-port-safe).
Run `npm run sync:editions` once to refresh the codex byte copy. validate-script-sync.js validates parity.

### C. scripts/test-release.js
C1. makeFixtureRepo: new opt claudeVersion=version; add the 3 claude-install README lines (parameterized);
    write the 2 .claude-plugin/plugin.json files (names kaola-workflow-gitlab/-gitea, version: claudeVersion).
C2. RED rewrite T5: root 5.0.0 / codex 3.0.0 -> cut 5.1.0 -> assert codex==3.1.0 (NOT 5.1.0), README codex==3.1.0,
    2 claude-plugin==5.1.0, 3 README claude-install==5.1.0, package.json==5.1.0,
    r.json.codex_version==='3.1.0', codex_version_source==='derived'.
C3. NEW derive-major: cut 6.0.0 -> codex==4.0.0, source derived.
C4. NEW explicit override: cut 5.1.0 --codex-version 3.9.9 -> codex==3.9.9, source explicit.
C5. NEW non_monotonic_codex_version: cut 5.1.0 --codex-version 2.9.0 (<=baseline) -> refuse.
C6. NEW codex_version_underivable (fail-closed): tagVersion:null, no --codex-version -> refuse + assert NO mutation
    (package.json still 5.0.0, CHANGELOG still [Unreleased]).
Existing T9 (source purity)/T10 (idempotent)/T11 (cross-version) stay green unchanged (receipts keyed on root version).

## 4. Acceptance commands
1. node scripts/test-release.js  (all assertions pass)
2. All four #307 chains run SEPARATELY (npm test && short-circuits):
   npm run test:kaola-workflow:claude / :codex / :gitlab / :gitea
   (validate-workflow-contracts.js, validate-script-sync.js, edition-sync.js --check run inside these.)
   Verify each real exit code; do not gate on `| tail`.

## 5. Out-of-scope
- Do NOT bump the live repo version numbers (5.16.0 / 3.16.0 stay) — only the tool LOGIC + its test change.
- No validator changes (validate-workflow-contracts.js already encodes the correct dual-version contract — it is the oracle).
- No --verify / --push changes. No new github-base .claude-plugin manifest. CHANGELOG [Unreleased] entry optional (non-gating).
