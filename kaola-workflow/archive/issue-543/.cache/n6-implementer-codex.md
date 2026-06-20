evidence-binding: n6-implementer-codex 19b04a26846f

# n6-implementer-codex — GREEN (Codex lane, issue #543)

Ported --with-fast/--with-full opt-in partition to Codex per n3 frozen design (Option A — installer config-writer in byte-identical install-codex-agent-profiles.js triplet). Runtime legality gate already shipped (claim.js:849-863 → path_not_installed); this node added the missing install-time WRITER of installed_paths: arg parsing + pure-JS seedKaolaConfig UNION writer, byte-semantically mirroring install.sh:712-734 D4 + install-opencode.sh seed_kaola_config. No plugin.json change, no skill/profile conditional-removal, no version bump.

non_tdd_reason: Glue/wiring + config-writer port (installer arg-parsing + read-modify-write config writer + test-surface wiring + UX prose). UNION-writer semantics proven by byte-identical install.sh/install-opencode.sh writers this mirrors — no new behavioral logic with a natural failing unit test. The contract assertions ARE the gate: four contract validators (validate-script-sync triplet identity, validate-kaola-workflow-contracts, validate-vendored-agents, two forge validators) run on SAME files this node modifies, plus four npm chain-green receipts. Verified by regression-green (full suite green before & after), not RED→GREEN ceremony.

verification_tier: regression-green

## write_set (10 files — exactly the narrowed set)
1-3. install-codex-agent-profiles.js ×3 (codex/-gitlab/-gitea, byte-identical triplet)
4. plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js (testCodexInstalledPathsPartition543)
5. plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js (forge smoke)
6. plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js (forge smoke)
7. scripts/test-install-model-rendering.js (claude cross-edition assertion)
8-10. skills/kaola-workflow-init/SKILL.md ×3 (opt-in prose, paired-by-convention)

## verification_commands (all exit 0)
npm run test:kaola-workflow:claude → exit 0
npm run test:kaola-workflow:codex → exit 0 (testCodexInstalledPathsPartition543 (#543): PASSED)
npm run test:kaola-workflow:gitlab → exit 0 (testGitlabInstalledPathsPartition543Smoke: PASSED)
npm run test:kaola-workflow:gitea → exit 0 (testGiteaInstalledPathsPartition543Smoke: PASSED)
node scripts/simulate-workflow-walkthrough.js → exit 0
node scripts/validate-script-sync.js → exit 0 (triplet byte-identity)

regression-green: All four npm edition chains green (exit 0), run SEQUENTIALLY (#307 cross-edition obligation — claude alone insufficient). Partition sub-cases (codex, all PASSED): (a) default→[]; (b) --with-fast→["fast"]; (c) --with-full→["full"]; (d) both→["fast","full"] canonical order; (e) UNION never removes (fast then bare re-install → ["fast"]); (f) reinstall-after-uninstall reset→[]; (g) enable_adaptive:true migrated away + []; (h) corrupt JSON WARN-first (file byte-untouched, exit 0); (i) non-object "[]" WARN-first (untouched); (j) parallel_mode setdefault ({}→"auto"; "off"→stays "off"). Forge smoke (gitlab+gitea): default→[], --with-full→["full"]. Cross-edition (claude test-install-model-rendering.js): default codex installer seeds installed_paths:[] + parallel_mode:"auto".

## Invariants preserved (verified green)
1. Installer triplet byte-identity (validate-script-sync.js:205-211) — codex==gitlab==gitea post-edit ✓
2. plugin.json skills:"./skills/" ×3 — NO plugin.json touched ✓
3. kaola-workflow-fast SKILL.md mandatory ×3 — NO files removed/conditionalled ✓
4. adaptive-schema 4-tree — untouched ✓
5. codex-preflight 4-tree — untouched (no RETIRED_PROFILE_FILES/EFFORT_VALUES change) ✓
6. agents/*.toml triples — untouched ✓
7. NO manifest version bump (package.json/plugin.json git diff empty) — lands under 4.7.0 ✓
8. README pinned version lines — untouched ✓
9. validate-workflow-contracts.js root↔codex twin — untouched ✓

## Decisions
- Installer edit byte-identical across 3 trees (codex first, cp to -gitlab/-gitea, re-verified with diff).
- seedKaolaConfig WARN-first (try/catch JSON.parse + non-object check → warn+return, file untouched) + write-temp-then-rename (configFile+'.tmp-'+pid) crash-safety parity w/ copyAgentProfiles; called in main() AFTER updateHooks() BEFORE pruneStaleProfiles so hooks/profile/postVerify failure short-circuits first. status:ok last-line stdout contract preserved.
- process.argv.includes position-robust; unknown args IGNORED (never hard-fail — preflight+tests positional); --enable-adaptive warns+ignores. os.homedir() honors process.env.HOME.
- Codex partition test uses FRESH mkdtempSync HOME per sub-case (NOT shared kwSandboxHome) → no cross-sub-case installed_paths leakage. Forge smoke likewise fresh HOMEs.
- No overlap with n5's lane (.opencode/**, install-opencode.sh, sync-opencode-edition.js, test-opencode-edition.js, docs/opencode-edition.md — untouched).
- No version bump; commit msg cites "node-native port; semantics byte-identical to install.sh:712-734 + install-opencode.sh seed_kaola_config — no python3 dependency."
