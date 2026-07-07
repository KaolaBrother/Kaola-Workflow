evidence-binding: n2-manifest b44fff944759

## #637 fix: fn-closure-audit vacuous-guard closed

**Bug:** `templates/routing/required-blocks.js` block `fn-closure-audit` had
`content_tokens: ['<!-- PIN: closure-audit -->', 'closure-audit']` — the 2nd
token ('closure-audit') is a bare SUBSTRING of the 1st token (the marker
itself), so a mutation that guts the block's interior prose while surgically
keeping the bare `<!-- PIN: closure-audit -->` marker trivially satisfies
both tokens and stays vacuous-green.

**Distinctive token chosen:** `sink_incomplete` (the spec's proposed token) —
verified myself before wiring it in (not taken on faith). Grep-proof it is
present (norm-normalized substring match, not just a raw grep hit) on ALL SIX
finalize surfaces at HEAD, and specifically that it is NOT a substring of the
`<!-- PIN: closure-audit -->` marker (so it cannot reproduce the same bug):

```
$ grep -c "PIN: closure-audit" / "sink_incomplete" per surface:
commands/kaola-workflow-finalize.md                                  1 / 3
plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md     1 / 3
plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md      1 / 3
plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md        1 / 3
plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md 1 / 3
plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md  1 / 3
```
All 6 surfaces carry both the marker (1x) and `sink_incomplete` (3x, from the
"transactional catch (n1's `sink_incomplete` emit)" prose that already ships
under the closure-audit section). Edition-neutral: no CLI-binary / forge-brand
token. No substitution needed — the spec's chosen token checks out on all 6.

**RED test first (`scripts/test-route-reachability.js`), modeled on the
existing 6-case RED-PROOF battery (item 7, "CLOSURE-AUDIT VACUOUS-GUARD
(#637)")**: imports the LIVE `fn-closure-audit` block straight from
`REQUIRED_BLOCKS` (not a synthetic stand-in), derives its real obligated
6-surface set via `deriveObligated`, builds an in-memory fixture where every
obligated surface's content is gutted to JUST the bare
`<!-- PIN: closure-audit -->` marker (interior prose removed, marker kept),
runs `checkManifest` against that fixture, and asserts `failures.length > 0`.

- **Stayed-green-before transition (confirmed via an actual run before the
  fix landed):** ran `node scripts/test-route-reachability.js` with the test
  added but `required-blocks.js` still at the buggy 2-token definition.
  Result: `FAIL: RED-PROOF closure-audit-vacuous-guard: ... — 1 failure(s),
  282 passed.` exit 1. This is the RED: the new assertion itself fails
  because the checker stayed vacuous-green on the planted gut (the 2nd token
  'closure-audit' matched trivially as a substring of the still-present
  marker) — proving the bug is real, not hypothetical.
- **Reds-after transition (confirmed via an actual run after the fix
  landed):** added `sink_incomplete` as a 3rd content_token to
  `fn-closure-audit`. Re-ran the identical script (no test-file change needed
  — `REQUIRED_BLOCKS` is read live). Result: `Route-reachability test passed
  (283 assertions).` exit 0 — the same gut-plant fixture now correctly REDS
  inside `checkManifest` (missing-token: 'sink_incomplete' absent from the
  gutted content), which is exactly what makes the outer assertion (`r.failures
  .length > 0`) — and therefore the whole suite — pass.

RED: RED-PROOF closure-audit-vacuous-guard (pre-fix run) — AssertionError:
expected `checkManifest(...).failures.length > 0` on a marker-preserving
interior-gutted fixture, got 0 failures (vacuous-green) — script exited 1,
1 failure / 282 passed.
GREEN: RED-PROOF closure-audit-vacuous-guard passes post-fix; 283/283
route-reachability assertions green (up from 282, the new case now included
and passing).

**Verification exit codes (all green, no other manifest block or file
touched):**
- `node scripts/test-route-reachability.js` → exit 0, "Route-reachability
  test passed (283 assertions)."
- `node scripts/validate-workflow-contracts.js` → exit 0, "Workflow contract
  validation passed"
- `node scripts/validate-kaola-workflow-contracts.js` → exit 0,
  "Kaola-Workflow Codex contract validation passed"
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
  → exit 0, "Kaola-Workflow GitLab contract validation passed"
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
  → exit 0, "Kaola-Workflow Gitea contract validation passed"
- `node scripts/generate-routing-surfaces.js --check` → exit 0, "all 12
  surfaces byte-match the skeleton."
- `node scripts/validate-script-sync.js` → exit 0, "OK: 24 common scripts,
  25 byte-identical groups, 8 rename-normalized families, 1 config/hooks.json
  family, and 7 forge export-superset families in sync." (untouched by this
  fix — confirms zero incidental drift.)

**Write set discipline:** `git status --porcelain` in this leg shows exactly
the 2 declared files modified (`scripts/test-route-reachability.js`,
`templates/routing/required-blocks.js`), no other file touched.
