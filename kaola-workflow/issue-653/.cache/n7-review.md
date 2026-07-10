evidence-binding: n7-review 5457dbfeedcc
verdict: pass
findings_blocking: 0
upstream_read: n1-design 3dee366bd213
upstream_read: n2-attestation 7ec679259eca
upstream_read: n3-sink-journal b039e808d87b
upstream_read: n4-candidate-binding 9c525d832610
upstream_read: n5-selection-rungaps f05d57b01682
upstream_read: n6-claim-ports 7677bf6348b9

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=persistAttestationToSummary presence-guard (/^## Attestation$/m) exists for crash-resume idempotence but means a contractor-authored summary that pre-seeds a column-0 "## Attestation" heading would suppress the script append; fenced by the script-owned ## Closure block + stdout receipt carrying the same fields, and A5 prose forbids removing/summarizing — matches the established appendClosureBlock idiom; observation for n8-adversary, not a defect
finding: id=R2 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=the bundle watch-pr merged-closure lane records claim_planner_attested/finalize_contractor_attested in each member's ## Closure block but does not transcribe verbatim ATTESTATION WARNING text to a summary on that lane (single-issue cmdFinalize does); design-scoped by n1-design A3 (call site = cmdFinalize only), status fields are the audit signal — non-blocking

# n7-review — full-diff code review of n2..n6 (G1 gate), issue #653

Diff reviewed: `git diff 7daa7fbaefcd6158ad15095324201ec039f7f019` (run base → working tree, 72 files, +2219/−150). All observations below are from this session's own runs/reads at the reviewed tree, not restatements of upstream claims.

## 1. Byte-identity groups — CONFIRMED IDENTICAL

Direct md5 in the current working tree:
- workflow-planner.toml ×3: all ead1d06bb9490e8579ce1a6b17b98d5f
- contractor.toml ×3: all 595db6e4dd37b617914000e1c28faf11
- issue-scout.toml ×3: all 2d5eb9991315b08918cc7c5a7688a07c
- closure-contract.js ×4: all 00302482758183bdfb9dfb84c1ee3b74
- adaptive-schema.js ×4: all 197cb6354b9a3181c1f397bc7c58955e
- root↔codex byte-pairs each matching: claim.js 39f63247…, sink-merge.js 84a2d344…, gap-sweep.js 61b4d6a7…, validate-workflow-contracts.js 2bdc2f5b…, plan-validator.js c91dd967…
- `node scripts/validate-script-sync.js` → "OK: 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, … in sync."

## 2. Forge claim ports carry the FULL accumulated root diff — CONFIRMED (diff-vs-run-base comparison)

Extracted `git diff <run-base>` for root, gitlab, and gitea claim files: exactly 4 hunks and 55 added lines each; the added-line streams AND removed-line streams are byte-identical across all three (diff of the +/− line sets empty both ways). Root diff decomposes into exactly n2's hunks (appendClosureBlock 2-field extension; persistAttestationToSummary + cmdFinalize call site; both appendClosureBlock call sites — single-issue at claim.js:2628, watch-pr merged arm at claim.js:3297) and n5's hunks (probeSelectionEvidence + one cmdFinalize call site). n3/n4 contributed ZERO claim.js hunks — verified against the actual diff, matching n6's inventory.

## 3. Generated ports regenerated, not hand-edited — CONFIRMED

`generate-routing-surfaces.js --check` → "all 12 surfaces byte-match the skeleton."; `edition-sync.js --check` → "10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity" (gitlab/gitea plan-validator ports sync-generated). Skeleton/slots diffs read in full: additive prose only; all four pr-alldone-intro splice variants gained the identical journal-disposal sentence. n5's --write-wipes-hand-edits discovery fully repaired: no hand-edit remnant lost (a remnant would show as --check drift; it is clean), and n2's NOT-generated finalize prose survives — "Warning persistence" paragraph present ×1 in the finalize command and each of the 3 finalize SKILLs.

## 4. Six-surface propagation — EXACT COUNTS VERIFIED

"Selection Evidence Docking" exactly 1× in each of the 6 next surfaces (2 in skeleton — one per render class); "Run-Gap Manual Seeding" exactly 1× in each of the 6 plan-run surfaces; validated_candidate_hash on plan-run ×6 + finalize command/SKILL ×3 + contractor.md/toml trio; journal-disposal rule on finalize command + SKILL ×3 + all 6 plan-run surfaces; --attest-planner-spawn in planner TOML ×3 + adapt SKILL ×3 at both touch points (:185-186 single-issue + :247 bundle block) + agents/workflow-planner.md.

## 5. Warning persistence — cannot be bypassed by a clean summary

persistAttestationToSummary is create-if-absent and appends unconditionally — always writes both column-0 status fields plus every ATTESTATION WARNING/attestation: warning verbatim; a normal "clean" summary (no ## Attestation heading) cannot suppress it. Walkthrough asserts the missing-planner case lands verbatim in the archived summary (walkthrough:15145) and in the archived ## Closure block. Residual = finding R1 (non-blocking).

## 6. Stale-refusal ordering — refuse BEFORE archive/commit side effects

Verified in code: cmdFinalize shells --finalize-check at claim.js:2262, refuses finalize_gate_unverified at claim.js:2278, archiveProjectDir only at claim.js:2287. Walkthrough negative leg (simulate-workflow-walkthrough.js:247-263) plants a wrong 64-hex hash, asserts inner_reason: final_validation_stale, live folder SURVIVES, NO archive exists — then re-records the producer hash and finalizes clean.

## 7. Candidate binding (#475 / #648) — CLEAN

Gate compares two hashes only; no test/suite execution anywhere in the new gate or producer code (producer = computeCodeTreeHash over git ls-tree). All new refusals structurally typed: final_validation_unbound, final_validation_stale (payload carries recorded_candidate_hash + current_candidate_hash), candidate_hash_unavailable — all hint-registered in OPERATOR_HINT_REGISTRY; observed_gap_unseeded emits result:refuse + reason + unseeded tuple array + remedy detail matching gap-sweep's existing typed-emit shape. Precedence unverified > failed > unbound > stale consistent across comment/help/code. parseValidatedCandidateHash follows the parseNodeVerdict discipline exactly (column-0, fence-blind, last-well-formed-match-wins, lowercased; present trips on malformed lines so a mangled hash refuses unbound, never silently passes) — ×4 byte-identical. Self-host arm byte-unchanged in decision terms (boundCandidateHash stays null → key omitted). #648 citation fields untouched in code (zero validated_command/validated_at_head/reuse_boundary/cited: lines in the plan-validator/schema diffs; prose-only, no parser exists) and all four still named on surfaces plus the fresh-hash-at-citation-time rule.

## 8. Gap-sweep reverse containment — CORRECT

parseGapSection runs unconditionally first (safe: returns null on missing summary, gap-sweep.js:196); reverse containment refuses observed_gap_unseeded on any ## Run gaps entry absent from sweptClasses as an exact tuple; vacuous pass requires BOTH sides empty; forward gaps_unswept path byte-unchanged below the restructure; T11 proves forward still fires with reverse satisfied.

## 9. Sink-journal disposal — hook point and crash-resume safety verified

disposeSinkJournals unlinks all 4 candidate paths (live+archive × receipt+fallback), ENOENT-tolerant, warn-only on other errors; called strictly after finalReceipt is captured into memory, after all SINK_STEPS + freshness guard + teardown — any earlier crash/refusal returns before the dispose. Emit gains journal_disposed. Forge sink-merge hand-mirrors validated behaviorally by both sink suites (green below).

## 10. Contract-validator needles — pin the right strings

All four validator diffs read in full: claude validator pins validated_candidate_hash (plan-run command), selection-evidence (workflow-next), observed_gap_unseeded (finalize), run-gaps-manual.md (plan-run), --attest-planner-spawn (agents/workflow-planner.md), and the ## Attestation persistence lock on claim.js; codex/gitlab/gitea validators each pin the TOML + adapt SKILL flag pair and the binding/docking/seeding needles against their own pluginRoot. Needle targets match where the prose actually lives (per the §4 greps).

## 11. Provenance and forge-neutrality — CLEAN

grep -rn '#653|issue-653|issue 653' across agents/, commands/, templates/routing/, and all three plugin agents/skills/commands trees returns nothing (issue refs only in code comments/tests, per convention). Skeleton prose uses the …-plan-validator.js ellipsis device (no concrete basename that would render wrong on gitlab/gitea); the A1 TOML sentence and issue-scout/contractor additions are forge-neutral.

## 12. Independent validation runs (this session, at the reviewed tree) — ALL GREEN

Root walkthrough → "Workflow walkthrough simulation passed" (exit 0); codex walkthrough passed; gitlab + gitea walkthroughs passed; gitlab + gitea codex walkthroughs passed; test-gitlab-sinks.js + test-gitea-sinks.js passed; test-gap-sweep.js → 55 assertions passed; all 4 runnable contract validators passed; test-route-reachability.js → 369 assertions; validate-script-sync.js, generate-routing-surfaces --check, edition-sync --check all green. (The four full npm chains were recorded green sequentially at n6 close; my runs independently re-exercise the walkthrough/validator/sink/sync layers of all four at the exact reviewed tree.)

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 2     | note (R1, R2 — non-blocking, fenced) |

Verdict: APPROVE — no blocking findings. The bundle is faithful to the n1-design spec, the byte/rename/generated-surface discipline held at every seam, refusals are typed and hint-registered, ordering and #475/#648 invariants are proven by the walkthrough's own negative legs, and every validation surface is green at the reviewed tree.
