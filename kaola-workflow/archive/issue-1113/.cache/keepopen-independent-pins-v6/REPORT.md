# Issue 1113: independent micro-recheck v6 of the final candidate (devin-KW-i1113-indqa4)

This is a factual record for the Host (zcode-KW-orchestrator-keepopen-pr). It is not a verdict.
The Host holds the verdict, the meaning of each test, and the mission ledger. Paths are relative to
this directory (`kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v6/`) unless they are
absolute. Times are UTC on 2026-10-02 (local 2026-10-03, UTC+8).

## 1. Context, custody, binding

- **Workflow context.** I loaded the installed `workflow-next` for run context only and read ledger
  line n=1. It is `in-flight` and names this v6 dispatch (`devin-KW-i1113-indqa4`). I made no claim,
  no ledger write, no mission, no finalization, and no forge write. All forge traffic went to the
  local logging `gh` spy. Real `gh` was never called. No Git network transport ran (§4.1).
- **Repository access was read-only:** `rev-parse`, `rev-list`, `status`, `log`, `diff`, `ls-tree`,
  and `archive`. I made no edit, commit, push, or branch in the repository.
- **Frozen candidate:** `969b11b6bc7192361bfc5e6b840ef6773ebf655c` on `workflow/issue-1113`. Its
  only parent is `45e6deb17f57adc98e04e4cc56cd426d8b54a3f9`. The subject is `fix(#1113): restrict
  the scanner origin fallback to GitHub remotes`. Author and committer are both
  `KaolaBrother <yanleichen@hotmail.com>`, and the commit has no trailers.
  - I recorded the facts at the start (`runs/00-binding/candidate-facts.txt`, 17:38:56Z) and at the
    end (`runs/07-final-readonly-facts.txt`). The two files match on every line except the date.
  - Worktree HEAD and the branch ref are both `969b11b6…`, and `git status --porcelain` printed
    0 lines.
  - MAIN HEAD is `fe7e4443…`. MAIN status is only `?? kaola-workflow/issue-1113/`.
  - The Host ledger SHA-256 is `9e4fef0b…8e8c` with mtime 01:33:02 local. It is unchanged between
    the start and end facts, and I wrote no ledger bytes.
- **Prior results are untouched.**
  - The `ARTIFACT-HASHES` files hash to `619e46bb…` (v1), `0c0e352f…` (v2), `bf0308ff…` (v3),
    `7ad67b55…` (v4), and `f366d26b…` (v5).
  - v5 `REPORT.md` is `f4093b8b…`, the hash the Host accepted.
  - The v4 and v5 `ARTIFACT-HASHES.sha256` sidecars check OK.
  - The full v5 `shasum -c ARTIFACT-HASHES` reported no failures for its 4,993 listed files.
  - No file in v4 or v5 is newer than the v5 sidecar.
  - Step 04 read v5's `runs/candidate-45e6deb1/source` (mode 0444) and wrote nothing into it.
- **Inputs read:** `keepopen-originfix/REPORT.md` (`545cafad…`), `host-indqa-v5-acceptance.md`
  (`5cc36e64…`), and v5 `REPORT.md`.
- **Node:** `/Users/ylmacstudio/.local/bin/node` v24.21.0. **Git:** 2.53.0. Every `stderr.raw`
  for steps 01–06 is empty (0 bytes).

## 2. Harness (v5 harness reused, fail-closed rules unchanged)

- **Byte-identical to v5** (`runs/00-binding/harness-identity.txt`, recorded with `cmp`):
  `bound-source.js`, `controls-v3.js`, `fault-preload.js`, `gh-spy.js`, `predicates.js`
  (`decideExit`, and `PUBLICATION_UNSAFE` including `git.push`), `run-step.js`, `suite-v3.js`, and
  `trace-preload.js`.
- **Derived in v6.** Each diff against its v5 counterpart is in `runs/00-binding/*-to-v6.diff`.
  - `adapter-v6.js` (`3197aec4…`) is `adapter-v4.js` plus one additive fixture knob,
    `fixture.originUrl` (diff: 33 lines). When the knob is set, the adapter runs these commands
    right after Git setup and before the fixture commit is pushed:
    - `git config protocol.allow never`
    - `git config protocol.file.allow always`
    - `git remote set-url --push origin <absolute local bare>`
    - `git remote set-url origin <exact string>`

    The effects:
    - `git remote get-url origin` returns the exact fixture string.
    - Every push lands in the local bare repository.
    - No network transport can run.

    When the knob is absent, every v4 default is unchanged.
  - `new-rows-v6.js` (`9910e995…`) is derived from `new-rows-v5.js`. The `commonNoEffect`,
    refuse, and create predicates are the same, and so is the `decideExit` exit. Its changes:
    - It replaces the rows (§4).
    - It applies the commit-scan sentence check only to closing-linkage rows.
    - It adds a `zeroGhCalls` check for the marker row.
    - It extends the identity evidence with:
      - the origin URL bytes, recorded as a string and as hex;
      - the push URL, which must equal the local bare;
      - `protocol.allow`, which must be `never`;
      - `noNetworkTransportInGitTrace`, meaning no `run_command` of `remote-http(s)`,
        `remote-ftp(s)`, or `ssh`;
      - `branchOnLocalBare` for create rows.
  - `helper-probe-v6.js` (`a59e9799…`) is a traced child. It loads only the bound `sink-pr.js` and
    calls `githubUrlOwnerRepo`, `asOwnerRepo`, and `closingIssueNumbers`. It reports a missing
    export as a per-input error.
  - The scope check `blobdiff-v6.js` (`15649977…`), `env-v6.sh`, and `facts-v6.sh` are also new.
- **Control hashes** are in both facts files and in every `runs/NN-*-step/process.json` under
  `controlsAtStart`. The controls did not change between step 00 and step 07.

## 3. Bound source and blob-diff scope (steps 01, 02, 06)

| step | command (abbrev.; full argv/env in `runs/NN-*-step/process.json`) | exit |
|---|---|---|
| 01 | `bound-source.js build <MAIN> 969b11b6… runs/candidate-969b11b6` | 0 |
| 02 | `blobdiff-v6.js <MAIN> <v5 manifest 45e6deb1> <v6 manifest 969b11b6> runs/02-blobdiff.json` | 0 (`ok: true`) |
| 06 | `bound-source.js verify runs/candidate-969b11b6/bound-source-manifest.json` | 0 (`ok: true`, 7 files) |

- **Manifest.** Step 01 read the same 7 named files through `git ls-tree` and `git archive`. The
  manifest digest is `35b2926c9ebbaa9fc68fa8eddf659dc0cee59c5d89283d334e45d6c1eb937aeb` and the
  tar is `01ca3263…6ce0e`.
- **Bound set.** Only `scripts/kaola-workflow-sink-pr.js` changed (`5f1251ac` → `f457e2e8`). These
  six are blob-identical: `claim.js` `3e5708f6`, `active-folders.js` `bb7b6d23`,
  `adaptive-schema.js` `df54ad4a`, `classifier.js` `df5599bf`, `closure-contract.js` `c407c9be`,
  and `test-git-fixture.js` `26b21f8f`.
- **Whole range** (one commit, parent `45e6deb1`; numstat):

  | file | added / deleted lines |
  |---|---|
  | `docs/decisions/0031-explicit-github-keep-open-pr.md` | +11/−5 |
  | `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` | +45/−23 |
  | `scripts/kaola-workflow-sink-pr.js` | +45/−23 |
  | `scripts/simulate-workflow-walkthrough.js` | +64/−0 |

  The mirror is blob `f457e2e8`, the same as the canonical file (`mirrorEqualsCanonical: true`).
  No other bound file requires `sink-pr.js`. I searched the six other bound files and found only
  comments that mention it.
- **Sink hunk headers** (`git diff -U0`; full diff in `runs/02-blobdiff-sink.diff`):
  ```
  @@ -163,8 +163,9 @@ function closesBody(members) {        (scanner comment: origin accepts GitHub URL forms only)
  @@ -173,12 +174,18 @@ const CLOSING_ASSOC_RE = …          (asOwnerRepo patterns split: GITHUB_URL_OWNER_REPO + BARE_OWNER_REPO, firstOwnerRepo)
  @@ -191,0 +199,13 @@ function asOwnerRepo(value) {      (new githubUrlOwnerRepo; asOwnerRepo = URL forms + tightened bare)
  @@ -235 +255 @@ function originOwnerRepo(root) {          (return asOwnerRepo(remote) -> return githubUrlOwnerRepo(remote))
  @@ -755 +775,2 @@ function main() {                      (comment only)
  @@ -997 +1018,2 @@ module.exports = {                     (exports asOwnerRepo, githubUrlOwnerRepo)
  ```
- **Executable changes**, read at 969b11b6:
  1. The four GitHub URL regexes are byte-equal to the old ones. They moved into
     `GITHUB_URL_OWNER_REPO`.
  2. The bare alternative was `/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i`. It is now
     `/^([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*?)(?:\.git)?$/`. Each segment must
     start with an alphanumeric. Dropping `/i` changes nothing, because the character classes
     already cover both cases.
  3. `originOwnerRepo` uses the URL forms only.
  4. Two exports were added.

  Call sites that did not change:
  - `closingIssueNumbers` (line 220) and `claimRepositoryFromTexts` (line 238) still call
    `asOwnerRepo`.
  - `resolveClaimRepositoryIdentity` is state first, then origin.
  - Identity is still computed only in explicit mode, after the marker, legacy, and OFFLINE gates.

## 4. Steps run and results

| step | command | exit | binding / result |
|---|---|---|---|
| 00 | `facts-v6.sh`, `cmp` harness identity, harness diffs → `runs/00-binding/` | — | 969b11b6, clean, gate passed |
| 03 | `. env-v6.sh B-newrows-969b11b6; run-step.js … node controls/new-rows-v6.js` | **0** | **9/9 PASS**, stage `request`, trace audit ok (44 records, `outOfSet: []`), bound source ok before and after |
| 04 | same rows against the read-only v5 extraction of **45e6deb1** | 1 | discrimination control: 6/9 PASS, 3 RED (expected, §4.5) |
| 05 | `KW_V3_ONLY_ROWS=__no_such_row__` | 1 | fail-closed: 0 rows, so `trace audit failed: records=0` and exit 1 |
| 07 | `facts-v6.sh` again | — | identical to step 00 except the date |

Every step-03 row records `binding.commit = 969b11b6…`, `boundSourceBeforeOk` and
`boundSourceAfterOk` both true, and manifest digest `35b2926c…`.

### 4.1 Origin-fallback rows (step 03)

In every row below, the MAIN state has **no** `claim_repository_id` line. I measured this from the
fixture bytes: the extracted lines are `[]`. The sink child's GIT_TRACE contains exactly one
`trace: built-in: git remote get-url origin`.

The linked worktree carries the decoy state `claim_repository_id:
https://github.com/decoy/not-the-claim.git` (seed receipts). Under the decoy's identity,
`other/repo#143` would not count.

Every row has `noNetworkTransportInGitTrace` true. In override rows, `protocol.allow` is `never`,
and the push URL is the row's absolute local bare `…/scenarios/<row>/repo/origin.git`.

| row | origin URL bytes (`git remote get-url origin`) | commit | observed on 969b11b6 |
|---|---|---|---|
| (a) `v6-a1-rel-origin-repo-slash-foreign-qualified-create` | `repo/origin.git` (hex `7265706f2f6f726967696e2e676974`) | `Fixes other/repo#143` | **PASS**, 25 checks. Exit 1 `explicit_keep_open_refused: closing_linkage. Commit messages reachable from workflow/issue-143 and not from main close issue(s) 143. Nothing was pushed or created.` Operations `["pr.list"]` only. No push in GIT_TRACE. No PUBLICATION_UNSAFE operation. MAIN HEAD/index, branch, project, claim, ledger, evidence, and synthetic PR state are unchanged. |
| (a) `v6-a2-rel-origin-dotdot-foreign-qualified-create` | `../origin.git` (hex `2e2e2f6f726967696e2e676974`) | `Fixes other/repo#143` | **PASS**, 25 checks. Same refusal, operations, and no-effect set as a1. |
| (b) `v6-b1-abs-origin-foreign-qualified-create` | the absolute local bare path `/Users/…/v6/runs/B-newrows-969b11b6/scenarios/v6-b1-…/repo/origin.git` (no override; `originIsLocalPath` true) | `Fixes other/repo#143` | **PASS**, 23 checks. Same refusal before push. This is the v5-c1 meaning, and it holds. |
| (c) `v6-c1-github-origin-own-qualified-create` | `https://github.com/KaolaBrother/VRPCadCore.git` | `Fixes KaolaBrother/VRPCadCore#143` | **PASS**, 25 checks. Exit 1 `closing_linkage` from the commit scan before push. Operations `["pr.list"]`. Full no-effect set. |
| (d) `v6-d1-github-origin-foreign-qualified-create` | `https://github.com/KaolaBrother/VRPCadCore.git` | `Fixes other/repo#143` | **PASS**, 17 checks. Exit 0. Stdout: `pr_auto_merge: suppressed_request_only`, `pr_request: request_only`, `publication: request_published`, `mainline_publication: pending`, `sink_pr: created`. Exactly one `pr create`. Body has `Keeps #143 open`, with no closing keyword before `#143` in the body or title. No `--fill`, no merge, close, or reopen. The commit is in history. The sink's `git push origin workflow/issue-143` ran `git-receive-pack '<row>/repo/origin.git'` (local bare, via the push URL), and the branch ref on the bare equals the local ref. Operations: `pr.list`, `pr.create`, `git.push`, `request.record`, and `archive`. These are the same as the s1 clean create. |
| (e) `v6-e1-otherhost-origin-foreign-qualified-create` | `https://gitlab.com/o/r.git` | `Fixes other/repo#143` | **PASS**, 25 checks. Same refusal before push and no-effect set as a1. |

**What the identity evidence shows.** I measured that state gives no identity and that origin was
consulted. The origin bytes are listed above.

- **a1, a2, e1: no identity.** The sink refused on `other/repo#143`. Under the code read in §3 that
  can happen only if the identity is empty or equals `other/repo`. Neither the origin bytes nor the
  decoy is `other/repo`, so the identity was empty and every qualified reference counted.
- **b1: no identity.** The same reasoning applies.
- **c1 with d1: identity established.** The two rows have the same origin. c1 counted the
  same-repository reference, and d1 ignored the foreign one. So the identity was non-empty, matched
  `KaolaBrother/VRPCadCore` (case-insensitively), and was not `other/repo`.

### 4.2 Smoke: no regression (step 03)

| row | observed |
|---|---|
| `v6-s1-explicit-create-clean` | **PASS**, 13 checks. The state line is the seeded `https://github.com/KaolaBrother/VRPCadCore.git`, and origin was **not** consulted (no `get-url` in GIT_TRACE): state wins. Exit 0, `sink_pr: created`, one create, keep-open body, `suppressed_request_only`, no merge. The branch is on the local bare. |
| `v6-s2-single-empty-marker-online` (malformed intent: one `keep_open_pr: ` line, no flag, no action; the v4-a3 input) | **PASS**, 21 checks. Exit 1 `explicit_keep_open_refused: partial_marker`. Zero gh calls, zero operations, no push, no `get-url` (the refusal comes before identity is computed). Full no-effect set. |

### 4.3 Helper controls on the bound bytes (`v6-h1-origin-parser-helper`, PASS, 49 checks)

Output: `runs/B-newrows-969b11b6/scenarios/v6-h1-origin-parser-helper/`. The child loaded only the
bound `sink-pr.js` and exited 0. Every asserted case is an exact match with `error: null`.

- **`githubUrlOwnerRepo` (origin parser).**
  - These return `KaolaBrother/VRPCadCore`:
    - `https://github.com/KaolaBrother/VRPCadCore.git`, also without `.git` and with a trailing
      `/`
    - `git@github.com:…/VRPCadCore.git`
    - `ssh://git@github.com/…/VRPCadCore.git`
    - `ssh://github.com/…/VRPCadCore.git` (no user)
    - `git://github.com/…/VRPCadCore.git`
  - These return `''`:
    - `repo/origin.git`, `../origin.git`, `./origin.git`
    - `/tmp/fixture/repo/origin.git`
    - `https://gitlab.com/o/r.git`, `git@gitlab.com:o/r.git`
    - the bare `KaolaBrother/VRPCadCore` (the bare form is not an origin form)
    - `''`
- **`asOwnerRepo` (state parser).**
  - These still parse:
    - `KaolaBrother/VRPCadCore` and `KaolaBrother/VRPCadCore.git` → `KaolaBrother/VRPCadCore`
    - `KaolaBrother/Kaola-Workflow` → `KaolaBrother/Kaola-Workflow`
    - the https and `git@` forms → `KaolaBrother/VRPCadCore`
  - These return `''`:
    - `../origin.git`, `./origin.git`
    - `.hidden/repo`, `owner/.repo`
    - `/tmp/fixture/repo/origin.git`
    - `https://gitlab.com/o/r.git`
    - `''`
- **`closingIssueNumbers`.** All 18 of v5-d1's asserted cases hold with the v5 expectations. The new
  assertions are `Fixes KaolaBrother/VRPCadCore#143 @ '../origin.git'` → [143] and
  `Fixes other/repo#143 @ '../origin.git'` → [143]. A `../` identity is now empty, so every
  qualified reference counts. At v5 the same input gave [].

**Recorded, not asserted** (also in the step-03 stdout):

- **Slug-shaped state garbage (the inherent, disclosed limitation).**
  - `asOwnerRepo('repo/origin.git')` → `repo/origin`.
  - So `closingIssueNumbers('Fixes KaolaBrother/VRPCadCore#143', 'repo/origin.git')` → [] and
    `closingIssueNumbers('Fixes other/repo#143', 'repo/origin.git')` → [].
  - This is reachable only from a corrupted state `claim_repository_id` line. It is not reachable
    from origin, because origin goes through `githubUrlOwnerRepo`, which returns `''` for this
    string (asserted above, and end to end in a1).
  - I did not freeze it as required behavior.
- **`githubUrlOwnerRepo` shape observations.**
  - `HTTPS://GITHUB.COM/KaolaBrother/VRPCadCore.git` → `KaolaBrother/VRPCadCore`, because the
    regexes are case-insensitive.
  - `http://github.com/…` → `''` and `https://www.github.com/…` → `''`. These shapes give no
    identity, so qualified references are over-counted. That is the fail-closed direction.
- **Full URL** (the gap still recorded as unverified):
  `closingIssueNumbers('Fixes https://github.com/KaolaBrother/VRPCadCore/issues/143', OWN)` → [].

### 4.4 Fail-closed check (step 05)

With an empty row selection the runner ran 0 rows. It recorded `trace audit failed: out-of-set=[]
records=0` and exited 1. `decideExit` cannot return 0 for an empty or unverified run.

### 4.5 Discrimination control (step 04: the same v6 rows on 45e6deb1)

The candidate was v5's read-only `runs/candidate-45e6deb1`, manifest digest `3cc70039…`. The trace
audit was ok with 44 records and `outOfSet: []`. Summary:
`runs/discrimination-newrows-on-45e6deb1/new-rows-summary.json`. The run exited 1.

- **a1 and a2 RED: the v5 §4.4 defect, reproduced end to end.**
  - With origin `repo/origin.git` or `../origin.git` and commit `Fixes other/repo#143`, 45e6deb1
    exited 0 with `sink_pr: created`.
  - Operations: `pr.list`, `pr.create`, `git.push`, `request.record`, and `archive`.
  - The old bare alternative turned the relative origin into the identity `repo/origin` or
    `../origin`, so the foreign qualified reference was ignored and count-all was defeated.
  - The push went to the local bare through the push URL. Nothing left the machine.
- **h1 RED.** `githubUrlOwnerRepo` and `asOwnerRepo` are not exported at 45e6deb1 (cases 0–26).
  Cases 45 and 46 gave [] instead of [143].
- **PASS on 45e6deb1:** b1, c1, d1, e1, s1, and s2. 45e6deb1 already handled absolute-path,
  GitHub, and other-host origins this way.
- This is the expected result for that candidate, not a finding about 969b11b6. On 969b11b6, all
  three rows that are RED here PASS (step 03).

## 5. Carryover from v5 (bound 45e6deb1) by the recorded blob-diff scope

The only changed bound bytes are in `sink-pr.js`, and they are confined to the identity parsers,
their comments, one line in `originOwnerRepo`, one comment in `main`, and two exports (§3). Behavior
changes only for an identity input that took the old bare alternative and is now rejected:

- an origin remote that is not one of the four GitHub URL forms, but that the old bare alternative
  accepted (a relative two-segment path, or a bare slug configured as the remote);
- a state or helper identity whose segment starts with `.`, `_`, or `-`.

A v5 result therefore carries to 969b11b6 when every identity input of its lane is one of these:

- a GitHub URL form;
- an alphanumeric-first slug;
- an absolute path, another host, or no value;
- input that the lane never reaches, because it refuses before identity is computed or makes no
  scan whose result depends on identity.

| v5 rows | v5 result @45e6deb1 | carries? | why |
|---|---|---|---|
| v3 suite `qualified-closing-commit-reference-reuse`, v5-a1 (mixed-case https state), v5-a2 (`git@` state) | PASS | yes | The state identity comes from GitHub URL forms. Those regexes are byte-equal, the state wins, and origin was not consulted (v5 GIT_TRACE). v6-c1 covers the same refusal with the identity coming from origin. |
| v5-b1/b2 (foreign plus non-associated, state identity present) | PASS | yes | The state identity is the https form, unchanged. v6-d1 covers the same "foreign ignored" meaning with the identity coming from origin. |
| v5-c1 (no state line, absolute local origin) | PASS | **re-run** as v6-b1 (PASS) | Origin input. Old `asOwnerRepo('/…')` returned `''`, and new `githubUrlOwnerRepo('/…')` also returns `''`. Measured again. |
| v5-c2 (no state line, absolute origin, no qualified reference) | PASS | yes | The identity is `''` before and after, and the text has no qualified reference. |
| v5-c3 (two disagreeing https state lines, absolute origin) | PASS | yes | Both lines are URL forms, so they disagree to `''`. Origin is an absolute path, `''` before and after. v6-b1 re-measured the same origin outcome. |
| v5-d1 helper (18 asserted cases) | PASS | **re-run** inside v6-h1 (all 18 PASS) | Every one of the 18 cases holds. Of v5's observations: `'../origin.git'` → [] became [143] (the intended fix, now asserted); `'repo/origin.git'` → [] is unchanged (the state-form limitation, now recorded as such); `http://` and `www.` still give no identity; full URLs are still []. |
| v5-s1 (clean explicit create) | PASS | **re-run** as v6-s1 (PASS) | Smoke. |
| v5-s2 (clean OPEN reuse) | PASS | yes | The state identity is a URL form, and the reuse texts contain no qualified reference. |
| v3 controls `safe-explicit-singleton-positive`, `duplicate-action-field`, `noninteger-cli-issue-prefix` | PASS | yes | The positive has no qualified reference, and the refusals happen at gates before identity is computed. v6-s2 re-measured a malformed-intent refusal at that same gate. |
| Everything v5 §5 carried from v4: 33 watcher-lane rows; v4-a1/a2/a3 and the outer probes; v4-b/c/d native and unmeasured refusals; v4-b2/e1/f2/f3; 38 affected suite rows; identity-input rows (`missing-repository`, `malformed-repository`, `repository-mismatch`, `unsupported-forge`); `receipt.identity` RED group; 13 sink controls; Pass A | as recorded in v5 §5 (including the known RED classes) | yes | The v5 rationale still holds. Watcher rows have no sink child, and no other bound file loads `sink-pr.js` (§3). The refusal rows stop before identity is computed or before the scans. In the remaining rows no scanned text contains a qualified `owner/repo#N`, so `closingIssueNumbers` returns the same set for every identity, including any identity that the tightened parsers now map to `''`. The fixture origin in all of them is the absolute local bare path, which parses to `''` before and after. |

## 6. Not run, and why

- **Every other v4 and v5 row, and Pass A.** They carry over by the scope in §5. As assigned, I ran
  only the origin-fallback rows, the helper, and the smoke rows.
- **v3 `harness-selftest.js`.** Not re-run, because `predicates.js` and `bound-source.js` are
  byte-identical. Steps 04 and 05 exercised the fail-closed exit again.
- **Outer-review probes.** Not re-run. Their refusals happen before identity is computed.
- **`npm test`, producer chains, `simulate-workflow-walkthrough.js`.** Not run, and that includes
  the originfix `scan-rel-origin` walkthrough extension. This seat is repository read-only, and the
  candidate-bound chain receipt belongs to the parallel chain seat or the Host.
- **No authenticated forge or real remote.** The `gh` spy is synthetic. The GitHub-URL origin rows
  use a real `remote.origin.url` string with every push redirected to the local bare and network
  protocols disabled. No real github.com or gitlab.com interaction was attempted or measured.
  Whether GitHub itself closes #143 for a same-repository qualified reference or for a full URL was
  not measured. Full URLs remain the recorded unverified gap.
- **Origin forms not run end to end:** `git@`, `ssh://`, and `git://`. They were exercised through
  the helper only (`githubUrlOwnerRepo`). That is the same function `originOwnerRepo` calls.
- **Slug-shaped state garbage:** recorded only (§4.3), and not exercised end to end.
- No production repair, no integration patch, no verdict.

## 7. Artifacts

- `controls/`: v6 harness (§2).
- `runs/00-binding/`: `candidate-facts.txt`, `harness-identity.txt`, and the `*-to-v6.diff` files.
- `runs/07-final-readonly-facts.txt`.
- `runs/candidate-969b11b6/`: `bound-source.tar`, `bound-source-manifest.json`,
  `bound-source-verify-initial.json`, and the read-only `source/` extraction.
- `runs/02-blobdiff.json` and `runs/02-blobdiff-sink.diff`.
- `runs/NN-*-step/` for steps 01–06: `stdout.raw`, `stderr.raw`, `exit`, and `process.json`.
- `runs/B-newrows-969b11b6/` contains `new-rows-summary.json` and one directory per scenario. Each
  scenario directory holds:
  - `fixture/seed-receipt.json`;
  - `children/sink-attempt-1/` (argv, pid, cwd, exit, stdout, stderr, `git-trace.raw`,
    `candidate-trace.jsonl`);
  - the forge gh JSONL;
  - `results/normalized-result.json`;
  - the `repo/` fixture.
- `runs/discrimination-newrows-on-45e6deb1/` and `runs/failclosed-empty-newrows/`.
- `ARTIFACT-HASHES` / `ARTIFACT-HASHES.sha256`: SHA-256 of every regular file here except the
  manifest and its sidecar, generated after this report.
