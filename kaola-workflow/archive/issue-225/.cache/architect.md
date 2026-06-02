# Architect — issue-225 (9-item sweep, verified post #220/#230/#222)

## Per-item (exact, current tree)
**#19** remove `target_mismatch` token from 6 LIVE files (no validator asserts it; no script emits it):
- commands/workflow-next.md:161 (mid-line); plugins/kaola-workflow-gitlab/commands/workflow-next.md:162; plugins/kaola-workflow-gitea/commands/workflow-next.md:162 — delete `` `target_mismatch`, `` mid-line.
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:168; gitlab next-SKILL:171; gitea next-SKILL:169 — delete `` `target_mismatch`, `` (first wrapped token on its line).
Resulting list: (target_occupied, user_target_blocked, user_target_red, target_unavailable, target_unverified).

**#20** gitea classifier self-scope (plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js; NOT touched by #230 which edited classifyIssue/cmdClassify state-checks):
- Line 49: SHARED_INFRA drop the 'plugins/kaola-workflow-gitlab/scripts' entry → `new Set(['scripts','hooks','plugins/kaola-workflow-gitea/scripts'])`.
- Lines 65-69: delete the `if (filePath.startsWith('plugins/kaola-workflow-gitlab/')) {...}` branch in areaForPath (keep gitea branch + default).

**#21** uninstall.sh COMMANDS array line 85: change `"$HOME/.claude/commands/workflow-next.md"` → `"$HOME/.claude/commands/workflow-next"*.md` (glob — matches array convention at :87/:89; also catches workflow-next-pr.md).

**#22** install.sh: insert after the `_TMPDIR="$(mktemp -d)"` line (24): `  trap 'rm -rf "$_TMPDIR"' EXIT`. (Leave the existing redundant rm -rf at :29.) Verify bash -n.

**#23** scripts/validate-script-sync.js (root-only): add 4th BYTE_IDENTICAL_GROUP after line 79 (before closing `];`):
```js
  {
    label: 'phantom-advisor hook copies',
    files: [
      'hooks/kaola-workflow-phantom-advisor.sh',
      'plugins/kaola-workflow-gitlab/hooks/kaola-workflow-phantom-advisor.sh',
      'plugins/kaola-workflow-gitea/hooks/kaola-workflow-phantom-advisor.sh',
    ],
  },
```
3 copies (NO Codex copy), byte-identical md5 cee811e4. Coexists with #220's resolve-agent-model group. RED-provable: perturb a copy → exit 1 "phantom-advisor hook copies: ... differs".

**#25** Codex skills repoint (2 functional refs; fast-SKILL:9 "Mirror of" provenance KEEP):
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:113 `…section of \`commands/kaola-workflow-fast.md\`. Export` → `…section of the \`kaola-workflow-fast\` skill. Export`
- :128 `…sections of \`commands/kaola-workflow-fast.md\`; false` → `…sections of the \`kaola-workflow-fast\` skill; false`
(Repoint to bare skill name, matching the :244 routing convention. #222's restructure means the Mid-Flight Escalation/Resume Detection headings now exist in the fast SKILL.)

**#26** parity notes. Source (root commands/kaola-workflow-phase6.md): cleanup note :579 ("**Main-worktree cleanup is atomic.** cmdFinalize now cleans up both..."); safety-guard :589 ("`sink-merge` will refuse with exit 1 if `kaola-workflow/{project}/workflow-state.md` is still present on the branch HEAD ... ensures finalize always precedes the merge."). Notes are FORGE-AGNOSTIC (no gh/glab/tea, no PR/MR) — only placeholder differs.
- CORRECTION: ALL THREE finalize SKILLs ALREADY have the cleanup note → add safety-guard ONLY (with ${KAOLA_PROJECT}): plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md (append after :130), gitlab finalize SKILL (after :129), gitea finalize SKILL (after :129).
- Forge phase6 commands need BOTH (with {project}): plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md (cleanup after code-block close :586 before "When it runs" :588; safety-guard append to "…git rename detection." :591); gitea phase6 command (:586 / :590). Cleanup note anchors AFTER the code-block close (forge lacks root's intro sentence).

**#30** .env.example: line 19 `(GitHub and GitLab)` → `(GitHub, GitLab, and Gitea)` (KAOLA_WORKFLOW_FORCE_FF_FAIL); line 23 same (KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE). Gitea honors both (verified).

**#31** rm -rf -- ./--help (untracked; contains a stray .codex profile tree from a bad `install.sh --help`). NOT in commit. ./issue-149 already gone. Do NOT touch tracked kaola-workflow/archive/issue-149/.

## Write set: 16 files edited (next-SKILL Codex carries #19 + #25) + rm ./--help
commands/workflow-next.md, gitlab + gitea workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md (#19+#25), gitlab + gitea next-SKILL, gitea classifier, uninstall.sh, install.sh, scripts/validate-script-sync.js, gitlab + gitea phase6 commands, 3 finalize SKILLs, .env.example.

## Byte-sync: NONE are byte-identical pairs; all independent/single-file. Only validator-group change is #23. Non-conflicting with #220/#230/#222 (verified per-item).

## Tests
- #23 RED-provable (perturb phantom-advisor copy → validator exit 1). The validator IS the regression.
- #19 optional drift-lock: add 'target_mismatch' to the `retired` token array in scripts/validate-workflow-contracts.js:96 (its assertNotIncludes runs vs commands/workflow-next.md:164) — locks ROOT command; next-SKILLs proven by grep→0. Verify gitlab/gitea command validators have an equivalent retired check before relying.
- #20 optional (areaForPath unexported; route via extractCoarseAreas) — re-run gitea contracts.
- #21/#22 bash -n. #25/#26/#30 prose — contract validators + review.

## Acceptance
node scripts/validate-script-sync.js (will say "4 byte-identical file group"); bash -n install.sh uninstall.sh; 4 contract validators; node scripts/test-fast-audit.js; all 6 walkthroughs; npm test.
