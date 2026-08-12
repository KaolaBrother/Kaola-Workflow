# impl-docs-1 — docs group 1 (#957 ×2, D4, D5 ×3, D8)

**Tree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-956-957-958-959-960-961-962`
(`git rev-parse --abbrev-ref HEAD` → `workflow/bundle-956-957-958-959-960-961-962`)

**Files changed (4, exactly the assigned set):** `docs/api.md`, `docs/conventions.md`,
`docs/workflow-state-contract.md`, `docs/architecture.md`. Nothing under `scripts/`, no other doc.

**Verification tier: NONE ACHIEVED — withheld by instruction.** The brief forbade `npm test` and any
chain (tree transiently inconsistent), so no `build-green` / `regression-green` evidence exists for
this change. What is below is static verification only: line-level before/after, exhaustive greps for
surviving values, and a reader sweep proving no script asserts on any passage edited. The orchestrator
owes this diff a chain run before the receipt is taken as covering it — and, for the two test-consumed
files, that run must come **after** these edits (see Sequencing).

---

## EDIT 1 — #957, `docs/api.md` (was 1533-1542, now 1533-1543)

Before:

```
Codex subagent dispatch uses the existing role tier as a separate per-spawn contract:

| Role tier | Codex model | Reasoning effort |
|---|---|---|
| `standard` | `gpt-5.6-sol` | `medium` |
| `reasoning` | `gpt-5.6-sol` | `xhigh` |

The mappings are fixed for every Codex spawn. A `standard` role always receives Sol/medium and has no
task-specific model or reasoning-effort escalation, downgrade, or other exception. This contract is
Codex-only; the resolver and model routing for Claude Code, opencode, and Kimi are unchanged.
```

After:

```
Codex subagent dispatch uses the existing role tier as a separate per-spawn contract. The per-tier
model/effort pair is defined once, by the four constants in
`scripts/kaola-workflow-codex-preflight.js` (`CODEX_STANDARD_MODEL`/`CODEX_STANDARD_EFFORT`,
`CODEX_REASONING_MODEL`/`CODEX_REASONING_EFFORT`) — cross-bound to the installer by
`validate-kaola-workflow-contracts.js` and to the shipped Codex SKILL prose by
`test-route-reachability.js`. This document does not restate the values.

The mappings are fixed for every Codex spawn. A `standard` role always receives the standard-tier
pair and has no task-specific model or reasoning-effort escalation, downgrade, or other exception.
This contract is Codex-only; the resolver and model routing for Claude Code, opencode, and Kimi
are unchanged.
```

Both value carriers removed: the table (4 model/effort literals) **and** the "Sol/medium"
restatement at the old :1540 — the R2 site the premise warned a table-only repair would leave standing.
Replacement text is the brief's verbatim wording.

## EDIT 2 — #957, `docs/conventions.md:45-50` (site found at the briefed line numbers, unshifted)

Before:

```
- `model` — selected from the role's existing tier for this spawn: both tiers use `gpt-5.6-sol`
- `reasoning_effort` — paired with that model for this spawn: standard uses `medium` and reasoning uses
  `xhigh`

The mapping is fixed for every spawn. A standard-tier role always uses Sol/medium; task breadth,
latency, prior outcomes, and risk do not create an escalation or any other model/reasoning exception.
```

After:

```
- `model` / `reasoning_effort` — selected from the role's existing tier for this spawn; the
  per-tier pair is defined solely by the `CODEX_STANDARD_*`/`CODEX_REASONING_*` constants in
  `kaola-workflow-codex-preflight.js` and shipped on the Codex next/finalize SKILLs

The mapping is fixed for every spawn. A standard-tier role always uses the standard-tier pair;
task breadth, latency, prior outcomes, and risk do not create an escalation or any other
model/reasoning exception.
```

Two bullets collapse to one (the pair is now a single fact with a single home). The line
"Do not present Claude `Agent(...)` call-syntax as the Codex runtime contract." is untouched, as directed.

## EDIT 3 — D4, `docs/api.md:1002`

Before: `` - `cmdSinkPr` emits no closure receipt — the authoritative receipt for a `sink: pr` project is ``
After:  `` - The PR sink emits no closure receipt — the authoritative receipt for a `sink: pr` project is ``

One token. Line 1003 (`emitted by the watcher at merge. This is documented behavior, not a gap.`)
untouched — the true result is preserved; only the fabricated symbol is gone.

## EDIT 4 — D5, `= 86400000` dropped at three sites, constant name kept

| file:line | before → after |
|---|---|
| `docs/architecture.md:114` | ``(`session_marker`, `claim_ts`, and `LANE_STALENESS_MS = 86400000`).`` → ``(`session_marker`, `claim_ts`, and `LANE_STALENESS_MS`).`` |
| `docs/conventions.md:774` (briefed as 770) | ``  `LANE_STALENESS_MS = 86400000` (24 hours) is the single staleness constant exported from`` → ``  `LANE_STALENESS_MS` (24 hours) is the single staleness constant exported from`` |
| `docs/workflow-state-contract.md:295` | ``    `LANE_STALENESS_MS = 86400000` (24 hours, exported from …)`` → ``    `LANE_STALENESS_MS` (24 hours, exported from …)`` |

Only the numeral moved at each site; surrounding sentences, the "(24 hours)" gloss and the pointer to
`kaola-workflow-adaptive-schema.js` are intact. Result matches the existing short form at
`docs/workflow-state-contract.md:338-339`. In `docs/conventions.md` this edit touched the numeral and
nothing else, as instructed. No line re-flow anywhere (all three lines only shortened).

## EDIT 5 — D8, `docs/architecture.md:121`

Before:

```
another lane's scratch under `kaola-workflow/`, `.kw/worktrees/` or `.kw/legs/` does not read as
dirt. Real code and shared durable state stay strict, and an unverifiable tree still reads as dirty.
```

After:

```
another lane's scratch under the `PARKED_LANE_PREFIXES` paths (exported from
`kaola-workflow-adaptive-schema.js`) does not read as dirt. Real code and shared durable state stay
strict, and an unverifiable tree still reads as dirty.
```

Took the first of the two permitted shapes — values replaced by the constant name plus its home —
because it also removes a restatement, matching D5's direction inside the same file. Phrasing mirrors
the correct style at `docs/conventions.md:790` (`**\`PARKED_LANE_PREFIXES\`** (exported from
`kaola-workflow-adaptive-schema.js`)`). Two lines became three (wrap only); the trailing sentence is
byte-identical. **`docs/architecture.md:198` was not touched** — verified it is the `changed_paths`
band, a different list.

---

## Verification

All greps run with explicit file paths (an initial run used an unquoted `$F` file list; zsh does not
word-split, so ugrep saw one nonexistent path and exited 2 — a false clean. Re-run below is the real one.)

```
$ cd <worktree>
$ for pat in 'gpt-5\.6-sol' 'Sol/medium' 'cmdSinkPr' '= 86400000' '86400000' 'xhigh' 'gpt-'; do
    grep -n -P "$pat" docs/api.md docs/conventions.md docs/workflow-state-contract.md docs/architecture.md; echo "EXIT=$?"
  done
gpt-5\.6-sol   → EXIT=1 (no match)
Sol/medium     → EXIT=1
cmdSinkPr      → EXIT=1
= 86400000     → EXIT=1
86400000       → EXIT=1     (bare numeral gone entirely, not just the ` = ` form)
xhigh          → EXIT=1
gpt-           → EXIT=1     (no model literal of any kind survives in the four files)

$ grep -n -F 'PARKED_LANE_PREFIXES' <the four files>            EXIT=0
docs/conventions.md:790, docs/conventions.md:799, docs/architecture.md:121   ← named at 121 ✓

$ grep -n -F 'LANE_STALENESS_MS' <the four files>               EXIT=0
docs/architecture.md:114, docs/workflow-state-contract.md:295/338/339,
docs/conventions.md:772/775                                     ← all six name-only, zero values
```

**Reader sweep — nothing asserts on any passage edited** (`git grep` over `scripts` + `plugins`):

- `(readFileSync|readFile|resolve|join)\(...conventions` → EXIT=1; same for `architecture` → EXIT=1.
  **No script opens `docs/conventions.md` or `docs/architecture.md` at all.**
- `"Role tier"` → EXIT=1 · `"per-spawn contract"` → EXIT=1 · `"documented behavior, not a gap"` → EXIT=1 ·
  `"always uses Sol"` → EXIT=1 · `"both tiers use"` → EXIT=1.
- `"Sol/medium"` → 2 hits, both a script's own fixture/mutation string
  (`test-install-model-rendering.js:424`, `test-route-reachability.js:398`); neither reads a doc.
- `"closure receipt"` / `"authoritative receipt"` → hits are code comments and receipt-shape asserts in
  `sink-merge.js` / walkthroughs; none reads `docs/api.md`.
- Consistent with premise-957 §6: the two `docs/` copies of the tier pair were unbound, so deleting the
  values cannot red anything.

## Divergences from the brief's described state

1. **`test-forge-finalize-findings.js` asserts on `docs/api.md`, not `docs/conventions.md`.**
   `git grep -i conventions -- scripts/test-forge-finalize-findings.js` → EXIT=1, zero hits; the file
   reads `path.join(repoRoot, 'docs/api.md')` (:543-544) and pins the finding-type table rows, the
   per-edition count sentence, `archive_unstaged` and `residue_unstaged` (:539-662). The brief's
   caution was pointed at the wrong file. I complied with it regardless (conventions.md: numeral only
   at the D5 site, plus the separately-authorized EDIT 2 block). **My api.md edits are outside every
   region that test pins** — the pinned rows are in the finalize-findings section, not the PR-sink
   bullet (:1002) or the Codex tier block (:1533+), and the three distinctive strings from those two
   regions all grep to zero in scripts.
2. **`docs/conventions.md` line numbers shifted +4** below the earlier in-worktree edit: the D5 site is
   at **774** (briefed 770) and the correct-style `PARKED_LANE_PREFIXES` block at **790** (briefed 785).
   The #957 site at 45-50 was unshifted. Content byte-identical to the brief's quotes at all sites.
3. Pre-existing edits by other agents were left untouched and are visible in the same diff:
   `docs/conventions.md:279-297` (agent-profile-parity / `ROLE_PINS` block) and
   `docs/architecture.md:288,296-300` (Editions section). I re-flowed nothing near them.

## Sequencing (carried forward, not acted on)

- `docs/api.md` and `docs/workflow-state-contract.md` are in `SELF_HOST_TEST_CONSUMED`
  (`kaola-workflow-adaptive-schema.js:905-911`) and `TEST_CONSUMED_PATHS`
  (`kaola-workflow-validation-runner.js:32-38`). These edits change `computeCodeTreeHash` and **stale
  any chain receipt taken before them** — the finalize chain run must come after. `docs/conventions.md`
  and `docs/architecture.md` are in neither list.

## Out of scope, flagged not fixed

premise-957 finding **R1**: root `README.md:180-181` states the same model/effort pair in live,
shipped, normative prose, bound by no check — a **third** unbound site, refuting #957's "sole two
`docs/` copies". The brief assigned root `README.md` to another agent, so I did not touch it. If that
agent's brief does not carry R1, the #957 repair lands incomplete.
