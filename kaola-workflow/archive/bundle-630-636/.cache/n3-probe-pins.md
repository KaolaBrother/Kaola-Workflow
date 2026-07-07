evidence-binding: n3-probe-pins 144510ab68d9
## n3-probe-pins — the pin/contract surface + #636 relocation map

### Route-reachability pin inventory (scripts/test-route-reachability.js, 497 lines)
Helpers: `assert()` (19), `norm()` (24, whitespace-collapse, line-wrap tolerant; same as validate-*-contracts norm()).

| Pin | Lines | Token(s) | File list | Mode |
|---|---|---|---|---|
| T1 | 82–91 | emittedSkillTargets → skillsDir/target/SKILL.md | 3 Codex skills dirs | existence |
| T2 | 93–102 | emittedCommandTargets → commandsDir/target.md | 3 Claude commands dirs | existence |
| T3 | 104–119 | RED-proof: dropping PLAN_RUN/ADAPT SKILL flags exactly 2 unreachable | synthetic gitlab set | structural |
| T4 | 121–134 | issue_numbers/--issue-numbers (finalize SKILL); plan-run route + auto-bundle (next SKILL) | per Codex edition | exact |
| T5 | 136–175 | `<!-- PIN: frontier unit -->` + `frontier unit` | 6 plan-run | exact; self-disarming anyHasPin gate HARDENED by #505 |
| **T5b** | 177–217 | `fork_turns: "none"`, `reasoning_effort: dispatch.codex_reasoning_effort`, `fresh child-session effort proof`, `codex_effort_override_unavailable`, sonnet-absent (3 variants); sub-block 205–216 `model: standard`->`high` + legacy alias, SKILL-filtered via codexSkillSurfaces (209) | CORE block: **6 plan-run** (191–203); sub-block: 3 SKILLs only | exact .includes (no norm) |
| T6 | 219–243 | `<!-- PIN: closure-audit -->` + `closure-audit` | 6 finalize | exact; unconditional (comment notes NOT replicating T5 warn-gate bug) |
| T7 | 245–274 | `<!-- PIN: claim-escalate -->` + `result: escalate` | 12: adapt×6 + next×6 | exact |
| T8 | 276–298 | `<!-- PIN: leg-isolation-recipe -->` + `--write-overlap-consent` | 6 plan-run | exact |
| T9 | 300–321 | `<!-- CARD: speculative-open -->` + `--speculative-consent` | 6 plan-run | exact |
| T10 | 323–352 | `<!-- PIN: fast-compliance-backstop -->` + `fast_compliance_unresolved` | 12: fast×6 + finalize×6 | exact |
| T11 | 354–388 | `<!-- PIN: adaptive-default-contract -->` + `path_not_installed` | 12: fast×6 + full-entry×6 | exact |
| T12 | 390–422 | card-acquisition + `Every spawn parameter comes from the dispatch card.` + announcement/close-echo formats | 6 plan-run | norm()-wrapped |
| T13 | 424–443 | `--codex-dispatch-mode` | 6 Codex-only (next+adapt SKILLs ×3) | exact |
| **T14** | 445–466 | `spawn each node's role agent as a NAMED teammate` + `send EXACTLY ONE request for the deliverable, then wait` | **6 plan-run** | norm()-wrapped |
| T15 | 468–490 | `<!-- PIN: gate-instrumentation-provisioning -->` + `KAOLA_GATE_WINDOW_FENCE=0` | 6 plan-run | exact |

### #636 T5b/T14 relocation surface — EXACT current assertions (the money map)
Both T5b and T14 iterate the SAME six-file `planRunSurfaces` array (commands ×3 + SKILLs ×3):
- test-route-reachability.js:183–190 (array), applied UNFILTERED 191–203 → T5b asserts fork_turns/reasoning_effort/effort-proof/codex_effort_override tokens on the 3 Claude COMMANDS too (only the 205–216 sub-block is already SKILL-filtered — partial precedent).
- Same array re-declared 451–458, applied unfiltered 459–465 → T14 asserts NAMED-teammate + one-nudge on the 3 Codex SKILLs too.
- THIS is why #627 fix#2 couldn't be prose-only: the harness itself hard-asserts both token sets on BOTH runtimes.

**Every file:line that MUST move together for #636:**
1. `scripts/test-route-reachability.js:183–190` + `:451–458` — split shared planRunSurfaces into command-only vs SKILL-only lists (T5b→SKILL-only, T14→command-only).
2. `scripts/validate-workflow-contracts.js:957–961` (DELETE T5b-on-command — the single claude-chain command copy) + `:983–990` (shrink `planRunSurfaces606` T14 array to commands-only, drop the 3 SKILL entries 987–989).
3. `scripts/validate-kaola-workflow-contracts.js:642–644` (DELETE T14-on-github-SKILL).
4. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:792–794` — remove T14 from the SKILL iteration of a SHARED `for (const planRunSurface of [command, SKILL])` loop (774–814) that also carries #602/#604/#605/#607/#611/join-protocol tokens → requires splitting the loop or hoisting T14 to a command-only list (NOT a clean single delete).
5. `plugins/kaola-workflow-gitea/...gitea-contracts.js:797–799` — same shared-loop split.
6. `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — BYTE-IDENTICAL mirror of #2 (validate-script-sync.js BYTE_IDENTICAL_GROUPS:52); any edit must be copied byte-for-byte or validate-script-sync reds.
- NOTE: no validator pins T5b tokens on the gitlab/gitea COMMANDS today — only the github command (claude validator). So T5b's command-side removal is a SINGLE deletion, not three.

Package→validator identity (package.json 37–40): claude→validate-workflow-contracts.js; codex→validate-kaola-workflow-contracts.js; gitlab→gitlab-contracts.js; gitea→gitea-contracts.js.

### Guards a generated/edited surface must satisfy
- **PROVENANCE_BAN** `/#\d{1,4}|D-\d{3}-\d{2}|\bINV-\d+|ADR[ -]\d{2,4}|\b(?:PR|MR|AC)#\d+/` in all four validators + opencode test. Scans agents/commands/SKILLs per-line; DOES NOT exempt HTML comments — a skeleton/slot marker like `<!-- see #630 -->` trips it. (validate-workflow-contracts 1112–1139; validate-kaola-workflow-contracts 887–913; gitlab 988–1007; gitea 993–1012; opencode ~213–225.)
- **B2 model-noun purge** (codex/gitlab/gitea validators, e.g. validate-kaola-workflow-contracts 915–953): bans bare opus/sonnet/haiku on Codex agents.toml/SKILLs except 3 whitelisted legacy-alias shapes.
- **Forge-neutral CLI-token ban** (conventions.md 128–139, `--forbidden-only`): no gh/glab binary, forge brand, or PR/MR request nouns in plugin surfaces.
- **Six-surface propagation + skeleton/cards** (conventions.md:74, 182–199, D-445-01): plan-run command is meant to be a ~150-line skeleton with rare-branch prose in `docs/plan-run-cards/*.md` (`<!-- CARD: name -->` markers at plan-run.md:117,121,210,401). CURRENTLY 375 lines (T5b/T14/T12/T15 prose accreted onto skeleton). A generation seam must classify relocated runtime-dead prose as skeleton-resident (still six-surface-obligated) vs card (single-sourced) — a convention-gated choice.
- **"Hidden shared surface" disjointness trap** (conventions.md:263): the contract-validator prompt-needle pins are explicitly named as a freeze-time false-disjoint risk — if #636 relocation is split into parallel legs, both editing the same validator files is exact-overlap; the planner must serialize (declare, not auto-enforced beyond the barrier).

### n3 conclusion for the fold decision
The #636 relocation is a BOUNDED, fully-mapped SCRIPT edit (6 locations, mostly deletions + array/loop splits) — tractable and INDEPENDENT of #630's generation engine. It does NOT require the generation seam to ship. So the fold decision is genuinely open: (a) #636 standalone script run (small, mapped), OR (b) fold into #630's generation (dead-prose fencing falls out once surfaces are generated from a canonical with runtime-conditional slots).

delegation_outcome: completed
