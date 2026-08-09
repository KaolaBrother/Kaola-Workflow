# Investigation: issue #938 — the offline finalize walks away from remote claim artifacts

**Verdict: CONFIRMED**, with one correction to the issue's framing (the equal treatment of
`skipped_offline` and `removed` is *explicit and pinned*, not an accidental truthy read) and one
finding the issue does not mention (the surviving **label** blocks re-claim **forever**; only the
marker comment expires at 24h).

---

## Setup

- Repo under test: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`, HEAD `42559b1c`
  (`chore: archive issue-936 [sink]`), working tree clean apart from the pre-existing live claim
  folder `kaola-workflow/bundle-937-938-939/`.
- **No tracked file in the real repo was modified, and no command was run with the repo root as
  cwd.** Every drive runs in a throwaway git repo under the session scratchpad; the claim script is
  invoked by absolute path.
- **No live forge call.** Every `gh` invocation goes through `KAOLA_GH_MOCK_SCRIPT`.
- Node v24.18.0, git 2.x, darwin 25.6.0.

### Harness (all under the session scratchpad, nothing installed)

| file | what it is |
|---|---|
| `<scratch>/gh-mock.js` | **stateful** gh mock. Keeps real issue state (`state` / `labels` / `comments` with `created_at`/`updated_at`) in a JSON store, and appends **every** invocation as one JSON line `{argv, cwd}` to a log. Routes: `repo view`, `issue view N [--jq .state]`, `issue list [--state][--label]`, `issue close`, `issue edit --add-label/--remove-label`, `issue comment --body`, `label create`, `api …/issues/N/comments`, `api --method DELETE …/issues/comments/<id>`. |
| `<scratch>/drive-938.js` | builds a fresh git repo per leg, drives a **real bundle claim** (`startup --target-issues 601,602`) so the label+marker are posted by production code, then drives `finalize`. Separate call log per phase. |
| `<scratch>/isolate-938.js` | the 2×2 artifact-isolation cells (below). |
| `<scratch>/precedent-938.js` | renders a **real** `## Finalize Findings` section (mirrors `scripts/test-forge-finalize-findings.js` part A). |
| `<scratch>/results.json`, `isolate-results.json` | raw captures. |

Patterned on `scripts/test-bundle-claim.js` (fixture + `runClaim`), `scripts/test-bundle-finalize.js`
(state file + finalize-by-subprocess), and `scripts/test-forge-finalize-findings.js` (worktree
finalize fixture + index-lock fault).

### Commands (verbatim)

```
# fixture setup, per leg (cwd = the throwaway repo)
git init -b main && git config user.email test@example.com && git config user.name 'Test User'
#   + kaola-workflow/.roadmap/issue-601.md, issue-602.md, kaola-workflow/ROADMAP.md, README.md
git add -A && git commit -m init

# phase 1 — CLAIM (production code posts the artifacts)
KAOLA_GH_MOCK_SCRIPT=<scratch>/gh-mock.js KW_MOCK_STORE=<leg>/store.json \
KW_MOCK_LOG=<leg>/claim.log KAOLA_WORKTREE_NATIVE=0 KAOLA_WORKFLOW_OFFLINE=0 \
  node /Volumes/.../scripts/kaola-workflow-claim.js startup --target-issues 601,602

# phase 2 — FINALIZE
KAOLA_GH_MOCK_SCRIPT=<scratch>/gh-mock.js KW_MOCK_STORE=<leg>/store.json \
KW_MOCK_LOG=<leg>/finalize.log KAOLA_WORKTREE_NATIVE=0 KAOLA_WORKFLOW_OFFLINE=<0|1> \
  node /Volumes/.../scripts/kaola-workflow-claim.js finalize --project bundle-601-602 --json [--keep-issue-open]
```

---

## Observations

### 1. The two-leg ledger — positive control first

Same fixture, same claim phase (14 forge calls, identical in every leg), only
`KAOLA_WORKFLOW_OFFLINE` differs at finalize.

| leg | finalize env | exit | `claim_label_removed` | forge calls at finalize | #601 label after | #601 kw:claim marker after | #602 label after | #602 marker after |
|---|---|---|---|---|---|---|---|---|
| **A — positive control** | `KAOLA_WORKFLOW_OFFLINE=0`, `--keep-issue-open` | 0 | `removed` | **11** | *(gone)* | *(gone)* | *(gone)* | *(gone)* |
| **B — the claim** | `KAOLA_WORKFLOW_OFFLINE=1`, `--keep-issue-open` | 0 | `skipped_offline` | **0** | `workflow:in-progress` | **present** | `workflow:in-progress` | **present** |
| C — control, close lane | `OFFLINE=0`, no keep-open | 0 | `removed` | **11** | *(gone)* | *(gone)* | *(gone)* | *(gone)* |
| D — close lane offline | `OFFLINE=1`, no keep-open | 0 | `skipped_offline` | **0** | `workflow:in-progress` | **present** | `workflow:in-progress` | **present** |
| E — offline **claim** | claim `OFFLINE=1`, finalize `OFFLINE=1` | 0 | `skipped_offline` | claim **0** / finalize **0** | *(never posted)* | *(never posted)* | *(never posted)* | *(never posted)* |

Claim-phase call tally, identical in legs A–D (14):
`{issue-view: 4, repo-view: 2, comment-list: 2, label-create: 2, label-add: 2, issue-comment: 2}`.

Leg A finalize call tally (11):
`{issue-list: 1, issue-view: 2, label-remove: 2, issue-comment: 2, comment-list: 2, comment-delete: 2}`.

Leg A's log verbatim (the removal the offline leg does not do):

```
{"argv":["issue","list","--state","all","--limit","200","--json","number,state"], …}
{"argv":["issue","view","601","--json","state"], …}
{"argv":["issue","edit","601","--remove-label","workflow:in-progress"], …}
{"argv":["issue","comment","601","--body","Kaola-Workflow advisory claim cleared: finalized"], …}
{"argv":["api","repos/{owner}/{repo}/issues/601/comments"], …}
{"argv":["api","--method","DELETE","repos/{owner}/{repo}/issues/comments/1"], …}
{"argv":["issue","edit","602","--remove-label","workflow:in-progress"], …}
{"argv":["issue","comment","602","--body","Kaola-Workflow advisory claim cleared: finalized"], …}
{"argv":["api","repos/{owner}/{repo}/issues/602/comments"], …}
{"argv":["api","--method","DELETE","repos/{owner}/{repo}/issues/comments/2"], …}
{"argv":["issue","view","602","--json","state"], …}
```

Leg B's finalize log is **empty — zero bytes, zero lines**. The mock is the same file, wired the
same way, and it recorded 14 calls in leg B's own claim phase minutes earlier, so "zero calls" is a
measurement, not an unwired mock.

**Artifact survival is asserted from the mock's issue state, not inferred from the call count.**
Leg B store, post-finalize, both members:

```json
"601": { "state": "open", "labels": ["workflow:in-progress"],
         "comments": [ { "id": 1,
           "body": "<!-- kw:claim project=bundle-601-602 -->\nKaola-Workflow started local work for `bundle-601-602`." } ] }
"602": { "state": "open", "labels": ["workflow:in-progress"],
         "comments": [ { "id": 2,
           "body": "<!-- kw:claim project=bundle-601-602 -->\nKaola-Workflow started local work for `bundle-601-602`." } ] }
```

Both artifacts survive on **every** member of the bundle, in both the keep-open and the close lane.

### 2. Leg B's full envelope (verbatim, `--json`)

```json
{
  "status": "closed",
  "archived": true,
  "dest": "<leg>/repo/kaola-workflow/archive/bundle-601-602",
  "roadmap_source_removed": "kept",
  "roadmap_regenerated": "regenerated",
  "roadmap_sources_removed": [],
  "roadmap_staged_reconciled": [],
  "roadmap_removed_by_root": { "601": { "worktree": true, "main": true },
                               "602": { "worktree": true, "main": true } },
  "roadmap_residue": [],
  "roadmap_regenerated_by_root": { "worktree": "regenerated", "main": "regenerated" },
  "claim_label_removed": "skipped_offline",
  "archive_state_stamped": "not_needed",
  "issue_disposition": "kept-open",
  "validation": {
    "classification": "chains_green", "green": true, "mode": "final-validation", "chains": [],
    "detail": ["agent validation recorded and bound to this tree"],
    "operator_hint": null,
    "validated_candidate_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "changed_paths": [],
  "closure_receipt": {
    "project": "bundle-601-602", "issue_number": 601, "archive": "closed",
    "roadmap_source_removed": "kept", "roadmap_regenerated": "regenerated",
    "remote_issue_closed": "kept_open",
    "claim_label_removed": "skipped_offline",
    "worktree_removed": "missing", "branch_removed": "kept",
    "warnings": [],
    "goal_declared": false, "goal_declared_source": null,
    "goal_declared_probed": ["…/archive/bundle-601-602/mission-list.md", "…/bundle-601-602/mission-list.md"],
    "selection_evidence": "absent",
    "keep_open_requested": true,
    "anchored_root": "<leg>/repo",
    "roadmap_removed": { "601": {"worktree":true,"main":true}, "602": {"worktree":true,"main":true} },
    "roadmap_regenerated_by_root": { "worktree": "regenerated", "main": "regenerated" },
    "closure": {
      "attempted": [601, 602],
      "closed": [],
      "failed": [],
      "skipped_offline": [601, 602],
      "kept_open": [601, 602]
    },
    "issue_numbers": [601, 602],
    "closed_issues": [], "failed_issue_closures": [], "open_issues": [],
    "roadmap_sources_removed": []
  },
  "closure_invariants": { "ok": true, "violations": [] },
  "finalize_transaction": {
    "mirror": "not_needed", "ledger_compare": "not_needed", "residue_mirrored": 0,
    "impl_commit": "not_checked", "roadmap_staged": false, "archive_commit": "skipped",
    "residue_stage": "skipped", "archive_stage": "skipped", "finalize_commit": "skipped"
  }
}
```

**Sibling fields carrying per-member results.** There is exactly one:
`closure_receipt.closure.skipped_offline` — `[601, 602]` in the offline legs, `[]` online. It is
produced by `scripts/kaola-workflow-claim.js:4778` (`skipped_offline: OFFLINE ? issueSet : []`) and
is about the **issue-close** attempt, not the claim label. There is **no** per-member array for the
label/marker clearing at all: `cmdFinalize` loops members at `claim.js:4609-4612`, and keeps only
the **primary's** status:

```js
for (const n of issueNumbers) {
  const labelStatus = clearAdvisoryClaim(n, 'finalized', args.project);
  if (n === issueNumber) claimLabelRemoved = labelStatus;   // every non-primary status is discarded
}
```

Online, a non-primary member whose label removal `failed` is therefore already invisible. Offline
the loop is uniform, so nothing is lost *in this leg* — but any fix that reports per member must add
the array; it cannot read one that exists.

Leg D (close lane, offline) differs from leg B only in `remote_issue_closed: "skipped_offline"`
(vs `kept_open`) and `issue_disposition: "close-pending"`. `closure_invariants.ok` is `true` and
`warnings` is `[]` in **all four** finalize legs.

### 3. The consequence: the surviving artifacts block a later re-claim

2×2 over {label present} × {marker present}, each cell a fresh copy of exactly the state leg B's
offline finalize left, tree committed first so the dirty-tree consent door is not what is being
measured, marker age stamped explicitly per cell. Re-claim is `startup --target-issue 601` ONLINE.

| cell | pre-state | exit | verdict | forge calls |
|---|---|---|---|---|
| **label + marker** *(what the offline finalize leaves)* | `["workflow:in-progress"]`, 1 marker @0h | 0 | **`user_target_blocked`** — "issue #601 has a remote workflow claim" | 1 |
| label only | `["workflow:in-progress"]`, 0 markers | 0 | **`user_target_blocked`** | 1 |
| marker only, fresh | `[]`, 1 marker @0h | 0 | **`user_target_blocked`** | 3 |
| marker only, aged 25h | `[]`, 1 marker @25h | 0 | `green` / **`acquired`** | 7 |
| **neither** *(the online finalize outcome — positive control)* | `[]`, 0 markers | 0 | `green` / **`acquired`** | 7 |

The both-absent control acquires, so the three blocked cells are the artifacts' doing.

**Correction to the issue's wording.** The issue says "the label never expires; the marker blocks
re-claim for 24h". The measurement says the label is not merely *also* a blocker — it is the
**first and sufficient** one, and it short-circuits the marker probe entirely (one forge call, and
the comment list is never fetched):

```js
// scripts/kaola-workflow-classifier.js:371-373
let blocked = issueHasWorkflowInProgressLabel(issue.labels || []);
if (!blocked) {
  try { blocked = issueHasRemoteClaimComment(args.issue); }
```

`issueHasWorkflowInProgressLabel` has **no time window**. The 24h window
(`classifier.js:215-217`) applies only to the marker comment, and the aged-25h cell demonstrates
the window is real. So the durable half of the leak is the **label**, and it is permanent.

### 4. Does anything downstream distinguish `skipped_offline`?

**No — and the sameness is deliberate, explicit and pinned. It is not an accidental truthy read.**

Census of `skipped_offline` across the tree (159 occurrences, tallied by file):

| file | count | role |
|---|---|---|
| `scripts/kaola-workflow-claim.js` | 22 | producers + 2 consumers (below) |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (codex) | 22 | same |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 20 | same |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 20 | same |
| `docs/api.md` | 10 | documentation |
| `docs/decisions/0009-…md`, `docs/decisions/D-427-01.md` | 7 + 3 | ADRs |
| `scripts/kaola-workflow-closure-audit.js` (+3 ports) | 6 each | producers, **other** fields |
| `scripts/kaola-workflow-sink-merge.js` (+3 ports) | 3 / 2 | producer (`sink-merge.js:906`) |
| `scripts/kaola-workflow-closure-contract.js` (+3 ports) | 3 each | vocabulary enumeration |
| 3 forge walkthroughs | 3 each | pins |

**Consumers that read `claim_label_removed` — there are exactly two, and both allow-list
`skipped_offline` alongside `removed`:**

1. `scripts/kaola-workflow-claim.js:3250-3255` — `checkClosureInvariants`, the
   `in-progress-label-removed` invariant. The comment above it states the intent outright:

   ```js
   // outside issueNumber guard: 'skipped_offline' must not violate even when issueNumber is null
   const labelStatus = receipt.claim_label_removed;
   if (labelStatus !== 'skipped_offline' && labelStatus !== 'removed' && labelStatus !== 'already_absent') {
     … violations.push({ id: 'in-progress-label-removed', … });
   }
   ```

2. `scripts/kaola-workflow-claim.js:5274-5276` — `cmdRelease`'s warning:

   ```js
   if (claimLabelRemoved !== 'removed' && claimLabelRemoved !== 'skipped_offline') {
     releaseWarnings.push('claim label removal status: ' + claimLabelRemoved + …);
   }
   ```

**Truthiness:** searched for truthy tests of the token (`if (claimLabelRemoved)`,
`claim_label_removed &&`, ternaries on it) across `scripts/` and `plugins/` — **zero hits**. Both
consumers do explicit string equality against a three-token allow-list. `isProbeDegraded` and
`computeClosePendingFinalize` (`claim.js:6324-6341`) *do* discriminate `skipped_offline`, but they
read `remote_issue_closed`, never the label.

**The sameness is documented and pinned.** `docs/api.md:1023` — "`in-progress-label-removed` —
invariant 6. Skipped, not violated, when `KAOLA_WORKFLOW_OFFLINE=1` or when `claim_label_removed`
is `skipped_offline`." `docs/api.md:1145` — "remote actions (`remote_issue_closed`,
`claim_label_removed`) record `skipped_offline` rather than `failed`."

Live pins a "make it a violation" fix would red (measured by grep, not run):

- `scripts/simulate-workflow-walkthrough.js:7076-7079` — `testFinalizeOfflineSkipsLabelInvariant`:
  `'offline finalize closure_invariants.ok must be true (skipped_offline is allowed)'`
- `scripts/simulate-workflow-walkthrough.js:7928-7930` — `testFinalizeOfflineClosureReceiptSkipped`,
  same assertion
- `scripts/simulate-workflow-walkthrough.js:7074`, `7427`, `7796`, `7862`, `7921-7925` — token pins
- `scripts/test-claim-hardening.js:3126` — "#735: the claim-label step is REACHED and reports its
  offline skip"
- `scripts/kaola-workflow-closure-contract.js:31` — the legal-token list

A **report**-shaped fix (a typed finding) reds none of these; a **violation**-shaped fix reds at
least the two named `closure_invariants.ok === true` assertions and is a contract change to
`docs/api.md:1023`.

### 5. No existing detector catches the residue afterwards

`audit-labels` and `repair-labels` both scope the query to **closed** issues
(`claim.js:5549`, `claim.js:5787`), and the leaked members are **open**. Driven against leg B's
residue store with a positive control:

```
=== audit-labels [residue]         #601=open/["workflow:in-progress"] #602=open/["workflow:in-progress"]
  exit=0  stdout={"stale":[],"count":0}
  forge call: issue list --state closed --label workflow:in-progress --json number,title,url

=== audit-labels [control-closed]  #601=closed/["workflow:in-progress"] #602=open/["workflow:in-progress"]
  exit=0  stdout={"stale":[{"number":601,"state":"closed","title":"issue 601","url":"…"}],"count":1}
  forge call: issue list --state closed --label workflow:in-progress --json number,title,url
```

The detector is live (it finds the closed one) and blind to this residue. `closure-audit.js`'s
`detectStaleLabels` (line 402-416) uses the same `--state closed --label` scope. **Nothing anywhere
detects a stale `kw:claim` marker comment.**

### 6. What `finalization-summary.md` says today

Leg B (offline) archived summary, **verbatim and complete** —
`<leg>/repo/kaola-workflow/archive/bundle-601-602/finalization-summary.md`:

```markdown
## Validation

classification: chains_green
green: true
mode: final-validation

agent validation recorded and bound to this tree

## Changed Paths

none outside the run-state and documentation bands.
```

Leg A (online) produced a file that is **byte-identical** to it. The durable run record does not
distinguish a finalize that released the claim from one that abandoned it.

### 7. The typed-finding precedent to mirror

There are **two** channels, both in `cmdFinalize` (which spans `claim.js:4142-5172`).

**(a) The chain-receipt check — the precedent CLAUDE.md names.** Its "typed finding" is
`validation.classification`.

- Producer: `scripts/kaola-workflow-adaptive-schema.js:1235` `evaluateChainReceipt()` →
  `{ classification, green, mode, operator_hint, detail }`; the local `finding()` helper is at
  `adaptive-schema.js:1242-1245`.
- Probe: `scripts/kaola-workflow-claim.js:3989` `probeFinalizeValidationGate()`.
- **Durable half**: `scripts/kaola-workflow-claim.js:4022` `persistValidationToSummary()`, called at
  `claim.js:4372`, writing through `claim.js:4011` `appendSummarySection()`:

  ```js
  function persistValidationToSummary(projectDir, validation) {
    const v = validation || {};
    const lines = ['classification: ' + (v.classification || 'unknown'),
      'green: ' + (v.green === true)];
    if (v.mode) lines.push('mode: ' + v.mode);
    for (const d of (v.detail || [])) lines.push('', d);
    if (!v.green && v.operator_hint) lines.push('', v.operator_hint);
    return appendSummarySection(projectDir, '## Validation', lines);
  }
  ```

- **Envelope half**: `scripts/kaola-workflow-claim.js:5164` — `validation: finalizeValidation`.
- The design sentence that governs it, `claim.js:3970-3974`: *"The finding is reported on the
  envelope and written durably into finalization-summary.md; the orchestrator reads it and owns the
  outcome"*, and `claim.js:3980-3981`: *"the durable write is not optional. A conversion that emits
  a finding and drops the state the refusal was freezing is a deletion, not a conversion."*

**(b) `## Finalize Findings` — the structurally closer precedent for an *additive typed* finding**,
because it is a named accumulator with a de-duplicated type list on the envelope.

- Accumulator + recorder: `scripts/kaola-workflow-claim.js:4190-4193`
  ```js
  const finalizeFindings = [];
  const recordFinalizeFinding = (type, summary, lines) => {
    finalizeFindings.push({ type: type, summary: summary, lines: lines || [] });
  };
  ```
- Flush (idempotent, both halves): `scripts/kaola-workflow-claim.js:4195-4209`
  ```js
  const flushFinalizeFindings = () => {
    if (finalizeFindingsFlushed || finalizeFindings.length === 0) return;
    finalizeFindingsFlushed = true;
    finalizeTx.findings = Array.from(new Set(finalizeFindings.map(f => f.type)));
    if (!result || !result.dest) return;   // no archive to write into; the envelope half still stands
    const lines = [];
    for (const f of finalizeFindings) {
      lines.push('### ' + f.type, '', f.summary, '');
      for (const l of f.lines) lines.push(l);
      lines.push('');
    }
    appendSummarySection(result.dest, '## Finalize Findings', lines);
  };
  ```
- Flush sites: `claim.js:4980`, `5091`, `5130`, `5144` (inside the commit block) and the
  unconditional one at `claim.js:5154`, which runs **before** the emit at `claim.js:5169`.
- An example call: `scripts/kaola-workflow-claim.js:4911` (`recordFinalizeFinding('archive_stage_failed', …)`).
- Registry documented at `docs/api.md:368`.

**Rendered, from a real run** (`precedent-938.js`: worktree finalize fixture, worktree `index.lock`
held, `KAOLA_WORKFLOW_OFFLINE=1` — note this run's own `claim_label_removed` is `skipped_offline`,
so the durable finding channel demonstrably works on the offline lane):

envelope:
```json
"findings": ["archive_unstage_failed", "archive_stage_failed", "residue_stage_failed"]
```

`finalization-summary.md` (excerpt of the appended section):
```markdown
## Finalize Findings

### archive_unstage_failed

The archive bookkeeping could not be staged: `git rm -r --cached` failed on `kaola-workflow/issue-914`,
so the branch may still carry the live run folder that `chore: archive` exists to remove.

git said:

```
fatal: Unable to create '…/index.lock': File exists.
```

### archive_stage_failed

The archive bookkeeping could not be staged: `git add` exited non-zero over this project's archive
paths, so the `chore: archive` commit may not carry them.

Paths not staged:

- kaola-workflow/ROADMAP.md
…
```

**Wiring note for whoever implements fix shape 1.** The `clearAdvisoryClaim` call sites
(`claim.js:4610` bundle loop, `claim.js:4616` scalar) sit **inside** `cmdFinalize` and **after**
`result` is assigned (`claim.js:4374`), and the unconditional flush at `claim.js:5154` runs after
them. So `recordFinalizeFinding(<type>, …)` can be called straight from the clearing site and both
halves — `finalize_transaction.findings` on the envelope and a `### <type>` section in the archived
`finalization-summary.md` — land with no new plumbing. The per-member array, if the finding is to
name which members leaked, does have to be added (see §2).

### 8. Symmetry with an offline CLAIM — the asymmetry is real

Leg E: `KAOLA_WORKFLOW_OFFLINE=1` at claim time.

```
claim exit=0  status=acquired  forge calls=0
store after claim: {"issues":{},"nextCommentId":1}
```

`postAdvisoryClaim` returns before touching the forge at `claim.js:933`
(`if (OFFLINE || issueNumber == null) return 'skipped_offline';`) — the same first line as
`clearAdvisoryClaim` at `claim.js:963`. Zero calls, and the mock store is **empty**: no label, no
marker, nothing to leave behind. The subsequent offline finalize then also makes zero calls, and
there is nothing outstanding.

**The two are not symmetric.** Offline **claim** declines to create state, which is self-consistent.
Offline **finalize** declines to destroy state that a previous online claim already created — and
in legs B/D that state was created **by the same workflow, minutes earlier, in the same fixture**.

---

## Reproduction

**Reproduces.** The issue's reported measurement is reproduced exactly on a bundle: `exit 0`,
`status: closed`, `claim_label_removed: skipped_offline`, **zero** forge calls — and the positive
control on the identical fixture makes 11 calls and removes both artifacts on both members.

The issue's *consequence* claim is also reproduced and is stronger than stated: a later online
re-claim of #601 is refused with `user_target_blocked` / "issue #601 has a remote workflow claim".

---

## Narrowing

- **Leg A vs leg B (the only axis: `KAOLA_WORKFLOW_OFFLINE` at finalize).** Eliminates "the mock
  was never wired" and "the fixture never had the artifacts": same fixture, same claim phase, 11
  calls vs 0, artifacts gone vs present.
- **Leg C vs leg D (axis: keep-open vs close lane).** Eliminates "this is a keep-open-only defect."
  Both lanes leak identically; the close lane additionally reports `remote_issue_closed:
  skipped_offline` instead of `close_pending`.
- **Leg E (axis: offline at claim vs offline at finalize).** Eliminates "offline finalize is just
  offline claim's mirror image."
- **2×2 isolation (axis: which artifact).** Eliminates "the marker is the blocker" as a complete
  account — the label blocks alone, with no expiry, and short-circuits the marker probe.
- **Marker aged 25h (axis: time).** Eliminates "the marker blocks forever" — the 24h window at
  `classifier.js:217` is real.
- **audit-labels residue vs closed control (axis: issue state).** Eliminates "an existing audit
  would catch this later" — the `--state closed` scope makes the open-issue residue invisible.

---

## Inferences

Labelled as inferences; the observations above are re-derivable from the recorded commands.

1. **A fix that turns `skipped_offline` into a closure-invariant violation is a contract change,
   not a bug fix.** — confidence: high; refuted by finding that
   `simulate-workflow-walkthrough.js:7079` / `:7930` and `docs/api.md:1023` do not mean what they
   say, or by the owner ruling the contract should change.
2. **A typed finding on the envelope + `## Finalize Findings` is the cheap, precedent-matching
   shape, and reds nothing.** — confidence: high. The nearest thing to a counter-example is
   `test-forge-finalize-findings.js:276-290`, whose healthy control IS an offline finalize
   (`runFinalize(ed, fx, false)` with `KAOLA_WORKFLOW_OFFLINE: '1'` and `issue_number: 1` in state),
   so a new always-on-offline finding would appear in its `findings` array — but its two assertions
   are `!ok.findings.includes('archive_stage_failed')` and `!ok.findings.includes('archive_unstage_failed')`,
   type-specific, so it stays green. Refuted by any guard that asserts `finalize_transaction.findings`
   is absent or empty as a whole; I found none.
3. **The finding should fire on the OFFLINE-with-prior-online-claim case only, and there is no
   local evidence available to distinguish it.** `workflow-state.md` records no
   `remote_claim`/`claim_posted` token — the bundle claim envelope in leg E carries no
   `remote_claim` field at all, and `writeState` (`claim.js:1287-1308`) writes none. So the finding
   can only say "the claim release was skipped; if this run was claimed online, `workflow:in-progress`
   and the `kw:claim` marker are still on issues X, Y", not "they definitely are." Making it
   *definite* would require persisting the claim's `remote_claim` status at claim time — a second,
   larger change. — confidence: high on the absence (grepped `writeState`'s field list and the leg E
   envelope); medium on "larger change".
4. **Widening `audit-labels`/`repair-labels` to open issues would give the residue a detector, but
   it cannot distinguish a stale label from a *live* claim by another session** — the label is the
   live-claim signal. So the audit route needs the project-scoped marker or an active-folder
   cross-check, which is a bigger design than the finding. — confidence: medium; refuted by showing
   `audit-labels` already has an active-folder cross-check I did not find.
5. **The primary-only `claimLabelRemoved` in the bundle loop (`claim.js:4609-4612`) is a separate,
   pre-existing latent gap**: online, a non-primary member whose removal returns `failed` is
   discarded and `closure_invariants` passes on the primary's `removed`. Not reachable in the
   offline legs (all members return the same token). — confidence: high from reading; **not
   measured** (I did not drive a per-member forge failure).

---

## Open

- **Inference 5 is unmeasured.** A leg with the mock failing `--remove-label` for #602 only would
  settle whether a non-primary failure is really invisible online. Cheap; not run because it is
  outside #938's stated claim.
- **The three forge ports and the codex edition were not driven.** The token counts (20/20/22) and
  the identical `checkClosureInvariants` allow-list line appear in all four, but I measured only
  canonical. An edition-touching fix owes the four-chain run regardless.
- **The `sink` lane was not driven.** `sink-merge.js:906` sets
  `claimLabelRemoved = OFFLINE ? 'skipped_offline' : 'failed'` and `sink-merge.js:971/985` call
  `clearAdvisoryClaim` — the same return-early applies, but whether the sink lane has its own
  reporting surface is unmeasured. Relevant because #936 just changed exactly that code.
- **No `npm test` / walkthrough run was made.** This was a measurement task on unmodified code; the
  pins listed in §4 were located by grep, not by running them to red.

---

### Artifacts

- Harness and raw captures: `<scratch>/gh-mock.js`, `drive-938.js`, `isolate-938.js`,
  `reclaim-938.js`, `precedent-938.js`, `results.json`, `isolate-results.json`, `fx/<leg>/`,
  where `<scratch>` =
  `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/b8b16016-81ca-44ee-b4fd-49b69d849cd2/scratchpad`.
- The precedent fixture in `os.tmpdir()` was removed after capture.
- Real repo: unchanged (`git status --porcelain` shows only the pre-existing untracked
  `kaola-workflow/bundle-937-938-939/`).
