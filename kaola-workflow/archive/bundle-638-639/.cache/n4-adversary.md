evidence-binding: n4-adversary 7f0c45f9b93b

verdict: pass
findings_blocking: 0

finding: id=A1 scope=out_of_scope action=follow_up status=deferred filed=#640 severity=low fix_role=none rationale=absolute-path metric_paths entry freezes in-grammar — same defense-in-depth family as #640's bare-dir/backslash residual but not listed in #640's body; recommend appending it there (inert today: write-set wall refuses absolutes so string-equality is impossible; physical aliasing backstopped by the OPT-5 change-gate metric reproduction)

## Claim Under Test

"Both hardening legs are CORRECT, COMPLETE, and REGRESSION-FREE for #638 (edition-sync `--check` widened to COMMON_SCRIPTS + BYTE_IDENTICAL_GROUPS mirrors via `checkMirrors`) and #639 (OPT freeze hardening: R1 metric_command-required, R2/R5 dir/glob/`..`-alias metric_paths → OPT-2, R3/R7 duplicate/fenced-decoy optimize blocks → OPT-1 via `optimizeHeaderCounts`, R6 documentation-only)." Merged diff `origin/main..HEAD`, 7 code files (canonical validator + codex byte mirror + 2 forge rename ports + edition-sync.js + 2 test files).

## Disproof Attempt

I tried hard to break both legs and could not. Every probe was executed live (Bash), not inspected.

### #639 — 42-probe adversarial battery (own plans, worktree validator, `--json`)

Driver: `/private/tmp/claude-501/.../scratchpad/probes/drive-639.js` → **42/42 behaved exactly as claimed**:

- **R1**: absent / empty-value / whitespace-only `metric_command` all refuse with `OPT-2 … metric_command`.
- **R2**: `bench/`, `bench/*.js`, `bench/?.js`, `bench/{a,b}.js`, `bench/[ab].js`, `**/suite.js` all refuse (`not exactly-resolvable`).
- **R5**: `bench/../src/hot.js`, `../outside.js`, bare `..`, trailing `src/hot.js/..` all refuse.
- **Alias sneak attempts DEFEATED by normalization, not missed**: `./src/hot.js`, `src//hot.js`, `src/./hot.js` (write set `src/hot.js`) — all canonicalized by `normalizeRepoPath` (kaola-workflow-classifier.js:200) and refused via the OPT-2 *intersect* arm. The `..` form is the only alias normalization leaves untouched, and the new rule refuses it explicitly.
- **No over-refusal**: exact file, nested `bench/nested/deep/suite.js`, multi-path, and dotfile `.bench-config.json` all freeze in-grammar; direct write-set intersect still refuses (pre-existing rule unregressed).
- **R3/R7**: duplicate block (`2 optimize`/`3 optimize` counts in the error), backtick-fenced decoy, tilde-fenced decoy, and a decoy hidden behind a **fenced fake `## Fake Section` heading** (fence-aware `sectionBody` keeps it inside Meta) all refuse OPT-1. Decoy outside `## Meta` is invisible to both parser and counter → green (correct: it can't clobber). Ghost-keyed block and zero-block arms unregressed.
- **Counter/parser parity proven behaviorally, not just by source identity** (both use the identical regex `/^optimize\(([^)]*)\)[ \t]*:[ \t]*$/` on the same `sectionBody(content,'Meta')` — plan-validator.js:463/510): case variant `Optimize(opt):`, trailing-content `optimize(opt): tampered`, and leading-space ` optimize(opt):` decoys each carried `budget_iterations: 999999`; all froze **in-grammar**, proving the tampered value never entered the effective contract for the parser either (else OPT-3 would refuse). Matching variants (`optimize(opt) :`, trailing tab, `optimize( opt ):`) are counted by BOTH → OPT-1 refuse. The one absorption path (leading-space decoy header is indented prose, so its indented field merges into the open real block) **still binds at the OPT-3 cap** (`absorb-cap-binds` → refuse OPT-3) — no unbounded escape exists.
- **R6 correctly has no rule**: `0x10`/`1e1` freeze (converted values within cap); `1e9`, `0x0`, `-1e2`, `lots` all refuse OPT-3 — the cap binds on the converted value, as documented.
- **Residuals (informational)**: bare-existing-dir and backslash metric_paths freeze green — exactly the filed #640 scope (confirmed non-blocking: outside #639's AC, inert per #640's own risk analysis, OPT-5 change-gate backstop). Absolute-path also freezes green — same family, not listed in #640 → finding A1 above (append to #640).

### #638 — old-vs-new differential on a byte-exact scratch tree (`git archive HEAD`)

- **Clean tree**: NEW `--check` exit 0 ("10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity"); OLD (origin/main) `--check` exit 0. **No false positive.**
- **4 planted defects** (deleted `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`; byte-drifted `…/kaola-workflow-claim.js`; deleted gitea pre-commit hook copy; drifted codex pre-commit hook copy): NEW `--check` **exit 1 naming all four**; OLD `--check` on the identical tampered tree **exit 0 green** — the exact hole, live-proven closed.
- **Missing canonical** (reference side of a COMMON pair): exit 1, `missing mirror: scripts/kaola-workflow-gap-sweep.js`.
- **Pre-existing class unregressed**: drifted gitlab forge aggregator port → OLD and NEW both exit 1 (my first `exit=0` reading was my own pipe artifact; re-measured unpiped).
- **Universe-parity hunt found no missed class**: `runWrite` = (a) GENERATED_AGGREGATORS ports + (b) COMMON→codex + (c) byte groups (edition-sync.js:198-240); `runCheck` now = (a) + `checkMirrors`(b+c). RENAME_NORMALIZED_FAMILIES are hand-ports outside BOTH by design (validate-script-sync guards them in-chain) — the AC is parity with `runWrite`, which now holds exactly. The `runWrite` bare-array-group tolerance vs `checkByteIdenticalGroup`'s `.files` destructure is a theoretical asymmetry only: all 27 committed groups are `{label, files}`, and a hypothetical bare array would crash `--check` → nonzero exit → fail-closed direction.

### Regression + cross-edition (#307) + provenance

- `node scripts/test-edition-sync.js` → 41 assertions passed (T9 synthetic-fixture red/green + T10 real-tree no-false-positive included).
- `node scripts/simulate-workflow-walkthrough.js` → passed (full OPT-1..6 + testMetricOptimizerContract battery incl. the new hardening asserts).
- Four chains sequentially, all exit 0: claude, codex, gitlab, gitea. **No #635-class flake even occurred.**
- `node scripts/edition-sync.js --check` + `node scripts/validate-script-sync.js` green in the worktree → the 3 ports are faithful regen of the changed canonical (byte/rename-exact against CURRENT canonical, so port behavior is identical by construction); `optimizeHeaderCounts` present in all 4 trees.
- Provenance: zero `#NNN`/`D-NNN` in added non-comment emitted strings (refs confined to comments); diff touches no agent-facing command/agent/skill surface.
- Zero repo files written by me; probes lived in the scratchpad; scratch tree fully restored and re-verified green.

## Verdict

NOT-REFUTED (confidence: high) — 50+ live probes across both legs, an old-vs-new differential proving the #638 hole closed with no false positives, behavioral counter/parser-parity proofs closing every decoy variant I could construct, all four #307 chains green, and the only residuals being the already-filed #640 family (plus one unlisted sibling recorded as non-blocking finding A1).