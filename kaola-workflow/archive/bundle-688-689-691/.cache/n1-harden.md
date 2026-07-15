evidence-binding: n1-harden f9a8f0a8faa9

RED: 688.1 direct-call `proveRebindAdmissible` with `ctx.ledgerStatuses` omitted (synthetic absent
ledger) returned `{"ok":true,"absorbed":[{"path":"b.js",...,"owner":"other"}],"attributed_to":["other"]}`
instead of refusing — the pre-fix `(ledgerStatuses || {})[m] !== 'complete'` admits-all on an absent
ledger. 688.2 direct-call with `ledgerStatuses:{other:'n/a'}` (a selector-pruned owner-gate arm) returned
the SAME wrongful `ok:true` absorb — `n/a !== 'complete'` was treated as still-live. 688.3 `validatePlan`
on a plan whose sole gate node is literally named `__proto__` returned `{"result":"in-grammar"}` with NO
errors (fixture confirmed via isolated repro after `git stash`-ing the fix) — the reserved id froze
in-grammar instead of refusing. 688.4 `isCanonicalBlobMap({'.env':'100644 aa..','10':'100644 bb..'})`
returned `false` — JS's forced numeric-key-first enumeration (`['10','.env']`) diverged from the
lexicographic sort (`['.env','10']`) for a legitimately-built map. 689 (fast/full/phase4-advance
`writeFileAtomic`, run per-script): order-tracking spy over fs.openSync/fsyncSync/renameSync/closeSync
showed calls = [openSync(tmp), fsyncSync(tmp), closeSync(tmp), renameSync] with NO post-rename
openSync(parentDir)/fsyncSync(dirFd) — asserting "parent directory opened AFTER renameSync" FAILed (3
assertions per script × 3 scripts = 9 fails; e.g. test-fast-advance.js: "test-fast-advance: 133 passed, 3
FAILED"). 691 `barrier-ref-sweep` on a LIVE project whose PROJECT DIRECTORY is chmod 000 (state file
live inside) returned `tagsKept:[]`, `tagsDeleted` including `issue-691chmoddirlive` — `fs.existsSync`
returns false through a denied parent, indistinguishable from absent, so the live tag was reaped
(`claim-hardening tests FAILED (2 failures, 249 passed)`).

GREEN: 688.1 same ctx now refuses `{"ok":false,"reason":"candidate_delta_unattributed","paths":["b.js"]}`
(ledger absent -> fail-closed; positive controls with `ledgerStatuses:{other:'pending'|'in_progress'}`
still attribute `ok:true` — no regression). 688.2 the `n/a`-arm ctx now refuses the identical
`candidate_delta_unattributed` on b.js (excluded from the {pending,in_progress} quantifier). 688.3 the
`__proto__` plan now refuses `{"result":"refuse","reason":"plan_invalid","errors":["node id \"__proto__\"
is a reserved Object.prototype key ..."]}`; the clean-node-id control plan still freezes
`result:"in-grammar"`. 688.4 the same integer-keyed map now returns `isCanonicalBlobMap(...) === true`
(order-insensitive fix); malformed-shape/non-object controls still correctly return `false`. 689 all
three advance scripts: order-tracking spy now shows fsyncSync(tmpFd) -> renameSync ->
openSync(parentDir) -> fsyncSync(dirFd) -> closeSync(dirFd) in strict order, plus a fail-soft control
(EISDIR then EACCES fault-injected on the parent-dir openSync) proves the block never throws, still
returns `true`, and content is still durably written — `test-fast-advance: all 136 assertions passed`,
`full-advance tests: 78 passed, 0 failed`, `phase4-advance tests: 57 passed, 0 failed`. 691 the identical
chmod-000-directory fixture now shows `tagsKept` including `issue-691chmoddirlive`, the genuinely-dead
no-folder-anywhere tag still reaped, and a genuinely-absent (clean ENOENT, readable parent folder) state
file still reaped too — `claim-hardening tests passed (251 assertions)`. Full local suites green:
`node scripts/test-adaptive-node.js` -> "adaptive-node tests passed (2166 assertions)";
`node scripts/simulate-workflow-walkthrough.js` -> "Workflow walkthrough simulation passed". Four chains
green SEQUENTIALLY with `KAOLA_RUN_CHAINS_CONCURRENCY=serial`:
`npm run test:kaola-workflow:claude` (ends "test-generate-routing-surfaces: all 33 assertions passed."),
`:codex` (ends "generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton."),
`:gitlab` (ends "generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton." after
"GitLab Codex workflow walkthrough simulation passed"), `:gitea` (ends "generate-routing-surfaces
--check: all 12 surfaces byte-match the skeleton." after "Gitea Codex workflow walkthrough simulation
passed") — combined run exited `FOUR_CHAIN_EXIT=0`.

## Per-fix receipts

### 688.1 + 688.2 — `proveRebindAdmissible` ledger-status hardening (scripts/kaola-workflow-adaptive-node.js)
Fix: the `repairWriters` computation dropped the `(ledgerStatuses || {})[m] !== 'complete'` admit-all
fallback and now reads `ledgerStatuses != null && (a.logical_gate.members||[]).some(m =>
ledgerStatuses[m] === 'pending' || ledgerStatuses[m] === 'in_progress')` — a missing ledger (undefined,
never threaded) short-circuits to `false` (fail-closed, no crash since `&&` never evaluates the right
side), and only the two genuinely-live statuses count, excluding `n/a`/`complete`/anything else.
`proveRebindAdmissible` exported (all 4 editions) for the direct-call regression. Test:
`scripts/test-adaptive-node.js` new block right before `#688.4` (`makeProveCtx` fixture: slice node
`writer` declares a.js, disjoint owner `other` declares b.js whose gate was repaired by a DIFFERENT
attempt; b.js is the sole candidate-delta path P3b can ever attribute). 4 assertions (688.1, 688.2, 2
positive controls).

### 688.3 — reserved node-id grammar refusal (scripts/kaola-workflow-plan-validator.js)
Fix: in the #388 dup-id/collision freeze wall inside `validatePlan`, a new
`reservedNodeIdKeys = new Set(Object.getOwnPropertyNames(Object.prototype))` check pushes a typed error
(folded into the existing `plan_invalid` reason at the end of `validatePlan`, same as the dup-id/collision
errors) when a node id is a literal `Object.prototype` own key (`__proto__`, `constructor`, `toString`,
...). `readLedgerStatuses` itself is untouched (the fix lands at the grammar per the issue's own
guidance). Not added to `revalidateForResume` — that function is fully independent of `validatePlan` and
was never in scope (mirrors the existing dup-id precedent). Test:
`scripts/test-adaptive-node.js` new block calling `planValidator.validatePlan` directly with a
`__proto__`-named gate node vs. a clean-id control plan.

### 688.4 — `isCanonicalBlobMap` order-insensitive (scripts/kaola-workflow-adaptive-schema.js)
Fix: dropped the `JSON.stringify(keys) !== JSON.stringify(sorted)` native-enumeration-vs-sorted
comparison (unreliable once a canonical-integer key is present, since JS hoists integer-like keys ahead
of every string key regardless of insertion order) and now just sorts once for the shape-check loop. Both
`isCanonicalBlobMap` call sites (`validateReviewJournal`'s `candidate_declared` checks) are unaffected —
neither ever compared the whole object's JSON string, only per-key lookups. Kept the four adaptive-schema
copies byte-identical (md5 `a250d3a8e944b647d58e387ca06e8d5d` across scripts/ + all 3 plugin trees, via
`npm run sync:editions`). Test: `scripts/test-adaptive-node.js` new block asserting the `{.env, 10}`
fixture now passes plus malformed-shape/non-object controls still fail.

### 689 — parent-dir fsync in fast/full/phase4-advance.js
Fix: copied the exact #685 `writeFileAtomicReplace` shape (try `fs.openSync(dir,'r')` +
`fs.fsyncSync(dirFd)`, `finally` closes, outer `catch` swallows — never rethrows, never changes the
`true` return, sits strictly AFTER the existing rename catch/throw so a real rename/ENOSPC error is
unaffected) into all three `writeFileAtomic` functions. Exported `writeFileAtomic` from each of the three
scripts (additive export, no removal) for the monkey-patch seam. Tests: `test-fast-advance.js`,
`test-full-advance.js`, `test-phase4-advance.js` each gained an in-process `require(...)` of their own
script plus two blocks mirroring `test-claim-hardening.js`'s #685 pattern — an order-tracking spy
(openSync/fsyncSync/renameSync/closeSync) and a fault-injection fail-soft proof (EISDIR then EACCES
faulted on the parent-dir openSync only, tmp-file openSync untouched) confirming the write still
completes, returns `true`, and content lands on disk both times.

### 691 — `sweepBarrierRefs` keep-pass (c) (scripts/kaola-workflow-claim.js)
Fix: replaced `if (!fs.existsSync(stateFile)) continue;` + the separate readFileSync try/catch with ONE
try that runs `fs.statSync(stateFile)` then `fs.readFileSync(stateFile,'utf8')`, and a single catch that
adds to `keep` on any `e.code !== 'ENOENT'` (EACCES/EISDIR/EPERM/anything else) and does nothing on a
clean `ENOENT`. Sweep-local; `readActiveFolders` untouched. Test: `scripts/test-claim-hardening.js` new
block (root-skip guarded via `process.getuid()`, vars hoisted above the try, perms restored + dir removed
in `finally`) with three fixtures under one sweep: (1) a live project whose PROJECT DIRECTORY is chmod
000 (state file present but unreachable) — must be KEPT; (2) a genuinely-dead no-folder-anywhere project —
must stay reaped; (3) a project folder that exists and is fully readable but carries no
`workflow-state.md` at all (clean ENOENT) — must stay reaped.

## Cross-edition propagation
- GENERATED_AGGREGATORS (`kaola-workflow-adaptive-node.js`, `kaola-workflow-plan-validator.js`): edited
  canonically in `scripts/`, then `npm run sync:editions` regenerated the codex twin
  (`plugins/kaola-workflow/scripts/`) and the gitlab/gitea forge ports
  (`kaola-*-workflow-adaptive-node.js`, `kaola-*-workflow-plan-validator.js`).
- BYTE_IDENTICAL group (`kaola-workflow-adaptive-schema.js`, same name in all 4 trees): regenerated via
  the same `sync:editions` run; md5 verified identical across all 4 copies (above).
- RENAME_NORMALIZED families (`kaola-workflow-fast-advance.js`, `kaola-workflow-full-advance.js`,
  `kaola-workflow-phase4-advance.js`): canonical edited, codex twin regenerated by `sync:editions`; the
  gitlab/gitea forge ports (checked via `RENAME_NORMALIZED_FAMILIES` in `validate-script-sync.js`, not
  auto-written by `edition-sync.js`) were regenerated by applying the same `renameNormalize` transform
  used by the checker itself, then verified byte-exact via `node scripts/validate-script-sync.js`.
- `kaola-workflow-claim.js` (COMMON_SCRIPTS with a module.exports-superset-only forge check, hand-ported
  logic): canonical edited + codex twin regenerated by `sync:editions`; the gitlab/gitea forge ports
  (`kaola-gitlab-workflow-claim.js`, `kaola-gitea-workflow-claim.js`) hand-patched with the byte-identical
  keep-pass (c) block (confirmed via diff against canonical pre-edit — their `sweepBarrierRefs` keep-pass
  (c) was already word-for-word identical to canonical modulo the forge-neutral "gh"->"forge" comment
  wording already present).
- Final parity: `node scripts/edition-sync.js --check` -> "10 forge aggregator ports, 24 COMMON_SCRIPTS
  mirrors, and 27 byte-identical groups in parity with canonical."; `node scripts/validate-script-sync.js`
  -> "OK: 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks.json families
  (config + hooks dir), and 7 forge export-superset families in sync."

## Scope discipline
No change to `#683` rebind semantics (P1/P2/P3a/P4 untouched, only the P3b `repairWriters` predicate
narrowed), the partition proof, any LIVE refusal path, or the `#685`-fixed adaptive-path
`writeFileAtomicReplace`/`kaola-workflow-roadmap.js` helper (untouched — #689 only adds the identical
shape to the three fast/full/phase4-advance copies). `readActiveFolders` untouched (per #691's
sweep-local constraint). No new script, agent, exported symbol (beyond the four additive test-only
exports), forge token, or env var — no contract-validator/`validate-vendored-agents.js`/install.sh edits
required or made. Touched file set is exactly the declared 33-file union (28 source across the 7
edition-groups + 5 test files: `test-adaptive-node.js`, `test-claim-hardening.js`, `test-fast-advance.js`,
`test-full-advance.js`, `test-phase4-advance.js`), verified via `git diff --stat` (33 files changed).
