evidence-binding: adversarial-1031 6a1d8e03c547

# Adversarial verifier report — issue #1031 D2

behavior: adversarial-verifier behavior contract v3
profile: resolved_profile_hash 9ff7f5d3f0598d7b0ca616e2322c3e5694ac5181d3bf02a975d49d552d1fac44
context: baseline `e2a793f83755650d5c69a28fef1c4e317ae7c220` plus the candidate working-tree diff
candidate: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-1028-1030-1031`
claim: the #1031 D2 candidate is release-stable and still detects complete removal of ZCode changelog documentation.
surface: the D2 helper/assertions in `scripts/test-zcode-edition.js`, current `CHANGELOG.md` structure, and git history needed to simulate introduction/pre-release/release-cut shapes.
evidence: `adversarial-1031 6a1d8e03c547`

## Result

Analytical result: **not_refuted**.

Execution result: **succeeded**. One initial historical-shape harness invocation hit Node's default `execFileSync` buffer limit (`ENOBUFS`); it was rerun with an explicit 8 MiB buffer and completed. This was an execution issue, not analytical uncertainty.

Confidence: **high**. The candidate files were fingerprinted before and after the pass and did not change:

- `scripts/test-zcode-edition.js`: `96ee4cf04209ede19bad939dc41d9a50c2ab93aa3142939f053d3a822d4e5bed`
- `CHANGELOG.md`: `ea514c02f71be193e7469d3f107dbeb62c652696a3eae09f886699b059c14a72`

No ambiguity arose: the dispatched claim is complete removal of **all** ZCode changelog documentation, not preservation of the original #1020 entry specifically. Removing #1020 alone is therefore correctly non-red while other ZCode documentation remains.

## Counterexample attempts and observed results

The harness evaluated the candidate's actual `hasZcodeReleaseEntry` and `removeZcodeEntries` function bodies extracted from `scripts/test-zcode-edition.js`; it did not substitute a reimplementation.

1. **Actual introduction tree, top `[Unreleased]` present** — `42ce7de6:CHANGELOG.md`: witness `true`; mutation changed input; mutated witness `false`.
2. **Actual pre-release tree, top `[Unreleased]` present** — `bfacd3d9:CHANGELOG.md`: witness `true`; mutation changed input; mutated witness `false`.
3. **Actual 9.16.0 release cut, `[Unreleased]` absent** — `f76046e0:CHANGELOG.md`: witness `true`; mutation changed input; mutated witness `false`.
4. **Actual later released tree, `[Unreleased]` absent** — `e2a793f8:CHANGELOG.md`: witness `true`; mutation changed input; mutated witness `false`.
5. **Future bracketed release heading inserted above history** — inserting `## [9.17.0] - 2026-08-26` with an unrelated bullet did not hide the older #1020 entry; witness stayed `true`.
6. **New `[Unreleased]` inserted above a released tree** — an unrelated Unreleased bullet did not hide the released #1020 entry; witness stayed `true`.
7. **Unbracketed historical heading** — changing the only relevant released heading from `## [9.16.0]` to `## 9.16.0` made the witness `false`, as required by the candidate's explicit bracketed-release contract. A later bracketed section resumes recognition.
8. **Multiline bullets** — a column-zero `-` bullet with `ZCode` on a continuation line was recognized; mutation removed the entire multiline bullet and the witness became `false`. `*` bullets behaved the same.
9. **Unrelated mentions** — `ZCode` in a bracketed heading or ordinary paragraph did not satisfy the witness; only a release-section bullet did.
10. **Original #1020 removal versus complete removal** — removing only the `[9.16.0]` #1020 section from the current candidate still yielded `true`, because real Unreleased ZCode documentation remains. Removing all word-bounded ZCode bullets changed the input and yielded `false`.
11. **Word boundaries** — `ZCoder` and `myZCodeTool` did not match; `ZCode-CLI` did match. Case-insensitive `ZCode`/`zcode` matches behaved as intended.
12. **Adjacent boundaries** — `##` and `###` headings flush a pending bullet; blank lines terminate a bullet; EOF flushes it. No prior release bullet leaked across a section boundary.
13. **Mutation-vacuity check** — for every admitted positive fixture, `removeZcodeEntries(input) !== input` and `hasZcodeReleaseEntry(removeZcodeEntries(input)) === false`.
14. **Focused suite** — `node scripts/test-zcode-edition.js` exited 0 with `691 assertions` and all three generated trees in parity.

## Non-blocking format observations

The helper intentionally recognizes the repository's observed changelog grammar, not all CommonMark spellings. A `+` list marker, an ATX heading indented by up to three spaces, or a multi-paragraph list item whose only `ZCode` occurrence follows a blank line is not recognized. Those shapes do not occur in the inspected current or historical changelog surface, are not produced by the inspected release cuts, and therefore do not falsify the dispatched release-stability claim. If the changelog format contract is later broadened to arbitrary CommonMark, these become test-extension candidates rather than defects in this candidate.

## Why the claim remained unbroken

The old failure mode was tied to the entry remaining under the first `[Unreleased]` section. The candidate instead scans all bracketed release sections and re-enters recognition after every later bracketed `## [...]` heading. Actual git-history snapshots show the same #1020 documentation moving from `[Unreleased]` to `[9.16.0]` without producing a red. The in-memory mutation removes every admitted ZCode bullet across all such sections, proves the source changed, and leaves no positive witness. This directly witnesses both halves of the corrected claim.

verdict: pass
findings_blocking: 0
