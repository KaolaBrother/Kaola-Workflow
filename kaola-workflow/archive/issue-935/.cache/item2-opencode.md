# Item 2 — opencode edition downstream surfaces (#935 / A6)

**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-935` (branch `workflow/issue-935`)
**Verification tier:** `tests-green` — `scripts/test-opencode-edition.js` (the edition's authored suite)
went RED→GREEN across the change, with `sync-opencode-edition.js --check` as the corroborating oracle.
**Not committed** (per brief).

## Files I changed — exactly two

| file | how | lines |
|---|---|---|
| `opencode.json` | **generated** by `sync-opencode-edition.js --write-config` — no hand-edit | +3 −1 |
| `docs/opencode-edition.md` | hand-edited prose (generator does not own it) | +4 −3 |

Everything else in `git status` belongs to other items/agents (see Scope, below).

---

## 1. Baseline (before anything)

Canonical frontmatter already carried `opus` for exactly 7 roles:

```
opus  adversarial-verifier
opus  build-error-resolver
opus  code-architect
opus  code-reviewer
opus  planner
opus  security-reviewer
opus  synthesizer
```

`node scripts/sync-opencode-edition.js --check` → **exit 1**

```
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write
```

`node scripts/test-opencode-edition.js` → **exit 1**

```
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write

opencode-edition test FAILED: D0[github]: .opencode is present on disk and has DRIFTED from canonical (sync --check exit 1).
Regenerate it deliberately: node scripts/sync-opencode-edition.js --forge=github --write
The suite stops here rather than continue into its own sync --write, which would repair this tree and erase the finding.
```

Both were red **solely** on the stale `opencode.json` (the check named 1 file), so the red/green
transition below is bound to the role-list content and nothing else.

## 2. Regeneration

```
$ node scripts/sync-opencode-edition.js --write-config
rewrote    opencode.json
sync-opencode-edition[github]: write complete (1 file(s) updated).
EXIT=0
```

The generator self-corrected from 5 → 7 with no help, as predicted. `roleTier()` (~line 144) maps
`opus`→reasoning and `reasoningRoles()` (~line 531) reads canonical frontmatter and sorts.

## 3. `opencode.json` — before / after, both places

**Prose comment (line 8) — BEFORE**

```
  //                               the reasoning roles: code-architect, code-reviewer, planner, security-reviewer, synthesizer.
```

**AFTER**

```
  //                               the reasoning roles: adversarial-verifier, build-error-resolver, code-architect, code-reviewer, planner, security-reviewer, synthesizer.
```

**Override stubs (lines 17-23) — BEFORE (5)**

```
  // "agent": {
  //   "code-architect": { "model": "<inherits your opencode default>" },
  //   "code-reviewer": { "model": "<inherits your opencode default>" },
  //   "planner": { "model": "<inherits your opencode default>" },
  //   "security-reviewer": { "model": "<inherits your opencode default>" },
  //   "synthesizer": { "model": "<inherits your opencode default>" }
  // }
```

**AFTER (7)**

```
  // "agent": {
  //   "adversarial-verifier": { "model": "<inherits your opencode default>" },
  //   "build-error-resolver": { "model": "<inherits your opencode default>" },
  //   "code-architect": { "model": "<inherits your opencode default>" },
  //   "code-reviewer": { "model": "<inherits your opencode default>" },
  //   "planner": { "model": "<inherits your opencode default>" },
  //   "security-reviewer": { "model": "<inherits your opencode default>" },
  //   "synthesizer": { "model": "<inherits your opencode default>" }
  // }
```

The whole diff is those two roles in those two places — 3 insertions, 1 deletion, nothing else moved.

## 4. Prose the generator does not own

### Changed: `docs/opencode-edition.md:122-124`

BEFORE

```
standard tier and `agent.<role>.model` overrides for the five reasoning-tier roles
(`code-architect`, `code-reviewer`, `planner`, `security-reviewer`, `synthesizer`). With nothing
set, every role inherits the model you already use.
```

AFTER

```
standard tier and `agent.<role>.model` overrides for the seven reasoning-tier roles
(`adversarial-verifier`, `build-error-resolver`, `code-architect`, `code-reviewer`, `planner`,
`security-reviewer`, `synthesizer`). With nothing set, every role inherits the model you already
use.
```

The brief named only the "five" at :122. **There was a second defect one line down** — :123 also
*enumerated* the five roles by name. Fixing the numeral alone would have left a wrong list. Roles are
in the generator's own sorted order, so doc and config now read identically.

### Every other hit found, and the ruling on each

Searched `docs/`, `README.md`, `install-opencode.sh`, `templates/`, `scripts/`, `plugins/`, and the
dot-directories **named explicitly** (`grep` here is ugrep and skips them); used `-P` for `\b`.

| location | text | action |
|---|---|---|
| `docs/opencode-edition.md:122` | "the five reasoning-tier roles" | **FIXED → seven** |
| `docs/opencode-edition.md:123` | enumerates the 5 roles by name | **FIXED → 7 roles** (not in the brief; found by grep) |
| `opencode.json:8` + `:17-23` | the 5-role list, twice | **FIXED by generator** |
| `README.md:370` | opencode model-pin paragraph | **no change** — names the env vars, states no count and no list |
| `README.md:152/:156` tier table, `:208-215` badge list | role→tier rows | **not mine** — already correct in the worktree from item 1 (A9); I did not touch README |
| `docs/opencode-edition.md:115` | "reasoning-tier roles on a different model" | **no change** — countless, still true |
| `install-opencode.sh` (7 hits) | reasoning-*effort* inheritance, config drift | **no change** — different subject (effort, not the model-pin role list); no count, no enumeration |
| `.opencode/`, `.opencode-gitlab/`, `.opencode-gitea/` | grepped explicitly by name | **no hit** — generated trees carry no role-count prose. (`kaola-workflow-hooks.js:53` "the five candidates" is about hook *directories*, unrelated) |
| `docs/audits/opencode-edition-audit.md`, `docs/decisions/D-544-01.md`, `docs/investigations/2026-08-03-opencode-inherited-effort-tiers-design.md` | `agent.<role>.variant` / `.options` | **no change** — the retired per-role *effort* machinery, not the model-pin list |
| `kaola-workflow/archive/issue-927/.cache/deletion-blast-radius.md:283`, `.../issue-927/.cache/docs.md:549` | "the five reasoning roles" | **no change — deliberate.** Archived run artifacts: a historical record of what was true then. Rewriting them would falsify the archive |
| `kaola-workflow/.roadmap/issue-935.md`, `kaola-workflow/ROADMAP.md` | say "opencode goes 5 to 7" | **no change** — the issue's own instruction, correct as written; ROADMAP is a generated mirror |
| `CHANGELOG.md` | Codex tier history | **no change** — historical entries; the `[Unreleased]` note is the orchestrator's call, not mine |

Final sweep for any surviving live "five…reasoning" claim returned **only** unrelated matches
(`reasoning_effort`, `reasoning_class`, "five candidates" hook dirs). No stale count remains.

## 5. Verification — every command, real exit codes

Exit codes taken **unpiped** (this repo's `${PIPESTATUS[0]}` gotcha: never gate on `cmd | tail`).

| # | command | exit | result |
|---|---|---|---|
| 1 | `node scripts/sync-opencode-edition.js --check` (before) | **1** | PARITY FAILED — opencode.json stale |
| 2 | `node scripts/test-opencode-edition.js` (before) | **1** | D0[github] DRIFTED |
| 3 | `node scripts/sync-opencode-edition.js --write-config` | **0** | `rewrote opencode.json` |
| 4 | `node scripts/sync-opencode-edition.js --check` (after) | **0** | see below |
| 5 | `node scripts/test-opencode-edition.js` (after) | **0** | 516 assertions |
| 6 | `npm run test:kaola-workflow:editions` (opencode + kimi) | **0** | 516 + 507 assertions |

**#4 exact output**

```
sync-opencode-edition[github]: 14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical.
```

**#5 exact output (second, settled run)**

```
D0: .opencode is present and in parity with canonical.
D0: .opencode-gitlab is present and in parity with canonical.
D0: .opencode-gitea is present and in parity with canonical.
opencode-edition test passed (516 assertions). [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]
```

**#6 — additional entry point, found as instructed.** `package.json:45` declares
`test:kaola-workflow:editions` = `test-opencode-edition.js && test-kimi-edition.js`. Ran it whole:

```
opencode-edition test passed (516 assertions). [drift-check: 3 tree(s) in parity (...)]
kimi-edition test passed (507 assertions). [drift-check: NO tree verified; 3 ABSENT, not checked (.kimi, .kimi-gitlab, .kimi-gitea)]
```

Kimi is unaffected by this item (no tier axis) and stayed green.

## 6. Scope

```
$ git diff --stat -- opencode.json docs/opencode-edition.md
 docs/opencode-edition.md | 7 ++++---
 opencode.json            | 4 +++-
 2 files changed, 7 insertions(+), 4 deletions(-)
```

`git status --short` (whole worktree — most of it is **other agents'** work):

```
 M README.md                                                    <- item 1 (A9)
 M agents/adversarial-verifier.md                               <- item 1
 M agents/build-error-resolver.md                               <- item 1
 M docs/opencode-edition.md                                     <- MINE
 M install.sh                                                   <- item 1 (A5)
 M opencode.json                                                <- MINE (generated)
 M plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js    <- item 1 (A3)
 M plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js   <- item 1 (A3)
 M plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js          <- item 1 (A3)
 M scripts/generate-reviewer-profiles.js                        <- item 1 (A1)
 M scripts/kaola-workflow-resolve-agent-model.js                <- item 1 (A3)
 M scripts/test-agent-model-resolver.js                         <- concurrent TEST AUTHOR (A8)
```

Constraint confirmations:

- **No test file touched.** `scripts/test-agent-model-resolver.js` is the concurrent test author's
  in-progress A8 work, present before I started and untouched by me. I ran tests, never wrote one.
- **No `agents/*.md` touched.** Both entries predate my work (item 1's A1/A2).
- **`opencode.json` not hand-edited** — its only write was `--write-config`, which self-reported
  `1 file(s) updated`.
- **Resolver copies untouched.** All four still hash `49e8c1fc646f`, exactly the brief's value:
  `shasum -a 256 scripts/… plugins/*/scripts/… | cut -c1-12 | sort -u` → single line `49e8c1fc646f`.
- **opencode not added to `npm test` or `install.sh`.**

---

## Findings, surprises, and what I could not verify

**1. FINDING (defect, not fixed — outside my scope). `--check`'s remediation footer sends you to a
flag that cannot fix the failure it just reported.** On any mismatch, `sync-opencode-edition.js:870`
unconditionally prints:

```
Fix: node scripts/sync-opencode-edition.js --forge=github --write
```

But for a stale-`opencode.json` mismatch that advice is wrong, confirmed by source read at :661-666 —
`--write` (force=false) sees the file exists and prints `preserve opencode.json (user-owned; use
--write-config to overwrite)`, returning without rewriting. An operator following the footer would
re-run `--check` and still be red, with no new information. The per-mismatch `reason` at :865 is
correct ("regenerate via --write-config"); only the generic footer misleads. This is exactly the trap
the brief pre-warned me about, which suggests it has already cost someone time. Recommend a
conditional footer. **I did not change it** — not in my scope, and the file may be in flight for
another item.

**2. SURPRISE: the edition suite has a side effect that changes its own second run.** First run
reported `.opencode-gitlab` and `.opencode-gitea` as `SKIPPED — absent from disk`; the second run
reported both `present and in parity`. The suite materializes those forge trees as it runs. Both are
gitignored (`.gitignore:9 .opencode-*/`, `:5 .opencode/`) and `git status --ignored` confirms `!!`,
so **no worktree pollution** — but it means *a single suite run does not verify the gitlab/gitea
trees on a fresh clone*, and the drift-check banner ("NO tree verified" vs "3 tree(s) in parity")
depends on run order, not on correctness. Anyone reading a one-run banner as coverage would be wrong.
The same shape is visible in the kimi run above, which reported all 3 trees ABSENT/not checked.

**3. The red→green transition is a genuine mutation proof, not just a green suite.** I did not have
to construct one: the pre-state was already the mutant (5-role config against 7-role canonical), both
the oracle and the suite named it, and the only delta applied was the regeneration. So the guard at
`sync-opencode-edition.js:864-866` is demonstrably armed against this exact drift.

**Could not verify / out of scope:** whether an *installed* opencode config on this machine
(`~/.config/opencode/…`) also carries the 5-role scaffold. `install-opencode.sh` preserves an existing
user `opencode.json` and only `--adopt-config` rewrites it, so a previously-installed config will keep
the stale 5-role comment until reinstall+adopt. That is a reinstall-time concern (A10) and I did not
run any installer. Flagging it so the reinstall step knows the plain reinstall may not refresh it.
