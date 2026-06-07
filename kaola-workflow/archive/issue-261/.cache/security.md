verdict: pass
findings_blocking: 0

finding: id=S1 scope=in_scope action=document status=resolved severity=medium fix_role=none rationale=phase6-foreign-archive-guard-substitutes-raw-{project}-into-grep-E-regex-not-sanitized-like-projTag-but-layer-is-pure-defense-in-depth-no-finalize-step-stages-foreign-archive-broadly
finding: id=S2 scope=pre_existing action=document status=resolved severity=low fix_role=none rationale=isSafeName-permits-regex-metachars-and-the-archived-startsWith-exemption-is-by-design-collision-rename-match-not-a-realistic-foreign-escalation
finding: id=S3 scope=pre_existing action=none status=resolved severity=info fix_role=none rationale=barrier-regex-requires-trailing-slash-so-a-bare-archive/<name>-file-with-no-subpath-is-treated-as-generic-artifact-but-archiveProjectDir-always-creates-a-directory-band-unreachable

# G2 Security Gate — issue-261 (security-reviewer)

Threat model: merge-gate INTEGRITY (not classic appsec). #261 hardens the #231
script-enforced merge gate against foreign-project archive pollution via three
coordinated layers. Reviewed the full `main...HEAD` change set + both byte-mirrors
+ all 3 phase6 editions. `node scripts/test-commit-node.js` (32 assertions) and
`node scripts/simulate-workflow-walkthrough.js` both GREEN.

## Verdict

PASS. No CRITICAL and no HIGH findings. No real gate-bypass / false-negative is
reachable in the production finalize flow. findings_blocking: 0.

## Layer-by-layer integrity assessment

### Layer 2 — barrierCheck foreign-archive carve-out (plan-validator.js:447-468)
- FAIL-OPEN check: the `!archiveProj ⇒ return true` branch returns FOREIGN
  (⇒ refuse) — this is fail-CLOSED. Missing project context never exempts a
  foreign write. Confirmed.
- REGEX shape (a): `^kaola-workflow\/archive\/([^/]+)\/`. The `[^/]+` capture
  cannot contain a slash (no nested-path smuggling). The `^` anchor + required
  trailing `/` mean a non-anchored / unnormalized path (`./`, `x/kaola-...`,
  trailing variation) does NOT match — but the real CLI caller feeds
  `actualPaths` from `git diff --name-only <mergeBase>` (line 1063-1072), which
  emits normalized forward-slash repo-relative paths only. The pure-fn test
  callers pass literal normalized paths. No caller passes unnormalized input.
  Verified every `barrierCheck` caller.
- foreignArchiveHits is computed INDEPENDENTLY of `isExempt` / `declared`, so no
  docs/test/allowlist classification can let a foreign archive slip the error
  push. The error makes barrierCheck refuse (exitCode 1) — gate blocks.
- `projTag` (line 1003) sanitizes to `[A-Za-z0-9_-]` before it becomes
  `archiveProj`, so the `startsWith(archiveProj + '.archived-')` test runs on a
  clean string — no regex-metachar surprise inside the validator.

### Layer 1 — cmdFinalize narrowed staging (claim.js:913-930)
- Was `git add -A kaola-workflow/` (would sweep ANY stray under kaola-workflow/,
  incl. a foreign archive). Now: `git rm -r --cached --ignore-unmatch --
  kaola-workflow/<project>` then `git add -A -- <relDest> .roadmap ROADMAP.md`
  over an existsSync-filtered explicit path list. Name-agnostic broad sweep is
  GONE; only the finalized project's own dest + roadmap mirror are staged.
- PATH-TRAVERSAL via project name: `archiveProjectDir` (line 782) asserts
  `isSafeName(project)` and runs BEFORE the `git rm` (line 915), so
  `kaola-workflow/<project>` cannot escape the band. `isSafeName` blocks
  `/ \ \0 . ..`. All git invocations use `execFileSync` with an argv ARRAY (no
  shell) — no command-injection vector. Confirmed.
- `git rm --cached --ignore-unmatch`: `--cached` touches the index only (working
  tree untouched), `--ignore-unmatch` makes it a no-op when the path is absent.
  Nothing unintended staged/committed.

### Layer 3 — Phase-6 FOREIGN_ARCHIVE staging guard (3 × phase6.md, byte-identical)
- The guard renders `grep -v -E -x "{project}(\.archived-.*)?"`. `{project}` is
  the slash-command argument, render-substituted (not shell-runtime). It is NOT
  put through the `[^A-Za-z0-9_-]→_` sanitization that `projTag` gets. A project
  name carrying ERE metacharacters (e.g. `.*`) would render a regex that matches
  every archive dir, emptying FOREIGN_ARCHIVE and failing the guard OPEN. (See
  finding S1.)
- SEVERITY = MEDIUM, NON-BLOCKING, because this layer is pure defense-in-depth:
  every staging step in the real finalize flow is NARROW and name-agnostic, so
  the guard never sees foreign input in the production path —
    * cmdFinalize stages explicit paths only (Layer 1).
    * contractor.md Step 7 stages `kaola-workflow/.roadmap/issue-N.md
      kaola-workflow/ROADMAP.md` (explicit).
    * contractor.md Step 8 commit gate stages `<approved-files-only>` — NOT
      `git add -A`.
  A foreign archive can only reach `git diff --cached` if an operator manually
  runs a broad `git add`, off the documented path. Under the stated threat model
  (stray/accidental sweep with normal `issue-N` names that have no
  metacharacters), the guard works correctly and nothing slips past all three
  layers. Recorded as documentation (S1) — recommend the cheap follow-up of
  sanitizing the rendered `{project}` to match `projTag` if the guard is ever
  promoted from defense-in-depth to load-bearing.

### `.archived-` startsWith exemption (S2, by-design)
- A foreign dir literally named `<project>.archived-<x>` (e.g.
  `issue-261.archived-evil`) is exempted by the `startsWith`. This mirrors
  `archiveProjectDir`'s own collision-rename (`dest += '.archived-' + ISO`), so
  it is required for the own-archive case to pass. Exploiting it requires
  controlling the finalize project name AND planting a dir with that exact
  prefix — the same privilege as a direct bypass; the system never PRODUCES such
  a name for a foreign project. Not a realistic escalation. By-design.

## Secrets / credentials
- Diff scanned for password/secret/api-key/token/credential/private-key markers.
- NONE introduced. Confirmed.

## Tests
- `node scripts/test-commit-node.js` → "commit-node tests passed (32 assertions)"
  (incl. new Test 6 a-d: foreign-archive refuse / own-archive pass / .archived-
  suffix pass / backward-compat no-project pass).
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough
  simulation passed" (incl. new testFinalizeNarrowStagingExcludesForeignArchive:
  asserts a stray untracked issue-999 archive is NOT swept into the finalize
  commit while issue-701 archive + ROADMAP.md + live folder ARE).
