evidence-binding: n3-review bc3cfb70462e

verdict: pass
findings_blocking: 0

# n3-review (G1 gate) — issue #524: roadmap-priority-aware issue-scout

Post-dominates n2-scout-impl. Read-only review against the #524 ACs, cross-edition
parity (#309/#307), forge-neutrality (#341), internal consistency, and scope discipline.

## Verification run (binding walls — all green)

- 3 .toml ports BYTE-IDENTICAL: md5 = b62eef3bf1bd292d11c3188b0dfd22de (all three match).
- gitlab forbidden-only: "GitLab forbidden-only check passed (1 file(s))" exit 0.
- gitea forbidden-only: "Gitea forbidden-only check passed (1 file(s))" exit 0.
- grep for forge tokens (\bgh\b | GitHub | gh issue) in BOTH forge ports: NONE.
- simulate-workflow-walkthrough.js: "Workflow walkthrough simulation passed" exit 0.
- validate-workflow-contracts.js: "Workflow contract validation passed" exit 0.
- test-route-reachability.js: "Route-reachability test passed (170 assertions)" exit 0.
- validate-vendored-agents.js: "Vendored agent validation passed for 15 agents" exit 0.
- Both JSON code blocks in agents/issue-scout.md parse as VALID JSON.
- git status --porcelain: only the 4 declared files (M) + untracked kaola-workflow/issue-524/ evidence dir.

## AC trace (axis 1)

- AC1 (rank by priority/drive-order FIRST; honor `### Project rules` guardrail) — SATISFIED.
  .md §2a (L62-66) installs a strict ordered precedence: (1) priority/drive-order tier hard-rank,
  (2) scope-cohesion, (3) actionability as within-tier tiebreak ONLY. Rule 1 states a
  `### Project rules` guardrail ("X must not preempt the correctness frontier Y") is a HARD
  constraint: the guarded-against issue must NOT be recommended while a higher-priority frontier
  issue is open and actionable. Mirrored in .toml "Ranking precedence (strict, ordered)" (L29-32)
  + leading bundle-selection rule (L35). Bundle Selection Rules gain the highest-priority-tier
  leading bullet (.md L83 / .toml L35).
- AC2 (frontier-blocked → EXPLICIT, no silent proxy) — SATISFIED.
  .md §3a new "### 4. Frontier-Blocked Rule" (L94-102): explicit priority_basis statement of WHICH
  frontier was skipped + concrete reason ("frontier blocked because…"), list in `rejected` with
  same reason, "closest actionable proxy" named as a forbidden anti-pattern; an open+actionable+
  verifiable frontier is NOT blocked. Mirrored in .toml "Frontier-blocked rule" (L37-39).
- AC3 (priority_basis present + reconciled) — SATISFIED. Required object field present and
  CONSISTENT across all four surfaces: .md JSON example (L127-131), .md Fields list (L152-155),
  .toml output-contract recommended_bundle line (L42, "REQUIRED"), .toml priority_basis description
  (L44). Same 3 string sub-fields (frontier / pick_vs_frontier / guardrails_honored) and same
  discrete pick_vs_frontier enum in every surface.
- AC4 (vrpai-cli replay would surface the #488/#502/#561 frontier or explicit "frontier blocked",
  not #82/#652 as unqualified pick) — SATISFIED at the prose level (this is LLM-reasoning prose,
  not a machine unit). The precedence demotes the easier-but-lower-priority cluster below an open
  frontier; the frontier-blocked rule forbids the silent proxy that produced #82/#652; the JSON
  example's guardrails_honored literally encodes "did not recommend #82/#652 while the #488 frontier
  is open and actionable."

## Cross-edition parity (axis 2) — PASS
3 .toml ports byte-identical (md5 match). The .md carries the same substantive priority-ranking
logic as the ports (precedence tiers, hard guardrail, frontier-blocked rule, required priority_basis,
priority-over-goal). The only differences are pre-existing edition wording (".md" names `gh issue
list`; ".toml" says "the forge CLI") — legitimate, not semantic drift. No rule present in one tree
and absent in the other.

## Forge-neutrality (axis 3) — PASS
Both forge ports clean: forbidden-only validators exit 0, grep finds no `gh`/"GitHub"/`gh issue`.
The new prose introduces no forge token (priority signals are sourced from ROADMAP.md / .roadmap/*,
which are forge-neutral durable files).

## Internal consistency (axis 4) — PASS
- Section numbering in Survey Process is sequential: 1 Backlog Inventory → 2 Clustering Analysis →
  3 Bundle Selection Rules → 4 Frontier-Blocked Rule (no collision/renumber error).
- priority_basis described identically in .md JSON example + Fields list + .toml output contract +
  .toml description line.
- Tokens the prose references are REAL roadmap emissions (confirmed against
  scripts/kaola-workflow-roadmap.js): `### Project rules` block (L103), `Next Step` table column
  (L50), per-issue `next_step:` field (L78/L245/L323). Not invented.
- Precedence prose does not contradict the retained scope-cohesion clustering (clustering kept,
  ranking layered on top) or the goal-soft-filter rule (§6 makes priority a hard rank, goal a soft
  within-tier tiebreak — clean axis separation, target-set integrity #430 preserved).
- backlog_empty interaction is sane: priority_basis lives INSIDE recommended_bundle; when
  backlog_empty:true the bundle is null, so priority_basis is naturally absent — no special-casing,
  no contradiction (the empty-backlog shape block is untouched).

## Scope discipline (axis 5) — PASS
git status shows exactly the 4 declared scout files modified + the untracked .cache evidence dir.
No count bumps, no auto-surface edits, no validate-*-contracts.js / install.sh / walkthrough
changes (correct — there is no machine-testable unit for LLM-reasoning prose; the binding walls are
parity + forge-neutrality + the npm chains, all green).

## Findings
None blocking. None non-blocking. The implementation matches the n1-design blueprint section-for-
section, all binding walls are green, and every AC is satisfied.

verdict: pass
findings_blocking: 0
