# Implementer review-fix evidence

Assigned task: add the Claude command-runtime reviewer contract to the canonical next/finalize
routing skeletons, regenerate the derived command surfaces, and preserve the declared additive
runtime divergence. Reviewer-class roles retain the reasoning-tier `opus` resting profile; the one
bounded heavy re-dispatch is permitted for an unfinished or pre-judged-complex review, uses `fable`,
and requires the dispatched surface plus acceptance criteria in every reviewer scope packet. The
command-only contract makes that exception executable: the bounded heavy review dispatch passes
`model="fable"` in place of the installed reviewer `opus` model; every resting reviewer dispatch
and all other roles keep their installed profile model.

Verification tier: tests-green

## Before

- `node scripts/test-route-reachability.js` — exit `1`; 4 T20 Claude-contract failures, 551 passed.

## After

- `node scripts/generate-routing-surfaces.js --write` — exit `0`; rendered 18 surfaces.
- `node scripts/test-route-reachability.js` — exit `0`; `Route-reachability test passed (557 assertions).`
- `node scripts/generate-routing-surfaces.js --check` — exit `0`; all 18 surfaces byte-match.
- `node scripts/test-grok-edition.js` — exit `0`; 564 assertions.
- `node scripts/test-cursor-edition.js` — exit `0`; 856 assertions.
- `node scripts/test-opencode-edition.js` — exit `0`; 684 assertions.
- `node scripts/test-kimi-edition.js` — exit `0`; 647 assertions.
- `git diff --check` — exit `0`; no output.

## Files changed

- `templates/routing/next.skeleton.md`
- `templates/routing/finalize.skeleton.md`
- `commands/workflow-next.md`
- `commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md`
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow-gitea/commands/workflow-next.md`
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md`
- `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js`
- This evidence file.

The existing test/validator/walkthrough edits in the worktree were preserved and not modified by
this implementation.

## Comment-parity follow-up

Updated the stale installer comment at line 121 in all three copies to name the
`standard/reasoning/heavy` metadata classes.

- `rg -n "retain only declarative standard/reasoning/heavy metadata classes" ...` — exit `0`; all
  three copies match at line 121.
- Byte-identity check across the three comment lines — exit `0`; `three installer comments
  byte-identical`.
- `git diff --check` — exit `0`; no output.
