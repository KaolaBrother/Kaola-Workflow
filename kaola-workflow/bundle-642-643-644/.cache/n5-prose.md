evidence-binding: n5-prose 35e051b206b4

task: n5-prose (implementer, standard) — edit the generation-seam SOURCE
(`templates/routing/plan-run.skeleton.md` + `required-blocks.js`) and regenerate the six
plan-run routing surfaces, per the architect's (n1) blueprint sections "#642 (f) Resume
re-hydration", "#643 (f) x6 role-kind enumeration re-derivation", and "Per-node routing ->
n5-prose", plus the frozen plan's n5-prose Plan Notes. Read n1-architect's full evidence file
(kaola-workflow/bundle-642-643-644/.cache/n1-architect.md, evidence-binding nonce
416c5fde30b3, verified from the parent worktree since the leg does not carry it) before any
edit, and the frozen workflow-plan.md Plan Notes for n5-prose (parent worktree
kaola-workflow/bundle-642-643-644/workflow-plan.md lines 32, 142-155, 225).

Changes (via the skeleton, never a hand-edited generated surface):
1. Step-3 dispatch instruction block ("Instruct the role to:") — added a `<!-- PIN:
   node-briefs-relay -->` anchor plus two relay bullets: (i) carry `dispatch.goal_line`
   VERBATIM into the role dispatch as the node's task direction when present; (ii) instruct
   the role to READ each `dispatch.upstream_evidence` file before starting and record a
   column-0 `upstream_read: <node-id> <nonce>` line, copying the nonce from line 1 of that
   upstream file (never from the card).
2. Orient/resume prose — added a resume re-hydration line: on resume/compaction, the
   in-progress node's re-dispatch context (goal_line + upstream_evidence) is re-derived from
   the cached `.cache/<op>-envelope.json`; disk is authoritative, never reconstruct from
   memory.
3. Replaced the stale role-kind enumeration (former "READ-ONLY roles
   (code-explorer, knowledge-lookup, adversarial-verifier, and the planner)" / "WRITE-role
   agents (implementer, tdd-guide, metric-optimizer)" hand-lists) with a manifest-derived
   sentence: any node role WITHOUT `Write` in its tool manifest RETURNS its deliverable for
   orchestrator persistence via `record-evidence --stdin`; any role WITH `Write` SELF-WRITES —
   current roster listed as EXAMPLES only (read producers: code-explorer, knowledge-lookup,
   code-architect, planner, issue-scout; read gates: adversarial-verifier, code-reviewer;
   write roles: implementer, tdd-guide, metric-optimizer, build-error-resolver, doc-updater,
   synthesizer).
4. Added one new entry to `templates/routing/required-blocks.js`'s REQUIRED_BLOCKS manifest
   (`pr-node-briefs-relay`, topic plan-run, runtime_tag/surface_type_tag both) — discovered
   genuinely necessary by running `scripts/test-route-reachability.js` after the first
   regeneration: the new `<!-- PIN: node-briefs-relay -->` marker tripped the reverse
   orphan-sentinel on all six surfaces (an in-scope marker with no manifest block). Since
   `required-blocks.js` is inside this node's declared write set (and NOT inside n6-enforcement's
   declared write set — n6 only touches the validator/reachability scripts themselves), this
   node closes the gap rather than leaving the reachability suite red for n6 to inherit.
   `slots.js` was NOT touched — every added sentence is raw skeleton text with no
   surface_type/forge divergence, so no new SLOT/SPLICE entry was needed.
5. Ran `node scripts/generate-routing-surfaces.js --write` to regenerate all 12 tracked
   surfaces (plan-run x6 + next x6); only the plan-run x6 changed (next.skeleton.md untouched
   -> byte-identical, confirmed by `git status`).

All added prose is forge-neutral (no gh/glab/tea or brand nouns) and carries no issue refs
(#NNN) or decision IDs, per the provenance-out-of-agent-facing-prompts rule.

non_tdd_reason: glue/wiring — this is a generated-prose template edit through the routing
generation seam (templates/routing/plan-run.skeleton.md + required-blocks.js are the single
source; the six commands/SKILL.md surfaces are machine-derived output, never hand-edited).
Correctness is machine-enforced by `generate-routing-surfaces.js --check` (byte-identity
between skeleton and committed surface) and `scripts/test-route-reachability.js`'s
derived-universe manifest presence + reverse orphan-sentinel checks (both re-run and green
after this change) plus the walkthrough integration suite — there is no unit behavior here to
TDD; it is prose composed through an existing generation contract.

verification_tier: build-green

write_set (files actually changed):
- templates/routing/plan-run.skeleton.md
- templates/routing/required-blocks.js
- commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
(templates/routing/slots.js was NOT modified — no new SLOT/SPLICE variant was genuinely
needed; every added line renders identically across surface_type and forge.)

verification_commands (leg cwd
/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/bundle-642-643-644/n5-prose):
1. `node scripts/generate-routing-surfaces.js --write` (BEFORE required-blocks.js fix)
   -> "generate-routing-surfaces --write: rendered 12 surfaces." exit 0
2. `node scripts/generate-routing-surfaces.js --check`
   -> "generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton." exit 0
3. `git status --short` -> confirmed only the 6 generated plan-run surfaces +
   templates/routing/plan-run.skeleton.md changed (next x6 untouched)
4. `node scripts/test-route-reachability.js` (BEFORE the required-blocks.js fix)
   -> 7 FAILs: "orphan-surface: marker \"<!-- PIN: node-briefs-relay -->\" ... has no manifest
   block" (x6 surfaces) + the aggregate "MANIFEST: derived-universe presence check clean over
   96 obligated file-checks" assertion; "286 passed" — exit 0 but assertion failures printed
   (the harness prints FAIL lines without a nonzero process exit in this invocation; judged by
   line content, not just the shell exit code, per convention)
5. `git stash && node scripts/test-route-reachability.js && git stash pop` — confirmed the
   PRE-EDIT baseline is clean: "Route-reachability test passed (287 assertions)." exit 0 (this
   isolated the regression to the new unmapped marker, not a pre-existing break)
6. Added the `pr-node-briefs-relay` REQUIRED_BLOCKS entry to required-blocks.js.
7. `node scripts/test-route-reachability.js` (AFTER the fix)
   -> "Route-reachability test passed (287 assertions)." exit 0
8. `node scripts/generate-routing-surfaces.js --check` (re-run after the required-blocks.js
   edit, since required-blocks.js is loaded by the generator too)
   -> "generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton." exit 0
9. `node scripts/simulate-workflow-walkthrough.js` (run twice, once via background job
   bbqq068yv/by341ci87 and once via bzrrnrfd6/logged to scratchpad) -> both runs end
   "Workflow walkthrough simulation passed" exit 0

before_result: on a clean checkout (pre-edit), `generate-routing-surfaces --check` was already
green (skeleton reverse-engineered from the committed surfaces), `test-route-reachability.js`
passed 287 assertions, and `simulate-workflow-walkthrough.js` passed. This node's write set
had zero uncommitted diff at start (`git status` clean before any Edit).

after_result: `generate-routing-surfaces --check` green (12/12 surfaces byte-match the
skeleton), `test-route-reachability.js` green (287 assertions, no orphan-surface/missing-token
failures), `simulate-workflow-walkthrough.js` green (all listed tests PASSED, "Workflow
walkthrough simulation passed"). `git status --short` shows exactly 8 modified files, all
inside the declared write set for this node (6 generated surfaces + the skeleton +
required-blocks.js); no other file touched.
