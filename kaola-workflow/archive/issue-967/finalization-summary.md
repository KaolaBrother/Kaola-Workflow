# Finalization — Summary: issue-967

Closes #967, filed earlier the same day by the run that tripped it (bundle-963-964-966). The issue
as filed deliberately did not presume which side moved; the owner ruled in conversation, and the
ruling was **larger than any option the issue listed**.

## Delivered

**Owner ruling.** *No hard failure at any size* — nothing about `CLAUDE.md`'s length may red a chain
— applied to **both** surfaces: this repo's own guard and the consumer guidance `workflow-init`
injects into other people's repos. The three options the issue offered (reword, count physical
lines, make the failure legible) all kept a failing case; the ruling removed it.

That is consistent with the project's own posture rather than an exception to it: a mechanism
justified by "the file might get long" argues against the design's premise rather than for a gate,
and the refusal count in the run design is zero.

**Three live validators carried the hard assert**, not one:

- `scripts/validate-workflow-contracts.js` (claude chain)
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (byte-identical copy)
- `scripts/validate-kaola-workflow-contracts.js` — **the codex chain's own validator**, the copy
  easiest to miss because the two filenames differ by a single word

Each now counts **physical** lines and emits a non-fatal `notice:` above 200.

**Two defects were folded in, both measured:**

1. *The number was wrong.* `split(/\r?\n/)` counts the trailing empty element, so the advertised
   "200" was really **198 physical lines** — a 199-line file failed a rule that permitted it. That is
   the defect that prompted the issue, hit while editing this repo's own CLAUDE.md.
2. *The blast radius was wrong.* The assertion sat at column 0 of the module body, so it threw at
   **require** time and took the whole CLI down. Downstream it surfaced only as an opaque
   `testContractValidatorOfflineSkip` failure naming neither the file nor its length.

**The project had been shipping consumers a stricter rule than it applied to itself.** The injected
`workflow-init` guidance already carried a two-tier rule — "Target size: under 200 lines. **Hard
limit:** if the result would exceed 240 lines, **stop** and summarize". Under the ruling nothing
stops, so that became: name what should move, and offer to trim it together. Edited at the skeleton
and regenerated.

## Files Changed

| file | what |
|---|---|
| `scripts/validate-workflow-contracts.js` | assert → non-fatal notice, physical-line count |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | byte-identical copy |
| `scripts/validate-kaola-workflow-contracts.js` | same, codex chain |
| `templates/routing/init.skeleton.md` | 3 sites; the 240-line stop removed |
| `commands/workflow-init.md` + 5 plugin renders | regenerated from the skeleton |
| `CLAUDE.md` | Maintenance line: recommended, never enforced |
| `README.md` | "enforces" → "encourages" context discipline |
| `scripts/test-run-chains.js` | stale `rootReadSurfaces` comment retitled |
| `CHANGELOG.md` | `### Changed` entry under `[Unreleased]` |

## Test Coverage

**No test was authored, and the reason is specific rather than a shrug:** the change *removes* a
failing case. There is no new behaviour whose correctness needs an oracle — the assertion that could
have been pinned is the one being deleted, and a test written to pin "it no longer throws" would be
pinning an absence at exactly the site the mechanism used to live, which is the shape the project
forbids. Nothing pinned the throwing behaviour beforehand either; that was checked, not assumed. The
one hit that looked like a pin, `scripts/test-run-chains.js:1514`, is a `rootReadSurfaces`
**diff-scoping** list, not a behaviour assertion.

What stands in for a test is a **mutation proof, run one validator at a time** — an N-site mutant
would have proven one of them converted, never three:

| CLAUDE.md size | expected | `validate-workflow-contracts.js` | `validate-kaola-workflow-contracts.js` |
|---|---|---|---|
| 200 lines | silent, exit 0 | exit 0, no notice | exit 0, no notice |
| 201 lines | notice, exit 0 | exit 0, notice | exit 0, notice |
| 260 lines | notice, **still** exit 0 | exit 0, notice | exit 0, notice |

**Honest scope of that proof: two of the three were proven by direct run.**
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` exits 1 at *every* size with no
notice — because its `root` resolves to `plugins/kaola-workflow/`, so it fails on
`commands/kaola-workflow-finalize.md is missing`. That was verified **against HEAD**, where it does
the same, before being called pre-existing. It is not a `package.json` chain step and is not
standalone-runnable in this layout; its correctness rides on the byte-identity `validate-script-sync.js`
enforces, confirmed by `diff -q`.

`CLAUDE.md` was snapshotted before planting and verified byte-restored afterwards (`git diff --quiet`).

Suites run against the final candidate:

- `simulate-workflow-walkthrough.js` at **FULL scope** — 209/209 scenarios, 0 failed, exit 0.
- `generate-routing-surfaces.js --check` — **confirmed RED first** (`6 surface(s) drifted from the
  skeleton`), then `all 18 surfaces byte-match` after `--write`. The red is the control: it shows the
  skeleton edit propagated rather than the check being vacuous.
- `validate-script-sync.js` (27 byte-identical groups), `test-generate-routing-surfaces.js` (434
  assertions), `test-route-reachability.js` (331), `test-run-chains.js` (283) — all exit 0.

Live demonstration: this repo's `CLAUDE.md` now stands at **199 lines** — the exact length that threw
at the start of the session — and both runnable validators pass it silently.

## Validation

## Changed Paths

## Documentation Docking

`DOCKED` — see `.cache/doc-docking.md`. `CHANGELOG.md`, `CLAUDE.md`, `README.md` and the skeleton
updated; `docs/` and `.env.example` reviewed with explicit no-impact reasons. `README.md` mattered
more than it looks: it claimed the workflow "**enforces** context discipline", a verb this change
makes false.

## Run gaps

None swept. The scanner returned `sweptClasses: []`, and nothing was hand-added: the one surprise
this run turned up — the consumer template shipping a stricter rule than the project enforced on
itself — is part of what #967 fixed rather than a leftover, and the plugin copy's unrunnability is a
property of where it lives, not a defect.

## Follow-Up Items

None.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-967/.cache/chain-receipt.json
- kaola-workflow/archive/issue-967/.cache/doc-docking.md
- kaola-workflow/archive/issue-967/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-967/.cache/run-gaps.json
- kaola-workflow/archive/issue-967/finalization-summary.md
- kaola-workflow/archive/issue-967/mission-list.md
- kaola-workflow/archive/issue-967/workflow-state.md
