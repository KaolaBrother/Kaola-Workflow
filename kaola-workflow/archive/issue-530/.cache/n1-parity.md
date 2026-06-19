evidence-binding: n1-parity 2302e630e5eb

# n1-parity — edition-machinery boundary + generation parity (code-explorer, read-only)

## Dimension #1 — Generation parity / leaked Claude constructs

**A6 byte-identical regeneration: CONFIRMED by construction.** `test-opencode-edition.js:136-140` (agents) and `:153-157` (commands) assert `read('.opencode/...') === sync.renderAgent/renderCommand(...)`. Renderers are pure (`sync-opencode-edition.js:139-163` renderAgent, `:235-246` renderCommand); no env/randomness in the agent/command path. `--check` (`:532-572`) re-applies the same equality.

**Commands are REWRITTEN (not byte-copied)** via `transformCommandBody` (`sync-opencode-edition.js:183-233`); frontmatter is also rewritten by `renderCommand` to keep only `description`.

Rewrite map — what IS neutralized (with citation):
- `## Agent Model Badge` block body → `OPENCODE_BADGE_BLOCK` (`:189-194`, `:171-181`) — neutralized
- `Pass model=dispatch.model …` (plan-run) (`:203-206`) — neutralized
- `You MUST pass model= … do not omit` (adapt) (`:210-213`) — neutralized
- `For every … include the explicit model=` (phase4/5/finalize) (`:218-221`) — neutralized
- `model="{ROLE_MODEL}"` placeholders parenthesized + bare (`:223-226`); A5 (`:110-111`), A14 (`:120-130`) lock it — neutralized
- doubled comma `,,` (`:229`); trailing ws (`:231`) — neutralized

What the rewrite map does NOT touch (survives verbatim from canonical):
- **`Agent(` dispatch literal LEAKS** — phase1:108, phase2:83, phase3:78, phase4:119/281, phase5:85/96/160/189, fast:156/223/310, finalize:272/283/471/772, adapt:96. opencode's tool is `task`; `Agent(…)` is unknown to the runtime. Mitigated by the badge naming the `task` tool first.
- **"Claude Code agent" prose LEAKS (16 occurrences)** across phase1/2/3/4/5/fast/finalize/workflow-init. Conceptual inaccuracy; no runtime break.
- `## Agent Model Badge` heading name preserved as anchor (`OPENCODE_BADGE_BLOCK:172`); body is opencode-correct — cosmetic relic.
- `/`-slash routing — NOT a leak; opencode uses `/command` for `.opencode/command/*.md` (A9 `:251-262` confirms resolution).

**Live assertion count: 223** (issue body's "145" is STALE/WRONG; corroborated by `docs/opencode-edition.md:204`). Deterministic count from source: A1=1; A2/A3=15×4+7=67; A4/A5=1+12×2=25; A14=12×4=48; A6 agents=15; A13=4; A6 commands=12; A7=4; A8=2+2+3; A12=23; A9=5; A10=6; A11=6 → 223. (Re-confirm with `node scripts/test-opencode-edition.js`.)

defects (#1):
- D1 [follow-up, medium] `Agent(` dispatch literal leaks into all generated dispatch cards; no `Agent(`→`task` rewrite in `transformCommandBody`.
- D2 [follow-up, low-medium] "Claude Code agent" prose leaks verbatim (16×); not rewritten.
- D3 [follow-up, low] `## Agent Model Badge` heading name preserved (cosmetic anchor); body correct.
- D4 [follow-up, low] Issue #530 body assertion count "145" stale; live = 223.

## Dimension #5 — Route-reachability T-set surface (FACTS, no decision)

`test-route-reachability.js` T4–T11 cover **claude commands + codex SKILLs only** (6 or 12 surfaces each). opencode (`.opencode/command/`) is NOT covered by any T4–T11.
- T4 (`:123-132`) codex finalize/next content-reachability (#369/#380) — 6 codex SKILLs.
- T5 (`:141-173`) `<!-- PIN: frontier unit -->` in 6 plan-run surfaces (3 claude cmd + 3 codex SKILL).
- T6 (`:183-199`) `<!-- PIN: closure-audit -->` in 6 finalize surfaces.
- T7 (`:207-237`) `<!-- PIN: claim-escalate -->` + `result: escalate` in 18 surfaces (adapt/next/auto × claude/codex).
- T8 (`:246-261`) `<!-- PIN: leg-isolation-recipe -->` in 6 plan-run.
- T9 (`:269-284`) `<!-- CARD: speculative-open -->` in 6 plan-run.
- T10 (`:292-315`) `<!-- PIN: fast-compliance-backstop -->` in 12 (6 fast + 6 finalize).
- T11 (`:324-347`) `<!-- PIN: adaptive-default-contract -->` in 12 (6 fast + 6 full-entry).
(T1–T3 also claude+codex only.)

EXISTS — A9 (`test-opencode-edition.js:245-262`): bare **target** resolution for 5 emitted commands against `.opencode/command/` (file-exists). Twin of T2, NOT T4–T11.
GAIN by joining: **content**-reachability for the 6 generated opencode commands (adapt, plan-run, auto, fast, finalize, phase1) — machine-enforce that PIN/literal wiring tokens survive `transformCommandBody`. A rewrite-map regression could silently drop a token while A9 still passes. (PIN/literal tokens like `closure-audit`, `result: escalate`, `--write-overlap-consent` are NOT in the rewrite map → pass through verbatim — verifiable.)

## Dimensions #6/#7 — Edition-machinery boundary + CI wiring (FACTS, no decision)

All four confirmed:
- (a) NO `test:kaola-workflow:opencode` — `package.json:34-42` lists none (grep `opencode` in package.json: 0).
- (b) `npm test` (`package.json:35`) chains only claude/codex/gitlab/gitea; no opencode.
- (c) `edition-sync.js:43` `FORGES=['gitlab','gitea']`; grep `opencode`: 0. opencode has separate generator `sync-opencode-edition.js` (self-declared twin, `:11-12`).
- (d) opencode via standalone `install-opencode.sh` (`:4-6` "does NOT modify install.sh"); `install.sh` grep `opencode`: 0.
Consequence: opencode parity (`test-opencode-edition.js` + `--check`) runs ONLY via `install-opencode.sh:62-63` + manual — never in `npm test`, so NOT gated at Finalization's `npm test`; CLAUDE.md Validation Policy (`:98-103`) silent on opencode.

## Dimension #10 — Docs discoverability (FACTS)

- README.md (grep `opencode`/`install-opencode`): 0 — lists Claude/Codex/GitLab/Gitea only.
- docs/README.md (index): `docs/opencode-edition.md` EXISTS (211 lines) but is NOT linked — orphaned.
- CLAUDE.md (grep `opencode`): 0 — absent from Validation Policy, Documentation Map, Commands.

Net: opencode edition is **undiscoverable** from all three canonical entry points.

## Defect inventory (this node)
1. [follow-up, medium] D1 `Agent(` literal leaks into all generated opencode dispatch cards.
2. [follow-up, low-medium] D2 "Claude Code agent" prose leaks (16×).
3. [follow-up, low] D3 `## Agent Model Badge` heading name preserved (cosmetic).
4. [follow-up, low] D4 Issue #530 body "145" assertions stale; live = 223.
5. [follow-up, medium] D5 opencode undiscoverable: absent from README.md, orphaned from docs/README.md index, absent from CLAUDE.md.
6. [decision-input] No `test:kaola-workflow:opencode`; opencode absent from `npm test`/`edition-sync.js`; standalone `install-opencode.sh`. (Additive-by-design; inputs to decision #6.)

## Decision inputs (for n2)
Decision #5 needs: A9 = bare target resolution only (T2 twin); T4–T11 = content-reachability, claude+codex only; joining enforces wiring-token parity for 6 opencode commands; cost = additive surface-list extension.
Decision #6 needs: (a) no opencode npm script; (b) not in `npm test` (not gated at Finalization); (c) not in edition-sync; (d) standalone installer — runtime edition, not a `--forge`. Parity runs only via installer + manual.
