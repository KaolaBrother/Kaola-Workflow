# impl-953 — the solution ladder, rendered into twelve carriers

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955`
Base commit: `483a5e5e`

## Baseline (before any change)

```
$ node scripts/test-agent-profile-parity.js
agent-profile parity tests passed (784 assertions)
EXIT=0
```

```
$ for r in implementer code-architect planner; do shasum -a 256 plugins/kaola-workflow/agents/$r.toml plugins/kaola-workflow-gitlab/agents/$r.toml plugins/kaola-workflow-gitea/agents/$r.toml; done
072e7aeda5e10105b7bc10d7dda120833167ddebbf7f1714ae36e3b3d63b857f  plugins/kaola-workflow/agents/implementer.toml
072e7aeda5e10105b7bc10d7dda120833167ddebbf7f1714ae36e3b3d63b857f  plugins/kaola-workflow-gitlab/agents/implementer.toml
072e7aeda5e10105b7bc10d7dda120833167ddebbf7f1714ae36e3b3d63b857f  plugins/kaola-workflow-gitea/agents/implementer.toml
5db48d70e206c4ee96e1e3af967ff1615ef964efa20fda5c30a33ec99eed359f  plugins/kaola-workflow/agents/code-architect.toml
5db48d70e206c4ee96e1e3af967ff1615ef964efa20fda5c30a33ec99eed359f  plugins/kaola-workflow-gitlab/agents/code-architect.toml
5db48d70e206c4ee96e1e3af967ff1615ef964efa20fda5c30a33ec99eed359f  plugins/kaola-workflow-gitea/agents/code-architect.toml
2e3ba53ca3c3b71a95eea2d4144f451877b31d84744ded5be857d6a9543d3d37  plugins/kaola-workflow/agents/planner.toml
2e3ba53ca3c3b71a95eea2d4144f451877b31d84744ded5be857d6a9543d3d37  plugins/kaola-workflow-gitlab/agents/planner.toml
2e3ba53ca3c3b71a95eea2d4144f451877b31d84744ded5be857d6a9543d3d37  plugins/kaola-workflow-gitea/agents/planner.toml
```

## Decisions taken before editing

- **Frozen bytes, extracted programmatically.** Rather than re-type the two blocks twelve times, a
  one-off scratchpad script reads `solution-ladder-text.md`, extracts the two fenced blocks, and
  performs every insertion. Transcription drift in the pin sentence is therefore structurally
  impossible, not merely checked for.
- **Em dashes retained in the TOML block.** The three target `.toml` files happen to use ASCII `--`,
  but em dashes already ship in five sibling carriers in the same directory
  (`adversarial-verifier`, `code-reviewer`, `investigator`, `knowledge-lookup`, `security-reviewer`),
  and `normalizeProse` in the parity guard maps `[—–] -> --` before comparing. The frozen bytes are
  used unchanged.
- **Placement, kept consistent across the three roles.** `## Solution ladder` is appended at end of
  file in each `.md`; the TOML block is appended at the end of each `developer_instructions` body,
  immediately before the closing `"""`. Nothing in these files must stay last.

## Files changed

Twelve carriers, hand-edited (all paths relative to the worktree root):

| file | change |
|---|---|
| `agents/implementer.md` | `## Solution ladder` appended at end of file |
| `agents/code-architect.md` | `## Solution ladder` appended; two minimalism bullets deleted (harmonization) |
| `agents/planner.md` | `## Solution ladder` appended at end of file |
| `plugins/kaola-workflow/agents/implementer.toml` | TOML-prose ladder appended to `developer_instructions` |
| `plugins/kaola-workflow/agents/code-architect.toml` | same |
| `plugins/kaola-workflow/agents/planner.toml` | same |
| `plugins/kaola-workflow-gitlab/agents/implementer.toml` | same |
| `plugins/kaola-workflow-gitlab/agents/code-architect.toml` | same |
| `plugins/kaola-workflow-gitlab/agents/planner.toml` | same |
| `plugins/kaola-workflow-gitea/agents/implementer.toml` | same |
| `plugins/kaola-workflow-gitea/agents/code-architect.toml` | same |
| `plugins/kaola-workflow-gitea/agents/planner.toml` | same |

Plus the six regenerated additive-edition trees (gitignored): `.opencode`, `.opencode-gitlab`,
`.opencode-gitea`, `.kimi`, `.kimi-gitlab`, `.kimi-gitea` — 19 files updated per tree.

`scripts/test-agent-profile-parity.js` also shows in `git diff` (+11 lines). That is the test
author's concurrent pin work, **not mine** — I did not open it for writing.

## Harmonization (agents/code-architect.md)

Removed from `### 2. Architecture Design`:

```
- choose the simplest architecture that meets the requirement
- avoid speculative abstractions unless the repo already uses them
```

`:35` ("understand the dependency graph before proposing new abstractions") is untouched — it is
about reading, not solution size. `### 2. Architecture Design` now carries one bullet
("design the feature to fit naturally into current patterns"); the deleted content lives on as
rungs 5 and 1.

## Additive edition regeneration

All six commands exited 0 and reported `write complete (19 file(s) updated)`:

```
$ node scripts/sync-opencode-edition.js --forge=github --write   -> 19 file(s) updated, EXIT=0
$ node scripts/sync-opencode-edition.js --forge=gitlab --write   -> 19 file(s) updated, EXIT=0
$ node scripts/sync-opencode-edition.js --forge=gitea  --write   -> 19 file(s) updated, EXIT=0
$ node scripts/sync-kimi-edition.js     --forge=github --write   -> 19 file(s) updated, EXIT=0
$ node scripts/sync-kimi-edition.js     --forge=gitlab --write   -> 19 file(s) updated, EXIT=0
$ node scripts/sync-kimi-edition.js     --forge=gitea  --write   -> 19 file(s) updated, EXIT=0
```

Each opencode run wrote 14 agents + 3 commands + 2 hook/plugin files and printed
`preserve   opencode.json (user-owned; use --write-config to overwrite)`. Each kimi run wrote 17
SKILL.md files, `adapted .kimi*/hooks/kaola-workflow-subagent-dispatch-log.sh`, and
`generated .kimi*/hooks/kimi-hooks.toml`.

The identity-transform claim was **verified, not assumed** — the rendered ladder in
`.opencode/agent/implementer.md` and `.kimi/skills/kaola-role-code-architect/SKILL.md` is
byte-for-byte the canonical Markdown block, `## Solution ladder` heading included.

## Verification

### Parity guard

```
$ node scripts/test-agent-profile-parity.js
agent-profile parity tests passed (808 assertions)
EXIT=0
```

Baseline was 784 assertions / exit 0. The +24 reflects the test author's concurrent pins landing in
the same file; no pin-related failure was ever observed, on any run.

### Byte-identity of the three plugin trees, after

```
$ for r in implementer code-architect planner; do shasum -a 256 plugins/kaola-workflow/agents/$r.toml plugins/kaola-workflow-gitlab/agents/$r.toml plugins/kaola-workflow-gitea/agents/$r.toml; done
691bcc1aa7a808568517996af01e9cacc3b62ada4642363f5a0cd849f7ad089a  plugins/kaola-workflow/agents/implementer.toml
691bcc1aa7a808568517996af01e9cacc3b62ada4642363f5a0cd849f7ad089a  plugins/kaola-workflow-gitlab/agents/implementer.toml
691bcc1aa7a808568517996af01e9cacc3b62ada4642363f5a0cd849f7ad089a  plugins/kaola-workflow-gitea/agents/implementer.toml
5d63b114a9e2150d9c9f03915775002eaf02dd9293fa22484404896360c52c6a  plugins/kaola-workflow/agents/code-architect.toml
5d63b114a9e2150d9c9f03915775002eaf02dd9293fa22484404896360c52c6a  plugins/kaola-workflow-gitlab/agents/code-architect.toml
5d63b114a9e2150d9c9f03915775002eaf02dd9293fa22484404896360c52c6a  plugins/kaola-workflow-gitea/agents/code-architect.toml
9c35a088ed1690dadfd3aa46406ffad92a4021b4e464e04cbe716a7366989c09  plugins/kaola-workflow/agents/planner.toml
9c35a088ed1690dadfd3aa46406ffad92a4021b4e464e04cbe716a7366989c09  plugins/kaola-workflow-gitlab/agents/planner.toml
9c35a088ed1690dadfd3aa46406ffad92a4021b4e464e04cbe716a7366989c09  plugins/kaola-workflow-gitea/agents/planner.toml
```

Three hashes per role, all matching. Identity preserved.

### Pin sentence, verbatim, in all twelve

```
$ grep -c "Reuse or extend an existing mechanism before writing a second one\." agents/{implementer,code-architect,planner}.md plugins/*/agents/{implementer,code-architect,planner}.toml
agents/implementer.md:1
agents/code-architect.md:1
agents/planner.md:1
plugins/kaola-workflow-gitlab/agents/implementer.toml:1
plugins/kaola-workflow-gitea/agents/implementer.toml:1
plugins/kaola-workflow/agents/implementer.toml:1
plugins/kaola-workflow-gitea/agents/code-architect.toml:1
plugins/kaola-workflow/agents/code-architect.toml:1
plugins/kaola-workflow-gitea/agents/planner.toml:1
plugins/kaola-workflow-gitlab/agents/code-architect.toml:1
plugins/kaola-workflow-gitlab/agents/planner.toml:1
plugins/kaola-workflow/agents/planner.toml:1
EXIT=0
```

12 files, every count exactly 1.

### Harmonized bullets are gone

```
$ grep -n "simplest architecture that meets the requirement\|avoid speculative abstractions" agents/code-architect.md
EXIT=1
```

No output — the bullets are gone from the shipping file.

### The ladder reached all six additive-edition trees

```
$ grep -rc "Reuse or extend an existing mechanism before writing a second one\." .opencode*/agent/{implementer,code-architect,planner}.md .kimi*/skills/kaola-role-{implementer,code-architect,planner}/SKILL.md
.opencode/agent/implementer.md:1
.opencode/agent/code-architect.md:1
.opencode-gitlab/agent/implementer.md:1
.opencode-gitlab/agent/code-architect.md:1
.opencode/agent/planner.md:1
.opencode-gitlab/agent/planner.md:1
.opencode-gitea/agent/code-architect.md:1
.opencode-gitea/agent/planner.md:1
.opencode-gitea/agent/implementer.md:1
.kimi/skills/kaola-role-implementer/SKILL.md:1
.kimi/skills/kaola-role-planner/SKILL.md:1
.kimi-gitlab/skills/kaola-role-implementer/SKILL.md:1
.kimi/skills/kaola-role-code-architect/SKILL.md:1
.kimi-gitlab/skills/kaola-role-code-architect/SKILL.md:1
.kimi-gitea/skills/kaola-role-implementer/SKILL.md:1
.kimi-gitea/skills/kaola-role-code-architect/SKILL.md:1
.kimi-gitlab/skills/kaola-role-planner/SKILL.md:1
.kimi-gitea/skills/kaola-role-planner/SKILL.md:1
EXIT=0
```

18 rendered carriers, every count exactly 1. Combined with the twelve authored files, the pin ships
on 30 surfaces.

### Adjacent guards (not asked for; run because the change is a prompt surface)

```
$ node scripts/test-edition-sync.js
edition-sync tests passed (30 assertions)                                       EXIT=0

$ node scripts/test-opencode-edition.js
opencode-edition test passed (563 assertions).
[drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)] EXIT=0

$ node scripts/test-kimi-edition.js
kimi-edition test passed (521 assertions).
[drift-check: 3 tree(s) in parity (.kimi, .kimi-gitlab, .kimi-gitea)]            EXIT=0

$ node scripts/kaola-workflow-prose-census.js
(report only; distinct_conditions 121, routing_surface_lines 6647)               EXIT=0
```

### Walkthrough — full scope, not the sampled shard

```
$ node scripts/simulate-workflow-walkthrough.js
...
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":209,"ran":209,"passed":209,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2400}
EXIT=0
```

209 of 209 scenarios ran and passed — `total:1` confirms this was the whole suite, not a shard.

### Parity guard, re-run last (the test author was editing concurrently)

```
$ node scripts/test-agent-profile-parity.js
agent-profile parity tests passed (808 assertions)
EXIT=0
```

Same count as the first post-change run, so nothing landed between them that moved the guard.

### The tracked change set, in full

```
$ git diff --name-only
agents/code-architect.md
agents/implementer.md
agents/planner.md
docs/decisions/0017-the-mission-list.md      <- NOT MINE (concurrent agent)
plugins/kaola-workflow-gitea/agents/code-architect.toml
plugins/kaola-workflow-gitea/agents/implementer.toml
plugins/kaola-workflow-gitea/agents/planner.toml
plugins/kaola-workflow-gitlab/agents/code-architect.toml
plugins/kaola-workflow-gitlab/agents/implementer.toml
plugins/kaola-workflow-gitlab/agents/planner.toml
plugins/kaola-workflow/agents/code-architect.toml
plugins/kaola-workflow/agents/implementer.toml
plugins/kaola-workflow/agents/planner.toml
scripts/test-agent-profile-parity.js         <- NOT MINE (test custody)
```

`agents/build-error-resolver.md` and `CLAUDE.md` are absent, as required.

## Constraint compliance

- **No vendor, no model, no provenance** in the added text — the block names no tool, no model, no
  issue number, and gives no rationale for why the rule exists.
- **`agents/build-error-resolver.md` and `CLAUDE.md` untouched** — confirmed absent from `git diff`.
- **`## Agent Model Dispatch` not added anywhere** — the added heading is `## Solution ladder` only.
- **No test file written.** `scripts/test-agent-profile-parity.js` was read, never opened for write.
- **Not committed.** All changes are left in the working tree.

## Verification tier

`regression-green` — the full existing suite green before AND after. This is a prose change to agent
profiles with no new behavioral code path of its own; what it can break is the parity/edition guards
and the walkthrough, and all of them were green before and are green after.

## Left undone / for the orchestrator

- **`CHANGELOG.md` under `[Unreleased]` is not written.** The change is user-visible (three roles
  gain a section; `code-architect` loses two bullets), so it owes a CHANGELOG entry — but the brief
  scoped me to the twelve carriers and the regeneration, and did not assign it. Flagging rather than
  expanding scope; also worth checking whether `README.md` or `docs/` describe `code-architect`'s
  Architecture Design bullets, which I did not survey.
- **Not committed**, per the brief. Everything sits in the worktree.
- **Nothing else was blocked.** No capability was missing; no part of the assignment was skipped.

## Progress log

- [x] read the frozen text and all twelve targets
- [x] apply edits (12 carriers)
- [x] regenerate additive editions (6 trees)
- [x] verify (parity guard, byte-identity, pins, harmonization, edition guards)
- [x] walkthrough at full scope — 209/209, exit 0
