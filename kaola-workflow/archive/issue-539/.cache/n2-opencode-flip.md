evidence-binding: n2-opencode-flip 6044c6ff2d11
<!-- RED: paste RED here -->
RED: node scripts/test-opencode-edition.js → 4 failure(s), 279 passed (pre-impl, A22 assertions added before the transform)
- FAIL: A22: workflow-next has NO "## Startup Step 0a-1 — Path Intent" section (stripped at generation; opencode is adaptive-only-default)
- FAIL: A22: workflow-next has NO KAOLA_ENABLE_ADAPTIVE switch-resolution prose (Path Intent section stripped)
- FAIL: A22: workflow-next has NO Branch A/B path-selection prose (Path Intent section stripped)
- FAIL: A22: adapt has NO "downgrade to full path" auto-fallback wording (stripped at generation)
<!-- GREEN: paste GREEN here -->
GREEN: node scripts/sync-opencode-edition.js --write (2 file(s) updated: kaola-workflow-adapt.md, workflow-next.md) → node scripts/test-opencode-edition.js → opencode-edition test passed (283 assertions); A22 (5/5 assertions) green. Parity --check GREEN (15 agent(s) + 12 command(s)); simulate-workflow-walkthrough.js GREEN.
