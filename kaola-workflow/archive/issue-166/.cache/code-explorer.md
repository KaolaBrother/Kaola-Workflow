# code-explorer raw output — issue-166 (GitLab closure-audit port)

> NOTE: dispatched with model=opus because the Sonnet quota was rate-limited this
> session (resets 4am Asia/Shanghai). Behaves as the code-explorer research agent.

---

# Exploration: Porting `closure-audit` from GitHub edition to GitLab edition

## 1. The GitHub source to port — `scripts/kaola-workflow-closure-audit.js`

Full file is 297 lines. It is a **dedicated standalone script** (invoked directly like `sink-merge`), NOT a `claim.js` subcommand. Header comment (lines 20-22) explicitly states the design: "Dedicated script (not a claim.js subcommand) mirroring kaola-workflow-sink-merge.js: it inlines its own ghExec/parseArgs/assert and imports only domain helpers."

### CLI surface
- Default (no args): dry-run JSON report.
- `--execute`: repair mode (the only flag). Parsed at lines 51-57 — `parseArgs` only recognizes `--execute`; everything else ignored.

### Requires (lines 27-37)
- `./kaola-workflow-active-folders` → `field`, `getRoot`, `issueIsClosed`, `readActiveFolders`
- `./kaola-workflow-roadmap` → `regenerateRoadmap`, `readRoadmapIssues`, `roadmapDir`
- Node builtins: `fs`, `path`, `child_process.execFileSync`
- Does NOT require `kaola-workflow-closure-contract`.

### Self-contained helpers
- `assert` (line 42), `ghExec` (44-49 — honors `KAOLA_WORKFLOW_OFFLINE` returning `''`, and `KAOLA_GH_MOCK_SCRIPT` routing through `process.execPath`), `parseArgs` (51-57).

### Drift classes — header lines 5-12 enumerate a–f; collapse to 5 output keys (207-213)

| Output key | Detector (line) | What it detects |
|---|---|---|
| `stale_roadmap_sources` | `detectStaleRoadmapSources` (102-116) | `.roadmap/issue-N.md` exists for a closed issue. Each `{issue_number, file, reason}`. `reason` = `closed_remote` (a) or `archive_closed` (d). `closed_remote` wins dedup (110-113). Sorted asc. |
| `mirror_lists_closed_issues` | `detectMirrorClosed` (119-126) | (b) `ROADMAP.md` still lists a closed issue. Array of numbers. |
| `stale_in_progress_labels` | `detectStaleLabels` (130-139) | (c) closed remote issues still carrying `workflow:in-progress`. Array of `{number,title,url}` from `gh issue list --state closed --label workflow:in-progress --json number,title,url`. |
| `active_folder_for_closed_issue` | `detectActiveClosedFolders` (162-170) | (e) active folder whose linked issue is closed. `{project, issue_number, dirty}`. **Report-only.** `dirty` via `isDirty` (143-159) git porcelain. |
| `unarchived_pr_folders` | `detectUnarchivedPrFolders` (173-188) | (f) active `sink: pr` folder whose PR is `MERGED`/`CLOSED` but unarchived. `{project, issue_number, pr_url, pr_state}`. **Report-only.** |

Supporting: `collectClosedSet` (62-71) — ONLY caller of `issueIsClosed`, deduped, O(distinct N) probes. `roadmapSourceFiles` (73-82), `archiveClosedIssues` (84-99) — reads archive `workflow-state.md`, requires `status: closed`, reads **`field(content,'issue_number')`** (line 95).

### JSON output shape
**Dry-run** (278-283): `{ dry_run: true, offline, drift: {5 keys}, counts: {5 keys} }`. `counts` (214-220) guards arrays with `Array.isArray(...) ? .length : 0` so `"skipped_offline"` strings count as 0.

**Execute** (271-276): `{ dry_run: false, offline, repaired: {roadmap_sources_removed[], roadmap_regenerated: bool, labels_removed[], labels_failed[]}, reported_not_repaired: {active_folder_for_closed_issue, unarchived_pr_folders} }`.

### What `--execute` repairs (`executeRepairs`, 226-263)
Consumes the already-built report; **never re-detects**. (1) `fs.unlinkSync` stale `.roadmap/issue-N.md` (ENOENT = success); (2) `regenerateRoadmap(root)`; (3) for online stale labels, `gh issue edit N --remove-label workflow:in-progress`. Never deletes folders/worktrees. Classes (e)/(f) carried verbatim into `reported_not_repaired`.

### `KAOLA_WORKFLOW_OFFLINE=1` (line 39)
Only **`stale_in_progress_labels`** (131) and **`unarchived_pr_folders`** (174) return string `"skipped_offline"`. Local classes still run. A non-offline `gh` failure reports empty array + stderr warning (136), NOT a skip.

### `module.exports` (291-296)
`buildAuditReport`, `executeRepairs`, `collectClosedSet`, `detectStaleRoadmapSources`.

---

## 2. GitLab edition layout

### Scripts under `plugins/kaola-workflow-gitlab/scripts/`
`kaola-gitlab-forge.js`, `kaola-gitlab-workflow-active-folders.js`, `kaola-gitlab-workflow-claim.js`, `kaola-gitlab-workflow-classifier.js`, `kaola-gitlab-workflow-compact-context.js`, `kaola-gitlab-workflow-repair-state.js`, `kaola-gitlab-workflow-roadmap.js`, `kaola-gitlab-workflow-sink-merge.js`, `kaola-gitlab-workflow-sink-mr.js`, `kaola-workflow-resolve-agent-model.js` (shared), `kaola-workflow-closure-contract.js` (byte-identical copy), plus tests: `simulate-gitlab-workflow-walkthrough.js`, `simulate-gitlab-codex-workflow-walkthrough.js`, `test-gitlab-forge-helpers.js`, `test-gitlab-workflow-scripts.js`, `test-gitlab-sinks.js`, `validate-kaola-workflow-gitlab-contracts.js`, `install-codex-agent-profiles.js`.

**No `kaola-gitlab-workflow-closure-audit.js` yet** — this is the new file.

### `kaola-gitlab-forge.js` API (exports 215-239)
- `listIssues(opts)` (123-129) — `opts.state`, `opts.perPage`. **NO label filter** (biggest gap — `detectStaleLabels` needs labels).
- `viewIssue(issueIid, opts)` (131-134) → normalized issue; state `'closed'`/`'open'` (lowercased).
- `updateIssue(issueIid, opts)` (136-144) — `opts.labels`, `opts.unlabels` (→ `--unlabel`), `opts.assignees`. GitLab analog of `gh issue edit --remove-label` → `{unlabels:[CLAIM_LABEL]}`.
- `viewMergeRequest(mrIid, opts)` (193-196) → normalized MR; `.state` lowercased.
- `listMergeRequests`, `closeIssue`, `createIssueNote`, `listIssueNotes`, `updateIssueNote`, `createMergeRequest`, `mergeMergeRequest`.
- Helpers: `glabExec(args, opts)` (10-18 — honors `OFFLINE` + `KAOLA_GLAB_MOCK_SCRIPT`), `labelsOf`, `uniqueLabels`, `preserveWorkflowLabels`, `normalizeState`, `normalizeProject`, `projectApiRef`, `discoverProject`, `normalizeIssue`, `normalizeMergeRequest`.
- Constants: `CLAIM_LABEL='workflow:in-progress'` (7), `QUEUED_LABEL` (8).
- `normalizeIssue` (88-104) exposes both `number` and `issue_iid` (same value), `state`, `labels`, `web_url`/`url`.

### GitLab equivalents
- **Roadmap**: `kaola-gitlab-workflow-roadmap.js`. Exports `regenerateRoadmap` (227-236), `readRoadmapIssues` (65-80). **`roadmapDir` NOT exported** (private 57-59) — port must add export or inline `path.join(root,'kaola-workflow','.roadmap')`. Also `validateRemote`, `writeIssueRecord`, `buildRoadmapContent`, `refreshFromGitLab`.
- **Claim**: `kaola-gitlab-workflow-claim.js` (1043+ lines).
- **Active-folders**: exports `field`, `getRoot`, `isSafeName`, `issueIsClosed`, `probeIssueState`, `parseStateFile`, `readActiveFolders`. `issueIsClosed` (40-47) = `forge.viewIssue(iid).state==='closed'`. `readActiveFolders` supports `{excludeClosedIssues:false}` (87). Folder items use **`issue_iid`** AND `issue_number` (both set, 119-120), `sink`, `mr_url`, `mr_iid` (NOT `pr_url`/`pr_state`). `parseStateFile` (59-80) reads `issue_iid` w/ fallback to `issue_number` (61).
- **`audit-labels`/`repair-labels`**: **DO NOT EXIST** in GitLab edition.
- **`cmdWatchMr`**: claim 986-996; logic `watchMergeRequests` (924-984). Uses `forge.viewMergeRequest(mrIid).state` checking **lowercase** `'merged'`/`'closed'` (936, 960). `mrIidFromFolder` (917-922) parses `folder.mr_iid` or `/merge_requests/(\d+)/` from `mr_url`.

### Sibling location
Plain relative requires (`require('./kaola-gitlab-forge')` etc.). **No kaola_script resolver** — co-located, installed flat into `$HOME/.claude/kaola-workflow-gitlab/scripts/`. Ports directly.

---

## 3. audit-labels/repair-labels precedent
**GitHub edition only**, as **subcommands of `scripts/kaola-workflow-claim.js`**:
- `cmdAuditLabels` (901-906): OFFLINE → `{stale:[], offline:true}`; else `gh issue list --state closed --label workflow:in-progress --json number,title,url`, outputs `{stale, count}`.
- `cmdRepairLabels` (908-923): `--execute`; dry-run `{dry_run:true, would_remove}`; execute removes via `gh issue edit N --remove-label`, outputs `{dry_run:false, removed, failed}`.
- Dispatched 1070-1071; usage 1055; exported 1087-1088.

**Confirmed GitHub-only**: only matches in `scripts/kaola-workflow-claim.js` + Codex copy + docs prose. Zero in gitlab/gitea. `docs/api.md:625`: "audit-labels/repair-labels subcommands are GitHub-only in this release."

**Placement nuance**: label-repair precedent is a claim.js subcommand, but `closure-audit` itself shipped as a **dedicated standalone script**. The dedicated-script structure is the correct template (issue confirms `kaola-gitlab-workflow-closure-audit.js`).

---

## 4. Naming & install wiring
- GitLab scripts use **`kaola-gitlab-*` prefix**. New file = **`kaola-gitlab-workflow-closure-audit.js`**.
- `install.sh`: GitHub `SUPPORT_SCRIPT_NAMES` (112-123) has `kaola-workflow-closure-audit.js` at line 116. **GitLab `SUPPORT_SCRIPT_NAMES` (134-145)** is the list to add the new script to (currently 10 entries; slot near classifier/compact-context). Install copies (482-490) and verifies (649-654; verify tolerates missing source for gitlab/gitea at 650, but script must exist to install).
- `scripts/validate-script-sync.js`: GitHub closure-audit in `COMMON_SCRIPTS` (43, synced to Codex copy). `BYTE_IDENTICAL_GROUPS` (52-71) covers only pre-commit hook + closure-contract module across trees — NOT edition workflow scripts. **New GitLab script has NO sync obligation.**

---

## 5. Test patterns
- `npm run test:kaola-workflow:gitlab` (package.json:38) runs validate-vendored-agents, validate-kaola-workflow-gitlab-contracts, simulate-gitlab-workflow-walkthrough, simulate-gitlab-codex-workflow-walkthrough.
- `simulate-gitlab-workflow-walkthrough.js` is a **thin dispatcher** (84-90): inline test + `run('test-gitlab-forge-helpers.js')`, `run('test-gitlab-workflow-scripts.js')`, `run('test-gitlab-sinks.js')`. Framework: hand-rolled `require('assert')`.
- **`test-gitlab-workflow-scripts.js`** (1785 lines) is where forge-exercising tests live. Has glab-mock infra: `writeShimFiles(shimPath, jsLines)` (115-117 — writes `.js`, macOS shebang-hang workaround), `glabMockEnv(binDir)` (119-122 — sets `KAOLA_GLAB_MOCK_SCRIPT`), `writeGlabShimForStale(binDir)` (124+), `withForge(stubs, fn)` (21-32 — monkeypatch forge methods in-process). Tests are bare top-level calls (1772-1784); one async chained via `.then()`. New `testClosureAudit*()` slot before final async block.
- **GitHub closure-audit tests to mirror** in `scripts/simulate-workflow-walkthrough.js` (3006-3379). Helpers: `closureAuditScript` (16), `runClosureAudit` (online via mock, 526-543), `runClosureAuditOffline` (545-554), `closureAuditShim` (3008-3011). 11 tests (registered 3369-3379): offline-skip, closed_remote roadmap source, archive_closed drift, dedup, mirror-lists-closed, stale-labels, active-folder-dirty, unarchived-PR-merged (→ MR), execute-repairs-roadmap-and-labels, execute-never-touches-active-folders, dry-run-never-calls-remove-label.
- GitLab shims must return `glab`-shaped output (`glab issue view N --output json`, `glab mr view N --output json`) via `KAOLA_GLAB_MOCK_SCRIPT` — arg shapes differ from `gh`.

---

## 6. docs/api.md closure contract
- Section **"### Closure audit and repair (GitHub only, issue #165)"** at `docs/api.md:627` → ~711. Structure: heading 627; `#### Script: kaola-workflow-closure-audit.js` (629); usage (637-643); Drift classes table (645-653); Dry-run JSON (655-669); Execute JSON (671-679); Safe-repair boundary (681-687); Offline behavior (689-694); "differs from stale-worktree-check" table (696-711).
- Flow mapping table (719-727) row `closure-audit (GitHub, #165)` (727): "GitLab/Gitea ports deferred to follow-ups."
- Follow-up scope #165 bullet (737): "GitLab/Gitea ports filed as follow-up issues."
- **GitLab coverage added**: revise heading `(GitHub only)`, add GitLab subsection/callout with MR terms (`unarchived_mr_folders`, `mr_url`, `mr_state`); update row 727 + bullet 737.

---

## 7. Error handling, env, forge deltas
### Error handling
- Top-level try/catch in `main()` block (287-289) → stderr + `process.exitCode=1`. GitLab claim/roadmap same idiom.
- Per-detector try/catch swallow → empty/skip + stderr warning (136; `continue` on error 184).
- Output: GitLab claim `output()` (418-421) compact `JSON.stringify`; GitHub closure-audit pretty `JSON.stringify(...,null,2)` (271/278). **Port should match GitHub pretty-print** for docs-example parity.

### Env vars
- `KAOLA_WORKFLOW_OFFLINE=1` — both editions; gates remote classes → `skipped_offline`.
- `KAOLA_GH_MOCK_SCRIPT` ↔ `KAOLA_GLAB_MOCK_SCRIPT` (forge:15) — test injection.
- `KAOLA_WORKTREE_NATIVE` (claim:22) — unrelated.

### Forge deltas (critical port work)
1. **GitHub inlines raw `gh`; GitLab uses forge object** — call `forge.listIssues/viewIssue/viewMergeRequest/updateIssue`, not inline `glab`.
2. **Label filtering gap (BIGGEST)**: `forge.listIssues` (123-129) has no label filter. Options: (a) extend forge to forward `--label`; (b) `forge.glabExec(['issue','list','--state','closed','--label',CLAIM_LABEL,'--output','json',...])` directly; (c) `forge.listIssues({state:'closed'})` then filter client-side on normalized `issue.labels`.
3. **MR vs PR rename**: keys `unarchived_pr_folders→unarchived_mr_folders`, `pr_url→mr_url`, `pr_state→mr_state`; folder `sink==='pr'→sink==='mr'`, `f.pr_url→f.mr_url`. **State casing flip**: GitHub uppercase `'MERGED'/'CLOSED'`; GitLab lowercase `'merged'/'closed'` via normalizeState — naive uppercase compare matches nothing. Mirror `cmdWatchMr` lowercase (claim 936, 960).
4. **Closed-state probe**: GitLab `issueIsClosed` (active-folders 40-47) = `forge.viewIssue(iid).state==='closed'` — same import pattern.
5. **Label removal**: `forge.updateIssue(iid, {unlabels:[CLAIM_LABEL]})`. Reference: `clearAdvisoryClaim` (claim 295-305) returns `'removed'/'skipped_offline'/'failed'`.
6. **`roadmapDir` not exported** — add export or inline path.
7. **Archive issue-number field**: GitHub reads `field(content,'issue_number')` (95); GitLab archives write `issue_iid`. Port must use `firstPositiveInteger(field(content,'issue_iid'), field(content,'issue_number'))` (mirror parseStateFile:61) or it misses every GitLab-archived issue.

### Closure-contract (planner decision)
GitHub closure-audit does NOT require closure-contract. GitLab edition is receipt-heavier (`cmdWatchMr` builds receipts via `buildClosureReceipt`, claim 949-957/970-978). Planner decides: stay minimal (mirror GitHub, no receipt) vs adopt receipt pattern. Contract module IS available in GitLab tree (byte-identical, BYTE_IDENTICAL_GROUPS:67).

## Key files (abs paths)
- `scripts/kaola-workflow-closure-audit.js` — source template (297 lines)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` — forge API + label gap
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` — imports + iid fallback
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` — imports + roadmapDir export gap
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — cmdWatchMr/clearAdvisoryClaim/mrIidFromFolder reference
- `scripts/kaola-workflow-claim.js` — cmdAuditLabels/cmdRepairLabels precedent (901-923)
- `install.sh` — GitLab SUPPORT_SCRIPT_NAMES (134-145)
- `scripts/validate-script-sync.js` — confirms no sync obligation
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — glab-mock infra + runner tail (1772-1784)
- `scripts/simulate-workflow-walkthrough.js` — 11 GitHub closure-audit tests (3006-3379)
- `docs/api.md` — closure section (627-711), flow map (727), follow-up (737)
- `package.json` — test:kaola-workflow:gitlab (38)
