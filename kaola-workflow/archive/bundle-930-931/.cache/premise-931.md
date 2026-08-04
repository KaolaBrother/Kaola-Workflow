# Investigation: premise-check of issue #931 (sink archive-collision reporting)

## Setup

- Commit: `68cb48f4a71c1d125d403ed7e251d47d7077b730` (branch `main`, clean except the pre-existing
  untracked `kaola-workflow/bundle-930-931/`).
- Node `v24.14.0`, darwin 25.6.0.
- Repo state after this investigation: **unchanged**. `git status --porcelain` → `?? kaola-workflow/bundle-930-931/`
  only; HEAD still `68cb48f4`. All scratch fixtures deleted.
- Scratch fixtures lived under
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/b816f7ad-.../scratchpad/` and in
  `$TMPDIR/kw931-*`; all removed. (Sibling agent `premise-930`'s files in the same scratchpad were left alone.)

Everything below marked **DRIVEN** was executed; everything marked **READ** was inspected only.

---

## 1. Citation audit — every cited file:line, at HEAD

| # | Issue's citation | Real location at HEAD | Verdict |
|---|---|---|---|
| 1 | `.archived-<ts>` suffix, `claim.js:2518-2519` | `claim.js:2518-2519` (linked-run branch) **and a second, uncited site at `claim.js:2615`** (in-place branch) | **ACCURATE, but incomplete — there are TWO suffix sites** |
| 2 | `deferred_to_sink`, `claim.js:2713-2723` | `classifyArchiveDisposition` spans `claim.js:2713-2724`; `return 'deferred_to_sink'` is at `:2723` | **ACCURATE** |
| 3 | `persistSinkFindingsToSummary`, `sink-merge.js:127-136` | function spans `sink-merge.js:127-148` | **ACCURATE start; the range under-states the body** |
| 4 | "the sink staged only its own destination", `sink-merge.js:2272` | `:2272` is `const archiveDir = path.join(mainRoot, archiveRel);` — **not a staging call**. The staging is `stageArchive()` at `:2407-2418` (`git add` at `:2410`), invoked at `:2421` and `:2442`. The pathspec is `projectPathspec` at `:2273`. `receipt.archived_paths` is set at `:2436`. | **MISCITED** (right region, wrong statement) |
| 5 | `verifyArchiveComplete`, `sink-merge.js:2126-2140` | **`verifyArchiveComplete` is defined in `claim.js:5711`**, not in `sink-merge.js`. `sink-merge.js:2126` is the `archiveProjectDir(...)` call; `:2139-2140` read `archiveResult.missing` / `.mismatched`. | **MISCITED FILE** — the substantive claim ("it asks only about the move it performed") is nevertheless TRUE: `verifyArchiveComplete(src, dest)` at `claim.js:2525` and `verifyArchiveComplete(mainLive, dest)` at `:2577` compare only source↔dest pairs |
| 6 | `removeWorktree` rescue, `claim.js:512-564`, guard at `:519` | exactly `claim.js:512-564`; `:519` is `if (fs.existsSync(wtArchive) && !fs.existsSync(rootArchive)) {` | **ACCURATE, verbatim** |
| 7 | `assertCleanWorktree`, `sink-merge.js:303-313` | exactly `:303-313`; `--untracked-files=no` at `:308` | **ACCURATE, verbatim** |
| 8 | `assertNoLiveWorkflowFolder`, `sink-merge.js:326-353` | exactly `:326-353`; `git cat-file -e` at `:334` against `<branch>:<path>` | **ACCURATE, verbatim** |
| 9 | `writeReceiptAtomic`, `run-chains.js:168-170` | exactly: `:168` `function writeReceiptAtomic(filePath, content) {`, `:169` `const dir = path.dirname(filePath);`, `:170` `fs.mkdirSync(dir, { recursive: true });` | **ACCURATE, verbatim** |

Two more facts the issue did not cite but which matter:

- `finalizeTx.archive_commit = archiveDisposition || (hasStaged ? 'committed' : 'nothing_to_commit')`
  at `claim.js:4798` — so `archive_commit: deferred_to_sink` is indeed the recorded field name.
- **`sink-merge.js:2181-2188` already carries an explicit comment about the collision suffix** and sets
  `receipt.archive_dest = path.relative(mainRoot, archiveResult.dest)` — i.e. the suffixed path is
  deliberately carried through the receipt (#700). The collision is a *known* shape in this code, not
  an unconsidered one.

---

## 2. DRIVEN: the collision reproduces

### 2a. `archiveProjectDir` alone, in-place branch (`claim.js:2615`)

Fixture: a scratch git repo with a live `kaola-workflow/issue-929/` and a pre-existing
`kaola-workflow/archive/issue-929/`.

```
$ node -e 'const {archiveProjectDir}=require(".../kaola-workflow-claim.js");
           console.log(JSON.stringify(archiveProjectDir(process.cwd(),"issue-929","closed",undefined,{}),null,2))'
```

Exit 0. Returned:

```json
{
  "archived": true,
  "dest": ".../kaola-workflow/archive/issue-929.archived-2026-08-03T16-18-44-185Z",
  "roadmap_source_removed": "removed",
  "roadmap_regenerated": "regenerated",
  "roadmap_sources_removed": ["issue-929.md"],
  "roadmap_staged_reconciled": [],
  "roadmap_removed_by_root": { "929": { "worktree": true, "main": true } },
  "roadmap_residue": [],
  "roadmap_regenerated_by_root": { "worktree": "regenerated", "main": "regenerated" }
}
```

**The return value has no field naming the collision.** The only carrier is `dest`, whose *string*
contains `.archived-<ts>`. The pre-existing `archive/issue-929/` was left untouched on disk.

### 2b. The FULL `--sink` transaction, reproducing the incident end-to-end

Fixture mirrored the incident: a bare remote, a feature branch with a real deliverable, a
**complete but UNTRACKED** archive at `kaola-workflow/archive/issue-929/` (7 files: `workflow-state.md`,
`finalization-summary.md`, `mission-list.md`, 4 `.cache/*.md`), and a **RESURRECTED** live folder
`kaola-workflow/issue-929/.cache/chain-receipt.json` (1 file).

```
$ node scripts/kaola-workflow-sink-merge.js --branch workflow/issue-929 --project issue-929 --sink --json
```

**Exit 0.** Envelope:

```json
{"result":"ok","status":"sinked","journal_disposed":true,"receipt":{
  "project":"issue-929","branch":"workflow/issue-929", ...,
  "archived_paths":[
    "kaola-workflow/archive/issue-929.archived-2026-08-03T16-21-41-028Z/.cache/chain-receipt.json",
    "kaola-workflow/archive/issue-929.archived-2026-08-03T16-21-41-028Z/finalization-summary.md"],
  "steps":{"preflight":"done","push_upstream":"done","merge":"done","finalize":"done",
           "stash_restore":"done","archive_commit":"done","push_main":"done","closure":"done"},
  "post_rebase_tests":"skipped",
  "archive_dest":"kaola-workflow/archive/issue-929.archived-2026-08-03T16-21-41-028Z", ...}}
```

Post-sink disk: the complete 7-file archive **remained at the unsuffixed path, still `??` untracked**.
`git ls-tree -r HEAD -- kaola-workflow/` carried only the 2-file suffixed archive plus the roadmap
mirror. `git status --porcelain --untracked-files=no` = `""` (empty). stderr said nothing about a
collision (only `Switched to branch …`).

### 2c. ONE ROUTE CORRECTION the issue's chain omits — measured

My first, literal reproduction of the issue's chain **did not reproduce**: it exited **1** with

```json
{"result":"refuse","reason":"sink_blocked",
 "foreign_dirt":["kaola-workflow/issue-929/.cache/chain-receipt.json"], ...}
```

`sinkPreflight`'s bucket 2 (`sink-merge.js:1623-1628`) exempts exactly four live-folder names —
`workflow-plan.md`, `workflow-state.md`, `workflow-tasks.json`, `.cache/dispatch-log.jsonl` — and a
resurrected `.cache/chain-receipt.json` is not among them, so it falls to bucket 3 and refuses.
(The complete untracked archive is separately exempted by the #893 own-archive-mirror arm at `:1693-1713`.)

So the incident **required the resurrection to land AFTER the preflight read `git status`** — a genuine
race window between preflight and the `finalize` step, not merely "a runner was still executing". I
reproduced 2b by making the resurrected path invisible to that one `git status` (a repo-root-anchored
`.gitignore` rule on the live `.cache/`), which is a different route to the identical end state.

**This matters for a fix:** a resurrection visible at preflight is already caught, loudly, at exit 1.
The unguarded window is narrow and timing-dependent.

---

## 3. What the durable record actually contains — and a PARTIAL REFUTATION

### The real incident's committed bytes (not a fixture)

```
$ git show 02471029 --format="" --name-only
kaola-workflow/archive/issue-929.archived-2026-08-03T14-15-27-770Z/.cache/chain-receipt.json
kaola-workflow/archive/issue-929.archived-2026-08-03T14-15-27-770Z/finalization-summary.md

$ git show 02471029:kaola-workflow/archive/issue-929.archived-2026-08-03T14-15-27-770Z/finalization-summary.md
## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-929.archived-2026-08-03T14-15-27-770Z/.cache/chain-receipt.json
- kaola-workflow/archive/issue-929.archived-2026-08-03T14-15-27-770Z/finalization-summary.md
```

My reproduction produced a byte-shape-identical block (only the timestamp differs).

### The claim, split

The issue says: *"`archived_paths` names only its own destination, so nothing in the durable record
says a collision happened or that the real archive is elsewhere."*

- **"nothing … says a collision happened" — PARTLY REFUTED.** The token `.archived-2026-08-03T14-15-27-770Z`
  appears **three times** in the committed record: once in the summary's own path, twice inside the
  `archived_paths:` list. `.archived-<ts>` is produced at exactly two sites (`claim.js:2519`, `:2615`) and
  **only** on the destination-exists branch — nothing else in the workflow appends it (the discard
  suffix is `.discarded-<ts>`, `claim.js:5004`). So the suffix is a *sound* lexical marker that the
  destination already existed. What is missing is a *statement*: no field, classification, or sentence
  says so, and a reader has to know the token's provenance to decode it.
- **"or that the real archive is elsewhere" — HELD, fully.** Nothing in the committed record names
  `kaola-workflow/archive/issue-929/`, states that it exists, states that it is untracked, or states
  what it holds. Confirmed both in the real commit and in the reproduction.

### Where the record does and does not survive

- `receipt.archive_dest` and `receipt.archived_paths` ride the **stdout envelope** (`sinkEmit` at
  `sink-merge.js:98-102`, success emit at `:2855`).
- They do **not** survive on disk: `disposeSinkJournals` runs at `:2852`, `journal_disposed: true` was
  measured, and the committed tree carried **no `sink-receipt.json`**.
- The only durable carrier is the `archived_paths:` list appended to the committed
  `finalization-summary.md` — plus the archive directory's own name.

---

## 4. Exact shape of the reporting surfaces (for the implementer)

### `receipt.archived_paths`

```js
// sink-merge.js:162-168
function stagedPathsUnder(mainRoot, pathspec, excludes) {
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--name-only', '-z', '--', pathspec, ...(excludes || [])],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean);
  } catch (_) { return []; }
}
```

- **Type: a flat array of strings.** Repo-relative POSIX **file** paths (never directories, never objects).
- Initialised **present-and-empty** at `sink-merge.js:1256` (`archived_paths: []`) — `docs/api.md:847-857`
  makes present-and-empty a contract: *"never absent — a consumer telling 'committed nothing' from 'this
  sink does not report' cannot route on a field that is sometimes missing."*
- Derived from the **index**, between the add and the commit (`sink-merge.js:2436`), scoped to
  `projectPathspec = archiveRel + '/'` — so on a collision **every entry is prefixed with the suffixed
  directory**.
- `-z` split on NUL and nothing else; the comment at `:156-161` records that a `.trim()` here previously
  corrupted a real path. Do not re-introduce trimming.

### The `## Sink Findings` block

```js
// sink-merge.js:127-148
function persistSinkFindingsToSummary(destDir, postRebaseTests) {
  if (!destDir) return null;
  if (!sinkFindings.length && !postRebaseTests) return null;
  try {
    const p = path.join(destDir, 'finalization-summary.md');
    let s = '';
    try { s = fs.readFileSync(p, 'utf8'); } catch (_) { /* create-if-absent */ }
    if (/^## Sink Findings$/m.test(s)) return null; // idempotent across a crash-resumed re-entry
    const lines = ['## Sink Findings', ''];
    if (postRebaseTests) lines.push('post_rebase_tests: ' + postRebaseTests, '');
    for (const f of sinkFindings) {
      lines.push('classification: ' + f.classification);
      for (const d of f.detail || []) lines.push('', d);
      if (f.operator_hint) lines.push('', f.operator_hint);
      lines.push('');
    }
    const block = lines.join('\n').trimEnd() + '\n';
    fs.mkdirSync(destDir, { recursive: true });
    adaptiveSchema.writeFileAtomicReplace(p, s ? (s.trimEnd() + '\n\n' + block) : block);
    return p;
  } catch (_) { return null; }
}
```

```js
// sink-merge.js:185-200
function persistArchivedPathsToSummary(destDir, archivedPaths) {
  if (!destDir || !archivedPaths || !archivedPaths.length) return false;
  try {
    const p = path.join(destDir, 'finalization-summary.md');
    let s = '';
    try { s = fs.readFileSync(p, 'utf8'); } catch (_) { return false; } // absent → never fabricate one
    if (/^archived_paths:$/m.test(s)) return false; // idempotent across a crash-resumed re-entry
    const lines = [];
    if (!/^## Sink Findings$/m.test(s)) lines.push('## Sink Findings', '');
    lines.push('archived_paths:');
    for (const rel of archivedPaths) lines.push('- ' + rel);
    const block = lines.join('\n').trimEnd() + '\n';
    adaptiveSchema.writeFileAtomicReplace(p, s.trimEnd() + '\n\n' + block);
    return true;
  } catch (_) { return false; }
}
```

Finding objects come from `recordSinkFinding` (`sink-merge.js:83-92`):

```js
const finding = Object.assign({
  classification,
  detail: Array.isArray(detail) ? detail : [String(detail)],
  operator_hint: operatorHint
}, payload || {});
```

**DRIVEN — the fully rendered block with a finding present** (produced by loading a patched in-memory
copy of the module that only widened `module.exports`; no repo file was modified):

```
# Finalization Summary

## Validation

green: true

## Sink Findings

post_rebase_tests: green

classification: run_not_finalized

detail line one.

detail line two.

operator hint sentence.

archived_paths:
- kaola-workflow/archive/issue-929.archived-2026-01-01T00-00-00-000Z/finalization-summary.md
- kaola-workflow/archive/issue-929.archived-2026-01-01T00-00-00-000Z/.cache/x.md
```

Note the ordering: `post_rebase_tests` → findings → `archived_paths:`, because the two writers run at
different moments (`:2241` at the finalize step, `:2441` at archive_commit).

### Every consumer that PARSES either surface

**Programmatic consumers of `archived_paths` — none in production code.** Nothing in `scripts/`,
`plugins/`, `templates/`, `.claude/`, `.opencode/`, `.kimi/` or `.codex/` reads it back; the only
producers are the two writers above. Consumers are all tests plus prose:

| Consumer | What it asserts | Fragile to an added line? |
|---|---|---|
| `scripts/test-sink-merge.js:1455-1465` | `Array.isArray(reported)`; `reported.includes(<rel>)` | No |
| `scripts/test-sink-merge.js:1471` | committed summary `.includes(strayRel)` | No |
| `scripts/test-sink-merge.js:1500-1505` | `Array.isArray`; `!includes(sibling)` | No |
| `scripts/test-sink-merge.js:1542-1546` | present-and-EMPTY when nothing committed | No |
| `scripts/test-sink-merge.js:1882-1885` | every evidence file named | No |
| `scripts/test-sink-merge.js:2132-2133` | `want.every(p => named.includes(p))` | No |
| `scripts/test-sink-merge.js:2798-2801` | `/^## Sink Findings$/m`, `/^post_rebase_tests: green$/m` | No |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js:2009-2012, 2180-2182` | same includes-shape | No |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js:~1960` | same | No |
| `docs/api.md:847-864` | prose contract (array, present-and-empty, index-derived, report-not-guard) | **Must be updated by a fix** |

Every assertion is `includes` / `Array.isArray` / anchored-line regex. **A purely additive line or
field breaks none of them.**

### THE ONE TEST A COLLISION REPORT WILL BREAK

`scripts/test-sink-merge.js:414` `testCollisionSuffixedArchiveCommittedAndDisposed` — the **first**
test in the file — builds `buildSoleArchiverFixture`, which at `:250-251` plants and at `:257` **commits**
a pre-existing `kaola-workflow/archive/<project>/`. That fixture **is a collision**, and the test
asserts at `:439` that `receipt.archive_dest` is suffixed. It then asserts:

```js
assert(out && !('findings' in out),
  '#700 c: a sink that found nothing must not carry a findings key at all; ...');
assert(!/sink-merge: FINDING/.test(result.stderr || ''),
  '#700 c: a sink that found nothing must write no FINDING line to stderr; ...');
```

**A fix that routes the collision through `recordSinkFinding` turns this green test red at both
lines.** That is the single most important constraint for the implementer. Note also the *shape*
difference the fixture exposes: its prior archive is **tracked/committed** (no evidence at risk),
whereas the incident's was **untracked** (the whole loss). An unconditional "collision" report cannot
tell them apart; a report keyed on the prior directory's *tracked-ness* can.

### A second landmine: `closure-audit`'s citation scanner

`archiveCitedMissing` (`closure-audit.js:341-359`) scans the archived summary with
`/(?:^|[\s`(|])(\.cache\/[A-Za-z0-9._/-]*[A-Za-z0-9])/g` and reports any cited `.cache/…` file the
archive does not hold, as `archive_summary_citation_missing`.

**DRIVEN** on the post-collision fixture:

| Appended line | `archive_summary_citation_missing` |
|---|---|
| *(control: nothing appended)* | key absent (omit-when-empty) |
| `collision: kaola-workflow/archive/issue-929/ already existed; …` | not flagged |
| `also cited: .cache/does-not-exist.md` | **flagged**: `[{"project":"issue-929.archived-…","cited_missing":[".cache/does-not-exist.md"]}]` |

So: write **repo-relative** paths (`kaola-workflow/archive/<project>/`) into the block. A
**bare-relative `.cache/…`** token naming something in the *other* archive would manufacture a false
`archive_summary_citation_missing` finding.

### Other readers of `finalization-summary.md` (do not parse these two surfaces, but touch the file)

`claim.js:2474` (#324 sentinel rewrite, pre-archive), `claim.js:3826` `appendSummarySection` (writes
`## Validation` / `## Changed Paths`), `sink-pr.js:161/247`, `gap-sweep.js:537`,
`closure-audit.js:343`, and `adaptive-schema.js:772` (name registry).

---

## 5. REFUTED: `archiveRequiredContent` is NOT uninvoked

The issue claims *"nothing invokes it (no caller in `scripts/` or the command surfaces)"*. **False.**

Whole-tree search, dot-directories (`.claude`, `.opencode`, `.kimi`, `.codex`) named explicitly to
defeat ugrep's dot-dir skipping:

- **`scripts/kaola-workflow-closure-audit.js:317`** — `const missing = archiveRequiredContent(path.join(archiveBase, entry.name));`
  inside `detectArchiveContentIncomplete` (`:309-321`), which is called at **`:503`** on the audit's main
  path and exported at `:742`.
- `archiveRequiredContent` is itself exported at `:743`.
- Same call chain in all four copies: `plugins/kaola-workflow/scripts/…:317`,
  `plugins/kaola-workflow-gitlab/scripts/…:310`, `plugins/kaola-workflow-gitea/scripts/…:309`.
- Pinned by tests: `scripts/simulate-workflow-walkthrough.js:7952-7954`,
  `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js:3685-3686`,
  `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js:3438-3439`.
- The script is reachable from the command surfaces: `.opencode/command/kaola-workflow-finalize.md:392`,
  `.kimi/skills/kaola-workflow-finalize/SKILL.md:386`, plus the plugin finalize SKILLs/commands.

**DRIVEN — and it fires on the real incident.** Cloned the repo to scratch, checked out `02471029`
(the actual post-sink commit), ran the audit offline:

```
$ KAOLA_WORKFLOW_OFFLINE=1 node scripts/kaola-workflow-closure-audit.js
"archive_content_incomplete": [
  { "project": "issue-929.archived-2026-08-03T14-15-27-770Z", "missing": ["workflow-state.md"] }
]
counts.archive_content_incomplete: 1     ← the only finding in that class
```

Same on my reproduction fixture.

**Control that bounds the claim.** I planted a `workflow-state.md` into the suffixed archive and re-ran:

```
archive_content_incomplete: []
counts.archive_content_incomplete: 0
```

So closure-audit detects **"this archive has no `workflow-state.md`"**, not **"a collision happened"**.
It caught the 2026-08-03 incident only because the resurrected source held one file. A collision whose
source happened to carry a state file is invisible to it. It is an incidental detector, not a collision
detector — but the issue's factual claim that the function is uninvoked is simply wrong.

---

## 6. Edition surface — the fix lands in FOUR files

SHA-256 (first 16 hex) + line counts, measured:

| File | sha256[0:16] | lines |
|---|---|---|
| `scripts/kaola-workflow-sink-merge.js` | `243d34956ea05430` | 3098 |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | `243d34956ea05430` | 3098 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `c35bea128d0b3d30` | 2524 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `115d18159d780440` | 2518 |
| `scripts/kaola-workflow-claim.js` | `d650eb2915e4665b` | 6426 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `d650eb2915e4665b` | 6426 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `64dafa022b9d7cdd` | 6103 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `e0190e688ba4cd28` | 6095 |
| `scripts/kaola-workflow-closure-audit.js` | `74b9059f89ddddd2` | 756 |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | `74b9059f89ddddd2` | 756 |

- Canonical `scripts/` and the **codex** copy under `plugins/kaola-workflow/scripts/` are **byte-identical**
  for all three scripts — they must stay so.
- **gitlab** and **gitea** are hand-ported and diverge (different line counts). Their suffix sites:
  gitlab `claim.js:2253` and `:2347`; gitea `claim.js:2252` and `:2346`; the codex copy `:2519` and `:2615`.
- `.opencode/` and `.kimi/` ship **no script copies** (`ls -a` shows only `agent`/`command`/`hooks`/`skills`/
  `plugins` — no `scripts/`), so they are unaffected except for any prose surface.

So a code fix touches **4 copies** of whichever script it lands in (canonical + codex byte-identical,
plus two hand-ports), not one.

---

## 7. Attempts to REFUTE "nothing in the record reveals it" — two real detectors found, both partial

| Probe | Result | Verdict |
|---|---|---|
| The `.archived-<ts>` token in `archive_dest` + every `archived_paths` entry + the archive dir name | present, and uniquely produced by the destination-exists branch | **PARTIAL REFUTATION** — the *fact* is lexically encoded; no *statement* exists |
| `closure-audit` `archive_content_incomplete` | **fires** on the real commit `02471029`; vanishes when a `workflow-state.md` is added | **PARTIAL REFUTATION** — real, out-of-band, and shape-dependent |
| **The NEXT sink for a DIFFERENT project** — DRIVEN | `{"result":"refuse","reason":"sink_blocked","foreign_dirt":[7 paths under kaola-workflow/archive/issue-929/],...}` exit 1 | **PARTIAL REFUTATION** — the leftover is not silent forever; it blocks the next sink loudly and names all 7 files. But it is exempted for a **re-sink of the same project** (`sink-merge.js:1693`), and it would not fire if the archive band were gitignored |
| `node kaola-workflow-claim.js status` — DRIVEN | `{"active":[],"drift":[],"count":0}` | silent |
| `node kaola-workflow-claim.js verify-sink --project issue-929` — DRIVEN | `{"ok":true,"checks":{"active_folder":"gone","archive_folder":"present","worktree":"absent","branch":"absent",...},"reasons":[]}` exit 0 | silent — **reports `ok: true` over the split archive** |
| Sink stderr on the collision run — DRIVEN | only `Switched to branch …`; no FINDING, no WARNING, no NOTE | silent |
| `git status --porcelain --untracked-files=no` after the sink — DRIVEN | `""` | silent (this is what `assertCleanWorktree` reads) |
| Sink receipt on disk after success — DRIVEN | `journal_disposed: true`; no `sink-receipt.json` at HEAD or on disk | not durable |
| `git status --porcelain -uall` after the sink — DRIVEN | 7 `??` lines naming the abandoned archive | visible to a human who looks; nothing in the workflow reads it |

**Net:** the issue's headline is over-stated but its operational point stands. The *committed record*
lexically encodes that the destination already existed and encodes nothing about the abandoned archive.
Two mechanisms do surface the residue after the fact — `closure-audit` (shape-dependent) and the next
foreign-project sink (project-dependent) — and both are out-of-band, neither names the collision, and
the sink's own success envelope + `verify-sink` both report clean.

---

## Corpus context (READ, from this repo's own archive band)

Nine collision-suffixed archives exist at HEAD — the shape is not exotic:

```
bundle-429-434.archived-2026-06-13T08-52-23-135Z   state:YES  unsuffixed sibling: ABSENT
issue-500.archived-2026-06-16T11-10-56-036Z        state:YES  unsuffixed sibling: present
issue-687.archived-2026-07-15T08-45-20-543Z        state:YES  unsuffixed sibling: ABSENT
issue-725.archived-2026-07-19T17-20-09-384Z        state:YES  unsuffixed sibling: present
issue-725.archived-2026-07-20T01-46-03-111Z        state:YES  unsuffixed sibling: present
issue-725.archived-2026-07-20T09-56-36-902Z        state:YES  unsuffixed sibling: present
issue-725.archived-2026-07-20T13-41-53-674Z        state:YES  unsuffixed sibling: present
issue-796.archived-2026-07-25T10-00-15-000Z        state:YES  unsuffixed sibling: ABSENT
issue-929.archived-2026-08-03T14-15-27-770Z        state:YES  unsuffixed sibling: ABSENT
```

(issue-929's now carries a state file because commit `4000cd82` hand-consolidated it; at `02471029` it
did not, which is why the audit fired there.) Five of nine still sit beside an unsuffixed sibling.

---

## Green baseline for the implementer

```
$ node scripts/test-sink-merge.js
...
Sink-merge (#694/#700/#705/#707/#715/#746/#832/#893/#923) test suite passed: 648 assertions.
EXIT=0
```

62 tests; `testCollisionSuffixedArchiveCommittedAndDisposed` is **test #1**.

---

## Summary of premise verdicts

| Issue claim | Verdict |
|---|---|
| A destination collision appends `.archived-<ts>` and commits THAT directory | **HELD** — driven, twice |
| The complete archive remains on disk, untracked, at the unsuffixed name | **HELD** — driven, and true of the real incident |
| Sink reports `status: sinked` at exit 0 | **HELD** — driven |
| `archived_paths` names only its own destination | **HELD** literally — driven |
| "nothing in the durable record says a collision happened" | **PARTLY REFUTED** — the `.archived-<ts>` token is in the committed record 3× and is uniquely produced by the collision branch; what is absent is a *statement*, not the *fact* |
| "nothing says the real archive is elsewhere" | **HELD** — nothing names, or hints at, the unsuffixed path |
| `verifyArchiveComplete` asks only about the move it performed | **HELD** (cited to the wrong file — it is `claim.js:5711`) |
| `removeWorktree` rescue is guarded by `!fs.existsSync(rootArchive)` and `rootArchive` did exist | **HELD** — verbatim at `claim.js:519` |
| `assertCleanWorktree` uses `--untracked-files=no` | **HELD** — verbatim at `sink-merge.js:308` |
| `assertNoLiveWorkflowFolder` asks the branch tip, not the disk | **HELD** — verbatim at `sink-merge.js:334` |
| `writeReceiptAtomic`'s `mkdirSync` resurrects the folder | **HELD** — verbatim at `run-chains.js:168-170` |
| Root-cause step (1)+(3): a still-running runner resurrected the live `.cache/` | **HELD but INCOMPLETE** — the resurrection must also have landed *after* preflight, or `sinkPreflight` bucket 3 would have refused at exit 1 (driven) |
| `closure-audit`'s `archiveRequiredContent` is uninvoked | **REFUTED** — invoked at `closure-audit.js:317`, reached from `:503`, exported at `:743`, pinned by three test suites, and it **actually fired** on the real incident commit |
| "The reporting surface already exists" | **HELD** — both writers exist and both are additive-safe against every current parser |

## Open (not measured, and why)

- Whether the exact real-world interleaving was preflight→resurrection→finalize, versus some other
  ordering, cannot be settled from the artifacts: the sink's stderr from 2026-08-03 was not captured
  and the journal was disposed. The `sinkPreflight` refusal I drove proves only that *some* ordering
  other than the issue's plain reading must have obtained.
- I did not run the gitlab/gitea sink suites (`glab`/`tea` are absent on this box), so the ports'
  behaviour under collision is **read, not driven**. Their suffix logic is textually identical.
- I did not run the full walkthrough (`simulate-workflow-walkthrough.js`) — out of scope for a premise
  check, and `test-sink-merge.js` is the suite that owns this surface.
