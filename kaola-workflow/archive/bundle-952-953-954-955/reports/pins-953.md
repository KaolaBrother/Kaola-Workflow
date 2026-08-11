# #953 — parity guard pins: mutation proof

**Artifact authored:** `scripts/test-agent-profile-parity.js` — three `ROLE_PINS` entries added
(`planner`, `code-architect`, `implementer`), pinning the frozen sentence:

    Reuse or extend an existing mechanism before writing a second one.

No production file touched. Nothing committed.

## Baseline

- **commit:** `483a5e5e0071207bf93fae5f1f22f39c2a4e7e9c` (branch `workflow/bundle-952-953-954-955`,
  worktree clean at start of this task)
- **guard before the pins:** `node scripts/test-agent-profile-parity.js` →
  `agent-profile parity tests passed (784 assertions)`, exit 0
- **prose state at baseline:** the pin sentence appears in **zero** files under `agents/` and
  `plugins/*/agents/` — the implementer had not yet landed it, so all four legs were constructed
  from a known-absent starting state rather than by undoing someone else's edit.

### The seam, verified independently (not taken on report)

`agents/code-architect.md:40-41` carries two minimalism rules:

```
- choose the simplest architecture that meets the requirement
- avoid speculative abstractions unless the repo already uses them
```

`grep -rn` over `agents/` and `plugins/*/agents/` returns **exactly one hit each** — the canonical
`.md`. Both are over `MIN_RULE_CHARS` (58 and 63 normalized chars), so they are well-formed rule
units; they are carried by 1 of 11 hand-maintained profiles, which is below the 8/11 consensus
threshold, so the derivation never made them mandatory and no `.toml` twin was ever asked for them.
That is the exact failure mode the three new pins close.

## Mutation proof — scratch mirror

Mirror root: `/private/tmp/.../scratchpad/pinmirror/{base,leg2,leg3,leg4}`, each a `cp -R` of
`scripts agents plugins templates` from the worktree (which carries the new pins). The real tree was
never mutated to build a leg; no `git checkout --` was used.

### LEG 1 — pins added, sentence absent from the canonical `.md` files

Command (in `pinmirror/base`):

```
node scripts/test-agent-profile-parity.js
```

**Expected:** exit 1, failing by NAME on the presence-first check.
**Actual:** exit 1, 3 failures / 787 passed.

```
FAIL: role pin "Reuse or extend an existing mechanism before writing a second one." is NO LONGER in agents/planner.md — a pin that matches nothing enforces nothing; repair it to the current wording or delete it with its mechanism
FAIL: role pin "Reuse or extend an existing mechanism before writing a second one." is NO LONGER in agents/code-architect.md — ...
FAIL: role pin "Reuse or extend an existing mechanism before writing a second one." is NO LONGER in agents/implementer.md — ...
agent-profile parity tests FAILED (3 failures, 787 passed)
```

Assertion arithmetic checks out: 790 total = 784 baseline + 3 pins x 2 presence assertions. The nine
twin assertions are correctly *not* reached — presence-first `continue`s once the source is missing,
so the guard does not claim a `.toml` obligation it has just proved has no source.

### LEG 2 — rule in all 3 `.md`, absent from all 9 `.toml`

The frozen markdown block appended to `agents/{implementer,code-architect,planner}.md` on the mirror;
no `.toml` touched (`grep -rl` over `plugins/` returns nothing).

```
cd pinmirror/leg2 && node scripts/test-agent-profile-parity.js
```

**Expected:** exit 1, 9 failures, one per plugin-tree file, each naming the missing sentence.
**Actual:** exit 1, **9 failures / 799 passed** — exactly one per file, all nine named:

```
FAIL: role pin "Reuse or extend an existing mechanism before writing a second one." is in agents/planner.md but MISSING from plugins/kaola-workflow/agents/planner.toml (md↔toml drift — mirror the rule into the .toml twin)
FAIL: ... agents/planner.md but MISSING from plugins/kaola-workflow-gitlab/agents/planner.toml
FAIL: ... agents/planner.md but MISSING from plugins/kaola-workflow-gitea/agents/planner.toml
FAIL: ... agents/code-architect.md but MISSING from plugins/kaola-workflow/agents/code-architect.toml
FAIL: ... agents/code-architect.md but MISSING from plugins/kaola-workflow-gitlab/agents/code-architect.toml
FAIL: ... agents/code-architect.md but MISSING from plugins/kaola-workflow-gitea/agents/code-architect.toml
FAIL: ... agents/implementer.md but MISSING from plugins/kaola-workflow/agents/implementer.toml
FAIL: ... agents/implementer.md but MISSING from plugins/kaola-workflow-gitlab/agents/implementer.toml
FAIL: ... agents/implementer.md but MISSING from plugins/kaola-workflow-gitea/agents/implementer.toml
agent-profile parity tests FAILED (9 failures, 799 passed)
```

808 total = 784 + 3 pins x (2 presence + 3 twins x 2).

### CONTROL — the same state, judged by the guard WITHOUT the pins (non-vacuity)

This is the assertion that makes the rest mean anything. The leg-2 tree — the rule authored into all
three canonical profiles and reaching **zero** of the nine twins, i.e. the historical failure exactly —
was judged by `scripts/test-agent-profile-parity.js` restored from baseline `483a5e5e`:

```
git show 483a5e5e:scripts/test-agent-profile-parity.js > control-nopins/scripts/test-agent-profile-parity.js
cd pinmirror/control-nopins && node scripts/test-agent-profile-parity.js
```

**Result:** `agent-profile parity tests passed (784 assertions)`, **exit 0**.

The pre-pin guard is green on a tree where nine of twelve carriers have silently dropped the rule.
That is the seam, reproduced; the pins are what convert it to nine named failures. Neither the
consensus derivation (3 of 11 is under the 8/11 threshold) nor byte-identity (all three trees agree —
they agree on *not having it*) can see it.

### LEG 3 — rule present in all 12 carriers

```
cd pinmirror/leg3 && node scripts/test-agent-profile-parity.js
```

**Expected:** exit 0. **Actual:** `agent-profile parity tests passed (808 assertions)`, exit 0.

### LEG 4 — full correct state, then break exactly one codex `.toml`

Three variants, all from the leg-3 tree. Each mutation asserts its anchor is present before writing,
so a no-op mutation cannot pass as a proof.

| variant | mutation | expected | actual |
|---|---|---|---|
| 4a | sentence **deleted** from `plugins/kaola-workflow-gitea/agents/code-architect.toml` | exit 1 naming that file | exit 1, 2 failures / 806 passed |
| 4b | sentence **paraphrased** in the same file (`"Prefer reusing what exists over building something new."`, surrounding ladder intact) | exit 1 naming that file | exit 1, 2 failures / 806 passed |
| 4c | sentence deleted from **all three trees**, `code-architect` only | exit 1, 3 pin failures | exit 1, 3 failures / 805 passed |

4a and 4b:

```
FAIL: role pin "Reuse or extend an existing mechanism before writing a second one." is in agents/code-architect.md but MISSING from plugins/kaola-workflow-gitea/agents/code-architect.toml (md↔toml drift — mirror the rule into the .toml twin)
FAIL: code-architect.toml must be byte-identical across all three Codex trees
```

4c is the one that isolates the pin's contribution. Deleting from a single tree also trips the
pre-existing byte-identity assertion, so 4a/4b alone would not prove the pin is doing the work.
Deleting from all three keeps the trees byte-identical — **byte-identity stays green** — and only the
pins fire:

```
FAIL: role pin "..." is in agents/code-architect.md but MISSING from plugins/kaola-workflow/agents/code-architect.toml
FAIL: role pin "..." is in agents/code-architect.md but MISSING from plugins/kaola-workflow-gitlab/agents/code-architect.toml
FAIL: role pin "..." is in agents/code-architect.md but MISSING from plugins/kaola-workflow-gitea/agents/code-architect.toml
agent-profile parity tests FAILED (3 failures, 805 passed)
```

### LEG 5 — the same proof against the bytes that actually SHIPPED

Legs 1-4 used *my* reconstruction of the prose from `solution-ladder-text.md`. The implementer landed
the real prose mid-run, so a guard proven only against my reconstruction is not proven against what
ships. A fresh mirror was taken from the worktree's actual working tree and leg 4c re-run on it:

```
cd pinmirror/shipped && node scripts/test-agent-profile-parity.js   -> passed (808 assertions), exit 0
cd pinmirror/leg5    && node scripts/test-agent-profile-parity.js   -> FAILED (3 failures, 805 passed), exit 1
```

Same three named failures. The pins match the shipped bytes, not just the authored specimen.

### COVERAGE SWEEP — every carrier, one at a time (shipped bytes)

Strike the sentence from each carrier individually, run, restore. Driven entirely in Node — the first
attempt used an unquoted shell variable that zsh did not word-split, which collapsed twelve cases into
one no-op; that run mutated nothing and its result is discarded.

```
carriers found: 12
RED  agents/code-architect.md                                 exit=1 pinFailsNamingIt=1
RED  agents/implementer.md                                    exit=1 pinFailsNamingIt=1
RED  agents/planner.md                                        exit=1 pinFailsNamingIt=1
RED  plugins/kaola-workflow-gitea/agents/code-architect.toml  exit=1 pinFailsNamingIt=1
RED  plugins/kaola-workflow-gitea/agents/implementer.toml     exit=1 pinFailsNamingIt=1
RED  plugins/kaola-workflow-gitea/agents/planner.toml         exit=1 pinFailsNamingIt=1
RED  plugins/kaola-workflow-gitlab/agents/code-architect.toml exit=1 pinFailsNamingIt=1
RED  plugins/kaola-workflow-gitlab/agents/implementer.toml    exit=1 pinFailsNamingIt=1
RED  plugins/kaola-workflow-gitlab/agents/planner.toml        exit=1 pinFailsNamingIt=1
RED  plugins/kaola-workflow/agents/code-architect.toml        exit=1 pinFailsNamingIt=1
RED  plugins/kaola-workflow/agents/implementer.toml           exit=1 pinFailsNamingIt=1
RED  plugins/kaola-workflow/agents/planner.toml               exit=1 pinFailsNamingIt=1
SWEEP: every carrier goes RED naming itself
```

Restored tree re-verifies at 808 assertions, exit 0. No carrier is unguarded.

## Real worktree

Run at the end of this task, working tree carrying the implementer's 12 modified prose files plus my
one modified test file (`git status` shows exactly those 13, nothing else):

```
cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955
node scripts/test-agent-profile-parity.js
-> agent-profile parity tests passed (808 assertions), exit 0
```

808 matches leg 3's predicted count exactly, and all 12 carriers hold the sentence verbatim
(literal-string `grep -rl`, not normalized matching). This is a state observation, not my verdict —
the outcome of this task is the RED legs above.

## What was deliberately not done

- No file under `agents/` or `plugins/` was edited. The only tracked file I changed is
  `scripts/test-agent-profile-parity.js`.
- No existing assertion weakened or removed; the three pins are purely additive (784 -> 808).
- Nothing committed.
- `agents/code-architect.md:40-41` harmonization (replacing the two older minimalism bullets) is the
  implementer's; I did not touch it and the pins do not depend on it either way. Confirmed landed —
  `grep -n "simplest architecture\|speculative abstractions" agents/code-architect.md` now returns
  nothing, so the pins are the only thing holding that role's solution-sizing rule to its twins.
- No external coupling: `grep -rn "784"` and `grep -rn "ROLE_PINS"` across `scripts/` match nothing
  outside this file, so the assertion-count change cannot stale another guard.

## Final state re-verified

The pin comment was reworded after the legs above (to name `code-architect` explicitly rather than
"this role", and to record that byte-identity cannot substitute). Both the clean run and the mutation
were re-run after that edit, on the shipped bytes, striking a different role than any leg above:

```
real worktree                                    -> passed (808 assertions), exit 0
shipped mirror, pin struck from all 3 implementer.toml -> FAILED (3 failures, 805 passed), exit 1
```

