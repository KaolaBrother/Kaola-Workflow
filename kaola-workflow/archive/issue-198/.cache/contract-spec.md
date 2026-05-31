# Locked contract spec — issue #198 (fast-path widening)

Transcribe tokens & prose VERBATIM. Unicode: `≤` is U+2264 (NOT `<=`); the escalation
separator is U+2014 em-dash with surrounding spaces ` — ` (NOT a hyphen). Anchor edits on
TEXT (old_string), not line numbers.

## Canonical tokens (validator literal MUST equal prose literal byte-for-byte)

| Token (exact substring) | Pillar | In which files |
|---|---|---|
| `mechanical` | 1 | all 6 fast files + all 6 router files |
| `≤ 5` | 1 | all 6 fast files + all 6 router files |
| `design choice` | 1 | all 6 fast files + all 6 router files |
| `approach_ambiguity` | 2 | all 6 fast files only |
| `declared write set` | 2 | all 6 fast files only |
| `absolute backstop of 6` | 2 | all 6 fast files only (FROZEN — never "hard ceiling of 6") |
| `` `code-reviewer` is mandatory `` | 3 | all 6 fast files only |
| `materially-different` | 1/2 | all 6 fast files + all 6 router files |

"6 fast files" = `commands/kaola-workflow-fast.md` + gitlab + gitea `commands/kaola-workflow-fast.md` + the 3 `skills/kaola-workflow-fast/SKILL.md` (github/gitlab/gitea).
"6 router files" = `commands/workflow-next.md` + gitlab + gitea `commands/workflow-next.md` + the 3 `skills/kaola-workflow-next/SKILL.md`.

---

## FAST COMMAND EDITS (apply to all 3 `commands/kaola-workflow-fast.md` — Claude root + gitlab + gitea; text-identical except an issue-noun you DO NOT touch)

**[A]** REPLACE the escalation bullet:
- OLD: `- scope is larger than a single file change or two closely related files`
- NEW: `- scope exceeds the planner's declared write set by more than 1 file, or exceeds the absolute backstop of 6 files (whichever comes first)`

**[B]** ADD a new section immediately BEFORE the `## Mid-Flight Escalation` heading:

```
## Fast Eligibility

Fast path applies only when the approach is **unambiguous and mechanical** —
exactly one sensible way to do it. Mechanical examples: rename or move a symbol
across files; thread an existing field or param through a known call path; a
behavior-preserving refactor; repetitive parallel edits; a bug fix whose root
cause is already located. All of these must also hold: single area; no new
external deps; no public API/schema/migration change; no security/auth/encryption
concern; no `depends-on:#N`; no breaking-change or architecture concern; and the
write set is **≤ 5** files within that single area.

Anything with **≥ 2 materially-different viable approaches** stays on full,
regardless of size — that is a design choice, where full-workflow ideation earns
its keep. File count alone no longer disqualifies; ambiguity does.
```

**[C]** REPLACE the planner-ask bullet and the planner-reports check:
- OLD: `- files to touch (must be ≤ 2 closely related files for fast path to apply)`
- NEW (two lines):
```
- files to touch (the declared write set — must be ≤ 5 files in a single area for fast path to apply)
- explicitly: is there exactly one sensible approach, or ≥ 2 materially-different ones?
```
- OLD (two lines): `If the planner reports the change exceeds ≤ 2 files, escalate per Mid-Flight` / `Escalation above.`
- NEW: `If the planner reports the change exceeds ≤ 5 files, or reports ≥ 2` / `materially-different viable approaches, escalate per Mid-Flight Escalation above.`

**[F]** In the `## Mid-Flight Escalation` bullet list, ADD as the FIRST bullet (keep test_thrash/security/dependency/package bullets unchanged; bullet [A] is the second bullet):
```
- the planner reports ≥ 2 materially-different viable approaches (`approach_ambiguity`) — exactly one sensible approach is required for fast path
```

**[G]** REPLACE "On escalation" item 1:
- OLD (the exact existing line): `1. Write \`escalated_to_full: <trigger>\` to \`workflow-state.md\`.`
- NEW: ``1. Write `escalated_to_full: <trigger> — <detail>` to `workflow-state.md`, where `<trigger>` is one of `approach_ambiguity`, `file_overflow`, `test_thrash`, `security`, `architecture`, `breaking_change`, `dependency`, `new_package`. Use the literal " — " (em-dash with spaces) before the detail so the fast-path audit parses the trigger cleanly.``

**[H]** At the TOP of `## Step 3 - Review` (immediately after the heading, before the existing "Update `workflow-state.md`" block), ADD:
```
Delegated `code-reviewer` is mandatory whenever the change touches **> 1 file**
or any production-path file (anything outside `docs/`, `*.md`, `tests/`).
Self-review is allowed ONLY for the trivial band — a single docs, comment, or
markdown edit. The Trivial Inline Edit exemption below (applying a one-line
reviewer fix) is unchanged.
```
(MUST contain the exact substring: `` `code-reviewer` is mandatory ``.)

After edits each fast command must contain all 8 tokens and must NOT contain `two closely related files` or `≤ 2`.

---

## FAST SKILL EDITS (apply to all 3 `skills/kaola-workflow-fast/SKILL.md` — terse skill voice)

- In `## Step 1 - Plan`, REPLACE the "files to touch (≤ 2)" ask line and the "> 2 files" escalate line with:
```
Ask for: files to touch (the declared write set — ≤ 5 files in a single area), whether the approach is mechanical with exactly one sensible way or has ≥ 2 materially-different viable approaches, exact change per file, acceptance check command, out-of-scope items.
```
```
If planner reports > 5 files or ≥ 2 materially-different viable approaches (`approach_ambiguity`), escalate. The orchestrator captures the returned plan into `fast-summary.md` with status `IN_PROGRESS` (planner has Read-only tools).
```
- Under `## Goal Contract`, ADD a one-line note (carries T1,T2,T3,T4,T5,T6,T8):
```
Fast applies only to mechanical, single-area changes of ≤ 5 files with exactly one sensible approach; ≥ 2 materially-different viable approaches is a design choice that stays on full. Escalate (`escalated_to_full: <trigger> — <detail>`) on `approach_ambiguity`, scope past the declared write set by >1 file or the absolute backstop of 6, `test_thrash` (≥3), security/architecture/breaking-change, discovered dependency, or new external package.
```
- In `## Step 3 - Review`, PREPEND to the existing review line:
```
Delegated `code-reviewer` is mandatory for any change touching > 1 file or any production-path file (outside `docs/`, `*.md`, `tests/`); self-review only for the trivial band (single docs/comment/markdown edit).
```
(MUST contain exact substring `` `code-reviewer` is mandatory ``.)

After edits each fast skill must contain all 8 tokens and must NOT contain `(≤ 2)` or `> 2 files`.

---

## ROUTER EDITS (apply to all 6 router files — 3 `commands/workflow-next.md` + 3 `skills/kaola-workflow-next/SKILL.md`)

**[D]** REPLACE the Step 0a-1 rubric sentence "`KAOLA_PATH=fast` ONLY if all hold: ≤ 2 closely related files, no new external deps, no public API/schema/migration change, no security/auth/encryption concern, no `depends-on:#N` label, single area." with:
```
`KAOLA_PATH=fast` ONLY if all hold: the approach is unambiguous and mechanical (exactly one sensible way — not ≥ 2 materially-different viable approaches), ≤ 5 files in a single area, no new external deps, no public API/schema/migration change, no security/auth/encryption concern, no `depends-on:#N` label. ≥ 2 viable approaches is a design choice → stay on full.
```

**[E]** REPLACE the path-announcement examples block (the three `Path: ...` lines under Step 0a-1) with:
```
Path: fast (mechanical, single-area, 4 files)
Path: full (≥2 viable approaches — design choice)
Path: full (default — rubric ambiguous; prefer safety)
```

After edits each router file must contain `mechanical`, `≤ 5`, `design choice`, `materially-different` and must NOT contain `≤ 2 closely related files`.

---

## DO NOT TOUCH
- Any `Agent(` dispatch block or `model=` line.
- The 9-file-count arrays in the gitlab/gitea validators; the `phaseCommands`/`skills` arrays.
- The simulators (`simulate-*.js`) — leave their existing logic; they are a regression guard only.
- Issue-noun lines (GitHub/GitLab/Gitea issue body), forge fetch commands (gh/glab/tea issue view), forge cross-ref paths.

## FORBIDDEN-PATTERN SAFETY (gitlab/gitea validators re-scan all command+skill prose)
New prose must NOT contain: `gh ` (with trailing space), `glab`, `GitHub`, `GitLab`, `pull request`, `merge request`, `./scripts`, `plugins/kaola-workflow/scripts`. The 8 canonical tokens are clean; verify the full assembled paragraphs.

---

## VALIDATOR ASSERTIONS

Use the file's existing `assertIncludes(file, needle)` / `assertNotIncludes(file, needle)` helpers and its existing path-construction style. Exact Unicode `≤` (U+2264).

### scripts/validate-workflow-contracts.js  +  plugins/kaola-workflow/scripts/validate-workflow-contracts.js
These TWO files are enforced BYTE-IDENTICAL by validate-script-sync.js. Add the SAME block at the SAME position in BOTH (after the existing `commands/workflow-next.md` assertions). After editing, `diff` them — must be empty.

```js
// issue #198: fast-path widening — eligibility/hatch/review contract
const fastFile198 = 'commands/kaola-workflow-fast.md';
assertIncludes(fastFile198, 'mechanical');
assertIncludes(fastFile198, '≤ 5');
assertIncludes(fastFile198, 'design choice');
assertIncludes(fastFile198, 'approach_ambiguity');
assertIncludes(fastFile198, 'declared write set');
assertIncludes(fastFile198, 'absolute backstop of 6');
assertIncludes(fastFile198, '`code-reviewer` is mandatory');
assertNotIncludes(fastFile198, 'two closely related files');
assertNotIncludes(fastFile198, '≤ 2');
const nextFile198 = 'commands/workflow-next.md';
assertIncludes(nextFile198, 'mechanical');
assertIncludes(nextFile198, '≤ 5');
assertIncludes(nextFile198, 'design choice');
assertNotIncludes(nextFile198, '≤ 2 closely related files');
```

### scripts/validate-kaola-workflow-contracts.js  (Codex skills)
Find the existing pluginRoot/skill-path var + assertIncludes helper; add (matching that file's path style):

```js
// issue #198: fast-path widening — Codex skill parity
const fastSkill198 = <pluginRoot> + '/skills/kaola-workflow-fast/SKILL.md';
assertIncludes(fastSkill198, 'mechanical');
assertIncludes(fastSkill198, '≤ 5');
assertIncludes(fastSkill198, 'design choice');
assertIncludes(fastSkill198, 'approach_ambiguity');
assertIncludes(fastSkill198, 'declared write set');
assertIncludes(fastSkill198, 'absolute backstop of 6');
assertIncludes(fastSkill198, '`code-reviewer` is mandatory');
assertNotIncludes(fastSkill198, '(≤ 2)');
assertNotIncludes(fastSkill198, '> 2 files');
const nextSkill198 = <pluginRoot> + '/skills/kaola-workflow-next/SKILL.md';
assertIncludes(nextSkill198, 'mechanical');
assertIncludes(nextSkill198, '≤ 5');
assertIncludes(nextSkill198, 'design choice');
assertNotIncludes(nextSkill198, '≤ 2 closely related files');
```

### plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
Assert the 7 fast tokens (mechanical, ≤ 5, design choice, approach_ambiguity, declared write set, absolute backstop of 6, `code-reviewer` is mandatory) against BOTH `<pluginRoot>/commands/kaola-workflow-fast.md` AND `<pluginRoot>/skills/kaola-workflow-fast/SKILL.md`. Assert T1/T2/T3 (mechanical, ≤ 5, design choice) against BOTH `<pluginRoot>/commands/workflow-next.md` AND `<pluginRoot>/skills/kaola-workflow-next/SKILL.md`. Add assertNotIncludes for `two closely related files` / `≤ 2` (commands) and `(≤ 2)` / `> 2 files` (skills). Do NOT change any existing 9-file-count assertion.

### plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
IDENTICAL structure to gitlab but with the gitea pluginRoot.

---

## AUDIT TEST (scripts/test-fast-audit.js  — +2 assertions, 38 → 40)

The fast-audit is reason-agnostic; do NOT modify kaola-workflow-fast-audit.js. Only add an ISOLATED-UNIT test (do NOT write the fixture into the shared temp dir / do NOT pass it to audit(tmp) — that would perturb aggregate counts totalRuns===10, ESCALATED===1, escalated===1, ehKeys.length===1, which MUST stay unchanged).

Add a fixture constant near the other F1..F9 fixtures (never written to disk). Its body, exactly (use literal U+2014 em-dash in the Escalation line):

```
# Fast Summary: issue-aa

## Status
ESCALATED

## Escalation
escalated_to_full: approach_ambiguity — planner reported 2 materially-different viable approaches
```

Add 2 assertions inside the try block (near the escalationHistogram group), using the module's existing parseEscalationReason + splitSections exports and the existing assert(cond,msg) helper:
- assert that parseEscalationReason(splitSections(F_AA), 'ESCALATED') === 'approach_ambiguity'
- assert that parseEscalationReason(splitSections(F_AA), 'PASSED') === null  (status gate: a PASSED body contributes nothing)

Result: `node scripts/test-fast-audit.js` prints "Fast-audit regression passed (40 assertions)" and exits 0. The final console.log uses the live counter — no hardcoded number inside the test to change.

---

## DOCS (README.md + CHANGELOG.md)

README.md:
- Reframe the fast-path rubric prose that caps at "≤2 closely related files" → mechanical-vs-design uncertainty, single area, ≤ 5 files (raised from ≤ 2), all v1 vetoes retained; ≥ 2 materially-different viable approaches stays on full (a design choice).
- In the fast-path escalation list prose, add: ≥ 2 approaches (approach_ambiguity), and scope beyond the declared write set / absolute backstop of 6.
- In the "Validation and test scripts" table, the test-fast-audit.js row says "38 assertions" → change to "40 assertions".

CHANGELOG.md:
- The existing [Unreleased] "### Added" #197 entry says "38 assertions" → change to "40 assertions".
- Add a NEW bullet under [Unreleased] "### Changed" for #198: fast path now selects on mechanical-vs-design uncertainty with a ≤ 5 file ceiling (raised from ≤ 2; all v1 vetoes retained), a new approach_ambiguity escalation trigger, file-overflow relative to the declared write set plus an absolute backstop of 6, and delegated code-reviewer mandatory above the trivial band; mirrored across Claude/Codex/GitLab/Gitea command+skill contracts with contract-validator assertions. Reference docs/investigations/fast-path-widening-2026-05-30.md.
- Do NOT bump the version or create a tag.
