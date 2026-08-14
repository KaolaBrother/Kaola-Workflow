# Finalization — Summary: bundle-976-977-978

Closes **#976** (relative-`TMPDIR` temporaries escaping into the checkout), **#977** (retired-name
handling incomplete on two axes, unobservable on a third), **#978** (the sink's lane exemption
destroying three measured shapes silently).

## Delivered

**#976 — no fixture or installer temporary root lands inside the working checkout, whatever `TMPDIR`
holds.** Eight installer `mktemp` sites (not the seven filed — the issue's prose said seven while
enumerating eight) now carry the absolute-or-`/tmp` `KW_TMPDIR` guard `install-all.sh` already had,
with explicit templates under it. The Node surface — which the filed issue missed entirely, despite
its own exposure definition reaching it — is covered by a single require-time `TMPDIR`/`TMP`/`TEMP`
normalisation in the kernel: a non-empty non-absolute value becomes `/tmp`, an absolute value passes
byte-for-byte untouched, empty stays empty. Six walkthrough entry points needed their own guard,
because each creates its sandbox at module load *before* any production require, so the kernel
structurally cannot run first.

One of the eight sites was hiding a worse, unfiled defect: `install-kimi.sh` used `mktemp -t
kaola-kimi-hooks`, a template with no `X`s, which GNU rejects outright — and under `set -euo
pipefail` that **aborted the entire kimi install for every GNU user with an existing `config.toml`**.
Repaired deliberately, not incidentally.

**#977 — a surface the edition retired is removed from a deployed install on both paths.** Four
strands, each reproduced live before the fix: `install.sh` never removed seven pre-rename
`claude-workflow*` names; `uninstall.sh` named one of four retired agents, and that strand was
**permanent** rather than stale because the same uninstall deletes the manifest a later install would
need to heal them; opencode's uninstall ignored its own retired-command list; and retired hooks had
no removal route at all on either additive edition. All closed by *naming* the retired artifacts —
never by widening a sweep, since a namespace prune is the defect #973 removed.

**#978 — the sink no longer silently destroys uncommitted work in three measured shapes.** A
backslash-named file, an embedded git repository under a lane prefix (whose own `.git` and unpushed
commits died with it), and the legacy route's removal of a worktree-only journal. The first two are
fixed in the guard **both** entry points share, so the legacy no-flag route is covered too — verified
by driving it directly on all four editions. The third reuses the `--sink` route's existing rescue
rather than adding a second one.

**Beyond the filed scope, on explicit user rulings:** two unfiled #977 axes (the permanent
agent strand; retired hooks) were built rather than filed, and a review finding (R1) was closed on
both sink routes.

## Files Changed

34 files, +1254/−58 at the pre-finalize measurement. Production: 4 installers/uninstaller; the kernel
and validation-runner across all 4 editions; the sink across all 4 editions. Tests: 5 existing suites,
1 new suite (`test-relative-tmpdir-escape.js`, registered in both tiers), 6 walkthrough entry points.
Docs: `CHANGELOG.md` and 4 documents. Roadmap: 3 sources removed at closure, 5 added for follow-ups.

## Test Coverage

Every guard this run added is **mutation-proven** — not "the suite is green", but "here is the change
that makes it red, and here is what stayed green while it did".

| suite | result |
|---|---|
| `simulate-workflow-walkthrough` (FULL scope, shard 1/1) | **210 / 210**, 0 failed |
| `test-sink-merge` | **1058** |
| `test-relative-tmpdir-escape` (new) | **48 / 0** |
| `test-kimi-edition` / `test-opencode-edition` | 618 / 655 |
| `test-run-chains` | 283 (T30 and the hand-down pins intact) |
| `test-install-all` | 254 (#975 not regressed) |
| `test-spawn-classification` | 669 sites / 67 files / 237 classified |

Full scope was not optional: the fast gate samples a rotating 1/12 walkthrough shard, and this bundle
touched the kernel, six walkthrough entry points, four installers and four sink copies.

**The macOS vacuity trap was taken head-on.** All eight installer sites are *immune on macOS* —
`mktemp` there reads `_CS_DARWIN_USER_TEMP_DIR` and ignores `TMPDIR` even when absolute — so a
shell-site test written and run on this machine would pass whether or not the fix existed. The suite
drives the real installers under a GNU-shaped `mktemp` PATH shim with a live positive control each
run, and the shim itself was audited against **real GNU coreutils 9.1 in a container**, matching all
13 load-bearing rows including the exact abort text. Two stricter-only divergences are recorded; one
is filed as #982.

## Validation

Four-chain receipt **GREEN**, read by field rather than by the wrapper's exit status: `claude` 0 (37
steps), `codex` 0 (2), `gitlab` 0 (3), `gitea` 0 (3). `scope.decision: "all-four"`, `reason:
"edition_coupling"`, 20 touched edition paths — the diff-scoping failed closed to all four, as a
three-plugin-tree diff requires. `codeTreeHash 3248d6d4…`; freshness **re-verified after** the
roadmap sources landed (`computeCodeTreeHash` byte-equal), so no re-run was owed. The receipt
postdates every documentation edit, which was the binding constraint — `docs/api.md` is
chain-consumed and an earlier receipt would have been stale.

The first chain run came back **RED** on one violation: three unclassified spawn sites in the new
suite (the guard is default-ON at ceiling 0, precisely to catch a new suite). Resolved by classifying
two as `environment` and **converting** the third to the shared git-fixture library, because git
fixture arrangement is not a property under test at all and forcing one of the five tokens onto it
would have left a permanent lie in an annotation whose whole value is being true. No ceiling raised.

## Changed Paths

Reported by the finalize transaction on its envelope and appended below it.

## Mission List

19 items, all `done`. Structure: premise-check every filed claim before building; author tests before
implementation with strict custody; implement; adversarially review; dock docs; verify.

**Premise-checking earned its place — every one of the three issues was wrong in some load-bearing
way**, and two would have sent an implementer down a false path:

- **#976** was wrong three ways: the property is **platform-conditional** and the issue never said so
  (all eight sites immune on macOS, seven of eight escaping on GNU); the enumeration said seven while
  listing eight, and one of those escapes on *no* platform (it hard-errors instead); and it missed the
  entire Node surface, including `run-chains.js:326` — *the very site the issue cites as the
  mitigation*, which builds its own root with one of the two idioms the same issue proves dead.
- **#977's** "only mechanism that could clear them" was refuted: `uninstall.sh` already globs those
  names. Two filed line numbers were wrong.
- **#978's** shape-2 example was the wrong mechanism (`.kw/` is gitignored, so a nested repo there
  produces no record at all), and the filed harm was *understated* — the nested repo's own `.git`
  dies too, so committed-but-unpushed history is lost, not merely uncommitted files.

## Documentation Docking

`DOCKED` — see `.cache/doc-docking.md`. Four documents carried claims this bundle made **false** and
were corrected; a similar-looking claim in `copy_skills` was verified **still true** and left alone.
ADRs audited and deliberately not edited: none states the old behaviour as a now-false live rule, and
`ADR 0012:84-86` turned out to be the *obligation* #977 axis A restored — the tree had drifted from a
correctly written rule.

## Run gaps

- manual:sink-classifier (the main-root preflight): filed: #979
- manual:sink-rescue (a sink that stages the journal and then red-stops BEFORE landing): filed: #980
- manual:installer-retirement (retired SUPPORT SCRIPTS survive an opencode or kimi --uninstall): filed: #981
- manual:test-harness (the GNU-shaped mktemp shim's -p/-t precedence diverges from real coreutils): filed: #982
- manual:test-coverage (the sink stage's unreadable-file): filed: #983

Two further candidates were **checked and closed rather than filed**, because the #976 choke point
had already fixed them: `validation-runner:214`'s hand-down of a possibly-relative `TMPDIR` to
sandboxed children, and `adaptive-schema:1033`'s "the index lives OUTSIDE the repo" comment, which
was false under a relative `TMPDIR` and is now true. Filing either would have sent someone to
investigate a bug that no longer exists.

## Follow-Up Items

#979–#983, each filed as an independent slice on a disjoint surface so a later run can take them at
whatever width the backlog allows. Roadmap sources written for all five, so the mirror lists them —
this run *began* by finding the opposite condition (three open issues with no local sources, leaving
`validate-remote` structurally blind), and not handing that same blindness to a successor was the
point.

Not a follow-up but a recorded decision: an in-lane basename containing a backslash now refuses every
sink where it previously sank. Loud, fail-closed, the safe direction — accepted deliberately.

## Corrections made during the run

Recorded because the run's own record was wrong twice and both were caught by someone else:

- **"modified two tracked files"** — premise-976's verdict paragraph overstated its own leg-1
  transcript, which shows one modified tracked file plus one *new untracked* artifact. Propagated
  into the run record and upward before the doc pass caught it; corrected in the run record, the
  CHANGELOG, the new suite's header, scenario D's failure message and the shared six-file block.
- **The R1 refusal shape** — the typed `result:'refuse', reason:'stage_failed'` envelope is the
  `--sink` transaction's shape *only*; the legacy route refuses by **throw**, with no typed reason
  field. Both refuse, both skip removal, both name the path and the error.
- **The run record itself was malformed, and the finalize transaction caught it.** Its emit reported
  `mission_list: {items: 19, outcome_while_not_done: [19, 24, 116]}` — three items carrying a
  `result` while still reading `status: in-flight`. Auditing on that hint found the problem was
  larger than the three it named: **seven** items had DUPLICATE status lines, because I appended
  `status: done` instead of replacing `status: in-flight`, and four items were never flipped at all
  even though their work had finished. That is the third write moment — *"write `result` and flip
  `status` to `done`"* — missed repeatedly, and it is precisely the failure the mission list exists
  to prevent: a successor reading `in-flight` beside a `dispatched` locator would have re-dispatched
  finished work. Repaired before the archive was committed; the record now holds 19 items, each with
  exactly one status, all `done`, all carrying a `result`. Worth recording that while repairing it I
  reproduced the same duplicate-status mistake once more and had to re-audit — the format is easy to
  corrupt by hand, which is an argument that the transaction's own report is doing real work.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-976-977-978/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-976-977-978/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-976-977-978/.cache/doc-docking.md
- kaola-workflow/archive/bundle-976-977-978/.cache/doc-updater.md
- kaola-workflow/archive/bundle-976-977-978/.cache/docs.md
- kaola-workflow/archive/bundle-976-977-978/.cache/impl-976.md
- kaola-workflow/archive/bundle-976-977-978/.cache/impl-977.md
- kaola-workflow/archive/bundle-976-977-978/.cache/impl-978.md
- kaola-workflow/archive/bundle-976-977-978/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-976-977-978/.cache/premise-976.md
- kaola-workflow/archive/bundle-976-977-978/.cache/premise-977.md
- kaola-workflow/archive/bundle-976-977-978/.cache/premise-978.md
- kaola-workflow/archive/bundle-976-977-978/.cache/review-976.md
- kaola-workflow/archive/bundle-976-977-978/.cache/review-977.md
- kaola-workflow/archive/bundle-976-977-978/.cache/review-978.md
- kaola-workflow/archive/bundle-976-977-978/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-976-977-978/.cache/run-gaps.json
- kaola-workflow/archive/bundle-976-977-978/.cache/tests-976.md
- kaola-workflow/archive/bundle-976-977-978/.cache/tests-977.md
- kaola-workflow/archive/bundle-976-977-978/.cache/tests-978.md
- kaola-workflow/archive/bundle-976-977-978/finalization-summary.md
- kaola-workflow/archive/bundle-976-977-978/mission-list.md
- kaola-workflow/archive/bundle-976-977-978/workflow-state.md
