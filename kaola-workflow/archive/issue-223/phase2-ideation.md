# Phase 2 - Ideation: issue-223

Three independent design decisions, each recorded explicitly (this is why #223 is full-path, not fast).

## Decision #13 — abandonment-aware closure invariants
### Options
- **A (chosen): read `receipt.archive` inside `checkClosureInvariants`.** Add `const abandoned = receipt && receipt.archive === 'abandoned';` and gate the two roadmap invariants on `!abandoned`. No signature change.
- B: add a `mode`/`abandoned` parameter threaded from every caller.
### Decision: A.
`receipt.archive === 'abandoned'` is set ONLY at the watch CLOSED/abandoned call sites (verified: `sink-merge.js:262` sets only `'closed'`/`'failed'`; finalize/MERGED paths set `'closed'`/`'skipped'`). So reading the field is unambiguous. Option B would ripple the signature across 4 `claim.js` + 4 `sink-merge.js` copies for zero benefit. The `archive-state-closed` invariant already special-cases `'abandoned'` — A mirrors that established pattern. The label/active-folder/branch-worktree invariants are left intact (still correct for an abandoned PR).

## Decision #14 — recover the orphaned stateless project dir
### Options
- 1 (atomic claim: write state to a temp path, then rename into the new dir)
- **2 (chosen): reclaim a stateless dir in the EEXIST branch.** On `mkdirSync` EEXIST, return `target_occupied` only if `stateFile` exists; otherwise fall through and reclaim (write state into the existing empty dir).
- 3 (let release/discard clear it)
### Decision: 2.
Option 1 does NOT actually deliver claim atomicity: `provisionWorktree` runs as a separate side effect BETWEEN `mkdirSync(dir)` and `writeState`, so temp+rename only makes the state-file write atomic, not the whole claim — the orphan-dir window it targets is only partially closed, and it cannot recover a *pre-existing* orphan (rename onto a non-empty dir → ENOTEMPTY). Option 2 is strictly better: it recovers both the crash-window orphan AND any pre-existing stateless/non-empty orphan, and — critically — **leaves the every-issue happy path (mkdir succeeds → writeState) byte-for-byte unchanged.** Since `claimProject` is the machinery used to claim every subsequent issue, an edit confined to the EEXIST error branch is the lowest-risk option (the named risk constraint). Option 3 doesn't fix the orphan-forever problem if the user never runs release/discard. The reclaim is locked by a regression test asserting the negative boundary (a dir WITH an active state file still → `target_occupied`).

## Decision #15 — patch-branch existence guard
### Options
- existsSync(projectDir) — REJECTED: true for a #14 orphan dir, so it would still write a partial state file → `status: unknown` phantom.
- **activeByProject(root, project) (chosen).** Returns null for stateless/inactive dirs, so patch-branch refuses in exactly the phantom-producing cases and composes correctly with the #14 fix.
### Decision: `isSafeName` first (path-safety before any path is built), then `activeByProject`. Two asserts inserted before `updateState`. Security-relevant: closes the path-traversal write (`--project ../escape`).

## Cross-cutting: byte-sync discipline
- root `claim.js` is canonical; Codex is restored via `cp` (validate-script-sync enforces byte-identity).
- gitlab/gitea claim copies are forge-adapted (prefixed names, `issue_iid`, glab/tea) — same logical edits hand-applied; their only regression net is the forge test suites (hence net-new forge tests).
- closure-contract.js is NOT touched.
