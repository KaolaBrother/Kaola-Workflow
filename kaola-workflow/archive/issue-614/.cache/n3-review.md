evidence-binding: n3-review bf6a9ccd0e5a
## Review — Issue #614 (n3-review accuracy gate)

Scope confirmed: merge commit ed758069 touches exactly 7 files (3 Claude finalize commands, 3 Codex finalize SKILL packs, CHANGELOG.md), 66 insertions / 33 deletions. No scripts/ file appears in the diff. Prose-only, as mandated.

Blocking findings: none

1. One consistent story across all six surfaces. No reachable unconditional "full test suite" / "coverage >= 80%" mandate survives on the consumer path. Grepped all six files for coverage|full suite|full test suite|full relevant project|80%|>= 80 and traced every remaining hit: the three commands now carry a dual-mode block (self-host npm four-chain receipt vs consumer validation_command-once-or-cite-fresh-evidence), an explicit negation, and a coverage clause gated on the project defining a coverage gate. Residual matches are all benign and pre-existing (Test Coverage report placeholder, the already-shipped consumer-mode Validation Gate line, the delegation guideline list, routing lines, --verdict-check coverage). The three SKILL packs are fully cleaned. Self-host path preserved in meaning across all six.
2. Forge-neutrality. No gh/glab/tea CLI token or forge brand noun introduced into any added content line. Added dual-mode text is byte-identical across the three command files and across the two forge SKILL packs; the reference SKILL differs only by its pre-existing validation-reuse-boundary caveat, preserved verbatim.
3. No other pinned needle disturbed. Grep for PIN:|final_validation_unverified|final_validation_failed|closure-audit returned zero changed lines.
4. Zero scripts/ changes. Confirmed.
5. CHANGELOG accuracy. The [Unreleased] > Fixed entry accurately describes the fix, correctly states prose-only with scripts/--finalize-check/run-chains.js/sink-merge.js byte-identical, and frames the six-surface (#400) / four-chain (#307) scope. No overclaim or underclaim.

Non-blocking notes: n1-prose ran the full four-chain npm test inside its own leg (redundant with the plan's All-Done full-chain pass — not a correctness defect, just extra token/wall-clock spend for a prose-only diff; a conscious choice per n1-prose's own evidence, not an error). Worth noting for makespan hygiene only.

verdict: pass
findings_blocking: 0
