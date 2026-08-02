# impl-parse — `parsePorcelainPaths` hardened (kernel, ×4)

**Task**: fix the shared porcelain parser so a hazard-named path survives git → parser byte-exactly,
and publish a contract the call-site owners code against.
**Verification tier**: `tests-green` + `smoke-integration` (the end-to-end finalize A/B below).
**Contract**: `kaola-workflow/bundle-904-905-906-907-908-909-910/.cache/parse-contract.md` (published
before implementation; unchanged since — the implementation matches it).

## Files changed (worktree `bundle-904-905-906-907-908-909-910`, uncommitted)

| file | change |
|---|---|
| `scripts/kaola-workflow-adaptive-schema.js` | `parsePorcelainPaths` rewritten **:510**; new `splitNulPaths` **:439**, `unquoteCStyle` **:451**, `renameArrowIndex` **:481**, `isRenameStatus` **:492**; exports **:1679-1680** |
| `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js` | materialized copy |
| `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js` | materialized copy |
| `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js` | materialized copy |

Nothing else touched. No test file written or edited. `run-chains.js`, `claim.js`, `sink-merge.js`
untouched by me (they are dirty from their own owners).

Propagation: `node scripts/edition-sync.js --materialize-kernel --write` → exit 0.
All four copies `shasum -a 256` = `439d6bad2f1e2aec2a0feb6b4623035c57228f808537ac97285702fd6fbccfce`
(was `e525165fbdb33a06670289996ce2b8cb1aae0859ba0336091668bfaec09b96a4` in all four before).

## What the fix is

Three defects in one 15-line function, all measured:

1. **quotes unwrapped, never decoded** → `"n\303\266te.md"` became the 17-char literal
   `n\303\266te.md`. Now C-unquoted properly (octal escapes are UTF-8 **bytes**, so they are
   collected and decoded together; raw UTF-8 inside a quoted field under `core.quotePath=false`
   is preserved, surrogate pairs included).
2. **`.trim()`** ate the trailing space git had quoted *for that very reason*. Removed.
3. **the rename arrow was searched unconditionally**, so an untracked file literally named `a -> b`
   was truncated to `b`. Now only on an `R`/`C` status, and when the source is quoted the arrow is
   located after its closing quote.

Plus the format the callers are converting to: a NUL anywhere in the input selects `-z` parsing,
where a rename is **two records, destination FIRST, no arrow** (measured, see below). Dual-mode is
not politeness — three existing tests I may not edit feed LF fixtures
(`test-claim-hardening.js:2007-2021`, `simulate-workflow-walkthrough.js:12640/12663/12672`), and a
call site whose `-z` lands later must not mis-parse in the meantime.

## Measurements that drove the design (git 2.50.1, darwin)

`git status --porcelain -uall` on a fixture holding `notes.md `, `nöte.md`, `qu"ote.md`,
`back\slash.md`, ` lead.md`, `tab<TAB>here.md`, `plain.md` and a staged rename to `new nöme".md`:

```
LF : R  old-name.md -> "new n\303\266me\".md"    <- source UNquoted, dest quoted, arrow present
     ?? " lead.md"   ?? "notes.md "   ?? "n\303\266te.md"   ?? "qu\"ote.md"   ?? "tab\there.md"
-z : R  new nöme".md \0 old-name.md \0           <- DEST FIRST, source second, NO arrow, verbatim
     ??  lead.md \0 ?? notes.md  \0 ?? nöte.md \0 ?? qu"ote.md \0 ?? tab<TAB>here.md \0
```

- `core.quotePath=false` (**the premise's untested open item — now tested**): stops quoting
  non-ASCII, still quotes `"`, `\`, TAB and leading/trailing space. All four legs pass.
- `git diff --cached --name-only -z` emits **one field per record, no rename arrow, no source** —
  so it needs `splitNulPaths`, NOT `parsePorcelainPaths` (that one would eat 3 chars per path).

## Verification

| # | command | exit | result |
|---|---|---|---|
| 1 | `node accept.js <patched kernel> fxB` | 0 | **96 checks, 0 failures** |
| 2 | `node accept.js <HEAD kernel e525165f> fxNEG` (negative control) | 1 | **70 failures / 16 ok** |
| 3 | `node accept.js` × each of the 3 edition copies | 0,0,0 | ALL PASSED |
| 4 | `node scripts/simulate-workflow-walkthrough.js` (worktree, **full scope**) | 0 | `198/198 scenarios, 0 failed` |
| 5 | same, before the change (main root, kernel `e525165f`) | 0 | `198/198 scenarios, 0 failed` |
| 6 | `node scripts/test-claim-hardening.js` | 0 | 557 assertions passed |
| 7 | `node scripts/test-oracle-kernel.js` | 0 | 48 assertions passed |
| 8 | `node scripts/test-kernel-conformance.js` | **1** | **NOT MINE — see below** |
| 9 | `node scripts/validate-script-sync.js` (right after my materialize) | 0 | 27 byte-identical groups, kernel parity OK |
| 10 | `node scripts/edition-sync.js --check` (same moment) | 0 | 8 ports in parity, kernel parity verified |
| 11 | `node scripts/validate-script-sync.js` (≈40 min later) | **1** | **NOT MINE — `run-chains.js` only** |

Harness (scratchpad, throwaway):
`…/8070a702-…/scratchpad/{mk-fixture.js,accept.js,mutate.sh,e2e.js}`.

### Acceptance detail — the part that actually matters

`accept.js` does not stop at string equality. For every path the parser returns it runs
`git add -- <path>` and asserts git **matched and staged that exact file**, then repeats the
collective `git add -A -- ...paths` that `cmdFinalize` performs (where one bad pathspec aborts the
whole call). Patched: every path matches. HEAD:

```
FAIL git add -- "notes.md"            → fatal: pathspec 'notes.md' did not match any files [exit 128]
FAIL git add -- "n\303\266te.md"      → fatal: pathspec 'n\303\266te.md' did not match any files [exit 128]
FAIL collective `git add -A -- ...`   → fatal: pathspec 'new n\303\266me\".md' did not match … [exit 128]
FAIL collective add staged every returned path, missed [… "plain.md" …]
```

That last line is #907 in one assertion: `plain.md`, an ordinary file, is left unstaged because a
*sibling* path was mangled.

### End-to-end: the false green, fixed — one-axis A/B on the kernel

Both legs use the **same pristine HEAD `scripts/`** (`git archive HEAD scripts`, so no other agent's
in-flight edits are in play; `diff -r` confirms the two trees differ in the kernel file and nothing
else) and the **same fixture, hazard file present in both**: a linked worktree, `src/app.js`
committed, `src/pending-good.js` + `notes.md ` untracked,
`KAOLA_WORKFLOW_OFFLINE=1 node …/kaola-workflow-claim.js finalize --project issue-1 --keep-worktree --json`.

| | LEG A — kernel `e525165f` (HEAD) | LEG B — kernel `439d6bad` (patched) |
|---|---|---|
| exit | 0 | 0 |
| `finalize_commit` | **`nothing_to_commit`** | **`committed`** |
| `git log` | `chore: archive issue-1` only | `chore: finalize issue-1` present |
| post-run status | `?? "notes.md "` + `?? src/pending-good.js` | **clean** |
| `src/pending-good.js` committed? | **NO** | **YES** |
| `status` / `closure_invariants.ok` | `closed` / `true` | `closed` / `true` |

Leg A reproduces the premise appendix exactly. The only variable is the kernel file.

### Mutation proof (scratch mirrors only — no `git checkout --`, the worktree is shared)

Each mutation is applied to a **copy** of the patched kernel under `scratchpad/mut/<name>/`, and
`cmp` first asserts the mutation actually applied (one initially did not, and was re-run rather than
reported as caught):

| mutation | caught? |
|---|---|
| M1 put `.trim()` back | CAUGHT — exit 1, 28 failing checks, first: `returned byte-exactly: "notes.md "` |
| M2 unwrap quotes without decoding (HEAD behaviour) | CAUGHT — exit 1, 24 failing |
| M3 stop consuming the `-z` rename SOURCE record | CAUGHT — exit 1, 11 failing (`got 9` paths, not 8) |
| M4 search the arrow on every status, not just R/C | CAUGHT — exit 1, 9 failing; **both halves pinned**: the `-z` legs *and* `non-rename status: no arrow split` |
| M5 force the LF branch for `-z` input | CAUGHT — exit 1, 27 failing |

## Two reds that are NOT mine, with attribution

- **`test-kernel-conformance.js` exit 1**: `'kaola-workflow-validation-runner.js writeFileSync'` is
  an unledgered non-atomic writer. `git diff -- scripts/kaola-workflow-validation-runner.js` shows
  another agent adding exactly `fs.writeFileSync(keepOutputFile(...,'stdout'), …)` and `'stderr'`.
  My diff adds no `writeFileSync` at all. Their ledger entry, not my defect.
- **`validate-script-sync.js` / `edition-sync --check` exit 1 (later run)**: both name
  `kaola-workflow-run-chains.js` and nothing else — the canonical script is edited while
  `plugins/kaola-workflow/scripts/…` and the two forge ports are not. Zero out-of-sync entries
  mention `adaptive-schema`. Both tools were **exit 0** immediately after my materialize (rows 9-10).

## Premise corrections, loudly

1. **The premise report is right about the defect and its severity** — I reproduced its end-to-end
   false green independently, from pristine HEAD scripts.
2. **"`run-chains.js` — canonical only. No plugin copy exists" is FALSE at HEAD.**
   `plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js` exists (71809 bytes) and is policed
   by `COMMON_SCRIPTS`, and gitlab/gitea carry renamed `kaola-<forge>-workflow-run-chains.js` ports
   policed by `edition-sync`. **Whoever fixes `run-chains.js` owes 3 more copies**, or
   `validate-script-sync` stays red — which is exactly the state the branch is in right now.
3. **"`parsePorcelainPaths` has eight call sites"** — I count **six** invocations
   (`claim.js:626, 3185, 3339, 3793, 4487` + `sink-merge.js:311`) plus two `require`/destructure
   lines, in each of the four editions. Same set the premise lists; the count is of lines, not calls.

## Out of scope, deliberately (stated so nobody waits on it)

- `computeCodeTreeHash` (`ls-tree -r`), `filterVisiblePaths`, `visibleChangedPathsSince`,
  `headAdvanceIsValidationInvisible` in this same file still `split('\n')` + `.trim()`. Converting
  them changes `codeTreeHash` inputs and could stale live receipts — an unforced risk with no
  observed failure. Reason and consequence recorded in §4 of the contract.
- The second half of the compound fault the premise names — `catch (_) {}` at `claim.js:4506`
  swallowing *any* staging failure — is in `claim.js`, which I do not own. My fix removes this
  cause; it does not make the next one audible.
- `CHANGELOG.md` / `docs/api.md` / `docs/decisions/D-579-01.md:99` (which describes the old
  behaviour) are user-visible surfaces this change touches. Not mine to edit under this brief;
  flagging for whoever owns docs and changelog in this bundle.
