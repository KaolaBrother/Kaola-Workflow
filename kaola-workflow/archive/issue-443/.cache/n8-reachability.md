evidence-binding: n8-reachability 1e819ecd382e

non_tdd_reason: Config/registry-pin — appending route targets + a phaseCommands parity entry to validator registry arrays has no natural failing unit test; correctness is structural (the arrays drive assertIncludes loops over filesystem surfaces), proved by validator behavior not RED→GREEN. Inert boilerplate extending an existing pattern.

verification_tier: build-green

per-file additions:
- scripts/test-route-reachability.js: emittedSkillTargets += schema.AUTO_SKILL; emittedCommandTargets += stripSlash(schema.AUTO_COMMAND). T3 dead-zone proof intact (unreachable.length===2).
- scripts/validate-workflow-contracts.js (claude canonical): emittedCommandTargets += stripSlash(schema.AUTO_COMMAND); phaseCommands += 'commands/kaola-workflow-auto.md' (parity with forge glob).
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js: cp from canonical, cmp IDENTICAL (#274 byte-pair).
- scripts/validate-kaola-workflow-contracts.js (github-codex): emittedSkillTargets += schema.AUTO_SKILL.
- plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js: emittedSkillTargets += schema.AUTO_SKILL; command/skill count assertions bumped 11→12.
- plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js: same as gitlab.

build-green verification:
- cmp claude validator byte-pair → IDENTICAL.
- node scripts/test-route-reachability.js → exit 0, "Route-reachability test passed (38 assertions)." (the n8 registry contract proper is GREEN).

EXPECTED transient (n5 hand-off, like n6→n7): node scripts/validate-workflow-contracts.js + the two forge validators exit 1 because the three kaola-workflow-auto.md command files lack `## Agent Model Badge` / `workflow-state.md` / `You MUST pass model=` / `model="{`. That command-file CONTENT is node n5's lane (command files), NOT n8's. It is added via a reopen of n5 immediately after this close. n8's contribution (the route pins + phaseCommands parity entry) is complete and correct; the per-node barrier checks only n8's 6 declared writes.

write_set (exactly the six declared, no out-of-lane writes): test-route-reachability.js, validate-workflow-contracts.js (+ codex byte-mirror), validate-kaola-workflow-contracts.js, validate-kaola-workflow-gitlab-contracts.js, validate-kaola-workflow-gitea-contracts.js.
