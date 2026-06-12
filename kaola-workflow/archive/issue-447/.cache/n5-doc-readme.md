evidence-binding: n5-doc-readme d6ca82a9602e

# n5-doc-readme (doc-updater) — README to global Codex-hooks model (AC6)

Sections revised in README.md:
1. "Trust the hooks" subsection: hooks install GLOBALLY into ~/.codex/hooks.json + ~/.codex/kaola-workflow/{hooks,scripts},
   covering all projects; profiles + .codex/config.toml stay project-local; /hooks is one-time-per-machine
   (trust survives across projects/upgrades unless hook content changes); bypass mechanics unchanged.
2. Upgrade code-block comment: installer also refreshes the global hooks.
3. Verify paragraph: points at the global hook home (~/.codex/hooks.json + ~/.codex/kaola-workflow/{hooks,scripts}).
4. Doctor/scope paragraph: REPLACED the old "project-local only / user scope intentionally empty / don't install into ~/.codex"
   text — now: profiles project-local (project scope authoritative); hooks global by design; a user-scope profile `stale`
   is benign and not a hook problem.
5. "Codex lifecycle hooks" section intro: replaced project-local framing with the global model (one install covers all
   projects; upgrade force-refreshes the global copy).
6. Matcher note + Uninstall scope caveats: updated to ~/.codex/hooks.json (global); uninstall cleans the global hooks,
   profiles removed from the project dir.

Old 614c19f2 project-local framing: fully removed. Remaining "project-local .codex/hooks.json" mentions are
corrective/contrasting clauses ("not in a project-local …"), not affirmative claims.

Verification: node scripts/validate-workflow-contracts.js → "Workflow contract validation passed" (exit 0);
all README anchor strings intact.
