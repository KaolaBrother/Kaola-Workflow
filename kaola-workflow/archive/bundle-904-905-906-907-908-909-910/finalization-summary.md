# Finalization — Summary: bundle-904-905-906-907-908-909-910

Seven issues (#904–#910), plus nine defects found by adversarial review **after** every
implementation was green and every implementer had mutation-proven its own work.

## Delivered

**#904 — sandbox root overflowed macOS's unix-socket path limit.** Shortened so a child can bind a
socket under the sandbox TMPDIR. The issue's own fix direction was wrong: shortening the 64-hex seed
alone still lands at 106 chars against a measured 104-byte ceiling — the directory literal is the
larger term. Two default sites, not one. Seed *determinism* is load-bearing, its width is not.
Consequence recorded in the CHANGELOG: this moves `command_id`/`vector_id`/`receipt_sha256` for every
policy, so an inherited `{command_id, required_pass_vector_id}` obligation predating it is
unsatisfiable.

**#905 — a red receipt carried no diagnosable content.** Opt-in `--keep-output <dir>` retains raw
child output only when asked. Receipt shape and hashes unchanged — the property that justified this
direction over the two alternatives. Refuses an existing target and the tracked archive band, at
write time as well as pre-flight. Writes after the last repetition, because writing inside the loop
makes the runner report its own log as `candidate_mutation`.

**#906 — two routes destroyed a live copy uncompared.** The crash-resume backstop now *moves* main's
surviving folder to `<archive-authority>/.orphan-main-live-<ts>/` instead of deleting it, nested so
the sink commits the rescued evidence into history. An entry that cannot be compared is now
distinguishable from one whose bytes differ (`uncomparable[]`), with no third comparison reader added.
The four editions now agree on the required name set.

**#907 — path handling, and a false green.** Finalize could report `finalize_commit: "nothing_to_commit"`
at exit 0, with `closure_invariants.ok: true`, while committing **nothing — including healthy files**,
on `--keep-worktree` linked runs, leaving no trace in the archived record. Fixed at both faults: the
parser, and the swallowed `git add`. Also the `.git` gitlink archive block, a second divergent
porcelain parser, and chain scoping that fell open on a C-quoted or renamed-out `plugins/` path.

**#908 — recorded coverage gaps.** One was already closed before the issue was filed (11 minutes
before the repair commit landed) and needed no work; two are now pinned with **no production seam
added**, which was the issue's own acceptance criterion; the rest are recorded in `D-908-01`.

**#909 — repo drift.** #796's stale label removed. `bundle-429-434`'s residue removed — after its
**unique** `sink-receipt.json` was rehomed into the real archive, so nothing was lost. The four
unrepairable citation findings are recorded in `D-909-01`; "zero findings" is unreachable by
construction and the issue closes saying so.

**#910 — receipt landed where the gate could not read it.** `run-chains --project` from a linked
worktree now writes where the finalize gate reads, while still hashing the invoking tree. The issue's
proposed fix did not exist (`resolveRecordFolder` was exported from nothing); it is exported now and
run-chains injects the schema it already imports. The Step 8a mirror no longer overwrites a newer
receipt with an older one.

## Files Changed

32 files, +6917 / −335. Five production files across four editions each; six test files; seven prose
files including two new decision records. Roughly a third of the insertions are tests.

## Test Coverage

| suite | assertions |
|---|---|
| `test-claim-hardening` | 766 (was 557) |
| `test-finalize-door` | 394 (was 301) |
| `test-sink-merge` | 631 (was 419) |
| `test-run-chains` | 283 (was 249) |
| `test-validation-runner` | PASSED — **first coverage the `run` subcommand has ever had** |
| `test-kernel-conformance` | 254 |
| walkthrough | 198/198 scenarios, **full scope, not a sampled shard** |

Custody held throughout: no implementer wrote a test for its own behaviour, and no production seam
was added to make a test possible — twice an implementer's export was removed once the test author
pinned the *result* instead.

Every guard is mutation-proven. Notable rigour, because green suites are not evidence in this repo:

- The #906 route-1 mutant (rename → `rmSync`) leaves **every claim-clearing assertion green** and reds
  only "still readable" — an oracle checking the phantom claim, which is what the issue framed the fix
  around, passes on the destructive version.
- Per-edition loops were proven independent by single-edition mutants, cross-checked by arithmetic:
  whole-tree mutants produced exactly 4× the single-edition counts.
- Four mutations turned out to be silent no-ops that *looked like evidence*: a `String.replace` on the
  wrong occurrence, two paths already identical, `git rev-parse --resolve-git-dir-NOPE` (git echoes
  and exits 0), and a `120000` filter already excluded by `readlinkSync`. Each was caught and
  re-derived rather than banked.

## Validation

*(the finalize transaction appends its own finding below — do not edit it)*

Chains run by the orchestrator as the last pre-finalization action, from the linked worktree with
`--project`: **all four green** (`claude:0 codex:0 gitlab:0 gitea:0`), `headSha cf40c549`.
`finalize --check` read it as `validation: "chains_green"`, `dirty_paths: []`, no reasons.

The first attempt was **red** and correctly so — `test-run-chains.js` carried 6 unclassified spawn
sites against a ceiling of 5. Resolved by *converting* two sites in-process, not by classifying six
and not by raising the ceiling; the file now carries 4, below where it started.

This receipt is itself #910's acceptance evidence: taken from a linked worktree, it landed in main's
run folder where the gate reads, with nothing in the worktree copy. Pre-#910 the same invocation
produced `chains_unverified` over four green chains.

## Changed Paths

*(the finalize transaction appends its own list below — do not edit it)*

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. All prose landed **before** the receipt, because `CHANGELOG.md`,
`docs/api.md` and `docs/workflow-state-contract.md` are test-consumed and a later edit would stale it.
`doc-updater` was deliberately not re-dispatched at Step 4 for that reason; the pass it would have run
had already happened, three times, with every field name read at its site rather than taken from a
report.

## Run gaps

- manual:relative-plan-receipt-placement: filed: #911
- manual:forge-sinkpreflight-divergence: filed: #912
- manual:env-allowlist-silently-discarded: filed: #913
- manual:keep-output-run-folder-band: filed: #915
- manual:finding-type-count-divergence: filed: #914

## Follow-Up Items

**#911** `--plan` with a relative path carries the identical #910 defect. **#912** the forge
`sinkPreflight` ports call `assertWorktreeClean` unconditionally. **#913** `buildScrubbedEnvironment`
silently discards an allowlisted `HOME`/`TMPDIR`. **#914** canonical emits six finalize finding types
where the forge ports emit five.

Recorded as decisions rather than filed: #908's remaining gaps (`D-908-01`), #909's four citation
findings (`D-909-01`), and `--keep-output`'s retain-nothing-on-kill behaviour (documented in
`docs/api.md` as designed, since writing inside the loop would corrupt the verdict).

**#915** — whether a `--keep-output` destination inside a tracked run folder should be permitted at
all. Put to the owner at the closure decision rather than settled by delegation: **ruled ship-as-is
with the reasoning recorded.** The archive band — permanent and unavoidable — is refused; the residual
requires a caller to pass the flag *and* name a run-folder path. Filed so the decision is on record
and cheap to revisit, with the conditions that would reopen it written down. The test author correctly
declined to pin it while it was unruled.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/doc-docking.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/doc-updater.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/docs.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/impl-claim.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/impl-parse.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/impl-runner.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/impl-sink-rc.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/parse-contract.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/premise-904.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/premise-905.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/premise-906.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/premise-907.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/premise-908.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/premise-909.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/premise-910.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/review-destruction.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/review-editions.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/review-verdict.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/run-gaps.json
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/tdd-keepoutput.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/tdd-paths.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/.cache/tdd-sink.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/finalization-summary.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/mission-list.md
- kaola-workflow/archive/bundle-904-905-906-907-908-909-910/workflow-state.md
