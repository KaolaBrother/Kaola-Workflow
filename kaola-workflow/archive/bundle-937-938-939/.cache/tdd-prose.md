# TDD-PROSE — red tests for the two owner-ruled prose corrections

Baseline: **`42559b1c8df312e462816f139080f3508df48370`** (worktree
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-937-938-939`,
branch `workflow/bundle-937-938-939`).

Every test below was RUN at that baseline and is RED. No production file was touched.
No new test file was created; every pin extends an existing suite in its existing idiom.

**Re-verified against the live worktree** after IMPL-LANE's #937 slug-resolution insertions landed in
`scripts/kaola-workflow-claim.js` (`resolveProjectSlug` at :334, the `cmdFinalize` call at :4183 —
ahead of every refusal door): `node scripts/test-finalize-door.js` gives the IDENTICAL result —
28 T12 reds, 12 T12b reds, **0 reachability reds**, `40 failures, 450 passed`. So the reds are
attributable to the prose corrections alone, and #937's change disturbs no door's reachability.

---

## Correction 1 — the classifier `blocked` reasoning must name WHICH artifact

### 1a. canonical CLI (and, by byte-identity, the claude-plugin mirror)

**File:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-937-938-939/scripts/test-bundle-state.js`

| test | line | name |
|---|---|---|
| (e) | 329 | `testLabelBlockNamesTheLabel` — a label-held claim names `workflow:in-progress` |
| (f) | 351 | `testMarkerBlockNamesTheMarker` — a marker-held claim names `kw:claim`, and the two arms do not emit the same sentence |
| (g) | 376 | `testAgedMarkerDoesNotBlock` — CONTROL: a >24h marker with no label does not block |

Section header at line 232; the file's own SCOPE header (lines 8-17) was extended to list them.
Drives the real subprocess `scripts/kaola-workflow-classifier.js classify --issue N` with
`KAOLA_GH_MOCK_SCRIPT` set in the child env from process start, `KAOLA_WORKFLOW_OFFLINE` deleted,
and a `git init -b main` fixture repo per arm. The mock lives in a sibling dir outside the repo.

**Why this home:** tests (c)/(d) already in this file drive the classifier CLI and assert its
blocking behaviour — this is the only free suite that already owns that drive.

**Coverage note:** `scripts/kaola-workflow-classifier.js` and
`plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` are in `COMMON_SCRIPTS`
(`scripts/validate-script-sync.js:45-48`), i.e. byte-identical-enforced, so driving canonical
covers the mirror. The mirror needs the regeneration, not its own test.

**Run:** `node scripts/test-bundle-state.js`

**VERBATIM RED at 42559b1c:**

```
Test (a): parseStateFile reads issue_numbers into an array
Test (b): single-issue state file yields issue_numbers: [] (AC#1 regression)
Test (c): classifier blocks issue #47 (member of live bundle [42,47,53])
Test (d): classifier does NOT block issue #77 (non-member)
Test (e): a label-held claim names the workflow:in-progress label
FAIL: a label-held claim must NAME the label an operator has to remove — the label never expires, so "has a remote workflow claim" sends them looking for a marker that is not there; got: "issue #501 has a remote workflow claim"
Test (f): a marker-held claim names the kw:claim marker comment
FAIL: a marker-held claim must NAME the marker comment — it expires 24h after its updated_at, and that is the whole difference from the label; got: "issue #501 has a remote workflow claim"
FAIL: the label arm and the marker arm must not emit the SAME sentence; both got: "issue #501 has a remote workflow claim"
Test (g): control — a >24h kw:claim marker with no label acquires

test-bundle-state: 3 test(s) FAILED, 26 passed
```

Exit 1. Tests (a)-(d) and the control (g) stay green: the reds are exactly the three new claims.

**One correction to the brief's method, measured:** both arms MUST drive the SAME issue number.
The defect sentence interpolates the number, so a two-number pair differs already and the
differ-check went green against the defect on the first draft. Both arms now use `#501`.

### 1b. gitlab — BOTH emitters

**File:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-937-938-939/plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
— block at lines **1114-1244**, immediately after the existing
`issueHasWorkflowInProgressLabel` / `issueHasRemoteClaimNotes` probes it builds on.

* line 1143 — site 1: in-process `classifier.classifyIssue` (the `:305` emitter the claim port
  reaches), driven through the suite's own `withForge` stub.
* line 1177 — site 2: `cmdClassify` CLI (the `:383` emitter), driven as a subprocess with
  `KAOLA_GLAB_MOCK_SCRIPT` (overriding this suite's global hostile shim) and `git init -b main`.
* line 1238 — the six findings are collected and reported by ONE `assert.deepStrictEqual`, because
  node's `assert` throws on the first failure and a fix that lands on one emitter and misses the
  other must be visible in a single run.

**Run:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

**VERBATIM RED at 42559b1c** (the AssertionError's `actual` array; thrown at
`test-gitlab-workflow-scripts.js:1240`):

```
  actual: [
    'classifyIssue (in-process site): a label-held claim must NAME the workflow:in-progress label — it never expires, so the operator has to remove it by hand; got: "issue #520 has a remote workflow claim"',
    'classifyIssue (in-process site): a note-held claim must NAME the kw:claim note — it expires 24h after updated_at, and that is the whole difference from the label; got: "issue #520 has a remote workflow claim"',
    'classifyIssue (in-process site): the label arm and the note arm must not emit the SAME sentence; both got: "issue #520 has a remote workflow claim"',
    'cmdClassify (CLI site): a note-held claim must NAME the kw:claim note; got: "issue #520 has a remote workflow claim"',
    'cmdClassify (CLI site): a label-held claim must NAME the workflow:in-progress label; got: "issue #520 has a remote workflow claim"',
    'cmdClassify (CLI site): the label arm and the note arm must not emit the SAME sentence; both got: "issue #520 has a remote workflow claim"'
  ],
  expected: [],
  operator: 'deepStrictEqual',
```

Exit 1. Baseline check: this suite exits **0** at HEAD in the unmodified root checkout
(`GitLab workflow script tests passed`), so the abort is the new pin, not pre-existing.

### 1c. gitea — BOTH emitters

**File:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-937-938-939/plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
— block at lines **1018-1149** (site 1 at 1048, site 2 at 1082, aggregate assert at 1143).
Same shape; `KAOLA_TEA_MOCK_SCRIPT`, `forge.listIssueComments`, `project.full_name`.

**Run:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

**VERBATIM RED at 42559b1c** (thrown at `test-gitea-workflow-scripts.js:1145`):

```
  actual: [
    'classifyIssue (in-process site): a label-held claim must NAME the workflow:in-progress label — it never expires, so the operator has to remove it by hand; got: "issue #520 has a remote workflow claim"',
    'classifyIssue (in-process site): a comment-held claim must NAME the kw:claim comment — it expires 24h after updated_at, and that is the whole difference from the label; got: "issue #520 has a remote workflow claim"',
    'classifyIssue (in-process site): the label arm and the comment arm must not emit the SAME sentence; both got: "issue #520 has a remote workflow claim"',
    'cmdClassify (CLI site): a comment-held claim must NAME the kw:claim comment; got: "issue #520 has a remote workflow claim"',
    'cmdClassify (CLI site): a label-held claim must NAME the workflow:in-progress label; got: "issue #520 has a remote workflow claim"',
    'cmdClassify (CLI site): the label arm and the comment arm must not emit the SAME sentence; both got: "issue #520 has a remote workflow claim"'
  ],
  expected: [],
  operator: 'deepStrictEqual',
```

Exit 1. Baseline: exits **0** at HEAD in the root checkout (`Gitea workflow script tests passed`).

### What correction 1 pins (and does NOT)

Pinned is the RESULT, not a wording:

* the label arm's `reasoning` contains `workflow:in-progress`;
* the marker/note arm's `reasoning` contains `kw:claim`;
* the two arms do not emit the SAME sentence (same issue number, so at HEAD they are byte-identical).

A message that names BOTH artifacts on BOTH arms passes the two contains-checks and fails the
differ-check — that near-miss is what the third assertion exists to catch. Every arm carries a
liveness assertion (`verdict === 'blocked'`) ahead of the message checks, and 1a carries a positive
control (aged marker, no label → NOT blocked) so a fixture that blocks for an incidental reason
cannot pass vacuously.

**Not pinned:** any requirement that a message mention the 24h expiry, and any negative of the form
"the label arm must not mention `kw:claim`". A good implementation may legitimately say
"the workflow:in-progress label is set (no kw:claim marker was probed)".

---

## Correction 2 — a refusing finalize must name `release` as the give-the-claim-back route

**File:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-937-938-939/scripts/test-finalize-door.js`
— **T12**, header at line 2217, IIFE at line 2260, re-reported footer at line 2409.

### SHARED-FILE DISCLOSURE

`test-finalize-door.js` is on TDD-LANE's list and we share one worktree, so this was a **single
atomic append at EOF** (`cat >>`, never a whole-file read-modify-write) of one self-contained block.
Because the file's own summary footer had already run by then, the block **re-reports and re-sets
`process.exitCode`** from the same `passed`/`failed` counters at its bottom — otherwise a red here
would be swallowed by an exit code computed before these assertions existed. One further one-line
in-place edit was needed afterwards to satisfy `test-spawn-classification.js` (see below).
TDD-LANE was messaged before the append; no objection had arrived at the time of writing.
`git status` showed the file unmodified by anyone else at append time.

### What it drives

Four doors × four editions (`CLAIM_EDITIONS`, the table already in this file), 16 legs:

| door | reason | fixture |
|---|---|---|
| 4282 | `finalize_gate_unverified` | in-place run, project folder absent → `archive_authority_missing` |
| 4253 | `finalize_mirror_refused` | linked worktree; main copy STALER (mission-list) **and** chmod-locked |
| 4333 | `implementation_commit_missing` | linked worktree, impl commit rolled back with `git reset --mixed HEAD~1` |
| 4348 | `staging_guard_multi_project` | linked worktree, own project touched+staged beside a foreign project |

Reuses this suite's existing `buildWorktreeRun` / `runFinalizeKeepWorktree` / `removeWorktreeFixture`
/ `makeBase` / `lastJson` / `rm` helpers. Every leg asserts REACHABILITY first
(`status !== 0 && json.reason === <door>`) — all 16 reachability assertions PASS at baseline, so the
message reds are attributable to the message and not to a dead fixture.

### The other two doors — T12b, added after the ruling

`archive_refused` (4384) and `archive_incomplete` (4419) carry **no `operator_hint` field at all** —
their guidance is in `reasoning`. T12 deliberately left them out, because giving them a hint field
is an ADDITION and not a test author's call.

**RULED (team-lead):** name the route in the `reasoning` field those two already emit; do NOT add an
`operator_hint`. Amending existing text adds nothing; a new field would. T12b implements that — see
the T12b section below.

### What is asserted per leg

1. `operator_hint` is a non-empty string (a pin that the field has not moved);
2. `/\brelease\b/` — the route is NAMED;
3. `/\bmain (root|checkout)\b/i` — where to run it, because `release` from inside the project folder
   refuses `refusing to discard current working directory` (`kaola-workflow-claim.js:5185`, verified
   in source at this baseline), which is exactly where an operator finalizing a run is standing.

Assertion 3 is **mixed on purpose**: on `finalize_mirror_refused` it is ALREADY GREEN (that hint says
"the main checkout" for an unrelated reason) and stays as a REGRESSION pin; on the other three it is
RED. That is why the failure count is 28 and not 32.

**Run:** `node scripts/test-finalize-door.js`

**VERBATIM RED at 42559b1c** (first leg of each door on the `root` edition; the remaining 20 lines
are the same two assertions repeated for `codex` / `gitlab` / `gitea`):

```
finalize-door tests passed (394 assertions)
T12: a refusing finalize names `release` as the route that gives the claim back
FAIL: T12(root finalize_gate_unverified): the refusal must name `release` as the way to give the claim back — the door correctly keeps holding the label and the kw:claim marker, so an operator who cannot satisfy it is stuck with no named way out; got operator_hint="Restore a valid archived workflow-state.md authority before resuming Finalization. No closure side effect was made."
FAIL: T12(root finalize_gate_unverified): naming `release` without naming the main root/checkout hands the operator a second dead end — from inside the project folder it refuses `refusing to discard current working directory`; got operator_hint="Restore a valid archived workflow-state.md authority before resuming Finalization. No closure side effect was made."
FAIL: T12(root finalize_mirror_refused): the refusal must name `release` as the way to give the claim back — the door correctly keeps holding the label and the kw:claim marker, so an operator who cannot satisfy it is stuck with no named way out; got operator_hint="The transaction owns the project-folder sync between the main checkout and the linked worktree, in BOTH directions, and could not perform it — one of the two trees is unwritable, or the main copy could not be repaired. `detail` names the tree and the error. Make that tree writable, then re-run finalize. Never hand-copy a staler main ledger over the worktree. No archive or closure side effect was made."
FAIL: T12(root implementation_commit_missing): the refusal must name `release` as the way to give the claim back — the door correctly keeps holding the label and the kw:claim marker, so an operator who cannot satisfy it is stuck with no named way out; got operator_hint="The branch carries no implementation commit while implementation-shaped changes are uncommitted. Author the implementation commit yourself, then re-run finalize. The machinery authors only the finalize bookkeeping commit; no archive or closure side effect was made."
FAIL: T12(root implementation_commit_missing): naming `release` without naming the main root/checkout hands the operator a second dead end — from inside the project folder it refuses `refusing to discard current working directory`; got operator_hint="The branch carries no implementation commit while implementation-shaped changes are uncommitted. Author the implementation commit yourself, then re-run finalize. The machinery authors only the finalize bookkeeping commit; no archive or closure side effect was made."
FAIL: T12(root staging_guard_multi_project): the refusal must name `release` as the way to give the claim back — the door correctly keeps holding the label and the kw:claim marker, so an operator who cannot satisfy it is stuck with no named way out; got operator_hint="Split the commit: the index carries workflow state that does not belong to this project. Unstage it, then re-run finalize. No archive or closure side effect was made."
FAIL: T12(root staging_guard_multi_project): naming `release` without naming the main root/checkout hands the operator a second dead end — from inside the project folder it refuses `refusing to discard current working directory`; got operator_hint="Split the commit: the index carries workflow state that does not belong to this project. Unstage it, then re-run finalize. No archive or closure side effect was made."
...same two assertions for codex / gitlab / gitea...
finalize-door tests FAILED (28 failures, 430 passed)
```

Exit 1. The `finalize-door tests passed (394 assertions)` line above T12 is the file's ORIGINAL
footer: the pre-existing suite is fully green and untouched — all 28 reds are T12's, and 36 new
assertions were added (16 reachability + 16 route + 4 non-empty-hint pass; 28 fail).

### T12b — the two doors that carry no `operator_hint`

**File:** same, **second atomic append**. `git diff -U0` is still ONE hunk:
`@@ -2214,0 +2215,325 @@` — pure insertion, nothing above line 2214 touched by either append.
The footer at the very end is now the AUTHORITATIVE one; T12's footer prints an intermediate
cumulative total. Two summary lines before the final one is the cost of append-only; the last line
decides the exit code.

Two doors × four editions, 8 legs, asserting on `reasoning` instead of `operator_hint`:

| door | envelope `reason` | lever |
|---|---|---|
| 4384 | **`archive_forced_refusal`** — NOT the literal `archive_refused`; that door emits `result.reason \|\| 'archive_refused'` and this result carries one | `KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL=1` (`claim.js:2625`; gitlab `:2337`, gitea `:2336`) |
| 4419 | `archive_incomplete` | a **symlink** in the live run folder's `.cache/`. `verifyArchiveComplete` (`claim.js:5925`) pushes any entry it cannot reduce to bytes into `invalid[]`, which seeds `mismatched[]`. Measured: `mismatched: [".cache/evidence-link.md"]`, `missing: []` — which is why that door reports both halves |

Same three assertions as T12 (non-empty field / `/\brelease\b/` / `/\bmain (root|checkout)\b/i`),
reachability-first. **The main-root cue is again mixed:** `archive_incomplete` is ALREADY GREEN
(`archiveIncompleteRemedy` says "the one in the main checkout") and stays a REGRESSION pin;
`archive_refused` is RED — its one sentence names no tree and no next move. That is why T12b adds
12 reds, not 16: 4 editions × (2 for `archive_refused` + 1 for `archive_incomplete`).

**Run:** `node scripts/test-finalize-door.js`

**VERBATIM RED at 42559b1c** (root edition; the other 9 lines repeat for codex / gitlab / gitea):

```
finalize-door tests FAILED (28 failures, 430 passed)
T12b: the two archive doors name `release` in the `reasoning` they already emit
FAIL: T12b(root archive_refused): the refusal must name `release` as the way to give the claim back — this door also returns before the claim-clearing loop, so the label and the kw:claim marker are both still held and the operator has no named way out; got reasoning="archival did not return an explicit success result; no roadmap, issue, label, worktree, or branch cleanup was performed."
FAIL: T12b(root archive_refused): naming `release` without naming the main root/checkout hands the operator a second dead end — from inside the project folder it refuses `refusing to discard current working directory`; got reasoning="archival did not return an explicit success result; no roadmap, issue, label, worktree, or branch cleanup was performed."
FAIL: T12b(root archive_incomplete): the refusal must name `release` as the way to give the claim back — this door also returns before the claim-clearing loop, so the label and the kw:claim marker are both still held and the operator has no named way out; got reasoning="the archive copy does not faithfully reproduce the live project (.cache/evidence-link.md); every live project folder was left in place — no roadmap/issue/label side effect was performed. The archive must reproduce every file the source contains, byte for byte and entry kind for entry kind. Every live copy is compared against the archive — the run folder in the tree this command was invoked from (<tmp>/wt/kaola-workflow/issue-9070) and, on a linked run, the one in the main checkout — so a named file may be held by either. Put each named file in <tmp>/wt/kaola-workflow/issue-9070, then re-run: the archive is built by copying THAT folder, so a file left only in the main checkout is not carried in."
...same three assertions for codex / gitlab / gitea...
finalize-door tests FAILED (40 failures, 450 passed)
```

Exit 1. **Regression check, measured on this same run:** the original footer still reads
`finalize-door tests passed (394 assertions)`, and T12's footer still reads
`28 failures, 430 passed` — identical to before T12b. All 8 new reachability assertions PASS
(`grep -c "must still reach this door"` → **0**). Reds by leg, all four editions:

```
   1 T12b(codex archive_incomplete)     2 T12b(codex archive_refused)
   1 T12b(gitea archive_incomplete)     2 T12b(gitea archive_refused)
   1 T12b(gitlab archive_incomplete)    2 T12b(gitlab archive_refused)
   1 T12b(root archive_incomplete)      2 T12b(root archive_refused)
```

---

## GENERATED-SURFACE VERDICT

**No text pinned by these tests lives on a generated surface.** All of it is string literals inside
`claim.js` / the classifiers.

* `scripts/kaola-workflow-classifier.js` and `scripts/kaola-workflow-claim.js` are in
  `COMMON_SCRIPTS` (`scripts/validate-script-sync.js:45-48`): the
  `plugins/kaola-workflow/scripts/` copies must be **byte-identical**. Edit canonical, then
  `node scripts/edition-sync.js --write` (or `npm run sync:editions`) and **commit the regenerated
  copy in the same commit** — the parity guard reads COMMITTED blobs.
* `plugins/kaola-workflow-gitlab/…` and `plugins/kaola-workflow-gitea/…` are DIVERGENT HAND-PORTS.
  Nothing generates them and `validate-script-sync.js` compares the forge-renamed classifier to
  nothing but its export-key set. **Four separate hand edits**, and the classifier ports need
  **two** each (`:305` return site and `:383` write site).
* `node scripts/generate-routing-surfaces.js --check` reports **18 surfaces** and is unaffected by
  these tests.

**BUT — one thing the implementer must not get wrong.** #939's residual is stated as "no refusal
envelope **and no command surface** names `release`". These tests cover only the ENVELOPE half. If
the implementer also adds the route to the finalize command/SKILL prose, that text is
**GENERATED**: it must be edited in `templates/routing/finalize.skeleton.md` (and/or
`templates/routing/slots.js`) and regenerated — **never in a rendered surface**, which
`generate-routing-surfaces.js --check` runs in every chain and would red. Measured at this baseline:
`templates/routing/finalize.skeleton.md` mentions `release` only at line 259 ("the claim is
released", describing the success path), and `slots.js:93` (`in-sk-001`) lists `release/discard`
only as a capability of `claim.js` on the INIT surface. Neither names it as the recovery route.
`docs/api.md` is hand-written, not generated, and names `release` for one unrelated archive reason.

---

## Housekeeping done as part of this work

`scripts/test-spawn-classification.js` is a forward-only ceiling guard: new `spawnSync` sites must
carry a `// spawn-class: <class>` comment on the same or preceding line. Six new sites classified —
`test-bundle-state.js` (2), `test-finalize-door.js` (2: T12 + T12b),
`test-gitlab-workflow-scripts.js` (2), `test-gitea-workflow-scripts.js` (2) — as `environment`
(the `git init` fixtures) or `cli-contract` (the CLI drives).

**That guard is now GREEN.** A violation at `scripts/simulate-workflow-walkthrough.js:7138` (a
`spawn-class` marker carrying prose after the class token, which the closed vocabulary rejects) was
TDD-LANE's; it was reported to them and they fixed it by moving the prose to its own line ABOVE the
marker. Current state:

```
spawn-classification passed (10 mutation assertions; 644 spawn sites across 65 files, 212 classified, 432 grandfathered; 126 slot(s) of slack)
```

**Run:** `node scripts/test-spawn-classification.js` → exit 0.
