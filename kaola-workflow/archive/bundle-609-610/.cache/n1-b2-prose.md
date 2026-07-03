evidence-binding: n1-b2-prose 953be5f51934

RED: `node scripts/validate-kaola-workflow-contracts.js` (new B2 + constraint assertions, pre-prose-fix) throws `Error: commands/workflow-init.md must include: never by a vendor model name` (constraint-present RED); a reversible injection of "The Opus orchestrator" into contractor.toml makes the same validator throw `plugins/kaola-workflow/agents/contractor.toml:9: B2 model-noun "Opus" — a Claude model name must not appear as runtime-model prose on a Codex surface` (B2-scan RED). Standalone matcher probe over the 3 codex trees reported TOTAL B2 violations: 30 (10 per tree); the B1 `model: opus` -> `xhigh` mapping and the `{opus|sonnet}` set literal were correctly NOT flagged.

GREEN: after the prose rewrite + init constraint, all five gates pass — validate-workflow-contracts.js (byte pair), validate-kaola-workflow-contracts.js, validate-kaola-workflow-gitlab-contracts.js, validate-kaola-workflow-gitea-contracts.js all print "…validation passed" (EXIT 0); test-route-reachability.js prints "Route-reachability test passed (257 assertions)." B2 matcher probe reports TOTAL B2 violations: 0 (EXIT 0). Constraint sentence present on 6/6 init surfaces. Only 9 opus/sonnet occurrences remain across the 3 codex trees, all B1 (`{opus|sonnet}` set literal + `model: opus`/`model: sonnet` effort mapping).

## Surface checklist (all ×3 codex trees: kaola-workflow / -gitlab / -gitea)
- agents/workflow-planner.toml:43 "Model assignment" — rewritten to tier vocabulary + codex effort mapping (reasoning tier -> xhigh, standard tier -> high); kept `{opus|sonnet}` set literal phrased as ranks; killed "no haiku" + "opus ~= 5x sonnet".
- agents/synthesizer.toml:2 (description) + :10 — "reasoning-class (Opus)" -> "reasoning-class, held to a non-lowerable reasoning-tier floor".
- config/agents.toml:60 (synthesizer entry) — same description rewrite as synthesizer.toml:2.
- agents/contractor.toml:9 — "The Opus orchestrator" -> "The orchestrator".
- skills/kaola-workflow-adapt/SKILL.md:24-30 — model-column bullet rewritten in tier vocabulary, kept `{opus|sonnet}` set literal; :146 dropped "(Opus)" after "workflow-planner agent role**".
- skills/kaola-workflow-plan-run/SKILL.md:76 — B1 `model: opus` -> `xhigh` / `model: sonnet` -> `high` mapping KEPT VERBATIM (pinned by contract-validator + route-reachability T5b), reframed as "planner tier RANK tokens … not runtime model names … on this Codex runtime"; :297 "**Opus**-floor `synthesizer`" -> "(non-lowerable floor) `synthesizer`".
- 6 workflow-init surfaces (3 commands + 3 init SKILL packs) — added the constraint bullet after "Name nodes by function", identically inside the KW-CLAUDE-TEMPLATE region so template byte-parity (within-pair + cross-forge modulo forge noun) holds: "Name roles by function and reasoning tier, never by a vendor model name — write `planner (reasoning tier)`, not `planner (<model>)`. Keep this section runtime-neutral …".
- Machine enforcement: B2 negative scan added to validate-kaola-workflow-contracts.js + gitlab/gitea twins (scan agents/*.toml + config/agents.toml + skills/*/SKILL.md, NOT commands/); constraint-present assertion on all six initFiles in the codex validator + on the root command in the claude byte-pair validator (both copies).

## B1-vs-B2 boundary design (matcher crux)
Matcher = strip the two legitimate B1 forms, then flag any surviving `\b(opus|sonnet|haiku)\b` (case-insensitive):
- strip `/\{opus\|sonnet\}/g` — the closed model-column tier-token SET literal (rank tokens).
- strip `/model:\s*(?:opus|sonnet)\b/g` — the `model: opus`/`model: sonnet` -> effort mapping tokens.
Catches every B2 prose noun (a capitalized "Opus" is never stripped since strip is lowercase-only) yet passes the B1 tier tokens. Proven: pre-fix probe caught 30 B2 sites and left the mapping/set-literal lines untouched. Scope = codex/forge-codex prompt surfaces only; forge commands/*.md (Claude-edition ports carrying legitimate model nouns) are deliberately NOT scanned, and the CLAUDE-edition root agents/*.md + commands/ are untouched.

## Verification results
- validate-workflow-contracts.js: PASS (EXIT 0)
- validate-kaola-workflow-contracts.js: PASS (EXIT 0)
- validate-kaola-workflow-gitlab-contracts.js: PASS (EXIT 0)
- validate-kaola-workflow-gitea-contracts.js: PASS (EXIT 0)
- test-route-reachability.js: PASS, 257 assertions (EXIT 0)
- B2 grep of 3 codex trees (agents+config+skills): 9 remaining, all B1.
- Byte-parity preserved: TOMLs 3-way identical; claude validator byte pair identical; adapt/plan-run B2 lines identical across trees.
- Did NOT run the full four chains (n8 gate owns those), per the leg brief.

## Deviations / boundary calls
- workflow-init template line "pass the role's configured model on the spawn call" (issue item-6 sibling check): LEFT UNCHANGED. It contains no vendor model noun (not a B2 leak), and the KW-CLAUDE-TEMPLATE byte-parity contract (extractClaudeTemplate: the codex SKILL template MUST equal the Claude command template within each forge pair) forbids diverging the codex SKILL copy per-runtime — that would red the contract chain. The generated CLAUDE.md is a shared Claude-shaped artifact; the opencode init variant is the sibling opencode leg's concern. Accuracy-first: not breaking a machine-enforced contract for a non-B2 phrasing tweak the issue itself flags only as "verify".
