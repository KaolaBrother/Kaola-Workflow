# Node: plan (code-architect) — issue #251 implementation blueprint

Read-only. Durable spec; implementers (tdd-guide nodes) follow verbatim within their FROZEN write sets
(no file may be added). Builds on `.cache/explore.md`.

## Design decisions (settled)
- **D1 Role-gating lives in the validator, not commit-node.** `--verdict-check` reads the node's role
  from `## Nodes` and self-skips non-gate roles. commit-node stays role-blind (always shells
  `--verdict-check --node-id ID`). Gate-role list lives in ONE place (validator).
- **D2 parseNodeVerdict is fence-blind by column-0 anchor, no classifier.** Native multiline regex only
  (byte-identical ×4; classifier is renamed in forks). A verdict line is recognized ONLY at column 0
  (`^verdict:` no leading whitespace). Agent emits the block fence-free at top level; an INDENTED quoted
  example is rejected.
- **D3 verifyVerdictBlock reuses parseNodes + parseLedger** (no new section reader).
- **D4 Pure-read, toggle-agnostic, fail-closed** (no git, no install switch; missing/unparseable/fail/
  findings_blocking>0 → fail).
- **D5 Fan-out adversarial-verifier = sibling glob + majority-refute** (a single skeptic refute must NOT
  unilaterally fail). Single (sequence) verifier reads `.cache/{node-id}.md`.
- **D6 Honest docs**: validateNodeOutput() and a script-computed dry_streak do NOT exist. Script-enforced
  = static LOOP_CAP + (post-#251) --verdict-check; agent-discipline = tally count + dry_streak counting.

## 1. impl-schema — `parseNodeVerdict` in adaptive-schema.js (byte-identical ×4)
Insert AFTER `readDurableConsentHalt` (~line 88), before the `#238 CURATED_ROOT_PATHS` block.

```javascript
// #251: the mechanical verdict vocabulary a gate/skeptic role emits into its `.cache` evidence file.
const VERDICT_PASS = 'pass';
const VERDICT_FAIL = 'fail';
const VERDICT_VOCABULARY = Object.freeze([VERDICT_PASS, VERDICT_FAIL]);

// PURE (no fs): parse a gate/skeptic role's `.cache/{node-id}.md` for its machine verdict. Native
// multiline regex ONLY (no classifier — cross-edition byte-identity). FENCE-BLIND BY ANCHOR: a verdict
// line is recognised ONLY at column 0 (`^verdict:` no leading whitespace). findings_blocking optional
// non-negative int; absent => null. Returns { found, verdict:'pass'|'fail'|null, findings_blocking:number|null }.
function parseNodeVerdict(cacheText) {
  const text = String(cacheText || '');
  const vRe = /^verdict:[ \t]*([A-Za-z-]+)[ \t]*$/gm;
  let vm, lastVerdictTok = null;
  while ((vm = vRe.exec(text)) !== null) { lastVerdictTok = vm[1].toLowerCase(); }
  const found = lastVerdictTok !== null;
  let verdict = null;
  if (found && VERDICT_VOCABULARY.includes(lastVerdictTok)) verdict = lastVerdictTok;
  const fRe = /^findings_blocking:[ \t]*(\d+)[ \t]*$/gm;
  let fm, lastBlocking = null;
  while ((fm = fRe.exec(text)) !== null) { lastBlocking = parseInt(fm[1], 10); }
  return { found, verdict, findings_blocking: lastBlocking };
}
```
Add to module.exports: `VERDICT_PASS, VERDICT_FAIL, VERDICT_VOCABULARY, parseNodeVerdict`.
Notes: `[A-Za-z-]+` (not `\w+`) so `pass!`/`pass fail` break the `$` anchor → found:false → caller fails
closed. `verdict: maybe` → found:true, verdict:null → fail closed. "Last match wins".
After editing root, COPY VERBATIM to the 3 plugin copies (plugins/kaola-workflow, -gitea, -gitlab).

## 2. Verdict block format agents emit (fence-free, top level)
```
verdict: pass
findings_blocking: 0
```
Failing gate: `verdict: fail` + `findings_blocking: N`. Must NOT be fenced in the actual `.cache` file.
greppable: `grep '^verdict:' .cache/{node-id}.md`.

## 3. impl-validator — verifyVerdictBlock + --verdict-check in plan-validator.js
### 3a Constant near IMPLEMENT_ROLES (~line 53):
```javascript
const GATE_VERDICT_ROLES = new Set(['code-reviewer', 'security-reviewer', 'adversarial-verifier']);
```
### 3b Pure core AFTER `verifyGateExecution` (~line 328), before `barrierCheck`. Injectable readCache/globCache.
Contract:
- PER-NODE (opts.nodeId): role = parseNodes(content).find(n=>n.id===nodeId).role. role ∉ GATE_VERDICT_ROLES
  → {ok:true, found:false} (self-skip). role==='adversarial-verifier' AND node.shape.kind==='fanout' →
  glob `.cache/adversarial-verifier-*.md`, majority-refute. Else (sequence gate role) → read `<nodeId>.md`,
  require found && verdict==='pass' && (findings_blocking||0)===0; missing/notfound/fail/blocking>0 → ok:false.
- WHOLE-PLAN (no nodeId): parseLedger; for every parseNodes node whose role ∈ GATE_VERDICT_ROLES and
  ledger.get(id)==='complete', apply per-node rule; {ok: failures.length===0, failures, checked}.

```javascript
function verifyVerdictBlock(content, opts) {
  opts = opts || {};
  const readCache = opts.readCache || (() => null);
  const globCache = opts.globCache || (() => []);
  const nodes = parseNodes(content);
  if (!nodes.length) return { ok: false, failures: [{ nodeId: null, role: null, reason: 'unparseable ## Nodes' }], checked: [] };
  function checkOne(node) {
    const role = node.role;
    if (!GATE_VERDICT_ROLES.has(role)) {
      return { ok: true, nodeId: node.id, role, verdict: null, findings_blocking: null, found: false };
    }
    if (role === 'adversarial-verifier' && node.shape && node.shape.kind === 'fanout') {
      const files = globCache('adversarial-verifier-');
      const verdicts = [];
      for (const f of files) {
        const v = schema.parseNodeVerdict(readCache(f) || '');
        if (!v.found || v.verdict === null) { verdicts.push('fail'); continue; }
        verdicts.push((v.verdict === 'fail' || (v.findings_blocking || 0) > 0) ? 'fail' : 'pass');
      }
      if (!verdicts.length) {
        return { ok: false, nodeId: node.id, role, verdict: 'fail', findings_blocking: null, found: false,
          reason: 'fanout adversarial-verifier: no per-instance .cache/adversarial-verifier-*.md found' };
      }
      const refutes = verdicts.filter(x => x === 'fail').length;
      const majorityRefute = refutes * 2 > verdicts.length;
      return majorityRefute
        ? { ok: false, nodeId: node.id, role, verdict: 'fail', findings_blocking: null, found: true,
            reason: `fanout majority-refute: ${refutes}/${verdicts.length} skeptics refuted` }
        : { ok: true, nodeId: node.id, role, verdict: 'pass', findings_blocking: null, found: true };
    }
    const raw = readCache(node.id + '.md');
    if (raw == null) {
      return { ok: false, nodeId: node.id, role, verdict: null, findings_blocking: null, found: false,
        reason: `gate role ${role} node ${node.id} has no .cache/${node.id}.md verdict evidence` };
    }
    const v = schema.parseNodeVerdict(raw);
    if (!v.found || v.verdict === null) {
      return { ok: false, nodeId: node.id, role, verdict: v.verdict, findings_blocking: v.findings_blocking, found: v.found,
        reason: `gate role ${role} node ${node.id} verdict missing or unparseable` };
    }
    const blocking = v.findings_blocking || 0;
    const ok = v.verdict === 'pass' && blocking === 0;
    return { ok, nodeId: node.id, role, verdict: v.verdict, findings_blocking: v.findings_blocking, found: true,
      reason: ok ? undefined : `gate role ${role} node ${node.id} verdict=${v.verdict} findings_blocking=${blocking}` };
  }
  if (opts.nodeId) {
    const node = nodes.find(n => n.id === opts.nodeId);
    if (!node) return { ok: false, nodeId: opts.nodeId, role: null, verdict: null, findings_blocking: null, found: false,
      reason: `--node-id "${opts.nodeId}" not found in the frozen plan` };
    return checkOne(node);
  }
  const ledger = parseLedger(content);
  const failures = [];
  const checked = [];
  for (const node of nodes) {
    if (!GATE_VERDICT_ROLES.has(node.role)) continue;
    if (ledger.get(node.id) !== 'complete') continue;
    checked.push(node.id);
    const r = checkOne(node);
    if (!r.ok) failures.push({ nodeId: node.id, role: node.role, reason: r.reason || 'verdict not pass' });
  }
  return { ok: failures.length === 0, failures, checked };
}
```
IMPLEMENTER MUST VERIFY: the exact shape of `parseNodes()` node objects — confirm `node.shape.kind`
(or whatever the parsed shape field is, e.g. node.shape could be a string 'fanout(group)' — adapt the
fanout test accordingly) and `parseLedger()` return type (Map vs object — blueprint assumes `.get(id)`).
The test-first RED will catch a wrong accessor; fix to match real parseNodes/parseLedger.

### 3c majority-refute: missing/unparseable per-instance = fail (fail-closed); strict majority
`refutes*2 > verdicts.length`; empty glob → fail.
### 3d CLI handler AFTER `--barrier-check` block (~after line 834), before default validatePlan:
```javascript
  if (args.includes('--verdict-check')) {
    const flagVal = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
    const nodeId = flagVal('--node-id');
    if (args.includes('--node-id') && !nodeId) {
      process.stdout.write((json ? JSON.stringify({ ok: false, errors: ['--node-id requires a value'] }) : 'typed refusal: --node-id requires a value') + '\n');
      process.exitCode = 1; return;
    }
    const cacheDir = path.join(path.dirname(path.resolve(planPath)), '.cache');
    const readCache = fileName => { try { return fs.readFileSync(path.join(cacheDir, fileName), 'utf8'); } catch (_) { return null; } };
    const globCache = prefix => { try { return fs.readdirSync(cacheDir).filter(f => f.startsWith(prefix) && f.endsWith('.md')); } catch (_) { return []; } };
    const r = verifyVerdictBlock(content, { nodeId: nodeId || undefined, readCache, globCache });
    process.stdout.write((json ? JSON.stringify(r) : (r.ok ? 'verdict ok' : 'typed refusal: verdict-check failed')) + '\n');
    if (!r.ok) process.exitCode = 1;
    return;
  }
```
### 3e help (~line 714) add a `--verdict-check` line; extend usage line 710 with ` [--verdict-check [--node-id ID]]`.
### 3f export (~line 869, after verifyGateExecution): `verifyVerdictBlock,`
Sync: COPY VERBATIM root → plugins/kaola-workflow (×2 COMMON_SCRIPTS). MANUAL PORT to gitea
(kaola-gitea-workflow-plan-validator.js) + gitlab (kaola-gitlab-...); keep each fork's require lines.
parseNodeVerdict is called as schema.parseNodeVerdict (no classifier), ports cleanly.

## 4. impl-commit-node — role-blind wiring in commit-node.js
- Schema comment (18-22): add `verdictCheck:object|null`. Modes comment (16): per-node end adds
  "verdict-check (informational)".
- `combineResults` (77-116): destructure adds `verdictCheck` (l.80). per-node branch (89-97): INFORMATIONAL
  (NOT in overallOk; tag `{...verdictCheck, informational:true}`, mirror gvOut → add `vcOut`). whole-plan
  (98-105): BLOCKING — `const verdictPass = !!(verdictCheck && verdictCheck.exitCode === 0 && verdictCheck.ok === true);`
  then `overallOk = barrierPass && gatePass && verdictPass;`. per-node-start: verdictCheck=null. Return adds `verdictCheck: vcOut`.
- main(): declare `let verdictCheck = null;` (~l.170). per-node branch (after l.179):
  `verdictCheck = shellValidator(validatorPath, planPath, ['--verdict-check','--node-id',nodeIdValue,'--json']);`
  whole-plan branch (after l.183): `verdictCheck = shellValidator(validatorPath, planPath, ['--verdict-check','--json']);`
  Pass into combineResults (l.186). CLI help (124-129) updated.
- Per-node verdict-check is INFORMATIONAL so the per-node commit still gates on barrierPass — does NOT
  deadlock when the downstream reviewer hasn't run. Teeth are whole-plan/phase6.
- Sync: COPY ×2 (COMMON_SCRIPTS); MANUAL PORT gitea/gitlab (only diff = `VALIDATOR` const ~line 33).

## 5. impl-phase6 — merge gate (root + gitea + gitlab phase6)
Root `commands/kaola-workflow-phase6.md` adaptive block (28-45): add after the `--barrier-check` line:
```bash
  node scripts/kaola-workflow-plan-validator.js "$PLAN" --verdict-check --json; VC=$?
```
Extend if: `... || [ "$VC" -ne 0 ]; then`. Echo: add `verdict=$VC`. Add prose bullet after the
`--barrier-check` bullet describing --verdict-check (blocks merge on any nonzero exit).
GITEA: same, validator `kaola-gitea-workflow-plan-validator.js`. GITLAB: same, `kaola-gitlab-...`.
SHARP EDGE: issue-251's own `review` node is a code-reviewer → at its phase6 the whole-plan --verdict-check
REQUIRES `.cache/review.md` with `verdict: pass, findings_blocking: 0`. The §6 agent change makes the
code-reviewer emit it; the orchestrator MUST confirm the file lands (if review ran before the agent change,
the orchestrator writes the passing block to .cache/review.md — mechanically true at that point).

## 6. impl-agents — verdict emission (5 files)
The instruction in each doc SHOWS the block inside a ``` fence so it renders; the actual `.cache` file
must be fence-free at top level (state this in the instruction).
- code-reviewer.md: new "### Machine Verdict (adaptive path)" after `### Summary Format` (~after 297),
  before `## Approval Criteria` (299). Map: APPROVE→pass/0; WARNING→pass/0 (HIGH advisory); BLOCK→fail/<count CRITICAL>.
- profiles/higher/code-reviewer.md: IDENTICAL insertion (file differs only by `model: opus`); `diff` to confirm.
- security-reviewer.md: new "## Machine Verdict (adaptive path)" after `## Success Metrics` (~after 118),
  before `## Reference` (120). Map: no CRITICAL & no HIGH → pass/0; any CRITICAL or HIGH → fail/<count CRITICAL+HIGH>.
- profiles/higher/security-reviewer.md: identical except model line.
- adversarial-verifier.md: append machine-verdict to the output contract (after ~line 95). Per-instance
  path `.cache/adversarial-verifier-{claim-id}.md`. Map: REFUTED→fail/1; NOT-REFUTED→pass/0. Note: single
  skeptic fail doesn't unilaterally fail when quorum is majority; missing/unparseable counts as refute.

## 7. impl-docs-tests — Part A doc-honesty (root cmd + claude SKILL + gitea cmd + gitlab cmd)
### 7a commands/kaola-workflow-plan-run.md
- l.225-227 (enforcement-boundary tail): replace the "Only the quorum tally and the validateNodeOutput
  schema checkpoints remain agent-discipline prose..." with honest framing: --verdict-check now script-
  enforces the reviewer/skeptic verdict (informational per-node, BLOCKING in Phase 6); what remains
  agent-discipline is the quorum TALLY COUNT and dry_streak counting; gate presence/execution/barrier/
  verdict are all script-guaranteed.
- l.236-237 (quorum node validateNodeOutput()): replace with: each child verdict is a `verdict: pass|fail`
  block in `.cache`, mechanically checked by --verdict-check (#251); the orchestrator tallies recorded
  verdicts — the tally arithmetic is prose, not a script.
- l.239-240 (dry_streak "script-decidable"): replace with: terminates on static LOOP_CAP (script-enforced)
  plus an agent-tracked dry_streak (orchestrator counts no-change cycles; only LOOP_CAP is validator-enforced).
### 7b claude SKILL kaola-workflow-plan-run/SKILL.md: l.134-135, l.140-143, l.145-146 — same three honest rewrites.
### 7c gitea cmd: Part A region byte-identical to root → apply 7a verbatim (no validator-filename token in the new text).
### 7d gitlab cmd: same as 7a EXCEPT line 225 reads "step 4 above" not "step 3 above" — keep gitlab's "step 4".

## 8. impl-docs-tests — testAdaptiveVerdictCheck in simulate-workflow-walkthrough.js
Model on `testAdaptiveGateBarrierEnforcement` (1033-1172). Add function near l.1236; register at ~l.6420
(after testAdaptivePerInstanceBarrier(), before the pass banner). Cases:
(1) parseNodeVerdict pure: pass; fail(2); missing→found:false; `verdict: maybe`→found:true/verdict:null;
    INDENTED example (`    verdict: pass`)→found:false (col-0 anchor). [fenced col-0 still matches — that's OK;
    only indentation must be rejected.]
(2) verifyVerdictBlock pure (injected readCache/globCache): gate role pass→ok; fail→ok:false; missing→ok:false/found:false;
    findings_blocking>0 forces fail; non-gate role self-skip→ok:true/found:false; fanout 1/3 refute→pass; 2/3 refute→fail.
(3) --verdict-check CLI via runNode on a temp .cache: per-node missing gate cache→exit1; non-gate node→exit0;
    passing gate→exit0; whole-plan all pass→exit0.
(4) whole-plan: a complete gate row with verdict fail→exit1, failures.length===1.
(See .cache/plan.md full test skeleton in the architect output; copy mkLedgerPlan/adaptiveTmp/runNode patterns from the file.)

## 9. Build/sync order + sharp edges
Order = DAG: impl-schema → impl-validator → impl-commit-node → impl-agents → impl-phase6 → impl-docs-tests.
After each script-touching node: `node scripts/simulate-workflow-walkthrough.js` (exit 0). Full `npm test`
exercises the gitea/gitlab forge ports (no sync guard on those — port by hand).
Sharp edges: (1) fenced-example regex trap — do NOT add fence-tracking (breaks byte-identity); col-0 anchor
+ fence-free emission is the contract. (2) adversarial-verifier cache-path mismatch handled by fanout glob.
(3) issue-251's own review node needs .cache/review.md verdict:pass at phase6. (4) per-node verdict-check
informational (no deadlock). (5) re-verify byte-identity: cmp the 4 schema files; cmp root vs plugins/kaola-workflow
validator+commit-node; diff gitea/gitlab forks (only forge tokens differ).
