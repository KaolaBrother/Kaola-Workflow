evidence-binding: n4-docs ace34bdc161e
upstream_read: n3-review 0c046b9156ca
upstream_read: n1-release-gate 52926cd3cc6d
upstream_read: n1-release-gate af77ad8fe2fc
upstream_read: n3-review ff3b324f4ae8
docs_updated: docs/conventions.md (Release section: pre-tag `--release-check` gate wiring + working sequence + release-commit hygiene rule + `--cut` interplay note; repair: extended the typed-refusal enumeration to the 7-slot family with coverage/repo_kind_undetermined/chains_incomplete), docs/api.md (new `--release-check` subsection beside `--finalize-check`; repair: added the coverage requirement bullet, the two new precedence tiers, and `missingChains`/`expectedChains` refuse-envelope fields), docs/decisions/D-651-01.md (new decision record; repair: updated Decision points 2+6, the Consequences bullet, and the validated-cases paragraph in place, plus appended an "Addendum (R2 repair window)" section), README.md (Official release checklist: inserted release-check step, renumbered; repair: widened the inline refusal-mode comment to name incomplete/unresolvable-chain-set receipts)

## REPAIR WINDOW (nonce rotated 52926cd3cc6d/0c046b9156ca -> ace34bdc161e): N3-1 fix

Team-lead repair dispatch, following adversarial refutation of the bundle and n1's R1+R2 repair
(new nonce `af77ad8fe2fc`) and n3's re-review (new nonce `ff3b324f4ae8`, finding N3-1). Read both
upstream evidence files fresh via `cat -n` (not the Read tool's stale-cache path — see note below)
before writing.

**Finding N3-1 (severity low, action fix, status was open):** the R2 repair added a coverage arm
to `releaseCheck()` — a new typed reason `chains_incomplete` (receipt does not cover every
`test:kaola-workflow:*` chain `package.json` declares) and a new call site for the reused reason
`repo_kind_undetermined` (the expected chain set itself is unresolvable) — inserted into the
precedence order between `chains_empty` and `chains_red`. All three doc surfaces I wrote in my
original window still documented the pre-repair 5-slot family (`chains_unverified > chains_stale
> chains_empty > chains_red > chains_waived`) as exhaustive, and the pass/refuse-envelope
documentation omitted the new `missingChains`/`expectedChains` structural fields. n3 named exact
locations: docs/api.md:544-551, docs/conventions.md:386-390, docs/decisions/D-651-01.md:39-41 +
:89-90.

**Ground-truth verification before writing (never trusted n1's prose alone):** read
`releaseCheck()` directly at `scripts/kaola-workflow-plan-validator.js:2442-2526` end to end,
confirming: the coverage arm at :2489-2508 resolves `expectedChains` from `package.json`'s
`scripts['test:kaola-workflow:'+n]` membership (exact filter expression quoted verbatim in my
docs edits); `repo_kind_undetermined` fires at :2500-2503 when `expectedChains` is null or empty
(unresolvable/unreadable/unparseable `package.json`, or zero declared chains); `chains_incomplete`
fires at :2506-2508 with `missingChains`/`expectedChains` as top-level payload keys (not nested)
plus a registry `operator_hint`; the coverage arm runs strictly AFTER the `chains_empty` check
(:2484-2488) and strictly BEFORE the `chains_red` check (:2510-2516), confirming the precedence
placement `chains_unverified > chains_stale > chains_empty > repo_kind_undetermined >
chains_incomplete > chains_red > chains_waived` exactly as n1 and n3 both state. Also cross-checked
the updated usage block (`printHelp()` around line 2571-2577) and the `OPERATOR_HINT_REGISTRY`
entries for both reasons (`chains_incomplete` at line 105, `repo_kind_undetermined` at line 110) —
every field name and precedence slot in my doc edits is copied from this direct read, not from
paraphrase.

**Tooling note:** the Read tool's first invocation on `kaola-workflow/bundle-651-652/.cache/n1-release-gate.md`
this window returned "Wasted call — file unchanged since your last Read" (comparing against my
very first read of that file at the start of the original window) even though the file had in
fact been completely rewritten by n1's repair (new nonce, 53 lines vs the original 48, entirely
different content). Caught this by cross-checking with `cat -n` via Bash, which showed the real
repaired content. Used the Bash-verified content throughout; flagging in case this Read-tool
staleness detection is a real caching gap for any other node reading a file across a repair
boundary.

## Fixes applied (per finding N3-1, all four target files)

1. **docs/api.md (~544-565).** Added a new "Coverage requirement" bullet naming the exact
   `expectedChains` filter expression and its producer/gate-agreement rationale. Rewrote the
   "Typed refusal precedence" bullet to the 7-slot family, inserting `repo_kind_undetermined` and
   `chains_incomplete` in their verified precedence slots with accurate one-clause descriptions
   (fail-closed rationale for `repo_kind_undetermined`; subset rationale for `chains_incomplete`),
   and added the sentence "Coverage is checked BEFORE greenness...". Extended the "Refuse
   envelope" bullet with `missingChains: string[]` + `expectedChains: string[]` on
   `chains_incomplete` (quoting the exact example payload for a claude-only receipt) and an
   explicit note that `repo_kind_undetermined` carries no extra structural fields.
2. **docs/conventions.md (~376-391, § Release lead bullet).** Extended the self-owned-reads
   clause to name `package.json` as a third read source. Changed "receipt whose `headSha`" to
   "receipt COVERING every declared chain, whose `headSha`". Widened "A red, missing, stale, or
   waived receipt is a typed refusal" to "A red, missing, stale, incomplete, waived, or
   unresolvable-chain-set receipt is a typed refusal". Inserted `repo_kind_undetermined` and
   `chains_incomplete` into the precedence enumeration in their verified slots, with the
   `missingChains`/`expectedChains` structural-field callout on `chains_incomplete`. Left the
   "Working sequence" bullet, the two pre-existing tag bullets, the hygiene bullet, and the
   "Release cutting" / `--cut` interplay section byte-unchanged — none of those described the
   precedence family, so none were stale.
3. **docs/decisions/D-651-01.md.** In-place fixes (not just an addendum, since an ADR's Decision
   section should state the current design, not a superseded one) plus an appended addendum, per
   the dispatch's explicit allowance that "adversarial-refutation provenance is fine in an ADR":
   - Decision point 2: rewrote the precedence list to the 7-slot family and changed "10 new
     cases" to "13 cases", with a forward pointer to the Addendum.
   - Decision point 6: softened "the one new reason code" to "the base window's one new reason
     code" and added a sentence naming `chains_incomplete` as the R2 repair's second new reason,
     pointing to the Addendum.
   - Consequences bullet: "one new `reason` value (`chains_waived`)" -> "two new `reason` values
     (`chains_waived` in the base window, `chains_incomplete` in the R2 repair — see Addendum)".
   - The "Validated with 10 new... cases" paragraph: scoped explicitly to "in the base window"
     and appended a sentence naming cases (11)-(13) and the new 13-case total, pointing to the
     Addendum, rather than silently inflating the historical "10" (which was true of that window)
     to a number that would misrepresent when each case was added.
   - Appended a new "## Addendum (R2 repair window, 2026-07-10): coverage-before-greenness arm"
     section at the end of the file (after "## Alternatives considered") covering: the
     adversarial finding (a subset receipt passing), the fix (coverage arm placement, the
     `expectedChains` filter expression, `chains_incomplete`'s structural fields,
     `repo_kind_undetermined`'s fail-closed rationale and its deliberate strictness vs
     `--finalize-check`'s consumer-mode downgrade), the RED-first validation (cases 11-13 plus
     the re-verified pre-existing case 8 locking `chains_empty` above the new arm), the 13-case
     total, the re-sync + four-chain re-green, and a one-sentence pointer to the companion R1
     hermeticity fix (out of scope for this ADR's title, correctly not detailed further here).
4. **README.md.** The "Official release checklist" code-comment line "A red, missing, stale, or
   waived receipt is a typed refusal" was exactly the kind of stale five-mode enumeration N3-1
   flagged (even though n3's finding named only the other three files by line number, this
   comment makes the identical claim and would mislead an operator the same way) — widened to "A
   red, missing, stale, incomplete (missing an edition chain), waived, or unresolvable-chain-set
   receipt is a typed refusal". The numbered step list, the `KAOLA_WORKFLOW_OFFLINE=1
   node scripts/kaola-workflow-run-chains.js` invocation (still correct — no `--chains` flag, so
   it stamps full coverage), and the docs/conventions.md cross-reference sentence were otherwise
   unaffected and left unchanged.

## Validation

`node scripts/validate-workflow-contracts.js` → `Workflow contract validation passed`, exit 0
(re-run after the repair-window edits).

`git status --short` after all edits: my four declared files show exactly as expected —
`README.md`, `docs/api.md`, `docs/conventions.md` modified; `docs/decisions/D-651-01.md`
untracked (new). Every other modified/untracked path belongs to n1's repair (canonical
`scripts/kaola-workflow-plan-validator.js` + its 3 generated edition copies,
`scripts/simulate-workflow-walkthrough.js`, the two forge-helpers test suites, n1's own evidence
file) or pre-existing scheduler/project-state churn under `kaola-workflow/bundle-651-652/.cache/**`,
`workflow-plan.md`, `workflow-state.md`, `workflow-tasks.json` — none of it mine.

## Scope discipline (unchanged from original window)

- Did not touch `CHANGELOG.md` (finalize sink's file) — n3's non-blocking observation about a
  missing `[Unreleased]` entry for #651/#652 is noted here for the finalize node's awareness, not
  acted on by this node.
- Did not touch any file under `agents/`, `commands/`, `skills/`, `plugins/`, or any script.
- No CI/CD mention anywhere in the edited prose.
- Did not modify `scripts/kaola-workflow-release.js` or any generated/plugin file — this remains a
  docs-only node; the repair's code changes (coverage arm, hermeticity fix) are n1's, reviewed by
  n3, not touched here.
