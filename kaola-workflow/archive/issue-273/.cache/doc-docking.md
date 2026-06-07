# Doc Docking — Issue #273

**Date:** 2026-06-07
**Issue:** #273 — follow-up(#264): legacy-worktree-cleanup dry-run mismatch + workflow-init worktree-note parity

---

## Changed files reviewed

### Fix 1 — legacy-worktree-cleanup dry-run mismatch
- `scripts/kaola-workflow-claim.js` — `cmdLegacyWorktreeCleanup()`, lines 1189–1310: `dryBuckets` is `{ would_remove: [], skipped_dirty: [] }` (no `would_delete_branch` field); dry-run output is `output({ dry_run: true, ...dryBuckets })` at line 1306.
- `scripts/simulate-workflow-walkthrough.js` — line 7586–7587: explicit assertion `assert(!('would_delete_branch' in out), 'Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch ...')`. Line 7582 asserts `would_remove` is present. This is the ground-truth evidence that the code and test agree with the documented JSON shape.
- Plugin editions (`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`) and their test files — reviewed via CHANGELOG and test-suite references confirming all 4 editions were updated.

### Fix 2 — workflow-init worktree-note parity
- `commands/workflow-init.md` — line 135: `Active issue work runs in a repo-local worktree at \`<repo-root>/.kw/worktrees/<project>/\`` (correct canonical path).
- `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` — line 82: same canonical path.
- `plugins/kaola-workflow-gitlab/commands/workflow-init.md` — line 135: same canonical path.
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md` — line 82: same canonical path.
- `plugins/kaola-workflow-gitea/commands/workflow-init.md` — line 135: same canonical path.
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md` — line 82: same canonical path.

---

## Documents checked

### 1. `docs/api.md` — legacy-worktree-cleanup section (lines 838–886)

- **Dry-run JSON block (lines 868–874):**
  ```json
  {
    "dry_run": true,
    "would_remove": [],
    "skipped_dirty": []
  }
  ```
  No `would_delete_branch` field. Matches `dryBuckets` in code (line 1239 of `kaola-workflow-claim.js`).
- **Execute JSON block (lines 876–885):** unchanged; `removed`, `skipped_dirty`, `stashed`, `exported`, `failed_preserve` — consistent with code `buckets` (line 1238).
- **No advisory mismatch note** present in the legacy section.
- **Stray `would_delete_branch` scan:** `grep -n "would_delete_branch" docs/api.md` returns only line 790, which is inside the `stale-worktree-cleanup` section (lines 731–836). The legacy section (838–886) is clean.

### 2. `docs/api.md` — stale-worktree-cleanup section (lines 731–836)

- `would_delete_branch` at line 790 is correctly present in the stale-worktree-cleanup dry-run JSON block. This command DOES advertise branch deletion. Not flagged as a gap.

### 3. `CHANGELOG.md` — [Unreleased] section (lines 3–29)

- Lines 15–17: `#273` Fixed entry present with both Fix 1 and Fix 2 bullet points.
  - Fix 1: dry-run bucket mismatch for `legacy-worktree-cleanup`, tests updated in all 4 editions.
  - Fix 2: 6 `<!-- KW-CLAUDE-TEMPLATE-START/END -->` files updated from old sibling path to canonical `<repo-root>/.kw/worktrees/<project>/`.
- Line 29: "Both deferred items from #264 are resolved in #273." — resolves the #264 follow-up note.

### 4. `commands/workflow-init.md` and SKILL.md files

- All 6 files confirmed at lines 135 (command files) and 82 (SKILL.md files): the worktree-note now reads `<repo-root>/.kw/worktrees/<project>/` (repo-local canonical path from #264). Old sibling path (`<repo>.kw/<project>/`) is absent from all 6 files.

### 5. `README.md` — worktree description section

- `grep` confirms `<repo-root>/.kw/worktrees/<project>/` at lines 604–605, 904, 929, 931. No stale sibling-path reference in the worktree description. Correctly describes the repo-local hidden container. No update needed; already consistent.

### 6. `.env.example` — `KAOLA_WORKTREE_NATIVE` comment (lines 27–30)

- Line 27: `# Worktree-native mode: ON by default — issue claims provision a per-issue repo-local worktree at \`<repo-root>/.kw/worktrees/<project>/\`.`
- "repo-local worktree" language is present. No stale sibling-path reference.

### 7. `docs/architecture.md`

- Contains generic "worktree" references (claim/branch/worktree lifecycle language) that describe behavior, not specific paths. No instance of the old sibling path pattern. No change needed.

### 8. `docs/workflow-state-contract.md`

- Two "worktree path" references (lines 15, 55) describe the field in `workflow-state.md` generically; no hardcoded path. No change needed.

### 9. `docs/conventions.md`

- Zero worktree or legacy-cleanup references. No change needed.

---

## Gaps found and fixed

None. All documentation is consistent with code behavior as verified against:
- The code's `dryBuckets` object (no `would_delete_branch`),
- The test assertion that explicitly refuses `would_delete_branch` in the dry-run output,
- The 6 workflow-init template files all showing the canonical `<repo-root>/.kw/worktrees/<project>/` path.

---

## No-impact reasons for skipped document classes

- `docs/architecture.md` — describes lifecycle concepts generically; contains no hardcoded worktree paths. The #264 path move was already documented here; #273 is a follow-up fix affecting only the legacy dry-run JSON shape and init template strings. No change needed.
- `docs/workflow-state-contract.md` — stores field-name descriptions for `workflow-state.md`; does not document command JSON output shapes or init template strings. No change needed.
- `docs/conventions.md` — coding/testing/Git/review rules; no worktree path or JSON shape content. No change needed.
- `docs/decisions/` — ADRs; #273 is a follow-up bug fix, not a new architecture decision. No change needed.
- `README.md` — spot-checked; already shows the canonical repo-local path from #264. No update needed for this fix.

---

## Final verdict: DOCKED
