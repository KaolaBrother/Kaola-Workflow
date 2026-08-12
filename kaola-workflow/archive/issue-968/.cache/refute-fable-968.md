# refute-fable-968 — adversarial refutation of the bundle-width consistency claim

- role: adversarial-verifier (Fable 5)
- candidate: worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-968`, branch `workflow/issue-968`, uncommitted diff over 1d892a56 (24 files, +247/−97)
- claim (verbatim): "The bundle-width rule now has exactly one wording across the repository. Every surface that states how many issues a run carries, or on what basis issues may share a run, has been updated consistently; no surviving statement contradicts the new three-to-five default or the new 'closeable on its own evidence' admission test; and every mechanism claim in the new prose is true of the code as it exists today."
- NOTE ON A MOVING CANDIDATE: the worktree was edited during this review — the ADR 0017 watch row's "stated in prose on seven surfaces" (in my initial diff capture) now reads "fourteen surfaces — next.skeleton.md and finalize.skeleton.md, each with its six renders". That repair is correct (I had independently measured 7+7). Every finding below was re-verified against the bytes on disk at report time; anything already repaired mid-flight was dropped.

## VERDICT: REFUTED

Analytical result: **refuted** — concrete counterexamples on both halves of the claim (a false measurement claim in the new prose, and surviving statements that presuppose or state the old rule). Execution result: complete; no test suites were run per dispatch constraint (walkthrough in progress elsewhere); all evidence is from reads, greps, byte-diffs against main's pre-change trees, and one archive-census node script.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=changelog-says-12-edition-surfaces-measured-18-finalize-family-omitted
finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=next-skeleton-step3-still-defaults-to-single-issue-invocation-and-singular-claim-record
finding: id=R3 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=live-test-comment-states-same-scope-bundle-as-guarded-exception
finding: id=R4 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=root-claude-md-claim-record-line-left-singular-while-init-skeleton-twin-pluralized
finding: id=R5 scope=in_scope action=none status=open severity=low fix_role=none rationale=envelope-note-calls-8-or-fewer-recommended-shape-competing-with-3-5-normal-shape-user-decision-note-untouched-by-design
finding: id=R6 scope=in_scope action=none status=open severity=low fix_role=none rationale=admission-test-worded-three-ways-literal-exactly-one-wording-false-compression-may-be-deliberate

verdict: fail
findings_blocking: 2

---

## Findings

### R1 — False measurement claim in the new prose: "12 more" edition surfaces; the measured number is 18 (medium, refutes "every mechanism claim in the new prose is true")

`CHANGELOG.md:37-38` (new prose): "Renders to **18 tracked surfaces** and, through the two edition transforms, to **12 more** across the `.opencode*` and `.kimi*` trees — **verified by measurement rather than assumed**".

Measured, both directions:
- Worktree edition trees carrying the change: `grep -rln "three to five"` over the six trees → 12 files (init + next × 6 trees); the finalize completion-contract rewrite ("closes every issue in one explicitly selected set — all of them, or none; a run carrying a single issue is that set with one member") is additionally present in all 6 edition finalize surfaces (`.opencode*/command/kaola-workflow-finalize.md:416-417`, `.kimi*/skills/kaola-workflow-finalize/SKILL.md:410-411`). Total: **18**.
- Main's pre-change trees: `grep -rln 'normally carries one issue|closes exactly one issue|same-scope set'` in `/Users/ylpromax5/Workspace/Kaola-Workflow/.opencode* .kimi*` → exactly those same **18** files hold the old wording; zero old-wording survivors remain in the worktree trees.

The "12" omits precisely the finalize family, contradicting the same bullet's own tracked-surface arithmetic (18 tracked = 3 skeletons × 6 renders, finalize included; `generate-routing-surfaces --check` reports "all 18 surfaces byte-match"). The number is wrong in the sentence that claims it was verified by measurement. (The dispatch brief itself repeated the 12 — the error propagated.)

### R2 — The changed skeleton itself still presupposes the one-issue run at Step 3 (medium, refutes "updated consistently / no surviving statement")

Both in `templates/routing/next.skeleton.md`, ~70 lines below the new three-to-five default at `:58`:
- `:126` — "The claim is bookkeeping: it records **which issue, branch and worktree** this run owns" (singular). The diff updated the *same fact* in `init.skeleton.md:153` to "**which issues**, which branch, which worktree" — so the two skeletons now state the claim-record fact in contradictory grammatical number, and the un-updated one matches the retired norm.
- `:129-131` — "Set `KAOLA_TARGET_ISSUE` to **the issue you selected**, then run the startup transaction. **For a run carrying several issues, swap** `--target-issue ...` for `--target-issues 42,47,53`". The unmarked default instruction is the single-issue invocation; the shape the same file now declares the norm (three to five) is the swap-in exception. An agent following Step 3 top-to-bottom is handed the exception's invocation as the default.

Propagates to all 6 tracked next renders (e.g. `commands/workflow-next.md:118-124`) and the 6 edition next surfaces.

### R3 — Surviving statement of the retired admission basis in a live test (low)

`scripts/test-bundle-claim.js:1233` (comment, current bytes): "it is exactly the lane a no-target orchestrator survey produces **(a same-scope bundle is the guarded exception the ranking rules allow)**". This states both retired halves — same-scope as the admission basis, bundle as the exception — and attributes them to "the ranking rules", which after this change say the opposite (bundle = norm, admission = independent closure). A reader maintaining the bundle-lane tests is told the old rule as current fact.

### R4 — Root `CLAUDE.md` claim-record line left singular (low)

`CLAUDE.md:45`: "`workflow-state.md` is the **claim** record: **which issue**, which branch, which worktree." The diff pluralized this exact formulation in `init.skeleton.md:153` (which generates consumer-repo CLAUDE.md files) but left the project's own hand-maintained CLAUDE.md singular. Same fact, now stated in two numbers across the repo, the un-updated one presupposing the one-issue norm.

### R5 — The two numbers still compete on the one machine surface that speaks (low; note string untouched by design — flagging the prose claims around it)

Shipped envelope string, `scripts/kaola-workflow-claim.js:1909-1910` (and 3 edition copies): "N issues; **8 or fewer is the recommended shape for one plan**." New prose: README:1301 "the **normal shape** of a run — three to five issues"; skeleton `:61` "eight remains the recommended **ceiling**". The envelope binds "recommended shape" to 8, the prose binds "shape/norm" to 3-5 and reserves "ceiling" for 8 — so the CHANGELOG's "the two numbers now read as the different knobs they are" does not hold on the envelope surface, and README:1317 paraphrases the note as carrying "the recommended ceiling of 8" when the note's own bytes say "recommended shape". Not a contradiction in substance (3-5 ⊂ ≤8), and `BUNDLE_SIZE_ADVISORY` was deliberately left untouched — but the wording collision is real and the README misdescribes the note's text.

### R6 — "Exactly one wording" is literally false: the admission test exists in at least three wordings (low; compression may be intended)

- `next.skeleton.md:63-64`: "Members are admissible when they are all open, unclaimed, and each **closeable on its own evidence**: finishing one does not depend on how another turns out."
- `init.skeleton.md:153`: "each open, unclaimed, and closeable on its own evidence" — with the runs-alone test compressed (drops the examples, the all-or-nothing rationale, and "Size is not the test").
- `README.md:1309`: "issues share a run when they are all open, unclaimed, and each closeable on its own evidence — finishing one does not depend on how another turns out." (also README:885, colon→dash variant).

Same rule, materially different words across two authored skeletons plus hand-maintained README paraphrases; none declared as a named divergence region. Under the claim's own absolute ("exactly one wording across the repository") this refutes the first sentence; under the project convention's intent (runtime renderings of one template) it is defensible as deliberate per-surface compression — recorded, the orchestrator decides.

---

## Attempted falsifications that FAILED (the claim survived these)

1. **`bundle_size_note` firing condition** — code (`claim.js:1907-1911`): fires only at `targets.length > 8`; tests pin 9-wide → note present naming "9 issues", 5-wide → `undefined` (`test-bundle-claim.js:449-450, 481-482`). README:1317's "Only a set larger than 8 draws the note" is TRUE. Not refuted.
2. **"Nothing caps it" / `KAOLA_BUNDLE_MAX_ISSUES` retired with its enforcement** — `claimExplicitBundle` (`claim.js:1887+`) has no size refusal; header comment: "Bundle size is not capped: the count rides out as advice, never as a refusal"; env var absent from all scripts. TRUE.
3. **"BUNDLE_SIZE_ADVISORY has only ever ridden out as advice on the claim envelope"** — sole use site is the envelope note, in all 4 claim-script copies. TRUE.
4. **Runs-alone rationale ("all-or-nothing closure would hold every finished sibling behind that one decision")** — accurate: `--keep-open`/`--keep-issue-open` are bare booleans (`claim.js:137`, `:144`); under keep-open the close loop guard at `claim.js:4819` skips entirely and `kept_open` is the whole `issueSet` (`:4911`); no per-member closure valve exists (`sink-merge.js:1906` comment; sole production `excludeIssues` caller degenerates to whole-run at `sink-merge.js:2263`). TRUE.
5. **ADR 0017 watch-row citations** — ALL resolve against current bytes and match their descriptions: `claim.js:4819`, `:4911`, `:137`, `:144`, `:1776` (`closure_policy: 'all_or_nothing'`), `:2442-2467` (`reconcileRoadmapForClosure`, "mixed close/keep-open bundle" comment), `sink-merge.js:1906`, `:2263`, `adaptive-schema.js:164`, `closure-audit.js:272-279` (non-all_or_nothing → primary alone), `docs/workflow-state-contract.md:271-275` and `:382`, `test-sink-merge.js:781`, `simulate-workflow-walkthrough.js:13548-13551` and `:10208-10219` (#903 negative control), gitlab walkthrough `:333-334`, gitea `:479-480`, codex copy `closure_policy` at `:1802`/`:1862` fixture-input-only (grep: exactly those 2 occurrences, no assertion), `next.skeleton.md:58` and `:70`. The one miscount I found ("seven surfaces") was repaired to "fourteen … two different sentences" mid-review and now matches my independent measurement.
6. **26-archived-runs statistic** — measured in main (`kaola-workflow/archive`, 26 most-recent by mtime, members from folder names): median 1, mean 2.58, 14/26 single. CHANGELOG's "median run of one issue (mean 2.6; 14 of 26 single)" is TRUE.
7. **Edition-tree transform mangling** — read shipped bytes in all 6 trees: new wording present in 18 files, zero old-wording survivors, no mangled anchors observed in the changed regions. Not refuted (the defect is the count claimed, R1, not the propagation itself).
8. **Retired-role / never-built claims** — `agents/` holds exactly 14 profiles, no `issue-scout`; `target_set_not_same_scope` has zero hits in `scripts/` and `plugins/*/scripts/`. TRUE.
9. **Other prose surfaces** — `docs/opencode-edition.md`, `docs/kimi-edition.md`, `docs/conventions.md`, `docs/architecture.md`, `agents/*.md`, `hooks/`: no statement of run width or admission basis found (paraphrase sweeps: "carries one issue", "same-scope", "coherent scope", "several issues", "share a run", "one at a time", "targets one issue", singular-claim framings). Old-era statements survive only in `kaola-workflow/archive/**`, `docs/investigations/**`, and numbered `docs/decisions/D-*.md` records — historical records, not living rule surfaces; and in `kaola-workflow/ROADMAP.md` / `.roadmap/issue-968.md`, which quote the old rule as the defect being fixed and are removed at closure.
10. **KW-CLAUDE-TEMPLATE region containment** — the three changed init statements sit at :153/:167/:176, inside the region markers at `init.skeleton.md:106`/`208`. TRUE.
11. **"18 tracked surfaces byte-match"** — `node scripts/generate-routing-surfaces.js --check` → "all 18 surfaces byte-match the skeleton", exit 0. TRUE (and I did not rely on it alone; R1/R2 came from reading bytes).

## What would have flipped the verdict

Had R1's count read "18 more" (or the finalize renders been genuinely out of the transform's reach), and had Step 3 of `next.skeleton.md` (:126, :129) been brought into line with the new default the same file sets at :58, the remaining findings (R3-R6) are each individually arguable as historical residue or deliberate compression, and I would have returned not_refuted with those recorded as non-blocking. As it stands, the claim's absolutes — "every surface … updated consistently", "no surviving statement", "every mechanism claim … true" — are each falsified by at least one concrete counterexample.

Confidence: high on R1 (byte-diff against pre-change trees, both directions), high on R2/R3/R4 (current bytes quoted), medium on R5/R6 (substance-vs-wording judgement calls, recorded non-blocking).
