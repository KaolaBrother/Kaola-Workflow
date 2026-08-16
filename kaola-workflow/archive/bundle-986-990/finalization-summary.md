# Finalization — Summary: bundle-986-990

Issues: **#986** (ADR 0018 §8 step 6 — consumer migration) and **#990** (`plantRoadmapIssue` name).
Branch `workflow/bundle-986-990`, implementation commit `df70e9c7`.

## Delivered

**#986 — `/workflow-init` gains a legacy-backlog reconcile pass.** ADR 0018 steps 1–5 retired the
local backlog layer and deliberately kept migration out of the upgrade; that left a consumer holding
tracked files nothing reads, with no path off them and no owner for that path. Init now owns it: a
new `## Step 5 — Legacy Backlog Layer` (unnumbered on skill surfaces) that **diagnoses read-only,
reports, asks, and acts only on the answer**.

Against the issue's four acceptance criteria:

- *Migrated in one movement that never passes through the sink-bricking state* — the Act sequence
  makes deletion one movement and names the two commands that produce a halfway state, both
  forbidden.
- *Residue diff run; only genuinely homeless content posted back, on the issues it belongs to* —
  the Report's residue clause tells the reader to resolve each fact against the whole tracker rather
  than the issue it was filed under, which is the sampling error ADR 0018's own method note records
  as having corrected the record twice.
- *Owner shown the `CLAUDE.md` and `_rules.md` edits the tool cannot make, and decides* — quoted with
  a proposed replacement and explicitly not edited.
- *Declining leaves the repo working* — the closing paragraph says so, and it is measured, not
  asserted: see Test Coverage.

**#990 — the walkthrough's `plantRoadmapIssue` is now `seedClassifierVerdictFromBody`,** with its
dead `root` parameter dropped. The issue framed this as #988's inert-fixture question asked again;
it is answered the other way, because a name asserts at 42 call sites without the body ever being
read, and it had already cost one wrong-turn investigation during #987. The reasoning is on the
issue as a comment, which is what the issue asked for whichever way it went.

## Files Changed

16 files in `df70e9c7` (+401 / −65).

- Authored: `templates/routing/init.skeleton.md`, `templates/routing/slots.js`,
  `templates/routing/required-blocks.js`
- Generated from those: `commands/workflow-init.md` and five plugin command/SKILL surfaces
  (plus the gitignored `.opencode*` / `.kimi*` trees, refreshed by the same `--write`)
- Renamed through: `scripts/simulate-workflow-walkthrough.js`,
  `scripts/test-forge-finalize-findings.js`, `scripts/test-forge-bundle-lane.js`
- Docs: `CHANGELOG.md`, `docs/api.md`, `docs/architecture.md`,
  `docs/decisions/0018-the-forge-is-the-backlog.md`

## Test Coverage

- **Full-scope walkthrough: 184/184 scenarios, exit 0** — shard header `{"index":1,"total":1}`, so
  the whole suite, not the fast gate's rotating 1/12.
- `test-route-reachability.js`: 331 assertions over 228 obligated file-checks.
- `generate-routing-surfaces.js --check`: all 18 surfaces byte-match the skeleton.
- Additive editions, whose surfaces this diff regenerates: opencode 663 assertions, kimi 627 — both
  with the drift-check **armed**, each resolving its tree root to the main checkout and reporting 3
  trees in parity. The known fresh-worktree vacuity trap did not fire here.
- **The new guard is mutation-proven, not merely green.** Gutting one span of the migration section
  — the halfway rule, `Never \`git rm --cached\`, and never delete from disk alone.` — while leaving
  the `<!-- PIN: backlog-migration -->` marker and the other three spans intact reds three surfaces
  by name (`commands/workflow-init.md`, `.opencode/command/workflow-init.md`,
  `.kimi/skills/workflow-init/SKILL.md`). Restoring returns it to 331 green.
- **The migration section's four diagnose commands were run, not just written** — on this repo,
  which carries no legacy layer and is therefore the common case they must survive. None hangs on
  empty input; all exit 0.
- **#986's premise was verified before building on it**: zero reads of `.roadmap/issue-*.md` or
  `ROADMAP.md` content survive in `scripts/`, and the four installers carry zero `roadmap` matches,
  so "install.sh leaves the backlog layer untouched" was already true and needed nothing built.

**Test custody deviation, stated rather than hidden.** Subagents were declined for this run, so the
actor that placed the `backlog-migration` marker also authored its `required-blocks.js` entry — ADR
0018 §8 step 3 assigns that entry to whoever did not place the markers. The mutation proof above is
the substituted evidence, and it is the stronger of the two: it shows the guard is armed rather than
merely present.

## Validation

Four-chain receipt at `kaola-workflow/bundle-986-990/.cache/chain-receipt.json`, bound to
`headSha df70e9c7611c9513b97deeee73557eb1a35ee848` = HEAD exactly.

| chain | exit | signal | timed out | accepted red | duration |
|---|---|---|---|---|---|
| claude | 0 | null | false | false | 459s |
| codex | 0 | null | false | false | 11s |
| gitlab | 0 | null | false | false | 90s |
| gitea | 0 | null | false | false | 87s |

Green, **no chain waived**. Selection `{"decision":"all-four","reason":"edition_coupling"}` against
base `8d6c3db7` over 16 changed files — the diff touches both plugin editions' init surfaces, so the
producer correctly fanned out to all four rather than running `claude` alone. Each chain's own exit
code is read from the receipt above rather than inferred from the wrapper's.

## Changed Paths

Per the finalize transaction's own report (see the envelope). The 16 authored paths are listed under
Files Changed; nothing outside them was staged, and no other project's workflow state was touched.

## Mission List

Six items, all `done`, at `kaola-workflow/bundle-986-990/mission-list.md`: measure step 6's real
scope · build the migration section · register its manifest entry · settle #990 · dock the docs ·
verify. Every item was `dispatched: self` — subagents were declined for this run, and the mission
list records that at each dispatch rather than retroactively.

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. Init's contract changed, so `docs/api.md` and
`docs/architecture.md` both name the reconcile pass; ADR 0018's status line moves off "step 6 is not
done" and states precisely that **what shipped is the capability, and no consumer has been migrated
through it**. `README.md` recorded as no-impact by reading every `workflow-init` hit in it: they are
install lines and overview captions, none of which enumerates the command's steps. Explicit
no-impact reasons also recorded for `docs/conventions.md`, `docs/workflow-state-contract.md`,
`docs/README.md`, `.env.example` and the project `CLAUDE.md`.

## Run gaps

- manual:finalize-stages-roadmap-dir (finalize's `git add -A -- kaola-workflow/.roadmap` stages every change under that directory): filed: #991

## Follow-Up Items

- **#991** (P3, filed this run) — the gap above. Filed with its reachability caveat stated: it was
  found by reading `claim.js:4856`, not by running a finalize over a part-way-deleted `.roadmap/`, so
  the issue explicitly permits closing with no code and warns against narrowing the pathspec before
  checking what the breadth covers.
- **No consumer has been migrated.** #986 ships the capability; migrating `VRPCadCore` — the repo
  every ADR 0018 §1 figure was measured on, 82 tracked files / 287,087 bytes — remains an act its
  owner has to consent to, one repo at a time. That is the design, not an omission.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-986-990/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-986-990/.cache/doc-docking.md
- kaola-workflow/archive/bundle-986-990/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-986-990/.cache/run-gaps-manual.md
- kaola-workflow/archive/bundle-986-990/.cache/run-gaps.json
- kaola-workflow/archive/bundle-986-990/finalization-summary.md
- kaola-workflow/archive/bundle-986-990/mission-list.md
- kaola-workflow/archive/bundle-986-990/workflow-state.md
