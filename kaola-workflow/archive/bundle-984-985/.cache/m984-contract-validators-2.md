# m984: second stale contract-validator pin (docs/workflow-state-contract.md)

Follow-up to `m984-contract-validators.md`. Scope this dispatch: canonical `scripts/validate-workflow-contracts.js`
plus its byte-identical mirror `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`. Verified
(did not assume) that `scripts/validate-kaola-workflow-contracts.js` defers this specific concept
check to canonical rather than duplicating it — confirmed both by its comment (now itself corrected,
see below) and by running it, which passed without any edit needed to its own assertion logic.
Nothing else touched — `docs/workflow-state-contract.md` was not re-added to, per instruction.
Nothing committed. Report written to the **main root's** project folder, as instructed — not the
worktree-local path (that duplicate no longer exists; see the run note at the top of `mission-list.md`
for why writing there was wrong to begin with).

## Why the first pass could not have caught this

The first dispatch's candidate list (`roadmap_source_removed`, `roadmap_regenerated`, etc.) came from
retired **closure-receipt fields** — a specific, enumerable set from slices 2-4 of the original
retirement work. This second stale pin is a **doc-prose concept check** against a different target
file (`docs/workflow-state-contract.md`, not `docs/api.md`) checking for the literal phrase
`kaola-workflow/.roadmap/issue-*.md` and the word `generated mirrors` — neither of which is a
field name, so neither was on that list or had any reason to be. Nothing connected the two checks;
a concept-token guard is only as complete as whatever list its fixer happened to be working from, and
this is a second, independent instance of that same shape in one run.

## What was found and fixed

`scripts/validate-workflow-contracts.js:372-378` (before):

```js
assertConcept('docs/workflow-state-contract.md', 'durable sources and generated mirrors', [
  'durable sources',
  'kaola-workflow/.roadmap/issue-*.md',
  'workflow-state.md',
  'generated mirrors',
  'fast-summary.md'
]);
```

Confirmed both retired terms genuinely absent from the doc before editing (`grep -c` for each → 0).
Removed both. **Went one step further than the reported fix, per instruction**: the concept's own
label, `'durable sources and generated mirrors'`, named a mechanism (generated mirrors) that ADR 0018
retired — leaving it would mean the guard's own failure message kept announcing machinery that no
longer exists, even after the term list stopped checking for it. Renamed the label to `'durable
sources'`, matching what the assertion still verifies. After:

```js
assertConcept('docs/workflow-state-contract.md', 'durable sources', [
  'durable sources',
  'workflow-state.md',
  'fast-summary.md'
]);
```

The other three terms (`'durable sources'`, `'workflow-state.md'`, `'fast-summary.md'`) are all still
genuinely present in the doc and unaffected by any retirement — kept as-is.

**One more implication of the same edit, completed rather than left half-done**: the comment at
`scripts/validate-kaola-workflow-contracts.js:195-197`, which documents (in prose) that this concept
is checked by the canonical file rather than duplicated here, itself named the retired half —
`"durable sources / generated mirrors, and legacy coordination..."`. Since the concept it's describing
no longer has that name, updated the comment to `"durable sources, and legacy coordination..."` to
match. This is inside the file I was already asked to verify (the deferral), and leaving a comment
that names a retired concept the very check it describes no longer checks for felt like the same
"half the assertion's name describes machinery that does not exist" problem in miniature — flagging
it here rather than treating it as silently in-scope, in case that judgment call should have gone the
other way.

Applied the identical `assertConcept` edit to the byte-identical mirror,
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js`, and reconfirmed byte-identity
(`diff -q` → identical) before running any gate.

## Broader sweep, to avoid leaving a third instance for someone else to find

Wrote a throwaway script (scratchpad only, not committed) that walked every `assertConcept(file,
label, [terms])` call in both canonical validators and checked each term against its target file
directly. First pass produced false positives — my ad-hoc checker didn't replicate the real
`assertConcept`'s case-insensitive, whitespace-normalized comparison (`norm(s.toLowerCase())`), so it
flagged `'durable sources'` itself as missing when it is actually present under different casing.
Re-verified the two real hits with `grep -i` and confirmed both are present — false alarms, not
findings. Given the real `assertConcept` throws on the **first** miss anywhere in the whole file's
top-level execution, a clean `node scripts/validate-workflow-contracts.js` run (which now returns
exit 0) is itself the exhaustive check across every concept/includes/before assertion in the file —
more reliable than my throwaway script, and I trust it over my own tool here.

## Gates, each run separately, exit code read directly (never through a pipe)

| Gate | Result |
|---|---|
| `node scripts/validate-workflow-contracts.js` | **exit 0** — `Workflow contract validation passed` |
| `node scripts/validate-kaola-workflow-contracts.js` | **exit 0** — `Kaola-Workflow Codex contract validation passed` |
| `node scripts/validate-script-sync.js` | **exit 0** — "OK: 14 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 5 forge export-superset families in sync. committed kernel parity: 4 Oracle Kernel copies identical at HEAD." (counts differ slightly from the first contract-validator pass — 15→14 common scripts, 6→5 forge export-superset families — this reflects other agents' concurrent work in this shared worktree, not anything touched in this dispatch; still exit 0/in sync) |

`node -c` clean on all three touched/verified files.

## Files changed

- `scripts/validate-workflow-contracts.js` — dropped the two retired terms and renamed the concept
  label (lines 372-377, was 372-378).
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — identical edit, to preserve
  byte-identity.
- `scripts/validate-kaola-workflow-contracts.js` — comment-only edit at lines 195-197 (the deferral
  note), no assertion logic changed; verified this file's own check already passed without needing one.

Nothing else touched. Nothing committed.
