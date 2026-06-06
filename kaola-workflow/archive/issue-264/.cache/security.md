verdict: pass
findings_blocking: 0

# Security review — issue #264 (filesystem / worktree-cleanup surface)

Node: `security` (defense-in-depth gate; NOT validator-forced — labels not in SENSITIVE_LABELS,
no declared write path matches a Phase-5 SENSITIVE_PATTERN). Scope: the UNCOMMITTED change set on
main (repo-root adaptive run), `kaola-workflow/**` artifacts ignored. Reviewed:
`scripts/kaola-workflow-claim.js` (+ Codex byte-identical mirror), `scripts/kaola-workflow-sink-merge.js`,
the gitlab/gitea forge ports, `.gitignore`, `scripts/simulate-workflow-walkthrough.js`.

## Verdict rationale

No CRITICAL or HIGH finding. The destructive surface (cmdLegacyWorktreeCleanup) is git-owned,
dry-run-by-default, dirty-safe, and path-bounded. The AC7 sink guard, the AC6 suppression drop,
and the `.gitignore` change introduce no exploitable or data-loss risk in the new code. Walkthrough
green; Claude↔Codex byte-identity holds (claim + sink-merge `diff -q` clean); gitlab/gitea cleanup
bodies are logic-identical to root.

## Focus-area findings

### 1. Destructive-operation safety in cmdLegacyWorktreeCleanup — PASS
- Removal is strictly git-owned: present worktrees via `removeWorktree` →
  `execFileSync('git', ['worktree','remove','--force','--', wtPath])` (claim.js:220); missing
  registrations via `git worktree prune` (claim.js:~1270). NO raw `rm -rf` on the normal path.
  (The only `rmSync({recursive,force})` occurrences in the diff are tmp-dir teardown inside
  simulate-workflow-walkthrough.js test fixtures, not production logic.)
- Dry-run IS the default: `const dryRun = !args.execute;` (claim.js:~1228). Real removal requires
  `--execute`. Mirrors the established cmdStaleWorktreeCleanup contract (:952).
- Dirty worktrees are NEVER silently destroyed: `if (state === 'dirty' && !(args.archive ||
  args.export || args.force))` → bucket `skipped_dirty`, `continue` (AC4). On `--archive` →
  `stashWorktree`, on `--export` → `exportWorktreeDiff`, on `--force` → straight `--force` remove.
- Empty-container removal uses `fs.rmdirSync(legacyContainerDir)` (NON-recursive — refuses a
  non-empty dir), wrapped in try/catch reporting `removed_container`/`container_not_empty`. A stray
  dirty/skipped worktree keeps the container alive exactly as the design intends. Confirmed it is
  NOT a recursive force-delete.
- cwd-inside refusal: reuses the `cwdInside(wt.worktree)` guard (refuses the whole run if cwd is
  inside any candidate legacy worktree), matching stale-cleanup.

### 2. Path safety / traversal — PASS
- `worktreePathFor` (NEW) and `legacySiblingWorktreePathFor` both derive `mainRoot` from
  `mainRootFromCoord(getCoordRoot(root))` (git `--git-common-dir`, absolute-resolved). `project` is
  validated by `isSafeName` (active-folders.js:14) at every claim/provision call site
  (claim.js:416, 631, 848, 1091) — it rejects `/`, `\`, `\0`, `.`, `..`, so a crafted project name
  cannot escape `<root>/.kw/worktrees/`. The cleanup subcommand passes the literal string `'x'` to
  `legacySiblingWorktreePathFor` purely to compute the container dirname — no user input there.
- The cleanup operates ONLY within the computed legacy container: the filter keeps a registered
  worktree only if its realpath `=== legacyContainerReal` or startsWith `legacyContainerReal +
  path.sep`. Both sides realpath-resolved before comparison (symlink-robust). It cannot match or
  remove worktrees registered elsewhere, and `removeWorktree` acts on the discovered
  `worktree_path` only — no arbitrary-path deletion.
- NEW container (`<root>/.kw/worktrees/`) and LEGACY container (`<parent>/<repo>.kw/`) are distinct
  paths, so the cutover scan cannot accidentally sweep the new repo-local worktrees.

### 3. Command-execution safety — PASS
- All new git calls use `execFileSync('git', [array], opts)` — argv arrays, no shell. No
  user/branch/project value is interpolated into a shell string anywhere in the new code.
- `removeWorktree` and `provisionWorktree` use the `--` end-of-options separator before the path
  (claim.js:220, 264, 269), so a path beginning with `-` cannot be parsed as a git flag.
- AC7 guard's `git rev-parse --verify origin/main` and `git diff --name-only base...branch` are
  both array-arg execFileSync with `-C mainRoot`; `branch` is interpolated only into the
  three-dot diff revspec as an array element, not a shell string.

### 4. AC6 suppression drop — PASS (no data-loss consequence)
- Provisioning is gated `if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root))` and wrapped in
  try/catch: on failure it records `worktree_error` and leaves `worktree_path: ''`, preserving the
  repo-root fallback. `KAOLA_WORKTREE_NATIVE=0` still opts out entirely.
- Provisioning path is the `isSafeName`-validated repo-local one (no attacker-influenced path).
  No clobber: `worktreeRegistered` / `fs.existsSync(wtPath)` short-circuit before any
  `git worktree add`, so an existing worktree/dir is reused, never overwritten.

### 5. AC7 sink guard — PASS (correctness-adjacent; no exploitable bypass)
- The guard FAILS OPEN by design when origin/main is unresolvable or the diff errors (early
  `return`), and is skipped under OFFLINE — matching the existing `assertBranchPushedToUpstream` /
  merge-base skip posture. This "skip when no integration base" is a deliberate, documented choice,
  not a silent bypass: in those states there is no base to judge against. A `files.length === 0`
  branch is left to the existing up-to-date/FF logic. The only refusal arm
  (`files.every(f => f.startsWith('kaola-workflow/'))`) is conservative and proven by
  testSinkRefusesWorkflowOnlyBranch / testSinkAllowsMixedBranch. No way found to trick it into
  ALLOWING a silent-loss (workflow-only) merge that a real integration base would have caught.
- NOTE (LOW / informational, not blocking): the `startsWith('kaola-workflow/')` prefix is
  forge-neutral and matches the artifact convention; a hypothetical real implementation file placed
  literally under `kaola-workflow/` would be miscounted as bookkeeping, but that is an
  out-of-convention authoring choice, not a security/data-loss exposure, and the remediation text in
  the throw explains how to proceed.

### 6. `.gitignore` `.kw/` — PASS
- Ignoring `.kw/` keeps the repo-local worktree container (a working copy / linked-worktree admin
  files) out of the tracked tree — correct and necessary (otherwise `git status` in main would
  surface the worktree). It does not hide sensitive committed artifacts (worktree contents are
  themselves a checkout of tracked history on `workflow/issue-N`, committed on their own branch),
  and it does not leak anything: the working copy lives only on the developer's disk and is never
  added to main. No secret-hiding or leak concern.

## Cross-cutting checks
- Forge parity: gitlab/gitea `cmdLegacyWorktreeCleanup` + `assertBranchHasNonWorkflowChanges` bodies
  were each opened directly in the diff and are logic-identical to root (path math + git, no forge
  token). Both forge sink-merge ports use `execFileSync('git', [array], opts)` exclusively — no
  `execSync`/string-shell interpolation/backticks/spawn — and are called under `if (!OFFLINE)`.
  No shell injection introduced in any of the four edition copies.
- Byte-identity: `diff -q` clean for claim.js and sink-merge.js (Claude↔Codex).
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed".

## Itemized findings
| # | Severity | File:line | Issue | Fix |
|---|----------|-----------|-------|-----|
| 1 | LOW (info, non-blocking) | scripts/kaola-workflow-sink-merge.js:~110 (`allWorkflow` prefix check) | A real impl file authored literally under `kaola-workflow/` would be classified as bookkeeping by the AC7 guard. Convention-violating, not a security/data-loss risk. | None required; the throw's remediation text covers the docs/roadmap-only intentional case. |

No CRITICAL or HIGH findings. Gate passes.
