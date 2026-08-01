# Premise check — issue #903 (closure audit has no project scope)

## VERDICT

**PREMISE HELD.** Every factual assertion in #903 is confirmed by code reading and by live
measurement: `parseArgs` recognizes `--execute` and nothing else, `--help` and arbitrary flags are
silently absorbed with exit 0 and byte-identical output, and the live run on this repo reports two
findings that belong to no part of the current work. The reported *counts* differ (this repo shows
1 `archive_content_incomplete` finding, not 6), and one named example (`phase-37-8-bear-scale-dampening`)
does not exist in this archive — but the contamination *mechanism* the issue describes reproduces
exactly, including from the worktree and in offline mode.

Two things go beyond what #903 claims, both measured, both relevant to its acceptance criterion:

1. `archive_content_incomplete` is attributable **by folder name only** — the missing file *is* the
   identity anchor, so no issue number is recoverable for exactly the class that contaminated the run.
2. The audit already receives each active folder's bundle member array and **discards it**. A bundle's
   non-primary member issues are invisible to two drift classes today. Measured with a positive
   control (see *Narrowing*).

---

## Setup

- Commit: `9b68b0962f52443e2b4ca91c2fa924440cea829b` (v9.1.1), working tree clean except the untracked
  `kaola-workflow/bundle-900-901-902-903/` run folder.
- Node v24.14.0, darwin. Live `gh` reachable (one TLS-handshake flake observed and re-measured).
- All four on-disk copies of the script are byte-identical (sha256 prefix `4eede4d2ffcc9b15`, 382 lines):
  `scripts/`, `plugins/kaola-workflow/scripts/`, and both under `.kw/worktrees/bundle-900-901-902-903/`.

### Mutation pre-check (done before running anything)

The bare invocation is **read-only**. `main()` (`scripts/kaola-workflow-closure-audit.js:348-368`)
calls `buildAuditReport(root)` and only enters `executeRepairs` under `args.execute`. Every read path
was traced: `readActiveFolders` (`scripts/kaola-workflow-active-folders.js:230-287`, pure `fs` +
read-only `gh issue list`), `roadmapSourceFiles` (`:82-91`, `readdirSync`), `archiveClosedIssues`
(`:93-113`, `readFileSync`), `readRoadmapIssues` (`scripts/kaola-workflow-roadmap.js:61-81`, pure read
— it does **not** regenerate), `detectStaleLabels` (`gh issue list`), `detectUnarchivedPrFolders`
(`gh pr view`), `isDirty` (`git status --porcelain`). Both imported modules are guarded by
`if (require.main === module)` (`kaola-workflow-roadmap.js:397`, `kaola-workflow-active-folders.js:301`),
so requiring them runs nothing. `regenerateRoadmap` is reachable **only** from `executeRepairs`
(`:306`). The known roadmap gotcha (bare no-arg invocation mutating the mirror) does not apply here.

---

## 1. `parseArgs` verbatim

`scripts/kaola-workflow-closure-audit.js:56-62`:

```js
function parseArgs(argv) {
  const args = { execute: false };
  for (const a of argv) {
    if (a === '--execute') args.execute = true;
  }
  return args;
}
```

Called at `:350` with `process.argv.slice(2)`.

**Definitive answers.**

- The **only** recognized token is the exact string `--execute`. There is no `--project`, no
  `--issue`, no `--issue-numbers`, no `--json`, no `--help`, no positional handling.
- **Unknown flags are silently ignored.** The loop has no `else`; the returned object has exactly one
  key. Nothing downstream inspects `process.argv` again (grep of the file: `argv` appears only at
  `:56` and `:350`).
- **`--help` is silently ignored — confirmed, and measured.** It is not special-cased anywhere. There
  is no usage string, no `printUsage`, no `-h`. `--help` produces the full drift JSON and exit 0.
  This is a *divergence within the repo*: `kaola-workflow-classifier.js` does implement `--help` with
  usage-on-stdout and exit 0, and the walkthrough pins that at
  `scripts/simulate-workflow-walkthrough.js:5803-5814`. The closure audit has no equivalent.
- Both forge ports are identical byte-for-byte in this function:
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js:47-53` and
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js:47-53`.
- The absence is a **recorded** CLI fact, not just an omission: `docs/decisions/D-497-01.md:113`
  states "The CLI surface (`--execute` flag; JSON always; no `--project`/`--json`) ... unchanged by
  this wiring." `docs/api.md:856-859` documents exactly two invocation forms and no others.
- Note on the issue's framing: I found **no** document asserting repository-wide scope as a *designed*
  property of #165. `docs/decisions/D-497-01.md:18-19` calls it "a general-purpose reconciliation
  sweep, not scoped to any one failure scenario" — that is about *failure scenarios*, not projects.
  The lack of `--project` is recorded as a fact of the surface, never argued for.

There is also **no verdict channel at all**: `main` exits 0 whether it finds zero drift or six
classes of it (`:370-372` sets `process.exitCode = 1` only on a thrown exception). Confirmed live —
exit 0 with two findings. The "terminal verdict" is entirely the operator reading the JSON.

---

## 2. Drift class table

All line references are `scripts/kaola-workflow-closure-audit.js` unless stated.

| # | Class | Detector | Emitted | Finding shape | Project-attributable? | `--execute` |
|---|---|---|---|---|---|---|
| a+d | `stale_roadmap_sources` | `detectStaleRoadmapSources` `:153-167` (inputs `roadmapSourceFiles` `:82-91`, `archiveClosedIssues` `:93-113`) | `:269` | `{issue_number, file, reason}` | **YES**, by issue number | **Repairs**: `fs.unlinkSync` of `.roadmap/issue-N.md` per finding `:295-304` |
| b | `mirror_lists_closed_issues` | `detectMirrorClosed` `:170-177` | `:270` | bare `int` | **YES**, by issue number | **Repairs indirectly**: not touched itself; fixed as a consequence of source removal + `regenerateRoadmap(root)` `:306` |
| c | `stale_in_progress_labels` | `detectStaleLabels` `:181-193` | `:271` | `{number, title, url}` or `'skipped_offline'` / `'skipped_timeout'` | **Attributable by issue number, but detection is inherently global** — see note below | **Repairs**: `gh issue edit N --remove-label workflow:in-progress` per finding `:316` |
| e | `active_folder_for_closed_issue` | `detectActiveClosedFolders` `:219-227` (+ `isDirty` `:200-216`) | `:272` | `{project, issue_number, dirty}` | **YES** — carries `project` explicitly | Report-only `:338`; comment at `:16-18` |
| f | `unarchived_pr_folders` | `detectUnarchivedPrFolders` `:230-248` | `:273` | `{project, issue_number, pr_url, pr_state}` | **YES** — carries `project` | Report-only `:339` |
| g | `archive_content_incomplete` | `detectArchiveContentIncomplete` `:138-150` (+ `archiveRequiredContent` `:131-136`) | `:274` | `{project, missing[]}` | **YES but by NAME ONLY — ambiguous**; see note | Report-only `:343`, explicitly unrepairable (`:340-342`) |
| h | `unresolved_closed_state` | inline `:284-287`, from `collectClosedSet` `:68-80` | `:285` (omitted when empty) | bare `int` | **YES**, by issue number | Not repaired **and absent from the `--execute` output entirely** — `:354-359` emits only `repaired` + `reported_not_repaired`, and `unresolved_closed_state` is in neither |

**No class is inherently repository-global in its emitted shape.** Five of the seven carry either a
`project` string or an issue number; the sixth (`mirror_lists_closed_issues`) is a bare issue number.
`--project` scoping is therefore **coherent** for every class. Two qualifications:

- **(c) `stale_in_progress_labels` — global detection, per-issue findings.** The detector issues one
  repository-wide query (`gh issue list --state closed --label workflow:in-progress`) and cannot be
  narrowed at the forge. But the *scoped question* — "is any of MY member issues in this list?" — is a
  set-membership test on the returned array, fully coherent and needing no extra remote calls. What is
  **not** always possible is attributing an arbitrary global finding to *some* project: an issue can
  carry the label with no workflow project ever having existed. In this repo the live finding does
  resolve — #796 maps to `kaola-workflow/archive/issue-796.archived-2026-07-25T10-00-15-000Z/workflow-state.md`
  — but that required an archive scan the audit does not perform, and success is not guaranteed in
  general.
- **(g) `archive_content_incomplete` — attribution is ambiguous, and this is the class that
  contaminated the run.** `project` is the archive *directory name*, and the only missing artifact the
  rule can report is `workflow-state.md` (`archiveRequiredContent:131-136` returns `[]` for anything
  else). Since that file is the identity anchor, **no issue number is recoverable for precisely the
  findings this class emits** — attribution can only be string matching on the folder name. That is
  harder than it looks: archive names come in three shapes in this repo (358 bare, 8
  `.archived-<ts>`, 2 `.discarded-<ts>`), so a match for a just-sinked project `P` must cover `P` and
  `P.archived-*`. The live finding is a worked example of the ambiguity: the flagged directory
  `kaola-workflow/archive/bundle-429-434/` is *residue* holding one tracked file
  (`.cache/sink-receipt.json`) — the real archive is its sibling
  `kaola-workflow/archive/bundle-429-434.archived-2026-06-13T08-52-23-135Z/`, which has a valid
  `workflow-state.md`. A name-prefix scope filter would need to decide whether `bundle-429-434` is
  "the project `bundle-429-434`" or an orphan.

`archiveClosedIssues` `:98-104` `continue`s on any read failure, so a gutted archive silently drops
out of the closed-set feed as well — that is the coupling `:115-119` documents.

---

## 3. What `--execute` repairs, and whether a scoped `--execute --project P` is constructible

`executeRepairs` `:293-346` consumes the already-built report and never re-detects (`:291-292`).

| Repair | Site | Keyed on | Scopable to one project without changing semantics? |
|---|---|---|---|
| Remove stale `.roadmap/issue-N.md` | `:295-304` | per-finding `issue_number` | **Yes.** Filtering the input array to `P`'s member set changes nothing about the unlink of the files it does touch. `ENOENT` is already treated as success (`:301`). |
| `regenerateRoadmap(root)` | `:306` | nothing — whole mirror, unconditional | **Not scopable, and must not be.** The mirror is one generated file derived from all surviving sources; it runs even when zero sources were removed. Semantics are unchanged under a scope filter (regeneration is idempotent and source-derived), but the *write* stays repository-wide. This is the single place where "scoped repair" cannot be literally scoped. |
| `gh issue edit N --remove-label` | `:316` | per-finding `number` | **Yes.** Exactly per-issue; filtering the loop input to `P`'s member set is a strict subset of the same calls. Timeout/break handling `:317-323` is unaffected. |
| `active_folder_for_closed_issue` | `:338` | — | Report-only; nothing to scope. |
| `unarchived_pr_folders` | `:339` | — | Report-only; nothing to scope. |
| `archive_content_incomplete` | `:343` | — | Report-only; nothing to scope. |

**Conclusion:** a scoped `--execute --project P` is constructible without altering any repair's
semantics. The only caveat is that `regenerateRoadmap` remains a whole-mirror rebuild — which is
inherent to the mirror being a single file, not a consequence of scoping.

---

## 4. Live run

Command, from the repo root, no `--execute`, exit code taken directly (never through a pipe):

```
node scripts/kaola-workflow-closure-audit.js
EXIT=0
```

Full stdout, verbatim:

```json
{
  "dry_run": true,
  "offline": false,
  "drift": {
    "stale_roadmap_sources": [],
    "mirror_lists_closed_issues": [],
    "stale_in_progress_labels": [
      {
        "number": 796,
        "title": "Single-issue routing wording can mislead the agent: named-issue substitution, task-description survey override, bundle-primed vocabulary, scout residue",
        "url": "https://github.com/KaolaBrother/Kaola-Workflow/issues/796"
      }
    ],
    "active_folder_for_closed_issue": [],
    "unarchived_pr_folders": [],
    "archive_content_incomplete": [
      {
        "project": "bundle-429-434",
        "missing": [
          "workflow-state.md"
        ]
      }
    ]
  },
  "counts": {
    "stale_roadmap_sources": 0,
    "mirror_lists_closed_issues": 0,
    "stale_in_progress_labels": 1,
    "active_folder_for_closed_issue": 0,
    "unarchived_pr_folders": 0,
    "archive_content_incomplete": 1
  }
}
```

stderr: empty. Nothing in the working tree changed.

### Does the reported contamination reproduce here?

**Yes — two findings, neither belonging to `bundle-900-901-902-903`.**

| Finding | Belongs to | Attribution cost |
|---|---|---|
| `stale_in_progress_labels`: #796 | `archive/issue-796.archived-2026-07-25T10-00-15-000Z` — closed and archived 2026-07-25 | required a grep of 368 archive state files |
| `archive_content_incomplete`: `bundle-429-434` | archive residue from 2026-06-13; the tracked file is `kaola-workflow/archive/bundle-429-434/.cache/sink-receipt.json` | required noticing the `.archived-<ts>` sibling |

Neither maps to issues 900–903. Establishing that took two manual greps — exactly the manual step
the issue describes.

Differences from the issue's reported specifics, stated plainly: this repo shows **1**
`archive_content_incomplete` finding, not 6. Only one archive directory of 368 lacks
`workflow-state.md` (verified by direct `fs` loop, independent of the audit). Both `.discarded-*`
archives here **do** have `workflow-state.md` and are correctly not flagged, and
`phase-37-8-bear-scale-dampening` does not exist anywhere in this repo
(`find . -name '*bear-scale*'` → no matches). The issue's count and examples do not reproduce; the
*contamination* does. The two clean-in-the-report classes were also **vacuously** clean here:
`kaola-workflow/.roadmap/` contains only `_rules.md`, so `stale_roadmap_sources` and
`mirror_lists_closed_issues` had zero inputs to examine.

### Robustness legs on the live run

| Leg | Result |
|---|---|
| From the worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903` | exit 0, output **byte-identical** to main. `getRoot()` is `git rev-parse --show-toplevel` (`kaola-workflow-active-folders.js:26-35`), so it audits the worktree — and the contamination is *tracked* content, so it follows every checkout. |
| `KAOLA_WORKFLOW_OFFLINE=1` | `archive_content_incomplete: bundle-429-434` still reported (the class is local, per `:265`); remote classes become `'skipped_offline'`. The contaminating finding survives offline. |

**Incidental observation, not part of #903.** One run hit a transient forge fault:

```
Post "https://api.github.com/graphql": net/http: TLS handshake timeout
closure-audit: gh issue list failed; reporting empty stale_in_progress_labels
```

Exit code was still **0**, and `stale_in_progress_labels` silently reported `[]` — the #796 finding
vanished. The `[]`-on-failure path is deliberate and documented (`:186-192`, distinguished from
`'skipped_timeout'`), but the consequence is that a *cleaner-looking* report can mean "the check did
not run". Two re-runs restored the finding, so this was noise, not a flag effect.

---

## 5. Argument-handling measurement

| Invocation | Exit | stdout | stderr |
|---|---|---|---|
| `node scripts/kaola-workflow-closure-audit.js` | **0** | 921 bytes of drift JSON | empty |
| `node scripts/kaola-workflow-closure-audit.js --help` | **0** | **byte-identical to bare** (`diff` clean) | empty |
| `node scripts/kaola-workflow-closure-audit.js --bogus-flag-xyz` | **0** | **byte-identical to bare** (`diff` clean) | empty |
| `node scripts/kaola-workflow-closure-audit.js --project bundle-900-901-902-903 --issue 903` (×2) | **0** | **byte-identical to bare** (`diff` clean, both runs) | empty |

Exit codes captured with `echo "EXIT=$?"` directly on the redirected command — never through a pipe.

A first `--project` run differed (empty `stale_in_progress_labels`); its stderr showed the TLS
handshake timeout above, and two clean re-runs were byte-identical to bare. **The flag had no
effect; the difference was network noise.** This is the measurement that matters most for the
premise: passing exactly the flags a scoped fix would introduce produces byte-identical output today,
with no warning and exit 0. An operator who *believes* they scoped the audit gets an unscoped answer
that looks authoritative.

---

## 6. Bundle mapping — how member issues are represented

**Carrier: the `issue_numbers` line in `workflow-state.md`.** For this live run,
`kaola-workflow/bundle-900-901-902-903/workflow-state.md:43-45`:

```
issue_numbers: 900,901,902,903
bundle_id: bundle-900-901-902-903
closure_policy: all_or_nothing
```

- **Written by** `claim.js` `writeState`, only for a true bundle:
  `scripts/kaola-workflow-claim.js:870-872` emits the line when
  `data.issue_numbers.length > 1` (the `:866-869` comment explains why a 1-element bundle is
  suppressed). `issue_number` stays the scalar primary (900).
- **Parsed by** `parseStateFile` at `scripts/kaola-workflow-active-folders.js:199-209` into an
  `issue_numbers` array (absent → `[]`).
- **Already surfaced to the audit** by `readActiveFolders` at
  `scripts/kaola-workflow-active-folders.js:267-268`, which copies both `issue_numbers` and
  `bundle_id` onto each returned folder object.
- **Second carrier, secondary:** each `.roadmap/issue-N.md` carries a `workflow_project:` field,
  returned by `readRoadmapIssues` (`kaola-workflow-roadmap.js:77`) — a per-issue forward pointer to
  its project. Not usable in this run: `kaola-workflow/.roadmap/` currently holds only `_rules.md`.
- **For an archived bundle:** the same `issue_numbers` line survives in the archived
  `workflow-state.md`; `claim.js:3849-3850` and `:3906` read it back for exactly this purpose.

**Can the audit resolve it? Yes — it already holds the data and throws it away.**
`buildAuditReport:252` calls `readActiveFolders(root, { excludeClosedIssues: false })`, so every
folder object carries `issue_numbers`. But the candidate set at `:256-257` is:

```js
const candidates = srcFiles.map(s => s.issue_number)
    .concat(folders.map(f => f.issue_number).filter(n => n != null));
```

Only the **scalar** `f.issue_number`. `archiveClosedIssues:109` does the same for archives
(`parseInt(field(content, 'issue_number'), 10)` — never `issue_numbers`). So a bundle's non-primary
members are never probed and never enter the closed set. Measured, with a positive control, below.

---

## 7. Invocation-surface table

**Search method.** Three passes, because `grep` here is ugrep and skips dot-directories:
(1) `git grep -ln "closure-audit"` over `templates commands agents plugins .claude .codex .opencode
.opencode-gitea .opencode-gitlab .kimi .kimi-gitea .kimi-gitlab .agents AGENTS.md CLAUDE.md hooks`;
(2) a filesystem `grep -rln` naming every dot-directory **explicitly** (the dot-dir editions are
untracked — `.gitignore:5-10` ignores `.opencode/`, `.kimi/`, `.opencode-*/`, `.kimi-*/` as generated
artifacts — so `git grep` alone reports zero for them, which would have been a false negative);
(3) `git grep -n "closure-audit" -- scripts/` to check whether any *script* invokes it.

| Surface | Line | Invocation | Scoping passed? |
|---|---|---|---|
| `templates/routing/slots.js` **(authoring surface)** | `:126` | slot `fz-closure-audit-run`, all three forges: `node "$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js"` + commented `--execute` twin | **No** |
| `templates/routing/finalize.skeleton.md` | `:447-457` | `<!-- PIN: closure-audit -->` block; `<!-- SPLICE:fz-closure-audit-run -->` | n/a (splice ref) |
| `templates/routing/required-blocks.js` | `:262-274` | block `fn-closure-audit`, content tokens `'<!-- PIN: closure-audit -->'`, `'after-the-fact drift detector'`, `'If the sink reported that it did not complete, the step it names is where to resume'` | n/a (guard) |
| `commands/kaola-workflow-finalize.md` (claude/github) | `:374-375` | `node "$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js"` | **No** |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` (codex/github) | `:417-418` | `node "$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js"` | **No** |
| `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` | `:374-375` | `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-closure-audit.js"` | **No** |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` | `:417-418` | `node "$KAOLA_SCRIPTS/kaola-gitea-workflow-closure-audit.js"` | **No** |
| `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md` | `:375-376` | `node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-closure-audit.js"` | **No** |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` | `:418-419` | `node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-closure-audit.js"` | **No** |
| `.opencode/command/kaola-workflow-finalize.md` | `:372-373` | `node "$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js"` | **No** |
| `.opencode-gitea/command/kaola-workflow-finalize.md` | `:366-367` | gitea variant | **No** |
| `.opencode-gitlab/command/kaola-workflow-finalize.md` | `:367-368` | gitlab variant | **No** |
| `.kimi/skills/kaola-workflow-finalize/SKILL.md` | `:366-367` | `node "$KAOLA_SCRIPTS/kaola-workflow-closure-audit.js"` | **No** |
| `.kimi-gitea/skills/kaola-workflow-finalize/SKILL.md` | `:360-361` | gitea variant | **No** |
| `.kimi-gitlab/skills/kaola-workflow-finalize/SKILL.md` | `:361-362` | gitlab variant | **No** |

**12 rendered invocation sites, 1 authoring surface.** Every one is unscoped, and every one is inside
the `PIN: closure-audit` block. `agents/*.toml` and `.agents/`: **no match** — grepped explicitly, the
audit is not referenced from any agent definition.

The 6 tracked rendered surfaces are registry rows in `scripts/generate-routing-surfaces.js:105-130`
(3 topics × 3 command editions + 3 skill editions = 18 surfaces total). The 6 dot-dir edition
surfaces render from the *same* registry via `commandSurfacesForForge` (`:143-155`, whose comment
states the downstream runtime "renders its own tree FROM these rows instead of reading a hardcoded
`commands/` directory"). So the single authoring point for all 12 is
`templates/routing/slots.js:126`.

**No script invokes the audit.** `git grep` over `scripts/` returns only: the audit itself, the test
files, `validate-script-sync.js:49,474,489` (sync/exports checks), and
`kaola-workflow-install-manifest.js:64` (packaging). Neither `claim.js finalize` nor `sink-merge.js`
calls it. Its mandate is prose-only, and it is the **last operational step** in the finalize surface —
the `PIN: closure-audit` block ends at `SKILL.md:427`, immediately followed by `## Completion
contract` at `:429`. That confirms the issue's "terminal check" characterization.

---

## 8. Existing coverage

**23 test functions**, all in `scripts/simulate-workflow-walkthrough.js`, plus surface-level guards
elsewhere.

Runners: `runClosureAudit(args, cwd, binDir, extraEnv)` `:1746-1765` (online, `gh` mocked via a
`binDir` shim) and `runClosureAuditOffline(args, cwd)` `:1768-1782`. Both `assert(result.status === 0)`
unconditionally (`:1763`, `:1778`).

Test functions: `testClosureAuditKeepOpenExclusion` `:7160`,
`…OfflineRemoteClassesSkipped` `:7525`, `…ClosedRemoteRoadmapSource` `:7550`,
`…ArchiveClosedDrift` `:7575`, `…DedupRoadmapAndArchive` `:7602`,
`…ArchiveContentDrift832` `:7647`, `…ArchiveOnlyNotProbed` `:7748`,
`…MirrorListsClosedIssues` `:7786`, `…StaleInProgressLabels` `:7813`,
`…ActiveFolderForClosedIssueReportsDirty` `:7836`, `…UnarchivedPrFolderMerged` `:7861`,
`…ExecuteRepairsRoadmapAndLabels` `:7891`, `…ExecuteNeverTouchesActiveFolders` `:7928`,
`…DryRunNeverCallsRemoveLabel` `:7956`, `…StaleLabelsTimeout` `:7978`,
`…UnresolvedClosedState` `:7999`, `…ProbeFailureUnresolved` `:8022`,
`…TimeoutEnvInvalidFallsBack` `:8047`, `…TimeoutEnvOverCapFallsBack` `:8075`,
`…ExecuteDetectionTimeoutPropagates` `:8104`, `…ExecuteLabelRemovalTimeoutBreaks` `:8125`,
`…ExecuteLabelRemovalNonTimeoutFails` `:8162`, `…PrFolderTimeout` `:8196`.

Other coverage: `simulate-workflow-walkthrough.js:4737-4750` (`isDirty` fail-closed arms across all
three copies), `:4768-4795` (divergent hand-port sync across the four copies);
`scripts/validate-script-sync.js:49,489` (byte-sync + exports superset);
`scripts/test-route-reachability.js:163-184` (T6 — the PIN + literal on all 6 finalize surfaces) and
`:963-988` (a RED-PROOF that gutting the block interior while keeping the bare marker reds the
checker); `scripts/test-opencode-edition.js:804-810` (A16, the opencode mirror of T6);
`scripts/test-generate-routing-surfaces.js:312,321`.

**On the question that matters for a fix: no test pins the current argument handling.**

- Every one of the 25 runner call sites passes either `[]` (19 sites) or `['--execute']` (6 sites) —
  enumerated by grepping `runClosureAudit`/`runClosureAuditOffline`. **No test passes an unknown
  flag, and no test passes `--help`.** There is nothing asserting "unknown flags are ignored", so
  adding rejection or a usage string breaks no existing pin. (`--help` *is* pinned for the
  *classifier* at `:5803-5814` — a different script.)
- **No test asserts an exact key set** on `drift` or `counts` (`grep` for `Object.keys(result…)`
  returns nothing), so adding a key would not red an existing assertion.
- The guards that *would* bite a fix are the prose-surface ones: `test-route-reachability.js` T6 and
  `test-opencode-edition.js` A16 require the `<!-- PIN: closure-audit -->` marker and the
  `closure-audit` literal on all finalize surfaces, and `required-blocks.js:270-274` requires the two
  interior sentences (`'after-the-fact drift detector'` and `'If the sink reported that it did not
  complete, the step it names is where to resume'`) to survive verbatim.
- `validate-script-sync.js` requires the two forge ports and the plugin copy to stay in lockstep, and
  `:489` requires the ports' `module.exports` to be a superset of the canonical's.

---

## Narrowing — measured legs

Each leg varies **one** axis. All fixtures are throwaway git repos under
`/private/tmp/claude-501/…/scratchpad/p903/`; no tracked file was touched.

| Leg | Axis | Setup | Result | Eliminates |
|---|---|---|---|---|
| 1 | flag token | `--help`, `--bogus-flag-xyz`, `--project X --issue 903` vs bare, live repo | all exit 0, stdout byte-identical (`diff` clean) | "maybe some flag is handled elsewhere / warns" |
| 2 | cwd | audit from the worktree root | exit 0, byte-identical to main | "the contamination is main-only untracked residue" |
| 3 | network | `KAOLA_WORKFLOW_OFFLINE=1` | `archive_content_incomplete` still reported; remote classes `'skipped_offline'` | "the contaminating class needs the forge / is a remote artifact" |
| 4 | bundle members, archive path | fixture: `archive/bundle-500-501/workflow-state.md` with `status: closed`, `issue_number: 500`, `issue_numbers: 500,501`; roadmap sources planted for **both** 500 and 501; offline | `stale_roadmap_sources` = **`[{500, …, "archive_closed"}]` only.** 501 absent. **Positive control: 500 *is* flagged**, so the fixture is live and the detector armed | "member issues might be covered via the archive path" |
| 5A | bundle members, active-folder path | fixture: active `kaola-workflow/bundle-600-601/` with `issue_number: 600`, `issue_numbers: 600,601`; mocked `gh` returns 601 **CLOSED**, 600 OPEN | `active_folder_for_closed_issue` = **`[]`** | "member issues might be probed for the active-folder class" |
| 5B | positive control for 5A | identical fixture, `issue_number: 601` (the closed one) | `active_folder_for_closed_issue` = `[{"project":"bundle-600-601","issue_number":601,"dirty":false}]` | "leg 5A's empty result might be a broken fixture" |

Legs 4/5A/5B all exit 0. Legs 5A and 5B differ in **exactly one line** of the fixture state file.

---

## Inferences

Labeled as inferences; the observations above stand on their own.

1. **`--project` scoping is coherent for every drift class the audit emits** — confidence: high.
   Every finding shape carries a `project` string or an issue number, and the project→issue mapping
   exists in `workflow-state.md` (`issue_numbers`/`issue_number`) for both live and archived projects.
   Refuted by: a class whose finding cannot be tied to any project record — the closest candidate is
   `archive_content_incomplete`, which is name-only (see the ambiguity note), and a `stale_label`
   finding for an issue no workflow project ever claimed.

2. **A scoped `--execute --project P` needs no change to any repair's semantics** — confidence: high.
   Two of three repairs are already per-item loops; the third (`regenerateRoadmap`) is a whole-mirror
   idempotent rebuild that a scope filter neither helps nor harms. Refuted by: a caller that depends
   on `regenerateRoadmap` running only when sources were removed (I found none).

3. **The audit's candidate set is incomplete for bundles today, independent of #903's scoping ask** —
   confidence: high; this is measured, not inferred from reading alone (legs 4, 5A, 5B, each with a
   positive control). `:257` and `archiveClosedIssues:109` read the scalar `issue_number` only, while
   `readActiveFolders` already supplies `issue_numbers`. Consequence: for
   `bundle-900-901-902-903`, only #900 is ever probed; if 901–903 close while 900 stays open, neither
   `stale_roadmap_sources` (archive path) nor `active_folder_for_closed_issue` fires. Members reach
   the closed set today **only** by having their own `.roadmap/issue-N.md` — which this run does not.
   Refuted by: a code path I missed that expands `issue_numbers` into the candidate list (I grepped
   the file; `issue_numbers` does not appear in it at all).

4. **The contamination in this repo is permanent and follows every checkout** — confidence: high.
   `kaola-workflow/archive/bundle-429-434/.cache/sink-receipt.json` is a **tracked** file, so the
   directory exists in every clone and worktree with no `workflow-state.md` beside it. Nothing in the
   audit can repair it (report-only by construction, `:340-342`), so an unscoped terminal verdict on
   this repo will carry at least one irrelevant finding forever. Refuted by: someone committing a
   reconstructed `workflow-state.md` or removing the residue directory.

5. **An operator passing a plausible scoping flag today is actively misled** — confidence: high,
   measured in leg 1. `--project P` yields byte-identical unscoped output with empty stderr and exit
   0. There is no signal distinguishing "scoped, clean" from "unscoped, and your flag was discarded".

---

## Could not establish

- **Where the issue's six `archive_content_incomplete` findings came from.** Only one archive
  directory in this repo lacks `workflow-state.md`, both `.discarded-*` archives have theirs, and
  `phase-37-8-bear-scale-dampening` does not exist anywhere in the tree. The report may predate a
  cleanup, or come from a different working copy. I did **not** search git history for a commit that
  removed five such directories — that would settle it, and it is unmeasured here.
- **Whether the audit is *mandatory*.** No script gates on it and its exit code is always 0; the
  obligation is prose ("After a successful sink, run the closure audit"). Whether that constitutes
  "mandatory" is a reading of the finalize contract, not a measurement.
- **Whether the gitlab/gitea ports' *detectors* are attributable identically.** I verified their
  `parseArgs` is byte-identical and that `validate-script-sync.js` holds them in lockstep, but I did
  not read their detector bodies line by line. `docs/api.md:886-890` records the known deliberate
  divergences (`unarchived_mr_folders`, `mr_url`/`mr_state`, lowercase state matching) — I did not
  confirm those against the source.
- **Whether any consumer parses the audit's stdout programmatically.** I established no *script*
  invokes it; I did not audit for an external/consumer-side parser that a schema addition could break.

## Artifacts

Raw captures (scratch, outside the repo):
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/p903/`
— `bare.json`, `help.json`, `bogus.json`, `project.json`, `project_r1.json`, `project_r2.json`,
`worktree.json`, `fix1/out.json` (leg 4), `legA/out.json`, `legB/out.json` (legs 5A/5B), `ghmock.js`,
and matching `.err` files.
