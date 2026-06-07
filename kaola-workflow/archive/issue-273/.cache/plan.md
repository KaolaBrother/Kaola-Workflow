# Plan Evidence — issue-273

Node: plan (code-architect)
Date: 2026-06-07
Source: explore evidence at `kaola-workflow/issue-273/.cache/explore.md`, verified against the live tree.

Two independent follow-up(#264) fixes:
- **Fix 1** — `legacy-worktree-cleanup` dry-run/execute branch mismatch (claim.js ×4 editions + 3 test files).
- **Fix 2** — `workflow-init` worktree-note parity (6 command↔SKILL files, byte-identical group).

`docs/api.md` is owned by the `doc-updater` node; `CHANGELOG.md` is owned by `finalize`. The three
implement nodes do NOT touch either — instructions for those are recorded here for the downstream
nodes but are explicitly out of the implement write-sets.

---

## 1. Fix 1 Decision — OPTION B (drop the vestigial `would_delete_branch` from dry-run)

### Decision: Option B. Rationale.

1. **Frozen-plan fit (decisive).** The frozen `workflow-plan.md` prose states that the heavier
   option (Option A) "genuinely expands the surface" and would make "a security node reversibly
   addable via the `--freeze` repair recipe." Option B requires ZERO structural change to the DAG —
   no G2/security node, no plan repair. Option A risks forcing a detour. Option B keeps the plan
   valid as-is.
2. **CHANGELOG intent.** CHANGELOG L25 (#264) records that execute-path branch-ref preservation "is
   the safe direction" and was intentional at ship time. Option B aligns the dry-run *output* with
   that already-shipped, intentional behavior. Option A would reverse a deliberate safety decision.
3. **Blast radius.** Option B is purely subtractive (removes misleading output). It introduces no new
   `git branch -D` at execution time. Option A expands the destructive surface and is more
   appropriate as a separate, explicitly-scoped issue.
4. **No coverage regression.** No existing test asserts `would_delete_branch` or `deleted_branch`
   (explore §Test Surface, grep-confirmed). Nothing breaks; only new "absence" assertions are added.

**Net effect of Option B:** `legacy-worktree-cleanup` dry-run output drops the `would_delete_branch`
key entirely. Dry-run JSON becomes `{ dry_run: true, would_remove: [...], skipped_dirty: [...] }`.
Execute path is unchanged (already preserves branch refs). The `--keep-branch` flag becomes inert for
this subcommand — see "Reviewer note" below.

### CRITICAL LANDMINE — two `would_delete_branch` regions per claim file

Each claim.js edition contains `would_delete_branch` in TWO functions. Only the SECOND (legacy)
region is the target. The `cmdStaleWorktreeCleanup` region MUST NOT be touched.

| edition | STALE region (DO NOT TOUCH) | LEGACY region (TARGET) |
|---------|------------------------------|------------------------|
| root `scripts/kaola-workflow-claim.js` | L957/958/972/1018 | **L1238/1239 (decl block), L1253 (push)** |
| Codex `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | (byte-identical to root) | **L1238/1239, L1253** |
| GitLab `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | L961/975/1021 | **L1235/1236 (decl block), L1250 (push)** |
| Gitea `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | L948/962/1008 | **L1222/1223 (decl block), L1237 (push)** |

Line numbers will drift as edits land. **Edit by CONTEXT ANCHOR, not by line number.**

### The two-line declaration block disambiguates the region

The `dryBuckets` declaration line is **byte-identical** between stale and legacy:
```
  const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [] };
```
Editing that line alone is ambiguous. But the IMMEDIATELY PRECEDING `buckets` line differs:

- **STALE** `buckets` (has `deleted_branch:`): `const buckets = { removed: [], deleted_branch: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [] };`
- **LEGACY** `buckets` (NO `deleted_branch:`): `const buckets = { removed: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [] };`

So anchor on the **two-line legacy block** (the `buckets` line lacking `deleted_branch` makes it
unique), and replace only the `dryBuckets` line inside it.

**Anchor uniqueness verified in all four editions** (grep `deleted_branch`): the STALE `buckets`
line carries `deleted_branch:` in root/Codex (L957), GitLab (L960), and Gitea (L947); the LEGACY
`buckets` line never does. So the two-line block matches in exactly ONE place per file — no fallback
anchor needed.

### Edit 1 — the dry-run buckets declaration (all four claim files, identical edit)

OLD (two-line anchor — the legacy block; note the `buckets` line has NO `deleted_branch`):
```
  const buckets = { removed: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [] };
  const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [] };
```
NEW:
```
  const buckets = { removed: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [] };
  const dryBuckets = { would_remove: [], skipped_dirty: [] };
```
(Only the `dryBuckets` line changes — `would_delete_branch: []` removed. Keep the `buckets` line
verbatim as the anchor so the edit lands in the legacy function, not the stale one.)

### Edit 2 — the dry-run push line (all four claim files, identical edit)

The legacy push line is uniquely targetable: it has the `branch &&` guard that the stale form lacks.

DELETE this exact line (remove the whole line, including its leading indentation and trailing
newline):
```
      if (branch && !args.keepBranch) dryBuckets.would_delete_branch.push(branch);
```
After deletion, the surrounding `if (dryRun) { ... }` block reads:
```
    if (dryRun) {
      dryBuckets.would_remove.push(wtPath);
      continue;
    }
```

**DO NOT delete** the stale-region forms — these must stay intact in every edition:
- `if (!args.keepBranch) dryBuckets.would_delete_branch.push(branch);` (stale main loop)
- `if (!dryBuckets.would_delete_branch.includes(branch)) dryBuckets.would_delete_branch.push(branch);` (stale candidateBranches loop)

### Reviewer note (record at review/finalize, no code change)

After Option B, `args.keepBranch` is **inert** inside `cmdLegacyWorktreeCleanup` (the only consumer
in that function was the deleted push line). This is intentional, NOT dead code to remove:
`keepBranch` is a generic `parseArgs` flag still used by `cmdStaleWorktreeCleanup`. Leave the flag
parsing untouched. The code-reviewer should treat this as expected.

---

## 2. Fix 2 Spec — confirmed exact replacement string

### Confirmed canonical path

- `worktreePathFor()` (`scripts/kaola-workflow-claim.js` L140-143) returns `path.join(mainRoot, '.kw', 'worktrees', project)` → `<repo-root>/.kw/worktrees/<project>/`.
- `README.md` L904 uses the canonical phrasing: "repo-local worktree at `<repo-root>/.kw/worktrees/<project>/`".
- `docs/api.md` L840 describes the same: "the repo-local `.kw/worktrees/` layout".

### Current (OLD) string — confirmed present, exactly once, byte-identical in all 6 files

```
- Active issue work runs in a sibling worktree at `<repo>.kw/<project>/` by default; set `KAOLA_WORKTREE_NATIVE=0` to disable. See README for the full contract.
```
Verified: `grep -c` returns `1` for each of the 6 files. No divergence — all 6 hold the identical
old string (at L135 in the 3 `commands/workflow-init.md`, at L82 in the 3
`skills/kaola-workflow-init/SKILL.md`).

### Replacement (NEW) string — apply byte-identically to all 6 files

```
- Active issue work runs in a repo-local worktree at `<repo-root>/.kw/worktrees/<project>/` by default; set `KAOLA_WORKTREE_NATIVE=0` to disable. See README for the full contract.
```

Only two substantive token changes vs the old string:
- `sibling worktree at ` + "`" + `<repo>.kw/<project>/` + "`"  →  `repo-local worktree at ` + "`" + `<repo-root>/.kw/worktrees/<project>/` + "`"

Everything after the first backtick-closed path (`` by default; set `KAOLA_WORKTREE_NATIVE=0` to
disable. See README for the full contract.``) is unchanged. The leading `- ` bullet marker is
unchanged.

### Byte-identity contract

`extractClaudeTemplate()` (`scripts/validate-kaola-workflow-contracts.js` ~L387) extracts content
between `<!-- KW-CLAUDE-TEMPLATE-START -->` / `<!-- KW-CLAUDE-TEMPLATE-END -->` and whitespace-strips
it. Three within-pair assertions run at `npm test`:
- GitHub: `commands/workflow-init.md` ↔ `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`
- GitLab: `plugins/kaola-workflow-gitlab/commands/workflow-init.md` ↔ `.../skills/kaola-workflow-init/SKILL.md`
- Gitea: `plugins/kaola-workflow-gitea/commands/workflow-init.md` ↔ `.../skills/kaola-workflow-init/SKILL.md`

A half-edit (one file of a pair) fails the within-pair assertion. Cross-forge (GitHub↔GitLab↔Gitea)
is NOT validator-enforced, but all 6 currently share identical content, so applying the SAME single
string to all 6 preserves both within-pair and cross-forge consistency. **All 6 must change in the
same node/commit.**

---

## 3. Per-Node Instructions

### NODE: impl-legacy-root (role: tdd-guide)

Write-set (frozen): `scripts/kaola-workflow-claim.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, `scripts/simulate-workflow-walkthrough.js`.

TDD order — write/adjust the failing assertion FIRST (RED), then make the code change (GREEN).

**Step 1 (RED) — add the absence assertion to BOTH existing dry-run test bodies in
`scripts/simulate-workflow-walkthrough.js`.**

In `testLegacyWorktreeCleanupDryRun()` (~L7558), after the existing `would_remove` assertion
(currently ends ~L7585 with the `fs.existsSync(legacyWtPath)` assert), and before the `} finally {`,
INSERT:
```js
    assert(!('would_delete_branch' in out),
      'Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch, got: ' + JSON.stringify(out));
```
This is genuine RED: the test registers a worktree on branch `workflow/issue-520`, so before the code
fix the dry-run output DOES contain `would_delete_branch: ["workflow/issue-520"]`, and the assertion
fails. `claimSignal()` is true (the subcommand already exists), so the assertion actually executes
(no silent SKIP).

(Optional, same file, `testLegacyWorktreeCleanupDirtySkip()` ~L7597 — the `--execute` path. No change
required: it never asserted branch buckets and Option B does not touch the execute path. Leave it
as-is.)

**Step 2 (GREEN) — apply Edit 1 and Edit 2 (from §1) to `scripts/kaola-workflow-claim.js`.**
- Edit 1: two-line legacy block, remove `would_delete_branch: []` from the `dryBuckets` line
  (legacy region ~L1238/1239). The preceding `buckets` line (no `deleted_branch`) confirms you are in
  `cmdLegacyWorktreeCleanup`, NOT `cmdStaleWorktreeCleanup`.
- Edit 2: delete the exact line `if (branch && !args.keepBranch) dryBuckets.would_delete_branch.push(branch);`
  (legacy region ~L1253).
- DO NOT touch the stale-region forms (L958/972/1018).

**Step 3 (BYTE-IDENTITY) — apply the IDENTICAL Edit 1 + Edit 2 to
`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`.** This file is byte-identical to root
(confirmed via `cmp`). The two edits land at the same context anchors (~L1239 decl, ~L1253 push). The
Codex mirror has the same two-region structure; same "anchor on the two-line block, delete the
guarded push" rule applies.

**Step 4 — verify.** Run `node scripts/simulate-workflow-walkthrough.js` → must exit 0 with
"Workflow walkthrough simulation passed" (RED→GREEN: the new assertion now passes). Run
`cmp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js` → must
report no difference (byte-identity preserved).

### NODE: impl-legacy-editions (role: tdd-guide)

Write-set (frozen): `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`,
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`,
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`.

These editions are logic-identical to root but NOT byte-identical (different file names in assert
strings, forge-prefixed branch names `workflow/gitlab-issue-N` / `workflow/gitea-issue-N`). Apply the
SAME structural Edit 1 + Edit 2 to each claim port; add the SAME absence assertion to each edition's
existing dry-run test.

TDD order — assertion first (RED), then code (GREEN).

**Step 1 (RED) — GitLab test.** In `testGitlabLegacyWorktreeCleanupDryRun()`
(`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` ~L3146), after the existing
`would_remove` + `fs.existsSync(legacyWt)` asserts (~L3188-3190) and before
`console.log('testGitlabLegacyWorktreeCleanupDryRun: PASSED')`, INSERT:
```js
      assert(!('would_delete_branch' in out),
        'Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch, got: ' + JSON.stringify(out));
```
(This test uses node's `assert` module — `assert(cond, msg)` is the existing idiom, same as the
surrounding `assert(...)` calls.) The test registers `workflow/gitlab-issue-264-legacy`, so pre-fix
`would_delete_branch` is present → genuine RED. The recognized-probe guard at the top returns true
(subcommand exists), so the assertion executes.

**Step 1b (RED) — Gitea test.** In `testGiteaLegacyWorktreeCleanupDryRun()`
(`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` ~L3112), after the existing
`would_remove` + `fs.existsSync(legacyWt)` asserts (~L3154-3156) and before
`console.log('testGiteaLegacyWorktreeCleanupDryRun: PASSED')`, INSERT the identical assertion:
```js
      assert(!('would_delete_branch' in out),
        'Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch, got: ' + JSON.stringify(out));
```

**Step 2 (GREEN) — GitLab claim** (`kaola-gitlab-workflow-claim.js`):
- Edit 1: two-line legacy block, remove `would_delete_branch: []` from the `dryBuckets` line
  (~L1235/1236).
- Edit 2: delete `if (branch && !args.keepBranch) dryBuckets.would_delete_branch.push(branch);`
  (~L1250).
- DO NOT touch the stale region (L961/975/1021).

**Step 2b (GREEN) — Gitea claim** (`kaola-gitea-workflow-claim.js`):
- Edit 1: two-line legacy block, remove `would_delete_branch: []` from the `dryBuckets` line
  (~L1222/1223).
- Edit 2: delete `if (branch && !args.keepBranch) dryBuckets.would_delete_branch.push(branch);`
  (~L1237).
- DO NOT touch the stale region (L948/962/1008).

The legacy `buckets` line (no `deleted_branch`) is the anchor in both editions, exactly as in root.

**Step 3 — verify.** Run `npm test` (executes all four editions including the GitLab/Gitea edition
test runners). The GitLab/Gitea dry-run tests must reach PASSED with the new absence assertion green.

### NODE: impl-init-parity (role: implementer)

Write-set (frozen, all 6): `commands/workflow-init.md`,
`plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md`,
`plugins/kaola-workflow-gitlab/commands/workflow-init.md`,
`plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md`,
`plugins/kaola-workflow-gitea/commands/workflow-init.md`,
`plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md`.

This is a pure string substitution — no behavioral test (hence `implementer`, not `tdd-guide`). The
gate is the `extractClaudeTemplate` within-pair byte-identity assertion at `npm test`.

**Substitution — apply byte-identically to all 6 files. Define the NEW string ONCE and reuse it;
do not retype per file (retyping risks drift).**

OLD (each file, exactly one occurrence):
```
- Active issue work runs in a sibling worktree at `<repo>.kw/<project>/` by default; set `KAOLA_WORKTREE_NATIVE=0` to disable. See README for the full contract.
```
NEW:
```
- Active issue work runs in a repo-local worktree at `<repo-root>/.kw/worktrees/<project>/` by default; set `KAOLA_WORKTREE_NATIVE=0` to disable. See README for the full contract.
```

`implementer` change-type check (no unit-test fit): full existing suite green before AND after, plus
explicit grep verification.

**Verify (the `implementer` smoke/integration check for this node):**
1. `grep -rc 'sibling worktree' commands/workflow-init.md plugins/*/skills/kaola-workflow-init/SKILL.md plugins/*/commands/workflow-init.md`
   → must return `0` for all 6 (old string fully gone).
2. `grep -rc 'repo-local worktree at `<repo-root>/.kw/worktrees/<project>/`' <the 6 files>`
   → must return `1` for each (new string present exactly once).
3. `npm test` → the three `extractClaudeTemplate` within-pair assertions stay green (within-pair
   byte-identity preserved because both files of each pair got the identical edit).

---

## 4. Byte-identity reminders

- **Root ↔ Codex (Fix 1):** `scripts/kaola-workflow-claim.js` and
  `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` MUST stay byte-identical
  (`validate-script-sync.js` / `COMMON_SCRIPTS`). Apply the identical Edit 1 + Edit 2 to both. Verify
  with `cmp`. Both are in `impl-legacy-root`'s write-set.
- **GitLab ↔ Gitea claim ports (Fix 1):** structurally identical, NOT byte-identical (different file
  names in assert strings, forge-prefixed branch patterns). Apply the SAME structural edits, do not
  expect `cmp` equality.
- **Within-pair cmd ↔ SKILL (Fix 2):** each forge's `commands/workflow-init.md` and its
  `skills/kaola-workflow-init/SKILL.md` MUST have byte-identical template content
  (`extractClaudeTemplate`). Apply the identical NEW string to both halves of each pair. Cross-forge
  equality is not validator-enforced but is preserved by using one shared NEW string across all 6.

---

## 5. Test validation

- **After impl-legacy-root:** `node scripts/simulate-workflow-walkthrough.js` → exit 0,
  "Workflow walkthrough simulation passed". `cmp scripts/kaola-workflow-claim.js
  plugins/kaola-workflow/scripts/kaola-workflow-claim.js` → identical.
- **After impl-legacy-editions:** `npm test` → all four edition runners green (GitLab/Gitea legacy
  dry-run tests reach PASSED with the new `would_delete_branch`-absence assertion).
- **After impl-init-parity:** `npm test` → `extractClaudeTemplate` within-pair assertions green;
  `grep -rc 'sibling worktree'` returns 0 across all 6 files.
- **Whole-feature gate:** final `npm test` green across all four editions (claude/codex/gitlab/gitea)
  before review/docs/finalize.

---

## 6. Downstream-node instructions (NOT implement write-sets — recorded for doc-updater + finalize)

### docs node (doc-updater) — `docs/api.md` (Option B reconciliation)

- **L864 prose:** NO change. "Branch refs are preserved (only the worktree registration and
  filesystem directory are removed)." is already correct under Option B. The "when no strategy flag
  is given, dirty worktrees are skipped" clause governs dirty-worktree handling
  (`--archive`/`--export`/`--force`), NOT branch handling — leave it intact.
- **L869-874 dry-run JSON block:** remove the `"would_delete_branch": []` line. New block:
  ```json
  {
    "dry_run": true,
    "would_remove": [],
    "skipped_dirty": []
  }
  ```
- **L877 advisory note:** delete the mismatch clause entirely. The
  "`would_delete_branch` is populated in dry-run output ... but the execute path ..." mismatch
  language must go (the mismatch no longer exists under Option B). If a residual one-line "Branch refs
  are always preserved." normative statement is desired, keep that sentence only; do not touch L864.
- **L879-888 execute JSON block:** NO change (already lacks `deleted_branch`; matches Option B).
- **Fix 2:** `docs/api.md` already uses the canonical "repo-local `.kw/worktrees/`" wording (L840) —
  no Fix-2 change required in api.md.

### finalize node — `CHANGELOG.md`

- Add an `[Unreleased] → Fixed` entry covering BOTH fixes (issue #273), noting Option B was chosen
  for Fix 1 (dry-run no longer advertises `would_delete_branch`; execute-path branch-preservation is
  intentional) and the 6-file worktree-note parity for Fix 2.
- **Strike/supersede BOTH #264 follow-ups at L25:** item (1) is resolved by Fix 2 (worktree-note
  parity), item (2) by Fix 1 (the advisory mismatch is removed). Do not leave either dangling.

