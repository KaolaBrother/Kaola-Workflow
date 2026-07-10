evidence-binding: n3-review ff3b324f4ae8
verdict: pass
findings_blocking: 0
upstream_read: n1-release-gate af77ad8fe2fc
upstream_read: n2-strictness-tests 41cdd8308e59
finding: id=N3-1 scope=in_scope action=fix status=resolved severity=low fix_role=implementer rationale=three doc surfaces still documented the pre-repair 5-slot release-check precedence family; resolved in-run by the reopened n4-docs pass — all four surfaces re-verified against releaseCheck() and now carry the 7-slot family, coverage semantics, and structural envelope fields
finding: id=N3-2 scope=out_of_scope action=follow_up status=deferred severity=low fix_role=none rationale=coverage arm resolves expected chain set from working-tree package.json rather than candidate-pinned git show; same local trust envelope as the receipt itself and producer/gate symmetric — hardening idea only

(findings_blocking updated 1 → 0 after the in-run N3-1 resolution; verification section appended at the end of this file.)

## n3-review RE-REVIEW — repair-window delta after adversarial refutation (n1 R1+R2 repair)

Scope: `git diff 2c70c97f` (working tree; repair uncommitted) at /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-651-652. Prior review of 0f07a1e8..2c70c97f stands. Repair footprint verified: exactly the 7 declared write-set files (canonical plan-validator + 3 generated editions + walkthrough + the two forge-helpers suites) + n1's evidence file; the README.md / docs/api.md / docs/conventions.md modifications and untracked docs/decisions/D-651-01.md are n4's pre-existing work, untouched by the repair.

### R2 coverage arm — all dispatched checks held

- Structural, no string matching: `chains_incomplete` refusal (plan-validator.js:2506-2510) carries structural `missingChains` + `expectedChains` arrays plus a registry hint (`OPERATOR_HINT_REGISTRY.chains_incomplete`, :105); walkthrough case (11) asserts `out.missingChains` deep-equals `['codex','gitlab','gitea']` via the JSON payload, never prose.
- Fail-closed on unresolvable chain set: missing/unreadable/unparseable package.json OR zero declared chains → `repo_kind_undetermined` (:2499-2503, reusing the existing registry reason at :110); case (13) proves a fully green four-chain receipt still refuses in a no-package.json repo — the vacuous-coverage fail-open is pinned shut.
- Producer/gate agreement: releaseCheck:2498 filters `['claude','codex','gitlab','gitea']` by `typeof scripts['test:kaola-workflow:'+n] === 'string'` — byte-same predicate as run-chains `resolveChains` (kaola-workflow-run-chains.js:119+386) and the finalize repo-kind discriminator (plan-validator.js:3286). Inlining the list rather than importing matches the existing discriminator style.
- Precedence coherent and locked: arm placed after chains_empty, before chains_red. Case (12) locks incomplete > red (single red claude-only receipt → chains_incomplete); unchanged case (8) locks empty > incomplete (empty chains[] in a 4-chain-declaring fixture → chains_empty); case (13) locks the fail-closed probe. The 10 original case assertions are byte-unchanged in the diff; only `mkReleaseRepo` gained a committed package.json declaring all four chains (required so cases 1-10 verdicts stay identical under the new arm) — full walkthrough green confirms no verdict drift.
- n1's evidence RED is genuine: case (11) quoted failing pre-fix with the exact pass envelope of a claude-only receipt — the adversary's finding reproduced, then closed.

### R1 hermeticity fix — held

- Both suites (`test-gitlab-forge-helpers.js:9`, `test-gitea-forge-helpers.js:9`) `delete process.env.KAOLA_WORKFLOW_OFFLINE` at suite top before any require, with the require-time-capture hazard named in the comment. The deliberate OFFLINE sub-test is self-managed and unweakened: it sets '1' itself (gitlab :251), cache-busts, and restores by delete (:262) — the top-level delete strips only ambient inheritance.
- Zero production-script changes: the repair diff touches no forge helper module, only the two test suites (+7 lines each, comment + delete).
- Empirically verified all four combos here: gitlab-plain=0, gitlab-offline=0, gitea-plain=0, gitea-offline=0.

### Validation runs (this gate, read-only)

- `node scripts/edition-sync.js --check` → "10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical" (exit 0) — all 4 generated validator editions byte-true.
- `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (1642 assertions)", exit 0.
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed", exit 0 (all 13 #651 cases in-suite).

### BLOCKING FINDING N3-1 — n4's docs now document the pre-repair contract (severity low, must fix before finalize receipt)

The repair extended the release-check contract after n4-docs completed, leaving three doc surfaces describing the old five-slot family as exhaustive:
- docs/api.md:544-551 — "Typed refusal precedence (structural `reason`, never string-matched): chains_unverified > chains_stale > chains_empty > chains_red > chains_waived" — omits `repo_kind_undetermined` and `chains_incomplete`, omits the coverage requirement (receipt must cover every declared test:kaola-workflow:* chain) and the `missingChains`/`expectedChains` refuse-envelope fields it documents for the other reasons.
- docs/conventions.md:386-390 — same five-slot enumeration in the Release section ("A red, missing, stale, or waived receipt is a typed refusal" — a subset receipt and an unresolvable chain set are now also typed refusals).
- docs/decisions/D-651-01.md:39-41 + :89-90 — the ADR records the five-tier precedence and a 10-case walkthrough inventory as the final design; it predates the adversarial refutation that added the coverage arm and cases 11-13.

Failure mode: an operator following the documented release contract will not recognize a `chains_incomplete`/`repo_kind_undetermined` refusal as part of the gate's family, and docs/api.md — the repo's API contract surface, test-consumed prose — misdocuments the refusal envelope. Sequencing constraint: docs/api.md/README/CHANGELOG are SELF_HOST_TEST_CONSUMED, so this fix must land BEFORE the finalize four-chain receipt is stamped (stamp-last), or it will re-stale the receipt. The fix is mechanical prose (add the two slots + coverage semantics to the three surfaces; amend D-651-01 with the R2 addendum). Natural owner is the doc-updater (n4) or the finalize-tail implementer.

### Non-blocking observations

- N3-2 (hardening idea, not a defect): the coverage arm reads the working tree's package.json, not `git show <candidate>:package.json`. A check-time uncommitted edit deleting chain scripts could shrink the expected set — but this sits inside the same local-artifact trust envelope as the receipt JSON itself (equally editable), and run-chains resolves from the same working tree, so producer and gate stay symmetric. Candidate-pinned resolution would be strictly tighter if ever wanted.
- CHANGELOG.md has no [Unreleased] entry for #651/#652 yet; n1's re-walk evidence shows `release.js --cut` expects one at cut time. If this repo's practice is to add it at ship/finalize, fold it into the N3-1 doc pass; flagging for the finalize node's awareness, not as a separate finding.
- n1's end-to-end re-walk evidence is concrete and internally consistent (scratch-clone receipts quoted with full shas; both legs exercised the previously-dead blanket-OFFLINE sequence through the R1-fixed suites inside the gitlab/gitea chains).

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 1     | resolved in-run (N3-1 docs staleness — fixed by reopened n4-docs, re-verified below) |

Verdict: repaired code lanes APPROVE — every dispatched re-review check held; the one in-scope docs-staleness finding (N3-1) was fixed in-run before the finalize receipt stamp and re-verified.

## N3-1 resolution verification

Re-checked all four surfaces read-only against `releaseCheck()` (plan-validator.js:2442-2519). docs/api.md:550-564 now enumerates the full 7-slot precedence in code order (`chains_unverified > chains_stale > chains_empty > repo_kind_undetermined > chains_incomplete > chains_red > chains_waived`), states coverage-before-greenness, quotes the expected-set predicate byte-identical to :2498, and documents `missingChains`/`expectedChains` on `chains_incomplete` (:571-574) with an example matching walkthrough case (11) — plus correctly notes `repo_kind_undetermined` carries no extra structural fields, matching the code's payload. docs/conventions.md:386-397 carries the same 7-slot family with the widened refusal sentence ("red, missing, stale, incomplete, waived, or unresolvable-chain-set"). docs/decisions/D-651-01.md:39-50 folds the two coverage tiers into the Decision section with explicit repair-window attribution, and the Addendum (:148-181) documents both new arms, the fail-closed rationale, and the 13-case inventory including case (8)'s empty-above-incomplete re-verification. README.md:1333-1335's sequence comment is widened to name incomplete and unresolvable-chain-set refusals. N3-1's cited defects are all fixed; no stale enumeration remains. One residual nit, below reporting threshold and optional: docs/api.md:578's "Self-owned" bullet says "reads only the receipt file and local `git`" — it omits the package.json read that the same section's coverage bullet documents six lines earlier (the validator's own usage text says "receipt + package.json + local git"); harmless summary imprecision, not acted on (docs window closed; below threshold).
