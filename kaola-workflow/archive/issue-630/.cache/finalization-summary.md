# Finalization Summary — issue-630 (two-layer routing-surface generation seam)

Closes: #630. Single-issue adaptive BUILD run — the second build off the 2026-07-08 routing-generation-seam
shaping design (on the fenced base #636 delivered). This completes the #630/#636 shaping→build arc.

## Path

`workflow_path: adaptive`. 9-node serial-spine DAG: n1-plan (planner opus — line-verified build spec) →
n2-manifest (tdd-guide opus — Layer 1 manifest + derived checker + red-proof) → n3-engine (tdd-guide opus —
Layer 2 byte-exact generator) → n4-generate (implementer sonnet — chain wiring) → n5-reconcile (tdd-guide opus
— finalize Layer-1 confirm, near-noop) → n6-review (code-reviewer fable) → {n7-adversary (adversarial-verifier
fable, change-gate) ∥ n8-docs (doc-updater sonnet)} → n9-finalize. The validator-touching writes were ONE
serialized frontier (never parallel legs). n7∥n8 serialized at runtime by write_awaits_drain.

## What shipped

**Layer 1 (presence, all 18 surfaces incl finalize):** templates/routing/required-blocks.js (18 blocks: 9
plan-run + 5 finalize + 4 next) + a derived-universe presence checker in test-route-reachability.js — obligated
surface set COMPUTED from tags × emitted-targets registries, so a block cannot obligate a 4-of-6 subset (closes
the #624 whole-block-drop class). A 6-case red-proof battery + a superset proof + a bidirectional orphan-sentinel
guard the checker. Additive-superset: T1..T15 + the #624-fix gate pins + the gitea/gitlab mr|pr) pins untouched.

**Layer 2 (byte, the 12 plan-run/next surfaces):** scripts/generate-routing-surfaces.js + templates/routing/
{plan-run,next}.skeleton.md,slots.js,rename-table.js — reproduces the 12 surfaces byte-for-byte from one skeleton
per topic (surface-type/runtime/forge slots + per-script rename table + sub-sentence splices; the divergent next
topic via 3-way LCS). --check wired into all four npm chains (package.json).

**Finalize = Layer-1-only** (manifest-guarded, hand-authored — 2:1 rewrite makes byte-gen a precedence-#1 risk).

**Behavior-preserving NO-OP CAPTURE:** --write reproduces the committed surfaces byte-for-byte; the 12 surfaces
are byte-UNCHANGED by #630. First-run --check is a verifiable no-op.

## Guarantee live-proven by BOTH gates

- n6-review: planted `--verdict-check` drop on a finalize SKILL → test-route-reachability.js EXIT 1 (manifest
  missing-token); restored to a byte-identical hash. #624 whole-block-drop class closed.
- n7-adversary (change-gate): 8 planted drifts, ALL red through the correct layer, repo byte-clean (27-hash
  baseline). Most notably P4 — an unpinned-prose mutation on a generated surface kept reachability + validator
  GREEN but redded --check (the old-regime-invisible drift class, now caught). P2 whole-block drop reds on BOTH
  manifest + legacy T6 (two layers). Manifest self-disarm + obligation-shrink self-defended.

## Gates

- n6-review (code-reviewer, fable): verdict pass, 0 blocking (2 LOW action=none notes).
- n7-adversary (adversarial-verifier, fable, CHANGE-gate): verdict pass, 0 blocking, 1 non-blocking residual R1
  (fn-closure-audit marker-substring token) → filed #637.
- Script-enforced gates (final committed tree): --resume-check pass, --gate-verify pass, --barrier-check pass
  (0 errors/unattributed), --verdict-check pass (n6 + n7 both verdict:pass).
- --finalize-check (chain-receipt, UNWAIVED): pass — all four chains genuinely green, no waiver (#635 fixed).

## Run gaps

- **R1 (n7-adversary residual) → `filed: #637`.** fn-closure-audit's 2nd content_token is a substring of its own
  marker, so a marker-preserving interior gut of that one finalize block stays green — a spec-accepted residual
  (= pre-#630 T6 strength, NOT the #624 whole-block-drop class), filed as a low-severity hardening follow-up.
- **n6 R1/R2 (edition-dir table duplication; superset-proof representative-not-exhaustive) → `noise`.** Both
  out_of_scope action=none; fail-closed / zero coverage loss; not product defects.
- No in_run_repair (all nodes passed first-try, no reopen), no deferred_red_chain (unwaived receipt).

## Implementation commit

- `feat(routing): #630 two-layer routing-surface generation seam` — the 12-file impl+docs set (the 12 routing
  surfaces byte-unchanged, not committed). Main-session-authored.

## Goal attestation

`KAOLA_GOAL` set. `goal_check: satisfied`.
