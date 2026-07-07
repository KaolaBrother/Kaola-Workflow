evidence-binding: n3-review 7ab4b4349e79
verdict: pass
findings_blocking: 0
finding: id=R0 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=clean-review-no-defects-found

## n3-review — bundle-629-637 (APPROVE, 0 findings)

Reviewed the reconciled octopus merge f5c502a6 (parents: stub 98edb368, leg n1 c79f4a17, leg n2 0870b238) via git diff 98edb368..HEAD. Working tree byte-clean after all probes (no tracked file modified — oracles read-only).

### #629 (n1-guards) — edition-guard net
(a) New checks REAL not vacuous: config/agents.toml triple all 3 md5-identical (579c8575…) → BYTE_IDENTICAL_GROUPS green against real files. hooks/hooks.json family: gitlab/gitea ports RAW-UNEQUAL to root (forge-renamed compact-context token) yet EQUAL after normalizeHooksJson() → normalization load-bearing (plain byte-compare would red); checkNormalizedFamily(HOOKS_JSON_FAMILY) returns {missing:[],drift:[]}. Exactly 3 hooks/hooks.json (root/gitlab/gitea) all covered; codex ships only config/hooks.json (pre-existing CONFIG_HOOKS_FAMILY) — comment accurate, no coverage gap.
(b) NO data-file writes: diff touches only the 4 n1 scripts + 2 n2 files + 2 .cache; no hooks.json/agents.toml/forge-port data file.
(c) RED-first genuine: test-validate-script-sync §6/§7 — pre-fix the new exports don't exist → existence asserts fail structurally (evidence 5 fail/31 pass via stash, consistent with 40-vs-36 post-fix counts); mechanism red-proofs assert the right things (PreToolUse matcher planted root-only → drift for EVERY port; divergent byte in 2nd agents.toml copy → EXACTLY 1 drift; both in tmpdirs). test-edition-sync T8: pre-fix syncIfDrift not exported → TypeError (literal signature in evidence); T8 covers create-on-missing + idempotency + drift-overwrite regression.
(d) Shared-primitive extraction behavior-preserving (verified line-by-line): checkByteIdenticalGroup/checkNormalizedFamily reproduce the old inline loops exactly (missing-reference early-return = old continue; drift message strings byte-identical; normalizedKind parameterizes the old rename-normalized/compact-resume-normalized literals). readOrNull unchanged. Only terminal OK wording changed (cosmetic, no consumer asserts).
(e) Create-on-missing doesn't over-copy: syncIfDrift (edition-sync.js:116-122) returns false when target exists identical; writes only on absent-or-drift; utf8 equality unchanged; mkdirSync(recursive) write-path-only for missing-parent. --check green on the in-sync tree, git status clean. (edition-sync imports BYTE_IDENTICAL_GROUPS from validate-script-sync → the new agents.toml group flows into the write path with codex-tree copy canonical — consistent w/ the guard.)

### #637 (n2-manifest) — fn-closure-audit hardening
(a) sink_incomplete present on ALL SIX finalize surfaces: 3 raw occurrences each (root/gitlab/gitea × command/SKILL); no whitespace → norm() can't alter; NOT a substring of <!-- PIN: closure-audit -->; sits directly inside the closure-audit section (e.g. commands/kaola-workflow-finalize.md:950/979, 3 lines after the :947 marker) — genuinely anchors the interior prose. No vacuous re-introduction.
(b) Red-proof genuinely reds (byte-faithful replay of live norm/deriveObligated/checkManifest): pre-fix (2 tokens) 0 failures (new assertion would fail → suite reds, matches evidence pre-fix 1 fail/282 pass); post-fix (3 tokens) 6 failures (one missing-token per obligated surface → assertion passes; suite 283). Test imports the LIVE block from REQUIRED_BLOCKS, not a synthetic copy.
(c) Nothing else touched: required-blocks.js diff filtered of the token + comment is empty; no other manifest block or finalize surface changed.

### Cross-cutting
Legs exact-file-disjoint (per-leg diff stats); octopus merge clean. Oracle ALL green (run by reviewer): validate-script-sync.js (24 common/26 byte/8 rename/2 hooks.json/7 export-superset), test-validate-script-sync (40), test-edition-sync (35), edition-sync --check (10 ports), test-route-reachability (283), generate-routing-surfaces --check (12), the 4 validate-*-contracts, walkthrough. **#307 FULL FOUR CHAINS run sequentially — ALL FOUR GREEN exit 0** (fresh 2026-07-08 logs). Working tree unmodified after all runs.

### Summary: CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0 → APPROVE. Both legs surgical, RED-first-proven, behavior-preserving where refactored, non-vacuous where guarding.
