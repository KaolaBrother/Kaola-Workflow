evidence-binding: n2-tdd-guide cf930f8030fd
<!-- RED: paste RED here -->
RED: node scripts/test-opencode-edition.js (pre-impl, schema still name-keyed):
  FAIL: S1: glm-5.2 max variant carries thinking {type:"enabled",budgetTokens:32000} (Anthropic contract), got {"reasoningEffort":"max"}
  FAIL: S1: glm-5.2 max variant does NOT carry reasoningEffort (Anthropic contract → thinking budget)
  FAIL: S1: glm-5.2 high variant carries thinking budgetTokens:16000
  FAIL: S1-contract[glm]: effortForProvider(zhipuai-coding-plan) → anthropic-contract thinking (not reasoningEffort)
  TypeError: schema.contractForProvider is not a function (test-opencode-edition.js:251) — contractForProvider absent pre-impl; exit 1.
  (RED is the expected failure of the new assertions, NOT a syntax error: schema still emitted reasoningEffort for GLM and had no contractForProvider.)
<!-- GREEN: paste GREEN here -->
GREEN: node scripts/test-opencode-edition.js → "opencode-edition test passed (300 assertions)." exit 0.
  node scripts/test-adaptive-node.js → "adaptive-node tests passed (1030 assertions)" (variant NAMES max/high preserved — Cases 4/5/6/7/9 green; only the options payload flipped).
  node scripts/validate-script-sync.js → "OK: 26 common scripts, 25 byte-identical groups ... in sync" (×4 schema copies md5 1f7cd6ee00e2c1edc2ffd377e410ece3 identical).
  Four cross-edition chains (#307): claude=0 ("Workflow walkthrough simulation passed"), codex=0 ("Kaola-Workflow walkthrough simulation passed"), gitlab=0 ("GitLab Codex workflow walkthrough simulation passed"), gitea=0 ("Gitea Codex workflow walkthrough simulation passed").
  node scripts/sync-opencode-edition.js --check → "15 agent(s) + 12 command(s) in parity with canonical."
  opencode.json: git diff empty (byte-identical neutral template, design §2.4 honored).
