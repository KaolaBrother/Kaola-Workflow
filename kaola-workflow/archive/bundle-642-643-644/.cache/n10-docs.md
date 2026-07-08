evidence-binding: n10-docs 923a0d2372ee

upstream_read: n8-cr-surface 274105529b3f
upstream_read: n9-adversary 3b80090c352a

# n10-docs — documentation update for bundle-642-643-644 (#642 / #643 / #644)

docs_updated: CHANGELOG.md, docs/api.md, docs/conventions.md, docs/plan-run-cards/resume.md, docs/decisions/D-642-01.md, docs/decisions/D-643-01.md, docs/decisions/D-644-01.md

Read first: `kaola-workflow/bundle-642-643-644/.cache/n1-architect.md` (blueprint), the frozen
`workflow-plan.md` Plan Notes for n10, `kaola-workflow/.roadmap/issue-{642,643,644}.md`, and the
gate evidence `n7-cr-engine.md` / `n8-cr-surface.md` / `n9-adversary.md` — documented fix-forward
(end state), since the five in-run repairs those gates routed land in the same run right after this
node: (1) `brief_unknown_node` AND `brief_duplicate_node` freeze refusals; (2) the universal
n/a-skip carve-out in `checkUpstreamConsumed` (verified already present in the working tree at
`scripts/kaola-workflow-adaptive-node.js:1524-1526`, uncommitted pending this run's repair commit);
(3) the planner-facing `### <node-id>` briefs syntax rule (`agents/workflow-planner.md` + 3 `.toml`
twins); (4) the future-agent wall's typed `agent_contract_manifest_missing` refusal on a missing
`tools:` manifest line (`validate-vendored-agents.js`); (5) the fused-advance live-gate hold in
`close-and-open-next` (order-independent w.r.t. `## Nodes` table order).

## Files updated (write set exactly these 7)

1. **`CHANGELOG.md`** — three `[Unreleased]` entries: #642 (durable node-to-node channel —
   `## Node Briefs`, `dispatch.goal_line`/`dispatch.upstream_evidence`, the consumed-proof close
   gate, resume re-hydration, the ×6 routing relay) under `### Added`; #643 (per-role
   evidence-recording contract completion — 8 registry rows, registry-driven close shape checks, 8
   agent-file evidence-contract sections ×4 editions, the future-agent wall, the ×6 role-kind
   enumeration) under `### Added`; #644 (the two #641 scheduler residuals plus the in-run
   fused-advance finding) under `### Fixed`. Each bullet follows the file's existing bold-lead,
   issue-tagged, decision-record-linked, cross-edition-noted style.
2. **`docs/api.md`** — extended the `opened` payload `dispatch` sub-object stable field set with
   `upstream_evidence?` (and the existing `goal_line?` field's comment now names its `## Node
   Briefs` source); added three new prose blocks after the `leg_path`/`leg_branch` paragraph: (a)
   `goal_line`/`upstream_evidence` — the durable channel, the anti-fabrication invariant (the
   nonce is NEVER carried on any dispatch/card/envelope surface — only line 1 of the upstream's own
   evidence file); (b) the close-time consumed-proof (`checkUpstreamConsumed`) — scope, exemptions
   (root/non-producer/n/a-skip/back-compat key-absent), HARD-vs-advisory split, reopen-rotation
   staleness; (c) the per-role-kind evidence-recording contract (read producers RETURN for
   orchestrator persistence via `record-evidence --stdin`; Write-manifest roles SELF-WRITE;
   `ROLE_TOKEN_REGISTRY` as the single token source; the future-agent wall + its
   fail-closed manifest-missing refusal).
3. **`docs/conventions.md`** — added a new "Future-Agent Evidence-Contract Checklist (issue #643 /
   D-643-01)" section (placed between "Forge-Neutral Plugin Agent Profiles" and "Operator hints on
   typed refusals"): every new node-role agent MUST ship with (a) a `ROLE_TOKEN_REGISTRY` row with
   ≥1 content-bearing token or a `PRESENCE_ONLY_RATIONALE` entry, (b) a role-kind evidence-contract
   section whose kind is derived from the `tools:` manifest, both machine-enforced by
   `validate-vendored-agents.js` + the mirrored `.toml` needle checks in the codex/gitlab/gitea
   contract validators; documents the manifest-missing fail-closed refusal.
4. **`docs/plan-run-cards/resume.md`** — added a "Re-hydrating the dispatch context" note under
   "3. Re-dispatch the role agent": the in-progress node's `goal_line`/`upstream_evidence` are
   re-derived from the cached `.cache/<op>-envelope.json` (`result.opened.dispatch` or the matching
   batch member), never reconstructed from a prior turn's memory.
5. **`docs/decisions/D-642-01.md`** (new) — the `## Node Briefs` grammar + hash-coverage design,
   the `brief_unknown_node`/`brief_duplicate_node` freeze refusals, the `goal_line`/
   `upstream_evidence` conditional-attach discipline (mirroring `leg_path`), the consumed-proof
   design (anti-fabrication nonce-as-read-proof, HARD-for-IMPLEMENT_ROLES/advisory-elsewhere split,
   reopen-rotation staleness), the universal n/a-skip carve-out (DD-5-adjacent), and resume
   re-hydration from the cached envelope.
6. **`docs/decisions/D-643-01.md`** (new) — the 8 registry rows + `checkEvidenceShape`
   generalization, the DD-5 back-compat choice (present-key gating + record-evidence re-injection,
   scoped away from `tdd-guide`/`implementer`/`metric-optimizer`/gate roles; old in-flight evidence
   exempt), the evidence-contract prose per role-kind, the future-agent wall (registry floor +
   manifest-derived kind + the fail-closed manifest-missing refusal), and the ×6 enumeration
   re-derivation.
7. **`docs/decisions/D-644-01.md`** (new) — the A1 (`kind:'gate'` counted at `liveReadsAtMerge`,
   the relaxed else-branch, `tryR2bLeglessCoopen`) and A2 (`testConsumedExtra` thread-through)
   residuals from #641, PLUS the third seam this run's own adversarial-verifier surfaced and this
   run fixed in place — the fused-advance live-gate hold in `close-and-open-next`, order-independent
   w.r.t. `## Nodes` table order.

## Provenance discipline

Issue refs (`#642`/`#643`/`#644`) and decision IDs (`D-642-01`/`D-643-01`/`D-644-01`) appear ONLY in
`CHANGELOG.md` and the three `docs/decisions/*.md` files, per the repo's provenance-out-of-
agent-facing-prompts rule — no agent-facing surface (`agents/*.md`, `.toml`, routing surfaces,
skeleton) was touched by this node, so no provenance-stripping was needed on this node's own write
set.

## Verification

Read back all 7 written/edited files after editing (no drift between intended and on-disk content).

| Command | Result | Exit |
|---|---|---|
| `node scripts/validate-workflow-contracts.js` | `Workflow contract validation passed` | 0 |
| `node scripts/test-route-reachability.js` | `Route-reachability test passed (329 assertions).` | 0 |

Both pins hold — this node's docs-only edits (CHANGELOG, api.md, conventions.md, resume.md, 3 new
decision records) collided with no pinned literal in either validator; no adjustment to either
script was needed or made.

Not run (per dispatch — reserved for n11-finalize's own receipt per this run's Plan Notes, and
because the CHANGELOG/api.md docs-band write must land BEFORE that receipt to avoid a
`chains_stale` verdict): the four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains.
