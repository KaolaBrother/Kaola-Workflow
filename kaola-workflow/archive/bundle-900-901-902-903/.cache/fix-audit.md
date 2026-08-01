# fix-audit — the two C4-adjacent scoped-verdict defects

**Task.** Repair D1 (a mistyped `--project` combined with any `--issue` answered
`current_project_clean: true`) and D2 (`archive_name_ambiguous` blind to two timestamped siblings) in
the four closure-audit copies. No tests written (custody is `tdd-guide`'s), no `docs/`, no
`templates/`, no `CHANGELOG.md`.

**Verification tier: `tests-green`** — the authored suites for these files pass, and each defect
additionally carries a direct reproduce → fix → positive-control measurement.

**Published contract: UNCHANGED.** Exit codes are untouched (0 for every successful run including one
that found drift; 1 only for operator-input error with empty stdout), the unscoped envelope is
byte-identical in all four modes, and the `--issue`-without-`--project` and unresolvable-`--project`-
plus-`--issue` forms both still answer at exit 0. The scope block gains one **omit-when-false** key,
`project_unresolved`, on the path that previously lied.

## Files changed (4, all mine)

| file | lines |
|---|---|
| `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903/scripts/kaola-workflow-closure-audit.js` | 77–78, 188–205, 216–222, 576–583, 588–596, 696–699, 724 |
| `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903/plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | byte-identical copy of the above (`cp`, then `diff` confirmed empty) |
| `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903/plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | 68–69, 180–197, 208–214, 575–582, 587–595, 695–698, 723 |
| `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903/plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | 68–69, 180–197, 208–214, 574–581, 586–594, 695–698, 723 |

Nothing else was touched. No test file, no doc, no skeleton, no rendered surface. Nothing committed.

## Harness (scratch, not committed)

`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/fixaudit/`

- `repro.js <closure-audit.js> [d1|d2|unscoped|all] [mockEnvVar]` — builds fixtures, runs the CLI,
  prints the axis (`ONLINE(mock)` / `OFFLINE`) beside every result.
- `ghmock.js` — forge-agnostic remote mock: every issue **open**, no stale labels, no PRs/MRs.
- `reverse.js` — reconstructs the **pre-fix** file inside a scratch **mirror** of a scripts directory
  by applying the exact inverse of the eleven textual edits, failing loudly unless each hits exactly
  once. Nothing in the worktree was ever reverted — eight agents hold uncommitted work there.
- `mirror/{github,gitlab,gitea}/` — full copies of the three scripts directories, pre-fix, so requires
  resolve locally and the "before" leg is a real run rather than a recollection.

**Axis trap, hit and defused.** D1 is invisible offline: `probeIssueState` returns `open` offline, so
the two `skipped_offline` classes hold `clean` false for an unrelated reason and the false-clean never
appears. Every D1 leg therefore runs with `KAOLA_WORKFLOW_OFFLINE` set **explicitly to `0`** plus a
mock on the forge's own hook, and the offline leg is shown beside it to document the masking.

**Second axis trap, hit and defused.** My first mock keyed on `issue view` (gh's spelling). The gitea
forge says `issues view`, so the gitea run fell through to `{}` → state `unknown` → probe
`unavailable` → an extra `unresolved_closed_state` class → `clean:false` for the wrong reason, and the
positive control read **false** where it had to read **true**. The control disagreeing with itself is
what caught it; the mock now matches both spellings. Had I keyed only on the defect leg I would have
shipped a dead online axis wearing a plausible answer.

---

## D1 — a mistyped `--project` plus any `--issue` answered `clean: true`

### Reproduced (pre-fix mirror, ONLINE)

Fixture: live folder `bundle-700-701` (`issue_numbers: 700,701`), an archive of the same name saying
`status: closed` / `closure_policy: all_or_nothing`, and surviving `.roadmap/issue-700.md` +
`issue-701.md`. So the project **genuinely has two stale sources**.

```
[ONLINE] CONTROL correct --project        clean=false  counts.stale_roadmap_sources=2
[ONLINE] CONTROL typo alone               exit=1  stdout=""   (published operator-input error)
[ONLINE] DEFECT  typo --project + --issue 4242
         scope={"project":"bundle-700-71","issue_numbers":[4242],"state_file":null}
         current_project_clean=true   exit=0
[OFFLINE] same argv                       clean=false  ← masks the defect
```

An operator who typed `bundle-700-71` was told their project was clean while it carried two stale
roadmap sources. Measured identically on all three sources (github / gitlab / gitea mirrors).

### Fix

`resolveScope` already published the rule in its own comment — *"An unresolvable `--project` must not
answer 'clean'"* — and `assert(found.resolved || args.issues.length > 0, …)` let the escape hatch walk
straight through it. The exit-1 answer is not available: the contract publishes exit 1 only for a
`--project` resolving to nothing **with no `--issue` given** (`docs/api.md:960`), and three suites pin
the accepted form. So the honest answer is the second one the brief allows — report plainly that the
project did not resolve, and refuse to call that clean.

- `scripts/kaola-workflow-closure-audit.js:194` — `projectUnresolved = !found.resolved;` carried out
  of `resolveScope` (`:204` puts it on the returned scope).
- `:595` — `driftIsClean(drift, scope)` returns false when `scope.project_unresolved`. This is the
  function's existing fail-closed rule applied to the **scope** rather than to a class: nothing was
  read for the name, so no class speaks for the project the operator named. `scope` is optional, so
  the 4 shipped single-argument unit pins keep their meaning.
- `:699` — `scopeOut.project_unresolved = true`, **omitted when false**, mirroring
  `archive_name_ambiguous`. This is load-bearing: `assertKeys903(scoped.scope, ['project',
  'issue_numbers', 'state_file'])` in both forge suites is an exact key-set pin on a resolvable scope.
- `:724` — the one call site passes the scope.
- `:77–78` — the usage text's "false whenever a scoped class could not be evaluated" sentence gains
  the new condition, so the surface and the code state the same rule.

### Post-fix, same fixture, same runner

```
[ONLINE] DEFECT typo --project + --issue 4242
         scope={"project":"bundle-700-71","issue_numbers":[4242],"state_file":null,"project_unresolved":true}
         current_project_clean=false   exit=0
```

### Positive controls (all ONLINE unless noted, all exit 0)

| control | result | what it rules out |
|---|---|---|
| `--issue 4242` alone, zero-drift repo | `clean=true`, scope 3 keys | the supported no-project form still works, and the verdict is not always-false |
| **resolvable** `--project proj-clean --issue 4242`, zero drift | `clean=true`, scope 3 keys | over-correction: a legitimate project+issue pair still reads clean |
| resolvable `--project proj-clean` alone, zero drift | `clean=true`, scope 3 keys | same, without an issue |
| resolvable `--project bundle-700-701 --issue 4242`, real drift | `clean=false`, 2 findings in scope | scoping still partitions correctly |
| typo `--project` **without** `--issue` | exit 1, stdout `""`, stderr names project + `--issue` | the published operator-input error is untouched |
| scoped `--execute`, typo + `--issue 701` | exit 0, `roadmap_sources_removed=[701]`, scope labelled | the escape hatch still repairs by issue number |
| `--project gutted --issue 77` (archive folder exists, no anchor) | before **and** after: `clean=false`, finding in scope, `attribution: name_match` | the archive-class attribution for an unresolved project is unchanged; only the label is added |

---

## D2 — `archive_name_ambiguous` blind to timestamped-only siblings

### Reproduced (pre-fix mirror, no bare `P`)

`archive/proj-b.archived-2026-01-01…` (has `workflow-state.md`) beside
`archive/proj-b.archived-2026-02-02…` (no anchor → `archive_content_incomplete`):

```
scope={"project":"proj-b","issue_numbers":[931],"state_file":".../proj-b.archived-2026-01-01…/workflow-state.md"}
                                                                       ← no archive_name_ambiguous
current_project_drift.archive_content_incomplete=
  [{"project":"proj-b.archived-2026-02-02…","missing":["workflow-state.md"],"attribution":"name_match"}]
```

The scope silently adopted one of two candidates and stamped the other's finding as an unqualified
`name_match`. Measured identically on all three sources.

### Fix

Two halves of one defect — the flag and the stamp:

- `scripts/kaola-workflow-closure-audit.js:222` — `archiveNameIsAmbiguous` now counts archive folders
  matching the project by **any of the three name shapes** and is true above one, instead of demanding
  a bare `P` plus a suffixed sibling: `names.filter(n => archiveNameMatchesProject(n, project)).length > 1`.
- `:582` — `annotateAttribution` tests the same name-shape match the scope predicate used to pull the
  finding in, instead of `finding.project === scope.project`. Keyed on the bare name it could only ever
  stamp the bare-`P` half, so the timestamped sibling — the half that is residue more often than not —
  read as a clean match even when the flag did fire.

Comments on both functions were rewritten to state the new rule; the old wording described the
bare-`P`-plus-sibling shape specifically.

### Post-fix and controls (all ONLINE, all exit 0)

| case | `archive_name_ambiguous` | `attribution` | verdict |
|---|---|---|---|
| two `.archived-*` siblings, no bare `P` | **true** | `ambiguous_name_match` | fixed |
| `.archived-*` + `.discarded-*`, no bare `P` | **true** | `ambiguous_name_match` | fixed (third shape) |
| bare `P` + `.archived-*` sibling | true | `ambiguous_name_match` | unchanged (was already right) |
| single archive `proj-solo`, incomplete | omitted | `name_match` | **control** — no over-flagging |
| `proj-a` + `proj-a-extra` + `proj-a.something` | omitted | `name_match` | **control** — a prefix-adjacent or dotted name is not a sibling, so the count rule does not swallow it |

The last row is the important negative: a naive "more than one archive mentions the project" rule would
have flagged it. It routes through `archiveNameMatchesProject`, whose bare-prefix exclusion is
separately pinned.

---

## The unscoped envelope is byte-identical

Same fixture (a closed bundle archive with two stale roadmap sources, a gutted archive, a live folder),
digest of raw stdout, **before = pre-fix scratch mirror, after = the worktree file**, four modes each:

| source | mode | before | after |
|---|---|---|---|
| github | dry-run online / `--execute` online / dry-run offline / `--execute` offline | `9c5c130700482e4f` `ad0ad96287f85b41` `12a431a09b0af376` `4e4c78a678e83032` | identical |
| gitlab | same four | `203daa749ce43c36` `c6e6ea7c425fd779` `26f334e5058be6b6` `2a3ca7f25a218d74` | identical |
| gitea | same four | `9c5c130700482e4f` `ad0ad96287f85b41` `12a431a09b0af376` `4e4c78a678e83032` | identical |

(sha256, first 16 hex chars; byte lengths matched too. gitlab differs from the other two because of
`unarchived_mr_folders`.) The codex copy is byte-identical to canonical, so canonical's proof covers it,
and `validate-script-sync.js` exits 0.

## All four editions

- canonical `scripts/` and codex `plugins/kaola-workflow/scripts/` — **byte-identical** (`diff` empty).
- gitlab and gitea — hand-ported with their own naming and vocabulary preserved (`issues view`,
  `unarchived_mr_folders`, `issue_iid` primary, glab/tea forge routing). Both reproduce the defects
  pre-fix and pass every leg and control post-fix.

## The offline defence stayed INCIDENTAL — it did not become direct

The honest fix for D1 does not touch it. `project_unresolved` is a condition on the **scope**, not on
the remote classes, so an offline run still reads `clean:false` only because
`stale_in_progress_labels` and `unarchived_pr_folders` token `skipped_offline`; the three other
remote-dependent classes still read empty-for-the-wrong-reason (`probeIssueState` returns `open`
offline). If either tokening class ever stops tokening, an offline scoped run reads clean. Recorded,
not built — nothing has failed here, and building for it would be a mechanism derived from a
hypothesis.

## Suites — all serial, real exit codes via bare `echo $?`, never through a pipe

| suite | exit |
|---|---|
| `scripts/simulate-workflow-walkthrough.js` (**full scope**, no shard) | **0** — `{"scenarios":198,"ran":198,"passed":198,"failed":0}`, 2059 spawns. All 14 `…903` closure-audit scenarios PASSED |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | **0** |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | **0** |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | **0** |
| `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | **0** |
| `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (codex copy's own suite) | **0** |
| `scripts/validate-script-sync.js` | **0** |
| `scripts/test-spawn-classification.js` | **0** |

The full walkthrough counted **198** scenarios, not the 197 in the brief — a sibling agent added one
while this ran; all 198 passed. Its only stderr output is an in-fixture `no_implementation_changes`
finding printed by a sink-merge scenario, not a fault. Logs:
`…/scratchpad/fixaudit/suites/{name}.{out,err,code}`.

## Where pins are needed (I may not write them)

Nothing currently pins either fix. All three escape-hatch scenarios assert only status, `state_file`
and `issue_numbers` on the unresolvable pair, and none assert the verdict — so D1's fix is
**unpinned**, and D2's new shapes are unpinned.

1. **D1, CLI level — must be ONLINE.** `scripts/simulate-workflow-walkthrough.js`,
   `testClosureAuditMistypedProjectExitsOne903` (~:8470, the `withIssue` leg): assert
   `scope.project_unresolved === true` **and** `current_project_clean === false`. ⚠ that scenario's
   runner `runClosureAuditRaw` hardcodes `KAOLA_WORKFLOW_OFFLINE: '1'`, under which the assertion
   **passes against the defect** — it needs `runClosureAudit` + a `closureAuditShim`, or a raw runner
   with a mock. Pair it with a control on the same fixture: a **resolvable** `--project` + `--issue`
   over zero drift reading `clean === true`.
2. **D1 in both ports:** `test-gitlab-workflow-scripts.js:3011` and
   `test-gitea-workflow-scripts.js:2762` — same two assertions, same online caveat. Keep
   `assertKeys903(scoped.scope, ['project','issue_numbers','state_file'])` for the resolvable case and
   add the four-key variant for the unresolved one.
3. **D1, unit level:** `testClosureAuditScopingHelpers903` (~:8904) — `driftIsClean({a: []}, {
   project_unresolved: true }) === false` plus the control `driftIsClean({a: []}, {
   project_unresolved: false }) === true`. Runs offline safely; it is pure.
4. **D2:** extend `testClosureAuditScopedArchiveAmbiguousMatch903` (~:8984) with **two timestamped
   siblings and no bare `P`** (flag true, sibling's finding `ambiguous_name_match`) and the
   `.archived-*` + `.discarded-*` pair. The unambiguous control already exists at
   `testClosureAuditScopedArchiveNameMatch903`; add `proj-a.something` to it if a dotted-sibling
   negative is wanted. Mirror both in the two forge suites (gitlab :3479–3488, gitea :3230–3239).
   D2 is fully observable **offline** — the class is local — so those may reuse the offline runner.
5. `archiveNameIsAmbiguous` is **not exported**; a unit pin would require adding an export. The CLI
   pins cover it, so I would not add one.

## Prose that now understates the rule (not mine to edit)

Each says `current_project_clean` is `true` "only when every scoped class actually evaluated" — still
true, but no longer the whole condition:

- `docs/api.md:957` (the `current_project_clean` contract row) and `:960` (the exit-1 row, which
  correctly already scopes exit 1 to "with no `--issue` given"). A `project_unresolved` row belongs in
  the key table.
- `templates/routing/finalize.skeleton.md:481` — and therefore the four rendered finalize surfaces
  (`commands/kaola-workflow-finalize.md`, the two forge commands, the three SKILL.md copies).
  Regenerate, never edit a rendered surface.
- `CHANGELOG.md:64–65` describes `archive_name_ambiguous` as firing "when a bare residue directory
  sits beside a timestamped sibling" — now any two matching archive folders; and `:66–67` is the same
  `current_project_clean` sentence.

No shipped surface passes `--project` **with** `--issue` (the finalize splice invokes
`--project {project}` alone), so no rendered flow changes behaviour — only the previously false-clean
invocation does.

## Unverified / not attempted

- No live forge was contacted; every online leg used a mock on the forge's own hook. The mock returns
  well-formed answers only — a forge that **lies** about state, or a malformed `issue_numbers` line,
  is untested here (the same gap the adversarial pass declared).
- `--execute` under a scope was exercised only for the D1 escape hatch (repair by issue number); I did
  not re-test the whole safe-repair boundary, which the shipped suites already cover.
- `closure_policy` values other than `all_or_nothing` were not re-exercised beyond the existing pin.
- The two additive runtime editions (opencode, kimi) ship no closure-audit copy, so nothing there.
