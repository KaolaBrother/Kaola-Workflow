verdict: pass
findings_blocking: 0

# Code Review — issue #277 (strict lean-orchestrator boundary), gate G1

Scope: full accumulated uncommitted change across 4 editions (47 modified + 4 untracked
non-project files). npm test reported GREEN by the orchestrator; this review focused on
correctness, cross-edition consistency, and design fidelity to the #277 spec (M1/M2/M3/M4).

## Verified correct

M3 — Procedure relocation (PREVENTION).
- Every deleted Step 8a/8b/7/8 body line from commands/kaola-workflow-phase6.md is present
  VERBATIM in agents/contractor.md (exhaustive line-by-line check: only the OLD dispatch
  prompt string is absent, intentionally replaced by the new "your contractor profile" handle).
- commands/kaola-workflow-phase6.md retains only the contractor Agent(...) dispatch handle with
  model="{CONTRACTOR_MODEL}" badge + the main-direct Step 9 sink. No runnable finalize body remains.
- commands/kaola-workflow-adapt.md: grammar/caps/example/Method body removed; the
  workflow-planner Agent(...) handle keeps model="{WORKFLOW_PLANNER_MODEL}"; the full
  claim+author+handoff procedure (startup/Write/adaptive-handoff literals) lives in
  agents/workflow-planner.md as the sole home.
- Forge command files (gitlab/gitea phase6 + adapt) mirror the relocation identically.
- Validators: claude validate-workflow-contracts.js ADDS the contractor-dispatch handle
  text-lock (subagent_type="contractor") — closing the "0 hits" gap — and DROPS the now-stale
  inline-body assertBefore ordering locks (tokens relocated; cross-file ordering not expressible
  via single-file assertBefore). gitlab/gitea validators add the same handle lock.

Cross-edition consistency (item 2).
- contractor.toml byte-identical across all 3 plugin editions; the M4 run-posture line is
  present in all 3 workflow-planner.toml. The .toml carry the relocated procedure as
  edition-appropriate prose (TOML basic strings) — faithful for the Codex edition, which has
  always represented procedures as prose, not verbatim bash.
- The gitlab/gitea validators' assertConcept REPOINT onto the shared repo-root
  agents/workflow-planner.md (root-relative path, no pluginRoot) is SOUND and necessary: the
  gitlab/gitea plugin trees ship only a .toml planner (no markdown agents/workflow-planner.md),
  and install.sh sources markdown agents for ALL forges from the shared repo-root agents/ dir
  (REQUIRED_AGENTS includes contractor + workflow-planner). read() resolves against the repo root
  (line 7), so the bare path reads the correct, shipping file. Targeting the plugin's own profile
  would be wrong — it has no markdown profile.
- Codex contractor-handle lock on the finalize SKILL.md is adequate: Codex has no command file,
  so the SKILL.md is the contractor seam; the validator locks the "SOLE HOME ... MUST delegate"
  clause + the logged local-fallback-tool-unavailable escape.

M4 — Run posture.
- deriveRunPosture(worktreePath) is correct (truthy => worktree, falsy => in-place), pure, no env reads.
- run_posture recorded in the ## Sink block of workflow-state.md (writeState line ~412); inserted
  between sink: and worktree_path:. field() is a multiline-anchored regex (order-independent), and
  worktree_path is never read back from the Sink block via field(), so insertion is parse-safe.
- No --worktree flag added (confirmed by diff). Live state file carries run_posture; simulate
  asserts the regex against the real startup-written state.

M2 — Warn-first closure attestation.
- checkDispatchAttestations mutates only receipt.claim_planner_attested /
  finalize_contractor_attested / receipt.warnings; it NEVER pushes to violations and never flips
  closure_invariants.ok. Confirmed by reading checkClosureInvariants (only the 7 hard invariants
  push violations; the 2 new attestation invariants are never referenced there).
- Missing/absent log => both fields 'missing' + a warning; read error => 'failed' + warning;
  fail-closed default 'failed' in emptyReceipt. warnings[] always initialized.
- Log-path resolution handles the archive-during-finalize move: checks archiveCacheDir
  (result.dest/.cache) FIRST, then liveCacheDir fallback — correct, since archiveProjectDir
  renames the live folder before the attestation check.
- claim.js + closure-contract.js are claude≡codex byte-identical; closure-contract.js is
  byte-identical across ALL 4 editions; gitlab/gitea claim.js carry the same 13 #277 hits with
  no attestation->violations push.
- simulate (claude) asserts both fields present + 'missing' + closure_invariants.ok === true
  (the warn-first contract proof).

M1 — SubagentStart dispatch-log hook.
- hooks/kaola-workflow-subagent-dispatch-log.sh byte-identical across the 3 Claude-Code editions,
  executable, registered in validate-script-sync.js BYTE_IDENTICAL_GROUPS.
- hooks.json SubagentStart wiring identical across 3 editions (matcher "*", timeout 5, correct id).
- install.sh adds the hook to all 3 SUPPORT_HOOK_NAMES blocks.
- Active-project resolution via grep "^status: active" MATCHES production: writeState writes
  'status: ' + (data.status || 'active') and the claim path passes status:'active'; the live
  active state file carries a column-0 'status: active' line (verified).
- End-to-end smoke test PASSED: active project => well-formed JSONL line (ts/agent_type/agent_id/cwd);
  empty stdin => exit 0; malformed JSON => exit 0 (no spurious write); inactive project => skipped.
  Fail-open confirmed on every path.

Docs/README.
- api.md (invariants 8/9 + receipt schema + "never modifies violations"), architecture.md
  (M1-M4 + main-direct carve-out), conventions.md (Subagent Seam Rule), workflow-state-contract.md
  ("seven"->"nine" invariants + run_posture + dispatch-log.jsonl), README ("three"->"four hooks"
  + verify count + run_posture). No stale "seven invariants" references remain.

## Non-blocking nits (do not fix to land; record only)

1. Codex finalize SKILL.md (all 3 editions) retains the full mechanical bash body BELOW the
   "SOLE HOME ... MUST delegate" paragraph. This is the SPECIFIED skills treatment
   (investigation doc §M3: keep the body but gate the inline grant on a LOGGED
   local-fallback-tool-unavailable escape) — the body is the logged-escape procedure, not a
   second ungated grant. The "SOLE HOME" wording sitting directly above a still-present body is a
   minor prose tension, not a defect; the Codex contractor.toml is the agent-side sole home.

2. The dispatch-log hook spawns node -e 4 times per invocation (3 field parses + 1 JSON build per
   active project). Bounded and well within the 5s timeout for the normal single-active-project
   case; only relevant if many projects are simultaneously active. No action needed.

3. run_posture is recorded but not yet consumed by any resume/seam logic beyond presence
   (consumption is future work, matching the spec's "downstream seams and resume read one source
   of truth" framing). Present-and-correct is the Phase-1 deliverable.

Verdict: PASS — no CRITICAL or HIGH issues. M1/M2/M3/M4 are correct, cross-edition consistent,
and faithful to the #277 spec. Warn-first contract is provably preserved.
