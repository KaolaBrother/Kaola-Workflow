# Finalization — Summary: bundle-952-953-954-955

Issues #952, #953, #954, #955 — the ponytail-review adoption set. All four close together; the set
was claimed as one run because the four were filed together and share one scope.

## Delivered

**#953 — a solution ladder for the three code-producing roles, with a pin that keeps it there.**
`implementer`, `code-architect` and `planner` each carry the same `## Solution ladder`: climb only as
far as the problem forces — nothing, what is already here, the standard library, a dependency already
installed, then the minimum code that works. It reached 30 carriers (3 canonical, 9 Codex TOML, 18
generated across the additive editions). `code-architect`'s two previous minimalism bullets were
**harmonized into it rather than left beside it**; five wordings of this rule already existed and a
sixth was the defect to avoid.

The filed issue was wrong about two of its three claims — `planner` had two hits, not one incidental
one, and `code-architect`'s was the fifth wording, not the second — and it missed the defect that
mattered: **`code-architect`'s minimalism lines had never reached the Codex carrier at all**, zero
occurrences across all three `.toml` trees and both installed Codex locations. The gap was a
*mirroring* gap, so three `ROLE_PINS` entries close it; the parity guard's consensus mechanism could
not, because it only makes a rule mandatory at 8 of 11 profiles and this one reaches 3.

**#954 — two watch-list rows, and a third refused.** Row 1 (a subagent never receiving a project
rule) and row 2 (a rule demonstrably in context and measurably not followed) landed in
`docs/decisions/0017-the-mission-list.md`, sized against internal evidence. Row 3 was **refused**:
its failure class has already been observed — a canonical rename slid a heading out from under a
plain `if`, nothing threw, and the surface shipped without the paragraph — and #949 built a
four-layer mechanism for it. The watch list is defined as classes never observed, so the row would
have recorded a false claim.

The issue's sizing premise was also refuted: **no local artifact describing the external
implementation exists anywhere** — not in `docs/`, not in ~390 archived run folders, not in the git
log. Rather than invent figures or fetch the network, both rows are sized against internal evidence,
which the ADR's own intro demands anyway ("every row carries its own recovery information inline").

**#955 — one pointer-only runtime capability table.** `docs/architecture.md` gains
`### Runtime capability divergence`: five rows against the four runtimes, every cell a tier label plus
a pointer that resolves. Placed inside the existing `## Editions and runtimes` rather than in a new
doc, because a new doc would have made per-runtime divergence live in two places — the re-derivation
the issue exists to end. The placement's obligation was met: `§ Model resolution` no longer restates
the Codex tier literals.

**#952 — a report-only subtraction audit.** `docs/audits/2026-08-11-subtraction-audit.md`: 16
measured findings (6 over `scripts/` totalling 643 canonical lines, 10 over `docs/`), plus five
retired-machinery hypotheses checked and cleared. Its filed premise was a real number attached to a
wrong conclusion — the "24% duplication" re-measures at 23.3%, but 23.2 of those points are the
guarded four-edition port structure and genuine duplication is 0.04%, so duplication was struck as a
finding class before any file was read.

## Files Changed

18 paths: 3 canonical agent profiles · 9 Codex agent TOMLs · `scripts/test-agent-profile-parity.js` ·
`docs/decisions/0017-the-mission-list.md` · `docs/architecture.md` · `docs/README.md` ·
`CHANGELOG.md` · `docs/audits/2026-08-11-subtraction-audit.md` (new).

## Test Coverage

Test custody held throughout: `tdd-guide` authored the three `ROLE_PINS`; the implementer read and
ran tests but never wrote one.

**The guard is mutation-proven, not merely green.** Positive control on a scratch mirror: unmutated,
808 assertions, exit 0. Deleting the pinned sentence from one Codex carrier gives exit 1 naming that
exact file. Independent review added three sharper mutations: a different tree *and* role; a meaning
flip applied identically to all three TOMLs so byte-identity stays green (the pin alone catches it);
and a deletion from a *generated* carrier, outside the pin's reach, which `test-opencode-edition.js`
reds with a named drift finding. So all 30 carriers fail loudly, via two mechanisms.

## Validation

**Four-chain receipt, green.** `scope.decision: all-four`, `reason: edition_coupling` — the diff
touches agent profiles and the Codex plugin trees, so chain selection correctly failed closed to all
four rather than the claude chain alone. `changedFileCount: 18` confirms the chains saw this run's
full diff. claude, codex, gitlab, gitea all exit 0. `headSha 483a5e5e` is the pre-implementation
commit, which is expected while the work is uncommitted.

Run at full scope alongside it: the walkthrough at `total:1` (**not** the fast gate's rotating 1/12
shard) — 209/209 scenarios, 0 failed — three times across the run, the last after the final repair.
`test-agent-profile-parity` 808 assertions; `edition-sync --check` 8 forge ports in parity;
`generate-routing-surfaces --check` 18/18 byte-match; `test-route-reachability` exit 0.

Reuse boundary, stated rather than asserted as an absolute: the four-chain receipt covers the tree as
of the chain run. The only writes after it were this summary and the docking record, both inside the
run folder; `docs/api.md` was deliberately left unedited precisely because it is test-consumed and an
edit would have staled the receipt.

## Changed Paths

As reported by the finalize transaction. The 18 paths above are the run's whole diff; nothing outside
this project's scope was touched, and the main checkout carries only this run's active folder.

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. `README.md` and `docs/api.md` both verified as no-impact rather
than assumed. Two known-stale doc lines were **deliberately left** in place: repairing findings inside
the run that reports them would collapse the report-only distinction #952 is built on.

## Run gaps

Sweep clean: `run-gaps.json` records `sweptClasses: []` and `--check` exits 0. No unfiled
workflow defect was discovered by this run.

The audit's 16 findings are not run gaps — they are #952's deliverable, and they escalate below.

## Follow-Up Items

Filed with the user's agreement; high-value findings individually, the remainder combined.

- **#956** — `docs/conventions.md` documents `FEATURE_TOKENS`, deleted at `523f1241`, **and tells the
  reader to add tokens to it**. Highest-value docs finding: it does not merely go stale, it instructs.
- **#957** — the Codex tier pair has two unbound copies in `docs/`; every prose surface the repo ships
  is bound to the constants except those two. Mutation-proven.
- **#958** — `docs/architecture.md:295-297`'s "propagation set" clause is false of the derivation; a
  reader who believes it edits a routing skeleton and never regenerates the opencode tree.
- **#959** — `docs/architecture.md:287`'s "against a different forge CLI" is false; four trees call
  three CLIs. Blast radius measured at one live line.
- **#960** — `yagni: run-chain-pool.js`, 428 lines, no chain/CLI/installer caller.
- **#961** — `delete: fixtures-orphan-legality.js`, 102 lines, both importers deleted.
- **#962** — combined: S3–S6, D3, D5, D7, D8, plus one recorded observation about unobserved
  over-match in the opencode deletion transforms.

Two items remain the user's, not mine: whether #958/#959's one-line corrections are applied, and the
absent Node version floor that makes the `native:` finding class unmeasurable.

## What this run got wrong, and how it was caught

Recorded because the pattern is consistent and useful: every one of my own errors was a confident
claim resting on a truncated or unmeasured search.

- A duplication capture died partway and would have reported **0.2%** — clean, plausible, and wrong
  in the direction that kills the audit. Caught by asserting captured == expected.
- I called a true citation fabricated after piping a repo-wide grep through `head -10`, which dropped
  the hits that proved it.
- I stated the Codex tier pair had no single source, then that the two copies were unbound. Both
  false: they are bound by `test-route-reachability.js`, which builds its expectation from the
  constants. Four passes over one fact before it was right.
- Adversarial review on the reviewer model refuted #954 and #955 outright — six defects, all repaired
  and re-verified.
- I declared a live subagent dead because its output file was missing; it was merely slow. The
  accidental second docs audit that followed then contradicted the first on its largest finding, and
  the contradiction was the point: a 3,831-line `delete:` was refused because those directories carry
  a stated retention policy.

Subagents corrected me six times. None of it was caught by a green suite.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-952-953-954-955/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-952-953-954-955/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-952-953-954-955/.cache/doc-docking.md
- kaola-workflow/archive/bundle-952-953-954-955/.cache/doc-updater.md
- kaola-workflow/archive/bundle-952-953-954-955/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-952-953-954-955/.cache/run-gaps.json
- kaola-workflow/archive/bundle-952-953-954-955/finalization-summary.md
- kaola-workflow/archive/bundle-952-953-954-955/mission-list.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/audit-952-brief.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/audit-952-docs-b.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/audit-952-docs.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/audit-952-scripts.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/impl-953.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/impl-955.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/pins-953.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/premise-952.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/premise-953.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/premise-954.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/premise-955.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/review-953.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/review-954.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/review-955.md
- kaola-workflow/archive/bundle-952-953-954-955/reports/solution-ladder-text.md
- kaola-workflow/archive/bundle-952-953-954-955/workflow-state.md
