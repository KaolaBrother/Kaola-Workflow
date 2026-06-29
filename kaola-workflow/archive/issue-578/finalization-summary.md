# Finalization - Summary: issue-578

## Delivered
A set-equality hardening guard for the opencode edition: `sync-opencode-edition.js --check` now
asserts the set of `*.js` files in `templates/opencode/plugins/` (`CANON_PLUGINS_DIR`) equals the
`PLUGIN_SCRIPTS` allowlist, so the `install-opencode.sh` plugin glob and the sync allowlist can never
silently diverge when a future second plugin is added. The installer glob is deliberately left
untouched (the issue's chosen second option). A RED-first `A11-allowlist` test proves the guard fires.
Documented in `docs/opencode-edition.md`, decision record `docs/decisions/D-578-01.md`, CHANGELOG.

## Files Changed
- `scripts/sync-opencode-edition.js` — `runCheck()` set-equality guard (unregistered-on-disk direction)
- `scripts/test-opencode-edition.js` — RED-first `A11-allowlist` assertion (clean-state + guard-fires)
- `docs/opencode-edition.md` — Hooks "Plugin allowlist guard" + Verification A11-allowlist line
- `docs/decisions/D-578-01.md` — new ADR (created)
- `CHANGELOG.md` — `[Unreleased] ### Added` #578 entry

## Test Coverage
No coverage tool in this repo (Node scripts). The verifiable gate is the opencode suite
`node scripts/test-opencode-edition.js` — 499 assertions, exit 0 (was 496; +3 from `A11-allowlist`),
a genuine RED→GREEN cycle.

## Final Validation Evidence
- **opencode suite** (the real gate for this opencode-only diff): `node scripts/test-opencode-edition.js`
  → 499 assertions, exit 0. RED-first proof captured in `.cache/n1-allowlist-guard.md`; independently
  re-run + adversarial probe by the n3 opus code-reviewer gate (`.cache/n3-review.md`, `verdict: pass`,
  `findings_blocking: 0`).
- **Four-chain receipt** (self-host finalize gate): `.cache/chain-receipt.json` — claude/codex/gitlab/gitea
  all exit 0, `codeTreeHash ac3d366f…`, HEAD-bound. (opencode is additive D-530-02 → no #307 obligation;
  the four chains do not exercise opencode but confirm no edition regression.)
- **Adaptive barrier**: `--resume-check` / `--gate-verify` / `--barrier-check` / `--verdict-check` all
  exit 0.
- Validation reuse: the four-chain + opencode-suite runs cover code/test impact through node n4; the
  finalize-node CHANGELOG edit and the docs-only ADR Trivial Inline Edit are outside the code/test
  rerun trigger (the opencode suite does not consume CHANGELOG or the ADR — confirmed by n3 Axis 4).

## Documentation Docking
DOCKED — evidence `.cache/doc-docking.md`.

## Trivial Inline Edit Exception
One docs-only edit, post-node-close: corrected the ADR (`docs/decisions/D-578-01.md`) test-shape
narrative to describe the real `A11-allowlist` assertions (clean-state set-equality in (a); probe
removed in a `finally` for cleanup — no post-removal `--check` pass re-run). One paragraph, no
behavior/API/design judgment, inside n2's declared write set (so within the whole-plan barrier
allowlist). The opencode suite does not read the ADR, so no revalidation was required.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
None. The n3 reviewer's single LOW note (ADR narrative) was fixed inline via the Trivial Inline Edit
Exception (not deferred). No CRITICAL/HIGH/MEDIUM findings.

## Run gaps
None — gap sweep clean (`.cache/run-gaps.json` `sweptClasses: []`): no in-run repair/reopen, no
deferred/waived red chain, no flake. The one reviewer LOW note was resolved inline, not deferred.

## Closure Decision
None needed — no deferred items, unresolved conflicts, partial implementation, open review follow-ups,
or user-decision items across the plan artifacts. Acceptance criteria met; safe to close #578.

## Commit And Push
Pending final Git gate (contractor `chore: finalize issue-578`, then merge sink). Final hash reported
after push.

## GitHub Issue
#578 — to be closed by the merge sink (acceptance criteria met).

## Roadmap
No `.roadmap/issue-578.md` source existed (#578 was filed post-#577-close and never mirrored into the
local roadmap), so closure has no source to remove and `ROADMAP.md` regen is a no-op for #578.

## Archive
Pending — performed atomically by `cmdFinalize` (contractor Step 8b).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/n2-docs.md (node n2 doc-updater) | |
| documentation docking | invoked | .cache/doc-docking.md | |
| code-reviewer gate (n3) | invoked | .cache/n3-review.md (verdict: pass, findings_blocking: 0) | |
| final-validation fix executors | N/A | | no validation failures |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (no-op for #578; no source) | |
| archive completed folder | pending | | contractor Step 8b |
| final commit and push | ready | git status/receipt/upstream | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
