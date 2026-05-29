# Advisor Plan Output — issue-190

## Verdict: Endorse — proceed to Phase 4.

## Approved Deviations (technical calls, not user escalations)
- D2/O5: Correct to drop adaptation #2 (command-file cross-ref preserved verbatim; fast SKILLs have no Mid-Flight Escalation section)
- D3: 3 per-edition validators is a factual correction to Phase 1/2 file names
- D1: Port from each edition's own command file (adaptations #1/#2 pre-baked)
- D4: No validator asserts current Required Output verbatim, so adding 3 lines breaks nothing

## Phase 4 Execution Risks

1. **M2 must be content-based deletion, NOT line-number-based** — KAOLA_WORKTREE_PATH (lines 23-25) is LIVE and interleaved. After any deletion, line numbers shift. Delete each block by its unique var-name+comment as old_string. Re-grep after to confirm all 5 gone AND KAOLA_WORKTREE_PATH survived. Same for docs/api.md:109 — match bullet text, not line number.

2. **Per-edition sourcing must not cross-wire** — GitLab SKILL from gitlab command, Gitea SKILL from gitea command. Verify each ported block has right CLI (gh/glab/tea) and right cross-ref path.

3. **Observe RED per edition before GREEN** — run all 3 validators after assertions, confirm each fails independently. Then add SKILL content and confirm each flips to PASS.

4. **Needle exactness** — assertion needles must be exact substrings of what's inserted (em-dash in header, {…} literals). Keep short stable prefixes.
