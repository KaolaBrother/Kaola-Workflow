# Premise check — issue #960 (`yagni: run-chain-pool.js`)

VERDICT: **SAFE WITH CONDITIONS** — the deletion of `scripts/run-chain-pool.js` is safe, but ONE
clause of the filed claim is refuted and executing the claim literally would turn the claude chain
red. The module's only consumer is `scripts/test-parallel.js:349` — but that file is NOT "the test
that exists to test it": it is the four-chain parallel runner, a **live step in both claude chains**
(`--self-test` in `test:kaola-workflow:claude` and `:claude:full`), and its self-test covers THREE
modules. Only its f6–f9 section dies with the mechanism; sections a–e (its own runner) and f1–f5
(`test-shard-lib`, which has a surviving live consumer) must stay. Delete the module + the f6–f9
section + the line-349 require, in one commit; touch nothing else.

verdict: fail
findings_blocking: 1

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=tdd-guide rationale=Claim clause "its only consumer is the test that exists to test it" is refuted — no dedicated test exists; the consumer is test-parallel.js, a live claude-chain step (fast AND full) whose self-test also covers test-shard-lib (live, survives via simulate-workflow-walkthrough.js:12712) and its own four-chain runner. Literal execution (delete module + delete consumer file) breaks both claude chains at `node scripts/test-parallel.js --self-test` and strands test-shard-lib coverage. Required surgery: delete scripts/run-chain-pool.js AND remove only test-parallel.js line 349 + sections f6–f9 (lines 414–464) + the pool half of the (f) comment (340–347), keeping a–e, f1–f5, and line 348's shardLib require. Test-file surgery is tdd-guide custody.

Analytical result on the filed claim, clause by clause: **refuted** on "only consumer is the test
that exists to test it" (concrete counterexample below, §5); **not_refuted** on every other clause
(428 lines; no chain; no invoked CLI; no installer caller; empty shard registry; single consumer
site). Deletion-safety under the corrected plan: **not_refuted** after the full two-part sweep, six
enumeration-guard checks, and a passing positive control. Execution: all commands completed; no
truncated capture (every sweep prints its per-tree file count; nothing piped through head/tail).
Confidence: high — the one zero that matters (no consumer beyond test-parallel.js:349) was
established by stem search in both tracked and untracked trees and validated by a positive control
that returned 538 hits with the identical method.

---

## 1. The file exists; exact line count

```
$ ls -la scripts/run-chain-pool.js && wc -l scripts/run-chain-pool.js
-rw-r--r--@ 1 ylpromax5  staff  19237  8月  1 01:39 scripts/run-chain-pool.js
     428 scripts/run-chain-pool.js
```

428 lines — matches the claim exactly.

## 2. Full consumer enumeration (two-part stem search)

### Part A — tracked tree: `git grep -nP 'run-chain-pool|runChainPool|chain-pool|chainPool' -- .`

Every hit, classified:

| hit | class |
|---|---|
| `scripts/run-chain-pool.js` :4,43,334,349,356,401,405,408,425 | the module itself (self-references, incl. its own usage line 43) |
| `scripts/test-parallel.js:349` — `const pool = require('./run-chain-pool');` | **the real consumer — extensionless require, the exact basename-vs-stem trap** |
| `docs/audits/2026-08-11-subtraction-audit.md` :61,179–180 | the originating audit (mention) |
| `kaola-workflow/.roadmap/issue-960.md`, `kaola-workflow/ROADMAP.md:14` | the issue itself (mention) |
| `kaola-workflow/archive/bundle-881-…/fable-coverage.md`, `…/finalization-summary.md`; `bundle-952-955/…` (finalization-summary, mission-list, reports/audit-952-scripts.md) | archive/history (mention) |

Zero consumers besides `test-parallel.js:349`. The wider net (`runChainPool`, `chainPool`,
`chain_pool`, case-insensitive) added nothing. No dynamic/computed require reaches it: no
`readdirSync`-driven loader admits the name (§6), and package.json invokes scripts only via literal
`node <path>` strings (§3).

### Part B — untracked/rendered trees: `find <tree> -type f -print0 | xargs -0 grep -IinE 'chain-pool|chainpool|chain_pool|runChainPool'`

Per-tree file counts printed so a silent empty sweep is detectable:

| tree | files | hits |
|---|---|---|
| `scripts/` (canonical) | 82 | module + test-parallel.js:349 only |
| `plugins/kaola-workflow/` | 47 | 0 |
| `plugins/kaola-workflow-gitlab/` | 62 | 0 |
| `plugins/kaola-workflow-gitea/` | 56 | 0 |
| `.opencode/` | 3458 | 0 |
| `.kimi/` | 19 | 0 |
| `.opencode-gitlab/` | 19 | 0 |
| `.opencode-gitea/` | 19 | 0 |
| `.kimi-gitlab/` | 19 | 0 |
| `.kimi-gitea/` | 19 | 0 |

The root sweep discovered the six gitignored rendered trees are actually
`.opencode`/`.kimi`/`.opencode-gitlab`/`.opencode-gitea`/`.kimi-gitlab`/`.kimi-gitea` — all six
swept, all zero. Caveat made explicit by the positive control (§7): the dot-trees carry **no
scripts at all** (they return zero even for `adaptive-schema`), so for them the meaningful evidence
is the name census + the manifest-exactness guard, both below. The plugins trees DO carry scripts
(13–16 adaptive-schema hits each), so their zeros are meaningful directly.

A whole-root untracked sweep (every top-level entry except `.git`, with per-dir file counts —
`.kw` 9125, `kaola-workflow/` 8637, `docs/` 199, `agents/` 14, `templates/` 10, `hooks/` 2,
`commands/` 3, `.claude`/`.codex`/`.agents`/`opencode.json` 1 each, …) found hits only in:
this run's own mission list / roadmap / audit docs (mentions), and checkout copies under
`.kw/worktrees/bundle-956-957-958-959-960-961-962/` — a git worktree of this bundle's branch, i.e.
the same tracked files, not extra consumers.

File-name census (any file named `*chain-pool*` anywhere, incl. dot-dirs, excl. `.git`):

```
scripts/run-chain-pool.js
.kw/worktrees/bundle-956-957-958-959-960-961-962/scripts/run-chain-pool.js   (branch checkout of the same file)
```

**The module exists exactly once per checkout. No edition tree, plugin tree, or installed layout
carries a copy.**

## 3. No CLI entry point that anything reaches; no installer caller

Precision on the claim's wording: the file ITSELF is a fully-formed CLI — shebang (line 1), argv
parsing (`parseArgs`, line 314), documented usage (line 43), `require.main === module` guard
(line 423). What is true is that **nothing invokes it**:

- `package.json` `bin`: **null**. No npm script references it — the full `scripts` table was read;
  the chains are literal `&&`-joined `node scripts/<suite>.js` strings and none names it. (The
  chains it was built to schedule never adopted it — its own `COST_HINT` table at lines 96–113
  lists the chain steps, a design intent that never got wired.)
- Installers: `grep -cE 'chain-pool|chainPool' install.sh install-all.sh install-opencode.sh
  install-kimi.sh uninstall.sh` → `0` in all five.
- Edition sync / manifests: zero hits in `edition-sync.js`, `kaola-workflow-install-manifest.js`,
  `validate-script-sync.js`, `validate-workflow-contracts.js`.
- Launcher surfaces (`hooks/`, `commands/`, `agents/`, `templates/`, `.claude`, `.codex`,
  `.agents`, `opencode.json`): swept in the root sweep — zero.

## 4. The shard registry is genuinely empty

`scripts/run-chain-pool.js:68`:

```js
const SHARDED_SUITES = {};
```

Genuinely empty — an empty object literal, not merely small. Corroborated independently by the
consumer's own comment (`test-parallel.js:417–419`): "The registry is EMPTY in the shipped tree —
the two suites that were once registered are deleted, and the walkthrough is deliberately
excluded" — which is why f6/f7 register a *synthetic* suite to test the expansion mechanism.
(Distinct table `COST_HINT` (lines 96–113) is populated — it is a scheduling-hint table, not the
shard registry, and it dies with the file.)

## 5. The test that dies with the mechanism — the claim's refuted clause

**There is no test whose only purpose is exercising this module.** The sole consumer is
`scripts/test-parallel.js` (500 lines), and reading it in full shows three constituencies:

- **Sections a–e** (lines ~176–338): test `test-parallel.js`'s OWN exports — `runParallel`,
  `runChain`, `tail` — the four-chain parallel runner still invocable via `npm run test:parallel`.
  Survives.
- **Sections f1–f5** (lines 348, 351–412): test `test-shard-lib.js` — shard ownership partition,
  `--shard` parsing refusal, coverage audit, coverage-line round-trip. `test-shard-lib` does NOT
  die with the pool: its other live consumer is `simulate-workflow-walkthrough.js:12712–12782`
  (the `--shard` support the fast gate exercises every run via `--shard auto/12`), and it is named
  in `test-suite-registration.js:38` (EXEMPT as LIBRARY) and `test-spawn-classification.js:95`.
  Survives.
- **Sections f6–f9** (line 349 require + lines 414–464): test `run-chain-pool` — planUnits
  expansion, SHARDS=off escape hatch, resolveConcurrency table, parseArgs. **This is what dies
  with the mechanism**, in the same commit, per test custody. ~52 lines.

And the consumer is LIVE: `node scripts/test-parallel.js --self-test` is a step in
`test:kaola-workflow:claude` AND `test:kaola-workflow:claude:full` (package.json read in full).
Concrete counterexample to the claim as filed: delete `run-chain-pool.js` alone → the self-test's
line-349 require throws MODULE_NOT_FOUND → both claude chains red. Delete `test-parallel.js` whole
as "the test that exists to test it" → three dangling npm references (`test:parallel` plus the two
chain steps; caught by `test-suite-registration.js` check G "DANGLING SCRIPT REFERENCE") and the
only tests of the surviving `test-shard-lib` and of the parallel runner are destroyed.

Test-custody compliance of the corrected surgery: removing f6–f9 WITH the mechanism is the rule
("a test is deleted with its mechanism"), not a repair — those pins cannot pass at all once the
module is gone. No surviving pin is rewritten; f1–f5 and a–e are untouched.

## 6. What else would break on deletion — enumeration guards, manifests, byte-identity

Every dynamic enumerator of `scripts/` was located (`git grep -nP "readdirSync\([^)]*scripts"`)
and read:

| guard | filter / mechanism | affected? |
|---|---|---|
| `simulate-workflow-walkthrough.js:12022` | `^sync-[a-z0-9-]+-edition\.js$` | no — name doesn't match |
| `test-kernel-conformance.js:208,603` | `^kaola-workflow-[a-z0-9-]+\.js$` (artifact names, write surface) | no |
| `test-route-reachability.js:770` | `^sync-[a-z0-9-]+-edition\.js$` | no |
| `test-kimi-edition.js:1287` / `test-opencode-edition.js:1829` (FA9) | installed `scripts/` must equal `manifest.supportScripts(forge)` EXACTLY | no — the manifest never carried run-chain-pool, so no installed tree has it (and the guard proves it: an unexpected deployed file is a listed failure) |
| `test-spawn-classification.js` | defined over suite files only (`^test-.+\.js$` / walkthroughs); expected-count map has NO run-chain-pool or test-parallel entry; f6–f9 contain no spawn sites | no |
| `test-suite-registration.js` check A | every `scripts/test-*.js` registered or EXEMPT | no — `run-chain-pool.js` is not `test-*`; `test-parallel.js` stays registered |
| `test-suite-registration.js` check G | every `node <path>` in ANY npm script must exist | no under corrected plan (package.json never names the pool) — and this is the guard that goes RED under the literal plan |
| `validate-script-sync.js` byte-identity / `edition-sync.js` | COMMON_SCRIPTS-listed files across trees | no — zero references |

Copies across trees, and what must be removed together: **one copy, `scripts/run-chain-pool.js`,
full stop.** No plugins copy (×1 multiplier confirmed), no dot-tree copy, no installed copy. The
`.kw/worktrees/bundle-956-…` copy is the bundle branch's own checkout — deleting on the branch IS
deleting it there; the main-tree copy goes when the branch lands. Nothing else must move in
lockstep.

Stranded-but-harmless couplings (non-blocking, noted for the orchestrator):

- `simulate-workflow-walkthrough.js:48–51` reads `KAOLA_TEST_TIMEOUT_SCALE`, whose only producer
  is the pool (line 211). The reader is fail-open — `Math.max(1, Number(...) || 1)` — so with the
  producer gone it permanently evaluates to 1, the pre-pool behaviour. Leave the code; its comment
  mentions the "chain pool" and may be reworded if touched, but nothing requires it.
- `test-suite-registration.js:205` comment says "the COST_HINT and ceiling tables were considered
  and left alone" — names a table that will no longer exist. Prose only; optional cleanup.
- History/docs mentions (audit report, archive, CHANGELOG-to-be) are provenance and stay.

## 7. Positive control — the method finds a known-live module

Identical two-part method against the stem `adaptive-schema|adaptiveSchema`:

- Part A (tracked): **538 files with hits**; within `scripts/` alone, 38 of 82 files reference it
  (`kaola-workflow-claim.js` ×30, `kaola-workflow-run-chains.js` ×15, `test-finalize-door.js` ×14,
  `validate-script-sync.js` ×9, …).
- Part B (same per-tree sweep): `scripts/` 38 files-with-hits, `plugins/kaola-workflow` 13,
  `plugins/kaola-workflow-gitlab` 16, `plugins/kaola-workflow-gitea` 16; all six dot-trees 0.

The method returns hundreds of hits for a live module and one hit for this one. The dot-trees'
zero-for-everything is the reason §2 rests their case on the name census and FA9
manifest-exactness rather than on the content grep alone.

---

## DELETION PLAN

Under test custody, one commit, on the bundle branch (worktree
`.kw/worktrees/bundle-956-957-958-959-960-961-962`):

1. **Delete `scripts/run-chain-pool.js`** — the only copy in any tree. No other tree, plugin,
   or installed layout carries one; nothing must be removed elsewhere in lockstep.
2. **`scripts/test-parallel.js`** (tdd-guide custody — test-file surgery):
   - remove line 349 `const pool = require('./run-chain-pool');`
   - remove sections f6–f9 (lines 414–464);
   - trim the section-(f) comment (lines 340–347) to describe only the surviving shard
     assertions;
   - KEEP line 348 (`shardLib` require), sections a–e, and f1–f5 — they test `test-shard-lib`
     (alive via `simulate-workflow-walkthrough.js:12712`) and the parallel runner
     (`npm run test:parallel`), not the pool.
3. **Touch nothing else**: package.json (never referenced the pool), install/uninstall scripts,
   `edition-sync.js`, `kaola-workflow-install-manifest.js`, `validate-script-sync.js`, all
   enumeration guards — all verified unreferencing (§3, §6).
4. Optional prose cleanups in the same commit (not conditions): the stale `COST_HINT` mention in
   `test-suite-registration.js:205`; the "chain pool" wording in
   `simulate-workflow-walkthrough.js:48–51` (leave the fail-open `KAOLA_TEST_TIMEOUT_SCALE`
   reader itself alone — removing it is a behaviour change outside this claim).
5. `CHANGELOG.md` `[Unreleased]` entry (precedent: the #586 parallel-batch retirement was
   changelogged). Roadmap closure removes `kaola-workflow/.roadmap/issue-960.md` per the normal
   flow; `docs/audits/2026-08-11-subtraction-audit.md` and archives are history and stay.
6. Verification after the cut (implementer runs, not this read-only check): the claude fast gate
   plus the full-scope walkthrough — `test-suite-registration.js` (checks A and G) and the
   `--self-test` step are the guards this specific mistake class would trip.

— premise-960 · adversarial premise check · 2026-08-12 · main tree @ 8742f5b8 (clean)
