# design (code-architect, read-only) — blueprint for #261 archive-pollution fix

Primary-source-verified anchors (issue line numbers were stale):

## Fix 1 — AC2: narrow cmdFinalize git add (node: narrow-finalize)
File: scripts/kaola-workflow-claim.js + byte-mirror plugins/kaola-workflow/scripts/kaola-workflow-claim.js
Anchor: line 915 (NOT :755). In cmdFinalize, project = args.project; archive dest = result.dest (from archiveProjectDir at :895, may carry .archived-<ts> suffix).
At :915 state: live folder already renamed away; archive at result.dest; .roadmap/issue-N.md deleted; ROADMAP.md regenerated.
BEFORE: execFileSync('git', ['-C', root, 'add', '-A', 'kaola-workflow/'], {encoding:'utf8', stdio:'inherit'});
AFTER:
  const relDest = path.relative(root, result.dest);
  const addPaths = ['kaola-workflow/' + args.project, relDest, 'kaola-workflow/.roadmap', 'kaola-workflow/ROADMAP.md'];
  execFileSync('git', ['-C', root, 'add', '-A', '--', ...addPaths], {encoding:'utf8', stdio:'inherit'});
Rename recorded via two pathspecs (old deletion side + new archive dest), NOT git mv. `path` already required. commit-if-nonempty logic at :917-922 unchanged.

## Fix 2 — AC3: scope isWorkflowArtifact exemption in --barrier-check (node: gate-carveout)
File: scripts/kaola-workflow-plan-validator.js + byte-mirror plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
Anchors: isWorkflowArtifact at :447 (NOT :355-374); pure barrierCheck(content, actualPaths, opts) spans :431-490; CLI call site :1059; projTag derived at :990 = path.basename(path.dirname(resolve(planPath))). At phase6 projTag === finalized project. NO --project flag needed.
Edit1 (:1059 call site): pass project: projTag → barrierCheck(content, actualPaths, { nodeId: nodeId||undefined, root, project: projTag });
Edit2 (replace :447):
  const archiveProj = opts.project || null;
  const foreignArchive = p => { const m=/^kaola-workflow\/archive\/([^/]+)\//.exec(p); if(!m) return false; if(!archiveProj) return true; const dir=m[1]; return dir!==archiveProj && !dir.startsWith(archiveProj+'.archived-'); };
  const isWorkflowArtifact = p => /^kaola-workflow\//.test(p) && !foreignArchive(p);
Edit3: production filter (:455) → const production = real.filter(p => !isExempt(p) && !foreignArchive(p));
  then after production def, before sensitivity teeth: const foreignArchiveHits = real.filter(foreignArchive); if(foreignArchiveHits.length){ errors.push(`actual writes touch a FOREIGN project's archive band (${foreignArchiveHits.join(', ')}) — a stray archive/<other>/ must not be swept onto this branch (finalized project: ${archiveProj||'unknown'})`); }
isExempt chain (:454) unchanged. Backward-compat: opts.project absent + no archive path in existing tests ⇒ all green; fail-closed (!archiveProj ⇒ foreign=true) only fires on archive path w/o project.

## Fix 3 — AC1: tighten Phase-6 Staging Guard prose (node: staging-guard)
Files: commands/kaola-workflow-phase6.md (Staging Guard ~:526-542, PROJECT_COUNT block :531-542), plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md (~:518-534), plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md (~:517-533). Bash block identical across 3 editions; only line numbers differ.
NO contract-validator pins Staging Guard / PROJECT_COUNT tokens (validate-workflow-contracts.js pins only Agent Model Badge, sink scripts, SINK_STATE_FILE, --keep-worktree, contractor, workflow_path:adaptive, routed-fix models). validate-script-sync does NOT cover phase6.md.
Insert BEFORE the PROJECT_COUNT block (keep existing archive/ exclusion in PROJECT_COUNT grep):
  FOREIGN_ARCHIVE=$(git diff --cached --name-only | grep '^kaola-workflow/archive/' | awk -F'/' 'NF>=3 {print $3}' | sort -u | grep -v -x "{project}" || true)
  if [ -n "$FOREIGN_ARCHIVE" ]; then echo "BLOCKED: a foreign project's archive band is staged (${FOREIGN_ARCHIVE}) — only {project}'s archive may be committed. Unstage the stray archive/<other>/ before committing." >&2; exit 1; fi
{project} is the command's existing template placeholder. grep -v -x prevents substring false-match (issue-261 vs issue-2610).

## Test strategy
narrow-finalize (simulate-workflow-walkthrough.js + claim.js pair): model new fn testFinalizeNarrowStagingExcludesForeignArchive on testFinalizeFromLinkedWorktreeCleansMainCopy (:3230) — the ONLY path reaching :915 (mainRoot≠linkedRoot, --keep-worktree). testFinalize (:124) does NOT reach it. Create stray UNTRACKED kaola-workflow/archive/issue-999/x.md in wtPath before finalize; after, assert git diff --cached --name-only (cwd:wtPath) includes archive/issue-701 + ROADMAP.md + issue-701 deletion but NOT archive/issue-999. WIRE the fn into run() driver (~:8716-8719, manual call list, not auto-discovered). Re-run testFinalizeFromLinkedWorktreeCleansRoadmapEntry (:4617) as AC2 roadmap-staging regression guard.
gate-carveout (test-commit-node.js + plan-validator pair): add require('./kaola-workflow-plan-validator'). Pure-fn calls (no git repo). Assert: foreign archive ['kaola-workflow/archive/issue-999/x.md'] {project:'issue-261'} ⇒ refuse + error mentions FOREIGN; own archive ['kaola-workflow/archive/issue-261/x.md'] {project:'issue-261'} ⇒ pass; suffix ['kaola-workflow/archive/issue-261.archived-.../x.md'] ⇒ pass; backward-compat ['kaola-workflow/p/workflow-plan.md'] {} ⇒ pass. test-commit-node.js runs in-chain under npm test.
AC4: full `npm test` is verification target (validate-script-sync byte-identity for BOTH pairs + gitlab/gitea contract validators + test-commit-node.js run only there). Per-node fast iteration: node scripts/simulate-workflow-walkthrough.js.

Build order: narrow-finalize → gate-carveout → staging-guard → review → security → docs (architecture.md+api.md) → finalize (CHANGELOG.md).
