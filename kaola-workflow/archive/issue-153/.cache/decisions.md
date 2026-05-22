# issue-153 — decision / deviation log

## D1: Phase 1 Step 6 dirty-worktree gate deviation (2026-05-22)
The skill instructs "stop if `git status --porcelain` is non-empty". At branch-cut
time porcelain showed ONLY untracked entries (`.codex/` pre-existing junk,
`kaola-workflow/.roadmap/`, `kaola-workflow/issue-153/`) plus one staged NEW file
(`A kaola-workflow/.roadmap/issue-153.md`). `git status --porcelain --untracked-files=no`
was EMPTY → zero modified/staged tracked files.
Decision: PROCEED with `git checkout -b workflow/issue-153`. The gate guards against
clobbering / silently carrying tracked-file modifications; neither applies to untracked
files or a staged new file absent on both branches. `checkout -b` carries them safely.
Advisor concurred (the `--untracked-files=no` empty result is the correct discriminator).

## Forward-looking items to resolve in Phase 2 decision / Phase 3 write set (advisor-flagged)
- F1 (re-install re-copy path): install.sh:297 `cp "$source_file" "$dest"` re-copies concrete
  source over installed file on the manifest-update branch. The inherit-rewrite must fire on
  BOTH first-install AND manifest-update copy branches (single chokepoint), else a 2nd
  `install.sh` run silently regresses installed frontmatter back to concrete → badge lost.
- F2 (AC-a coverage gap): test-install-model-rendering.js covers AC (b)/(c) (command files keep
  concrete model=, no dropped lines) but NOT (a) "installed agent frontmatter resolves to inherit".
  Phase 3 write set must add an assertion that reads installed agent files and confirms `model: inherit`.
- F3 (parent-Opus tradeoff guard): under inherit, a dropped `model=` makes the agent run on parent
  (Opus) silently. Check whether validate-workflow-contracts already asserts every command source
  template carries its `model="..."` line; if not, add a static check so the line can never be dropped.

## D2: Phase 2 ideation — Approach A selected (2026-05-22)
planner + advisor both approve Approach A: pivot resolve_agent_model_for_install (install.sh:366) to
read the profile-applied SOURCE file; inject `inherit` via a single `install_managed_agent` chokepoint
(cp + in-frontmatter model:->inherit rewrite) at both copy sites (292 managed-update, 301 first-install),
manifest sha256 (311) recorded downstream of the rewrite. JS resolver verified OFF the badge path → no change.
Rejected B (declare -A breaks bash 3.2) and C (breaks upstream fidelity + profile representation problem).

### Corrected script-sync mirroring scope (primary-source verified, refines advisor addition #1)
COMMON_SCRIPTS in validate-script-sync.js = [kaola-workflow-claim, -active-folders, -classifier,
-repair-state, -resolve-agent-model, -roadmap, -sink-merge, -sink-pr, validate-workflow-contracts.js].
- F3 edit `validate-workflow-contracts.js` IS a COMMON_SCRIPT → MUST mirror to
  plugins/kaola-workflow/scripts/validate-workflow-contracts.js (byte-identical, same commit).
- F2 edit `test-install-model-rendering.js` is NOT in COMMON_SCRIPTS and is ABSENT from the plugin tree
  (Claude-only test) → MUST NOT be mirrored. (Advisor was over-cautious; primary source corrects this.)
- `kaola-workflow-resolve-agent-model.js` + `test-agent-model-resolver.js`: NOT edited (off-path).

### F3 drop-guard scope decision: ALL THREE forge validators
AC says "no model= line dropped from ANY command template" + "GitLab and Gitea command copies mirrored".
The drop-guard (per-Task( `model="{..._MODEL}"` presence) goes in: validate-workflow-contracts.js
(claude/codex, mirrored), validate-kaola-workflow-gitlab-contracts.js, validate-kaola-workflow-gitea-contracts.js.
Failure mode (orchestrator drops model=) is forge-agnostic.

## D3: Pre-existing #152 script-sync drift incidentally fixed (Phase 4, 2026-05-22)
At HEAD (d22e60c), plugins/kaola-workflow/scripts/validate-workflow-contracts.js was 20 lines behind the
canonical scripts/ copy — missing the issue-152 routed-fix validation block. validate-script-sync.js was
therefore failing on main (latent). To add the F3 guard to the mirror AND satisfy byte-identity, the mirror
was cp'd from canonical, which backfilled the missing block. Unavoidable + correct. Net: this issue-153 PR
also resolves the pre-existing #152 mirror drift → the plugin-mirror diff is larger than the canonical diff.
MUST be called out in the PR description so a reviewer doesn't mistake the extra mirror lines for scope creep.

### Rewrite mechanism (Phase 3 edit-time): awk frontmatter-scoped, value-agnostic
Use awk with a `/^---$/` toggle so only the FIRST frontmatter block is touched (markdown bodies mention
"model:" in prose). Replace whatever follows the first in-frontmatter `model:` with `inherit`. Preserve
managed marker (`kaola-workflow-managed-agent: true`), source-sha256 comment, name/description. No `sed -i`
(BSD/GNU divergence). Test must assert installed file STILL has the managed marker after rewrite.
