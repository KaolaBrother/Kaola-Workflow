evidence-binding: n6-review 0a76a0ca24b0
verdict: pass
findings_blocking: 0

## n6-review (G1 gate) — Issue #571: Codex agent profiles global by default
Strict cross-edition contract-flip review. Post-dominates n2/n3/n4 + n5. No fail-open or byte-drift found.

### Evidence boundary (#324)
- Re-ran myself (this worktree/machine): validate-script-sync.js (green), all 3 contract validators (green), codex simulate-kaola-workflow-walkthrough.js (green), test-install-model-rendering.js (green), md5 byte-identity preflight×4 + installer×3 (identical), a direct preflight probe against the real ~/.codex proving the short-circuit fires (status:ok scope:global exit 0).
- Relied on prior evidence (not re-run): n2's recorded four-chain-green for claude/gitlab/gitea heavy runs; n5's adversarial NOT-REFUTED (findings_blocking:0, 15+ staleness/foreign/schema scenarios). The four chains re-run at finalize (n8).

### Findings (9 areas)
1. No fail-OPEN regression — PASS. scopeIsFresh = s.exists && !scopeIsStale(s) at scripts/kaola-workflow-codex-preflight.js:680-682; load-bearing && s.exists. Short-circuit L447-466, AFTER template_missing (L414) + role_not_in_template (L432), BEFORE project inspectScope (L469). Only ADDS a PASS; removes no refusal.
2. No silent project-local fallback — PASS. Autofix still targets project-local (runInstaller(installerPath, projectRoot)); gate reads global, only ever writes project-local.
3. Installer --global — PASS. L8-18 GLOBAL ? os.homedir() : path.resolve(firstPositional||cwd()); os required L3; position-robust; composes with --with-fast/--with-full; positional form preserved.
4. Byte-identical sync groups — PASS. md5 identical preflight×4 + installer×3; validate-script-sync green.
5. Init scaffolding-only + locator KEPT — PASS. 3 SKILLs drop "$PWD" mandate → --global; keep contract-pinned find-path locators; --with-fast/--with-full flipped; command peers consistent.
6. Contract-validator locks — PASS, no false-positive. assertIncludes(<skill>,'install-codex-agent-profiles.js" --global') + forbid-regex /install-codex-agent-profiles\.js"?\s+"\$PWD"/; optional-override prose uses "… "$PWD"" (ellipsis), regex can't match. All 3 validators green.
7. Hermetic-HOME retrofit — PASS. Landed on testCodexPreflight266/Gitlab/Gitea (per-call env HOME/USERPROFILE empty temp). Also each test file sets top-level process.env.HOME=kwSandboxHome which seeds only .config/, never .codex → every {}-opts gate call (e.g. testCodexPreflight332 refusals) sees absent global scope and falls through even on a machine with a real ~/.codex. New testCodexPreflight571/Gitlab/Gitea defined AND invoked.
8. test-install-model-rendering.js — PASS. Now invokes installer positionally ([installer, cproj]); assertions reframed to "positional-form override"; internally consistent; green.
9. Scope discipline — PASS. All 20 files in-scope; no stray edits; no debug leftovers; comments reference #571.

### Non-blocking
- R1 (out-of-scope, follow-up): n7 docs (README/architecture/api/CHANGELOG/ADR D-571-01) not in this diff — owned by n7. No doc contract red. Confirm n7 runs before finalize.
- R2 (nit, resolved): per-test emptyHome* redundant with top-level kwSandboxHome but harmless; new global-PASS tests need their own HOME.

Verdict: APPROVE. Zero critical/high/blocking. Short-circuit only widens PASS to genuinely-fresh-global; fail-closed preserved across every typed refusal; sync groups byte-identical; locks correct. findings_blocking: 0.
