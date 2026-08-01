# Implementation notes — #903 closure-audit scoping (+ one #901 detector)

Branch `workflow/bundle-900-901-902-903`, worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`. **Uncommitted**, as
instructed. Baseline for every comparison: `9b68b0962f52443e2b4ca91c2fa924440cea829b` (v9.1.1).

---

## 1. THE CLI CONTRACT

A later agent must teach the finalize surfaces to invoke this, so this section is the authority.

### Invocation forms

```bash
node scripts/kaola-workflow-closure-audit.js                                  # repository-wide, dry-run  (UNCHANGED)
node scripts/kaola-workflow-closure-audit.js --execute                        # repository-wide, repair   (UNCHANGED)
node scripts/kaola-workflow-closure-audit.js --project <name>                 # scoped verdict, dry-run
node scripts/kaola-workflow-closure-audit.js --project <name> --execute       # scoped verdict + scoped repair
node scripts/kaola-workflow-closure-audit.js --issue <N> [--issue <M>] ...    # scope by issue number(s)
node scripts/kaola-workflow-closure-audit.js --project <name> --issue <N>     # union of both
node scripts/kaola-workflow-closure-audit.js --help                           # usage, exit 0
```

### Flags — exact tokens

| flag | arity | meaning |
|---|---|---|
| `--execute` | none | Repair safe local drift. Unchanged semantics. |
| `--project <name>` | one value | Scope to one workflow project. Member issues are read from that project's own `workflow-state.md` (live folder first, then `archive/<name>`, `archive/<name>.archived-*`, `archive/<name>.discarded-*`). **Not repeatable** — a second `--project` overwrites the first. |
| `--issue <N>` | one value | Add issue N to the scope. **Repeatable.** Value must be a positive integer whose decimal form round-trips (`--issue 0700` is rejected). |
| `--help`, `-h` | none | Print usage on **stdout**, exit 0. Works outside a git repository (flags are parsed before the repo probe). |

Passing **any** scoping flag (`--project` or `--issue`) switches the envelope to the scoped shape.
Passing neither is the repository-wide default.

### Exit codes

| exit | when |
|---|---|
| `0` | Any successful run — **including one that found drift.** There is still no verdict-in-the-exit-code, deliberately. Also `--help`. |
| `1` | Operator-input error: unknown flag; `--project`/`--issue` with a missing or malformed value; `--project <name>` that resolves to no `workflow-state.md` anywhere **and** no `--issue` given. Also any thrown exception (pre-existing behaviour). stderr carries the message; **stdout is empty**. |

`--project` naming a nonexistent project is exit 1 **by design**: answering "clean" for a mistyped
project name is precisely the silent-scoping failure #903 exists to remove.

### Output — unscoped (UNCHANGED, byte-for-byte)

```json
{ "dry_run": true, "offline": false, "drift": { ... }, "counts": { ... } }
{ "dry_run": false, "offline": false, "repaired": { ... }, "reported_not_repaired": { ... } }
```

### Output — scoped dry-run

```json
{
  "dry_run": true,
  "offline": false,
  "scope": {
    "project": "bundle-900-901-902-903",     // null when scoped by --issue alone
    "issue_numbers": [900, 901, 902, 903],   // sorted, deduped
    "state_file": "kaola-workflow/bundle-900-901-902-903/workflow-state.md",  // null when --issue alone
    "archive_name_ambiguous": true           // OMITTED unless true
  },
  "current_project_clean": true,
  "current_project_drift":  { <same keys as unscoped `drift`, filtered> },
  "current_project_counts": { <one count per key above> },
  "repository_drift_outside_scope":  { <the complement> },
  "repository_counts_outside_scope": { <one count per key above> }
}
```

### Output — scoped `--execute`

```json
{
  "dry_run": false, "offline": false,
  "scope": { ...as above... },
  "repaired": { ... }, "reported_not_repaired": { ... },
  "repository_drift_outside_scope": { ... }, "repository_counts_outside_scope": { ... }
}
```

### Semantics a caller MUST know

1. **`current_project_clean` is FAIL-CLOSED.** It is `true` only when every scoped class **evaluated**
   and came back empty. A class that returned `'skipped_offline'` or `'skipped_timeout'` makes it
   `false`, with the skip string readable in `current_project_drift`. So an offline scoped run is
   never `clean: true`. This follows the rule `isDirty` already applies to an unprobeable tree: a
   probe that cannot PROVE clean must not report clean. **A caller must not read `false` as "drift
   found" without looking at the counts.**
2. **A skipped class appears verbatim in BOTH halves** (`'skipped_offline'` in in-scope *and*
   out-of-scope). It never evaluated, so neither half may claim it clean.
3. **Out-of-scope drift is never suppressed** — it is always emitted as a separate object, so it can
   neither contaminate the scoped verdict nor be hidden by it.
4. **The repository sweep always runs whole.** Scoping partitions the result; it does not narrow
   detection. No remote-call count changes.
5. **The two archive classes are attributed BY NAME ONLY**, because the artifact they report missing
   is itself the record that would carry an issue number. Scoped archive findings therefore carry an
   `attribution` field: `"name_match"`, or `"ambiguous_name_match"` when a bare `P` archive sits
   beside a timestamped `P.archived-*`/`P.discarded-*` sibling (one is residue and neither folder says
   which). Unscoped findings are **not** annotated.
6. **Scoped `--execute` still rebuilds `ROADMAP.md` whole.** `regenerateRoadmap(root)` is
   unconditional and repository-wide. The mirror is one generated file derived from all surviving
   sources, so there is no partial rebuild to scope it to. Inherent, not a gap.
7. `archive_summary_citation_missing` (new, #901) is **omitted from `drift`/`counts` when empty**,
   exactly like `unresolved_closed_state`. Same for its `reported_not_repaired` entry under
   `--execute`. Report-only.

---

## 2. Files and functions changed

Four copies, all four edited. `node scripts/validate-script-sync.js` → **exit 0** (15 common scripts,
27 byte-identical groups, 6 forge export-superset families).

| file | lines (was 382/401) | sha256[0:16] |
|---|---|---|
| `scripts/kaola-workflow-closure-audit.js` | 724 | `765282a2661a2a4d` |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | 724 | `765282a2661a2a4d` (byte-identical to canonical) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | 739 | `daed504f97c8713f` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | 739 | `797b129bcd02f053` |

`4 files changed, 1510 insertions(+), 150 deletions(-)`. **No other tracked file touched** — verified
with `git diff --name-only 9b68b096 | grep -v closure-audit` (returns only sibling agents' files).

Line numbers below are the **canonical** copy after the change, measured (not estimated) with a
declaration scan. The two forge ports carry the same functions with the same bodies, offset by their
own header/import divergences.

| function | line | change |
|---|---|---|
| header comment | `:19-23` | states that repository-wide is the default and scoping only partitions |
| `USAGE` (new const) | `:61-84` | usage text; per-port script name is the only forge divergence |
| `parseArgs` | `:85-112` | **rewritten.** Was: recognize `--execute`, no `else`. Now: `--execute`, `--help`/`-h`, `--project <v>`, repeatable `--issue <N>`; unknown flag / missing value / malformed number **throws** |
| `archiveNameMatchesProject` (new) | `:113-122` | exact name, `.archived-*`, `.discarded-*`. **Never a bare prefix** (would swallow `P-extra`) |
| `stateIssueNumbers` (new) | `:123-139` | parses `issue_numbers` + always includes the scalar primary. Forge ports read `issue_iid \|\| issue_number` for the primary (existing D4 divergence) |
| `resolveProjectIssues` (new) | `:140-166` | live folder → archive under any of the three name shapes; returns `resolved:false` when nothing found |
| `resolveScope` (new) | `:167-195` | builds the scope; **asserts** an unresolvable `--project` with no `--issue` |
| `archiveNameIsAmbiguous` (new) | `:196-209` | bare `P` + timestamped sibling both present |
| `archiveClosedIssues` | `:235-282` (member fix at `:270-280`) | **member fix.** Was `parseInt(field(content,'issue_number'))` only. Now `stateIssueNumbers(content)` when `closure_policy` is absent or `all_or_nothing`, else the primary alone |
| `archiveCitedMissing` (new) | `:322-340` | **#901.** Reads `finalization-summary.md`, extracts bare-relative `.cache/...` tokens, reports the ones absent from disk |
| `detectArchiveSummaryCitationMissing` (new) | `:342-356` | per-archive wrapper; `[{project, cited_missing[]}]`, sorted |
| `detectActiveClosedFolders` | `:423-442` | **member fix.** Primary keeps precedence (so existing findings are unchanged); new arm names the lowest closed member for the previously-invisible case. One finding per folder |
| `buildAuditReport` | `:464-509` | candidate set gains `folders.reduce(... f.issue_numbers ...)`; adds the citation class omit-when-empty; `counts` now from `driftCounts(drift)` |
| `driftCounts` (new) | `:510-519` | one count per drift key, insertion order preserved. Replaces the duplicated literal that listed every key twice |
| `partitionDriftByScope` (new) | `:520-544` | splits drift into in/out halves; non-array (skipped) values go to **both** |
| `scopePredicate` (new) | `:545-557` | per-class in-scope test. Default arm matches folder classes **by shape**, so GitLab's `unarchived_mr_folders` needs no separate entry |
| `annotateAttribution` (new) | `:558-566` | stamps `name_match` / `ambiguous_name_match` on scoped archive findings only |
| `driftIsClean` (new) | `:567-576` | fail-closed verdict |
| `executeRepairs` | `:577-635` (new tail at `:619-634`) | `reported_not_repaired` built as a variable; citation class added **only when present** |
| `main` | `:637-702` | flags parsed before `getRoot()` so `--help` works outside a repo; unscoped path emits the original envelopes unchanged; scoped path partitions and, under `--execute`, feeds `executeRepairs` the **scoped** drift |
| `module.exports` | `:704-724` | +9 names: `detectArchiveSummaryCitationMissing`, `archiveCitedMissing`, `parseArgs`, `archiveNameMatchesProject`, `stateIssueNumbers`, `resolveProjectIssues`, `partitionDriftByScope`, `driftCounts`, `driftIsClean` |

---

## 3. Byte-identical-unscoped proof

Method: run the **unmodified baseline** (the main root, which is at `9b68b096` and clean — sha
`4eede4d2ffcc9b15`) and the new copy against the **same tree**. Node resolves `require('./...')`
relative to the *script's* directory, so the baseline uses its own unmodified `active-folders.js` /
`roadmap.js`. Confirmed those two deps are unchanged in the worktree
(`git diff --stat 9b68b096 -- ...` empty), so the comparison is apples-to-apples.

### Proof A — a tree with no bundle-member drift and no citation drift: ZERO diff, all four modes

Fixture: single-issue archives only, one archive citing `.cache/final-validation.md` which is present,
one archive missing its identity anchor, two roadmap sources.

| mode | offline | result |
|---|---|---|
| dry-run | 1 | **BYTE-IDENTICAL** |
| dry-run | 0 | **BYTE-IDENTICAL** |
| `--execute` | 1 | **BYTE-IDENTICAL** |
| `--execute` | 0 | **BYTE-IDENTICAL** |

### Proof B — the LIVE repo, unscoped dry-run, offline: the ONLY delta is the new omit-when-empty class

`diff` old vs new output is exactly the added `archive_summary_citation_missing` array (4 entries) plus
its `counts` line. Every pre-existing key, value and ordering is unchanged — including through the
`driftCounts` refactor.

### Where the unscoped default DOES change, and why

Two deliberate changes, both demanded by brief items 6 and 7. Item 3 ("byte-identical unscoped") and
items 6/7 cannot both hold literally — a new detector's findings and a fixed candidate set have to
appear somewhere. Reconciled as: **the unscoped SHAPE is unchanged, and the output is byte-identical on
a tree that has none of the newly-visible drift** (Proof A). Concretely:

1. `archive_summary_citation_missing` appears only when non-empty (the `unresolved_closed_state`
   convention already in the file).
2. Findings that were previously invisible because of the member bug now appear. Measured on a
   fixture: baseline `active_folder_for_closed_issue: []` → new
   `[{project: bundle-800-801, issue_number: 801, dirty: false}]`.

### ⚠ ONE THING THE ORCHESTRATOR SHOULD READ BEFORE COMMITTING

**The member fix widens what unscoped `--execute` DELETES.** Measured on a fixture with an archived
bundle (primary 700, members 700+701, `status: closed`, `closure_policy: all_or_nothing`) and roadmap
sources for both:

- baseline unscoped `--execute` removed `issue-700.md`, left `issue-701.md`
- new unscoped `--execute` removes `issue-700.md` **and** `issue-701.md`

That is the correct repair — the archive's own record says 701 closed with the bundle, so its roadmap
source is stale — and it is exactly what item 6 asked for. But it does enlarge a **destructive**
default path, and `.roadmap/issue-N.md` files carry hand-written content. Two guards bound it, both
read from the record before a member is trusted:

- the pre-existing `issue_action: comment_keep_open` arm skips the whole archive (partial-close case);
- a new `closure_policy` check contributes the primary alone for any policy other than
  `all_or_nothing`. **Negative control measured**: with `closure_policy: partial`, only 700 is
  flagged.

Safety argument: the `archive_closed` reason was **already** a local inference authorizing deletion
for the primary. I extended the same inference to members under an explicit policy check, so the risk
*class* is unchanged and only its breadth grew. Census: **all 54 bundle archives in this repo are
`closure_policy: all_or_nothing`**, and `claim.js:748,873,1606` defaults the field to that value. No
bundle archive sets `issue_action`. Flagging it because widening a delete in the default mode is a
judgement worth a second reader, not because I found a counterexample.

---

## 4. Scoping proof against the live repo's two out-of-scope findings

`node <new> --project bundle-900-901-902-903` run from the main root (the run folder exists **only**
there, not in the worktree), online, **no `--execute`**. Exit **0**, stderr empty.

```
scope: {"project":"bundle-900-901-902-903","issue_numbers":[900,901,902,903],
        "state_file":"kaola-workflow/bundle-900-901-902-903/workflow-state.md"}
current_project_clean: true
current_project_counts:  all zero (7 keys)
repository_counts_outside_scope: stale_in_progress_labels 1, archive_content_incomplete 1,
                                 archive_summary_citation_missing 4, rest 0
```

Both findings that belong to no part of this work are **out of scope and still visible**:

| finding | half |
|---|---|
| `stale_in_progress_labels` #796 | `repository_drift_outside_scope` ✓ |
| `archive_content_incomplete` `bundle-429-434` | `repository_drift_outside_scope` ✓ |
| the 4 new citation findings | `repository_drift_outside_scope` ✓ |

All four members 900–903 resolved from the live `issue_numbers` line — not just the primary.

### The ambiguous case, reported rather than guessed

`--project bundle-429-434` (the genuinely ambiguous archive: a bare `bundle-429-434` residue dir
beside `bundle-429-434.archived-2026-06-13T08-52-23-135Z`):

```
scope.archive_name_ambiguous: true
scope.state_file: kaola-workflow/archive/bundle-429-434.archived-2026-06-13T08-52-23-135Z/workflow-state.md
scope.issue_numbers: [429, 434]
current_project_drift.archive_content_incomplete[0]:
  {"project":"bundle-429-434","missing":["workflow-state.md"],"attribution":"ambiguous_name_match"}
```

The resolver correctly fell through the anchor-less bare dir to the sibling that has a state file, and
the finding says its attribution is ambiguous instead of implying a clean match.

### Scoped `--execute` does not repair unrelated projects (fixture, never the live repo)

Fixture with an in-scope stale bundle (700, 701) **and** an unrelated stale source (555):

| run | roadmap sources removed | survivors |
|---|---|---|
| unscoped `--execute` | 700, 701, 555 | `issue-900.md` |
| `--execute --project bundle-700-701` | **700, 701 only** | `issue-555.md`, `issue-900.md` |

`repository_drift_outside_scope.stale_roadmap_sources` = `[555]` — reported, not repaired.
`roadmap_regenerated: true` in both (whole-mirror, as documented).

---

## 5. Suites run — real exit codes

Exit codes captured with `echo $?` **directly on the command**, never through a pipe.

| what | tree | exit |
|---|---|---|
| `simulate-workflow-walkthrough.js` (full scope) — **BEFORE** | pristine main root @ `9b68b096` | **0** |
| `simulate-workflow-walkthrough.js` (full scope) — **AFTER, isolated** | scratch clone @ `9b68b096` + **only my 4 files** | **0** — 184/184 scenarios ran, 0 failed; **all 23 closure-audit tests PASSED** |
| `simulate-workflow-walkthrough.js` (full scope) — **AFTER, integrated** | the worktree incl. sibling edits | **0** — 184/184, 23/23 closure-audit PASSED |
| `validate-script-sync.js` | worktree | **0** |
| `test-route-reachability.js` | isolated | **0** (323 assertions) |
| `test-opencode-edition.js` | isolated | **0** (492 assertions) |
| `generate-routing-surfaces.js --check` | isolated | **0** (18 surfaces byte-match) |

The **isolated** run is the authoritative "after" for my change: siblings are concurrently editing
`claim.js`, `sink-merge.js`, `validation-runner.js` and `adaptive-schema.js` in this worktree, so a red
there would not have been attributable. Full scope, not the 1/12 fast-gate shard.

### CLI contract, measured

| invocation | exit | stdout | stderr |
|---|---|---|---|
| `--help` | **0** | usage | empty |
| `-h` | **0** | usage | empty |
| `--help` outside a git repo | **0** | usage | empty |
| `--bogus-flag-xyz` | **1** | **empty** | `unknown flag: --bogus-flag-xyz` + usage |
| `--project` (no value) | **1** | empty | `--project requires a project name` |
| `--issue abc` | **1** | empty | `--issue requires a positive issue number, got: abc` |
| `--issue` (no value) | **1** | empty | `--issue requires a positive issue number, got: <missing>` |
| `--project no-such-project-xyz` | **1** | empty | names both locations searched, suggests `--issue` |
| scoped + offline | 0 | `current_project_clean: false`, `stale_in_progress_labels: "skipped_offline"` visible in both halves | empty |
| `--issue 701` alone | 0 | `scope.project: null`, `state_file: null`; name-matched archive classes match nothing and land out-of-scope | empty |

### Cross-copy functional parity — not a load check

A scratch harness calls every new function in **all four** copies and compares answers (`parseArgs`
incl. all three throw paths, the three archive name shapes + the `P-extra` non-match,
`stateIssueNumbers`, `resolveProjectIssues` resolved/unresolved, `partitionDriftByScope` driving each
edition's own folder key, `driftIsClean`, `driftCounts`, `archiveCitedMissing`). All four PASS,
including GitLab's `unarchived_mr_folders` handled by the shape-based default arm.

**Mutation-proven armed** (a green harness is not proof): replacing the Gitea port's
`archiveNameMatchesProject` body with `name.startsWith(project)` reds **only** gitea
(`FAIL gitea ... bare prefix must NOT match`, exit 1) while the other three stay green. Restored by
exact inverse edit — never `git checkout --`, which would have destroyed sibling work in this
worktree. `validate-script-sync.js` re-verified 0 after restore.

Harness: `<scratch>/impl903/port-parity.js`. Scratch root:
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/impl903/`.

---

## 6. The #901 detector — what it is, and its measured precision

**This is the part of the work I am least willing to call settled, and the numbers are below so the
decision is not mine alone.**

Rule: read the archive's `finalization-summary.md`, extract bare-relative `.cache/<file>` tokens
ending `.md`/`.json`/`.txt`, report the ones absent from the archive. Report-only.

Measured over this repo's **368 archives / 118 summaries / 436 citations**: **4 archives flagged,
3 of them real losses.**

| flagged | cited | verdict |
|---|---|---|
| `bundle-440-441` | `.cache/chain-receipt.json` | **TRUE** — "Chain receipt: `.cache/chain-receipt.json` (headSha: 05590e2f)" |
| `bundle-513-514` | `.cache/chain-receipt.json` | **TRUE** — "HEAD-bound `.cache/chain-receipt.json` produced by `run-chains.js`" |
| `issue-455` | `.cache/doc-updater.md` | **TRUE** — table row `\| doc-updater \| invoked \| .cache/doc-updater.md (report) \|` |
| `issue-891` | `.cache/chain-receipt.json` | **FALSE POSITIVE** — the sentence says the receipt "landed at the repository-root `.cache/chain-receipt.json`". A prose mention is not a claim of presence. |

Design decisions, each forced by a measurement rather than taste:

- **`.jsonl` excluded.** A whole-document rule without that exclusion flags 6, of which 3 are false —
  50% precision. Both extra false positives are `.cache/release-receipt.jsonl` cited in narrative
  ("without clearing…", "delete … before the next release"). Excluding append-logs is principled, not
  a fudge: their disposal is a **documented step**, so absence there is correct. Costs no recall —
  `dispatch-log.jsonl` / `node-timings.jsonl` are 0-miss across the corpus.
- **Backticks NOT required.** Requiring them looks tidier and silently drops the `issue-455` true
  positive, whose citation is an unbackticked table cell.
- **No section allowlist.** Tempting: `## Delivered` produced both narrative false positives while
  `## Documentation Docking` is 0-miss in 80 citations. Rejected — the section vocabulary
  (`Final Validation Evidence`, `Required Agent Compliance`) is retired-DAG-era, the current era's
  summaries have no such headings, and `issue-891`'s false positive sits under an ad-hoc heading an
  allowlist could never enumerate. It would be fitting a rule to 3 data points using vanished
  machinery.
- **I did NOT build on `archived_paths:`.** That block (sink-merge `persistArchivedPathsToSummary`) is
  machine-written and zero-ambiguity — a strictly better anchor in principle. But it exists in only
  **4 of 368** archives (new in #893), it records what the sink **staged** so it structurally cannot
  see an artifact lost *before* archiving (which is #901's scenario), and **0 of its entries are
  missing today**. Additive derivation says don't build it. Recorded here as a watch-list candidate.

**The honest summary**: the class has real signal (3 genuine losses nothing else detects) and a known
~25% false-positive mode that no structural rule removes. It is report-only, omitted when empty, and
carries the cited path so an operator can adjudicate in one `ls`. Whether that noise floor is
acceptable in a *terminal* check — in the very audit whose contamination #903 is fixing — is a values
call. Note the mitigation is structural: under `--project`, all four current findings land in
`repository_drift_outside_scope`, so they cannot touch the scoped verdict.

---

## 7. Deliberately NOT changed

- **`regenerateRoadmap(root)` stays repository-wide.** Item 5 explicitly. The mirror is one generated
  file derived from all surviving sources; a partial rebuild does not exist. Noted, not scoped.
- **`unresolved_closed_state` is still absent from the `--execute` envelope** (premise §2 row h). Out
  of my brief; no observed failure demands it. Watch-list candidate.
- **`archive_content_incomplete` is still disk-derived and still requires only `workflow-state.md`.**
  The #901 rule is a **separate** class, not an extension of `missing[]`. Merging them would make one
  array mean two different things, and the disk-derived finding ("no identity anchor") is far more
  severe than a missing cited artifact.
- **No exit-code verdict for drift.** Still 0 whether clean or dirty. "Nothing refuses"; the verdict
  is `current_project_clean` in the JSON. Every existing walkthrough runner asserts `status === 0`
  unconditionally, so an exit-code verdict would also have red 25 call sites.
- **No prose, command, SKILL, `templates/routing/`, `README.md`, `CHANGELOG.md` or `docs/` edits.**
  Per brief. `docs/api.md:856-890` and `templates/routing/slots.js:126` still document/invoke the
  unscoped form only. The `<!-- PIN: closure-audit -->` marker and the two required interior sentences
  are untouched — `test-route-reachability.js` (T6) and `test-opencode-edition.js` (A16) both exit 0.

### A residue finding, outside my scope, NOT fixed

The two forge ports' **`archiveRequiredContent` still carries the retired Node-Ledger mechanism**
(`kaola-gitlab-workflow-closure-audit.js:121-144` and the gitea twin): `plan_hash`/`active_plan_hash`
probing, a `workflow-plan.md` demand, and a lazy `require` of `listRecordedNodeEvidence` from the
ports' `claim.js`. The canonical copy **deleted** all of that (its comment: "The second and third
rules are GONE with the mechanism that made them derivable"). `listRecordedNodeEvidence` no longer
exists in any `claim.js` — `git grep` finds it only in these two ports' own dead call sites and one
walkthrough comment — so the `typeof === 'function'` check makes it silently inert. It is dead code,
not a live behavioural divergence, and it is **not** among the divergences `docs/api.md:886-890`
records as deliberate. I left it alone: deleting it is a subtraction outside my brief, and
`residue-sweep` / `retired-lexicon` may already own it. **Flagging it so it is not lost.**

---

## 8. Where tests are needed (for `tdd-guide` — I wrote none)

I authored no test and edited no test file. Every function listed below is exported for exactly this.
Existing coverage: 23 closure-audit tests in `simulate-workflow-walkthrough.js`, none of which passes
an unknown flag, `--help`, or any scoping flag, and none of which asserts an exact key set — so the
additions red no existing pin (confirmed: all 23 pass unchanged).

Highest value first:

1. **`--project` must actually scope** — the regression #903 *is*. Fixture with drift in project A and
   project B; `--project A` must put B's findings in `repository_drift_outside_scope` and A's in
   `current_project_drift`. **Mutation control**: make `scopePredicate` return `() => true` and the
   test must red.
2. **A mistyped `--project` must exit 1, not report clean.** The single most important new guard: the
   old behaviour was exit 0 with an unscoped answer. Assert exit 1 **and empty stdout**.
3. **Unknown flag exits 1; `--help` exits 0 with `usage:` on stdout.** Mirror the classifier pin at
   `simulate-workflow-walkthrough.js:5803-5814`. Note the two existing runners
   (`runClosureAudit` `:1746`, `runClosureAuditOffline` `:1768`) **assert `status === 0`
   unconditionally** and `JSON.parse` stdout, so exit-1 and `--help` cases need a direct `spawnSync`,
   not those helpers.
4. **`current_project_clean` fail-closed.** Offline scoped run over a project with zero drift must be
   `false`, with `'skipped_offline'` present in **both** halves. This is the assertion most likely to
   be written backwards.
5. **Bundle-member candidate fix, both halves, each with a positive control** —
   (a) archive path: archived bundle `closed`/`all_or_nothing`, roadmap sources for primary *and*
   member, **offline** so only `archive_closed` can fire; both must be flagged, and the primary being
   flagged is the control that the fixture is live.
   (b) active-folder path: active bundle, primary OPEN, member CLOSED via the `gh` mock;
   `active_folder_for_closed_issue` must name the member. Control: the same fixture with the closed
   issue as primary.
6. **`closure_policy` negative control.** Same fixture with `closure_policy: partial` → the member is
   **not** flagged. Guards a destructive path; without it the policy check could be deleted silently.
7. **Scoped `--execute` must not delete another project's roadmap source.** Assert the unrelated file
   still exists on disk *and* that `roadmap_regenerated` is still `true`.
8. **`archive_summary_citation_missing` omitted when empty**, present when not, and absent from
   `reported_not_repaired` when empty. Cheap, and it is what keeps the default envelope stable.
9. **`.jsonl` is excluded and `.jsonl` is not truncated to `.json`.** A fixture citing
   `.cache/x.jsonl` (absent) must produce **no** finding — this is the exclusion most likely to be
   "simplified" away by a later reader.
10. **`archiveNameMatchesProject` must not match a bare prefix** (`P-extra` vs `P`). One line, and it
    is the assertion my own mutation test proved armed.
11. **`ambiguous_name_match`** when a bare `P` and a `P.archived-*` sibling coexist; `name_match`
    otherwise; and **no `attribution` key at all** in the unscoped output.

Not worth a test in my view: `driftCounts` (exercised by every other assertion), and the exact usage
wording (a brittle string pin; assert `usage:` only, as the classifier pin does).

---

## 9. Unverified / unknown — stated plainly

- **The forge ports were verified by in-process function calls and by `validate-script-sync`, not by a
  live end-to-end run.** No `glab`/`tea` was available, so I never executed either port's `main()`
  against a real forge. Their `detectStaleLabels`/`detectUnarchivedMrFolders` paths are unchanged by
  me, but the scoped `main()` I added to each has **never been run end-to-end** on those editions.
- **`--execute` was never run against the live repo**, per instruction. All repair measurements are on
  throwaway fixtures.
- **The `attribution` field is emitted only in scoped output.** No consumer reads it yet; I did not
  audit for an external/consumer-side parser of this script's stdout that a schema addition could
  break. Premise §"Could not establish" flags the same gap.
- **I did not measure whether `--project` matters for a project with an `.archived-*` name passed
  directly** (e.g. `--project bundle-429-434.archived-2026-...`). `archiveNameMatchesProject` would
  match it exactly, so it should work, but it is untested.
- **`issue-891`'s false positive is a judgement, not a measurement.** I read its prose and concluded
  the citation names an alternate location. A different reader could call it a true positive (the
  receipt genuinely is not in the archive).
- **The 4 live citation findings are permanent and tracked**, like `bundle-429-434`. They will appear
  in every unscoped run on this repo forever unless someone removes the residue or the citations.
