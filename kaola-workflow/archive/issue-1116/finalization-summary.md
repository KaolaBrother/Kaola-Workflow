# Finalization summary — issue-1116

Candidate: `9c83325d` on `workflow/issue-1116` (base `620398b7`, one commit).

## Delivered

- **#1116 — consumer-declared test-consumed band.** A consumer repo can now declare the paths its
  validation reads in its own `kaola-workflow/config.json` under `validation_test_consumes`: exact
  repo-relative paths plus trailing-slash, segment-bounded directory prefixes. The declaration is
  read by ONE shared reader (`readValidationTestConsumes`) and matched by ONE matcher
  (`matchesDeclaredTestConsumedPath`).
- **Every hash site wired.** Runner `run` (through `main`/`runValidation`/`computeLandableTreeDigest`),
  runner `record`, the self-host chain producer, and the finalize gate's `testConsumedExtra` default
  all read the declaration through that reader, so the runner band and the finalize band stay equal
  (#710: equal bands, not equal values). There is deliberately no widening CLI flag.
- **Receipts name the band.** The runner receipt echoes `test_consumed_paths` inside the semantic
  block (binding `vector_id`/`receipt_sha256`); `record` writes a column-0
  `validation_test_consumes:` line beside `validated_candidate_hash`; the chain receipt records
  `validationTestConsumes`. The gate replays the recorded band and treats a declaration change with
  no re-record as stale instead of comparing two bands as equal.
- **#709-safe semantics.** Absent or empty reproduces the old band byte-for-byte: no receipt field,
  no digest move, no record churn. Present-but-malformed fails closed at every producer (exit 2 on
  `run`, exit 1 with a typed reason on `record`/producer) and at the gate
  (`validation_band_malformed`), never silently hashing under `[]`. A declaration that would make
  the record itself visible is refused (`validation_band_self_referential`).
- **Tests.** `scripts/test-validation-runner.js` covers the consumer declaration fixture (absent,
  exact, prefix, undeclared control, empty, malformed, unparseable config); `scripts/test-finalize-door.js`
  T18 covers the `run`/`record`/gate consumer arm, declaration-change staleness, legacy no-echo
  records, malformed refusals, the self-referential refusal, the self-host producer replay, and
  both-family movement parity for the same edit. The walkthrough finalize fixtures now seed the band
  and echo through the shared reader.
- **Docs.** `README.md`, `docs/api.md`, `CHANGELOG.md` `[Unreleased]`, plus the generated Codex,
  GitLab and Gitea mirrors via `edition-sync --write`.

## Evidence

- Pre-change baseline preserved: the issue's synthetic consumer fixture with **no declaration**
  still yields `candidate_digest` `4533164e34fbb30aeae2a5d95f7b77441ceabbff5f6812c4a486272b2ba12d36`
  for pass and fail, byte-identical to the measured pre-change runner.
- With `validation_test_consumes: ["docs/generated/x.json"]`, the same fixture moved: pass
  `79a98aaa0b90a79014ea84c417c19cf5977c8e2738f5ae5643581e9d989ac9f7`, fail
  `229ff9844782da241641c6dc7229bafe3b3eb13616e9d34a28401710aff91ac2`.
- `record` wrote the echo beside the hash; the gate was `chains_green`; an undeclared docs edit
  stayed green, a declared edit read `final_validation_stale`, and a malformed declaration read
  `validation_band_malformed` with `green: false`.
- Old/new runner comparison on the same undeclared repo: identical `candidate_digest` and
  `vector_id`; old/new `record` files byte-identical under `cmp`.
- Gate commands on the frozen candidate: `npm test` exit 0 (claude, codex, gitlab, gitea);
  `npm run test:kaola-workflow:claude:full` exit 0; `node scripts/simulate-workflow-walkthrough.js`
  205/205 scenarios, exit 0; `test-validation-runner` PASSED; `test-finalize-door` 902 assertions;
  `test-run-chains` 279 assertions; `test-claim-hardening` 953 assertions; kernel conformance 239
  assertions; oracle kernel 48 assertions; `validate-workflow-contracts` passed;
  `edition-sync --check` and `validate-script-sync` green.
- Independent review (devin/opus-fusion, read-only, frozen tree): checks 1–6 and 8 PASS, check 7
  PASS with gaps; no blocking issues. It re-ran `test-validation-runner` (PASSED),
  `test-finalize-door` (902 assertions), `edition-sync --check` (exit 0), and its own fail-closed
  probes across all hash sites.

## Known failures and unverified scope

- No blocking defect. Independent-review observations (non-blocking, recorded by the Host as
  follow-ups, deliberately not repaired in this candidate): refusal wording overstates "config.json
  declares" when the file is unreadable/non-object/a directory; the broken-config refusal at
  `run`/`record`/finalize is a deliberate, documented stricter behavior than `readPriorityConfig`'s
  fallback; library default-band asymmetry reachable only by direct calls; test-seam overrides can
  split bands but there is no CLI route; the self-host producer lacks the record self-reference
  guard and that guard is path-based (ignores `.gitignore`); the walkthrough harness falls back to
  `[]` on malformed declarations (fixtures declare nothing); residual test gaps a–g; three new
  exports missing from the `docs/api.md` table. None affects the accepted behavior or the gate.
- No tag, release, install, or runtime restart was performed.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- README.md
- docs/api.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js
- plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-run-chains.js
- scripts/kaola-workflow-validation-runner.js
- scripts/simulate-workflow-walkthrough.js
- scripts/test-finalize-door.js
- scripts/test-validation-runner.js

## Follow-Up Items

- Independent-review observations 1–8 are recorded with the Host as non-blocking follow-ups; no
  repair was made in this candidate.
- No new issue was filed by this run: no run-discovered defect remained after acceptance.

## Final readiness

READY — Host-accepted candidate `9c83325d`, full gate green on the frozen tree, worktree clean;
merge, push, closure, archive, and cleanup authorized by the Host.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1116/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1116/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1116/finalization-summary.md
- kaola-workflow/archive/issue-1116/mission-ledger.jsonl
- kaola-workflow/archive/issue-1116/workflow-state.md
