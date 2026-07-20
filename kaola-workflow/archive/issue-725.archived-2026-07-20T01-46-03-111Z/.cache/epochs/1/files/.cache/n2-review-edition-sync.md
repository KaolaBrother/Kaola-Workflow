evidence-binding: n2-review-edition-sync 619d1e44ad82

upstream_read: n1-edition-sync-dedup 2e53c1a30463
plan_schema_version: 2
contract_version: 2
behavior_contract_version: 2
behavior_contract_hash: 42b6332c311ce07c511d67d3c7fb02cf874ab94872aaee87fadae2d0577fa789
resolved_profile_hash: 4f9e7c9aad33216895b1e618d06ad1bfb3beeea55af7094643af59ec927c8b6a
review_context_hash: beb3121793ede240d4e9265826168ef32c490806846908ae8599cdce1915c063
candidate_digest: e9292824094c1efaec74a405eae20922633ce25a1fc9b997d122677b05691698
gate_mode: change_gate
gate_aggregation: sequence
gate_claim: the edition-sync --check guard dedup is correct and self-contained: runCheck no longer re-checks the COMMON_SCRIPTS / BYTE_IDENTICAL_GROUPS mirrors (that authoritative check stays owned by validate-script-sync, so no two mechanisms check the same bytes), the unique GENERATED_AGGREGATORS forge-port parity check is preserved intact, the now-orphaned checkMirrors function + its module export are removed with no dangling import and no other caller, the runCheck success message no longer claims a COMMON_SCRIPTS-mirror count it no longer verifies, test-edition-sync.js drops the T9 coverage of the removed re-check and updates its edition-sync import accordingly, and edition-sync --check plus validate-script-sync both stay green with the forge-aggregator parity fully retained
gate_surface: the n1-edition-sync-dedup diff vs run base 0a9f652a — scripts/edition-sync.js (checkMirrors call + function + export removed, success message updated, aggregator-port check preserved) and scripts/test-edition-sync.js (T9 removed, import updated)
domain_outcome: approved
findings_none: true
verdict: pass
findings_blocking: 0
review_summary: no_blocking_findings
review_attestation: full_review_completed

## Review narrative

Read order followed: canonical review context (kaola-workflow/issue-725/.cache/review-contexts/beb3121793ede240d4e9265826168ef32c490806846908ae8599cdce1915c063.json — discovery phase, epoch 1, empty prior_findings, empty validation_obligations, claim_root_base commit 0a9f652a matches the dispatched run base) first, then n1's evidence file (nonce copied from its line-1 evidence-binding header), then the candidate diff and live tree.

### Diff scope

git diff --stat 0a9f652a shows exactly two modified files — scripts/edition-sync.js and scripts/test-edition-sync.js — matching the gate_surface; the only other working-tree entry is the untracked kaola-workflow/issue-725/ state directory, which is workflow bookkeeping, not candidate code.

### Claim-by-claim verification against the diff and live tree

1. COMMON_SCRIPTS/byte-group re-check gone from runCheck: the checkMirrors(REPO) call and its two mismatches.push loops are removed from runCheck. Confirmed no residual call by reading the current runCheck in full (scripts/edition-sync.js:132-158).
2. Forge-aggregator parity loop untouched: the GENERATED_AGGREGATORS x FORGES loop (scripts/edition-sync.js:134-148) is byte-unchanged in the diff — the removal hunks bracket it without entering it. Live run reports 12 ports in parity.
3. checkMirrors fully removed with no dangling reference: function body + its comment block deleted; checkMirrors dropped from module.exports (scripts/edition-sync.js:231); the now-orphaned checkByteIdenticalGroup import dropped from the validate-script-sync require (scripts/edition-sync.js:40). Repo-wide grep for checkMirrors across js/md/sh/toml/json finds zero live-code references — remaining hits are only historical records (CHANGELOG.md #638 entry, docs/decisions/D-638-01.md, archived bundle-638-639 evidence) and the current issue-725 plan/evidence/envelope files that describe this very task. Historical ADR/CHANGELOG text is provenance, not a dangling reference, and is outside the gate surface.
4. Kept imports are genuinely live: COMMON_SCRIPTS and BYTE_IDENTICAL_GROUPS are still consumed by runWrite steps b/c (scripts/edition-sync.js:191, :203), and canonRel/codexRel remain used at :135/:177/:192/:193 — nothing newly dead was left behind.
5. Success message honest: the runCheck success log (scripts/edition-sync.js:156-157) now reports only GENERATED_AGGREGATORS.length * FORGES.length forge aggregator ports; the COMMON_SCRIPTS/byte-group counts are gone. Observed output: "edition-sync: 12 forge aggregator ports in parity with canonical."
6. Test file: the require destructure (scripts/test-edition-sync.js:9) drops checkMirrors; T9 (synthetic-fixture checkMirrors block) is removed; T1-T8 plus the top-of-file replan-aggregator assertions are untouched in the diff; the os import is still consumed by T8 (os.tmpdir() at scripts/test-edition-sync.js:151).

### The in-write-set deviation (T10 removed alongside T9) — judged on the merits: correct and necessary

T10 called checkMirrors(REPO) directly and existed solely to prove the removed re-check was green on the real tree — it is not a forge-aggregator-parity test. With checkMirrors dropped from edition-sync.js exports, the destructure at scripts/test-edition-sync.js:9 would bind it to undefined and T10's call would throw when the file runs (a TypeError — n1's evidence says ReferenceError, a harmless prose inaccuracy; either way the file would crash). Keeping T10 while satisfying the T9/import/export removals is impossible; both tests are checkMirrors-only coverage (both tagged to the same removed check), the file is one of the two declared write-set files, and no third test references the function. The deviation removes no live coverage: the drift class T9/T10 guarded is exactly what validate-script-sync.js checks authoritatively, and that validator remains green.

### Commands re-run (all from the worktree root, all exit 0)

- node scripts/edition-sync.js --check — "edition-sync: 12 forge aggregator ports in parity with canonical."
- node scripts/test-edition-sync.js — "edition-sync tests passed (40 assertions)"
- node scripts/validate-script-sync.js — "OK: 22 common scripts, 28 byte-identical groups, 5 rename-normalized families, 2 hooks.json families (config + hooks dir), and 7 forge export-superset families in sync." (this is the authoritative check the removed re-check duplicated — the dedup leaves it fully covering the mirror drift class)

### Edition-mirror obligation check

edition-sync.js has no codex mirror copy (plugins/kaola-workflow/scripts/edition-sync.js does not exist) — it is not a COMMON_SCRIPTS member, so editing only the root copy creates no byte-identity obligation; the green validate-script-sync run confirms no mirror family was disturbed.

### Non-findings noted for completeness (no reachable trigger, not admitted)

- n1's evidence says T9 carried "8 assertions"; the removed T9 block contains 4 assert calls (T10 has 2). This is an arithmetic slip in evidence prose, not a code defect — the suite count (40) is machine-reported and green.
- Stale checkMirrors mentions in CHANGELOG.md and docs/decisions/D-638-01.md are historical records outside the gate surface; the plan's downstream doc node owns any documentation reconciliation.

Zero admitted findings. The candidate does exactly what the gate claim requires, nothing more, and all three required commands are green in the live worktree.

review_conclusion: The n1 edition-sync dedup is verified correct and self-contained — checkMirrors is fully excised with no dangling reference, the twelve-port forge aggregator parity check is preserved intact, the success message is honest, the T9 plus necessary T10 test removal is sound, and edition-sync --check, test-edition-sync, and validate-script-sync all pass green; gate approved with zero findings.
