# Phase 2 - Ideation: issue-225

This is a mechanical sweep with no algorithmic design choices. The few decisions are placement/form and the corrections the architect verified against the live tree.

## Decision #21 — glob vs literal in uninstall.sh
Chosen: **glob** `"$HOME/.claude/commands/workflow-next"*.md` (matches the array's own convention at :87/:89 which already use `…"*.md`). Catches `workflow-next.md` AND the legacy `workflow-next-pr.md` AND any future `workflow-next-*`. Future-proof; one-line change. (Literal-add-a-line is the alternative, mirroring install.sh's explicit style, but the array already globs elsewhere.)

## Decision #25 — repoint target form
Chosen: **bare skill name** `kaola-workflow-fast` (matching the next-SKILL's own routing convention at :244 `… -> kaola-workflow-fast`; the repo references skills by name, not relative path). Only the 2 functional refs (:113, :128) are repointed; the fast-SKILL:9 "Mirror of `commands/kaola-workflow-fast.md`" is provenance about the REAL root command file — KEEP. #222 already added the Mid-Flight Escalation / Resume Detection headings the refs describe, so the repointed text is accurate.

## Correction #26 — finalize SKILLs already have the cleanup note
The issue premise ("Codex already has the cleanup note; all need the safety-guard note") is partly wrong: empirically ALL THREE finalize SKILLs (Codex + gitlab + gitea) already carry the cleanup note. So finalize SKILLs get the **safety-guard note ONLY** (re-adding cleanup would duplicate). Forge phase6 COMMANDS have neither → both. The notes are forge-agnostic (no gh/glab/tea, no PR/MR) — the only adaptation is the placeholder (`{project}` in phase6 commands, `${KAOLA_PROJECT}` in finalize SKILLs). Cleanup note anchors AFTER the forge phase6 code-block close (forge lacks root's intro sentence) — not line-mirrored to root.

## Correction #23 — three copies, not four
The phantom-advisor hook has exactly 3 byte-identical copies (root + gitlab + gitea; the Codex pack ships no copy). The new group lists 3 files (unlike the 4-file pre-commit/closure-contract/resolve-agent-model groups).

## Test posture
- #23 is RED-provable (perturb a phantom-advisor copy → validator exit 1) — the validator is its own regression. Verify the bite.
- #19 optional drift-lock: add `target_mismatch` to the `retired` token array (validate-workflow-contracts.js:96) to lock the ROOT command file; the 3 next-SKILLs are proven by `grep -rl target_mismatch` → 0 (no validator covers those). Don't oversell the retired-list as full coverage.
- #20/#25/#26/#30 are prose/config — validated by the existing contract validators (token-inclusion still passes) + review; #21/#22 by `bash -n` + npm test.
- #31 is untracked working-tree cleanup — not part of the commit.

## Cross-cutting
No byte-identical pairs among the 9 (all independent/single-file). Only validator-group change is #23. Verified non-conflicting with the just-merged #220 (validate-script-sync group), #230 (gitea classifier region), #222 (next-SKILL line + fast SKILL restructure).
