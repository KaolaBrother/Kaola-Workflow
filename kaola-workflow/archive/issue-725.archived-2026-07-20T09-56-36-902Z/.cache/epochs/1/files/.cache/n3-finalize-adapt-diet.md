evidence-binding: n3-finalize-adapt-diet 6b82c068ed13
upstream_read: n2-routing-certify 789906e2d675

non_tdd_reason: behavior-preserving refactor — prose diet across 12 hand-maintained finalize/adapt
routing surfaces + coherent removal of the dormant fast-compliance-backstop pin chain. No new
behavioral logic; the existing contract validators + route-reachability + walkthrough are the oracle
(every load-bearing token/mechanic preserved; a meaningful failing unit test cannot be written for a
prose compression whose correctness IS "the same machine-enforced tokens still pass").

verification_tier: regression-green

regression-green: five contract validators + route-reachability (2276) + walkthrough green before AND after; github byte-twin cmp identical; opencode/kimi unchanged vs base (pre-existing red only, −2 intentional A20 asserts)

## verification_tier token
regression-green

## task
Apply the three-band rule to the finalize topic (`commands/kaola-workflow-finalize.md` 1065→≤300,
mirrored to gitlab/gitea command mirrors + 3 SKILL packs) and the adapt topic
(`commands/kaola-workflow-adapt.md` 304→≤150, same six surfaces): keep Band-1 mechanics as terse
bullets, cut Band-2 typed-refusal restatements and Band-3 narration. Remove the dormant
fast-compliance-backstop pin chain coherently (PIN block on finalize surfaces + `fn-fast-compliance-backstop`
manifest entry + route-reachability SUPERSET pair + T10/T11 comment + opencode A20). Keep the six
surfaces per topic convergent modulo forge nouns / surface framing.

## write_set (21 files; all inside the frozen declared set)
- commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md
- templates/routing/required-blocks.js  (removed `fn-fast-compliance-backstop` block)
- scripts/test-route-reachability.js    (removed `fast_compliance_unresolved` SUPERSET pair; updated T10/T11 comment)
- scripts/test-opencode-edition.js      (removed A20 assert; replaced with retirement note)
- scripts/validate-workflow-contracts.js                              (UNCHANGED — all pins preserved)
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js       (UNCHANGED — byte-twin, cmp IDENTICAL)
- scripts/validate-kaola-workflow-contracts.js                        (UNCHANGED — all pins preserved)
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js (UNCHANGED)
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js   (UNCHANGED)
- scripts/test-kimi-edition.js          (UNCHANGED — no fast-compliance/finalize-adapt content pin exists to narrow)

Pin-narrowing note: the five contract validators + test-kimi-edition.js already pin only load-bearing
tokens, and the diet preserved every one of those tokens, so no validator pin needed narrowing. The
ONLY pin removal was the fast-compliance chain, which lives in the manifest + route-reachability +
opencode A20 (not the validators). The two github validators stayed byte-identical (cmp exit 0).

## before/after line counts (all 12 surfaces)
| surface | before | after |
|---|---|---|
| commands/kaola-workflow-finalize.md | 1065 | 453 |
| plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md | 1002 | 453 |
| plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md | 1000 | 453 |
| plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md | 661 | 621 |
| plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md | 661 | 621 |
| plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 661 | 621 |
| commands/kaola-workflow-adapt.md | 304 | 211 |
| plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md | 301 | 211 |
| plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md | 301 | 211 |
| plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md | 465 | 465 |
| plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md | 465 | 465 |
| plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md | 465 | 465 |

Finalize command: 1065 → 453 (−57%). Adapt command: 304 → 211 (−31%). Forge command mirrors are
byte-generated from the canonical (identical line count, forge nouns / mr|pr sink applied). Finalize
SKILLs 661 → 621 (fast-path branch + fast-compliance PIN removed; Chain-Receipt/Consumer gate
compressed to the canonical Validation-Gate form). Adapt SKILLs 465 → 465 (co-tenant Band-2 paragraph
compressed line-neutral; see AC-D note).

## AC-D reasons for missed line targets
- **finalize command ≤300 → landed 453.** Honest floor is validator/T17-pinned and cannot go lower
  without dropping a machine-enforced token or a Band-1 mechanic: two frozen PIN blocks
  (`replan-finalize` fence carries all 14 T17 `commonTokens` verbatim; `reviewer-contract-v2-finalization`
  is a T17 byte-identical block ~20 lines) + the four-gate barrier bash (pinned
  `VALIDATOR="$(kaola_script kaola-workflow-plan-validator.js)"` + the 4 `node "$VALIDATOR" … --*-check`
  lines) + the pinned sink-metadata capture (`SINK_STATE_FILE=…`, `SINK_ISSUE_NUMBERS`, `--issue-numbers`)
  + the pinned FOREIGN_ARCHIVE staging guard + the pinned Step-9 sink dispatch
  (`kaola-workflow-sink-merge.js`/`sink-pr.js`, `merge-sink-only`) + the closure-audit block
  (`closure-audit`/`sink_incomplete`) + the four required model-badge Agent dispatches (contractor,
  doc-updater, tdd-guide, build-error-resolver). That mandatory apparatus alone is ~250 lines; the
  remaining Band-1 step mechanics (dual-mode gate taxonomy, 7 steps, keep-open, sink handling) cannot
  be cut as narration. 453 is at/near the honest floor for this surface.
- **adapt command ≤150 → landed 211.** Floor is the T17 byte-frozen `reviewer-contract-v2-authoring`
  block (~32 immutable lines carrying `plan_schema_version: 2`, the full schema-2 node header, the
  gate-column vocabulary) + the `replan-adapt` fence (all 14 T17 `commonTokens`) + the pinned
  `workflow-planner` dispatch + `claim-escalate` block + the `Question-shaped & bug-shaped issues` /
  `root cause or symptom mask` bug-shaped section + the bundle-lane typed refusals — ~140 lines of
  mandatory content before any connective prose. Cutting to 150 would require near-zero Band-1
  connective prose (git-freshness gating, handoff repair loop, task-list construction), which the band
  rule keeps as terse bullets, not zero.
- **adapt SKILLs 465 → 465.** Their extra mass over the command is legitimate codex authoring
  reference (the closed-grammar envelope, caps, and a complete example `workflow-plan.md`) that the
  command deliberately delegates to `agents/workflow-planner.md` — this is Band-1 codex reference, not
  Band-3 narration. The reviewer-contract-v2-authoring block is byte-identical to the trimmed command
  (topic converged); the co-tenant Band-2 paragraph was compressed line-neutral. A deeper front-end
  rewrap was reverted because the surrounding codex entry-guard/delegation apparatus diverges per
  edition and rewrapping long-line prose raised physical line count without word savings — not worth
  a codex-pin regression against a green tree.

## fast-compliance-backstop chain — fully removed (confirmed)
- PIN block `<!-- PIN: fast-compliance-backstop -->` removed from all 6 finalize surfaces (3 commands
  + 3 SKILLs). grep for the marker across command/skill trees returns nothing.
- `fn-fast-compliance-backstop` manifest entry deleted from `templates/routing/required-blocks.js`.
- `{ token: 'fast_compliance_unresolved', surfaces: FN6 }` SUPERSET-PROOF pair deleted from
  `scripts/test-route-reachability.js`; the T10/T11 retirement comment updated to record the removal.
- opencode **A20** assert deleted from `scripts/test-opencode-edition.js` (replaced with a retirement
  note). The only two surviving occurrences of the string "fast-compliance-backstop" are those
  retirement COMMENTS (test-opencode-edition.js:531, test-route-reachability.js:433) — no active pin,
  manifest entry, or assertion references it.

## verification_commands (all from the worktree)
- `node scripts/validate-workflow-contracts.js` → "Workflow contract validation passed" (exit 0)
- `cmp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js` → exit 0 (byte-twin IDENTICAL; neither edited)
- `node scripts/validate-kaola-workflow-contracts.js` → "Kaola-Workflow Codex contract validation passed" (exit 0)
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` → "GitLab contract validation passed" (exit 0)
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → "Gitea contract validation passed" (exit 0)
- `node scripts/test-route-reachability.js` → "Route-reachability test passed (2276 assertions)." (exit 0)
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" (exit 0)
- forbidden-token spot checks (forge nouns): `--forbidden-only` on the gitlab + gitea finalize AND
  adapt command mirrors → all "forbidden-only check passed (1 file(s))"
- byte-identity proof: all 6 finalize surfaces carry ONE byte-identical
  `reviewer-contract-v2-finalization` block (T17), and all 6 adapt surfaces carry ONE byte-identical
  `reviewer-contract-v2-authoring` block (T17) — verified by an extract-and-compare over all six each.

## before_result (run base, seeded run gaps — verified on pristine main)
- opencode (`node scripts/test-opencode-edition.js`): 1 failure (H1 / #F3 hookPath), 385 passed.
- kimi (`node scripts/test-kimi-edition.js`): FATAL — ENOENT on the Phase-C-retired
  `hooks/kaola-workflow-pre-commit.sh` (referenced from scripts/sync-kimi-edition.js, outside this
  write set).
- All four contract validators + route-reachability + walkthrough green at base.

## after_result
- root-github / codex / gitlab / gitea validators: PASS. route-reachability: 2276 PASS. walkthrough:
  PASS. github byte-twin: IDENTICAL.
- opencode: **same** single failure (H1 / #F3 hookPath); passing count 385 → **383**, a −2 delta that
  is exactly the two A20 assertions I intentionally removed — NO new failure vs base.
- kimi: **same** FATAL (ENOENT on the retired pre-commit hook); byte-for-byte identical to base
  (test-kimi-edition.js + sync-kimi-edition.js untouched). NO new failure vs base.

Base-vs-after failure-set comparison: the failure SETS are identical at base and after for both
additive suites; the only numeric change is opencode's passing count dropping by the 2 intentionally-
removed A20 asserts. No regression introduced.

## write-set gaps
None. All edits stayed inside the 21-file frozen write set. No out-of-set fix was required (the two
github validators + kimi test needed no edit; the fast-compliance chain lived entirely in the manifest
+ route-reachability + opencode A20, all in-set).
