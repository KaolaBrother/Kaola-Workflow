# Outer personal-review delivery ROUND 3 — KW #1113 final frozen candidate (Host: zcode-KW-orchestrator-keepopen-pr)

Prepared 2026-10-03 for the outer KW Codex personal re-review. Round 2 (969b11b6) was NOT
ACCEPTED with two reproduced P1s; the original three P1 repairs were accepted then. This
delivery answers both round-2 findings. No merge, closure, or publication has occurred;
nothing is pushed. Findings return to the Host for repair and recheck.

## 1. Exact final frozen candidate

- Commit: `804c758b282af54595ef7026461228829ba1eb88` (verify: `git -C .kw/worktrees/issue-1113 rev-parse HEAD`)
- Branch: `workflow/issue-1113`; worktree clean; base `fe7e4443` = origin/main = v12.4.0
- Commit chain: `a0f02ea5` feat -> `193abb2e` fix -> `1203f765` docs (r1, rejected) -> `96c20b61`
  P1 repairs -> `6423042a` walkthrough regression -> `45e6deb1` same-repo qualified refs ->
  `969b11b6` GitHub-only origin fallback (r2, rejected) -> `804c758b` issue-URL recognition +
  repository_conflict.
- Identity disclosures unchanged from round 2 (two pre-Host machine-identity commits; the
  superseded trailer-carrying commit object never pushed).

## 2. Your two round-2 findings — repaired and independently verified

1. P1-r2-1 full issue-URL closing references: the bounded scanner now recognizes a closing
   keyword followed (same line, allowed separators) by `https://github.com/OWNER/REPO/issues/N`.
   It counts exactly when OWNER/REPO matches the run repository identity (case-insensitive);
   foreign URLs are consumed and ignored; an empty/unknown identity counts every URL
   (fail-closed, verified with a foreign-URL-unknown-identity control). Observed native forms
   covered: `Fixes: URL`, `Fixes URL`, `Fixes URL.`, surrounding text (your
   github-url-reference-observations.json, nodejs/node PRs 66406/66240/66371/66325). Applied
   through the shared closingIssueNumbers path (commit scan, OPEN body/title reuse, generated
   self-check). Outside-spec shapes (http://, www., /pull/N, keyword and URL on separate lines)
   are not matched and are documented in the ADR as outside the recognized form. The
   "unverified gap" doc wording is superseded by the native evidence.
2. P1-r2-2 stale state overriding actual origin: explicit mode now always reads BOTH the state
   claim_repository_id identity and the origin identity (GitHub-URL-only parser). Both parseable
   and disagreeing (case-insensitive) -> `explicit_keep_open_refused: repository_conflict`
   naming both, BEFORE discovery, scan, push, create, or placeholder (zero gh calls, zero
   operations — measured). Case-insensitive agreement proceeds; an unparseable origin
   (local/non-GitHub remote) lets the state stand, preserving every fixture-backed positive;
   no state -> origin; neither -> count-all.
- Your round2-probe re-run on the repaired bytes: url-closing-create -> refused
  `closing_linkage` (pr.list only); stale-repository-create -> refused `repository_conflict`
  (no gh call); own-qualified-refusal-control -> still refuses. Independently reproduced by
  the v7 seat bound to this commit.

## 3. Actual checks, all bound to 804c758b (no waivers)

- Integration walkthrough full unsharded: 205/205 scenarios, spawn census 2894 — includes the
  extended testExplicitKeepOpenPrP1Repairs (URL colon/no-colon/period refusals, foreign and
  no-keyword URL controls, repository_conflict with both identities in the message and no gh
  call, mixed-case agreement positive, reuse-lane URL refusal, and every earlier control:
  original three P1s, scanner same/foreign repo, origin fallback, clean create/reuse).
- Producer cross-forge chain receipt `.cache/chain-receipt.json` (sha256 3c4f7a9ab35383ac1edb3c43a395b81fda5f0f86d1ca57d402d2cd2f473dc508):
  headSha=804c758b282af54595ef7026461228829ba1eb88, workTreeHash=clean,
  validationTestConsumes=[], claude/codex/gitlab/gitea all exit 0, attempts 1, no timeouts,
  accepted_red none — read and verified by the Host directly.
- Focused standalone: validate-workflow-contracts, validate-script-sync, edition-sync --check,
  generate-routing-surfaces --check (24 surfaces), render-subtraction oracle — all exit 0.
- Independent micro-recheck v7 (cache-only, non-implementer seat, fail-closed harness,
  no-network fixtures, zero-transport assertions): 24/24 rows PASS — 8 URL rows (incl. the
  unknown-identity-counts-foreign control), 8 conflict/agreement rows, all 6 v6 origin rows
  re-run, smoke; 65-check parser helper (all 47 v6 cases hold + 16 URL cases); discrimination
  control on 969b11b6 reproducing BOTH round-2 P1s end-to-end (URL create RED; stale-state
  create RED with get-url 0); carryover from v6 by recorded blob-diff scope with the honest
  originLookup design-change note. REPORT sha256 b64a392b... (Host acceptance
  host-indqa-v7-acceptance.md).

## 4. Evidence pointers

- Round-1/-2 packages: host-outer-delivery-1113{,-r2}.md (superseded candidates, kept).
- This package: .cache/host-outer-delivery-1113-r3.md. Host acceptances: host-indqa-v3..v7.
- Seat reports: keepopen-{docscope,p1repair,scannerfix,originfix,r2fix}, keepopen-independent-
  pins-v3..v7, keepopen-final-chains{,-v2..-v5}. Independent REPORT hashes: v3 3571b98f, v4
  bd1d5f8d, v5 f4093b8d, v6 35bc8b18, v7 b64a392b (prefixes).

## 5. Honest limitations (scope rulings and recorded gaps, not waived checks)

1. The documented independent RED classes remain limitations (receipt durable-identity
   proposal; sink-side claim repository/digest/forge re-validation; two v2 fixture artifacts).
   The independent suite is NOT called green.
2. Outside-spec URL shapes (http://, https://www.github.com, /pull/N, keyword and URL on
   separate lines) are not recognized; with an unknown identity they are NOT counted (not
   matched at all) — recorded in the ADR as outside the recognized form.
3. Slug-shaped garbage in a corrupted state claim_repository_id line remains syntactically
   indistinguishable from a legitimate normalized slug (inherent; unreachable via origin).
4. Unchanged recorded observations: http:// and www. origin shapes yield no identity
   (fail-closed over-count); local_only-archive cleanup ordering is pre-existing shared
   normal-close machinery.
5. No authenticated Forge compatibility measured (synthetic gh spy; URL association basis is
   your supplied read-only native observations, which this repair encodes conservatively).
6. The explicit_singleton positive path remains covered by in-suite walkthrough controls plus
   the independent cache suites (no dedicated in-repo test file).

## 6. Requested from the outer

Personal re-review of the exact frozen candidate `804c758b282af54595ef7026461228829ba1eb88`.
Explicit acceptance unblocks: serial finalize -> merge to main -> issue close -> small normal
release (smallest appropriate semver increment for an additive capability; official release
tooling; complete unwaived chain receipt bound to the exact publication commit; tag/release/
remote/cleanup verification; no installation). Findings -> Host repairs on the same
assignment -> affected recheck -> re-delivery.
