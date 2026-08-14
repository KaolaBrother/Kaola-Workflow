# Documentation update — bundle-976-977-978

Performed by a dedicated documentation pass dispatched during the run (Fable), not deferred to
finalize. Full record at `.cache/docs.md`; this file is the finalize-phase pointer.

## Files changed

| file | change |
|---|---|
| `CHANGELOG.md` | #976/#977/#978 appended to the **existing** `[Unreleased] > Fixed` (no second section created, nothing restructured), plus two same-release consistency repairs and the R1 addendum |
| `docs/opencode-edition.md` | `copy_tree` "removes exactly two things" → **three**, naming `RETIRED_HOOKS`; uninstall paragraph corrected from "by source-tree filename" |
| `docs/kimi-edition.md` | same uninstall repair (already stale at HEAD, predating this bundle); one sentence for the install-path `RETIRED_HOOKS` sweep |
| `docs/conventions.md` | false "three shapes this widening still cannot see" replaced; retirement walk-list row extended with `RETIRED_AGENTS` + the manifest-deletion permanent-strand fact |
| `docs/api.md` | `worktree_dirty` entry: false "three residual shapes / still destroyed silently" replaced with the two never-exempt shapes and the legacy stage/land closure |

## Anti-fabrication

No API, schema, CLI or config section was authored from memory. Every corrected claim was checked
against the shipped code or against this run's measurement records. Two claims were found to be
numbers borrowed from a neighbouring predicate and were corrected rather than kept:

- "497 `mkdtempSync(path.join(os.tmpdir(), …))` sites" — 497 was the count of **every** `mkdtempSync(`
  site; the narrow form was ~491 at that commit, and both have since moved because this bundle added
  a suite. The precise figure was **dropped**, not repaired: an exact count in a changelog rots the
  moment anyone adds a test file.
- "four of them in production scripts" — four is the count of production **scripts**, not sites.

## Checked and found clean, stated rather than implied

`docs/architecture.md`, `docs/workflow-state-contract.md`, `README.md`, `docs/README.md`,
`docs/api.md`'s porcelain-contract and sandbox-TMPDIR passages, the released CHANGELOG sections, and
`copy_skills`' own "exactly two things" claim — that last one verified **still true** and left alone,
which is the harder half of the job.

## ADRs — audited, deliberately not edited

No ADR states the old behaviour in the present tense as a now-false live rule. `D-579-01:95` is
present-tense about `isParkedLanePath` itself and remains TRUE, because #978 left the kernel
classifier untouched and changed the *caller*. **ADR 0012:84-86** is present-tense normative — "install
and uninstall remove previously-installed profiles of the retired role on every runtime" — and is the
very obligation #977 axis A found `uninstall.sh` violating: the tree had drifted from a correctly
written rule, and this run restored it. No edit owed.

## Verification

`generate-routing-surfaces.js --check` exit 0 (all 18 surfaces byte-match) ·
`test-suite-registration.js` exit 0 (549 assertions, run because `docs/api.md` is test-consumed) ·
`test-forge-finalize-findings.js` exit 0.
