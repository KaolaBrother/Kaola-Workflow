issue: #764
title: bug(workflow-init): generated CLAUDE.md still advertises the retired fast/full install opt-ins across all six init surfaces
status: open — independent staleness bug, not part of epic #757
workflow_project: —
next_step: Replace the "fast and full are install-time opt-ins (--with-fast / --with-full)" line across the six init surfaces (3 workflow-init commands + 3 kaola-workflow-init SKILLs) with adaptive-only wording; the flags are typed unknown-flag refusals (pinned by test-install-adaptive-config.js AC2 + test-claim-hardening.js). Sweep the surrounding section for other retired-path references. Keep the axiom-block byte-identity guard green. Cross-edition diff ⇒ all four chains.
