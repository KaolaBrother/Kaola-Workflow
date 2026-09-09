# Review — Issue #1056, frozen candidate `f210ef76` (baseline `e72407b8`)

Independent code review. Worktree
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1056`,
branch `workflow/bundle-1056`. Scope reviewed: `git diff e72407b8 f210ef76` (16 files,
+806/-83). No tracked file was edited by this review other than this report; nothing was
committed; `npm test` and `run-chains` were not run (a chain is running concurrently).

**Conclusion: ready with notes.** No blocking defect found. One real, measured behaviour
change rides along with the authorised import swap and is neither asserted nor documented
(N1). The remaining notes are documentation precision and a missing anti-vacuity floor.

---

## 1. Kernel fix — `scripts/kaola-workflow-adaptive-schema.js`

**Semantic identity of the replacements: verified.** The deleted `REMOTE_TIMEOUT_MS` IIFE body
and the new `remoteTimeoutMsNow()` body are the same two statements, character for character:

```
const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
```

Same env var name, radix 10, integer check, `> 0` guard, `Math.min(n, 600000)` upper clamp,
`30000` default. `offlineNow()` is `process.env.KAOLA_WORKFLOW_OFFLINE === '1'`, identical to
the deleted `OFFLINE`.

**Nothing else referenced the deleted constants.** Baseline grep:

```
$ git show e72407b8:scripts/kaola-workflow-adaptive-schema.js | grep -n "OFFLINE\|REMOTE_TIMEOUT_MS"
834:const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
835:const REMOTE_TIMEOUT_MS = (() => {
836:  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
853:  if (OFFLINE) return 'main';
856:    ... timeout: REMOTE_TIMEOUT_MS });
862:    ... timeout: REMOTE_TIMEOUT_MS });
```

The three consumers (853, 856, 862) are all inside `defaultBranch`. The deletion strands nothing.

**Probe chain unchanged apart from the two call sites.** The diff touches exactly three lines
inside `defaultBranch`: `if (OFFLINE)` -> `if (offlineNow())`, and the two `timeout:` values.
Stage order, the three `try`/`catch (_) {}` swallows, both regexes, the `(unknown)` rejection,
the `origin/` strip, the inner `require('child_process')`, and the `'main'` return are byte-identical.

**Comment accuracy: accurate.** The `#1056` comment says the #1055 constants "captured
process.env at module *load* time, so a caller who set the env after this module (or claim.js)
had already loaded saw the pre-set value forever." That is what I measured. The CHANGELOG entry
states the sharper version correctly (pre-#1055 the capture was at claim.js's load; #1055 moved
it earlier, to the kernel's load, which claim.js requires; now it is per call).

## 2. gitlab / gitea hand-ports

Both diffs are an import swap and nothing else. `git diff --stat` shows 23 and 22 lines in
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` and
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`; each has exactly one hunk,
replacing the local ~19-line `function defaultBranch` with a comment plus
`const defaultBranch = adaptiveSchema.defaultBranch;`.

- `adaptiveSchema` is required at line 10 in both files; the delegation sits at line 351/352 and
  every call site is at 1325+ inside a function, so the `const` has no temporal-dead-zone hazard.
  Confirmed empirically: both ports load and answer in the test children.
- `module.exports` still exports `defaultBranch` (gitlab:6532, gitea:6526).
- The ports' own `OFFLINE` constant (line 32 in both) is untouched and still consumed at
  roughly thirty sites each (claim, finalize, watch, sweep, prune, sink-lane logic). Not dead.
- The port sinks are unchanged and still resolve `defaultBranch` from their own claim module:
  `kaola-gitlab-workflow-sink-merge.js:9`, `-sink-mr.js:13`, `kaola-gitea-workflow-sink-merge.js:9`,
  `-sink-pr.js:13`.
- Kernel copy parity: `cmp` reports the canonical
  `scripts/kaola-workflow-adaptive-schema.js` byte-identical to all three plugin copies
  (`plugins/kaola-workflow`, `-gitlab`, `-gitea`). `node scripts/validate-script-sync.js` exits 0
  ("14 common scripts, 25 byte-identical groups ... 5 forge export-superset families in sync;
  committed kernel parity: 4 Oracle Kernel copies identical at HEAD").
- Function identity measured: each port's exported `defaultBranch` is `===` its own local kernel
  copy's export; it is not `===` canonical's (different module instance, same bytes). Expected.

## 3. Behaviour equivalence, measured

Scratch repo at `/private/tmp/.../scratchpad/repo`: one empty commit, `origin` pointing at
`/nonexistent/path/to/repo.git`, `refs/remotes/origin/HEAD` unset (`git symbolic-ref` reports
"is not a symbolic ref"). Baseline production files extracted from `e72407b8` into a separate
scratch tree. No network is reachable by construction.

| tree | env | result | wall |
|---|---|---|---|
| candidate | `KAOLA_WORKFLOW_OFFLINE=1` | `main` | — |
| baseline | `KAOLA_WORKFLOW_OFFLINE=1` | `main` | — |
| candidate | `KAOLA_GH_REMOTE_TIMEOUT_MS=500`, offline unset | `main` | 90 ms |
| baseline | `KAOLA_GH_REMOTE_TIMEOUT_MS=500`, offline unset | `main` | 92 ms |

Identical in the shipped CLI order (env set before any require), and both well inside the bound.

Regression order (require the kernel, set env, require claim): the candidate short-circuits
offline with one local probe; the baseline makes the network probe. Established by running the
candidate's suite against both trees, section 4.

## 4. Test custody — `scripts/test-issue-1056-default-branch-env-contract.js`

**The mock is not vacuous.** The kernel does `const { execFileSync } = require('child_process');`
*inside* `defaultBranch`, so it reads the mutated property of the cached module object at call
time. The ports destructure `execFileSync` at load (line 6), and `harnessSource(...)` is emitted
as the first line of every child driver, before any `require` — so the load-time destructure
picks up the mock too. Independently: the assertions read the mock's recorded `__calls` array,
which would be empty if the mock were bypassed, and `argvs.length === 1` and
`out.result === 'master'` cannot pass on an empty array or on real git against `/tmp/kw-1056-*`.
The baseline run below prints real recorded argv, which is direct evidence of interception on
both the kernel and the port paths.

**Candidate:** `node scripts/test-issue-1056-default-branch-env-contract.js` -> `31 passed,
0 failed`, exit 0, 1.1 s.

**Baseline (candidate suite, `e72407b8` production files):** `23 passed, 8 failed`, exit 1. The
eight RED are exactly the ones the acceptance report names, verbatim: scenario 1 result and
zero-network (x2), scenario 2 timeout, scenario 5c clamp-after-load, and scenario 6
port-before-env result and zero-network for gitlab and for gitea (x4). No assertion encodes the
baseline's broken behaviour; every expected value is the intended post-fix contract.

**Registration.** `node scripts/test-suite-registration.js` exits 0 (743 assertions; 65
`test-*.js`, 62 registered, 3 exempt). The suite is on `test:kaola-workflow:claude`,
`:claude:full`, `:codex`, `:gitlab`, `:gitea`. On the three forge chains it is inserted
immediately after `node scripts/test-forge-claim-rollback-scoping.js`, which is the existing
suite that also reaches into the gitlab and gitea claim ports and is registered on the same
chains. The suite's inputs are ordinary committed files (`git ls-files` lists all four
adaptive-schema copies and both port claim files), not `edition-sync`-materialised or gitignored
trees, so they are present in every checkout and the placement is safe.
`node scripts/test-spawn-classification.js` exits 0; the one real `spawnSync` in `runChild`
carries its `// spawn-class: environment` annotation.

## 5. Records

- `git diff e72407b8 f210ef76 -- kaola-workflow/archive/bundle-1055/mission-list.md` is **empty**.
  No completed Mission result was rewritten.
- Archive diff stat: `acceptance.md` 1 line, `adversarial.md` 1 line, `corrections.md` new (13 lines).
- NUL bytes counted with `tr -dc '\000' | wc -c`: baseline blob 1 in each file, candidate 0 in
  each file. Both files are text in git now — `git diff --numstat` reports `1  1` for each,
  against the `-  -` they showed when they were introduced.
- All five correction rows check out against the archived text:
  1. `finalization-summary.md:16` says "export key sets of all five sync scripts unchanged".
     Verified: `sync-zcode-edition.js` and `sync-opencode-edition.js` export
     `*_MODEL_DISPATCH_GUIDANCE` and `*_MODEL_DISPATCH_BLOCK` at candidate `8791ab55`, and zero
     occurrences at `c0abadc9`. The row is right.
  2. `finalization-summary.md:13` says "103 real sink envelopes and every re-export identity
     measured unchanged". `adversarial.md` §B3's "Limits" paragraph says
     "`KAOLA_WORKFLOW_SKIP_TESTGATE=1` is set by the suite's own harness ... `gh` is a mock
     throughout". The summary dropped those limits. The row is right.
  3. `audit.md:18` says `defaultBranch` "depends only on `execFileSync`, `OFFLINE`,
     `REMOTE_TIMEOUT_MS`, all of which adaptive-schema already defines".
     `git show 5cb85515:scripts/kaola-workflow-adaptive-schema.js | grep -c
     "KAOLA_WORKFLOW_OFFLINE\|KAOLA_GH_REMOTE_TIMEOUT_MS"` returns 0. The row is right.
  4. `finalization-summary.md:57` calls it "the latent load-order `OFFLINE` capture". It is a
     behaviour change of a public export, reproduced here on baseline. The row is right.
  5. The NUL replacement, verified above.

## 6. Documentation

`CHANGELOG.md` `[Unreleased]` gains one `### Fixed` heading (the section now has exactly one of
each of Fixed / Changed / Removed / Added; no duplicate heading). The bullet carries `(#1056)`,
so the release changelog-ref accounting will attribute it. Its claims — env names, per-call read,
probe order, the 1..600000 clamp with the 30000 default, the `'main'` fallback, "reproduced with
an `execFileSync` mock" — are each true and each measured. `docs/api.md` gains a scoped
"**Contract (#1056):**" paragraph on the `defaultBranch` entry that matches the code. No
unmeasured benefit is claimed anywhere.

## 7. Scope

The 16 changed files are the four kernel copies, the two port claim files, `package.json`,
`CHANGELOG.md`, `docs/api.md`, three bundle-1056 run records, and three bundle-1055 archive
files. Nothing under `templates/`, no generator, no routing or role surface, no legacy
non-`--sink` pipeline code, no `refs/kaola-workflow/barrier/*` handling, no other hand-port edit.
The codex plugin's `kaola-workflow-claim.js` mirror is unchanged, as canonical claim.js is.

---

## Findings

### N1 — Low. The ports gained an env-configurable probe timeout they did not have, unasserted and undocumented

`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:351` and
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:352`.

The deleted local copies hard-coded `timeout: 30000` and ignored `KAOLA_GH_REMOTE_TIMEOUT_MS`.
The kernel function reads it. Measured with an `execFileSync` mock, `KAOLA_GH_REMOTE_TIMEOUT_MS=1234`
set before any require, stage 1 throwing and stage 2 answering:

```
{"tree":"candidate-gitlab","calls":[{"argv":"...symbolic-ref..."},{"argv":"-C /tmp/x remote show origin","timeout":1234}]}
{"tree":"candidate-gitea" ,"calls":[{"argv":"...symbolic-ref..."},{"argv":"-C /tmp/x remote show origin","timeout":1234}]}
{"tree":"baseline-gitlab","calls":[{"argv":"...symbolic-ref..."},{"argv":"-C /tmp/x remote show origin","timeout":30000}]}
{"tree":"baseline-gitea" ,"calls":[{"argv":"...symbolic-ref..."},{"argv":"-C /tmp/x remote show origin","timeout":30000}]}
```

Failing scenario: a GitLab or Gitea operator who has set `KAOLA_GH_REMOTE_TIMEOUT_MS=1000` to
bound forge calls now also shortens the two git remote probes in `defaultBranch` from 30 s to 1 s,
where before they were fixed at 30 s. With the variable unset both trees pass 30000, so the
default path is unchanged and nothing breaks silently.

This is a convergence toward the documented contract and is the direct consequence of the
authorised import swap, so I do not read it as scope drift. But the mission list also says "keep
... per-forge behaviour", and this is a per-forge behaviour that changed. It is not asserted by
any of the 31 assertions (scenario 6 covers offline only, never a port timeout), and neither
`impl.md`, the CHANGELOG bullet, nor `docs/api.md` states it. Suggested: one sentence in the
CHANGELOG bullet, and a port timeout assertion mirroring kernel scenario 2.

### N2 — Low. The suite has no assertion-count floor

`scripts/test-issue-1056-default-branch-env-contract.js:407-408` prints the count and exits on
`failed`, but nothing asserts that 31 assertions ran. `impl.md` and the Mission List both quote
"31/31" as evidence; that number is currently witnessed only by the console line, not by the
suite. A future edit that drops a scenario block still exits 0 with a smaller count.

The risk is bounded: `runChild` throws on a crashed child, which fails the whole process, and the
argv-list assertions cannot pass if the mock is bypassed, so this is not a vacuity hazard today.
It is an arming gap for later edits. Suggested: `assert(passed + failed === 31, ...)` with a
literal, not a derived, expected count.

### N3 — Low. `docs/api.md:1823` is imprecise about cross-edition object identity

"The gitlab/gitea claim ports re-export the same kernel function." Measured: each port's export
is `===` its own local `kaola-workflow-adaptive-schema.js` copy's export, and is *not* `===`
canonical's, because each edition ships its own byte-identical kernel copy. A reader who tests
identity across editions gets `false`. Suggested wording: "re-export the same kernel function
from their own byte-identical kernel copy."

### N4 — Low. The general timeout entry in `docs/api.md:1753` was not widened

That entry describes `KAOLA_GH_REMOTE_TIMEOUT_MS` as the timeout "for all forge API calls made by
`ghExec`, `glabExec` and `teaExec`". After this change it also bounds the two git remote probes
inside `defaultBranch`, in all three editions — a fact stated only in the new paragraph 65 lines
later. One clause on the general entry would close the gap.

### N5 — Informational. The load-time capture survives everywhere else, by ruling

`scripts/kaola-workflow-claim.js:30,34`, `scripts/kaola-workflow-sink-merge.js:26,55`,
`scripts/kaola-workflow-sink-pr.js:15,17`, and both ports at line 32 still capture both variables
at module load for their `gh`/`glab`/`tea` calls. Setting `KAOLA_WORKFLOW_OFFLINE` after those
modules load still does not suppress forge API calls. That matches the owner's ruling ("module-level
constants elsewhere untouched"), and I confirmed none of those constants became dead: sink-pr's
pair is consumed at lines 31-32 and 180. Recorded so the CHANGELOG's "all three forge editions
share the one contract" is not read more broadly than `defaultBranch`.

### N6 — Cosmetic, reports only

`kaola-workflow/bundle-1056/impl.md` §A ends a sentence mid-clause: "net +... see `git diff
--stat`". `kaola-workflow/bundle-1056/acceptance.md` says `test-forge-claim-rollback-scoping.js`
is registered "in all four non-`:full` chains"; it is in five, `:claude:full` included. Neither
affects shipped behaviour.

---

## What I did not check

- I did not run `npm test`, `node scripts/kaola-workflow-run-chains.js`, the walkthrough, the five
  edition suites, `install-all.sh --check`, or the codex/gitlab/gitea chains. Excluded by the
  brief; a validation chain is running concurrently in this worktree. Chain-level greenness is the
  validation mission's evidence, not mine.
- I did not verify that the #1055 correction comment was actually posted on the forge issue. The
  Mission List records it; I made no forge call.
- I did not exercise `defaultBranch` against a reachable remote. Every measurement here used a
  mocked `execFileSync` or a repo whose `origin` is a nonexistent local path, so no probe left the
  machine and the real-network stage-2/stage-3 success paths are unmeasured by me.
- I did not re-run the five mutants the acceptance report describes. I proved arming differently,
  by running the candidate's suite against the baseline production files and confirming the eight
  RED.
- I did not audit the bundle-1056 run records against the ADR 0017 Mission List schema beyond
  reading them for context.
