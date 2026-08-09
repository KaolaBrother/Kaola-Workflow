# Investigation: are `clearAdvisoryClaim`'s THREE sink-merge call sites exposed to the #937 case-variant `--project` slug the same way `cmdFinalize` is?

**VERDICT: CONFIRMED.** All three sites are exposed, by the same mechanism, and all three were
REACHED AND MEASURED. The sink does **not** normalise or resolve `args.project` against the on-disk
folder — the refuting hypothesis is REFUTED both statically and behaviourally. The sink half is
**strictly worse** than the finalize half: beyond the surviving claim markers it also publishes a
wrongly-cased archive directory *and a duplicate of the live run folder* to the remote, and leaves
the main checkout dirty — all while reporting `result: ok, status: sinked`, exit 0.

---

## Setup

- **Repo under test:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow` @ `42559b1c8df312e462816f139080f3508df48370`
  (working tree clean apart from the untracked live claim `kaola-workflow/bundle-937-938-939/`, which was not touched).
- **Script driven, by absolute path:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- **Environment:** node v24.18.0 · git 2.54.0 · macOS 26.6 (darwin 25.6.0)
- **No tracked file in the real repo was modified. No push to any real remote. Zero live forge calls.**
  Every `gh` invocation went to `KAOLA_GH_MOCK_SCRIPT`, set in the child's env at process start
  (never by assigning `process.env.X` post-`require` — `OFFLINE` and the mock path are read at module load).
- **Fixtures:** throwaway bare remote + working clone, built under the scratchpad
  (`.../scratchpad/drive937sink/tmp/`), `git init -b main` and `git init --bare -b main` pinned
  explicitly. `TMPDIR` was pointed at the scratchpad so the sink's `process.chdir(os.tmpdir())`
  (`kaola-workflow-sink-merge.js:3050` / `:3090`) lands there too — outside any git repository, which
  keeps the mock's wrong-cwd rejection armed.
- **Harness:** `.../scratchpad/drive937sink/harness.js`; raw per-leg artifacts (full envelope,
  stdout, stderr, argv ledger, comment store, git trees) in `.../scratchpad/drive937sink/out/*.json`
  and `out-mirror/*.json`.

### Filesystem case sensitivity — measured, and it matters

| path | result | how |
|---|---|---|
| scratchpad (`/private/tmp/...`) | **CASE-INSENSITIVE** | `mkdir a` then `mkdir A` → `EEXIST` |
| `os.tmpdir()` (`/var/folders/...`) | **CASE-INSENSITIVE** | same probe, `EEXIST` |
| `/Volumes/WorkspaceA` (holds the real repo) | **CASE-INSENSITIVE** | `ls -d .../kaola-workflow/SCRIPTS` resolves (apfs, `/dev/disk7s2`) |

The fixture volume therefore matches the real repo's volume. Everything below is measured on a
case-insensitive filesystem; see **Open** for what that leaves unmeasured.

### Commands (verbatim)

```
# leg 0 — instrument control
node <scratchpad>/harness.js leg0

# leg A — POSITIVE CONTROL, --sink keep-open bundle, EXACTLY-CORRECT slug
node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-93701 --project issue-93701 \
  --sink --json --issue 93701 --issue-numbers 93701,93711 --keep-issue-open

# leg B — CASE-VARIANT slug (on-disk folder is issue-93702)
node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-93702 --project Issue-93702 \
  --sink --json --issue 93702 --issue-numbers 93702,93712 --keep-issue-open

# leg C — POSITIVE CONTROL, LEGACY (non---sink) keep-open bundle, EXACTLY-CORRECT slug
node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-93703 --project issue-93703 \
  --json --issue 93703 --issue-numbers 93703,93713 --keep-issue-open

# leg D — LEGACY, CASE-VARIANT slug (on-disk folder is issue-93704)
node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-93704 --project Issue-93704 \
  --json --issue 93704 --issue-numbers 93704,93714 --keep-issue-open
```

Each was run with `cwd = <fixture root>` and
`env = { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_SKIP_TESTGATE: '1', KAOLA_GH_MOCK_SCRIPT: <binDir>/gh.js }`.

---

## Leg 0 — the instrument, measured before anything is measured with it

A "zero deletes" result is worthless without proof the harness *could* have observed a delete.
The mock (adapted from the #936 suite's, `scripts/test-sink-merge.js:180`) serves a **real, mutable**
comment store and is **cwd-honest** — it walks up for `.git` and exits 1 like real `gh` when there
is none, logging `REJECTED-wrong-cwd:`.

| probe | command | result | exit |
|---|---|---|---|
| list route, from inside the repo | `gh.js api repos/{owner}/{repo}/issues/93700/comments` (cwd = fixture root) | served the planted store (1 comment, id 93710) | 0 |
| list route, from outside any repo | same argv, cwd = `os.tmpdir()` | rejected, `REJECTED-wrong-cwd:` logged | **1** |
| DELETE route | `gh.js api --method DELETE repos/{owner}/{repo}/issues/comments/93710` | **store 1 → 0** (really mutated, no `:no-such-comment`) | 0 |

The instrument can see a delete, and can see a call made from the wrong cwd.

**And it saw neither failure mode in any leg:** `REJECTED-wrong-cwd` count is **0** in legs A, B, C
and D. The zero-delete results below are therefore *not* #936's cwd trap — every forge call resolved
the repository correctly. Verbatim argv from leg B, every call, with its cwd:

```
cwd=<fixture>/kw-sink-FReFGT  argv=["issue","view","93702","--json","state","--jq",".state"]
cwd=<fixture>/kw-sink-FReFGT  argv=["issue","edit","93702","--remove-label","workflow:in-progress"]
cwd=<fixture>/kw-sink-FReFGT  argv=["api","repos/{owner}/{repo}/issues/93702/comments"]
cwd=<fixture>/kw-sink-FReFGT  argv=["issue","edit","93712","--remove-label","workflow:in-progress"]
cwd=<fixture>/kw-sink-FReFGT  argv=["api","repos/{owner}/{repo}/issues/93712/comments"]
cwd=<fixture>/kw-sink-FReFGT  argv=["issue","view","93702","--json","state","--jq",".state"]
```

The LIST went out. The DELETE never did.

---

## Observations — the two-leg ledger

### `--sink` (runSinkTransaction), keep-open bundle

| | **leg A — slug `issue-93701` (exact)** | **leg B — slug `Issue-93702` (case variant)** |
|---|---|---|
| exit | **0** | **0** |
| envelope | `{"result":"ok","status":"sinked",...}` | `{"result":"ok","status":"sinked",...}` |
| `receipt.project` | `issue-93701` | **`Issue-93702`** (operator casing, echoed raw) |
| `steps.closure` | `done` | `done` |
| `remote_closed_after_publish` | `verified` | `verified` |
| forge calls: `issue-view` | 2 | 2 |
| forge calls: `label-remove` | 2 | 2 |
| forge calls: **`comment-LIST`** | **2** | **2** |
| forge calls: **`comment-DELETE`** | **2** | **0** |
| `REJECTED-wrong-cwd` | 0 | 0 |
| this project's marker on **primary** | **GONE** | **SURVIVES** |
| this project's marker on **member** | **GONE** | **SURVIVES** |
| other project's marker (`issue-OTHER`) | survives (correct scoping) | survives |
| ordinary human comment | survives | survives |
| archive dir at HEAD | `kaola-workflow/archive/issue-93701/` | **`kaola-workflow/archive/Issue-93702/`** |
| inner archived `workflow-state.md` `name:` | `issue-93701` — **match** | `issue-93702` — **MISMATCH** |
| live folder at HEAD | gone (moved) | **STILL TRACKED: `kaola-workflow/issue-93702/{workflow-state.md,finalization-summary.md}`** |
| main root after the run | **clean** | **DIRTY:** `` D kaola-workflow/issue-93702/finalization-summary.md`` / `` D kaola-workflow/issue-93702/workflow-state.md`` |
| pushed to the bare remote | 5 paths, correct | **7 paths — the run record is DUPLICATED on the remote** |

Leg A call log (ordered):
```
label-removed:93701  comments-listed:93701  comment-deleted:93721
label-removed:93711  comments-listed:93711  comment-deleted:93724
```
Leg B call log (ordered):
```
label-removed:93702  comments-listed:93702
label-removed:93712  comments-listed:93712
```

Leg B envelope, verbatim:
```json
{
  "result": "ok",
  "status": "sinked",
  "journal_disposed": true,
  "receipt": {
    "project": "Issue-93702",
    "branch": "workflow/issue-93702",
    "issue_number": 93702,
    "issue_numbers": [93702, 93712],
    "resolved_default_branch": "main",
    "branch_head": "b1ad17ff836472fd2a6bfb299ad72e571723677d",
    "keep_open_requested": true,
    "claim_ts": null,
    "started_at": "2026-08-09T03:03:14.445Z",
    "updated_at": "2026-08-09T03:03:15.194Z",
    "stash_ref": null,
    "removed_duplicates": [],
    "archived_paths": [
      "kaola-workflow/archive/Issue-93702/finalization-summary.md",
      "kaola-workflow/archive/Issue-93702/workflow-state.md"
    ],
    "steps": {
      "preflight": "done", "push_upstream": "done", "merge": "done", "finalize": "done",
      "stash_restore": "done", "archive_commit": "done", "push_main": "done", "closure": "done"
    },
    "post_rebase_tests": "skipped",
    "archive_dest": "kaola-workflow/archive/Issue-93702",
    "remote_closed_after_publish": "verified",
    "published_head": "b1ad17ff836472fd2a6bfb299ad72e571723677d"
  }
}
```

Comment store after leg B (the remote's end state, not a call assertion):
```json
{
  "93702": [
    "<!-- kw:claim project=issue-93702 -->\nKaola-Workflow started local work for `issue-93702`.",
    "<!-- kw:claim project=issue-OTHER -->\nKaola-Workflow started local work for `issue-OTHER`.",
    "an ordinary human comment"
  ],
  "93712": [
    "<!-- kw:claim project=issue-93702 -->\nKaola-Workflow started local work for `issue-93702`."
  ]
}
```

`git ls-files kaola-workflow/` in a **fresh clone of leg B's bare remote** — the duplication is
published, not just local:
```
kaola-workflow/.roadmap/issue-93702.md
kaola-workflow/.roadmap/issue-93712.md
kaola-workflow/ROADMAP.md
kaola-workflow/archive/Issue-93702/finalization-summary.md
kaola-workflow/archive/Issue-93702/workflow-state.md
kaola-workflow/issue-93702/finalization-summary.md      <-- live folder, never removed
kaola-workflow/issue-93702/workflow-state.md            <-- live folder, never removed
```
(leg A's clone carries 5 paths and no live folder.)

### LEGACY (postMergeCleanup), keep-open bundle

| | **leg C — slug `issue-93703` (exact)** | **leg D — slug `Issue-93704` (case variant)** |
|---|---|---|
| exit | **0** | **0** |
| envelope `status` | `merged` | `merged` |
| `closure_receipt.claim_label_removed` | `removed` | **`removed`** |
| `closure_receipt.remote_issue_closed` | `kept_open` | `kept_open` |
| `closure_invariants` | `{"ok":true,"violations":[]}` | **`{"ok":true,"violations":[]}`** |
| forge calls: `issue-comment` | 2 | 2 |
| forge calls: `label-remove` | 2 | 2 |
| forge calls: **`comment-LIST`** | **2** | **2** |
| forge calls: **`comment-DELETE`** | **2** | **0** |
| `REJECTED-wrong-cwd` | 0 | 0 |
| marker on **primary** (#93703 / #93704) | **GONE** | **SURVIVES** |
| marker on **member** (#93713 / #93714) | **GONE** | **SURVIVES** |
| other project's marker | survives | survives |
| main root after the run | clean | clean |

Leg C call log: `comment:93703 label-removed:93703 comments-listed:93703 comment-deleted:93741 comment:93713 label-removed:93713 comments-listed:93713 comment-deleted:93743`
Leg D call log: `comment:93704 label-removed:93704 comments-listed:93704 comment:93714 label-removed:93714 comments-listed:93714`

**The two legacy envelopes are identical except for the `project` field.** Leg D reports
`claim_label_removed: "removed"` and `closure_invariants.ok: true` over an issue that is still fully
claimed by its marker. Nothing on the envelope distinguishes the broken run from the correct one.

---

## Reproduction

**REPRODUCES**, deterministically, on both sink entry points and on every member of a bundle. The
only axis varied between A/B and between C/D is the CASE of the `--project` argument; fixture bytes,
issue numbers modulo the fixture's own numbering, planted comment store shape, flags and env are
otherwise identical.

---

## Narrowing — which of the three sites, proven not inferred

Ordering in the call log already attributes the calls, but attribution by inference is not
attribution. To make it definitive I mirrored `scripts/` into the scratchpad
(`cmp` → **byte-identical** before instrumentation, the same technique the #936 suite's (x3) leg
uses) and added exactly three env-gated one-line probes, one immediately before each
`clearAdvisoryClaim` call. `diff` against the shipped file shows **only those three added lines**
(`970a971`, `984a986`, `2891a2894`).

Control that the mirror is sound: re-running all four legs against it produced call logs, comment
stores and exit codes **IDENTICAL** to the shipped runs in every leg.

| site | location | status | evidence |
|---|---|---|---|
| `sink-merge.js:971` | `postMergeCleanup`, keep-open **primary** | **REACHED-AND-MEASURED** | probe fired in legs C and D: `SITE 971:postMergeCleanup:primary project=Issue-93704` |
| `sink-merge.js:985` | `postMergeCleanup`, keep-open **bundle member** | **REACHED-AND-MEASURED** | probe fired in legs C and D: `SITE 985:postMergeCleanup:bundle-member project=Issue-93704` |
| `sink-merge.js:2892` | `runSinkTransaction`, keep-open **terminal** | **REACHED-AND-MEASURED** | probe fired in legs A and B: `SITE 2892:runSinkTransaction:keep-open-terminal project=Issue-93702` |

Each probe prints the value actually handed to the site. In the case-variant legs that value is the
operator's raw `Issue-93704` / `Issue-93702` — **not** the on-disk `issue-93704` / `issue-93702`.

Site `:2892` is a single line inside `for (const n of releaseTargets)`, so on a bundle it is driven
once per member (2 members → 2 label-removes, 2 LISTs, 2 DELETEs in leg A, 0 DELETEs in leg B); it
logs once because the probe sits outside the loop.

Note the two paths are genuinely different terminals and neither reaches the other:
`--sink` → `runSinkTransaction`'s closure step → `:2892` only (`postMergeCleanup` is never called);
legacy (no `--sink`) → `postMergeCleanup` at `:3238` → `:971` + `:985` only. Two separate fixtures
were required and both were built.

### Leg: does the sink normalise / canonicalise the slug upstream? — **REFUTED**

Two independent measurements, agreeing:

- **Static.** The only validation is `assert(args.project && isSafeName(args.project), '--project must be a safe folder name')` at `:3036`. `isSafeName` (`:315-319`) tests **shape only** — non-empty string, no `/`, no `\`, no NUL, not `.`/`..`. It never touches the filesystem. Grepping `sink-merge.js` for `toLowerCase|resolveProject|activeByProject|folder.project` yields exactly two hits, neither a project-slug resolution: `:336` (lower-casing an issue *state* string) and `:1309` (another `isSafeName` shape guard). All ~45 uses of `args.project` are the raw operator value.
- **Behavioural.** `receipt.project` came back `"Issue-93702"`, `archive_dest` came back `"kaola-workflow/archive/Issue-93702"`, the archive directory was **created on disk and committed at that spelling**, and the in-process probe at the call site read `project=Issue-93702`. Nothing resolved it to the on-disk `issue-93702`.

`deriveMemberSet` (`:3052`) also takes the raw slug; in these legs `--issue-numbers` was supplied
explicitly (`member_source: "flag"`), so member derivation was not the axis under test.

### Leg: the secondary defect (archive directory named from `args.project`)

- **`--sink` path (leg B): CONFIRMED, and worse than the finalize half.** `kaola-workflow/archive/Issue-93702/workflow-state.md` is committed at HEAD and pushed, and its body says `name: issue-93702`. Because git's index is case-sensitive while the filesystem is not, the archive *move* found the content (via the case-insensitive path resolution) but the removal pathspec `kaola-workflow/Issue-93702/` never matched the tracked `kaola-workflow/issue-93702/…`. Net: the live folder is still tracked at HEAD **and on the remote** beside its own archived copy, and the main checkout is left with two unstaged deletions after a run that reported `status: sinked` and `journal_disposed: true`.
- **Legacy path (leg D): NOT EXERCISED.** This fixture's branch already carries the run folder archived at the correct spelling (that is the shape the legacy entry point requires), so no archive directory was created during the run: `archive/issue-93704/` at HEAD with `name: issue-93704` — no mismatch, and main clean. This is a fixture limitation, not evidence that the legacy path is immune. See **Open**.

---

## Inferences

- **The mechanism is the one established on `cmdFinalize`, unchanged.** `clearAdvisoryClaim` builds `marker = '<!-- kw:claim project=' + project + ' -->'` (`kaola-workflow-claim.js:977`) and matches it with `comment.body.includes(marker)` (`:980`) — an exact, case-sensitive substring test. Handed `Issue-93702`, the marker never matches the stored `<!-- kw:claim project=issue-93702 -->`, so the loop deletes nothing and the function still `return status` = `'removed'` from the label edit at `:967`. — *confidence: high.* Refuted by: any leg where the LIST did not go out, or where the LIST returned empty (both excluded — the LIST argv is on the ledger, and the store still holds every planted comment afterward, which it could only do if the list served them), or by the case-variant legs deleting anything.
- **The three sink sites are exposed identically to the eight finalize sites, and the fix is the same shape:** pass the resolved on-disk folder name, not `args.project`. — *confidence: high.* Refuted by: finding a resolution step between the CLI and these sites (searched for, not found, twice over).
- **The sink half matters more than the finalize half, as the dispatching brief expected, and by a wider margin than expected** — it is the path `templates/routing/slots.js:124` invokes, and the case-variant run additionally publishes a mis-cased archive and a duplicated live run record to the remote. — *confidence: high for the measured consequences; the "which path ships" claim is the brief's, restated, not something I re-measured.*
- **No existing guard can see this.** `closure_invariants.ok` was `true`, `claim_label_removed` was `"removed"`, `remote_closed_after_publish` was `"verified"`, every step read `done`, and the exit code was 0 in both broken legs. The legacy envelopes are byte-identical between the correct and the broken run apart from the echoed `project`. — *confidence: high (directly observed).*
- **The `#936` cwd trap is not implicated here.** Zero `REJECTED-wrong-cwd` in all four legs; `forgeOpts = { cwd: mainRoot }` is doing its job. A fix must not regress it. — *confidence: high.*

---

## Open

- **Case-SENSITIVE filesystems are unmeasured.** Every volume available on this box is case-insensitive APFS, including the one holding the real repo. On a case-sensitive host (Linux, or a case-sensitive APFS volume) `path.join(mainRoot,'kaola-workflow','Issue-93702')` would not resolve at all, so the finalize/archive step would find nothing to archive and the run would plausibly take a different terminal — possibly the `#x1`/`#x4` archive-did-not-happen refusal — rather than reaching the closure step. **The claim-marker defect at all three sites would very likely still hold there** (it is a string comparison, not a filesystem operation), but *whether the sites are reached* on such a host is not something I drove. Settling it needs a case-sensitive volume (`hdiutil create -fs "Case-sensitive APFS"`); I did not create one, since mounting a new volume is a host-level change outside a read-only investigation.
- **Legacy-path archive naming** (the secondary defect on `postMergeCleanup`) is unexercised, per the leg-D note above. It needs a legacy fixture whose branch carries the run folder **live** rather than pre-archived.
- **Worktree-postured runs are unmeasured.** Both fixtures are in-place, so `readAF(...).find(f => f.project === args.project)` at `:2109`/`:2980` — an exact, case-sensitive comparison against the on-disk folder list, and therefore a fourth plausible exposure — never had to match. A case-variant slug there would make `folder` `undefined`; whether `removeWt` then misbehaves is not measured. Both legs reported `worktree_removed: "missing"`.
- **Only the `github` edition was driven.** `scripts/gitlab/` and `scripts/gitea/` sink ports were not run; the mock speaks `gh` argv.
- **Single sample per leg.** These are deterministic control-flow outcomes (exit code, call presence, store contents), not a noisy metric, so repeats were not taken.
