evidence-binding: n8-cr-surface c42b02778b1a
verdict: pass
findings_blocking: 0

upstream_read: n1-architect 416c5fde30b3
upstream_read: n4-agents ecd8af887fc3
upstream_read: n5-prose 2dedd0d00b26
upstream_read: n6-enforcement 5d12c6fd52f3

finding: id=R1 scope=in_scope action=fix status=resolved severity=medium fix_role=none rationale=briefs-syntax-sentence-landed-md-plus-3-toml-verified-against-parseNodeBriefs
finding: id=R2 scope=in_scope action=fix status=resolved severity=low fix_role=none rationale=security-reviewer-added-via-skeleton-seam-all-six-regenerated
finding: id=R3 scope=in_scope action=fix status=resolved severity=low fix_role=none rationale=manifest-guard-fail-closed-in-wall-and-all-three-toml-mirrors-mutation-proven

# n8-cr-surface — RE-REVIEW (fresh gate, nonce c42b02778b1a): SURFACES diff after the three in-run repairs

All three findings from the prior review are correctly fixed, minimal, and verified. Zero new findings. APPROVE.

## (a) The three fixes — correct, minimal, parity-preserved

**R1 (was BLOCKING) — briefs syntax sentence.** `agents/workflow-planner.md:182-185` now appends to the Compact-plan posture bullet: one column-0 `### <node-id>` heading per brief under the `## Node Briefs` h2, id must match a `## Nodes` row (`brief_unknown_node` on unknown, `brief_duplicate_node` on repeat), heading body is the brief, and "Any other layout (bullets, tables, bold names) parses as NO briefs." This closes the silent-no-op failure mode exactly. The condensed `.toml` sentence (appended to `COMPACT-PLAN POSTURE:` in all three `workflow-planner.toml` twins) is a faithful verbatim condensation — same clauses, backticks dropped per that file's house style. The repair touched ONLY `agents/workflow-planner.md` + the 3 toml twins among agent files (minimal).

**R2 — read-gate examples.** `templates/routing/plan-run.skeleton.md:412-413` adds `security-reviewer` to the read-gates example list; edited via the seam (skeleton), never a generated surface. All six surfaces regenerated and each carries the addition (grepped: 6/6).

**R3 — manifest guard.** `scripts/validate-vendored-agents.js:83-84,109-117`: `agentWritesEvidence` is now tri-state (`null` on a missing `tools:` line) and the wall throws typed `agent_contract_manifest_missing` instead of defaulting to the weaker read-kind needle — fail-closed, with the correct rationale in the comment (a tool-less agent inherits ALL tools). The identical guard landed in all three `.toml` mirror validators (`validate-kaola-workflow-contracts.js:631-635`, gitlab `:766-770`, gitea `:771-775`) — they shared the gap; consistent `assert(tm, 'agent_contract_manifest_missing: …')` before the kind derivation in each.

## (b) `.toml` fidelity and parity

- `workflow-planner.toml` triple: byte-identical ×3 (`cmp` clean) — the only agent toml the repair touched; the other 7 triples are untouched since the prior parity pass (re-confirmed by the parity suite).
- Substance of the toml sentence matches the `.md` sentence clause-for-clause (syntax, both typed refusals, the NO-briefs warning).
- Zero provenance tokens and zero forge nouns in every repair-added line (grepped the added-line set across `.md`, `.toml`, skeleton, and the regenerated command: empty). `brief_unknown_node`/`brief_duplicate_node` are typed reasons, same class as `ledger_header_invalid` already in the file — not provenance.

## (c) Re-run verification (real exit codes, no pipe-masking)

| Command | Result | Exit |
|---|---|---|
| `node scripts/test-agent-profile-parity.js` | 33 assertions passed | 0 |
| `node scripts/generate-routing-surfaces.js --check` | all 12 surfaces byte-match the skeleton | 0 |
| `node scripts/test-route-reachability.js` | 329 assertions passed | 0 (captured directly) |
| `node scripts/validate-vendored-agents.js` | passed, 16 agents | 0 |
| `node plugins/.../validate-kaola-workflow-gitlab-contracts.js` (full) | passed | 0 |
| `node plugins/.../validate-kaola-workflow-gitea-contracts.js` (full) | passed | 0 |
| `node scripts/validate-kaola-workflow-contracts.js` (full) | passed | 0 |
| `node scripts/validate-workflow-contracts.js` | passed | 0 |
| root vs codex twin `validate-workflow-contracts.js` | byte-identical (`cmp`) | 0 |

**Spot mutation test (scratch dir — never the live root):** a tool-less front-matter fixture (`name:`/`description:` only, needles present in body) draws `agent_contract_manifest_missing: node-role agent "toolless-role" declares no tools: front-matter line…` — the guard is load-bearing, not decorative. Regression: the prior mutation (Evidence Contract section stripped from a code-architect copy) still draws `agent_contract_needle_missing` — the original wall teeth survived the repair.

## (d) Coherence — prose vs parser, examples vs manifests

Empirically verified against the live `parseNodeBriefs` export:
- h3 layout `### n1-implementer` / `### n2-code-reviewer` → parses both ids (matches "one column-0 `### <node-id>` heading per brief");
- bullet/bold layout under `## Node Briefs` → parses `[]` (matches "Any other layout … parses as NO briefs" — the sentence's central claim is literally true);
- a fenced `### not-a-brief` inside a brief body is skipped (fence-aware scan; the brief body absorbs it — authoring guidance needs no fence caveat).

`brief_duplicate_node` exists and fires in the validator (`plan-validator.js:109,1443` — refuses a repeated parsed h3 id), so the sentence's second refusal reference is accurate. The enumeration examples now match the real manifests completely: 5/5 read producers, 3/3 read-gate agents (`adversarial-verifier`, `code-reviewer`, `security-reviewer` — all `tools: [Read, Grep, Glob, Bash]`), 6/6 Write-manifest roles.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass (R1 resolved) |
| LOW      | 0     | pass (R2/R3 resolved) |

Verdict: APPROVE — all three prior findings resolved in-run and mutation/regeneration-verified; every affected-scope validator green with directly-captured exit 0; no new findings. The surfaces diff is fit to proceed to finalize.
