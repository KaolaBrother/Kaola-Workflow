# advisor — issue-153 ideation gate (2026-05-22)

## Verdict: APPROVE Approach A with four additions.

- Approaches A/B/C cover the design space; no missed alternative.
- Recommendation sound: A's pivot is genuinely minimal (install.sh:366), the
  `install_managed_agent` chokepoint correctly resolves F1. The verified-negative on
  the JS resolver is the key insight shrinking the surface.
- Risks accurate: F1 BLOCKING mode precisely characterized — 2nd `install.sh` run, if
  rewrite deferred, cmp(281) differs → manifest check(286–298) sees current_hash !=
  recorded_hash → "user-owned/modified → skip" branch(295) → installed frontmatter
  regresses → badge silently disappears. Make rewrite atomic with the copy.

## Four ADDITIONS to the Phase 3 write set (planner missed/under-specified)

1. **Script-sync mirroring required for TEST edits.** validate-script-sync.js enforces
   scripts/ vs plugins/kaola-workflow/scripts/ byte-identity. Edits to
   test-install-model-rendering.js (F2) AND validate-workflow-contracts.js (F3) MUST be
   mirrored to the codex plugin scripts path in the SAME commit, else npm test breaks at
   the first validator. Planner's "no plugin-script delta" is correct ONLY for install.sh
   (repo root, not in plugins) — WRONG for the test/validator scripts.

2. **F3 drop-guard scope decision.** gitlab/gitea contract validators
   (validate-kaola-workflow-gitlab-contracts.js:124–128, gitea:122–127) have parallel
   per-command-source assertions. Decide whether the new per-Task( drop-guard goes only in
   the claude validator or all three. Default ALL THREE for symmetry — the failure mode
   (orchestrator drops model=) is forge-agnostic.

3. **Rewrite must preserve the managed marker.** install_agent_files 305–309 /
   verify_installed_file verify installed file contains `kaola-workflow-managed-agent: true`.
   The awk/sed rewrite must touch ONLY the model: line and preserve managed marker,
   source-sha256, name/description. Add a cheap test: after the F2 assertion, also assert
   the managed-marker line still exists in the installed file.

4. **Pin rewrite scope to INSIDE frontmatter.** A naive `^model:` regex matches a model:
   line anywhere in the body (these markdown files contain prose mentioning model:).
   Constrain awk/sed to operate only between opening `---` (line 1) and closing `---`
   (~line 6) via a toggle pattern (`/^---$/`). Must be specified in Phase 3.

Nothing else blocks. Proceed: internal selection = Approach A.
