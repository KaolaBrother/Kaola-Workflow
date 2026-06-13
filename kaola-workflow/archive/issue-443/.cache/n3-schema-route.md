evidence-binding: n3-schema-route 9524c5aae726

task: Add `AUTO_COMMAND='/kaola-workflow-auto'` + `AUTO_SKILL='kaola-workflow-auto'` constants to kaola-workflow-adaptive-schema.js, export them, propagate verbatim to all four edition copies.

non_tdd_reason: Scaffolding/boilerplate — two inert exported string literals with no behavioral logic; no meaningful failing unit test exists for a pair of string constants. Correctness proof = require() returns the expected strings + validate-script-sync confirms byte parity ×4. Consumed by downstream n2/n8.

verification_tier: build-green

write_set (byte-identical group):
- scripts/kaola-workflow-adaptive-schema.js (canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js

canonical edit:
1. After ADAPT_SKILL:
   `const AUTO_COMMAND = '/kaola-workflow-auto';`
   `const AUTO_SKILL = 'kaola-workflow-auto';`  (with #443 forge-neutral comment)
2. module.exports gains `AUTO_COMMAND, AUTO_SKILL,` after ADAPT_SKILL.

verification (build-green):
- `node -e require(adaptive-schema).AUTO_COMMAND/AUTO_SKILL` → exit 0, "AUTO_COMMAND/AUTO_SKILL exported OK"
- four-way cmp → all OK (plugins/kaola-workflow, gitlab, gitea byte-identical to canonical)
- `node scripts/validate-script-sync.js` → exit 0: "OK: 22 common scripts, 30 byte-identical groups, 5 rename-normalized families, and 1 config/hooks.json family in sync."

after_result: build-green — exports present, all four editions byte-identical, validate-script-sync parity-clean (adaptive-schema group enrolled, unchanged count).
