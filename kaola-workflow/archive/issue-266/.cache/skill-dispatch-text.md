# skill-dispatch-text — node evidence (issue #266, AC-A)

## task
Remove Claude-only `Agent(...)` / `subagent_type=` CALL-SYNTAX presented as the operational
dispatch contract from the Codex-facing skill text, replacing it with a Codex-native
dispatch description.

## non_tdd_reason:
Skill PROSE edit — no natural failing unit test exists for instructional prose in a SKILL.md
file. Category: glue / wiring (dispatch-description prose; no behavioral logic under test).
Verified by grep-absence of the leak token + running the contract validators (no regression).

## write_set
Declared (4 files):
- plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md        — declared, UNTOUCHED (see scope decision)
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md — declared, UNTOUCHED (see scope decision)
- plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md  — declared, UNTOUCHED (see scope decision)
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md       — MODIFIED (the genuine AC-A leak)

Actual ⊆ declared (the per-node barrier permits a subset of the declared write set; no
plan-repair needed — the 3 init files are declared-but-untouched).

## Scope decision (FINAL)

The init `SKILL.md` line-66 bullet (`~/.claude/agents` + `model=` on the `Agent(...)` call)
lives INSIDE the ```markdown-fenced `# Claude Project Instructions` template block
(markers `<!-- KW-CLAUDE-TEMPLATE-START -->` … `<!-- KW-CLAUDE-TEMPLATE-END -->`, SKILL.md
lines 31–111). That block is the literal CLAUDE.md payload that `workflow-init` installs
into a CONSUMER repo — it is NOT the skill's own runtime dispatch contract.

- It is byte-locked to the paired Claude `commands/workflow-init.md` ON PURPOSE
  (`validate-kaola-workflow-contracts.js:426–439` enforces template byte-identity within
  each forge pair). `~/.claude/agents` + `Agent(...)` is CORRECT guidance for a Claude
  consumer reading its own CLAUDE.md.
- Therefore the init line-66 bullet is NOT the AC-A target and must NOT be changed
  (changing it would break the template byte-lock and would also require touching the
  out-of-scope command files).

The genuine AC-A leak — `Agent(subagent_type=..., model=...)` choreography presented as the
skill's OWN operational dispatch contract — was ONLY the adapt SKILL.md line-105/106
`subagent_type="workflow-planner"` Claude parenthetical. That is now removed.

## Change applied (adapt SKILL.md, lines 105–106)

BEFORE:
```
the `## Nodes` table inline in this session. In Claude Code dispatch it via the Agent tool
(`subagent_type="workflow-planner"`); in Codex delegate to the `workflow-planner` agent role when its
profile is present at `.codex/agents/kaola-workflow/`.
```
AFTER:
```
the `## Nodes` table inline in this session. In Codex, delegate to the `workflow-planner` agent role when its
profile is present at `.codex/agents/kaola-workflow/`.
```
(Deleted the Claude parenthetical clause + the `subagent_type="workflow-planner"` token;
kept the already-present Codex-native clause. Single-sentence surgical edit; reads cleanly.)

## Verification

### grep-absence (the leak token is gone)
```
grep -n 'subagent_type=' plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
  → no output (exit 1 = no matches)
```
(The init files are reverted, so the original `Agent(...)` template payload is intentionally
restored there — that is correct Claude-consumer guidance, not an AC-A leak.)

### regression-green (both validators pass after the final edit)
```
node scripts/validate-kaola-workflow-contracts.js
  → "Kaola-Workflow Codex contract validation passed" (exit 0)

node scripts/simulate-workflow-walkthrough.js
  → "Workflow walkthrough simulation passed" (real exit 0, captured directly)
```
regression-green

### git status (only the adapt SKILL.md as a modified production file)
```
git status --short
 M plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
?? kaola-workflow/issue-266/        (exempt workflow artifacts — not a production change)
```

## Result
AC-A satisfied: the operational-contract `Agent(subagent_type=..., model=...)` leak in the
skill's own dispatch prose (adapt SKILL.md line 106) is removed; the Codex-native delegate
clause is retained. The 3 init SKILL.md files are declared-but-untouched (their line-66
bullet is Claude-template payload, byte-locked, correct for Claude consumers — not an AC-A
target). No plan-repair, no command-file edits.
