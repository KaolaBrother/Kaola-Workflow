# Advisor Gate — Issue #34 Ideation

## Verdict
Approach A (cmdFinalize subcommand) is correct. Two load-bearing items required verification before committing.

## Item 1 — Cross-Worktree Archive Ordering (CRITICAL — changes invocation site)

**Advisor concern:** If Step 7 renames `kaola-workflow/{project}/` to `archive/{project}/` via `fs.renameSync`, Step 8a's `cp -R "kaola-workflow/{project}/." "$ACTIVE_WORKTREE_PATH/..."` has no source and fails.

**Verified from `commands/kaola-workflow-phase6.md` lines 530-553:**
- Step 8a: `cp -R "kaola-workflow/{project}/." "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/"` — MUST have source dir in main worktree
- Step 8: commit happens in linked worktree (`git -C "$ACTIVE_WORKTREE_PATH"`)

**Resolution:** `cmdFinalize` must be called AFTER Step 8a, not at Step 7. Correct sequence:
1. Step 7: prose steps (GitHub close, roadmap regen, phase6-summary.md update) — no rename
2. Step 8a: Mirror artifacts (cp -R from main → linked worktree) — picks up all workflow artifacts as-is
3. BETWEEN 8a and Step 8 git add: `node "$CLAIM_JS" finalize --project {project} --session $SESSION`
   - Runs with CWD = linked worktree
   - Writes `status: closed` to `CWD/kaola-workflow/{project}/workflow-state.md`
   - Renames `CWD/kaola-workflow/{project}` → `CWD/kaola-workflow/archive/{project}`
4. Step 8: `git add` (git detects rename via similarity), `git commit`

This is the advisor's "pivot to running cmdFinalize from the linked worktree" — same subcommand, invocation site moves from Step 7 to between 8a and 8.

## Item 2 — Plugin claim.js is a Separate File (CONFIRMED)

`plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (69530 bytes, timestamp May 16 15:43) differs from `scripts/kaola-workflow-claim.js` (77272 bytes, timestamp May 16 20:45) — different MD5 hashes, different sizes.

**Resolution:** Both files must receive the new `cmdFinalize` subcommand and the `cmdSweep` second pass. The plugin copy is the marketplace-distributed version; the scripts/ copy is the development source. Both need updating.

## Smaller Items

- `cmdFinalize` should `assert(fs.existsSync(summaryPath))` before proceeding — exits non-zero with clear message if phase6-summary.md absent (protects premature invocation)
- Idempotent re-entry: if archive dir already exists and source is gone, exit 0 with `{already: true}` — not an error
- Sweep second pass: missing `expires:` field alone should NOT trigger GC — require BOTH missing/expired `expires:` AND mtime stale (avoids eating a corrupted but live state file)

## Final Approach

Approach A confirmed, with corrected invocation site:
- `cmdFinalize` called in linked worktree context (between Step 8a and Step 8 git add)
- Both `scripts/kaola-workflow-claim.js` AND `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` updated
- Invocation added to phase6.md between Step 8a and Step 8, and mirrored in SKILL.md
