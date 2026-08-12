# impl #960 — module half: `scripts/run-chain-pool.js` deleted

Branch `workflow/bundle-956-957-958-959-960-961-962`, worktree
`.kw/worktrees/bundle-956-957-958-959-960-961-962`. Test-file half (`scripts/test-parallel.js`)
belongs to the concurrent tdd-guide agent and was **not touched**.

## Verification tier

**build-green** — `node --check` on both edited JS files, green before and after, plus the
zero-reference sweeps below. No suite was run: the brief forbids it while `test-parallel.js` is
mid-edit by another agent, and suite verification is the orchestrator's after both halves land.

## Files changed

| file | change |
|---|---|
| `scripts/run-chain-pool.js` | **deleted** (`git rm`), 428 lines |
| `scripts/test-suite-registration.js:205-206` | comment reword — dropped the dead `COST_HINT` name |
| `scripts/simulate-workflow-walkthrough.js:47-50` | comment reword — "chain pool" now named as retired; **code untouched** |
| `CHANGELOG.md` | one entry under the existing `## [Unreleased]` → `### Removed` |

## Premise re-check — every stated fact held

Re-ran each in the worktree before cutting; none refuted.

- 428 lines, `SHARDED_SUITES = {}` at line 68 — both confirmed verbatim.
- Tracked stem sweep (`git grep -nP 'run-chain-pool|runChainPool|chain-pool|chainPool|chain_pool'`):
  the module's own self-references, `scripts/test-parallel.js:349`, and nothing else that is code —
  the rest is `docs/audits/`, `kaola-workflow/.roadmap/issue-960.md`, `ROADMAP.md` and archives, all
  mentions.
- `package.json`: `bin` is `undefined`; zero of the `scripts` entries match the stem (checked by
  parsing the JSON, not grepping the file).
- Installers: `install.sh` `install-all.sh` `install-opencode.sh` `install-kimi.sh` `uninstall.sh`
  → 0 each. Positive control on the same loop: `install.sh` returns 2 for `adaptive-schema`, so the
  zeros are measurements, not a broken command. (The `MISSING` lines in my first capture were
  `grep -c` exiting 1 on zero matches, not absent files — all five exist, verified by `ls`.)
- Name census, whole worktree excluding `.git`: exactly one file before the cut, zero after.
  No plugins copy, no dot-tree copy. Installed layouts (`~/.claude`, `~/.codex`,
  `~/.config/opencode`): 0.
- All six `readdirSync`-over-`scripts/` enumerators located and their filters read:
  `simulate-workflow-walkthrough.js:12022` and `test-route-reachability.js:770`
  (`^sync-[a-z0-9-]+-edition\.js$`), `test-kernel-conformance.js:208,603`
  (`^kaola-workflow-[a-z0-9-]+\.js$`), `test-kimi-edition.js:1287` /
  `test-opencode-edition.js:1829` (FA9, installed set == manifest set, which never carried it).
  None can match this filename.

## The two prose rewords

**`scripts/test-suite-registration.js:205`** — the sentence is load-bearing (it states check G's
scope boundary: only the npm `scripts` table is validated, deliberately no other), so only the dead
name was dropped:

- was: `the COST_HINT and ceiling tables were considered and left alone`
- now: `the spawn-classification ceiling table was considered and left alone`

`COST_HINT` lived at `run-chain-pool.js:96` and dies with it. The ceiling table is
`CEILINGS` at `scripts/test-spawn-classification.js:65` — a live, path-keyed table — so the
surviving half of the sentence still names something real, and the "no failure observed there"
justification is unchanged.

**`scripts/simulate-workflow-walkthrough.js:47-50`** — the comment did explicitly say "when this
suite runs inside a concurrent chain pool ... the runner exports `KAOLA_TEST_TIMEOUT_SCALE`", which
after the cut describes a producer that does not exist. Reworded to state that nothing exports it
now, the read is fail-open and the scale is therefore 1. **The code line was left exactly as it
was** (`Math.max(1, Number(process.env.KAOLA_TEST_TIMEOUT_SCALE) || 1)`) — removing it would be a
behaviour change outside this issue. Confirmed the pool was the sole producer: after the delete,
the only two remaining sites in the tree are the reader and this comment.

## CHANGELOG line

Added as the first bullet of the existing `## [Unreleased]` → `### Removed` (that section already
existed, created by the concurrent #961 work; I anchored inside it rather than adding a second
header — verified exactly one `### Removed` in `[Unreleased]`):

> - **`scripts/run-chain-pool.js`, a 428-line within-chain step pool that nothing ever scheduled —
>   #960.** No chain, npm script, CLI entry point or installer invoked it, and its shard registry was
>   an empty object; its only consumer was the `--self-test` section of `scripts/test-parallel.js`,
>   removed with it. The walkthrough's `KAOLA_TEST_TIMEOUT_SCALE` reader is fail-open and stays, now
>   permanently at the pre-pool bound.

## Verification commands

| command | exit | result |
|---|---|---|
| `node --check scripts/test-suite-registration.js` (before / after) | 0 / 0 | green both sides |
| `node --check scripts/simulate-workflow-walkthrough.js` (before / after) | 0 / 0 | green both sides |
| `git grep -n 'run-chain-pool' -- scripts/ plugins/ package.json install.sh` | 1 | **zero hits** |
| `git grep -nP 'run-chain-pool\|runChainPool\|chainPool\|chain_pool' -- scripts/ plugins/ package.json '*.sh' hooks/ commands/ agents/ templates/` | 1 | **zero hits** |
| `git grep -n 'COST_HINT' -- scripts/ plugins/ package.json` | 1 | **zero hits** |
| `find . -path ./.git -prune -o -name '*chain-pool*' -print` | 0 | no output — no copy left |

**Before**: `scripts/run-chain-pool.js` present (428 lines); one live `require` at
`test-parallel.js:349`; both edited files syntactically green.
**After**: module gone; zero stem references on every code/config surface; both edited files
syntactically green.

## Notes for the orchestrator

1. **The other half has already landed in the tree.** `scripts/test-parallel.js` shows zero stem
   hits, so the tdd-guide agent's line-349 require and f6–f9 removal are in the working tree. I am
   reporting the state I measured, not certifying their work — I did not read their diff and did
   not touch the file.
2. **I edited comments inside two test files.** `test-suite-registration.js` and
   `simulate-workflow-walkthrough.js` are both test artifacts. The brief handed both to me
   explicitly with a reason; the edits are prose-only, and no assertion, fixture, threshold or
   control was changed. Flagging it so custody is visible rather than implicit.
3. **The main tree still holds `scripts/run-chain-pool.js`.** That is the pre-bundle checkout, per
   premise §6 — it goes when the branch lands, and is not a missed copy.
4. `git status --short` at hand-off carried other agents' concurrent work
   (`docs/architecture.md`, `docs/conventions.md`, both `kaola-workflow-install-manifest.js`
   copies, `scripts/fixtures-orphan-legality.js`, `scripts/test-parallel.js`). Mine are exactly the
   four in the table above.

— implementer · #960 module half · 2026-08-12
