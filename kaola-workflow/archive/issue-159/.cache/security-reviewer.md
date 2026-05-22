# Security Review — issue-159

## Verdict: 1 MEDIUM finding — symlink dereference

No CRITICAL or HIGH issues. No command injection, no shell usage, no hardcoded secrets, no path traversal via numeric issueNumber or git-relative paths.

## Finding 1 — MEDIUM: fs.copyFileSync dereferences untracked symlinks

`fs.copyFileSync(src, dest)` follows symlinks. `git ls-files --others --exclude-standard` lists untracked symlinks as single entries. The copy loop dereferences them, writing the *target's contents* as a plain file into the sidecar directory.

The sidecar is at `<root>/kaola-workflow/archive/exports/issue-N-TS-untracked/` which is NOT gitignored. A worktree containing an untracked symlink like `creds -> ../../../other-project/.env` or `k -> ~/.ssh/id_rsa` causes that secret to be copied as regular file content into a tracked location, where it can be committed, pushed, or shared.

**Threat bound**: requires write access to the worktree (user running cleanup already has this). Risk: accidental secret/PII leakage into version control. Maps to OWASP A01 (Broken Access Control) and A04 (Insecure Design).

**Empirically verified**: `git ls-files` emits a symlink as an entry; `fs.copyFileSync` dereferences and produces a plain-file copy of the target's content.

**Remediation**: Before copying, `lstatSync(src)` and skip symlinks:
```js
const st = fs.lstatSync(src);
if (st.isSymbolicLink()) continue;
```
Apply to all 4 identical copies:
- `scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

## Verified-safe

- **Path traversal**: `git ls-files --others` emits repo-relative paths with no `..` — safe.
- **Command injection**: All git calls use `execFileSync('git', [array])` with no shell — safe.
- **issueNumber injection**: Derived as `Number(m[1])` from `/workflow\/issue-(\d+)/` — numeric only, used only in filenames — safe.
- **`.git/` metadata**: `--exclude-standard` excludes .git — safe.
- **Diff patch**: `git diff HEAD` only outputs tracked changes, no symlink dereference — safe.
