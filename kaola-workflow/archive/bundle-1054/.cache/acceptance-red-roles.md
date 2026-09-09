# #1054 mission 9 (role redesign) — acceptance suite record

Author: tdd-1054-roles (test custody only; no production code). Worktree:
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054`.

## Current live-tree state (latest measurement)

| Suite | Result |
|---|---|
| `scripts/test-issue-1054-role-redesign.js` | **202 passed, 0 failed** |
| `scripts/test-issue-1044-prompt-bundle.js` | **170 passed, 0 failed** |
| `scripts/test-issue-1044-runtime-adapters.js` | **65 passed, 0 failed** |
| `scripts/test-runtime-agent-architecture.js` | **812 passed, 0 failed** (see "A8 provenance-token rewrite" below) |
| `scripts/test-generate-routing-surfaces.js` | **480 assertions passed** |
| `scripts/test-grok-edition.js` | **705 assertions passed** (3-tree parity) |
| `scripts/test-cursor-edition.js` | **834 assertions passed** (3-tree parity) |
| `scripts/test-issue-1046-global-contract.js` | **141 passed** |
| `scripts/test-install-model-rendering.js` | blocked (see "Unrelated blocker" below); my AC-7 edit verified correct in isolation |
| `scripts/test-suite-registration.js` | **721 assertions passed** (new suite registered in both `test:kaola-workflow:claude` and `:claude:full`) |

`node scripts/test-issue-1054-role-redesign.js` was RE-RUN on the live tree per team-lead's
request and is fully green (202/202). The three gaps reported in my prior round (metric-optimizer
misroute to tdd-guide; security-reviewer/adversarial-verifier missing "orchestrator decides"
custody) were closed by the implementer between my rounds — my suite's own assertions did not
need further changes to recognize the fix (the concept-level regexes already matched the final
wording once it landed).

## RED baseline confirmation (6ae5374bbbec156b531d1c81b2f2671204b228ad)

Re-verified in an isolated `git worktree add <tmp> 6ae5374b` (removed after each check, never left
mounted). All of the following correctly RED on that commit with the CURRENT (final) assertion
shape:
- `test-issue-1054-role-redesign.js`: Groups A/B/C fail on the old long bodies (963×10-char and
  264×10-char shared blocks, numeric-threshold ritual, metric-optimizer's old tdd-guide misroute).
  Group F fails because claude/codex compact-recovery still embeds the dispatch/adapter block at
  baseline (the per-runtime split did not exist yet).
- `test-issue-1044-prompt-bundle.js`: B1/B2/B5/C1/C2 fail for the same per-runtime-split reason.
- `test-runtime-agent-architecture.js` A1049: fails because baseline's codex compact-recovery
  still carries tier-default text that the current (post-item-25) shape correctly expects absent.

## Group D/F/C wording-pin round (team-lead's first message this round)

Team-lead measured 177/17 on an EARLIER live-tree snapshot and characterized the 17 as wording
pins, not missing custody — correct diagnosis. By the time I re-ran, the tree had already moved
past several of those exact strings again (concurrent implementer work), but the underlying issue
was real: my Group D regexes were anchored to one exact phrasing per concept. Rewrote all of them
to concept-level co-occurrence instead of one literal sentence:
- tdd-guide: accept "do(es)? not write production code" (was "does not write" only).
- implementer: accept "acceptance mean" stem (was "acceptance meaning" exact) plus
  weaken/delete/reinterpret as alternates to the read-only phrasing.
- investigator/code-explorer/knowledge-lookup: accept both word orders ("only write" / "write
  only") and the "do(es)? not edit ... repository/product/tracked" phrasing.
- code-reviewer/security-reviewer/adversarial-verifier "orchestrator decides": split into two
  independent regex tests — `/orchestrator/i` present ANYWHERE in the body, and
  `/(decide|belongs?\s+to|consequence)/i` present ANYWHERE — rather than requiring both within one
  60-char window or one exact sentence. This is what let the check recognize "consequences belong
  to the orchestrator", "the orchestrator decides what to do with them", and "what follows from
  them belongs to the orchestrator" as the same concept without enumerating every phrasing.
- metric-optimizer (Group C): accept the hyphenated "fixed-destination" token within 80 chars of
  "implementer" (already correct) plus a negative check that it does NOT say the old "stays
  tdd-guide" framing. Confirmed both hold on the final body ("Fixed-destination work (make X true)
  belongs to the implementer, not to you.").

## Group F — rewritten to the per-runtime shape (both messages this round)

Team-lead's addendum confirmed the final production shape: `RECOVERY_FULL_DISPATCH_RUNTIMES =
['grok','cursor']` (exported from `scripts/generate-routing-surfaces.js`), and claude/codex
recovery renders now carry ZERO `KW-RUNTIME-DISPATCH-START/END` markers (not just empty content —
the markers themselves are stripped), only the one-sentence deferral note. Group F and
`test-issue-1044-prompt-bundle.js`'s B1/B2/B5/C1/C2 and `test-runtime-agent-architecture.js`'s
A1049 were all rewritten (in my prior round, before these three messages arrived) to assert
exactly this: marker + "Runtime adapter facts" + tier-default text present-and-exactly-once for
grok/cursor; marker absent and deferral-note present for claude/codex; codex Next/Finalize
(non-recovery) carriers still carry full tier text (unaffected). Re-verified against 6ae5374b
(RED — old skeleton had no per-runtime split) and the live tree (GREEN, all four files above).

C2 in `test-issue-1044-prompt-bundle.js` changed from "all 4 runtime renders must differ" to "the
full-dispatch pair (grok, cursor) differs from each other; the deferred pair (claude, codex) is
now byte-IDENTICAL (no runtime-specific content survives in the one-sentence deferral path); every
full-dispatch render differs from every deferred render" — a positive claim about the new shape,
not a relaxation of the old one.

## Scope note: validator ownership (RESOLVED)

Team lead confirmed: "No further edits to validators: tdd-1054-validators now owns them." I made
no further edits to any `validate-*-contracts.js` file after that instruction, and will not.

Before that instruction arrived, I had already applied the custody-extension edits from the FIRST
authorization (three messages earlier in this task) to:
- `scripts/validate-workflow-contracts.js` + its byte-identical `plugins/kaola-workflow` mirror
  (`smoke-integration`, `finding: id=` retired-literal pins → `assertConcept` on each role's
  current wording)
- `scripts/validate-kaola-workflow-contracts.js` + `plugins/kaola-workflow-gitlab` +
  `plugins/kaola-workflow-gitea` mirrors (same `finding: id=` / `verdict: pass` pins →
  `assertConcept`)

All four files pass in isolation (verified). I have NOT reverted these — they are correct and
already verified, and reverting working, verified evidence would itself be a destructive action
without a clear instruction to do so. Flagging explicitly for the team lead / the agent who now
owns these files: my edits are additive concept-checks replacing literal-string pins, scoped only
to the retired role-body ritual (`smoke-integration`, `finding: id=`, `verdict: pass`); nothing
else in those files was touched. If the other owner needs a clean slate, say so and I will not
touch them further.

## Files I own that changed this round

- `scripts/test-issue-1054-role-redesign.js` — Group D regex broadening (concept co-occurrence,
  not exact sentence); Group F rewritten to the per-runtime shape (measure
  `RECOVERY_FULL_DISPATCH_RUNTIMES` with a `['grok','cursor']` fallback for pre-#1054 baseline
  compatibility); Group C metric-optimizer check unchanged (already concept-level, correctly
  recognizes the final wording).
- `scripts/test-issue-1044-prompt-bundle.js` — B1/B2/B5/C1/C2 rewritten to the per-runtime shape.
- `scripts/test-runtime-agent-architecture.js` — A1049 split into operation-carrier (unchanged
  requirement) vs recovery-carrier (per-runtime requirement) checks; the retired #1050
  Beta-posterior/median-of-K pinning block (238 lines) removed in the prior round, with a
  redirect comment to this suite.
- `scripts/test-install-model-rendering.js` — AC-7 rewritten from the retired "dispatched
  surface/observation/never expanded/never acted on" literal wording (confirmed absent from all
  three reviewer bodies, not a paraphrase) to a per-role scope-anchor phrase (each role still names
  the ONE specific subject it examines, in its own current wording). Verified correct in isolation;
  full-file run currently blocked by an UNRELATED concurrent production change: `plugins/kaola-
  workflow/scripts/install-codex-agent-profiles.js` now `require('./kaola-workflow-adaptive-
  schema')` (an in-progress kernel-sourcing refactor, confirmed via its own diff), and this test's
  fixture helper (`fs.copyFileSync` at line 752/1105) only copies the one file into a temp plugin
  dir, not its new sibling dependency — `MODULE_NOT_FOUND` results. Not a role-body or
  compact-recovery issue; not mine to fix.
- `scripts/test-issue-1046-global-contract.js` — A1 regex widened to accept tdd-guide's new "own
  acceptance meaning" phrasing alongside the retired "custody of the test artifact" wording.
- `scripts/validate-workflow-contracts.js` + mirror, `scripts/validate-kaola-workflow-contracts.js`
  + gitlab/gitea mirrors — see "Scope note" above (kept as-is per team lead's later decision; no
  further edits since `tdd-1054-validators` took ownership).

## A8 provenance-token rewrite (follow-up, after mission-9 acceptance was first reconciled)

Team lead's source-classification work (`kaola-workflow/bundle-1054/.cache/source-classification.md`)
landed after my initial 810/0 measurement and retired the re-vendor/`local_overrides` concept along
with the ECC re-vendor relationship itself: `templates/agents/provenance.json` moved to
`schema_version: 2` (every role `source_kind: kaola_authored`; six roles keep a `history` record
instead of `local_overrides`), and `docs/agents-source.md` replaced its old re-vendor-checklist
prose with "Source classification" and "Historical origin" sections. That regenerated
`test-runtime-agent-architecture.js`'s A8 durable-provenance-doc token list RED (`'Local Overrides'`
no longer appears anywhere in `docs/agents-source.md` — confirmed via `grep`, not a paraphrase).

Fix (TEST-AUTHOR EDIT, not implementer; `scripts/test-runtime-agent-architecture.js` line ~1129):
removed the `'Local Overrides'` token; added `'kaola_authored'`, `'Historical origin'`, and
`'Source classification'` — the exact three tokens the team lead named, each verified present
verbatim in the current `docs/agents-source.md` before adding them (not invented). The five
historical-origin facts (`'Repository:'`, `'Pinned commit:'`, `'Upstream blob SHA'`, `'License:'`,
`'Copyright:'`), the six role names, and the A8 prompt-bytes provenance-narration ban
(`provenancePattern`, unchanged) all stay as they were — only the retired-concept token was
replaced, net +2 tokens (1 removed, 3 added) → 812 assertions instead of 810.
Ran `node scripts/test-runtime-agent-architecture.js`: **812 passed, 0 failed.**

## test-agent-model-resolver.js `unknownRoleCheckAcceptsHeavy` repoint (follow-up)

Item 29 (#1054) moved `validateProfileText` and the `CODEX_PINNED_*` constants — including the
unknown-role / `'no Codex profile-tier policy'` check — into the one forge-neutral authoring
source, `scripts/kaola-workflow-adaptive-schema.js` (4 byte-identical kernel copies).
`scripts/kaola-workflow-codex-preflight.js` and
`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` now `require()` those constants
from the kernel instead of each declaring/checking their own copy. Measured before editing: the
kernel contains `'no Codex profile-tier policy'` exactly once (near `CODEX_PINNED_HEAVY_ROLES`,
confirmed via `grep -n`) and exports `CODEX_PINNED_HEAVY_ROLES`; neither preflight nor the
installer declares a local `const CODEX_PINNED_HEAVY_ROLES =` or carries its own copy of the check
text; both destructure `CODEX_PINNED_HEAVY_ROLES` from `require('./kaola-workflow-adaptive-schema')`.

Fix (TEST-AUTHOR EDIT, not implementer; `scripts/test-agent-model-resolver.js` ~lines 110-122):
replaced `unknownRoleCheckAcceptsHeavy(src, label)` (which asserted the check text's PRESENCE in
each consumer file) with two probes:
- one assertion block against the kernel source: the check text is present exactly once (both an
  `indexOf` and a second `indexOf` from `idx + 1` returning `-1`, so a reintroduced duplicate
  would also be caught) and co-occurs with `CODEX_PINNED_HEAVY_ROLES` within the same window as
  before, plus a `module.exports` check that the kernel actually exports the constant;
- `unknownRoleCheckSourcedFromKernel(src, label)` per consumer file: asserts NO local
  `const CODEX_PINNED_HEAVY_ROLES =` declaration, NO local copy of the check text, and a
  `require(...kaola-workflow-adaptive-schema...)` that also destructures
  `CODEX_PINNED_HEAVY_ROLES` — the observable the team lead named.

Self-tested the new regex against three mutants before trusting it (no real `require()`, a local
redeclare, and a locally-carried check-text string) — all three correctly threw — and confirmed the
real `kaola-workflow-codex-preflight.js` source passes it, before running the full suite. Kept the
require()-based `CODEX_PINNED_HEAVY_ROLES` roster-equality assertions (lines ~100-109) and the
INSTALL-INVARIANT frontmatter-equality loop unchanged, per instruction.

Ran `node scripts/test-agent-model-resolver.js`: **passed** (this suite reports pass/fail by exit
code and a final `console.log`, not a numeric assertion count — exit 0, "Agent model resolver
tests passed").

## Owner ruling (19:03 heartbeat) — deleted wording-pin assertions

Binding ruling: a positive gate on current role wording — including concept co-occurrence and
widened regexes — is still a wording pin (an equivalent rephrasing reds it), and no synonym parser
or new keyword gate may replace it. Role-body meaning is protected by generation integrity
(`generate-agent-profiles --check`, `validate-vendored-agents`, hashes) and by native behavior
acceptance (mission 14), not by prose gates in these suites. Applied by deleting every remaining
positive-wording assertion I had added or widened; kept every negative guard (banning a named
retired literal) and every structural/metadata check.

| File | Assertion(s) removed | Reason |
|---|---|---|
| `scripts/test-issue-1054-role-redesign.js` | Group C `routesToImplementer` (`'C/source: metric-optimizer routes fixed-destination / non-metric work to implementer'`) | Positive wording pin — an equivalent rephrasing that never uses the word "implementer" would still correctly close the misrouting defect. Kept the negative twin (`misroutesToTddGuide === false`, source + render) unchanged: that is a real defect-shape claim, not a phrasing pin. |
| `scripts/test-issue-1054-role-redesign.js` | Entire Group D: `CUSTODY_ANCHORS` (5 roles: tdd-guide, implementer, investigator, code-explorer, knowledge-lookup) + the 3-role `orchestrator-decides` loop | All 8 were positive concept-co-occurrence pins on custody wording — exactly the class the ruling names. Deleted with a one-line pointer to generation integrity / mission 14 as the real protection. |
| `scripts/test-install-model-rendering.js` | `#1018 AC-7` in full (`scopeAnchor` per-role phrase check) | After the prior round's revision, AC-7's only remaining content was a positive per-role wording-phrase check (no structural meaning survived removing the original "dispatched surface" ban-list). Deleted outright per the ruling's "delete AC-7 with a reason" instruction rather than keep a synonym-widened version. |
| `scripts/test-issue-1046-global-contract.js` | A1 `'role contracts keep independent test custody'` | Purely a phrase-presence check across three known wordings; no other meaning once the phrasing list is removed. Deleted; the other A1 assertions in the same block (Next.md custody-of-meaning, failure-frontier, dispatch/Next carrier, "implementer may not delete, weaken, or reinterpret") are untouched — they were not mine and are not role-contract wording pins. |

Net assertion-count changes: `test-issue-1054-role-redesign.js` 202 → **193** (−9: 1 Group-C
positive + 8 Group-D); `test-install-model-rendering.js` AC-7 fully removed (count unmeasurable —
see "Still blocked" below); `test-issue-1046-global-contract.js` 141 → **140** (−1).

Re-verified RED on an isolated `6ae5374b` worktree after the deletions (removed after): Groups A,
B, C(negative-only), and F on `test-issue-1054-role-redesign.js` still fail correctly at baseline
(129 passed, 64 failed there — the drop from the prior 138/64 split reflects the 9 deleted
assertions, none of which had contributed to a RED count since Groups A/B/C/F were always where
the real RED signal lived).

Validators: not touched (per instruction — `tdd-1054-validators` owns and is removing the same
class there).

## Final counts (this round)

- `scripts/test-issue-1054-role-redesign.js`: **193 passed, 0 failed** (live tree)
- `scripts/test-install-model-rendering.js`: still blocked before reaching any role-body assertion
  by the unrelated in-flight kernel-require gap (`plugins/kaola-workflow/scripts/install-codex-
  agent-profiles.js` → `require('./kaola-workflow-adaptive-schema')`, whose sibling file a test
  fixture helper does not copy into its temp plugin dir — `MODULE_NOT_FOUND`). Not a role-body or
  recovery-dedupe issue; reporting separately as instructed, not fixing (outside this suite's
  custody file and outside my assigned scope).
- `scripts/test-issue-1046-global-contract.js`: **140 passed** (live tree)
- `scripts/test-suite-registration.js`: **721 passed** (live tree; both npm chains still carry the
  new suite)

## test-install-model-rendering.js: stale mutation-fixture substrings (follow-up)

The kernel-require fixture gap (`install-codex-agent-profiles.js` → `require('./kaola-workflow-
adaptive-schema')`) was fixed upstream by impl-1054-constants, so the suite now runs past it and
reached real assertions — which then failed on FOUR mutation fixtures whose `.replace()` search
strings were literal substrings of the PRE-#1054 role bodies, now retired:

| Line(s) (before fix) | Old search string (no longer exists) | New anchor (measured, currently present) | Why the mutation needs it |
|---|---|---|---|
| ~1369 | `description = "Precision-first code review specialist` | `description = "Code reviewer. Independently examines` | "description metadata drift" — must change config bytes at the description field |
| ~2836 | `Precision-first code review specialist` | `Code reviewer. Independently examines` | "resolved profile hash mismatch" — needs any byte-level description change |
| ~3033 | `Precision-first code review specialist` | `Code reviewer. Independently examines` | repository-drift fixture — profile must differ from the generated one |
| ~3558 | `Precision-first code review specialist` | `Code reviewer. Independently examines` | installed-project-drift fixture — same |
| ~2919 | `## Prompt defense` (code-reviewer body heading) | `# Code Reviewer` (code-reviewer body heading) | "invalid TOML escape inside reviewer instructions" — needs the injected `\q` to actually land in the TOML body |
| ~2942 | `## Prompt defense` | `# Code Reviewer` | "bare carriage return inside reviewer instructions" — same |
| ~2967-2969 | `## Your Role` (implementer body heading) | `# Implementer` (implementer body heading) | the two "ordinary managed role closed-schema mutation" TOML-escape/carriage-return fixtures for `implementer.toml` |

All were the same root cause: the mutation fixtures searched for exact substrings of the
pre-#1054, ECC-derived bodies (old headings `## Prompt defense` / `## Your Role`, old description
prefix `Precision-first code review specialist`). Since none of those substrings exist in the
rewritten bodies, every `String.prototype.replace()` call was a silent byte-identical no-op, so
the "mutated" fixture was actually the unmutated original — the validator correctly found nothing
wrong with it, and the assertion expecting a failure reason failed instead.

Fix (TEST-AUTHOR EDIT, not implementer): repointed each `.replace()` at a short, stable substring
that is actually present in the live render (measured via `grep` against
`plugins/kaola-workflow/agents/code-reviewer.toml` and `.../implementer.toml` before editing each
one), keeping every fixture's assertion meaning (a mutated description/instructions must change
config bytes and be detected by `validateProfileText`) unchanged — no whole-sentence pin, per
instruction.

`node scripts/test-install-model-rendering.js`: **exit 0, "Install model rendering tests passed"**
(this suite reports pass/fail by exit code + a final message, not a numeric assertion count).
Re-ran `test-issue-1054-role-redesign.js` (193 passed) and `test-suite-registration.js` (721
passed) after these edits to confirm no cross-file regression.

## RED/GREEN evidence commands used

```
git worktree add /private/tmp/claude-501/kw-1054-red-<n> 6ae5374b   # isolated, removed after
cp scripts/test-issue-1054-role-redesign.js <tmp>/scripts/
cp scripts/test-issue-1044-prompt-bundle.js <tmp>/scripts/
node <tmp>/scripts/test-issue-1054-role-redesign.js    # RED
node <tmp>/scripts/test-issue-1044-prompt-bundle.js    # RED
git worktree remove /private/tmp/claude-501/kw-1054-red-<n> --force
node scripts/test-issue-1054-role-redesign.js          # live tree, GREEN (193/193 after owner ruling)
```
