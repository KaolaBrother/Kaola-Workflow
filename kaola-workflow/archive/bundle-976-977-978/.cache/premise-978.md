# Premise check — issue #978: three shapes the sink's lane exemption still destroys silently

Measurement record. Investigator role; nothing in any tracked file was modified. All sink
reproductions ran in a scratch clone under the session scratchpad
(`…/scratchpad/repo978`, checked out at `51db5d2d`), never against the real checkout or its
worktrees.

## Setup

- Code read from: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978`
  at `51db5d2d` (clean but for the three untracked `.roadmap/issue-97{6,7,8}.md` sources and the
  ROADMAP mirror edit).
- Scratch clone: `git clone --no-hardlinks` of the main repo, `git checkout 51db5d2d`.
- Toolchain: git 2.50.1 (Apple Git-155), node v24.14.0, macOS (Darwin 25.6.0).
- Filed claim verified against the source text at
  `.kw/worktrees/bundle-976-977-978/kaola-workflow/.roadmap/issue-978.md` — the briefing's
  paraphrase matches the filed wording, including the "residuals rather than regressions"
  concession and the `sink-merge.js:2100-2130` citation.

Current code anchors (line numbers have MOVED from the filed citation; these are the real ones at
`51db5d2d`):

| thing | where |
|---|---|
| `isParkedLanePath` (backslash normalisation at first line of body) | `scripts/kaola-workflow-adaptive-schema.js:410-433` (normalise: `:411` `String(relPath || '').replace(/\\/g, '/')`) |
| `parsePorcelainPaths` (C-quote DECODE to the literal name) | `scripts/kaola-workflow-adaptive-schema.js:379-400`, contract comment `:363-378` |
| `worktreeDirtRecords` | `scripts/kaola-workflow-sink-merge.js:499-510` |
| the `-uall` worktree probe | `scripts/kaola-workflow-sink-merge.js:561` |
| the refusal on non-empty dirt | `scripts/kaola-workflow-sink-merge.js:577-584` |
| `--sink` rescue: stage before removal / land after checkout | `scripts/kaola-workflow-sink-merge.js:2156-2172` / `:2268-2274` (filed as "2100-2130" — drifted) |
| legacy Step 3 removal (no staging) | `scripts/kaola-workflow-sink-merge.js:3217-3230` |
| `removeWorktree` (`git worktree remove --force`, archive-only rescue) | `scripts/kaola-workflow-claim.js:581-633` (force: `:625`, archive rescue `:585-623`) |
| arms (e)(f)(g)(h)(i) | `scripts/test-sink-merge.js:4177-4237 / 4239-4271 / 4273-4306 / 4308-4361 / 4363+` |

The forge sink ports (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js:463-474`,
gitea likewise) carry the same `worktreeDirtRecords` calling the same kernel classifier via
`adaptiveSchema.isParkedLanePath` — so every classifier measurement below replicates across editions.

Harness note: `worktreeDirtRecords` and `assertWorktreeClean` are not exported, so the harness
extracts their source **verbatim from the shipped file** and evaluates it with the real schema
helpers injected — the code under test is the shipped code, not a re-implementation.

---

## SHAPE 1 — backslash filename → CONFIRMED

**Fixture** (`scratchpad/s1`, `scratchpad/s1e2e`): plain files literally named
`kaola-workflow\proj\x.md` (one path component) and `src\util\y.js` (positive control).

**(a) How git reports it.** The guard's probe is the LF porcelain form (no `-z`). Measured output,
byte-exact (`sed -n l`):

```
?? "kaola-workflow\\proj\\x.md"
?? "src\\util\\y.js"
```

git C-quotes the name and doubles each backslash — **identically under `core.quotePath=true` and
`=false`** (measured both; quotePath governs non-ASCII bytes only, backslash and double-quote are
always escaped). Under `-z` the name is verbatim with single backslashes; the guard does not use `-z`.

**(b) What the classifier does with that string.** The quoting does NOT refute the claim, because
`parsePorcelainPaths` deliberately DECODES C-quoting back to the literal on-disk name (documented
contract, schema.js:368-372), and then `isParkedLanePath` normalises `\` → `/`:

```
"?? \"kaola-workflow\\\\proj\\\\x.md\"" => decoded rel: "kaola-workflow\proj\x.md"
                                        => isParkedLanePath(rel, []): true   ← EXEMPT
"?? \"src\\\\util\\\\y.js\""            => decoded rel: "src\util\y.js"
                                        => isParkedLanePath(rel, []): false  ← kept as dirt
worktreeDirtRecords(status) = [ '?? classify.js', '?? "src\\util\\y.js"' ]   ← backslash-lane file dropped
```

**Guard level, real fixture** (real main root + `git worktree add` linked worktree, shipped
`assertWorktreeClean` run over it):

- worktree whose only untracked file is `kaola-workflow\proj\x.md` → **GUARD PASSED** (the sink
  would proceed to `git worktree remove --force`).
- control: add `genuine.txt` → **GUARD REFUSED** (`sink-merge refused: the linked worktree … has
  uncommitted changes`). The probe can see and keep what it should; the exemption is specific to
  the lane-decoding name.

**Rescue does not save it either** (code fact): the `--sink` stage copies only
`<wt>/kaola-workflow/<args.project>/` (sink-merge.js:2163-2167). `kaola-workflow\proj\x.md` is a
single root-level component, not under that directory — nothing stages it.

**Verdict: CONFIRMED**, exactly as filed, on every clause including the normalisation site and the
quoting round-trip. `core.quotePath` does not affect it.

## SHAPE 2 — embedded repository under a lane prefix → CONFIRMED (one correction to the filed example)

**Fixture** (`scratchpad/s2`): main root with the real tree's posture (`.gitignore` tracks `.kw/`),
linked worktree `wt`, and inside it:

- (a) real `git init` repo at `wt/kaola-workflow/nested/` carrying 3 uncommitted files
  (`precious.md`, `deep.txt`, `sub/deeper.txt` — verified `??` from inside the nested repo);
- (b) real repo at `wt/.kw/worktrees/nested2/` with an uncommitted file — the issue's own example;
- (c) positive control: plain directory `wt/kaola-workflow/plain/` with 2 files, no `.git`.

**The probe (`git -C wt status --porcelain -uall`), measured:**

```
?? kaola-workflow/nested/            ← ONE collapsed record; git did not descend
?? kaola-workflow/plain/one.md       ← control: plain dir IS per-file even nested
?? kaola-workflow/plain/sub/two.md
(nothing at all for .kw/worktrees/nested2/)
```

- The collapse is real and is specifically the embedded-repo behaviour (control (c) shows per-file
  records for the same shape without `.git`). The "one record per file" rationale for `-uall` has
  exactly this exception, as filed.
- Classifier: `"kaola-workflow/nested/"` → `isParkedLanePath` **true** (segment `nested`) →
  `worktreeDirtRecords` = `[]` → shipped `assertWorktreeClean` **PASSED**.
- Destruction measured end-to-end: `git worktree remove --force` (the exact `removeWorktree`
  invocation, claim.js:625) → **exit 0, worktree gone, nested repo and all 3 uncommitted files
  destroyed** — including the nested repo's own `.git`, i.e. committed-but-unpushed history goes
  too (the filed "everything uncommitted inside it" understates it).
- Control: an embedded repo at non-lane `vendor/lib/` → collapsed record **kept** as dirt → guard
  **REFUSED**. The hole is lane-prefix-specific.

**Correction to the filed example:** `.kw/worktrees/nested/` is the wrong mechanism against this
repo's tree. `.kw/` is gitignored (tracked `.gitignore`), so a nested repo there produced **no
record at all** — it is the IGNORED population (arm (g)'s territory, invisible to every
`--untracked-files` setting), not a collapsed-and-exempted record. The collapsed-record mechanism
is real where the filed prose derives it: under `kaola-workflow/<segment>/`. Destruction outcome is
identical either way (measured: `nested2` was destroyed by the same removal).

One honest narrowing worth the fixer knowing: under a lane prefix the collapse does not change the
*classification* — plain files under `kaola-workflow/<seg>/` are individually exempt anyway
(control (c): both `plain/` records exempt). What the collapse changes is that an entire foreign
repository can hide behind one exempted segment, and no per-file test can ever see inside it.

**Verdict: CONFIRMED** — mechanism, exemption and destruction all measured; the `.kw/worktrees/`
illustration in the filed text is mis-attributed (ignored population, not collapsed record).

## SHAPE 3 — legacy route destroys the journal the --sink route rescues → CONFIRMED

**The --sink route has the rescue** (read, quoted): merge step stages
`<wt>/kaola-workflow/<args.project>/` to a tmpdir **before** `removeWt`
(sink-merge.js:2156-2172), then lands it after checkout as a per-file union — branch-tracked files
win, worktree-only files (the untracked `.cache/` per-node evidence) always land
(sink-merge.js:2262-2274, `sinkLandStagedUnion`). Whole block `try/catch`-swallowed, own project
only — "best-effort covering only the own project" is accurate as filed.

**The legacy route has no equivalent** (read + swept): Step 3 (sink-merge.js:3217-3230) calls
`removeWorktree` directly; `wtStageDir` appears ONLY inside the --sink merge step (grep: lines
2156/2166/2167/2268/2271/2273 — nothing else); a sweep of the whole legacy region (3130-3316) finds
no `sinkCopyDir` / `sinkLandStagedUnion` / `mkdtemp` / staging of any kind.

**What the legacy route destroys that --sink saves, precisely:** everything under
`<wt>/kaola-workflow/<project>/` that exists only in the worktree — the untracked `.cache/`
per-node evidence, `sink-fallback.json`, the crash-resume journal. The one rescue both routes share
sits inside `removeWorktree` itself (claim.js:585-623) and covers **only**
`<wt>/kaola-workflow/archive/<project>/` — the archive mirror, not the live folder or its `.cache/`.

**Reachability — NOT dead code:** the legacy pipeline is the **default action** of a bare CLI
invocation. `main()` routes to the transaction only when `--sink` is present
(sink-merge.js:3080, 3119-3130); `SINK_USAGE` documents `[--sink]` as an optional flag on a script
whose default action is the destructive merge/close/delete. However, **no shipped surface invokes
it**: the one rendered invocation (commands/kaola-workflow-finalize.md:348, rendered from
templates/routing/slots.js:163 for all three forges) always passes `--sink`. So the legacy route is
reachable exactly by a direct operator invocation that omits the flag — the natural shape of a
by-hand recovery — and by test arm (i), which drives it deliberately. Not a critical dead-code
finding; not nothing either.

**Verdict: CONFIRMED.** Line citation in the filed text (2100-2130) has drifted; real sites above.

## The recorded constraint — arms (f) and (g) → CONFIRMED, including exclusivity

Baseline (scratch clone, untouched): `node scripts/test-sink-merge.js` → exit 0,
"**test suite passed: 942 assertions**" — the filed figure is exact.

**Arm (f), quoted** (test-sink-merge.js:4261-4267; fixture: worktree carrying ONLY
`kaola-workflow/<project>/.cache/{n1-impl.md,n2-review.md,sink-fallback.json}`, premise-asserted
untracked):

```js
assert(result.status === 0 && out && out.status === 'sinked',
  '#973 (f/' + label + '): the run must still complete. Every run leaves untracked lane content in its '
  + 'worktree, so a guard that treats untracked-means-dirty refuses EVERY sink — green in isolation on the '
  + 'destructive arm, and broken in the field. …');
```

**Arm (g), quoted** (test-sink-merge.js:4288-4302; fixture: worktree carrying only gitignored
`node_modules/`+`build/` content, premise-asserted invisible to `-uall`):

```js
const wide = git(fx.wtPath, ['status', '--porcelain', '-uall']).stdout.trim();
assert(wide === '',
  '#973 (g/' + label + ') premise: `status --porcelain -uall` must report NOTHING over ignored-only content '
  + '— ignored is a population NO --untracked-files setting reaches; …');
…
assert(result.status === 0 && out && out.status === 'sinked',
  '#973 (g/' + label + '): the run must still complete over ignored content. Ignored trees are generated and '
  + 'disposable — this repo carries several in every checkout — so a guard that counts them refuses every '
  + 'sink. …');
```

**Mutation A — "a bare widening refuses every sink"** (exemption line
`if (rel && isParkedLanePath(rel, [])) continue;` deleted in all four sink copies — root, codex
plugin, gitlab port, gitea port): suite exit 1, **21 failed / 919 passed**. Failing arms:
**(f) on all four editions**, plus (i-control) ×4, the (i) premise ×4, and #707 h ×9 (the
archived-evidence pins). So (f) breaks exactly as recorded — and it is not even alone; the suite is
over-determined against this mutation.

**Mutation B — reaching into `--ignored`** (`'-uall'` → `'-uall', '--ignored'` in the worktree
probe, all four copies): suite exit 1, **4 failed / 938 passed** — and the four failures are
**exactly arm (g) on the four editions** (`reason:"worktree_dirty"`), nothing else. The filed claim
"nothing else in the 942-assertion suite catches that mutation" is **CONFIRMED by exhaustive run**,
not by argument. (Scope caveat: the claim names only this suite; other suites were not driven
against the mutation.)

The mechanism, for the fixer: an ignored record arrives as `!! path`, and `worktreeDirtRecords`
exempts only records starting `??` — so every ignored path becomes unconditional dirt, and
`.claude/`, `node_modules/`, `.kw/` etc. refuse every real sink. Only (g) stands against that.

## Residuals, not regressions → CONFIRMED

Pre-#973 code read at `e5d96397^` (the guard change landed in `e5d96397`, the bundle-973-974-975
fix commit; its three sink-merge hunks touch only the 473-585 region — probe flag +
`worktreeDirtRecords` — nothing near the rescue or the legacy teardown):

- old worktree probe (old line 520): `git status --porcelain --untracked-files=no` — structurally
  cannot report any untracked path. Positive-control measured on the shape-1 fixture: that flag
  form reports **0 records** over a tree `-uall` reports 3 for. All three shapes' artifacts were
  invisible → guard passed → destroyed with zero report.
- the `--sink` rescue (`wtStageDir`) predates #973: introduced in `f661ca5f` (2026-07-07),
  verified ancestor of `e5d96397^` — so the legacy/-sink asymmetry of shape 3 is unchanged by #973.

All three shapes: destroyed by pre-#973 code, destroyed by current code. Residuals. The filed
framing is accurate.

## Four-edition propagation → CONFIRMED and flagged

`isParkedLanePath` lives in `kaola-workflow-adaptive-schema.js`, and the four copies are
byte-identical — measured in the worktree, one hash for all four
(`shasum -a 256` = `0ac70c1d3fb8ba3ee5f041a65869b89aa549081bd248e727bbd0b607b5d1d241` for
`scripts/…`, `plugins/kaola-workflow/…`, `plugins/kaola-workflow-gitea/…`,
`plugins/kaola-workflow-gitlab/…`). Any fix that touches the classifier mutates the cross-edition
drift anchor: it must go through `--materialize-kernel` to all four trees, and as an
edition-touching diff it owes the **full four-chain run** at finalize (Validation Policy: an
edition-touching diff fails closed to all four). A fix confined to `worktreeDirtRecords` in
sink-merge would instead touch the root script plus three hand-maintained ports — the #973 arms
drive all four editions precisely because those ports are compared by nothing.

## Inferences (labeled, with what would refute them)

1. **Shapes 1 and 2 destroy end-to-end through the real CLI.** Measured links: guard passes
   (shipped guard code over real fixtures); the transaction's only barrier before `removeWt` is
   that guard (code read, 2141-2172 / 3213-3230); `git worktree remove --force` destroys the
   artifacts (measured, exit 0). The full CLI was not driven over a backslash/nested-repo fixture
   end-to-end. Confidence: high. Refuted by: any code between `assertWorktreeClean` and
   `removeWorktree` that preserves untracked non-project lane paths — none exists in the region
   read, and the `--sink` stage covers only `<wt>/kaola-workflow/<args.project>/`.
2. **The fix constraint as filed is the right pair to hold.** Both arms verified live by mutation,
   and mutation A shows extra redundancy ((i-control), #707 h) while mutation B shows (g) is the
   sole tripwire — so the (g) direction is the fragile one for any repair that touches the probe.

## Not measured

- Other suites (walkthrough, claim-hardening, …) against mutation B — the filed exclusivity claim
  is scoped to the 942-assertion suite and was verified there only.
- The main-root preflight seam (`-uall` at sink-merge.js:~1697) against shape-1 names — the filed
  shapes concern the worktree guard; whether a backslash name also slips the preflight's
  foreign-dirt naming was not measured.
- Behaviour on a case-insensitive-only edge (e.g. a lane look-alike differing in case) — out of
  scope for #978.

## Per-shape verdicts

| shape | verdict |
|---|---|
| 1 — backslash filename | **CONFIRMED** (quoting round-trip measured; core.quotePath irrelevant) |
| 2 — embedded repo under lane prefix | **CONFIRMED** — with a correction: the filed `.kw/worktrees/` example is the ignored population, not a collapsed record; the mechanism is real under `kaola-workflow/<seg>/` |
| 3 — legacy route vs --sink rescue | **CONFIRMED** (legacy reachable only by direct no-flag invocation; filed line numbers drifted to 2156-2172/2268-2274) |
| constraint (f)/(g) | **CONFIRMED**, incl. "nothing else catches --ignored" — exhaustive: 4/942 failures, all (g) |
| residual framing | **CONFIRMED** (pre-#973 probe blind to all three; rescue asymmetry predates #973) |
| byte-identity / four-edition consequence | **CONFIRMED** (one hash across four copies; classifier fix ⇒ kernel change ⇒ four-chain run) |

**What a fix must not break** (verified live, not assumed): (f) — an ordinary run's untracked
`kaola-workflow/<project>/.cache/…` must still sink at exit 0 on all four editions; (g) — ignored
content must stay invisible to the guard (no `--ignored`), on all four editions; and any classifier
change lands in the byte-identical kernel, propagates to four trees, and owes the four-chain run.

Scratch artifacts (transcripts, fixtures, logs): `scratchpad/s1`, `s1e2e`, `s2`,
`baseline-sink-suite.log`, `mutA-suite.log`, `mutB-suite.log`, mutation trees `mutA/`, `mutB/`,
pre-#973 extract `pre973-sink.js` — all under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/753f1e81-4413-4c89-9ade-8644be970a42/scratchpad/`.
