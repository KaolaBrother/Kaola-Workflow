# Workflow Plan — issue-352

<!-- plan_hash: f4ef7a3d602cb1441050ef4c31971c1a2f1358a56621961293385b2b05c0fc61 -->

bug(init): hardcoded maintainer machine path shipped in workflow-init (×3 editions)

## Meta

labels: bug, area:workflow-phases

## Problem

`commands/workflow-init.md:18` and its two forks (`plugins/kaola-workflow-gitlab/commands/workflow-init.md`,
`plugins/kaola-workflow-gitea/commands/workflow-init.md`) ship the maintainer's absolute machine path
`/Volumes/WorkspaceA/ylminiserver/workspace/andrej-karpathy-skills/...` as the preferred Karpathy skills
source — a personal path shipped to every consumer in three editions.

## Scope notes (authoring evidence)

- The offending path sits at **line 18**, OUTSIDE the byte-locked `KW-CLAUDE-TEMPLATE` region
  (lines 84–164). So the FIX TEXT itself does not touch the locked region; the SKILL.md partners
  stay byte-identical to their command partners through the edit.
- BUT the plan-validator #301 co-occurrence check is PATH-EXACT: declaring any
  `commands/workflow-init.md` in a node's write set forces its byte-identical init-SKILL partner
  co-present in the SAME node. Editing all three command editions therefore pulls all three
  `skills/kaola-workflow-init/SKILL.md` partners into the same write set — 6 paths = FILE_CEILING.
- This is ONE semantic change spanning three editions that fits under the ceiling, so per #309 it is
  authored as ONE implement node with a SHARED CANONICAL SPEC (below), not split — splitting risks
  divergent prose across editions and would trip the #301 sync-group gap.

## Shared canonical spec (binds node1 — all editions converge by construction)

In each of the three `commands/workflow-init.md` editions, replace the hardcoded absolute maintainer
path on line 18 with an environment/parameter-driven source that carries NO machine-specific absolute
path. Concretely, drop the `/Volumes/WorkspaceA/...` literal and prefer either (a) an env var with a
documented relative-default discovery instruction, or (b) the relative `../andrej-karpathy-skills/...`
sibling discovery already present on line 19, promoted to first preference, with the concise in-command
fallback when neither resolves. Apply the IDENTICAL textual rewrite to all three editions modulo forge
nouns — the editions must read identically in this block (it is outside the locked region but the
three command files currently carry byte-identical line-18 text). Each `SKILL.md` partner is pulled in
only to satisfy the #301 path-exact co-occurrence guard; its KW-CLAUDE-TEMPLATE region must remain
byte-identical to its command partner after the edit (do not touch lines 84–164). Acceptance:
`grep -rn '/Volumes/WorkspaceA' commands plugins` is clean.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| node1 | implementer | — | commands/workflow-init.md plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md plugins/kaola-workflow-gitlab/commands/workflow-init.md plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md plugins/kaola-workflow-gitea/commands/workflow-init.md plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md | 1 | sequence |
| node2 | code-reviewer | node1 | — | 1 | sequence |
| node3 | doc-updater | node2 | CHANGELOG.md | 1 | sequence |
| finalize | finalize | node3 | CHANGELOG.md | 1 | sequence |

non_tdd_reason (node1): prose/markup edit to command + skill instruction text (remove a hardcoded
absolute path); there is no behavioral unit under test. Verification is grep-cleanliness plus the four
cross-edition contract chains (template byte-groups + grep), not a failing unit test.

## Node Ledger

| id | status |
| node1 | complete |
| node2 | complete |
| node3 | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (node1) | subagent-invoked | # node1 — implementer evidence (issue #352) | |
| code-reviewer | subagent-invoked | verdict: pass | |
| doc-updater (node3) | subagent-invoked | # node3 — doc-updater evidence (issue #352) | |
| finalize (finalize) | subagent-invoked | # finalize — sink node evidence (issue #352, main-session bookkeeping) | |
