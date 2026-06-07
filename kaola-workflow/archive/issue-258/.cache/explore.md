# Node explore — change map for #258 (verdict-check resume surface)

verdict: pass
findings_blocking: 0

## Change: add verifyVerdictBlock surface to routeAdaptive, parallel to verifyGateExecution, NON-blocking (fold into existing pendingGates via push). 4 editions + 1 test.

### verifyVerdictBlock contract (all 4 plan-validators export it)
- call: planValidator.verifyVerdictBlock(content, { readCache, globCache })  — NOT { root }
- whole-plan return: { ok, failures:[{nodeId, role, reason}], checked }  — NOT .unsatisfied
- only checks nodes with ledger status === 'complete' (pending/n-a/in_progress skipped)
- GATE_VERDICT_ROLES = {code-reviewer, security-reviewer, adversarial-verifier}
- cacheDir = path.join(projectDir, '.cache'); readCache(fileName)->string|null; globCache(prefix)->[names] (mirror plan-validator.js:1116-1118 CLI handler)

### Edition A root scripts/kaola-workflow-repair-state.js — routeAdaptive L514-560; projectDir L515; plan-validator require './kaola-workflow-plan-validator'; insert after pendingGates const (after L544, before return L546). Template-literal style.
### Edition B plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js — BYTE-IDENTICAL to A (COMMON_SCRIPTS). Apply identical diff.
### Edition C plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js — routeAdaptive L387-419; projectDir L388; require './kaola-gitea-workflow-plan-validator'; insert after pendingGates (after L411, before return L412). Compact string-concat style; 'use strict' present.
### Edition D plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js — same structure/lines as C; require './kaola-gitlab-workflow-plan-validator'.

Inserted block (root/claude, template-literal):
  const cacheDir = path.join(projectDir, '.cache');
  const readCache = fileName => { try { return fs.readFileSync(path.join(cacheDir, fileName), 'utf8'); } catch (_) { return null; } };
  const globCache = prefix => { try { return fs.readdirSync(cacheDir).filter(f => f.startsWith(prefix) && f.endsWith('.md')); } catch (_) { return []; } };
  const verdict = planValidator.verifyVerdictBlock(content, { readCache, globCache });
  if (!verdict.ok) { for (const f of verdict.failures) { pendingGates.push({ requirement: `verdict gate ${f.nodeId} (${f.role})`, status: 'missing-verdict', evidence: '', skipReason: f.reason }); } }
(gitea/gitlab: same but string-concat: 'verdict gate ' + f.nodeId + ' (' + f.role + ')')

### Test: scripts/simulate-workflow-walkthrough.js fn testAdaptiveGateBarrierEnforcement (~L1176-1187). Helpers: plantFrozenPlan(root,project,planText)[freezes, no .cache], mkLedgerPlan(nodes,ledger), runNode(repairScript,[proj],tmp), statePath(root,project), read(file).
- New sub-test: frozen plan w/ COMPLETE code-reviewer node 'rv' (ledger | rv | complete |) + NO .cache/rv.md -> assert exit 0 (non-blocking), routes to plan-run, and ## Pending Gates contains "verdict gate rv".
- Verdict file format (schema.parseNodeVerdict): "verdict: pass\nfindings_blocking: 0" or "verdict: fail\nfindings_blocking: N".
- MUST use ledger 'complete' (n/a would be skipped by verifyVerdictBlock).
- Run full `npm test` (byte-identity validate-script-sync runs only under npm test).

### NOT in scope: no fork-walkthrough verdict assertion (#231 precedent), no docs (=#257), no new parity-token check.
