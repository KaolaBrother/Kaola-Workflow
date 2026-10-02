# Issue 1113: independent micro-recheck v7 of the final candidate (devin-KW-i1113-indqa5)

Factual record for the Host. Not a verdict. The Host holds the verdict, test meaning, and the
mission ledger. Paths are relative to `kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v7/`
unless absolute. Times UTC 2026-10-02 (local 2026-10-03, UTC+8).

## 1. Context, custody, binding

- **Workflow context.** Loaded the installed `workflow-next` for run context only; read ledger line
  n=1 (`in-flight`, names this v7 dispatch `devin-KW-i1113-indqa5`). No claim, no ledger write, no
  mission, no finalize, no forge write. All forge traffic went to the local logging `gh` spy; real
  `gh` was never called. No Git network transport ran (§4, `net=0` every row).
- **Repository read-only:** `rev-parse`, `rev-list`, `status`, `log`, `diff`, `ls-tree`, `archive`.
- **Frozen candidate** `804c758b282af54595ef7026461228829ba1eb88` on `workflow/issue-1113`; only
  parent `969b11b6…`; subject `fix(#1113): recognize issue-URL references and refuse repository
  conflicts`; author = committer `KaolaBrother <yanleichen@hotmail.com>`; no trailers.
  - Facts recorded at start (`runs/00-binding/candidate-facts.txt`, 18:32:25Z) and end
    (`runs/07-final-readonly-facts.txt`, 18:33:14Z). `diff` of the two: only the date line.
  - Worktree HEAD = branch ref = `804c758b…`; `git status --porcelain` 0 lines (start and end).
  - MAIN HEAD `fe7e4443…`; MAIN status only `?? kaola-workflow/issue-1113/`.
  - Host ledger SHA-256 `14fe5b17…833e`, mtime 02:27:12 local, unchanged start→end. I wrote no
    ledger bytes.
- **Prior results untouched.** `ARTIFACT-HASHES`: v1 `619e46bb…`, v2 `0c0e352f…`, v3 `bf0308ff…`,
  v4 `7ad67b55…`, v5 `f366d26b…`, v6 `12ab2a41…`. v4/v5/v6 sidecars check OK. Full v6
  `shasum -c ARTIFACT-HASHES`: 0 failures over 3,586 listed files. No file in v4/v5/v6 is newer than
  the v6 sidecar (checked start and end, after step 04 read v6's `runs/candidate-969b11b6`).
  v6 `REPORT.md` = `35bc8b18…` (the hash in host-indqa-v6-acceptance).
- **Inputs read:** `keepopen-r2fix/REPORT.md` (`f249920f…`), `.kaola/outer-review-1113/review-r2.md`
  (`345d3e69…`), `host-indqa-v6-acceptance.md` (`6e0a29d2…`), v6 `REPORT.md` and controls.
  `github-url-reference-observations.json` hashed (`cf2efc95…`), not re-derived.
- **Node** `/Users/ylmacstudio/.local/bin/node` v24.21.0; **Git** 2.53.0. Every `stderr.raw` for
  steps 01–06 is 0 bytes.

## 2. Harness (v6 harness reused; fail-closed rules unchanged)

- **Byte-identical to v6** (`runs/00-binding/harness-identity.txt`, `cmp`): `adapter-v6.js`
  (`3197aec4…`, includes the `fixture.originUrl` knob: fetch URL = exact string, push URL = absolute
  local bare, `protocol.allow=never`, `protocol.file.allow=always`), `bound-source.js`,
  `controls-v3.js`, `fault-preload.js`, `gh-spy.js`, `helper-probe-v6.js`, `predicates.js`
  (`decideExit`, `PUBLICATION_UNSAFE` incl. `git.push`), `run-step.js`, `suite-v3.js`,
  `trace-preload.js`.
- **Derived in v7** (diffs in `runs/00-binding/*-v6-to-v7.diff`):
  - `new-rows-v7.js` (`80940d94…`): same `commonNoEffect`, refuse/create predicates, identity
    evidence and `decideExit` exit as v6. Changes: the row set (§4); `commitInHistory` applied to
    every refuse row with a head commit; conflict rows add `conflictMessageNamesBoth` (exact
    sentence) and `noClosingLinkageReason`; create rows add `noClosingUrlInBodyOrTitle`; the helper
    sets extended (§4.4); `v6-s1` now expects the origin lookup (decision-table change, §3).
  - `blobdiff-v7.js` (`0ca117f1…`): `blobdiff-v6.js` with header comment and schema name changed
    only; same `ok` rule (exactly `sink-pr.js` changed in the bound set, mirror = canonical, only
    parent = old commit).
  - `env-v7.sh`, `facts-v7.sh` (adds v6 to the immutability checks), `steps-v7.sh` (the exact step
    sequence below).
- Controls hashes are in both facts files and in every `runs/NN-*-step/process.json`
  (`controlsAtStart`); unchanged between step 00 and step 07.

## 3. Bound source and blob-diff scope (steps 01, 02, 06)

| step | command (full argv/env in `runs/NN-*-step/process.json`) | exit |
|---|---|---|
| 01 | `bound-source.js build <MAIN> 804c758b… runs/candidate-804c758b` | 0 |
| 02 | `blobdiff-v7.js <MAIN> <v6 manifest 969b11b6> <v7 manifest 804c758b> runs/02-blobdiff.json` | 0 (`ok: true`) |
| 06 | `bound-source.js verify runs/candidate-804c758b/bound-source-manifest.json` | 0 (`ok: true`, 7 files) |

- **Manifest** digest `c631ca52cc512911ce72ff5eb8d68f59b17a32a8d94283d2de2e9d543a425196`, tar
  `a0c08fe8…e457`, 7 named files via `git ls-tree` + `git archive`.
- **Bound set:** only `scripts/kaola-workflow-sink-pr.js` changed (`f457e2e8` → `89abc0f0`).
  Blob-identical: `claim.js` `3e5708f6`, `active-folders.js` `bb7b6d23`, `adaptive-schema.js`
  `df54ad4a`, `classifier.js` `df5599bf`, `closure-contract.js` `c407c9be`, `test-git-fixture.js`
  `26b21f8f`.
- **Whole range** (numstat): `CHANGELOG.md` +3/−1, `README.md` +3/−1, `docs/api.md` +12/−3,
  `docs/architecture.md` +3/−1, `docs/decisions/0031-…md` +32/−11, Codex mirror `sink-pr.js`
  +42/−24, `scripts/kaola-workflow-sink-pr.js` +42/−24, `scripts/simulate-workflow-walkthrough.js`
  +125/−4. Mirror blob `89abc0f0` = canonical (`mirrorEqualsCanonical: true`).
- **Sink hunk headers** (`git diff -U0`; full diff `runs/02-blobdiff-sink.diff`), read at 804c758b:
  ```
  @@ -28,3 +28,5 @@                                                  header comment
  @@ -158,15 +160,16 @@ function closesBody(members) {               scanner comment + CLOSING_ASSOC_RE
  @@ -218 +221,2 @@ function sameRepository(owner, repo, identity) {   closingIssueNumbers doc comment
  @@ -226 +230 @@ function closingIssueNumbers(…) {                    bare: match[4] -> match[7]
  @@ -227,0 +232 @@ function closingIssueNumbers(…) {                  + qualified: match[6] via sameRepository(4,5)
  @@ -260,0 +266,6 @@ function originOwnerRepo(root) {                resolveClaimRepositoryIdentity comment
  @@ -262,0 +274,5 @@ function resolveClaimRepositoryIdentity(…) {    + fromOrigin; conflict throw
  @@ -264 +280 @@ function resolveClaimRepositoryIdentity(…) {         return originOwnerRepo(root) -> return fromOrigin
  @@ -775,3 +791,5 @@ function main() {                               comment only
  ```
- **Executable changes** (nothing else executable moved; `module.exports`, `asOwnerRepo`,
  `githubUrlOwnerRepo`, `claimRepositoryFromTexts`, `originOwnerRepo`, the call site and its gate
  order are unchanged):
  1. `CLOSING_ASSOC_RE`: keyword + separator prefix byte-equal; a new first alternative
     `https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/(\d+)\b`; the qualified
     and bare alternatives are byte-equal, renumbered to groups 4–6 and 7. Flags `gi` unchanged.
  2. Loop: group 7 → bare; groups 1–3 (URL) and 4–6 (qualified) each gated by the unchanged
     `sameRepository` (empty identity → true; else case-insensitive `OWNER/REPO` equality).
  3. `resolveClaimRepositoryIdentity`: origin is always read (explicit mode only); both non-empty and
     unequal ignoring case → throw `explicit_keep_open_refused: repository_conflict. State repository
     is <state>, origin repository is <origin>. Nothing was pushed or created.`; else state, else
     origin.
- Behavioral consequence relevant to harness expectations: in explicit mode the sink child now runs
  `git remote get-url origin` even when state yields an identity (after the marker/OFFLINE gates).
  v6's `v6-s1` check `originLookup: false` was therefore re-expressed as `true` in v7 (§4.3).

## 4. Steps run and results

| step | command | exit | binding / result |
|---|---|---|---|
| 00 | `facts-v7.sh`, harness `cmp`, harness diffs → `runs/00-binding/` | — | 804c758b, clean |
| 03 | `. env-v7.sh B-newrows-804c758b; run-step.js … node controls/new-rows-v7.js` | **0** | **24/24 PASS**, trace audit ok (119 records, `outOfSet: []`), bound source ok before and after |
| 04 | same rows against v6's read-only extraction of **969b11b6** (manifest `35b2926c…`) | 1 | discrimination control: 7/24 PASS, 17 RED (§4.6) |
| 05 | `KW_V3_ONLY_ROWS=__no_such_row__` | 1 | fail-closed: 0 rows → `trace audit failed: out-of-set=[] records=0`, exit 1 |
| 07 | `facts-v7.sh` again | — | identical to step 00 except the date |

Every step-03 row: `binding.commit = 804c758b…`, `boundSourceBeforeOk` and `boundSourceAfterOk`
true, manifest digest `c631ca52…`, stage tested `["request"]`, `noNetworkTransportInGitTrace` true.
Per-row sink argv/pid/exit/stdout/stderr, gh JSONL, `git-trace.raw`, and identity evidence (state
lines, origin string + hex, push URL, `protocol.allow`, get-url trace lines) are in
`runs/B-newrows-804c758b/new-rows-summary.json` and `scenarios/<row>/`.

Identity evidence legend: **state** = `claim_repository_id` lines measured from the MAIN state
bytes; **origin** = `git remote get-url origin` on the fixture MAIN; **get-url** = count of
`trace: built-in: git remote get-url origin` in the sink child's GIT_TRACE. "local bare" = the
row's absolute `…/scenarios/<row>/repo/origin.git` (no override; `protocol.allow` unset, push URL =
same path). Override rows: push URL = local bare, `protocol.allow=never`.

"Full no-effect set" = `noPublicationUnsafe`, `ghReadOnly`, `noClosesInGhArgv`, `noAutoMerge`,
`projectUnchanged`, `linkedWorktreeProjectUnchanged`, `mainUnchanged`, `branchUnchanged`,
`claimEvidenceUnchanged`, `syntheticPrUnchanged`, `noOfflinePlaceholder`, plus `noPushInGitTrace`,
`noSinkResultLine`, `outcomeRefused`.

"Create set" = exit 0; stdout `pr_auto_merge: suppressed_request_only`, `pr_request: request_only`,
`publication: request_published`, `mainline_publication: pending`, `sink_pr: created`; exactly one
`pr create`; body `Keeps #143 open`; no keyword before `#143` or before an `…/issues/143` URL in
body/title; no `--fill`; no merge/close/reopen; ops `pr.list, pr.create, git.push, request.record,
archive`; branch ref on the local bare equals the local ref.

### 4.1 URL rows (assignment item 2)

| row | state / origin / get-url | commit | observed on 804c758b |
|---|---|---|---|
| `v7-u-a1-own-url-colon-create` | `https://github.com/KaolaBrother/VRPCadCore.git` / local bare / 1 | `Fixes: https://github.com/KaolaBrother/VRPCadCore/issues/143` | **PASS** 23 checks. Exit 1 `sink-pr: refusing: explicit_keep_open_refused: closing_linkage. Commit messages reachable from workflow/issue-143 and not from main close issue(s) 143. Nothing was pushed or created.` Ops `["pr.list"]` (1 gh call). Full no-effect set; commit in history. |
| `v7-u-a2-own-url-nocolon-create` | same | `Fixes https://github.com/KaolaBrother/VRPCadCore/issues/143` | **PASS** 23. Same refusal, ops, no-effect set. |
| `v7-u-a3-own-url-trailing-period-create` | same | `Fixes https://github.com/KaolaBrother/VRPCadCore/issues/143.` | **PASS** 23. Same refusal, ops, no-effect set. |
| `v7-u-b1-foreign-url-create` | same | `Fixes https://github.com/other/repo/issues/143` | **PASS** 16. Create set; commit in history. |
| `v7-u-c1-nokeyword-own-url-create` | same | `See https://github.com/KaolaBrother/VRPCadCore/issues/143` | **PASS** 16. Create set; commit in history. |
| `v7-u-d1-unknown-otherhost-own-url-create` | none (`[]`) / `https://gitlab.com/o/r.git` (hex `68747470733a2f2f6769746c61622e636f6d2f6f2f722e676974`) / 1 | `Fixes https://github.com/KaolaBrother/VRPCadCore/issues/143` | **PASS** 25. `closing_linkage` refusal before push, ops `["pr.list"]`, full no-effect set. |
| `v7-u-d2-unknown-abspath-own-url-create` | none / local bare / 1 | same | **PASS** 23. Same. |
| `v7-u-d3-unknown-otherhost-foreign-url-create` | none / `https://gitlab.com/o/r.git` / 1 | `Fixes https://github.com/other/repo/issues/143` | **PASS** 25. Same refusal. Added control: with unknown identity even a foreign URL counts, i.e. the count is fail-closed rather than an identity match. |

The URL refusals occur at the existing commit scan, which sits after open-request discovery
(`pr list`) and before push; the same point as the qualified-reference refusal (`v6-c1`, `v7-r-c2`).

### 4.2 Conflict rows (assignment item 3)

| row | state / origin (hex) / get-url | commit | observed on 804c758b |
|---|---|---|---|
| `v7-r-a1-conflict-state-own-origin-foreign` | `https://github.com/KaolaBrother/VRPCadCore.git` / `https://github.com/other/repo.git` (`68747470733a2f2f6769746875622e636f6d2f6f746865722f7265706f2e676974`) / 1 | `Fixes KaolaBrother/VRPCadCore#143` | **PASS** 27. Exit 1 `sink-pr: refusing: explicit_keep_open_refused: repository_conflict. State repository is KaolaBrother/VRPCadCore, origin repository is other/repo. Nothing was pushed or created.` **0 gh calls, 0 operations**, no push in GIT_TRACE, no `closing_linkage` text, full no-effect set, commit in history. |
| `v7-r-a2-conflict-stale-state-foreign-origin-own` (review-r2 P1 shape) | `https://github.com/other/repo.git` / `https://github.com/KaolaBrother/VRPCadCore.git` (`…4b616f6c6142726f746865722f565250436164436f72652e676974`) / 1 | `Fixes KaolaBrother/VRPCadCore#143` | **PASS** 27. Exit 1 `… repository_conflict. State repository is other/repo, origin repository is KaolaBrother/VRPCadCore. Nothing was pushed or created.` 0 gh calls, 0 operations, full no-effect set. |
| `v7-r-b1-agree-mixedcase-clean-create` | `https://github.com/KaolaBrother/VRPCadCore.git` / `https://github.com/kaolabrother/vrpcadcore.git` / 1 | (fixture default, no closing text) | **PASS** 17. Create set. |
| `v7-r-b2-agree-mixedcase-own-qualified-create` | same | `Fixes KaolaBrother/VRPCadCore#143` | **PASS** 25. `closing_linkage` at the commit scan (not `repository_conflict`), ops `["pr.list"]`, full no-effect set. |
| `v7-r-b3-agree-mixedcase-foreign-qualified-create` | same | `Fixes other/repo#143` | **PASS** 18. Create set; commit in history. |
| `v7-r-c1-state-localorigin-foreign-qualified-create` | state / local bare / 1 | `Fixes other/repo#143` | **PASS** 16. Create set. |
| `v7-r-c2-state-localorigin-own-qualified-create` | state / local bare / 1 | `Fixes KaolaBrother/VRPCadCore#143` | **PASS** 23. `closing_linkage` refusal before push, ops `["pr.list"]`. |
| `v6-a1` … `v6-e1` (3(d), re-run with v6 inputs and expectations) | none / `repo/origin.git`, `../origin.git`, local bare, GitHub own URL, GitHub own URL, `https://gitlab.com/o/r.git` / 1 each | `Fixes other/repo#143` (c1: `Fixes KaolaBrother/VRPCadCore#143`) | **all PASS** (25/25/23/25/18/25 checks). a1, a2, b1, c1, e1: `closing_linkage` refusal before push, ops `["pr.list"]`. d1: create set, push on the local bare. Same meanings as v6 §4.1. |

What the identity evidence shows:

- **r-a1/r-a2:** both identities parse and disagree; the refusal names both, in state/origin order,
  with zero gh calls and zero operations, so it precedes discovery, scan, push, create, and
  placeholder. r-a1's message names `KaolaBrother/VRPCadCore`, the MAIN state, not the linked
  worktree decoy `decoy/not-the-claim`.
- **r-b1–b3:** same-repository GitHub identities differing only in case do not conflict; the shared
  identity is non-empty (b2 counts own, b3 ignores foreign).
- **r-c1/r-c2, u-a/b/c, s1:** state present, origin is the absolute local bare (origin parses to
  `''`): origin was read (get-url 1) and state stands (c2 counts own, c1/u-b1 ignore foreign).
- **v6 a1–e1:** no state line; origin decides exactly as at 969b11b6.

### 4.3 Smoke (assignment item 4)

| row | observed |
|---|---|
| `v6-s1-explicit-create-clean` | **PASS** 15. State `https://github.com/KaolaBrother/VRPCadCore.git`, origin local bare, get-url 1 (v6 expected 0; changed by design, §3). Create set. |
| `v6-s2-single-empty-marker-online` (one `keep_open_pr: ` line, no flag, no action) | **PASS** 21. Exit 1 `explicit_keep_open_refused: partial_marker. …`. Zero gh calls, zero operations, no push, **get-url 0** (refusal precedes identity resolution). Full no-effect set. |

### 4.4 Helper controls on the bound bytes (`v7-h1-url-scanner-helper`, PASS, 65 checks)

Output in `runs/B-newrows-804c758b/scenarios/v7-h1-url-scanner-helper/`. Child loaded only the
bound `sink-pr.js`, exit 0, 75 answers, 0 errors. 63 asserted cases, all exact:

- All 47 v6 asserted cases (indices 0–46: `githubUrlOwnerRepo` 15, `asOwnerRepo` 12,
  `closingIssueNumbers` 20) hold with v6 expectations.
- URL (indices 47–62, `OWN` = `KaolaBrother/VRPCadCore`, `URL` = `https://github.com/OWN/issues/143`):
  - own → [143]: `Fixes: URL`, `Fixes URL`, `Fixes URL.`, `context Fixes: URL remains.` @OWN;
    `Fixes: URL` @`https://github.com/KaolaBrother/VRPCadCore.git`.
  - foreign → []: `Fixes https://github.com/other/repo/issues/143` @OWN and @GitHub-URL identity;
    `Fixes URL` @`https://github.com/other/repo.git`.
  - no keyword → []: `See URL` @OWN.
  - mixed case → [143]: `FIXES: HTTPS://GITHUB.COM/kaolabrother/vrpcadcore/issues/143` @OWN;
    `resolved https://GitHub.com/KAOLABROTHER/VRPCADCORE/issues/143` @GitHub-URL identity.
  - empty/unknown identity → [143]: own URL @`''`; foreign URL @`''`, @omitted, @`https://gitlab.com/o/r.git`.
  - multiple: `Fixes URL and fixes #7` @OWN → [7, 143].

**Recorded, not asserted** (step-03 stdout and the summary `observations`):

- Outside the specified form, all → []: `Fixes http://github.com/OWN/issues/143` @OWN and @`''`;
  `Fixes https://www.github.com/OWN/issues/143` @OWN and @`''`; `Fixes https://github.com/OWN/pull/143`
  @OWN; keyword and URL on separate lines (`Fixes:\nURL`) @OWN. Note the @`''` cases: with an
  unknown identity these shapes are still not counted (they are not matched at all), unlike the
  `https://github.com` form.
- Carried v6 observations, unchanged: `asOwnerRepo('repo/origin.git')` → `repo/origin` and the two
  dependent `closingIssueNumbers` → [] (corrupted-state slug limitation); `githubUrlOwnerRepo`
  uppercase https → `KaolaBrother/VRPCadCore`, `http://` → `''`, `www.` → `''`.

### 4.5 Fail-closed check (step 05)

Empty selection: 0 rows, `trace audit failed: out-of-set=[] records=0`, exit 1.

### 4.6 Discrimination control (step 04: the same v7 rows on 969b11b6)

Candidate: v6's `runs/candidate-969b11b6` (read; v6 full hash check still 0 failures afterwards).
Trace audit ok (119 records, `outOfSet: []`). Summary
`runs/discrimination-newrows-on-969b11b6/new-rows-summary.json`; exit 1.

- **u-a1/a2/a3 RED — review-r2 P1 #1 reproduced:** exit 0, `sink_pr: created`, ops `pr.list,
  pr.create, git.push, request.record, archive` (push to the local bare).
- **u-d1/d2/d3 RED:** same create; the URL was not counted even with no identity.
- **r-a2 RED — review-r2 P1 #2 reproduced:** stale state `other/repo` + GitHub origin own + `Fixes
  KaolaBrother/VRPCadCore#143` → exit 0, created, same ops; get-url 0 (state won, origin unread).
- **r-a1 RED:** refused `closing_linkage` (state identity counted the own reference) after `pr list`;
  no `repository_conflict`, 1 gh call.
- **u-b1, u-c1, r-b1–b3, r-c1, r-c2, v6-s1 RED only on `originLookupAsExpected`** (969b11b6 does not
  read origin when state parses). Their lane outcomes matched.
- **h1 RED:** the 12 own/unknown-identity URL assertions (47–51, 56–62) fail ([] instead of [143]).
- **PASS on 969b11b6:** v6-a1, a2, b1, c1, d1, e1, s2.
- Expected for that candidate; not a finding about 804c758b. Every row RED here is PASS at step 03.

## 5. Carryover by the recorded blob-diff scope (assignment item 5)

Changed bound bytes are confined to `sink-pr.js`: the scanner regex (one prepended URL alternative;
prefix, qualified and bare alternatives byte-equal), the loop's group indices plus one
`sameRepository`-gated branch, `resolveClaimRepositoryIdentity` (origin always read; conflict
throw), and comments (§3). Behavior can differ from 969b11b6 only for:

- (A) scanned text containing a closing keyword followed (same line, allowed separators) by
  `https://github.com/OWNER/REPO/issues/N`;
- (B) explicit-mode runs where state and origin both yield GitHub identities that disagree
  (→ `repository_conflict`);
- (C) explicit-mode runs past the marker/OFFLINE gates where state yields an identity: one extra
  `git remote get-url origin` (identity value unchanged when origin is `''` or agrees).

A prior result carries when its lane has none of (A)/(B), and its assertions do not depend on (C).

| prior rows | prior result | carries to 804c758b? | why |
|---|---|---|---|
| v6 a1, a2, b1, c1, d1, e1, s2 | PASS @969b11b6 | **re-run** (PASS) | No state line: (B)/(C) not reachable; texts have no URL. |
| v6 s1 | PASS | **re-run** (PASS, expectation get-url 0 → 1) | (C) applies by design. |
| v6 h1 (47 asserted) | PASS | **re-run** inside v7-h1 (all 47 PASS) | Same bytes evaluated; v6's full-URL observation (→ []) is superseded by asserted [143]. |
| v5-a1 (mixed-case https state), v5-a2 (`git@` state), v5-b1/b2 (state + foreign/non-associated), v5-s1, v5-s2 (clean OPEN reuse) | PASS @45e6deb1, carried in v6 | **outcome carries; the `originLookup: false` sub-check does not** | Origin in those fixtures is the absolute local bare → `''`, so state stands and every scan returns the same set (no URL text). As written, their `originLookupAsExpected` check would now be false under (C). The state-stands meaning is re-measured by v7-r-c1/r-c2, v6-s1, and the mixed-case agreement rows. v5-s2 (OPEN reuse lane) itself was **not** re-run. |
| v5-c1, c2, c3 | PASS | yes | c1 re-measured as v6-b1. c2: no state, local origin, no URL text. c3: two disagreeing state lines → state `''` (parser unchanged) → origin `''`; no conflict possible. |
| v5-d1 helper (18) | PASS | yes (inside the 47 re-run) | — |
| v3 `qualified-closing-commit-reference-reuse`, `safe-explicit-singleton-positive`, `duplicate-action-field`, `noninteger-cli-issue-prefix` | PASS | yes | Standard fixture: state URL form + local-bare origin → no (B); no URL text → no (A); refusals at gates before identity. |
| Everything v6 §5 carried from v5/v4: 33 watcher-lane rows; v4-a1/a2/a3 + outer probes; v4-b/c/d native/unmeasured refusals; v4-b2/e1/f2/f3; 38 affected suite rows; identity-input rows (`missing-repository`, `malformed-repository`, `repository-mismatch`, `unsupported-forge`); `receipt.identity` RED group; 13 sink controls; Pass A | as recorded (incl. known RED classes) | yes | Watcher rows have no sink child, and no other bound file loads `sink-pr.js`. Non-explicit lanes never compute identity (`''`), so (B)/(C) cannot occur. Explicit-lane fixtures use the absolute local bare origin → `''`, so no (B). Scanned texts there contain no keyword + `https://github.com/…/issues/N` (the only such strings in v4/v5 controls are `HELPER_OBSERVE` inputs and native `closingIssuesReferences` URL fields, which are not scanned text), so no (A). The `gitlab` forge fixture's state is a gitlab URL → `''`. |

## 6. Not run, and why

- Every other v4/v5/v6 row and Pass A: carried by §5. Notably **v5-s2 clean OPEN reuse was not
  re-run** at 804c758b, and no OPEN-reuse row with a URL in the title/body was run here (the r2fix
  walkthrough adds `reuse-url`; not executed by me).
- Outer `round2-probe.cjs`: not executed (and `.kaola/outer-review-1113` not modified). Its two
  shapes are reproduced as v7-u-a1 and v7-r-a2 with the same adapter, and their 969b11b6 behavior in
  §4.6.
- v3 `harness-selftest.js`: not re-run (`predicates.js`, `bound-source.js` byte-identical); steps 04/05
  exercised the fail-closed exit.
- `npm test`, producer chains, `simulate-workflow-walkthrough.js`: not run (repository read-only seat;
  the candidate-bound chain belongs to the parallel chain seat / Host).
- No authenticated forge or real remote. GitHub-URL origins are real `remote.origin.url` strings with
  pushes redirected to the local bare and non-file protocols disabled. Whether GitHub natively closes
  #143 for these forms was not measured here (the native observations file was only hashed).
- Not end to end: `git@`/`ssh://`/`git://` origin forms in the conflict table (helper only, via
  `githubUrlOwnerRepo`); a conflict where origin is non-GitHub (decision table: state stands; covered
  only by the local-bare rows); `http://`/`www.` issue URLs (helper observation only).
- No production repair, no integration patch, no verdict. No `HUMAN_DECISION_REQUIRED` arose.

## 7. Artifacts

- `controls/` (§2), including `steps-v7.sh` (the exact sequence run).
- `runs/00-binding/`: `candidate-facts.txt`, `harness-identity.txt`, `*-v6-to-v7.diff`.
- `runs/07-final-readonly-facts.txt`.
- `runs/candidate-804c758b/`: `bound-source.tar`, `bound-source-manifest.json`,
  `bound-source-verify-initial.json`, `source/`.
- `runs/02-blobdiff.json`, `runs/02-blobdiff-sink.diff`.
- `runs/NN-*-step/` for 01–06: `stdout.raw`, `stderr.raw`, `exit`, `process.json`.
- `runs/B-newrows-804c758b/`: `new-rows-summary.json` and `scenarios/<row>/` (seed receipt,
  `children/sink-attempt-1/` argv/pid/cwd/exit/stdout/stderr/`git-trace.raw`/`candidate-trace.jsonl`,
  gh JSONL, `results/normalized-result.json`, `repo/`).
- `runs/discrimination-newrows-on-969b11b6/`, `runs/failclosed-empty-newrows/`.
- `ARTIFACT-HASHES` / `ARTIFACT-HASHES.sha256`: SHA-256 of every regular file here except those two,
  generated after this report.
