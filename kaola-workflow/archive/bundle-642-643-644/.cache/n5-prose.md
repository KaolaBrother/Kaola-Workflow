evidence-binding: n5-prose 2dedd0d00b26

task: n5-prose REOPEN (implementer) — fix the n8-cr-surface gate's non-blocking nit R2,
operator-mandated in-run: the manifest-derived role-kind enumeration's read-gate examples in
`templates/routing/plan-run.skeleton.md` listed `adversarial-verifier` / `code-reviewer` but
omitted `security-reviewer` (equally read-kind by tool manifest). Added ` / `security-reviewer``
to that example list (one word-level edit, reflowed onto a continuation line for line length),
then regenerated the six plan-run surfaces through the generation seam. Environment change
honored: leg worktree gone; all work done in the parent worktree
/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-642-643-644.

Prior scope statement: the gate-reviewed original n5-prose scope STANDS unchanged (the two
step-3 relay bullets + `<!-- PIN: node-briefs-relay -->` anchor, the resume re-hydration line,
the manifest-derived role-kind enumeration, and the `pr-node-briefs-relay` REQUIRED_BLOCKS
manifest entry — all already committed and verified clean by n8-cr-surface). This reopen adds
exactly ONE example word to the read-gate roster; nothing else was touched. n1-architect's
blueprint and the frozen Plan Notes were read in the original pass and remain the design basis.

non_tdd_reason: glue/wiring — a one-word example-roster completion in generated prose, edited
through the routing generation seam (skeleton is the single source; the six surfaces are
machine-derived) and machine-enforced by `generate-routing-surfaces.js --check` byte-identity
plus the route-reachability pins (T16 + the required-blocks manifest). No unit behavior exists
to test-first.

verification_tier: build-green

write_set (files actually changed this reopen):
- templates/routing/plan-run.skeleton.md
- commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
(templates/routing/slots.js and templates/routing/required-blocks.js: zero diff this reopen —
confirmed via git diff. All 7 changed files show the identical 3-line diff.)

verification_commands (cwd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-642-643-644):
1. Pre-edit needle audit: inspected T16 (`scripts/test-route-reachability.js:488-530`) — its
   whitespace-normalized `present` needles ('<!-- PIN: node-briefs-relay -->', 'carry it
   VERBATIM into the role dispatch', 'record a column-0 `upstream_read: <node-id> <nonce>`
   line', 're-derived from the cached `.cache/<op>-envelope.json`', "derived from each role's
   tool manifest") and `stale` needles ('**READ-ONLY roles**', '**WRITE-role agents**') do NOT
   cover the read-gate example fragment being edited, so no pin-needle edit (n6's file) was
   needed and none was made.
2. `node scripts/generate-routing-surfaces.js --write`
   -> "generate-routing-surfaces --write: rendered 12 surfaces." exit 0
3. `node scripts/generate-routing-surfaces.js --check`
   -> "generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton." exit 0
4. `node scripts/test-route-reachability.js`
   -> "Route-reachability test passed (329 assertions)." exit 0 (T16 green — the word addition
   did not break any whitespace-normalized pin)
5. `git status --short` scoped to the write-set band + `git diff --stat` -> exactly the
   skeleton + the 6 plan-run surfaces modified (7 files, identical 3-line diff each); slots.js
   and required-blocks.js clean; no file outside the declared write set touched by this node
   (the parent worktree's other dirty files belong to other nodes' committed-baseline state,
   untouched by me).

before_result: at reopen (fresh baseline), the prior n5-prose work was committed and
gate-verified clean; `generate-routing-surfaces.js --check` was green and
`test-route-reachability.js` passed 329 assertions against the committed tree; the read-gate
example list lacked `security-reviewer`.

after_result: skeleton + six surfaces carry `adversarial-verifier` / `code-reviewer` /
`security-reviewer` as the read-gate examples; `generate-routing-surfaces.js --check` green
(12/12 byte-match), `test-route-reachability.js` green (329 assertions, T16 positive and
negative pins intact), working diff on this node's write set is exactly the one-example
addition rendered identically across all six surfaces.
