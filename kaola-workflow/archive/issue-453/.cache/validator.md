evidence-binding: validator 37f3c2ccb44e

RED: cd worktree && node scripts/simulate-workflow-walkthrough.js failed at the A2 FILE_CEILING fixture (scripts/simulate-workflow-walkthrough.js:3071):
  "A2: root files must count toward FILE_CEILING, got: {"result":"in-grammar",...,"nodeCount":3,...}"
The upstream schema node removed FILE_CEILING from the worktree schema, so schema.FILE_CEILING is undefined, 7 > undefined is false, the 7-file node is no longer refused, and the fixture's `result === 'refuse' && /FILE_CEILING/` assertion fails. This is the test encoding the now-retired per-node ceiling.

GREEN (transform, all in the worktree):
- Removed the dead `if (n.writeSet.size > schema.FILE_CEILING) { errors.push(...) }` block + the header "caps: … FILE_CEILING per node …" comment + reworded the "Placed BEFORE the FILE_CEILING check …" placement comment, identically across all 4 plan-validator ports (root + codex byte-pair + gitlab/gitea rename-normalized).
- Flipped the A2 walkthrough fixture from a FILE_CEILING refusal to a POSITIVE (the headline AC): a single write-role node declaring 12 exact slash-bearing files (src/a.js … src/l.js), post-dominated by code-reviewer, now asserts result === 'in-grammar'.
- Rescoped the two A3 comments (22-path/5-node) from "FILE_CEILING=6 -> 5 impl nodes" to attribute the split to byte-group co-occurrence + forge-port ordering; A3 SURFACE_NODES rows + assertions unchanged (count-independent agent-registration union check still green).

New A2 positive node row:
| impl | tdd-guide | — | src/a.js, src/b.js, src/c.js, src/d.js, src/e.js, src/f.js, src/g.js, src/h.js, src/i.js, src/j.js, src/k.js, src/l.js | 1 | sequence |

Verification (all exit 0, run from the worktree):
1. node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed" exit 0
2. node scripts/validate-script-sync.js → "OK: 23 common scripts, 30 byte-identical groups, 6 rename-normalized families, and 1 config/hooks.json family in sync." exit 0 (root↔codex plan-validator byte-pair stayed identical; gitlab/gitea rename-normalized intact)
3. node -e "require('./scripts/kaola-workflow-plan-validator.js')" → "loads" exit 0
4. grep -rn FILE_CEILING across the 4 validator ports → no matches, exit 1 (fully absent)
All negative shape/disjointness/generated_port_split/concurrent-overlap fixtures untouched and still green (only the count rule was removed).

write_set: scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js
