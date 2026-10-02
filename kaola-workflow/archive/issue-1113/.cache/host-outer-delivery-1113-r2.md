# Outer personal-review delivery ROUND 2 — KW #1113 final frozen candidate (Host: zcode-KW-orchestrator-keepopen-pr)

Prepared 2026-10-03 for the outer KW Codex personal re-review required by issue #1113. Round 1
(1203f765) was NOT ACCEPTED with three reproduced P1s (.kaola/outer-review-1113/review.md). This
delivery answers every blocking finding and bounded follow-up. No merge, closure, or publication
has occurred; nothing is pushed. Findings return to the Host for repair and recheck.

## 1. Exact final frozen candidate

- Commit: `969b11b6bc7192361bfc5e6b840ef6773ebf655c` (verify: `git -C .kw/worktrees/issue-1113 rev-parse HEAD`)
- Branch: `workflow/issue-1113`; worktree clean; base `fe7e4443` = origin/main = v12.4.0
- Full diff `fe7e4443..969b11b6`: 28 files. Commit chain: `a0f02ea5` feat (explicit keep-open PR) ->
  `193abb2e` fix (ambiguous identity refusals before watcher effects) -> `1203f765` docs (owner
  correction as ADR governing authority; round-1 rejected candidate) -> `96c20b61` fix (P1 repairs)
  -> `6423042a` test (walkthrough regression pinning) -> `45e6deb1` fix (same-repository qualified
  closing references count) -> `969b11b6` fix (origin fallback restricted to GitHub remotes).
- Git identity: `a0f02ea5`/`193abb2e` predate this Host and carry the prior machine identity
  (history-rewrite forbidden; disclosed in round 1). Every commit from `1203f765` on is
  KaolaBrother <yanleichen@hotmail.com>, no trailers. Incident disclosure: the originfix seat's
  first commit attempt `325f41a2` carried an environment-injected `Co-authored-by: Cursor` trailer;
  it was replaced BEFORE any push with `969b11b6` (same tree, same parent) via commit-tree — the
  superseded object never left the worktree (.cache/keepopen-originfix/REPORT.md discloses it).

## 2. Your three blocking findings — repaired and independently verified

1. P1-1 partial/duplicate intent -> close+auto-merge: intent is now LINE/TOKEN EXISTENCE (any
   keep_open_pr line, including an empty value; any --keep-open-pr token, including a bare one).
   Duplicates refuse `ambiguous_identity`; a lone empty line refuses `partial_marker`; wrong token
   `mode_mismatch` — all BEFORE close-mode selection, the OFFLINE placeholder, and every effect.
   Your probe.cjs semantics (empty + explicit_singleton lines, no flag/action, pr_auto_merge true)
   refuse online and offline with zero gh calls and zero operations (v4 rows a1-a3; your probe
   re-run bound to 6423042a; the refusal precedes the changed scanner bytes, so it carries).
2. P1-2 native closing associations ignored: closingIssuesReferences is requested in BOTH gh pr
   view and gh pr list; strictly normalized with measured/unmeasured states; explicit OPEN
   reuse/discovery refuses `native_closing_linkage` when the retained issue is associated and
   `native_closing_unmeasured` when the field is unreadable, before text/commit scans and before
   archive publication; no unlinking; clean reuse (`[]`) remains supported. Your reuse-probe
   manual-linked case refuses with one `pr.view` and nothing else (v4 b1/b3, b2 control).
3. P1-3 enabled auto-merge survives request-only: autoMergeRequest requested and normalized;
   non-null refuses `auto_merge_enabled`, unreadable refuses `auto_merge_unmeasured`; the remote
   setting is never modified; queue behavior is not claimed. Your auto-enabled probe refuses with
   no `suppressed_request_only` success (v4 c1/c2, d1-d4).

## 3. Bounded follow-ups

- Durable in-repo regression coverage: walkthrough scenario `testExplicitKeepOpenPrP1Repairs`
  (scripts/simulate-workflow-walkthrough.js) pins all of the above plus valid explicit create and
  clean OPEN reuse controls — inside the existing suite/chain, no new framework. It ran green in
  every required chain round (205/205 at the final candidate).
- Scanner association semantics: a closing keyword associates only the reference it immediately
  precedes; `Fix #999; related #143` -> [999]; `Fixes other/repo#143` ignored for our issue; a
  QUALIFIED reference matching the run own repository counts (your "match the reference's actual
  repository"): identity derives from the state claim_repository_id (all GitHub URL forms,
  case-insensitive; disagreeing lines fall through), the origin remote as fallback — GitHub URL
  forms only, so relative/absolute local paths and other hosts yield NO identity and qualified
  references count (fail-closed; the v5-measured relative-path hole in the first scanner fix was
  itself repaired and independently verified end-to-end in v6 with a no-network fixture design,
  including a discrimination control that reproduces the hole on 45e6deb1).
- ADR 0031 Status was flipped to Accepted BEFORE the final freeze (96c20b61), with Decision and
  Consequences extended for every repaired semantic; README/docs/api.md/architecture/
  workflow-state-contract/CHANGELOG[Unreleased] consistent; plugins mirror regenerated via
  edition-sync at each repair (mirror == canonical verified).
- No duplicate identity object was added; existing state/evidence identity mechanisms unchanged.

## 4. Actual checks, all bound to 969b11b6 (no waivers)

- Integration walkthrough full unsharded: 205/205 scenarios, spawn census 2745.
- Producer cross-forge chain (`kaola-workflow-run-chains.js --project issue-1113` = the npm test
  four-chain set + hoisted 10-step preamble): claude/codex/gitlab/gitea all exit 0, attempts 1, no
  timeouts, accepted_red none. Receipt `.cache/chain-receipt.json` (sha256 5566a090a45adcf4e3ea0187d2c6e18552d02b039b60a1e1893ae56b048367b8)
  headSha=969b11b6..., workTreeHash=clean, validationTestConsumes=[] — read and verified by the
  Host directly, not from worker prose.
- Focused standalone: validate-workflow-contracts, validate-script-sync, edition-sync --check,
  generate-routing-surfaces --check (24 surfaces), test-issue-1055-render-subtraction-oracle.
- Independent acceptance evidence (cache-only, non-implementer seats, fail-closed harness with
  bounded 7-file source binding, trace audits outOfSet=[], git.push in the refusal predicate,
  stage/candidate mapping): v3 (first suite bound to the real sink bytes; 47 rows + 42 controls,
  all issue-named risk paths), v4 (P1 repair recheck: 16/16 new discriminations + your two probes
  independently reproduced refusing), v5 (scanner repo-matching: 15/15 + discrimination control on
  6423042a), v6 (origin fallback: 9/9 + discrimination control on 45e6deb1 + 49-check parser
  helper). Every round carried unaffected rows forward only by recorded blob-diff scope.

## 5. Evidence pointers

- Round-1 delivery package: .cache/host-outer-delivery-1113.md (superseded candidate; kept for the
  record). This package: .cache/host-outer-delivery-1113-r2.md.
- Host acceptance records: host-indqa-v3-acceptance.md (within the v3 dir context), 
  host-indqa-v4-acceptance.md (Pass-B ruling; scanner ruling), host-indqa-v5-acceptance.md
  (relative-origin ruling), host-indqa-v6-acceptance.md (final).
- Seat reports: keepopen-p1repair/, keepopen-scannerfix/, keepopen-originfix/,
  keepopen-independent-pins-v3..v6/, keepopen-final-chains{,-v2,-v3,-v4}/, keepopen-docscope/.
- Independent suite REPORT hashes: v3 3571b98f..., v4 bd1d5f8d..., v5 f4093b8d..., v6 35bc8b18...

## 6. Honest limitations (scope rulings and recorded gaps, not waived checks)

1. The documented independent RED classes remain: (i) receipt durable-identity object (8 rows) —
   independent proposal beyond corrected scope; (ii) sink-side claim repository/digest/forge
   re-validation (7+3 rows) — corrected scope names issue/head/base/action; claim identity is
   owned by the claim machinery; (iii) two v2 fixture artifacts (optional issue_numbers is a valid
   singleton shape; a string-vs-number comparison). The independent suite is NOT called green.
2. Full-URL closing references remain an unverified compatibility gap (not counted, not asserted).
3. Slug-shaped garbage in a corrupted state claim_repository_id line is syntactically
   indistinguishable from a legitimate normalized OWNER/REPO (inherent to that state form;
   unreachable via origin, which parses GitHub URL forms only).
4. `http://` and `https://www.github.com` origin shapes yield no identity, so qualified references
   over-count (fail-closed direction; recorded in v6).
5. Unasserted observation from round 1 unchanged: archived reconcile performs claim cleanup +
   worktree removal when the archive is local_only — pre-existing shared normal-close machinery
   this issue must leave unchanged.
6. No authenticated Forge compatibility was measured (synthetic gh spy; closing linkage is
   content-derived; native-field shapes follow installed gh surface + GitHub docs).
7. The explicit_singleton positive path has no dedicated in-repo test file; its acceptance evidence
   is the in-suite walkthrough controls plus the independent cache suites.

## 7. Requested from the outer

Personal re-review of the exact frozen candidate `969b11b6bc7192361bfc5e6b840ef6773ebf655c`.
Explicit acceptance unblocks: serial finalize -> merge to main -> issue close -> small normal
release (smallest appropriate semver increment for an additive capability; official release
tooling; complete unwaived chain receipt bound to the exact publication commit; tag/release/
remote/cleanup verification; no installation). Findings -> Host repairs on the same assignment ->
affected recheck -> re-delivery.
