# Implementation Blueprint — Issue #274 (sync-group write-set gap at freeze)

Decision-free spec for the `impl` (tdd-guide) node. Frozen write-set = EXACTLY these 6 files. Follow RED→GREEN (Section G).

## Confirmed anchors (verified against the worktree)
- `const schema = require('./kaola-workflow-adaptive-schema');` is plan-validator.js **L39**; classifier require is **L38**.
- Insert sync-gap check between plan-validator.js **L754** (close of `if (sink){...}` gate block) and **L756** (`const planHash = computePlanHash(content);`).
- `validatePlan(content, opts)` (L496) is the ONE function `--freeze` (via freezePlan L805) and `--json`/default validate (L1077) reach; `--resume-check` uses `revalidateForResume` (L781) which does NOT call validatePlan (so the running #274 plan is never re-graded).
- Node `writeSet` = Set of full repo-relative path strings (normalizeRepoPath preserves `scripts/...`/`plugins/...`).
- validate-script-sync.js: NO module.exports/require.main guard; exec body L118-166 (linear); module-scope decls L6-116. COMMON_SCRIPTS L39-60 (15 bare basenames); BYTE_IDENTICAL_GROUPS L62-112 (5 groups of full repo-relative paths).
- FILE_CEILING=6. `validatePlanFixture(tmp,nodesRows,labels)` walkthrough L800: writes temp plan, runs `[planPath,'--json']`, returns JSON.parse(stdout). The Claude walkthrough runs scripts/kaola-workflow-plan-validator.js whose `require('./validate-script-sync')` RESOLVES → syncMeta LIVE in walkthrough.
- No existing fixture declares a COMMON_SCRIPTS basename or group path → gate breaks no current green test.

## A. validate-script-sync.js (FILE #5)
Keep at module scope (UNCHANGED): L6-7 fs/path; L9-11 repoRoot/claudeDir/codexDir; L39-60 COMMON_SCRIPTS; L62-112 BYTE_IDENTICAL_GROUPS; L114-116 readOrNull.
Wrap the executable body (L118-166: `const drift=[]` … `process.exit(1)`) in `if (require.main === module) { ... }`. Then add final line:
```js
module.exports = { COMMON_SCRIPTS, BYTE_IDENTICAL_GROUPS };
```
Recipe: insert `if (require.main === module) {` before L118; indent L118-166 +2; insert `}` after L166; blank line; export line. CLI invariance: `node scripts/validate-script-sync.js` still prints `OK: 15 common scripts and 5 byte-identical file group in sync.` exit 0 (guard true when run directly). When require()d, body skipped, only export evaluated.

## B. plan-validator try-require (FILES #1-#4, IDENTICAL text)
Immediately after L39, before L41 (`const TERMINAL_ROLE`):
```js
// #274: byte-identity / sync-group write-set gap check. Root-only module (no plugin
// copy) — resolves in the Claude scripts/ tree; throws+caught (null) in Codex/GitLab/
// Gitea trees, where the gap check below becomes a graceful no-op (zero false positives).
let syncMeta = null;
try { syncMeta = require('./validate-script-sync'); } catch (_) { /* forge/codex/user install: no sync module */ }
```
SAME text in all 4 editions (do NOT forge-swap this line). No circular require.

## C. The sync-gap check (FILES #1-#4, IDENTICAL block) — between L754 and L756, OUTSIDE `if (sink)`
```js
  // #274: sync-group write-set gap. A frozen plan that edits one half of a byte-identical
  // sync pair (e.g. scripts/X.js without plugins/kaola-workflow/scripts/X.js) would pass
  // every other gate, run, and SHIP drift that npm test's validate-script-sync.js then
  // rejects post-merge. Refuse at freeze instead. Inert when the sync module is absent
  // (forge/codex/user installs: syncMeta === null) and for forge-rename ports (paths in
  // neither list). Membership is path-exact, so a non-sync path can never false-refuse.
  if (syncMeta) {
    const unionWrites = new Set();
    for (const n of nodes) for (const p of n.writeSet) unionWrites.add(p);

    const COMMON = Array.isArray(syncMeta.COMMON_SCRIPTS) ? syncMeta.COMMON_SCRIPTS : [];
    const GROUPS = Array.isArray(syncMeta.BYTE_IDENTICAL_GROUPS) ? syncMeta.BYTE_IDENTICAL_GROUPS : [];
    const commonPair = name => [`scripts/${name}`, `plugins/kaola-workflow/scripts/${name}`];

    for (const n of nodes) {
      for (const p of n.writeSet) {
        const base = path.basename(p);
        if (COMMON.includes(base)) {
          const [a, b] = commonPair(base);
          if (p === a || p === b) {
            const peer = p === a ? b : a;
            if (!unionWrites.has(peer)) {
              errors.push(`sync-group gap: node ${n.id} declares "${p}" without its byte-identical peer "${peer}" (#274)`);
            }
          }
        }
        for (const group of GROUPS) {
          const members = Array.isArray(group.files) ? group.files : [];
          if (members.includes(p)) {
            for (const peer of members) {
              if (peer !== p && !unionWrites.has(peer)) {
                errors.push(`sync-group gap: node ${n.id} declares "${p}" without its byte-identical peer "${peer}" (${group.label}, #274)`);
              }
            }
          }
        }
      }
    }
  }
```
Decisions baked in:
- COMMON_SCRIPTS: member iff basename∈list AND p∈{scripts/<n>, plugins/kaola-workflow/scripts/<n>}; peer=other; require peer∈union.
- BYTE_IDENTICAL_GROUPS: check ALL members (NOT .js-only — .sh-only groups pre-commit/phantom-advisor must still fire). Largest group=4<6 so always satisfiable.
- Forge-rename ports in NEITHER list → never flagged (AC#3). Inert when syncMeta null.
- Hard typed refusal (pushes errors[] → L757 returns result:'refuse') — consistent with every other gate; fail-fast vs post-merge hard stop.
- Names the declaring node; one error per (node, missing peer); plan-order iteration; lists are basename-disjoint so no double-fire.
- Error wording anchors on stable substring `sync-group gap`.

## D. Cross-edition porting recipe (run from worktree root)
D1 edit Claude #1 (Sections B+C).
D2 `cp scripts/kaola-workflow-plan-validator.js plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js`  (#1≡#2 byte-identical)
D3 gitlab: `cp scripts/kaola-workflow-plan-validator.js plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js` then `sed -i '' "s#require('./kaola-workflow-classifier')#require('./kaola-gitlab-workflow-classifier')#" plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js`
D4 gitea: `cp ...` then `sed -i '' "s#require('./kaola-workflow-classifier')#require('./kaola-gitea-workflow-classifier')#" plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`
macOS BSD sed (`-i ''`). `#` delimiter. Do NOT swap the validate-script-sync require. Verify each port: `diff` Claude vs port = exactly one hunk (L38 classifier line) for gitlab/gitea, ZERO for codex.

## E. TDD test — `testAdaptiveSyncGroupGap()` (FILE #6)
Uses REAL list members. Fixtures otherwise fully in-grammar (code-reviewer post-dominates impl → G1; ≤6 files; non-sensitive; labels []), so the ONLY refusal cause in (a)/(c) is the gap.
```js
// issue #274: plan-validator must refuse a frozen plan that edits one half of a
// byte-identity / sync-group pair (the drift validate-script-sync.js rejects post-merge).
function testAdaptiveSyncGroupGap() {
  const tmp = adaptiveTmp('sync-gap');
  try {
    // (a) COMMON_SCRIPTS member WITHOUT peer -> refuse.
    let v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /sync-group gap/.test((v.errors || []).join(';')),
      '(a) lone COMMON_SCRIPTS member must refuse with sync-group gap, got: ' + JSON.stringify(v));
    // (b) BOTH halves (across two nodes) -> in-grammar.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| doc | doc-updater | impl | plugins/kaola-workflow/scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| review | code-reviewer | impl,doc | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      '(b) both COMMON_SCRIPTS halves present must be in-grammar, got: ' + JSON.stringify(v));
    // (c) BYTE_IDENTICAL_GROUPS member WITHOUT peers -> refuse.
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | scripts/kaola-workflow-closure-contract.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'refuse' && /sync-group gap/.test((v.errors || []).join(';')),
      '(c) lone BYTE_IDENTICAL_GROUPS member must refuse with sync-group gap, got: ' + JSON.stringify(v));
    // (d) forge-rename port path alone -> in-grammar (no false positive).
    v = validatePlanFixture(tmp, [
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| impl | tdd-guide | explore | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js | 1 | sequence |',
      '| review | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | review | — | 1 | sequence |',
    ], []);
    assert(v.result === 'in-grammar',
      '(d) forge-rename port path alone must NOT false-refuse, got: ' + JSON.stringify(v));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testAdaptiveSyncGroupGap: PASSED');
}
```
Call-site: in `main()`, immediately after `testAdaptiveAuditCoverage();` (L8224) and before `testAdaptiveVerdictCheck();`:
```js
    testAdaptiveAuditCoverage();
    testAdaptiveSyncGroupGap();   // #274
    testAdaptiveVerdictCheck();
```
Notes: assert on `/sync-group gap/` AND result (not result alone). `path`+`assert`+`adaptiveTmp`+`validatePlanFixture`+`fs` already available. Case (e) graceful-null covered by codex/gitlab/gitea walkthroughs (syncMeta null, stay green). VERIFY adaptiveTmp helper name/signature in the file before use; if the existing fixtures use a different tmp-dir helper, match it.

## F. Verification before GREEN (from worktree root)
1. `node scripts/validate-script-sync.js` → `OK: 15 common scripts and 5 byte-identical file group in sync.` exit 0.
2. `node scripts/simulate-workflow-walkthrough.js` → prints `testAdaptiveSyncGroupGap: PASSED` AND `Workflow walkthrough simulation passed`.
3. `diff` #1 vs #2 (none), #1 vs #3 and #1 vs #4 (one hunk = L38 only).
4. `npm test` → all 4 sub-suites pass (validate-script-sync byte-identity first gate; gitlab/gitea walkthroughs run ported validators with --freeze/--json).

## G. RED→GREEN ordering
1. RED: add testAdaptiveSyncGroupGap()+call-site FIRST (check not yet present). Run walkthrough → cases (a)&(c) FAIL (lone member is in-grammar without the check). Record RED.
2. GREEN: apply B+A+C to #1 and #5. Re-run walkthrough → all 4 cases pass.
3. PROPAGATE: D (cp #2; cp+sed #3/#4). Run F steps 1,3,4.
4. DONE: F all green.

## H. Decisions (none left for impl)
- BYTE_IDENTICAL_GROUPS: ALL members. Refuse (not warn). Plan-level union built fresh in validatePlan. Outside `if(sink)`. Name declaring node. Stable `sync-group gap` anchor. try-require after L39 identical ×4. validate-script-sync wrap L118-166 + export. Port via cp + sed L38 (macOS `-i ''`, `#` delim, full-call anchor). Assert result AND /sync-group gap/.

Absolute paths: worktree root /Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-274 + the 6 relative files.
