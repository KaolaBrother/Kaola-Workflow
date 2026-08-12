# Impl record — #962 S3 / S4 / S6 (sync-script subtractions)

**Task:** three subtractions from issue #962 — S3 (six dead `transformCommandBody` strip blocks),
S4 (two uncalled CLI modes in `runtime-edition-forge.js`), S6 (six dead symbols, the filed three
plus the three of the identical class the audit's name-keyed sweep missed).

**Verification tier: `regression-green`** — the two edition suites green before AND after, plus a
render-level A/B proving byte-identical generated output with a live positive control.

**Work tree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-956-957-958-959-960-961-962/`
on branch `workflow/bundle-956-957-958-959-960-961-962`. The main tree was never written to (its
`git status` for these three paths is empty; the render ran with `REPO` resolved to the worktree —
confirmed by `--scripts-dir` printing the worktree path).

## Files changed (exactly three)

| file | before | after | net |
|---|---:|---:|---:|
| `scripts/sync-opencode-edition.js` | 1016 | 956 | −60 |
| `scripts/sync-kimi-edition.js` | 870 | 836 | −34 |
| `scripts/runtime-edition-forge.js` | 167 | 151 | −16 |

No test file was touched (`git status` for `scripts/test-opencode-edition.js` and
`scripts/test-kimi-edition.js` is empty). No doc changed — see "doc debt" below.

## Exact line ranges removed (old-file numbering, from `git diff -U0` hunk headers)

`scripts/sync-opencode-edition.js`
- **74–75** — S6: `const OUT_HOOKS_DIR`, `const OUT_PLUGINS_DIR` (2)
- **458–501** — S3: Path Intent block **458–483** (26, incl. lead comment) + Codex-note block
  **484–501** (18) — contiguous, cut as one hunk (44)
- **525–535** — S3: Step 0a-1 comment + `text.replace(/ \(Step 0a-1\)| or Step 0a-1/g, '')` (11)
- **1009–1011** — S6: `// Legacy aliases …` comment + `DEFAULT_STANDARD_MODEL` + `DEFAULT_REASONING_MODEL` (3)
- **1013** modified — S6: export list, dropped `OUT_HOOKS_DIR, OUT_PLUGINS_DIR`

`scripts/sync-kimi-edition.js`
- **61–62** — S6: `const OUT_SKILLS_DIR`, `const OUT_HOOKS_DIR` (2)
- **452–477** — S3: Path Intent block **452–465** (14) + Codex-note block **466–477** (12) — contiguous (26)
- **517–522** — S3: Step 0a-1 comment + replace (6)
- **868** modified — S6: export list, dropped `OUT_SKILLS_DIR, OUT_HOOKS_DIR`

`scripts/runtime-edition-forge.js`
- **29**, **32** — S4: the two doc-comment lines
- **117**, **120** — S4: the two `else if` arms
- **129** modified — S4: usage string now `' (--scripts-dir|--out-suffix)\n'`
- **138** — S4: the `forges` dispatch
- **141–151** — S4: the `commands-dir` block (11)
- total 15 deleted + 1 modified

**S3 total = 55 (opencode) + 32 (kimi) = 87 lines — exactly the premise's count.** Each block was
cut on its anchor text via an exact-match edit (the edit fails unless the block matches verbatim and
uniquely), not on line numbers; the premise's start lines for four of the six blocks were off by one
(they excluded the first line of the lead comment) while its per-block counts were right.

`commandSources()` **kept** — verified live at `sync-kimi-edition.js:117,121` and
`sync-opencode-edition.js:162,166`, and still exported. `stripCardModelPlaceholders`,
`assertModelDispatchAnchorMatched`, `assertNoModelDispatchResidue` untouched.

## Byte-identity proof (S3)

Rendered `--write` × 3 forges × 2 sync scripts = 6 runs per leg, all exit 0, all stderr 0 bytes.
Snapshot excludes `.opencode/node_modules` only (the generator provably cannot reach it —
`retiredCopiedFiles` is single-directory, non-recursive, extension-scoped; comment at
`sync-opencode-edition.js:758-761`).

| tree | files | `diff -r` before vs after |
|---|---:|---|
| `.opencode` | 22 | exit 0, 0 bytes |
| `.kimi` | 19 | exit 0, 0 bytes |
| `.opencode-gitlab` | 19 | exit 0, 0 bytes |
| `.opencode-gitea` | 19 | exit 0, 0 bytes |
| `.kimi-gitlab` | 19 | exit 0, 0 bytes |
| `.kimi-gitea` | 19 | exit 0, 0 bytes |

117 files per leg, equal and nonzero (capture proven complete). `cmp` on `opencode.json`: exit 0
(the seeder skips an existing file, so it was never rewritten and stayed off `git status`).

**Positive control (against vacuous equivalence).** With the S3 cut in place I additionally removed
one *live* transform — `text.replace(/--runtime claude\b/g, '--runtime opencode')`, anchor asserted
to match exactly once — re-rendered the three opencode trees and diffed against the same baseline:
**exit 1 in all three, differing in exactly one file each**
(`.opencode/command/workflow-next.md`, `.opencode-gitlab/…`, `.opencode-gitea/…`) and nowhere else.
The harness detects change, so the zero-diff above is a real result. The control was applied to a
`cp` backup and restored with `cmp` exit 0 (never `git checkout --`, which would have destroyed
other agents' concurrent edits); re-rendering after the restore reproduced the baseline trees
byte-for-byte (`diff -r` exit 0, 0 bytes, all three).

## Suite results (real exit codes, never gated on a pipe)

| run | command | exit | assertions |
|---|---|---:|---|
| **before** | `node scripts/test-opencode-edition.js` | **0** | 563, drift-check 3 trees in parity |
| **before** | `node scripts/test-kimi-edition.js` | **0** | 521, drift-check 3 trees in parity |
| **after** | `node scripts/test-opencode-edition.js` | **0** | 563, drift-check 3 trees in parity |
| **after** | `node scripts/test-kimi-edition.js` | **0** | 521, drift-check 3 trees in parity |

Assertion counts identical before and after — no assertion was dropped or skipped. A22 (which
asserts the *absence* of the three stripped patterns in generated output) stays green, unedited.

Also run after the change: `node --check` on all three files (ok); `--check` idempotency for all six
trees (`sync-opencode-edition.js --forge={github,gitlab,gitea} --check` and the kimi twin — **all
exit 0**).

Per the brief, `npm test` and the four chains were **not** run (other agents editing concurrently).

## S4 — CLI behaviour verified directly

- Live modes still work, for all three forges: `--out-suffix` → `''`/`-gitlab`/`-gitea` (exit 0);
  `--scripts-dir` → the correct absolute dirs (exit 0). These are the only two the installers call
  (`install-kimi.sh:113,117`, `install-opencode.sh:143,147`).
- Removed modes now take the unknown-argument path: `--commands-dir` and `--forges` each print
  `runtime-edition-forge: unknown argument "…"` and **exit 2** (previously exit 0 with output).
  Nothing calls them, so this is a behaviour change with no caller.
- Usage line with no mode: `--forge=<github|gitlab|gitea> (--scripts-dir|--out-suffix)`, exit 2.
- Module surface intact: `commandSources('github')` returns 3; exports are
  `REPO, FORGES, UNKNOWN_FORGE, assertForge, pluginDirName, outSuffix, forgeScriptsDir,
  selfDevScriptsDir, scriptName, commandSources`.

## Per-symbol zero-consumer confirmation (all six S6 names, re-run per-file before deleting)

Method: (a) `git grep -F -n` over the tracked tree with `':!kaola-workflow/archive' ':!CHANGELOG.md'`;
(b) a Node sweep over **3554** enumerated files across all seven dot trees (`.opencode`,
`.opencode-gitlab`, `.opencode-gitea`, `.kimi`, `.kimi-gitlab`, `.kimi-gitea`, `.codex`;
node_modules included), substring match, no `head`/`tail`, no `xargs`. Sweep positive control:
`kaola-workflow` → 114 files / 697 hits, so the sweep genuinely reads content.

| symbol | file | tracked hits | consumers | dot trees |
|---|---|---|---|---|
| `DEFAULT_STANDARD_MODEL` | opencode | 1 (`:1010`, the export line) | **0** | 0 |
| `DEFAULT_REASONING_MODEL` | opencode | 1 (`:1011`) | **0** | 0 |
| `OUT_SKILLS_DIR` | kimi | 2 (`:61` def, `:868` export) | **0** | 0 |
| `OUT_HOOKS_DIR` | kimi | 2 (`:62` def, `:868` export) — **kimi-only lines** | **0** | 0 |
| `OUT_HOOKS_DIR` | opencode | 2 (`:74` def, `:1013` export) — **opencode-only lines** | **0** | 0 |
| `OUT_PLUGINS_DIR` | opencode | 2 (`:75` def, `:1013` export) | **0** | 0 |

The `OUT_HOOKS_DIR` name-collision trap the brief warned about reproduced exactly: the name-keyed
grep returns 4 hits across two files, and each file's pair is definition + its own export entry —
neither file reads the other's. Split per file, each is a clean zero.

Live originals kept and re-confirmed: `ENV_STANDARD_MODEL`/`ENV_REASONING_MODEL` (read at
`sync-opencode-edition.js:589-590`), `OUT_AGENT_DIR`/`OUT_COMMAND_DIR` (5 consuming sites each in
`test-opencode-edition.js`), `OPENCODE_JSON` (`:695,699,942`). Post-cut sweep of all six dead names
over `scripts/`: **git grep exit 1 — all gone**; the live names still resolve.

## S3 trigger re-measurement (independent of the premise)

Read the 9 real render inputs through `forgeLayout.commandSources()` for all three forges and counted
each trigger pattern: `PathIntentHeading=0 CodexNote=0 Step0a1=0` on **9/9** sources. Positive
control on the same 9 files (substring `kaola`): 9/9 present. Dot-tree sweep: `Path Intent`,
`Codex hooks note:`, `Step 0a-1` → 0 files, 0 hits across 3554 files.

## Contradictions and findings

1. **Premise line ranges are off by one at the start for four of the six S3 blocks** (opencode Path
   Intent is 458–483 not 459–483; opencode Codex-note 484–501 not 485–501; kimi Path Intent 452–465
   as filed is correct on start; kimi Codex-note 466–477 correct). Every *count* was right and the
   total 87 reproduced exactly. Cutting on anchors rather than numbers is what caught it — cutting on
   the filed numbers would have orphaned a comment line into each of two hunks.
2. **The main tree's four non-github edition trees are STALE** — pre-existing, not caused by this
   change, out of my scope, and confined to gitignored artifacts. `main/.opencode-gitlab/agent/code-architect.md`
   (and the gitea/kimi siblings, 3 agent surfaces each) still carries the line
   `- choose the simplest architecture that meets the requirement`, which **canonical
   `agents/code-architect.md` no longer has** and which `main/.opencode/agent/code-architect.md`
   (github) correctly lacks. So main's github trees are current and its gitlab/gitea/kimi-forge
   trees are one canonical edit behind. This does not touch the A/B: both legs were full re-renders
   from the same worktree canonical, so the staleness is present in neither. Worth someone running
   `--write` for the non-github forges in the main tree before any install from it.
3. **Doc debt: none owed by this change, but flagging what I did not write.** No README/`docs/api.md`
   mention of any removed symbol or flag exists (grep exit 1). The only surviving references to
   `--commands-dir`/`--forges` are the audit record `docs/audits/2026-08-11-subtraction-audit.md:64`
   and the issue/roadmap rows for #962 itself, which are history/backlog rather than live contract.
   I wrote **no CHANGELOG entry** — `CHANGELOG.md` is outside my three-file scope and was being
   edited concurrently; the bundle-level entry is the orchestrator's.
4. **Recorded observation 1 in the premise narrows as predicted.** With the S3 cut landed, the three
   section/residue triggers no longer exist, so the unobserved-over-strip exposure in these two
   scripts is now `stripCardModelPlaceholders` alone. No mechanism built (nothing observed to force
   one) — noting it because the watch-list wording in `premise-962.md` references the pre-cut state.

## Verification commands (all exit codes real)

```
node scripts/test-opencode-edition.js                    # before: 0    after: 0
node scripts/test-kimi-edition.js                        # before: 0    after: 0
node scripts/sync-opencode-edition.js --forge=F --write   # F in {github,gitlab,gitea}: 0,0,0 both legs
node scripts/sync-kimi-edition.js --forge=F --write       # 0,0,0 both legs
node scripts/sync-opencode-edition.js --forge=F --check    # after: 0,0,0
node scripts/sync-kimi-edition.js --forge=F --check        # after: 0,0,0
diff -r <before>/<tree> <after>/<tree>                     # 6 trees: exit 0, 0 bytes each
cmp <before>/opencode.json <after>/opencode.json           # 0
node --check scripts/{sync-opencode-edition,sync-kimi-edition,runtime-edition-forge}.js  # 0,0,0
git grep -F -e DEFAULT_STANDARD_MODEL … -- scripts/        # after: 1 (no matches)
```

Render logs, before/after/control/restored tree snapshots and all diff outputs are under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/cbc61aa2-7a04-4ceb-9b2b-ff62797e69c7/scratchpad/`.

**Note on the worktree:** the six edition trees were copied in from the main tree (read-only copy) to
run the suites, then regenerated in the worktree by `--write`. They are gitignored, so they will not
be committed; the main tree's copies were never moved, modified or deleted.
