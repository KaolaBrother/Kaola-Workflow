# Investigation: issue #936 — claim-release asymmetry (label vs `kw:claim` marker)

## Setup

- Commit: `ecdb2c88e359ca77bf99bf692309ba58bff0ac6a`, branch `main`
- Tree: clean except untracked `kaola-workflow/issue-936/` (and a pre-existing linked worktree at
  `.kw/worktrees/issue-936/`, not touched or measured)
- Platform: darwin, node from `process.execPath`
- No tracked file was modified. All measurements are greps, `node -e` drives against the shipped
  sources, and one real walkthrough run.

**Verdict up front: the core asymmetry the issue claims is REAL and is confirmed by four independent
measurements.** Several supporting details in the issue are imprecise or incomplete; each is called
out below. Two facts material to the issue are *missing* from it entirely (a 24-hour marker
expiry, and a second sink path that does not release the claim at all).

---

## Observations

| # | Measurement | Command | Result | Exit |
|---|---|---|---|---|
| 1 | marker literal in sink-merge | `grep -c "kw:claim" scripts/kaola-workflow-sink-merge.js` | `0` | 1 |
| 2 | `gh api` in sink-merge | `grep -n "'api'" scripts/kaola-workflow-sink-merge.js` | no output | 1 |
| 3 | every forge verb sink-merge can issue | `grep -o "ghExec(\[[^]]*\]" … \| sort \| uniq -c` | `issue edit` ×6, `issue close` ×3, `issue comment` ×2, `issue view` ×1, `issue reopen` ×1 | 0 |
| 4 | `clearAdvisoryClaim` exported? | `node -e "require('./scripts/kaola-workflow-claim.js').clearAdvisoryClaim"` | `undefined` | 0 |
| 5 | existing marker pins at HEAD | `node scripts/simulate-workflow-walkthrough.js --only testClearAdvisoryClaim` | 3 scenarios PASSED | 0 |
| 6 | classifier matrix (7 legs) | driven `classify --issue 500` with a `gh` mock | see §Claim 3 | 0 |

Observation 3 is the decisive one: **sink-merge.js issues no `gh api` call of any kind.** Deleting a
comment requires `api --method DELETE repos/{owner}/{repo}/issues/comments/<id>`. That verb does not
exist in the file, so the sink cannot delete the marker regardless of intent. Observation 4 closes
the other door: `clearAdvisoryClaim` is module-private (it is *not* in claim.js's export list, while
its sibling `postAdvisoryClaim` *is*), so sink-merge could not call it even if it wanted to.
sink-merge's import from claim.js is explicit and does not include it —
`scripts/kaola-workflow-sink-merge.js:6`:

```js
const { getCoordRoot, mainRootFromCoord, resolveMainRoot, readActiveFolders, removeWorktree, buildClosureReceipt, checkClosureInvariants, defaultBranch, appendClosureBlock } = require('./kaola-workflow-claim.js');
```

---

## Claim 1 — `clearAdvisoryClaim()` (issue says claim.js:957, :967-979)

**Line numbers are exactly right.** `scripts/kaola-workflow-claim.js:957-981`:

```js
function clearAdvisoryClaim(issueNumber, reason, project) {
  if (OFFLINE || issueNumber == null) return 'skipped_offline';
  let status = 'failed';
  try {
    ghExec(['issue', 'edit', String(issueNumber), '--remove-label', CLAIM_LABEL]);
    status = 'removed';
  } catch (_) {}
  if (reason) {
    try { ghExec(['issue', 'comment', String(issueNumber), '--body', 'Kaola-Workflow advisory claim cleared: ' + reason]); } catch (_) {}
  }
  // Delete the project-scoped kw:claim marker comment so the remote-claim detector
  // no longer blocks re-claiming this issue after discard/release/finalize (#275).
  try {
    const raw = ghExec(['api', 'repos/{owner}/{repo}/issues/' + String(issueNumber) + '/comments']);
    const comments = JSON.parse(raw || '[]');
    const marker = project ? ('<!-- kw:claim project=' + project + ' -->') : null;
    for (const comment of comments) {
      if (!comment || !comment.body || !comment.id) continue;
      if (marker ? comment.body.includes(marker) : /<!--\s*kw:claim\s+project=/.test(comment.body)) {
        try { ghExec(['api', '--method', 'DELETE', 'repos/{owner}/{repo}/issues/comments/' + String(comment.id)]); } catch (_) {}
      }
    }
  } catch (_) {}
  return status;
}
```

**What it removes** — three things, in order: (a) the `workflow:in-progress` label; (b) *adds* a
human-readable "advisory claim cleared: `<reason>`" comment when `reason` is truthy; (c) deletes
**every** comment whose body contains the project-scoped marker (a loop, not a first-match break).

**How it finds the marker** — plain `String.prototype.includes` of the exact 35-ish-char literal
`<!-- kw:claim project=<name> -->`. Therefore: **case-sensitive**, **whitespace-exact** (one space
after `<!--`, one after `kw:claim`, one before `-->`), and **substring** — not anchored, so a comment
that merely *quotes* the marker in prose is also deleted. It matches the producer at claim.js:937
byte-for-byte, so on the real path it always hits.

**When `project` is undefined/empty** — the ternary falls back to the regex
`/<!--\s*kw:claim\s+project=/`, which matches **any project's** marker and would delete another
project's live claim. **This branch is unreachable in production.** All eight call sites pass a
non-empty string:

| call site | function | `project` argument | why non-empty |
|---|---|---|---|
| claim.js:4605, :4611 | `cmdFinalize` | `args.project` | `assert(args.project, '--project required')` at claim.js:4140 |
| claim.js:5261, :5266 | `cmdRelease` | `folder.project` | folder from `activeByProject`/`activeByIssue` |
| claim.js:6170, :6175, :6270, :6275 | `cmdWatchPr` | `folder.project` | folder from `readActiveFolders` |

and `readActiveFolders` populates `project: name` from the directory entry name
(`scripts/kaola-workflow-active-folders.js:262`), which is always a non-empty string. So the fallback
is a defensive arm with no door — worth flagging, but **not** a live hazard today.

**When it does not match** — nothing happens. No warning, no status change; the loop simply finds no
comment. The return value reports only the *label*: `'removed'` / `'failed'` / `'skipped_offline'`.

**Is failure swallowed?** — Yes, comprehensively, and this is the point worth carrying forward. There
are **four** independent `catch (_) {}` blocks: label removal (status→`'failed'`, the only failure
that is visible at all), the advisory comment, the whole list-comments block, and each individual
DELETE. **The marker deletion has no observable success/failure signal whatsoever** — the return
value describes the label and nothing else. A comments-list 404 or a DELETE permission error is
indistinguishable from a clean run.

`removeBundleLabel` (claim.js:1610-1627) is a near-duplicate of the marker-deletion block, differing
only in that it has no `project`-undefined fallback (claim.js:1619 builds the marker unconditionally)
and that its label removal *throws* rather than swallowing (claim.js:1613).

---

## Claim 2 — sink-merge removes only the label

**Confirmed, and the six line numbers are exactly right.** `grep -c "kw:claim"
scripts/kaola-workflow-sink-merge.js` → `0`, exit 1 (measurement 1). Full enumeration:

| # | file:line | verb | terminal mode | close vs keep-open | single vs bundle |
|---|---|---|---|---|---|
| 1 | sink-merge.js:961 | `--remove-label` | `postMergeCleanup` | **BOTH** (comment at :960 says so) | primary |
| 2 | sink-merge.js:971 | `--remove-label` | `postMergeCleanup` | keep-open only (`#403.6` arm) | bundle member |
| 3 | sink-merge.js:996 | `--remove-label` | `postMergeCleanup` | close only | bundle member (close succeeded) |
| 4 | sink-merge.js:1006 | `--remove-label` | `postMergeCleanup` | close only | bundle member (already-closed) |
| 5 | sink-merge.js:2829 | `--remove-label` | `runSinkTransaction` closure step | **close only** | primary |
| 6 | sink-merge.js:2840 | `--remove-label` | `runSinkTransaction` closure step | **close only** | bundle member |

**True count: 6 sites, zero marker deletions.** All six are label-only.

The issue's two quoted anchors verify verbatim. sink-merge.js:960:

```js
    // Claim-label removal runs in BOTH modes (claim release is wanted on keep-open).
```

and the `#403.6` keep-open bundle arm at sink-merge.js:963-973, exactly at the cited lines.

### Correction to the issue's framing: the six sites are not one group

The issue lists all six as a flat list. They belong to **two mutually exclusive terminal paths**:

- `postMergeCleanup` (sink-merge.js:822…) — sites 1-4. Reached from `main()` at sink-merge.js:3209.
- `runSinkTransaction` (sink-merge.js:1930…) — sites 5-6. Reached from `main()` at sink-merge.js:3026,
  which `return`s immediately after, so the two paths never both run.

**This matters, because they disagree on keep-open.** `postMergeCleanup` removes the label in both
modes (its :960 comment is a deliberate design statement). `runSinkTransaction` does not: sites 5 and
6 are both inside `if (!keepIssueOpen) {` at sink-merge.js:2809, and that block has **no `else`
arm** — it closes at :2864, then falls straight to `stepDone('closure')` at :2866. So:

> **On `--sink --keep-issue-open`, the closure step is a complete no-op: no close, no comment, no
> label removal, no marker deletion.** The claim is not released at all on that path.

The issue does not mention this. It is a second, sharper asymmetry inside the file the issue is about.

There is also a keep-open *derivation* mismatch between the two paths. `postMergeCleanup` honours the
archived `issue_action: comment_keep_open` even when the flag is absent (sink-merge.js:915-924), and
so does the terminal guard via `deriveSinkKeepOpen` (sink-merge.js:1885-1896, called at :2910). But
the `runSinkTransaction` closure step uses the raw flag only — sink-merge.js:2808:

```js
        const keepIssueOpen = !!args.keepIssueOpen;
```

as does the `#517` push-time reopen at sink-merge.js:2731. I did **not** drive this combination, so I
am not asserting the end-to-end consequence; I am reporting that three of the four keep-open
decisions in the file read three different sources.

### Cross-edition note (outside the issue's scope, but part of the true census)

The gitlab and gitea sink ports have **seven** claim-release sites, not six — six positional mirrors
plus one extra in a function canonical GitHub does not have, `closeLinkedIssue`
(`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js:584`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js:581`). It is also label-only.
`grep -c remove-label` returns 0 on both ports because they go through `forge.updateIssue({unlabels})`
/ `forge.updateIssueLabels({remove})` rather than a raw `gh` flag — the issue's grep-based test would
give a misleading 0 there.

---

## Claim 3 — the classifier

**Both halves confirmed, and the two cited line numbers are exactly right.**

`scripts/kaola-workflow-classifier.js:361-364` — the closed short-circuit, which returns before any
claim inspection:

```js
  if ((issue.state || '').toLowerCase() === 'closed') {
    process.stdout.write(JSON.stringify({ verdict: 'red', reasoning: 'issue #' + args.issue + ' is already closed' }) + '\n');
    return;
  }
```

`scripts/kaola-workflow-classifier.js:371-374` — `blocked` as label-OR-marker, with the label
evaluated first and short-circuiting:

```js
  let blocked = issueHasWorkflowInProgressLabel(issue.labels || []);
  if (!blocked) {
    try {
      blocked = issueHasRemoteClaimComment(args.issue);
```

### Driven matrix (measurement 6)

Seven legs, each a real `classify --issue 500` subprocess against a `gh` mock, one axis varied at a
time:

| leg | issue state | comment body | marker age | verdict |
|---|---|---|---|---|
| A | open | `<!-- kw:claim project=issue-500 -->` | 0 h | `blocked` |
| B | **closed** | `<!-- kw:claim project=issue-500 -->` | 0 h | `red` — "already closed" |
| C | open | `<!-- kw:claim project=issue-500 -->` | **25 h** | **`green`** |
| D | open | `<!-- kw:claim project=issue-500 -->` | 23 h | `blocked` |
| E | open | `<!-- kw:claim sess=abc -->` | 0 h | `blocked` |
| F | open | *(no comments)* | — | `green` |
| G | open + **label** | *(no comments)* | — | `blocked`, comments probe **never ran** |

- **A vs F** confirms the marker alone blocks an OPEN issue.
- **B** confirms a leftover marker on a CLOSED issue is harmless: the short-circuit fires first and
  the comments probe is never reached.
- **G** confirms the documented label-first short-circuit (the mock printed `COMMENTS_PROBE_RAN` to
  stderr on any comments fetch; it did not appear).

### Fact missing from the issue: the marker expires after 24 hours

Legs C and D isolate it. `scripts/kaola-workflow-classifier.js:216-217`:

```js
      if (!comment.updated_at) return true;
      return Date.now() - new Date(comment.updated_at).getTime() < 24 * 60 * 60 * 1000;
```

A leftover marker blocks an OPEN issue **for 24 hours only**, then self-heals. A marker with no
`updated_at` blocks forever. This bounds the blast radius of the asymmetry considerably and the issue
should be read with it in mind. The label, by contrast, never expires.

### Second wrinkle: the detector is strictly wider than the deleter

The detector accepts `sess=` (classifier.js:215, and identically in all three ports), but
**no producer of a `sess=` marker exists anywhere in the repo** — `grep -rn "sess=" scripts/` returns
nothing. Leg E shows such a marker *would* block, and `clearAdvisoryClaim`'s deleter (which only ever
builds a `project=` literal) would never clear it. A/B of the two shipped predicates, transcribed
verbatim from classifier.js:215 and claim.js:975, over eight body variants:

| body | DETECT (blocks) | DELETE (cleared) |
|---|---|---|
| canonical, as produced | true | true |
| `<!--kw:claim project=issue-500-->` (no inner spaces) | true | **false** |
| two spaces after `kw:claim` | true | **false** |
| newline instead of space | true | **false** |
| `<!-- KW:CLAIM … -->` (uppercase) | false | false |
| different project | true | false *(by design — project scoping)* |
| `sess=` form | true | **false** |
| marker quoted in prose | true | true |

Only the canonical producer exists, so the whitespace rows are unreachable today; they are reachable
by a hand-written comment. The "different project" row is intended behaviour, not a defect: another
project's live claim *should* block, and walkthrough
`testClearAdvisoryClaimDoesNotDeleteOtherProjectMarker` pins exactly that.

---

## Claim 4 — full producer/consumer census of `<!-- kw:claim project=… -->`

### Producers (write the marker) — 6, all identical in shape

| file:line | function | exact text |
|---|---|---|
| `scripts/kaola-workflow-claim.js:937` | `postAdvisoryClaim` | `'<!-- kw:claim project=' + project + ' -->\nKaola-Workflow started local work for `' + project + '`.'` |
| `scripts/kaola-workflow-claim.js:1602` | `addBundleLabel` | same string |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:937, :1602` | (byte-identical mirror) | same |
| `plugins/kaola-workflow-gitlab/…-claim.js:806, :1091` | gitlab port | `… -->\nKaola-Workflow started local **GitLab** work for …` |
| `plugins/kaola-workflow-gitea/…-claim.js:806, :1094` | gitea port | `… -->\nKaola-Workflow started local **Gitea** work for …` |

The HTML-comment prefix `<!-- kw:claim project=<name> -->` is byte-identical across all editions;
only the trailing prose differs.

### Consumers — 2 kinds, 5 sites

**Readers (detect):**

| file:line | who |
|---|---|
| `scripts/kaola-workflow-classifier.js:215` | `issueHasRemoteClaimComment` — the only detector |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js:215` | mirror |
| `plugins/kaola-workflow-gitlab/…-classifier.js:100` | gitlab port |
| `plugins/kaola-workflow-gitea/…-classifier.js:100` | gitea port |

All four use the same regex `/<!--\s*kw:claim\s+(project|sess)=/`.

**Deleters:**

| file:line | function | match rule |
|---|---|---|
| `scripts/kaola-workflow-claim.js:972-978` | `clearAdvisoryClaim` | exact `includes`, regex fallback if `project` falsy |
| `scripts/kaola-workflow-claim.js:1619-1625` | `removeBundleLabel` | exact `includes`, no fallback |
| (+ the three port mirrors at gitlab :825/:1111, gitea :829/:1113) | | same |

**Guards / tests (neither produce nor consume, but pin the format):**
`scripts/validate-workflow-contracts.js:304` and `scripts/validate-kaola-workflow-contracts.js:168`
both `assertIncludes(… 'kw:claim\\s+(project|sess)=')` — they pin the *detector*, not the deleter.
`scripts/simulate-workflow-walkthrough.js:2163, 7318, 7366, 7409` carry fixture markers.

### How many places believe they know the marker's format?

**Three distinct format beliefs**, and they do not agree:

1. **Producers (6 sites)** — emit one canonical literal with fixed spacing and `project=`.
2. **Detector (4 sites)** — a *tolerant* regex accepting arbitrary inner whitespace and **`sess=` as
   well as `project=`**.
3. **Deleter (6 sites)** — an *exact, case-sensitive substring*, `project=` only, plus one
   unreachable wide-regex fallback.

Belief 2 is strictly wider than belief 3. That gap is where an unclearable-but-blocking marker lives.
No single constant is shared; each of the sixteen sites re-spells the format inline. There is no
exported `KW_CLAIM_MARKER` anywhere — I checked `kaola-workflow-adaptive-schema.js` (the declared
cross-edition constants module) and the marker is not there.

---

## Claim 5 — paths by which an issue survives a sink/finalize still OPEN

Six terminal modes. The claim-release column is the answer to the issue's question.

| # | mode | where | issue ends | label released? | marker deleted? |
|---|---|---|---|---|---|
| 1 | `postMergeCleanup` keep-open, primary | sink-merge.js:928-932, :961 | OPEN | **yes** (:961, both modes) | no |
| 2 | `postMergeCleanup` keep-open, bundle members | sink-merge.js:967-973 | OPEN | **yes** (:971) | no |
| 3 | **`runSinkTransaction` keep-open** | sink-merge.js:2806-2866 | OPEN | **NO — nothing runs** | no |
| 4 | `#517` push-time reopen after auto-close | sink-merge.js:2731-2742 | OPEN (reopened) | depends on which arm ran | no |
| 5 | terminal `keep_open_verify` reopen | sink-merge.js:2915-2928 | OPEN (reopened) | — | no |
| 6 | close **failed** → `sink_incomplete` refusal | sink-merge.js:2848-2862; :946-949; :997-1010 | OPEN | best-effort/no | no |

Keep-open intent has three sources, all reaching the same token `issue_action: comment_keep_open`:

- the `--keep-issue-open` flag (`sink-merge.js:402`),
- the receipt field `keep_open_requested` (`sink-merge.js:1359`),
- the archived/live `workflow-state.md` field, matched by `/^issue_action:\s*comment_keep_open\s*$/m`
  at sink-merge.js:919, :1893 and claim.js:4287.

**In the normal flow the marker is nonetheless cleared** — by `cmdFinalize`, which runs before the
sink and calls `clearAdvisoryClaim` **unconditionally** at claim.js:4601-4612, *above* and
independent of its own `keepIssueOpen` branch at :4625. So keep-open finalize still deletes the
marker. The exposure is a sink that runs **without** a preceding `cmdFinalize`, or where finalize's
swallowed marker-delete silently failed.

### The invariant surface only knows about the label

`checkClosureInvariants` keys the `in-progress-label-removed` violation on `receipt.claim_label_removed`
(claim.js:3246-3249), which `clearAdvisoryClaim` populates from the **label** result only. There is
no marker invariant. Likewise the drift sweeper `kaola-workflow-closure-audit.js` repairs class (c)
"closed remote issues still carrying the `workflow:in-progress` label" (its header, :9, and the fix at
:628) — **there is no equivalent sweep for a leftover marker**. So nothing in the system detects or
repairs a stranded marker; the 24-hour expiry is the only thing that clears it.

### Complete label-release census (for contrast with the marker's 6 deleter sites)

`workflow:in-progress` is removed at **10** places in canonical scripts:
claim.js:244 (`closeIssueIdempotent`, exported), :961 (`clearAdvisoryClaim`), :1613
(`removeBundleLabel`), :5789 (`cmdRepairLabels`); sink-merge.js:961, :971, :996, :1006, :2829, :2840;
plus closure-audit.js:628. The marker is deleted at **2** (claim.js:972-978, :1619-1625), both inside
claim.js, both module-private or bundle-rollback-only.

---

## Narrowing — what each leg eliminated

- **`grep -c kw:claim` = 0** eliminated "sink-merge deletes the marker under a different spelling."
- **`grep "'api'"` = empty** eliminated "sink-merge deletes it via a raw API call" — the verb is absent.
- **`clearAdvisoryClaim` not exported** eliminated "sink-merge delegates to claim.js for the marker."
- **Leg B (closed + marker → `red`)** eliminated "a leftover marker on a closed issue blocks re-claim."
- **Leg C vs D (25 h vs 23 h)** eliminated "a leftover marker blocks forever" — it expires at 24 h.
- **Leg G (label, no marker, probe silent)** eliminated "the comments probe always runs."
- **Call-site enumeration (8 sites, all non-empty `project`)** eliminated "the wide-regex fallback can
  delete another project's marker in production."

---

## Inferences (labelled; these are mine, not measurements)

1. **The asymmetry is structural, not an oversight of a single line.** Deletion requires a comment id,
   which requires a list call, which requires `gh api` — a capability sink-merge does not have at all,
   and a function it cannot import. — confidence: high; refuted by finding any `gh api` /
   comment-enumeration path in sink-merge, or an export of `clearAdvisoryClaim`.
2. **The practical impact is bounded by the 24-hour expiry and by `cmdFinalize` clearing the marker
   first.** The realistic exposure window is a sink run within 24 h of a claim where finalize did not
   run or its swallowed delete failed. — confidence: medium-high; refuted by a marker comment lacking
   `updated_at` (blocks indefinitely per classifier.js:216), or by a sink flow that legitimately skips
   finalize.
3. **`runSinkTransaction`'s keep-open no-op (mode 3) is a larger hole than the marker asymmetry**,
   because it strands the *label* too — and the label has no expiry and is what
   `checkClosureInvariants` and closure-audit key on. — confidence: medium-high; refuted by showing
   `--sink --keep-issue-open` is unreachable, or that a later step releases the label on that path
   (I found none between :2866 and the terminal emit).
4. **The `project`-falsy fallback at claim.js:975 is dead code.** — confidence: medium-high; refuted by
   a ninth call site or a folder whose `project` can be empty. I enumerated statically rather than
   instrumenting, deliberately.

---

## Open — not measured, and why

- **I did not drive an end-to-end online sink** to observe the absence of a marker DELETE. Building a
  fixture that reaches the closure step (git repo + branch + worktree + archive + receipt) is
  substantial, and measurements 2-4 settle the question structurally: the file has no API verb and no
  access to the function. If you want the belt-and-braces run, say so and I will build it.
- **The keep-open derivation mismatch (sink-merge.js:2808/:2731 raw flag vs `deriveSinkKeepOpen`) is
  reported as read, not driven.** I did not run the combination "archived `comment_keep_open` +
  `--sink` without the flag," so I make no claim about whether the terminal guard fully compensates.
- **The gitlab/gitea sinks were censused by grep only**; per memory, `test-gitlab-sinks.js` /
  `test-gitea-sinks.js` red at baseline on this box (unset `init.defaultBranch`), so I did not run
  them and would not have been able to read a signal from them.
- **I did not check the four installed runtime homes**, only the repo. An installed edition could in
  principle be stale relative to `ecdb2c88`.
- **`.kw/worktrees/issue-936/` was left untouched** — it holds another agent's work.
