evidence-binding: n2-review 2ff3eabac0f5
verdict: pass
findings_blocking: 0

finding: id=R1 scope=in_scope action=document status=open severity=low fix_role=none rationale=docs/api.md OPT-2 bullet (line ~406) still lists only directory-shaped/glob/'..'-aliasing; the three new shapes (absolute_path, backslash_in_path, bare-existing-directory) are not yet documented — confirm the downstream docs node updates it
finding: id=R2 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=reason-LABEL ordering diverges from the freeze wall for a path that is both absolute and dir-shaped (e.g. '/bench/' labels "directory-shaped, glob, or '..'-aliasing" at OPT-2 vs absolute_path at the wall) — accept/refuse behavior is identical in all cases, cosmetic only

## Review — n1-opt-shape (OPT-2 metric_paths shape hardening, issue-640)

### 1. Parity with the freeze wall — VERIFIED
Compared `shapeReason` (scripts/kaola-workflow-plan-validator.js:1537-1545) against the declared_write_set freeze wall (same `validatePlan()`, lines 1396-1432), predicate by predicate:
- **absolute**: wall uses `tok.startsWith('/')` + `tok.match(/^[A-Za-z]:/)` (lines 1402/1404); OPT-2 uses `p.startsWith('/') || p.match(/^[A-Za-z]:/)` — same two predicates merged into one arm, same `absolute_path` reason token the wall uses for both forms. Exact parity.
- **backslash**: both `includes('\\')` (wall line 1410). Exact parity.
- **bare-existing-directory**: both `fs.statSync(path.join(root, p)).isDirectory()` inside try/catch with skip-on-throw (wall lines 1428-1432), reached only after every string check misses. Exact parity, including symlink-follow semantics (statSync in both).
- **root computation**: `optRoot = opts.root || process.cwd()` (line 1536) is byte-identical to `freezeRoot = opts.root || process.cwd()` (line 1396). Recomputation is genuinely required — freezeRoot is scoped inside the per-node write-set loop, out of scope at the OPT-2 block. `fs`/`path` are module-level (used throughout the file).
- The traversal evasion `..\foo` (misses the `/`-only `..` split) is caught by the backslash arm in both — same closure the wall documents at lines 1407-1409.

### 2. Precedence order — VERIFIED
Traced `C:\foo`: check 1 (hasUnresolvableEntry — no trailing `/`, no glob metachar from `/[*?[\]{}]/`; `split('/')` yields no `..`) misses → check 2 `/^[A-Za-z]:/` matches → reports `absolute_path`, never reaching the backslash arm. Matches the wall's absolute-before-backslash order (wall comment line 1401). Also confirmed statSync can never run on an absolute/backslash path (string checks precede it), so no malformed `path.join` ever executes. One cosmetic label divergence noted as R2 above (refusal behavior identical).

### 3. ACCEPT control — VERIFIED, genuinely exercised
- The walkthrough fixture writes a real `Makefile` FILE into the fixture tmp root and asserts `in-grammar` (simulate-workflow-walkthrough.js:2378-2381); `metricdir/` is a real created directory asserted `refuse` (lines 2372-2374).
- Confirmed the fixtures hit the statSync arm for real: the plan lives at `{tmp}/plan.md`, the CLI computes `root = findRepoRoot(dirname(planPath))` (validator line 2292), and `findRepoRoot` falls back to startDir (= tmp) when no `.git`/`agents` ancestor exists (lines 349-358, true for `/var/folders/...` mkdtemp dirs). So `statSync(tmp/metricdir)` → isDirectory()===true → refuse, and `statSync(tmp/Makefile)` → isDirectory()===false → in-grammar. Not vacuous.
- The skip-on-throw catch (not-yet-created file stays legitimate) mirrors the wall exactly, and the pre-existing default fixture `bench/suite.js` (nonexistent in tmp) continues to freeze in-grammar via that path — regression-covered by the existing OPT-2 accept asserts.

### 4. Scope / soundness — VERIFIED
- The existing dir-shaped/glob/`..` composite is preserved verbatim as shapeReason's first arm; the OPT-2 disjointness check (`else { shared... }`, lines 1550-1553) is untouched.
- Refusal string still prefixed `OPT-2:`. The message now carries a per-path `(reason)` — checked for string-matching consumers: existing walkthrough asserts use `/OPT-2/` only; grepped `validate-*-contracts.js` ×4 and `adaptive-node.js` — zero code matches on the old message text (the emit-envelope discipline holds; classification is by prefix/typed reason).
- `map→filter` on `{p, reason}` is behaviorally equivalent to the old `filter` for the refuse/accept decision.

### 5. Cross-edition fidelity — VERIFIED
- `node scripts/edition-sync.js --check` → "10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical."
- `plugins/kaola-workflow/` copy is byte-identical to canonical (same git blob pair cc63fc0f→916b7c89 in the diff); gitlab/gitea hunks are content-identical modulo the ports' pre-existing 1-line offset — consistent with regeneration, not hand-edits.

### 6. Provenance — CLEAN
`#640` appears only in comments (canonical + ports + walkthrough), matching the file's existing convention (#381/#388/#415/#587 comments). No issue refs in error strings or logic.

### Checks run
- `git diff` (full, 5 files) — reviewed line by line.
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed"; `testMetricOptimizerContract: PASSED` (includes the 4 new #640 fixtures).
- `node scripts/edition-sync.js --check` → full parity.
- Greps for old-message consumers and provenance leakage → clean.

### Non-blocking observations
- **R1 (document)**: docs/api.md's OPT-2 bullet (~line 406) still describes only the original three refusal shapes; the new absolute/backslash/bare-dir shapes should land there via the plan's docs node.
- **R2 (none/cosmetic)**: reason-label precedence for combined shapes (absolute + dir-shaped) differs from the wall's label; refusal outcome identical for every input, so no accept/refuse divergence exists.

Verdict: APPROVE (pass) — parity exact, precedence correct, accept-control genuinely exercised, ports in parity, no regressions.
