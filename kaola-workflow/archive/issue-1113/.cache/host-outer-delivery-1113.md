# Outer personal-review delivery — KW #1113 frozen candidate (Host: zcode-KW-orchestrator-keepopen-pr)

Prepared 2026-10-02 by the KW ZCode Host for the outer KW Codex personal review required by issue #1113
(owner correction 2026-10-02). The Host accepts this exact candidate; no merge, closure, or publication
happens before the outer's explicit acceptance. Findings return to the Host for repair and recheck.

## 1. Exact frozen candidate

- Commit: `1203f76510f5dff3418b18ae6b5db116e0c1899a` (verify: `git -C .kw/worktrees/issue-1113 rev-parse HEAD`)
- Branch: `workflow/issue-1113`; worktree `.kw/worktrees/issue-1113` (clean, porcelain empty)
- Base: `fe7e4443` = origin/main = released v12.4.0; 26 files changed, +1374/-163
- Commits: `a0f02ea5` feat(#1113) explicit GitHub singleton keep-open PR; `193abb2e` fix(#1113) refuse ambiguous
  explicit keep-open before watcher effects; `1203f765` docs(#1113) record the owner correction as ADR 0031
  governing authority. Docs+scripts+templates+rendered plugin mirrors only; **no installer, adoption bundle,
  manifest, resolver, activation, or uninstall code anywhere** (owner-corrected scope: none commissioned).
- Git identity disclosure: `a0f02ea5`/`193abb2e` predate this Host and carry the prior machine identity;
  history rewriting is forbidden so they stand as historical evidence. `1203f765` and every later commit
  (finalize/sink/archive children included) are KaolaBrother <yanleichen@hotmail.com>, no trailers.

## 2. Corrected-scope coverage (issue #1113, five minimal points)

1. Intent carried consistently through finalize, archive/resume, request creation/reuse, and both watcher lanes,
   preserving repository/run/issue/branch/worktree identity and evidence — `assessKeepOpenPr` pure gate reads
   live+archived state; cross-state signature conflict refuses (`state_conflict`); finalize captures
   `keep_open_pr` and passes the flag only for `explicit_singleton` (finalize.skeleton/slots + rendered mirrors).
2. Correct PR without closing references; commit-message hazards validated before effects; conflicting intent
   and unsafe close-mode reuse rejected — closing-keyword scanner over base..head commit messages and over
   PR body/title (`assertNoClosingCommits`, `assertExplicitReuseSafe`), fail-closed on head/base/scan failure;
   repeated identity field/CLI flag -> `ambiguous_identity`, non-canonical token -> `malformed_issue`, before
   push/create/OFFLINE placeholder (explicit mode refuses OFFLINE placeholders outright).
3. Never auto-merge or enqueue in this mode even with `pr_auto_merge: true` — emits
   `pr_auto_merge: suppressed_request_only`; no queue probe, no `gh pr merge`, config untouched.
4. Truthful reconciliation: `intentionally_kept_open` (not a partial close), `keep_open_violation` (CLOSED; no
   reopen), `unknown` (unreadable probe; not skipped_offline, not success); watcher refuses any non-canonical
   `keep_open_pr` agreement (`explicit_keep_open_refused`) before archive/mainline advance/claim
   cleanup/worktree removal, never falling through to ordinary close.
5. Idempotent retries/resume (durable idempotent sink record with compared extra keys; created/reused/already-
   merged lanes), unrelated runs preserved (refusals leave inventory/MAIN/identity/ledger unchanged — measured),
   normal-close behavior unchanged (close-mode branches keep original bytes; #336/#1098 legacy refusal intact;
   GitLab/Gitea unchanged).

## 3. Actual checks run, bound to 1203f765 (all exit 0, no waivers)

- Integration walkthrough, full unsharded: 204/204 scenarios (`simulate-workflow-walkthrough.js`, 125s).
- Producer cross-forge chain via `kaola-workflow-run-chains.js --project issue-1113` (= the npm test four-chain
  set with hoisted preamble): claude/codex/gitlab/gitea all exit 0, attempts 1, no timeouts. Receipt
  `.cache/chain-receipt.json` (sha256 07d3ceb6eb97db1536eee8c4375ac77ab8821b618e289fe4dcd63e7ed8c603be) headSha=1203f765, workTreeHash=clean, validationTestConsumes=[].
- Focused standalone: test-claim-hardening.js (953 assertions), test-sink-merge.js (1258 assertions),
  validate-workflow-contracts.js, test-active-folders-field-parity.js, generate-routing-surfaces --check,
  test-generate-routing-surfaces.js, test-issue-1055-render-subtraction-oracle.js, edition-sync --check.
- Independent acceptance suite (cache-only, non-implementer seat, first suite actually bound to the candidate's
  sink-pr/claim bytes — measured: no v1/v2 process executed them): 47 suite rows + 42 controls. All issue-named
  risk paths PASS candidate-bound: malformed/conflicting/missing intent (12 sink + 24 watch refusals with zero
  unsafe effects), unsupported bundles, wrong head/base, closed-unmerged, OPEN reuse, MERGED no-republish,
  request-only with auto-merge configured, unknown/violating observations, live/archive positives, linked-
  worktree canonical-MAIN resolution, unrelated-run isolation, created/reused stability.

## 4. Evidence pointers

- Independent v3 REPORT: `.cache/keepopen-independent-pins-v3/REPORT.md` (sha256 3571b98fdc9d861cc47a8a99860a3d05b8b2f2002f6f881862ab7153fc1c3239) + matrices, controls, runs; Host acceptance `.cache/host-indqa-v3-acceptance.md`.
- Chains/walkthrough report: `.cache/keepopen-final-chains/REPORT.md` + logs/.
- Docscope: `.cache/keepopen-docscope/REPORT.md`; ADR: docs/decisions/0031 (Context now records the owner
  correction as governing authority); CHANGELOG [Unreleased]; README/docs/api.md updated.
- Prior-run immutable evidence preserved: `.cache/keepopen-implementation/` and `.cache/keepopen-independent-pins`
  plus `-v2` (bound to a0f02ea5-era bytes; not claimed for this candidate).

## 5. Honest limitations (not waived run checks; scope rulings recorded by the Host)

1. Independent-suite REDs on 1203f765 (17 suite + 3 control rows), classified and recorded: (i) 8 rows want a
   durable claim/evidence identity object inside the request receipt — independent proposal beyond the corrected
   scope, previously ruled non-required; (ii) 7+3 rows want sink-side re-validation of claim repository/digest/
   forge fields — corrected scope names issue/head/base/action validation; claim identity is created and
   validated by the claim machinery; (iii) 2 rows are v2 fixture-design artifacts (optional `issue_numbers`
   omission is a valid singleton shape; a string-vs-number comparison).
2. Unasserted observation: archived reconcile performs claim cleanup + worktree removal while the archive is
   local_only. The explicit-mode gates sit BEFORE those effects; the effect ordering is pre-existing shared
   normal-close machinery this issue must leave unchanged.
3. No authenticated Forge compatibility was tested (synthetic gh spy; closing linkage is content-derived).
4. The explicit_singleton positive path has no dedicated in-repo test; its acceptance evidence is the
   independent cache suite (repo suites pin the refusal lane, lifecycle semantics, structural contract, renders).
5. ADR 0031 Status still reads "Proposed, pending Host acceptance": the Host acceptance condition is met now,
   but flipping the byte would mutate the frozen candidate and invalidate the bound receipt; deferred to the
   finalize/merge step.
6. Independent suite is cache-only by design; integration into shared tests was not requested and remains Host-held.

## 6. Requested from the outer

Personal review of the exact frozen candidate above against the corrected issue scope. Explicit acceptance
unblocks: serial finalize -> merge to main -> issue close -> small normal release (smallest appropriate semver
increment for an additive capability; official release tooling; complete unwaived chain receipt bound to the
exact publication commit; tag/release/remote/cleanup verification; no installation). Findings -> Host repairs
on the same assignment -> affected recheck -> re-delivery.
