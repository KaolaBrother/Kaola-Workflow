security-reviewer: issue-44 — agent-directed issue picking
file reviewed: scripts/kaola-workflow-claim.js
date: 2026-05-18

---

## MEDIUM — Missing validation of `--target-issue` as a positive finite integer before use

**Location:** `parseArgs` (line 158), `cmdStartup` (lines 1399–1421), `cmdPickNext` (lines 2380–2392)

**Description:**
`args.targetIssue` is set via `parseInt(argv[++i], 10)`. `parseInt` can produce:
- `NaN` when the argument is not numeric (e.g., `--target-issue abc`)
- Negative integers (e.g., `--target-issue -1`)
- Unreasonably large integers (e.g., `--target-issue 9999999999`)

**NaN case — partially mitigated, logic gap remains:**
`NaN` is falsy, so the `if (!args.targetIssue)` guard at lines 1399 and 2380 fires, returning early with `verdict: 'no_target'`. That prevents `NaN` from reaching `claimExplicitTarget`. However, at line 1350 the expression `if (args.targetIssue && owned.issue_number !== args.targetIssue)` evaluates `NaN && ...` as `NaN` (falsy), silently skipping the target-mismatch check. This does not create a vulnerability but is a logic gap that could mask incorrect caller behavior.

**Negative integer case — NOT mitigated:**
A value such as `-1` is truthy, so it passes through `!args.targetIssue` and reaches `claimExplicitTarget`. Inside `claimExplicitTarget`:
- `issueAlreadyClaimed(coordRoot, root, -1)` performs a set-membership check on loaded lock data; `-1` will never match, so it returns `false` (safe in practice).
- `classifyIssueCandidate(classifierScript, -1)` calls `execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '-1'])`. Because `execFileSync` is used (not `exec`), no shell is involved and there is no injection risk. The child process receives the literal string `"-1"`, which it must handle safely itself.
- `'issue-' + (-1)` produces the string `'issue--1'`, which `isSafeName` passes (it contains no path separators or null bytes). `path.join` constructs a structurally valid path from it. No path traversal results.

The functional impact is that an agent or adversarial caller who controls the `--target-issue` argument and passes a negative value will cause the workflow to attempt to claim a nonexistent issue. The downstream claim will fail cleanly (no GitHub issue `-1` exists), but the code will write a lock file under `kaola-workflow/issue--1/` if the classifier returns `green` — creating orphan filesystem state.

**Recommendation:** Add an explicit guard immediately after `parseArgs` in both `cmdStartup` and `cmdPickNext`, consistent with the guard already present in `validateClaimArgs` for `--issue` (line 875):

```js
assert(Number.isFinite(args.targetIssue) && args.targetIssue > 0,
  '--target-issue must be a positive integer');
```

Alternatively, validate inside `claimExplicitTarget` itself so all callers benefit.

---

## LOW — TOCTOU window between `issueAlreadyClaimed` and `writeLockFile` in `claimExplicitTarget`

**Location:** `claimExplicitTarget` (lines 1291–1313), `cmdClaim` / `writeLockFile` (lines 1546–1547, 812–820)

**Description:**
`claimExplicitTarget` performs a non-atomic read-check-then-claim sequence:
1. `issueAlreadyClaimed` reads lock files (line 1292)
2. `classifyIssueCandidate` spawns a subprocess (line 1298) — a window of tens to hundreds of milliseconds
3. `runBootstrapClaim` spawns another subprocess that calls `writeLockFile` using `fs.openSync(lp, 'wx', 0o600)` (line 813) — the O_EXCL flag

The O_EXCL write in `writeLockFile` is the actual atomic lock. If a second session claims the same issue during the classifier window, the O_EXCL call fails with `EEXIST`, `cmdClaim` exits with code 2, `runBootstrapClaim` returns `false`, and `claimExplicitTarget` returns `status: 'target_occupied'`. The system handles this correctly.

The `issueAlreadyClaimed` pre-check at line 1292 is therefore an optimization (avoiding the classifier subprocess cost) rather than a security boundary. This is a well-understood pattern. The residual concern is that the pre-check creates a false sense of atomicity — a reader of `claimExplicitTarget` might not realize the real guard is inside `cmdClaim`. A comment documenting this intent would eliminate the ambiguity.

**Severity rationale:** No data corruption or race-to-exploit path exists because the O_EXCL guard is correct. Severity is LOW.

---

## LOW — `projectNameForIssue` reads the filesystem based on caller-supplied `issueNumber` before type validation

**Location:** `projectNameForIssue` (lines 1140–1151), called from `classifyIssueCandidate` (line 1159)

**Description:**
`projectNameForIssue` constructs a path via `roadmapIssuePath(getRoot(), issueNumber)` which produces `path.join(roadmapDir(root), 'issue-' + issueNumber + '.md')`. When `issueNumber` is a negative integer (e.g., `-1`), the resulting filename is `issue--1.md`. When it is `NaN`, the filename is `issue-NaN.md`. In both cases `path.join` produces a structurally safe path (no traversal). The function only reads the file (`fs.readFileSync`) and returns a string; it does not write or execute based on the returned value before `isSafeName` validates the project name downstream at line 1205. No injection or traversal results.

This is noted because the filesystem read occurs before any integer sanity check, which is a defence-in-depth gap rather than an exploitable vulnerability.

---

## PASS — No shell injection risk in `execFileSync` calls

`classifyIssueCandidate` (line 1155) and `runBootstrapClaim` (line 1209) both use `execFileSync` with an explicit argument array. No shell is involved (`shell: false` is the default). User-supplied values arrive as discrete array elements, not as a concatenated shell string. Path traversal through issue numbers is not possible because `parseInt(..., 10)` always produces a number (or NaN), and `String(number)` never contains shell metacharacters or path separators.

---

## PASS — No hardcoded secrets or credentials

No API keys, passwords, tokens, or hardcoded credentials were found in the changed code or in the file.

---

## PASS — `isSafeName` applied to project name from classifier output before use in paths and exec args

Line 1205 asserts `isSafeName(pick.project)` before passing the project name to `execFileSync` args and `path.join` calls. This correctly prevents a malicious classifier response from injecting path separators or null bytes.

---

## PASS — `--sink` and `--runtime` enumeration validated

Both `cmdStartup` and `cmdPickNext` assert that `--sink` is one of `{merge, pr}` and `--runtime` is one of `{claude, codex}` before use. No open-ended string from user input reaches exec arguments through these parameters.

---

## Summary

| Finding | Severity | Status |
|---|---|---|
| `--target-issue` accepts negative integers and NaN without explicit validation | MEDIUM | Open |
| TOCTOU window mitigated by O_EXCL but not documented | LOW | Open (doc only) |
| `projectNameForIssue` reads filesystem before integer validation | LOW | Open |
| No shell injection via execFileSync | — | Pass |
| No hardcoded secrets | — | Pass |
| isSafeName guard on classifier-returned project name | — | Pass |
| --sink and --runtime enumeration validated | — | Pass |

No CRITICAL or HIGH issues found.
