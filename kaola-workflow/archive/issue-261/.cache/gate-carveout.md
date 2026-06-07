# gate-carveout (tdd-guide) — AC3: --barrier-check refuses foreign-project archive write

RED: added test6a-d to scripts/test-commit-node.js (requires ./kaola-workflow-plan-validator). Pre-fix `node scripts/test-commit-node.js`:
  FAIL test6a: foreign archive write must be refused — barrierCheck(plan,['kaola-workflow/archive/issue-999/x.md'],{project:'issue-261'}) returned result:'pass' (should refuse). FAIL: error must mention FOREIGN. (6b/6c/6d passed because the blanket exemption let everything through.)

GREEN: both plan-validator.js copies (byte-identical pair):
  Edit1 (CLI call site :1072): barrierCheck(content, actualPaths, { nodeId: nodeId||undefined, root, project: projTag }) — threads projTag (finalized project folder name, derived at :990; NO new --project flag).
  Edit2 (replace isWorkflowArtifact ~:447): archiveProj=opts.project||null; foreignArchive(p)=archive/<dir>/ where dir!==archiveProj && !startsWith(archiveProj+'.archived-'), fail-closed (true) when no archiveProj; isWorkflowArtifact = /^kaola-workflow\//.test(p) && !foreignArchive(p).
  Edit3 (production filter): real.filter(p => !isExempt(p) && !foreignArchive(p)); + dedicated typed refusal pushing a FOREIGN-tokened error for foreignArchiveHits.
barrierCheck return shape: { result:'pass'|'refuse', errors:[], sensitiveHits:[], outOfAllow:[] } (:489). Asserted r.result + errors.join.toLowerCase().includes('foreign').

After fix: test-commit-node.js GREEN (32 assertions). simulate-workflow-walkthrough.js: all PASS "Workflow walkthrough simulation passed" (backward-compat green — non-archive kaola-workflow/ paths never match foreignArchive regex). Byte-identity diff empty (BYTE-IDENTICAL).

Files (declared write set): scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, scripts/test-commit-node.js.
