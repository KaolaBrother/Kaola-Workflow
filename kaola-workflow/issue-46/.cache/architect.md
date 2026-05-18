# Code Architect Blueprint: issue-46

## Design Decisions

- Single anchor phrase: `## Completion Contract` — the stable needle used in every prose surface and every `assertIncludes` call.
- Supporting prose needles: `single-issue completion contract`, `await explicit re-direction`, `next issue in line`.
- Budget strategy for `workflow-next.md`: Two edits — add 2 lines to Goal-Driven Autonomy + add 14-line Completion Contract section at EOF → total +16 lines → 283+16=299, within the 300-line cap.
- Positioning: `## Completion Contract` is a separate terminal section after the routing output block (NOT inserted inside Goal-Driven Autonomy) in workflow-next.md. The autonomy section covers in-flight behavior; the completion contract is the post-closure terminal boundary.
- Plugin scripts: `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` is byte-identical to `scripts/validate-workflow-contracts.js`. After editing the scripts copy, mirror it with `cp`.
- SKILL.md files: conceptually parallel (not byte-identical) to command files. `## Completion Contract` section appended.
- Epic Case 18: NOT added. Prose-only change; no new script branch. assertIncludes in validators is the correct verification medium.

## Files to Create

None.

## Files to Modify

| File | Changes | Parallel Group |
|------|---------|---------------|
| `commands/workflow-next.md` | Add 2-line warning to Goal-Driven Autonomy; append 14-line `## Completion Contract` at EOF | 1 |
| `commands/kaola-workflow-phase6.md` | Append `## Completion Contract` after EOF (line 664) | 1 |
| `commands/workflow-init.md` | Add "next issue in line" warning bullet after the /goal bullet | 1 |
| `README.md` | Add 4-sentence completion contract block to Autonomy And Goal Contract | 1 |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Append `## Completion Contract` after `## Required Output` | 2 |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Append `## Completion Contract` at EOF | 2 |
| `scripts/validate-workflow-contracts.js` | Add 10 `assertIncludes` calls before `console.log` | 3 |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | Mirror: `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | 3 |
| `scripts/validate-kaola-workflow-contracts.js` | Add 6 `assertIncludes` calls for Codex skill surfaces | 3 |

## Verbatim Edit Specifications

### 1. commands/workflow-next.md — Goal-Driven Autonomy addition

Old (lines 34-43):
```
## Goal-Driven Autonomy

Use `/goal` or equivalent prompt-based Stop-hook wording so the router and each
phase keep going until the active phase objective and completion audit pass.
Treat nonessential workflow bookkeeping as autonomous: issue selection when
there is one unambiguous open issue, generated project names, collision suffixes
like `-2`, cache paths, and harmless ordering choices. Consult the configured
advisor internally for essential technical decisions, apply the chosen answer,
and record it under `.cache/` or the phase artifact. Ask only for true external
authorization or materially user-owned choices.
```

New (add 2 lines at end of section):
```
## Goal-Driven Autonomy

Use `/goal` or equivalent prompt-based Stop-hook wording so the router and each
phase keep going until the active phase objective and completion audit pass.
Treat nonessential workflow bookkeeping as autonomous: issue selection when
there is one unambiguous open issue, generated project names, collision suffixes
like `-2`, cache paths, and harmless ordering choices. Consult the configured
advisor internally for essential technical decisions, apply the chosen answer,
and record it under `.cache/` or the phase artifact. Ask only for true external
authorization or materially user-owned choices.

The `/goal` template must NOT use "next issue in line" or similar phrasing that
implies cross-issue continuation. Each run targets exactly one issue.
```

### 2. commands/workflow-next.md — Append Completion Contract at EOF

Old (current last 3 lines):
```
If nested slash-command execution is supported in the current Claude Code
environment, continue by applying the matching command. Otherwise stop after
printing the next command.
```

New (same text plus new section):
```
If nested slash-command execution is supported in the current Claude Code
environment, continue by applying the matching command. Otherwise stop after
printing the next command.

## Completion Contract

Each `/workflow-next` run implements exactly one issue. After Phase 6 closes
issue #N — the GitHub issue is marked closed, the branch is merged or the PR
is opened, and the lease is released — the agent stops and awaits explicit
re-direction. Do not auto-route into the next issue in line. The single-issue
completion contract means finishing issue #N is the terminal event of the run.
To start issue #N+1, the user must invoke `/workflow-next` again.
```

Note on line count: These two edits together add 16 lines (2 + 14), bringing total from 283 to 299 — within the 300-line cap.

### 3. commands/kaola-workflow-phase6.md — Append at EOF

Old (current last line 664):
```
After `sink-pr.js` exits 0, the lease remains active. The PR lease releases automatically when `watch-pr` detects the PR is MERGED or CLOSED on the next `/workflow-next` startup.
```

New (same text plus new section):
```
After `sink-pr.js` exits 0, the lease remains active. The PR lease releases automatically when `watch-pr` detects the PR is MERGED or CLOSED on the next `/workflow-next` startup.

## Completion Contract

This phase closes exactly one issue. After issue #N is closed and the lease is
released, the single-issue completion contract is satisfied. Do not auto-route
into the next issue in line. Stop and await explicit re-direction from the user.
```

### 4. commands/workflow-init.md — Add bullet after /goal bullet (line 127)

Old:
```
- Use `/goal` or equivalent prompt-based Stop-hook wording so each phase continues until its objective and completion audit are satisfied.
- Treat nonessential workflow bookkeeping as autonomous: generated project names, collision suffixes like `-2`, cache/artifact paths, and harmless ordering choices are selected automatically and recorded.
```

New:
```
- Use `/goal` or equivalent prompt-based Stop-hook wording so each phase continues until its objective and completion audit are satisfied.
- The `/goal` template must not use "next issue in line" or any phrasing that implies automatic cross-issue continuation. Each `/workflow-next` run targets one issue; finishing it is the terminal event. The single-issue completion contract requires explicit re-direction for the next issue.
- Treat nonessential workflow bookkeeping as autonomous: generated project names, collision suffixes like `-2`, cache/artifact paths, and harmless ordering choices are selected automatically and recorded.
```

### 5. README.md — Add completion contract block to Autonomy And Goal Contract

Old (closing paragraph of the section):
```
Prompt the user only for true external authorization or materially
user-owned choices, such as risky Git synchronization, destructive rewrites,
credential or deployment actions, or issue/roadmap reorganization.
```

New:
```
Prompt the user only for true external authorization or materially
user-owned choices, such as risky Git synchronization, destructive rewrites,
credential or deployment actions, or issue/roadmap reorganization.

The single-issue completion contract applies at the end of every run: after
Phase 6 closes issue #N and releases the lease, the agent stops and awaits
explicit re-direction. Do not use "next issue in line" phrasing in `/goal`
templates — cross-issue continuation is never automatic.
```

### 6. plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md — Append Completion Contract

Old (find the last substantial block, after Required Output section closing backticks):
The SKILL.md file's last section before Completion Contract should end with a closing triple-backtick or similar block.

New (append at EOF):
```
## Completion Contract

Each kaola-workflow-next run implements exactly one issue. After
kaola-workflow-finalize closes issue #N and releases the lease, the
single-issue completion contract is satisfied. Stop and await explicit
re-direction. Do not auto-route into the next issue in line.
```

### 7. plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md — Append at EOF

New (append at EOF):
```
## Completion Contract

This skill closes exactly one issue. After issue #N is closed and the lease is
released, the single-issue completion contract is satisfied. Stop and await
explicit re-direction from the user. Do not auto-route into the next issue in
line.
```

## Validator Assertions to Add

### scripts/validate-workflow-contracts.js — Add before final console.log

```javascript
// Issue #46: single-issue completion contract
assertIncludes('commands/workflow-next.md', '## Completion Contract');
assertIncludes('commands/workflow-next.md', 'single-issue completion contract');
assertIncludes('commands/workflow-next.md', 'await explicit re-direction');
assertIncludes('commands/workflow-next.md', 'next issue in line');
assertIncludes('commands/kaola-workflow-phase6.md', '## Completion Contract');
assertIncludes('commands/kaola-workflow-phase6.md', 'single-issue completion contract');
assertIncludes('commands/workflow-init.md', 'single-issue completion contract');
assertIncludes('commands/workflow-init.md', 'next issue in line');
assertIncludes('README.md', 'single-issue completion contract');
assertIncludes('README.md', 'next issue in line');
```

### plugins/kaola-workflow/scripts/validate-workflow-contracts.js — Mirror copy

```bash
cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
```

### scripts/validate-kaola-workflow-contracts.js — Add before final console.log

```javascript
// Issue #46: single-issue completion contract — Codex skill surfaces
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, '## Completion Contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'single-issue completion contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-next/SKILL.md`, 'await explicit re-direction');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, '## Completion Contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'single-issue completion contract');
assertIncludes(`${pluginRoot}/skills/kaola-workflow-finalize/SKILL.md`, 'await explicit re-direction');
```

## Build Sequence

Group 1 (parallel — independent prose edits):
1. Edit `commands/workflow-next.md` (two edits in sequence)
2. Edit `commands/kaola-workflow-phase6.md`
3. Edit `commands/workflow-init.md`
4. Edit `README.md`

Group 2 (parallel — Codex skill edits):
5. Edit `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
6. Edit `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`

Group 3 (sequential — validators after prose):
7. Edit `scripts/validate-workflow-contracts.js`
8. Copy `scripts/validate-workflow-contracts.js` → `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
9. Edit `scripts/validate-kaola-workflow-contracts.js`

## Validation Commands

```bash
node scripts/validate-script-sync.js
node scripts/validate-workflow-contracts.js
node scripts/validate-kaola-workflow-contracts.js
node scripts/simulate-workflow-walkthrough.js
```

All must exit 0.

## Out-of-Scope Items

- `scripts/kaola-workflow-claim.js` — no changes (lines 1422-1441 already correct)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — no changes
- `scripts/simulate-workflow-walkthrough.js` — no new Epic Case 18
- Any phase1-phase5 command or skill file
- `hooks/hooks.json` and hook scripts
- `install.sh`, `uninstall.sh`, `package.json`

## Notes on Epic Case 18

NOT added. This is a prose-only change. The `no_target` behavior at `kaola-workflow-claim.js:1422-1441` exists from issue #44. The `assertIncludes` validators are the correct verification medium for prose contracts. Epic Case 18 should be reserved for the next script-level behavioral change.
