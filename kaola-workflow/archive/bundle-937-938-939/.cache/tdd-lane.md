# TDD lane — #937 Direction 1 (slug resolution) and #938 (offline claim-release finding)

baseline: `42559b1c8df312e462816f139080f3508df48370`
worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-937-938-939`
(branch `workflow/bundle-937-938-939`)

Tests only. No production file was touched. Three existing suites were extended in place; no new
test file, no new env var, no new helper abstraction beyond two local functions per suite.

---

## Behaviour 1 — #937: resolve the project slug, and report the correction

### A. Sink legs — `scripts/test-sink-merge.js`

Appended after the `#936 d` control, before the summary block. Existing `#936` helpers reused
(`buildSoleArchiverFixture`, `buildLegacyKeepOpenFixture`, `plantIssueComments`,
`issueCommentBodies`, `markerComment`, `claimMarker`, `runSink`, `runSinkLegacy`, `blobsUnder`).

| what | where |
|---|---|
| `misCaseSlug(project)` | `scripts/test-sink-merge.js:4996` |
| `slugCorrectionSentences(out, supplied, resolved)` | `scripts/test-sink-merge.js:5005` |
| `assertKeepOpenResolvesTheProjectSlug937(...)` — the shared assertion set | `scripts/test-sink-merge.js:5020` |
| `#937 a` `--sink --keep-issue-open`, BUNDLE, mis-cased slug (reaches `sink-merge.js:2892`) | `scripts/test-sink-merge.js:5124` |
| `#937 b` same, EXACT slug — positive control | `scripts/test-sink-merge.js:5126` |
| `#937 c` legacy (no `--sink`) keep-open, BUNDLE, mis-cased (reaches `sink-merge.js:971` + `:985`) | `scripts/test-sink-merge.js:5131` |
| `#937 d` same, EXACT slug — positive control | `scripts/test-sink-merge.js:5133` |

Command: `node scripts/test-sink-merge.js`

VERBATIM red at `42559b1c` (9 failures, all new; 821 assertions pass, no regression):

```
Test (#937 a): --sink --keep-issue-open with a --project that differs from the on-disk folder ONLY IN CASE must still release the claim on every member, and must say it corrected the name
FAIL: #937 a (--sink, mis-cased): the kw:claim MARKER posted for the on-disk project "issue-93701" must be gone from member 93701, and the run was driven with --project "Issue-93701". The deleter composes its marker from the supplied spelling by exact substring, so a name that differs only in CASE matches nothing on the forge and every delete is silently skipped — the run still exits 0 and still reports the label removed. Comments still on #93701: ["<!-- kw:claim project=issue-93701 -->\nKaola-Workflow started local work for `issue-93701`.","<!-- kw:claim project=issue-OTHER -->\nKaola-Workflow started local work for `issue-OTHER`.","an ordinary human comment mentioning nothing in particular"]
FAIL: #937 a (--sink, mis-cased): the kw:claim MARKER posted for the on-disk project "issue-93701" must be gone from member 93711, ... Comments still on #93711: ["<!-- kw:claim project=issue-93701 -->\nKaola-Workflow started local work for `issue-93701`."]
FAIL: #937 a (--sink, mis-cased): the run was given --project "Issue-93701" and used "issue-93701", and its output says so nowhere. Report the substitution the way the claim envelope reports a reserved project name — one value naming what was supplied and what was used. Envelope: {"result":"ok","status":"sinked","journal_disposed":true,"receipt":{"project":"Issue-93701", ... "archived_paths":["kaola-workflow/archive/Issue-93701/finalization-summary.md","kaola-workflow/archive/Issue-93701/workflow-state.md"], ... "archive_dest":"kaola-workflow/archive/Issue-93701","remote_closed_after_publish":"verified", ...}}
FAIL: #937 a (--sink, mis-cased): the archive was published under the SUPPLIED spelling "kaola-workflow/archive/Issue-93701/" instead of the on-disk project name — a second, mis-cased archive directory on the default branch. Paths: ["kaola-workflow/archive/Issue-93701/finalization-summary.md","kaola-workflow/archive/Issue-93701/workflow-state.md"]
FAIL: #937 a (--sink, mis-cased): the LIVE run folder is still tracked at origin/main after the sink — the removal pathspec was composed from the supplied spelling and matched nothing in a case-sensitive index. Paths: ["kaola-workflow/issue-93701/finalization-summary.md","kaola-workflow/issue-93701/workflow-state.md"]
FAIL: #937 a (--sink, mis-cased): the default-branch checkout must be clean after the sink; git status --porcelain:
D  kaola-workflow/issue-93701/finalization-summary.md
 D kaola-workflow/issue-93701/workflow-state.md
Test (#937 b, positive control): the same --sink run driven with the EXACT on-disk slug still deletes both markers — without this, "the marker is gone" could be true of a fixture that deletes nothing
Test (#937 c): the legacy postMergeCleanup keep-open terminal must resolve a mis-cased --project too — its primary and bundle-member arms compose the same marker from the same supplied name
FAIL: #937 c (legacy, mis-cased): the kw:claim MARKER posted for the on-disk project "issue-93703" must be gone from member 93703, ...
FAIL: #937 c (legacy, mis-cased): the kw:claim MARKER posted for the on-disk project "issue-93703" must be gone from member 93713, ...
FAIL: #937 c (legacy, mis-cased): the run was given --project "Issue-93703" and used "issue-93703", and its output says so nowhere. ... Envelope: {"status":"merged","closure_receipt":{"project":"Issue-93703","issue_number":93703,"archive":"closed","roadmap_source_removed":"kept","roadmap_regenerated":"skipped","remote_issue_closed":"kept_open","claim_label_removed":"removed", ...},"closure_invariants":{"ok":true,"violations":[]},"member_source":"flag"}
Test (#937 d, positive control): the legacy terminal driven with the EXACT on-disk slug still deletes both markers

Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923/#931) test suite FAILED: 9 failed, 821 passed.
```

Both positive controls (`b`, `d`) are GREEN at baseline — the fixture can observe a delete, and the
tree assertions are satisfiable.

### B. Finalize legs — `scripts/test-bundle-finalize.js`

`writeGhMockScript` gained an opt-in `commentStore` (the two comment routes at its tail, DELETE
ordered before LIST). With no `commentStore` the routes are the pre-existing pair verbatim, so every
existing scenario is behaviourally unchanged — confirmed by the run below (172 pre-existing
assertions still pass).

| what | where |
|---|---|
| store-aware gh mock routes | `scripts/test-bundle-finalize.js:326`ff (inside `writeGhMockScript`) |
| `assertFinalizeResolvesTheProjectSlug937(...)` | `scripts/test-bundle-finalize.js:1646` |
| `#937 e` BUNDLE finalize, mis-cased (reaches `claim.js:4610`) | `scripts/test-bundle-finalize.js:1736` |
| `#937 f` SINGLE-issue finalize, mis-cased (reaches `claim.js:4616`) | `scripts/test-bundle-finalize.js:1741` |
| `#937 g` BUNDLE finalize, EXACT slug — positive control | `scripts/test-bundle-finalize.js:1746` |

Command: `node scripts/test-bundle-finalize.js`

VERBATIM red at `42559b1c` (7 failures, all new):

```
Test (#937 e): bundle finalize with a --project that differs from the on-disk folder ONLY IN CASE must still release the kw:claim marker on every member, and must say it corrected the name
FAIL: #937 e (bundle, mis-cased): the kw:claim MARKER posted for the on-disk project "issue-93705" must be gone from member 93705, and the run was driven with --project "Issue-93705". ... Comments still on #93705: ["<!-- kw:claim project=issue-93705 -->\nKaola-Workflow started local work for `issue-93705`.","<!-- kw:claim project=issue-OTHER -->\n...","an ordinary human comment mentioning nothing in particular"]
FAIL: #937 e (bundle, mis-cased): the kw:claim MARKER ... must be gone from member 93715, ...
FAIL: #937 e (bundle, mis-cased): the run archive was written under the SUPPLIED spelling "Issue-93705" instead of the on-disk project name "issue-93705" — on a case-sensitive index that is a second, differently-named archive directory. dest=".../kaola-workflow/archive/Issue-93705"
FAIL: #937 e (bundle, mis-cased): the run was given --project "Issue-93705" and used "issue-93705", and its output says so nowhere. ... Envelope: {"status":"closed","archived":true,"dest":".../kaola-workflow/archive/Issue-93705", ... "claim_label_removed":"removed", ... "closure_invariants":{"ok":true,"violations":[]}, ...}
Test (#937 f): the SINGLE-issue finalize arm composes the same marker from the same supplied name — the bundle loop and the scalar call are separate call sites and neither reaches the other
FAIL: #937 f (single, mis-cased): the kw:claim MARKER posted for the on-disk project "issue-93706" must be gone from member 93706, ...
FAIL: #937 f (single, mis-cased): the run archive was written under the SUPPLIED spelling "Issue-93706" ...
FAIL: #937 f (single, mis-cased): the run was given --project "Issue-93706" and used "issue-93706", and its output says so nowhere. ...
Test (#937 g, positive control): the same bundle finalize driven with the EXACT on-disk slug still deletes the marker on every member — without this, "the marker is gone" could be true of a fixture that deletes nothing

test-bundle-finalize: 7 test(s) FAILED, 172 passed
```

`#937 g` (positive control) GREEN at baseline. The `comments-listed:` premise assertion passes on
every leg, so "the marker is still there" is a statement about a deleter that RAN and matched
nothing — not about a code path the run never entered.

### What "reported" means, and why it is not pinned to a field name

`slugCorrectionSentences(out, supplied, resolved)` walks every value of the emitted envelope and
looks for a single STRING that names both spellings. It is satisfied by a note field (the shape
`reserved_project` / `reserved_project_note` already uses on the claim envelope for the same class
of correction, `docs/api.md:93-94`), by a typed finding's detail line, or by a receipt field. It is
not satisfied by silence, and not by the two spellings landing in separate fields — which is what an
archive path and a project name do by coincidence rather than by saying anything.

---

## Behaviour 2 — #938: the offline finalize reports a conditional typed finding

`scripts/simulate-workflow-walkthrough.js`, immediately after `testFinalizeOfflineSkipsLabelInvariant`.

| what | where |
|---|---|
| `CLAIM_RELEASE_SKIPPED_FINDING = 'claim_release_skipped_offline'` | `scripts/simulate-workflow-walkthrough.js:7106` |
| `testFinalizeOfflineReportsSkippedClaimRelease()` | `scripts/simulate-workflow-walkthrough.js:7108` |
| registry entry | `scripts/simulate-workflow-walkthrough.js:12577` |

Command: `node scripts/simulate-workflow-walkthrough.js --only testFinalizeOfflineReportsSkippedClaimRelease`

VERBATIM red at `42559b1c`:

```
Error: #938: an offline finalize releases NO claim — it makes zero forge calls, so the workflow:in-progress label and the kw:claim marker are left exactly as the run found them on every member — and it reported that nowhere. Raise the typed finding "claim_release_skipped_offline" on finalize_transaction.findings; got: []
    at assert (.../scripts/simulate-workflow-walkthrough.js:36:25)
    at Object.testFinalizeOfflineReportsSkippedClaimRelease [as fn] (.../scripts/simulate-workflow-walkthrough.js:7157:7)
```

The walkthrough's `assert` throws on first failure, so only the first offline assertion appears
above. The other three were measured by temporarily softening the offline assertions to log-only
(scaffolding removed again; `grep SOFT` over the file is empty). All four are red at baseline:

```
SOFT-RED: #938: an offline finalize releases NO claim ... got: []
SOFT-RED: #938: the finding must also be DURABLE — ... Expected a "### claim_release_skipped_offline" section in .../kaola-workflow/archive/issue-9380/finalization-summary.md, got:
## Validation

classification: chains_green
green: true
mode: final-validation

agent validation recorded and bound to this tree

## Changed Paths

none outside the run-state and documentation bands.

SOFT-RED: #938: the finding must name the issues whose claim release was skipped, per bundle member — #9380 is not in the "### claim_release_skipped_offline" section. ... Section:
null
SOFT-RED: #938: the finding must name the issues whose claim release was skipped, per bundle member — #9390 ... Section:
null
```

Under that same softened run the ONLINE control leg passed cleanly at baseline (premise
`claim_label_removed === 'removed'` held; both negative assertions satisfied), so the control is not
red for its own reasons.

Guards against over-reach, asserted in the offline leg: `claim_label_removed` stays
`skipped_offline` and `closure_invariants.ok` stays `true`.

Neighbours re-run and GREEN at baseline with the new test registered:
`testFinalizeRemovesClaimLabel`, `testFinalizeOfflineSkipsLabelInvariant`,
`testFinalizeClaimLabelFailedTriggersInvariant`, `testClearAdvisoryClaimDeletesMarkerComment`,
`testClearAdvisoryClaimDoesNotDeleteOtherProjectMarker`, `testClearAdvisoryClaimOfflineSkipsDelete`,
`testSinkKeepOpenReleasesClaimMarker`, `testKeepOpenSinkLeavesTheIssueReClaimable`,
`testFinalizeOfflineClosureReceiptSkipped`.

---

## Not pinned, and why

1. **The conditional WORDING of the #938 finding.** The brief requires the finding to say the
   release was skipped without asserting the artifacts are still on the issues. There is no text
   yet to bind a must-not-say regex to, and inventing one would pin phrasings nobody has written.
   The pin covers the type, the durable section, and the issue numbers; the conditionality is the
   implementer's to word and review's to check.
2. **Conditionality of the #937 report.** With an exact slug `supplied === resolved`, so a
   "correction sentence" would be a sentence naming the same string twice and is indistinguishable
   from any other sentence. The exact-slug legs are therefore positive controls on DELETION only.
3. **The four forge/runtime editions.** Every leg above drives the canonical scripts. The three
   ports carry their own copies of both call sites.

## Things the implementer will hit that are not my tests

- `scripts/test-forge-finalize-findings.js` part B is a STATIC registry guard. Adding
  `claim_release_skipped_offline` to canonical alone reds it three ways: the canonical/gitlab and
  canonical/gitea deltas must stay exactly `["archive_unstage_failed"]`, the `docs/api.md`
  `findings` table row (`docs/api.md:368`) must enumerate exactly the canonical registry, and the
  per-edition count sentence must match `canonical.size`. So the new type has to be ported to all
  four editions and written into `docs/api.md`.
- `docs/api.md:385` currently says "a good finalize reports `staged`/`staged`/`committed` with no
  `findings`" — an offline run will now carry one.
- `scripts/test-finalize-door.js:2175` and `:2194` assert `findings.length === 0` on healthy runs;
  both are driven with `KAOLA_WORKFLOW_OFFLINE: '0'`, so they are unaffected. Checked, not assumed.
</content>
