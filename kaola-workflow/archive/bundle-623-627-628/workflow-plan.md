# Workflow Plan — bundle-623-627-628

<!-- plan_hash: 260f086b3027957ad340caff12d839e47127ca4ad9c7134e045ef2e6801e2cb8 -->

## Meta
speculative_open_policy: auto
labels:
validation_command: npm test

Bundle of three ROUTING-SURFACE / DOCS-PROSE items that overlap on two files (why they bundle,
and why they are NOT independent legs): `commands/kaola-workflow-plan-run.md` (+ its 5 sibling
surfaces) is edited by BOTH #627 (debloat) and #623 (rolling-topup scope-fix), and
`docs/plan-run-cards/frontier-batch.md` by BOTH #623 and #628. Same-file overlapping edits cannot be
a disjoint antichain, so this plan DISSOLVES the overlaps by folding-by-FILE-LANE instead of by
issue: the plan-run 6-surface lane (n1) owns #627's debloat AND #623's plan-run topup-scope; the
card+planner lane (n4) owns #623's topup-scope on the card + planner AND #628's card corrections.
The result is four exact-file-DISJOINT write lanes (n1..n4) — n1/n2/n3 co-open by default under a
post-dominating reviewer gate (coarse areas — `commands`, `plugins`, `plugins/kaola-workflow/skills` —
but exact-file-disjoint, no dir/glob tokens, no PROTECTED file; the validator DERIVES `parallel_safe`,
never hand-authored). n4 is serialized after n2 only to share the docs/** allowband lane safely (see
Plan Notes).

Correctness is the driver (precedence #1): this is a delicate debloat where dropping a load-bearing
routing/dispatch/lifecycle instruction — or a machine-pinned token — is a silent regression a
line-count diff misses. Hence a reasoning-tier `code-reviewer` running the four chains (the #307
cross-edition obligation, since the diff touches the gitlab/gitea SKILL trees) AND a read-only
`adversarial-verifier` that DIFFS the routing-relevant CONTENT across the six surfaces (not line
count) and tries to REFUTE that every pinned token + load-bearing instruction survived.

SCOPE NOTE — #627 fix#2 (runtime-dead-prose fencing) is DESCOPED here as blocked-as-prose-only; see
Plan Notes. #627 ships PARTIAL (fix#1/#3/#4/#5). #623 and #628 ship in full.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-plan-run-debloat | implementer | — | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 6 | sequence | reasoning | behavior-preserving prose restructuring of agent-facing routing surfaces; no natural failing unit test — the route-reachability + contract-validator token pins are the standing guardrail the change must keep GREEN |
| n2-finalize-surfaces | implementer | — | commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, docs/api.md | 7 | sequence | standard | mechanical prose surgery (compress an advisory block + move enum to docs/api.md, prefix self-contained resolver lines, section-cite the rot scars); no failing unit test applies — contract-validator token pins guard it |
| n3-workflow-next-resolver | implementer | — | commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md | 6 | sequence | standard | mechanical self-containment fix (prefix the one-line resolver before the entry snippet on 6 surfaces); no failing unit test — contract-validator pins guard it |
| n4-cards-planner-topup | implementer | n2-finalize-surfaces | docs/plan-run-cards/frontier-batch.md, agents/workflow-planner.md | 2 | sequence | standard | docs/prose corrections against an exact canonical spec (three-tier speculation + freeze-legal example + rolling-topup scope-fix); no failing unit test applies |
| n5-review | code-reviewer | n1-plan-run-debloat, n2-finalize-surfaces, n3-workflow-next-resolver, n4-cards-planner-topup | — | 1 | sequence | reasoning | — |
| n6-adversary | adversarial-verifier | n5-review | — | 1 | sequence | reasoning | — |
| n7-docs | doc-updater | n5-review | docs/decisions/D-623-01.md, docs/decisions/D-627-01.md | 2 | sequence | standard | — |
| n8-finalize | finalize | n6-adversary, n7-docs | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

### Shared canonical spec — the #623 rolling-topup scope-fix (used by n1 AND n4)

The three surfaces that carry the false promise MUST converge on ONE corrected meaning (they are
split across n1 and n4 only because of the file overlap, so the wording is dictated here to prevent
divergence — apply modulo each surface's local phrasing):

- **Truth to encode:** rolling slot-level top-up (an `open-ready` re-run admitting a NEW member as a
  slot frees) is a **READ-frontier** behavior only. A **WRITE** frontier wider than `FANOUT_CAP` does
  NOT top-up into a live lane group — group membership / `write_union` / baseline are fixed at group
  formation and `write_node_exclusive` fires while any member is live — so it runs as **fixed group
  waves**: the first ≤cap members form a group and run to completion (each wave paying its own
  synthesizer-merge + group barrier), then the next wave forms as a NEW group. Makespan is the sum of
  the per-wave maxima, not a rolling drain.
- **Surface 1 — `commands/kaola-workflow-plan-run.md` ~:269-270 (the FANOUT_CAP bullet, all 6
  plan-run surfaces, n1):** the "top-up re-run of `open-ready` drains wider frontiers as members
  close" clause must scope the drain to READ fan-out and state that a wider WRITE frontier runs in
  fixed group waves. Keep the `FANOUT_CAP` / `KAOLA_FANOUT_CAP_READONLY` tokens.
- **Surface 2 — `agents/workflow-planner.md` ~:76-77 (n4):** the "drains the rest via rolling bounded
  dispatch (queue the overflow, top up as slots free)" sentence must clarify the rolling top-up is
  the READ fan-out path; a wide WRITE fan-out runs in fixed group waves (each wave its own
  merge/barrier). PROVENANCE-BAN applies (agents/*.md is scanned): no `#NNN` / `D-NNN-NN` / `INV-NN`
  tokens in the edit.
- **Surface 3 — `docs/plan-run-cards/frontier-batch.md` ~:224 (§6 fan-out caps, n4):** the
  "`open-ready` opens the remainder on the next call as members close" clause must scope to read
  frontiers and note write lane groups run in waves.

### n1-plan-run-debloat (implementer, reasoning) — #627 fix#1 + #623 plan-run scope-fix

The largest, most delicate node; `reasoning` because output quality is bounded by the judgment of
what routing prose is load-bearing vs a card duplicate, across 6 surfaces with forge-noun divergence.
- **#627 fix#1 (debloat).** Re-stub the two re-bloated blocks to card pointers, restoring the
  ~150-line skeleton (`docs/conventions.md:184` / D-445-01 (existing), already declares this target — do NOT
  edit conventions.md; the debloat brings the surfaces back INTO compliance).
  - The **wait-budget / escalation / writer-kill-safety ladder** (~:202-227) → a ~3-line stub that
    PRESERVES the machine-pinned tokens (`wait_budget_minutes`, `reconcile-running-set`, `writerHalt`,
    `delegation_outcome`) and points at `<!-- CARD: join-protocol -->` → `docs/plan-run-cards/join-protocol.md`
    (which self-describes as the expansion of exactly this prose).
  - The **speculative-open paragraph** (~:320-333) → a ~2-line stub behind the existing
    `<!-- CARD: speculative-open -->` marker (~:314), PRESERVING the `--speculative-consent` literal
    (T9) and the `speculative_open_policy: auto` default framing (must stay consistent with n4's card
    fix — both say auto-default three-tier).
- **#623 plan-run scope-fix** per the Shared canonical spec, Surface 1.
- **HARD constraint — machine-pinned tokens survive on ALL 6 surfaces.** The re-stub must NOT drop
  any pinned literal. `scripts/test-route-reachability.js` pins (per surface): T5 (`<!-- PIN: frontier
  unit -->` + `frontier unit`), T5b (`fork_turns: "none"`, `reasoning_effort:
  dispatch.codex_reasoning_effort`, `fresh child-session effort proof`,
  `codex_effort_override_unavailable`; SKILLs also the neutral/legacy model-tier mapping lines), T8
  (`<!-- PIN: leg-isolation-recipe -->` + `--write-overlap-consent`), T9
  (`<!-- CARD: speculative-open -->` + `--speculative-consent`), T12 (the #602/#604/#605 dispatch-card
  visibility + announcement + close-echo strings), T14 (`NAMED teammate` + `send EXACTLY ONE request
  for the deliverable, then wait`), T15 (`<!-- PIN: gate-instrumentation-provisioning -->` +
  `KAOLA_GATE_WINDOW_FENCE=0`). The 4 `validate-*-contracts.js` mirror these. Verify immediately with
  `node scripts/test-route-reachability.js` after editing.
- **Forge-neutral + provenance-clean.** commands/ and SKILLs/ are agent-facing: NO `#NNN` / `D-NNN-NN`
  / `INV-NN` / ADR tokens (PROVENANCE_BAN, `validate-workflow-contracts.js:1119`), and no forge CLI
  binary name in the SKILL prose. Mirror the debloat to the 3 forge surfaces modulo forge nouns —
  keep the surfaces SEMANTICALLY consistent, not byte-identical (they legitimately diverge).

### #627 fix#2 (runtime-dead-prose fencing) — DESCOPED (blocked as prose-only)

fix#2 wants to fence the Codex v1/v2 dispatch + `turn_context.effort` block OUT of the 3 Claude
commands and the Claude Teammate-Mode block OUT of the 3 Codex SKILLs. This is NOT achievable as
prose — the exact tokens those blocks carry are machine-PINNED on ALL SIX surfaces by
`scripts/test-route-reachability.js` (T5b pins the 4 Codex effort tokens on the Claude commands too;
T14 pins the teammate sentinel on the SKILLs too) and mirrored across all four `validate-*-contracts.js`.
Removing a block from its non-native runtime turns those chains RED. Honest fencing therefore requires
RELOCATING the cross-runtime pins (T5b → SKILL-only, T14 → command-only) across the route-reachability
test AND four contract validators — cross-edition SCRIPT LOGIC, which this bundle is explicitly scoped
to exclude, and which the issue itself flags as "the deeper single-sourcing/generation option tracked
as a separate decision." Descoping protects the debloat's own safety net (do not edit the guardrail in
the same run) — precedence #1/#3. Recorded durably in D-627-01 for a focused follow-up; #627 closes
PARTIAL. n8-finalize MUST NOT auto-close #627 as fully-done — close #623/#628 in full, mark #627
partial with the fix#2 follow-up.

### n2-finalize-surfaces (implementer, standard) — #627 fix#3 + fix#4 (finalize) + fix#5

Six finalize surfaces + `docs/api.md`; `standard` (mechanical against a clear spec), gated by the
reasoning reviewer + adversary.
- **fix#3 (Goal Attestation).** Compress the ~26-line advisory Goal-Attestation block (~
  `commands/kaola-workflow-finalize.md:164-188`, byte-replicated on the 5 other finalize surfaces) to
  ~2 resident lines (keep only the operative `export KAOLA_GOAL` mention); MOVE the enum + rationale
  verbatim to `docs/api.md`. No test pins this block (verified), but `docs/api.md` IS chain-asserted —
  add the enum as real content, do not fabricate schema. Keep the T6 (`<!-- PIN: closure-audit -->`)
  and T10 (`<!-- PIN: fast-compliance-backstop -->` + `fast_compliance_unresolved`) pins intact.
- **fix#4 (finalize crash-recovery snippet self-containment).** Prefix the one-line `$CLAIM_JS`
  resolver before the crash-recovery snippet (~:841, first-assigned only in a later branch ~:902) so
  the block is self-contained; mirror on the 3 SKILL twins (`$claim_script`).
- **fix#5 (editing scars).** Replace rotted line-number self-cites (~:855 "mirrors lines 305-306,
  533-534, 565-566") with SECTION cites, and reunite the "Raw output goes to:" sentence (~:280) with
  its path block. Apply wherever the scar appears across the finalize surfaces.
- Forge-neutral, provenance-clean, semantically-consistent mirror across the 3 forge finalize surfaces.

### n3-workflow-next-resolver (implementer, standard) — #627 fix#4 (workflow-next)

`commands/workflow-next.md:91` uses `$CLAIM_JS` before its first assignment (~:277). Prefix the
one-line resolver so the entry snippet is self-contained; mirror on the 3 forge command surfaces +
the 3 `kaola-workflow-next` SKILL twins (`$claim_script`). Preserve the T7 (`<!-- PIN: claim-escalate
-->` + `result: escalate`) and T4 (`workflow-plan.md exists -> kaola-workflow-plan-run` + `auto-bundle`)
pins. Split from n2 to stay exact-file-disjoint (parallel leg) and single-responsibility.

### n4-cards-planner-topup (implementer, standard) — #628 + #623 (card + planner)

`docs/plan-run-cards/frontier-batch.md` + `agents/workflow-planner.md`; both carry the #623
topup-scope change (cohesive), plus #628's card corrections. **Serialized after n2** (depends_on:
n2-finalize-surfaces) NOT for a data dependency but because n2 and n4 BOTH write the `docs/**`
allowband (api.md vs frontier-batch.md), which the per-node barrier is BLIND to — two CONCURRENT legs
both touching docs/** are refused at freeze (`parallel_allowband_collision`). Ordering them dissolves
the collision; the cost hides behind n1's reasoning-tier critical path.
- **#628 §1 (speculation is consent-only — stale).** The card (~:89-92 prose, ~:220 §7 table row)
  predates the speculative-auto default. Update to the three-tier reality: `auto` = default-on
  (no per-run consent, read AND leg-contained-write eligibility), `consent` = the opt-in tier, `off`
  = serial. Serial waiting is the DEGRADED path. After: a grep for "speculative" under
  `docs/plan-run-cards/` shows NO consent-only framing of the default tier (#628 AC).
- **#628 §2 (freeze-illegal example).** ~:39-41 uses directory-shaped `"declared_write_set": "api/"`
  / `"cli/"` — a trailing-slash entry is refused at freeze (workflow-planner.md:84-86; `hasUnresolvableEntry`
  treats it as unprovable disjointness). Replace with EXACT file paths (`api/routes.js`, `cli/main.js`).
- **#623 topup-scope** on the card (~:224) AND planner.md (~:76-77) per the Shared canonical spec
  (Surfaces 2 and 3).
- `agents/workflow-planner.md` is PROVENANCE-scanned — keep the edit token-clean.

### n5-review (code-reviewer, reasoning) — G1 gate

Post-dominates all four code-producing nodes on every path to the sink (G1). `reasoning` because the
review must confirm the debloat dropped NO load-bearing routing/dispatch/lifecycle instruction and
preserved every pinned token across six diverging surfaces. It RUNS `validation_command` (`npm test` —
the four chains, the #307 cross-edition obligation, since the diff touches the gitlab/gitea SKILL
trees). #635's test-run-chains flake is fixed (main 73ca26db) → expect a CLEAN UNWAIVED four-chain
receipt; NO `--accept-known-red`. Also confirm PROVENANCE_BAN clean on every agent-facing surface.

### n6-adversary (adversarial-verifier, reasoning) — change gate, read-only

Depends ONLY on the n5 gate (high-probability pass over a mechanical prose diff), so it is
speculative-open-eligible under `auto` and overlaps the review. Read-only + Bash. Its mandate is to
REFUTE, not rubber-stamp: (a) DIFF the routing-relevant CONTENT (dispatch card acquisition, dispatch/
announce/close-echo formats, gate non-delegability, lifecycle loop, leg-isolation + speculative
pointers) of the debloated plan-run.md against the pre-debloat version — every load-bearing
instruction still present, only the DUPLICATE card prose removed; NOT a line-count check. (b) Confirm
the six plan-run surfaces stay SEMANTICALLY consistent post-debloat (and that n1's speculative framing
matches n4's card framing — both auto-default three-tier). (c) Re-run `node scripts/test-route-reachability.js`
and assert every T5/T5b/T8/T9/T12/T14/T15 token survived on all six. (d) Confirm the #623 topup-scope
wording is consistent across the plan-run bullet, planner.md, and the card. (e) Confirm the #628
example is freeze-legal (`node scripts/kaola-workflow-plan-validator.js` would accept those exact
paths). Emit `verdict: pass|fail` + `findings_blocking: N`.

### n7-docs (doc-updater, standard) — decision records

Sibling of n6 (disjoint; n6 writes nothing), speculative-eligible behind n5. Both records are inert
ADRs (validation-invisible), so no chain coupling; dictate exact content (no fabrication):
- `docs/decisions/D-623-01.md` (next-free — D-622/D-632 exist, no D-623): the #623 fork — chose
  Option 1 (prose honesty: scope rolling top-up to read frontiers; wide write frontiers run in fixed
  group waves) over Option 2 (implement member admission into a live group). Rationale: admission
  touches the group-identity invariants the barrier / reconcile / synthesizer paths all key on;
  deferred unless wide (>cap) write fanouts become common (or the read/write co-open relaxation makes
  the machinery fall out).
- `docs/decisions/D-627-01.md` (next-free): #627 debloat restores the D-445-01 (existing) ~150-line skeleton;
  fix#2 (runtime-dead-prose fencing) DESCOPED because the cross-runtime tokens are machine-pinned on
  all six surfaces (route-reachability T5b/T14 + four contract validators), so honest fencing requires
  script-logic pin relocation — the "deeper single-sourcing" decision the issue defers. Filed for a
  focused follow-up; #627 shipped partial (fix#1/#3/#4/#5).

### n8-finalize (finalize) — unique docs/state sink

Writes only `CHANGELOG.md` (a PROTECTED file, legal on the sink; kept OFF the co-open legs). Depends
on n6 + n7 so finalization is provably impossible until the adversarial gate passes AND the records
land. Close #623 and #628 in full; #627 PARTIAL with the fix#2 follow-up (do NOT mark #627 done).

### Gate coverage / omissions

- **No `security-reviewer` (G2):** labels carry no security sensitivity; no write path matches a
  sensitive pattern (all are commands/ SKILLs/ agents/ docs/ prose).
- **No `main-session-gate` (G3):** acceptance is fully machine-checkable (four chains +
  route-reachability + contract validators + PROVENANCE_BAN + the adversary's content-diff). No
  GPU / visual / device / human-signoff hinge.
- **No `knowledge-lookup`:** everything is confirmable in-repo (surfaces, pins, tests all verified at
  authoring).
- **n1, n2, n3 are an inferred antichain** (no dep edges among them) with exact-file-disjoint write
  sets and no dir/glob/PROTECTED tokens → the validator DERIVES `parallel_safe` under the retained net
  (n5 post-dominates every leg). Coarse same-area overlap (`commands`, `plugins`,
  `plugins/kaola-workflow/skills`) relaxes to co-open by default (#546-G2/#593). n4 is held one edge
  behind n2 solely to serialize the shared docs/** allowband lane (the per-node barrier cannot attribute
  concurrent docs/** writes). Never hand-add `parallel_safe`. Serial-degrades safely on a host without
  worktree support or under `KAOLA_PARALLEL_WRITES=0` — correctness unchanged either way
  (exact-file-disjoint → mechanical merge, no synthesizer conflict).

## Node Ledger

| id | status |
| --- | --- |
| n1-plan-run-debloat | complete |
| n2-finalize-surfaces | complete |
| n3-workflow-next-resolver | complete |
| n4-cards-planner-topup | complete |
| n5-review | complete |
| n6-adversary | complete |
| n7-docs | complete |
| n8-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-plan-run-debloat) | subagent-invoked | deferred_to_group | |
| implementer (n3-workflow-next-resolver) | subagent-invoked | deferred_to_group | |
| implementer (n2-finalize-surfaces) | subagent-invoked | group_passed | |
| implementer (n4-cards-planner-topup) | subagent-invoked | evidence-binding: n4-cards-planner-topup afb40637ccbc | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review 2b59c66058eb | |
| adversarial-verifier (n6-adversary) | subagent-invoked | evidence-binding: n6-adversary 6f2a91d98154 | |
| doc-updater (n7-docs) | subagent-invoked | evidence-binding: n7-docs 48bd0aa00c49 | |
| finalize (n8-finalize) | main-session-direct | evidence-binding: n8-finalize 850efd567ffb | |
