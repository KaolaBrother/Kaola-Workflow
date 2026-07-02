evidence-binding: n2-docs f7030dba2b4b

## Files touched (exactly the frozen write set — nothing else)

1. `CHANGELOG.md` — added one `### Fixed` bullet under `[Unreleased]` for
   issue #592, following the existing entry style (bold one-line summary +
   issue ref, then the full narrative: bug mechanism, live observation on
   bundle-587-589, exact gate/loop-bound change, `receipt.closed_issues`
   success-path recording, cross-edition scope, RED-first test files/counts,
   and a link to the new decision record). Inserted as the newest (first)
   entry in `### Fixed`, matching the file's most-recent-first convention.

2. `docs/decisions/D-592-01.md` — new decision record, structured to match
   `D-580-01.md`/`D-578-01.md` (title / Date / Status / Issue / ## Context /
   ## Decision / ## Alternatives considered / ## Consequences). Records
   option (a) — widen the closure gate to
   `!OFFLINE && (args.issue != null || issueNumbers.length > 0)`, keep the
   primary close conditional on `args.issue != null`, widen the bundle-member
   loop bound to `> (args.issue != null ? 1 : 0)`, and record
   `receipt.closed_issues` on the success path too for verify-then-retry
   resume. Documents two rejected alternatives: (1) refusing
   `--issue-numbers` without `--issue` at the CLI level (would reject a
   currently-legal invocation shape instead of fixing it, and does nothing
   for the receipt gap), and (2) leaving the loop-skip but gating
   `stepDone('closure')` on whether a primary was supplied (converts a
   silent miss into a perpetual not-done state for a legal invocation shape
   — worse than the bug). Verified the fix is present in all four sink-merge
   editions (`scripts/kaola-workflow-sink-merge.js`, the codex twin under
   `plugins/kaola-workflow/scripts/`, and both
   `plugins/kaola-workflow-{gitlab,gitea}/scripts/` ports) via `git diff` and
   direct `grep` before writing the record.

3. `docs/api.md` — updated the § Closure Contract section (under
   `### \`sink_incomplete\` refuse envelope (issue #497)`, which documents the
   `step: "closure"` shape). Added a new paragraph "Closure gate covers the
   no-primary bundle shape (issue #592)" stating the exact widened gate
   condition and the prior silent-skip behavior, and a new bullet to the
   existing sink-receipt field list documenting `closed_issues` now being
   written on both the success and failure paths (previously failure-only).
   Read the surrounding `## Closure Contract` section first (incl. the
   generic "Closure receipt schema" / bundle `closed_issues` example higher
   up, which is a DIFFERENT receipt object — `buildClosureReceipt()`'s
   `closure_receipt`, not the `.cache/sink-receipt.json` transaction receipt
   this fix touches) to avoid conflating the two and editing the wrong one;
   confirmed via reading `runSinkTransaction`/`loadOrInitReceipt` in
   `scripts/kaola-workflow-sink-merge.js` that `receipt.closed_issues` in the
   diff is the sink-receipt object.

4. `docs/workflow-state-contract.md` — added a new bullet to the existing
   "Sink-receipt schema extensions (#517, #518)" list (same indentation/style
   as the adjacent `branch_head` and `remote_issue_closed` bullets),
   documenting the `closed_issues` field's new success-path recording and the
   widened closure gate, with a cross-reference to `docs/api.md` § Closure
   Contract for the full JSON shape.

## Write-set confirmation

Only `CHANGELOG.md`, `docs/decisions/D-592-01.md`, `docs/api.md`, and
`docs/workflow-state-contract.md` were created/edited by this node — verified
with `git status --porcelain` before finishing: the only other modified paths
in the tree are n1-fix's script/test files (`scripts/kaola-workflow-sink-merge.js`,
the codex/gitlab/gitea twins, `scripts/test-bundle-finalize.js`,
`plugins/kaola-workflow-{gitlab,gitea}/scripts/test-*-sinks.js`), none of
which this node touched. No script, test, or agent-facing prompt surface was
modified. Provenance (`#592`, `D-592-01`) appears only in `CHANGELOG.md` and
`docs/decisions/D-592-01.md`; `docs/api.md` and
`docs/workflow-state-contract.md` use `(issue #592)` parenthetical refs
consistent with the existing convention already used throughout both files
(e.g. `(issue #497)`, `(issue #517, #518)`, `(#369)`) — no new provenance
style was introduced.
