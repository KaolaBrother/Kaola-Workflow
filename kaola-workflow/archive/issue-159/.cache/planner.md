# Planner — issue-159

## Recommendation: Option A (sidecar directory for untracked files)

## Approaches Evaluated

### Option A — Sidecar directory for untracked files
- **Pros**: Preserves all dirty content; keeps --export contract intact; pure Node (fs.copyFileSync) + git (git ls-files --others --exclude-standard); fail-safe — any copy error hits existing outer try/catch → null → failed_preserve → worktree NOT removed
- **Cons**: Return type changes string|null → string[]|null, requiring a one-line caller change (push(...p) spread) in 4 files; sidecar needs mkdirSync per dest dir for nested paths
- **Risk**: Low
- **Complexity**: Low-medium (~15 lines added per function body, replicated in 4 files)

### Option B — Refuse export when untracked files exist
- **Pros**: Smallest diff; return type unchanged; literally satisfies AC wording
- **Cons**: Degrades the feature — makes --export refuse a large class of valid cases that --archive already solves. User with even one stray untracked file must switch flags or lose work.
- **Risk**: Low technically, high in product terms
- **Complexity**: Trivial
- **Verdict**: Rejected

### Option C — Bundle into a single tar.gz
- **Pros**: Single artifact
- **Cons**: Violates no-external-deps constraint; tar not available on all OS; adds availability-checking + temp-file complexity
- **Risk**: Medium-high (portability)
- **Complexity**: High relative to value
- **Verdict**: Rejected immediately

## Key Gotchas

1. **Four files, not three** — `scripts/kaola-workflow-claim.js` (GitHub) AND `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (Codex/kaola-workflow plugin) are both GitHub-edition copies. Both need identical changes.
2. **Test coverage is in one file** — only `scripts/simulate-workflow-walkthrough.js` tests stale-worktree-cleanup. GitLab/Gitea/Codex plugin walkthroughs have zero export coverage. New tests land in the main walkthrough only (confirmed by validate-workflow-contracts.js pattern).
3. **Empty patch is valid** — untracked-only case produces a zero-byte patch. New tests must assert sidecar content, not patch size.
4. **Nested untracked paths** — git ls-files returns relative paths like `a/b/c.txt`; need mkdirSync(dirname, {recursive:true}) before each copyFileSync.
5. **--exclude-standard is load-bearing** — keeps .gitignore'd trees out of the sidecar.

## Files to Modify

- `scripts/kaola-workflow-claim.js` (lines 145-158: exportWorktreeDiff, lines 724-731: caller)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (same)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (lines 154-167, 728-732)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (lines 149-162, 713-717)
- `scripts/simulate-workflow-walkthrough.js` (add sc9, sc10 after sc8)
- `docs/api.md` (update --export description)

## What NOT to Build

- No manifest/index file in sidecar dir
- No dedup/hashing for efficiency
- No new CLI flags for untracked preservation
- No git stash create roundtrip
- No tar/external tooling (Option C)
- No refactor of failed_preserve safety mechanism
