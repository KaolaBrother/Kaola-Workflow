# repair-a22-comments — stale A22 strip narration rewritten (test custody)

> Addendum at the end: the ninth `plan-validator` comment site (`test-run-chains.js:726-727`),
> added to scope by the team lead after the A22 work.

Scope: `scripts/test-opencode-edition.js` only, in the worktree
`.kw/worktrees/bundle-956-957-958-959-960-961-962` (branch `workflow/bundle-956-957-958-959-960-961-962`).
Comments and assertion **message strings** only — no `assert(...)` condition was added, removed,
reordered, re-scoped, or changed. Every changed diff line is a `//` comment or a message-string
literal; every `assert(` condition line appears in the diff only as unchanged context.

## Verification

| suite | exit (real, `echo "exit=$?"`) | assertions |
|---|---|---|
| `node scripts/test-opencode-edition.js` (before edit) | 0 | 563 |
| `node scripts/test-opencode-edition.js` (after edit) | 0 | **563** (unchanged) |
| `node scripts/test-kimi-edition.js` (after edit) | 0 | **521** (as expected) |

Both post-edit runs report full drift-check parity (3 opencode trees / 3 kimi trees).

Precondition re-confirmed in the worktree before editing:
`grep -nP 'Path Intent|Codex hooks note|Step 0a-1|KAOLA_ENABLE_ADAPTIVE' scripts/sync-opencode-edition.js scripts/sync-kimi-edition.js`
→ no output, exit 1. The strips are gone from both generators.

## Rewrites (before → after)

### 1. A22 header block (was ~L926–935)

Before:
> A22 (issue #539): opencode path-flip. opencode is adaptive-only-default, so the canonical
> "## Startup Step 0a-1 — Path Intent" section (with its KAOLA_ENABLE_ADAPTIVE switch-resolution
> and Branch A/B path-selection prose) and the adapt repair-loop "downgrade to full path" / "fall
> back to full" auto-fallback wording **are STRIPPED at generation time by transformCommandBody**
> (opencode-only — the transform runs solely inside renderCommand; canonical commands/*.md are
> never touched). **This locks the strip-transform.** Mechanism B (generator-only) avoids
> colliding with #538's in-flight canonical edits.

After:
> A22 (issue #539; strips retired by #962): opencode path-flip. opencode is adaptive-only-default,
> and post-#538 canonical is too: no canonical command carries the "## Startup Step 0a-1 — Path
> Intent" section, its KAOLA_ENABLE_ADAPTIVE switch-resolution or Branch A/B path-selection prose,
> or the adapt repair-loop "downgrade to full path" / "fall back to full" auto-fallback wording.
> The generation-time strips that once removed them matched nothing and are deleted (#962), so a
> canonical reintroduction of any of these patterns would flow through transformCommandBody
> UNTOUCHED and reach the generated opencode surface. These assertions are that canary — they no
> longer lock a strip-transform; they red on canonical drift.

**Mechanism B judgment: dropped.** It explained why the now-deleted strip lived in the generator
rather than canonical — to avoid colliding with #538's then-in-flight canonical edits. #538 landed
long ago and the transform the note justified no longer exists; the #538 reference itself survives
where it is load-bearing (canonical being adaptive-only is why the patterns are absent at the
source). #539 kept; #962 added as the strip-retirement pointer.

### 2. `#F7` leak-canary comment (was ~L949–952)

Before:
> These phrases live ONLY inside the canonical "Path Intent" section body, so their presence in
> the generated tree would mean the section strip missed (e.g. a canonical renumber that broke a
> number-keyed match). **The strip is now keyed to the "Path Intent" TITLE
> (sync-opencode-edition.js), and these catch any regression.**

After:
> These phrases were Path-Intent-section BODY literals — content a heading-keyed check cannot see.
> Today no canonical command carries them (the section itself is gone post-#538) and no strip
> remains to eat a reintroduction, so a hit means path-selection prose re-entered canonical under
> ANY heading and reached the generated surface.

Fact checked before wording it: `grep -rn 'path-name verbal escapes|fast path|full review' commands/`
→ exit 1 (zero hits in all three canonical command sources). "full review" does appear in
`agents/code-reviewer.md:86` / `agents/security-reviewer.md:95` ("the full review process"), but the
canary reads only the generated `workflow-next.md` command, so the comment says "no canonical
**command** carries them", which is exact.

### 3. `#540` inline-residue comment (was ~L944–946)

Before:
> the inline "(Step 0a-1)" residue **survives the Path Intent SECTION strip** — post-#538 the
> "Step 0a-1" step no longer exists, so every literal must be purged from the generated opencode
> command (3 dangling inline mentions at L72/L159/L464 before #540).

After:
> inline "(Step 0a-1)" parentheticals once survived the SECTION strip and needed a dedicated
> inline strip (3 dangling mentions at L72/L159/L464 before #540). Post-#538 the step does not
> exist anywhere in canonical, so that inline strip matched nothing and is deleted with the rest
> (#962); any literal here now means canonical grew one back.

The "purged"/"survives" present-tense claim described the removed `Step 0a-1` inline strip; it is
now history, stated as history.

### 4. L515 DECLARED-transforms list — TWO stale items, not one

Before: `(model-dispatch strip, Path Intent strip, placeholder strip, runtime rewrite, comma collapse)`
After: `(model-dispatch strip, placeholder strip, runtime rewrite, script-path rewrite)`

Verified against `transformCommandBody` (`sync-opencode-edition.js:437-493`) before editing:

- **model-dispatch strip** — LIVE: `rewriteModelDispatchInstructions` + the
  `OPENCODE_MODEL_DISPATCH_BLOCK` section substitution (sync L442–461).
- **placeholder strip** — LIVE: `stripCardModelPlaceholders` (sync L339–341, applied L470).
- **runtime rewrite** — LIVE: `--runtime claude` → `--runtime opencode` (sync L483).
- **Path Intent strip** — GONE (#962). Removed from the list.
- **comma collapse** — **GONE, and this was beyond the brief's assumption**: the only `,{2,}`
  mention left in the sync script is the comment at `sync-opencode-edition.js:336-338` describing
  the *retired unanchored predecessor* of the placeholder strip ("removing the line outright
  leaves nothing to repair"). No collapse regex exists in code. Removed from the list.
- **script-path rewrite** added — LIVE: `rewriteClaudeScriptPaths` (sync L403–408, applied L488) —
  keeping the list "several" and representative of what actually runs. (`Agent(` → `task(` at
  sync L467 also runs but the list was never exhaustive.)

### 5. Assertion messages (5 sites; conditions untouched)

- Section-ban: "(stripped at generation; opencode is adaptive-only-default)" → "(absent from
  canonical, and no generation-time strip remains — a hit means canonical reintroduced it and it
  flowed through untouched; fix canonical)".
- KAOLA_ENABLE_ADAPTIVE: "(Path Intent section stripped)" → "(absent from canonical; no strip
  remains, so a hit is a canonical reintroduction reaching the generated surface — fix canonical)".
- Branch A/B: same rewrite as above.
- Step 0a-1: "(… parentheticals stripped at generation, #540)" → "(post-#538 the step no longer
  exists and no inline strip remains — a hit is a canonical reintroduction reaching the generated
  surface, #540)".
- #F7 canaries: "would leak only if the title-anchored section strip missed" → "a Path-Intent body
  literal absent from canonical; a hit means path-selection prose re-entered canonical and flowed
  through generation untouched".

## File-wide sweep result

`grep -nP 'stripped at generation|strip-transform|STRIPPED|Codex hooks|title-anchored|comma collapse'`
after the edit → one hit, L936, which is my own new sentence ("they no **longer** lock a
strip-transform"). `Codex hooks note` had zero occurrences in this file before or after.
Remaining `transformCommandBody` mentions checked and left alone as still true: L552 (zero
template-region rewrites — true), L707 (generic "an edit could silently strip" — true).

## Found beyond the list (REPORTED, not fixed — different retired mechanism, outside my brief)

The S2 block carries the **same defect class** for a mechanism this bundle did not touch:
`rewriteClaudeModelNouns()` exists nowhere in any sync script (repo-wide grep: only this test
file's comments mention it), and no sync script emits `opus-tier`/`sonnet-tier` markers. Stale
sites, all comments (the assertions beneath them remain valid canonical-drift canaries exactly as
A22's did):

- `scripts/test-opencode-edition.js:761-762` — "#609 added a pure rewriteClaudeModelNouns()
  rewrite (applied in renderAgent + transformCommandBody)" — the function is gone.
- `scripts/test-opencode-edition.js:869-871` — "(b) The three transformCommandBody rewrites emit
  tier labels in dispatch prose … 'opus-tier'/'sonnet-tier' are unambiguous generator leak
  markers" — no rewrite emits them any more.
- `scripts/test-opencode-edition.js:883-884` — "rewriteClaudeModelNouns() (sync-opencode-edition.js)
  is what makes it pass now" — present-tense, names a deleted function.

I did not rewrite these because my brief authorizes fixes only for the three #962-removed strips
and the Codex-hooks note; these belong to a different removal (whenever the model-noun rewrite
died). The kimi test file was not inspected (out of scope) but likely mirrors some of this.

## Diff

Full `git diff scripts/test-opencode-edition.js` (the complete change set — nothing else touched):

```diff
@@ -512,8 +512,8 @@
 // Same reading as the agent loop above: render DETERMINISM, not parity with canonical. Command
-// bodies carry several DECLARED transforms (model-dispatch strip, Path Intent strip, placeholder strip,
-// runtime rewrite, comma collapse), so a blanket line-survival rule of the A6-body kind would be a
+// bodies carry several DECLARED transforms (model-dispatch strip, placeholder strip, runtime
+// rewrite, script-path rewrite), so a blanket line-survival rule of the A6-body kind would be a
 // pin on the current transform set rather than a property.
@@ -924,35 +924,39 @@
 // ---------------------------------------------------------------------------
-// A22 (issue #539): opencode path-flip. opencode is adaptive-only-default, so the
-// canonical "## Startup Step 0a-1 — Path Intent" section (with its
-// KAOLA_ENABLE_ADAPTIVE switch-resolution and Branch A/B path-selection prose) and
+// A22 (issue #539; strips retired by #962): opencode path-flip. opencode is
+// adaptive-only-default, and post-#538 canonical is too: no canonical command
+// carries the "## Startup Step 0a-1 — Path Intent" section, its
+// KAOLA_ENABLE_ADAPTIVE switch-resolution or Branch A/B path-selection prose, or
 // the adapt repair-loop "downgrade to full path" / "fall back to full"
-// auto-fallback wording are STRIPPED at generation time by transformCommandBody
-// (opencode-only — the transform runs solely inside renderCommand; canonical
-// commands/*.md are never touched). This locks the strip-transform. Mechanism B
-// (generator-only) avoids colliding with #538's in-flight canonical edits.
+// auto-fallback wording. The generation-time strips that once removed them
+// matched nothing and are deleted (#962), so a canonical reintroduction of any
+// of these patterns would flow through transformCommandBody UNTOUCHED and reach
+// the generated opencode surface. These assertions are that canary — they no
+// longer lock a strip-transform; they red on canonical drift.
 // ---------------------------------------------------------------------------
 {
   const wfNext = read('.opencode/command/workflow-next.md');
   assert(!wfNext.includes('## Startup Step 0a-1 — Path Intent'),
-    'A22: workflow-next has NO "## Startup Step 0a-1 — Path Intent" section (stripped at generation; opencode is adaptive-only-default)');
+    'A22: workflow-next has NO "## Startup Step 0a-1 — Path Intent" section (absent from canonical, and no generation-time strip remains — a hit means canonical reintroduced it and it flowed through untouched; fix canonical)');
   assert(!wfNext.includes('KAOLA_ENABLE_ADAPTIVE'),
-    'A22: workflow-next has NO KAOLA_ENABLE_ADAPTIVE switch-resolution prose (Path Intent section stripped)');
+    'A22: workflow-next has NO KAOLA_ENABLE_ADAPTIVE switch-resolution prose (absent from canonical; no strip remains, so a hit is a canonical reintroduction reaching the generated surface — fix canonical)');
   assert(!/### Branch [AB]\b/.test(wfNext),
-    'A22: workflow-next has NO Branch A/B path-selection prose (Path Intent section stripped)');
-  // A22 (#540): the inline "(Step 0a-1)" residue survives the Path Intent SECTION strip —
-  // post-#538 the "Step 0a-1" step no longer exists, so every literal must be purged from the
-  // generated opencode command (3 dangling inline mentions at L72/L159/L464 before #540).
+    'A22: workflow-next has NO Branch A/B path-selection prose (absent from canonical; no strip remains, so a hit is a canonical reintroduction reaching the generated surface — fix canonical)');
+  // A22 (#540): inline "(Step 0a-1)" parentheticals once survived the SECTION strip and needed
+  // a dedicated inline strip (3 dangling mentions at L72/L159/L464 before #540). Post-#538 the
+  // step does not exist anywhere in canonical, so that inline strip matched nothing and is
+  // deleted with the rest (#962); any literal here now means canonical grew one back.
   assert(!wfNext.includes('Step 0a-1'),
-    'A22: workflow-next has NO stale "Step 0a-1" inline references (post-#538 the step no longer exists; parentheticals stripped at generation, #540)');
-  // A22 (#F7): content-anchored leak canaries. These phrases live ONLY inside the canonical
-  // "Path Intent" section body, so their presence in the generated tree would mean the section
-  // strip missed (e.g. a canonical renumber that broke a number-keyed match). The strip is now
-  // keyed to the "Path Intent" TITLE (sync-opencode-edition.js), and these catch any regression.
+    'A22: workflow-next has NO "Step 0a-1" inline references (post-#538 the step no longer exists and no inline strip remains — a hit is a canonical reintroduction reaching the generated surface, #540)');
+  // A22 (#F7): content-anchored leak canaries. These phrases were Path-Intent-section BODY
+  // literals — content a heading-keyed check cannot see. Today no canonical command carries
+  // them (the section itself is gone post-#538) and no strip remains to eat a reintroduction,
+  // so a hit means path-selection prose re-entered canonical under ANY heading and reached the
+  // generated surface.
   for (const canary of ['path-name verbal escapes', 'fast path', 'full review']) {
     assert(!wfNext.includes(canary),
-      'A22 (#F7): workflow-next has NO "' + canary + '" — a Path-Intent-section body literal that would leak only if the title-anchored section strip missed');
+      'A22 (#F7): workflow-next has NO "' + canary + '" — a Path-Intent body literal absent from canonical; a hit means path-selection prose re-entered canonical and flowed through generation untouched');
   }
```

---

## Addendum — the ninth `plan-validator` site (`scripts/test-run-chains.js:726-727`)

Scope added by the team lead after the A22 work: rewrite the present-tense "plan-validator
--finalize-check derives" comment above T23c, comment text only.

### Verification of the premise (done before any write)

- `ls scripts/plan-validator.js` → exit 1; tree-wide grep (scripts/, plugins/, templates/,
  commands/, agents/, root *.md, all *.js/*.sh/*.toml/*.json outside docs/ and archives) finds
  `plan-validator` ONLY in: the tombstone set, two past-tense history comments, and docs. The
  script is genuinely gone.
- Tombstone set located and left byte-untouched, as instructed: `scripts/test-finalize-door.js`
  (T1 at L451-461, T5 at L653; header L12/L19), `scripts/validate-workflow-contracts.js:561` (and
  its mirror `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:561`), and the two
  forge contract validators — `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:349`
  and `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:356`.
- Past-tense (correct, untouched): `kaola-workflow-claim.js:2587` ("both since deleted") and
  `:5789` ("the retired plan-validator.js"), plus their plugin-tree mirrors (root plugin, gitlab
  L2301/L6007, gitea L2300/L5998).
- Replacement facts verified in source before wording anything: `evaluateChainReceipt` defined at
  `scripts/kaola-workflow-adaptive-schema.js:1235`, reads `path.join(cacheDir, 'chain-receipt.json')`
  at schema L1260; the finalize transaction calls it in-process at `scripts/kaola-workflow-claim.js:4041`
  with `cacheDir = path.join(authorityDir, '.cache')` — i.e. `kaola-workflow/<project>/.cache/chain-receipt.json`.

### What happened at the edit — honest provenance

I did not author the landed fix. Between my read of the site and my Edit call, the file changed
under me (the edit failed with "file has been modified since read"); on re-read, lines 726-728
already carried a rewrite naming today's reader:

Before (stale, as briefed):
```
  // --plan: path.dirname(path.resolve(cwd, plan)) + /.cache/chain-receipt.json — the EXACT plan-dir
  // plan-validator --finalize-check derives. Use a cwd-relative plan path so resolve uses cwd.
```

Now in the worktree (uncommitted, authored by another hand mid-flight):
```
  // --plan: path.dirname(path.resolve(cwd, plan)) + /.cache/chain-receipt.json — the EXACT project
  // dir the finalize chain-receipt check (`adaptiveSchema.evaluateChainReceipt`) reads the receipt
  // from. Use a cwd-relative plan path so resolve uses cwd.
```

I verified the landed text rather than replacing it: it names today's reader correctly (matches
the schema L1235/L1260 + claim.js L4041 facts above), touches comment lines only, and `git diff
scripts/test-run-chains.js` shows exactly those 2 lines → 3 lines with the T23c `assert(...)`
condition and its message byte-identical. I left it as-is — it is the briefed repair, and
preserving another agent's equivalent edit beats re-wording it.

### Verification

- `grep -n 'plan-validator' scripts/test-run-chains.js` → no output, exit 1. Zero mentions remain
  in the file.
- `node scripts/test-run-chains.js` → **exit=0** (real code via `echo "exit=$?"`), final line
  "run-chains tests passed (283 assertions)". (The two mid-run "chain(s) failed" lines are fixture
  output from negative-path scenarios, printed by the suite when green.)

### Observations reported, not fixed

- `scripts/test-run-chains.js:732` — the T23c MESSAGE still ends "(the validator plan-dir)".
  Excluded from scope by explicit instruction (message strings were off-limits for this site);
  noting it because it is the last "validator" word in the file.
- `scripts/test-finalize-door.js:446-447` — inside the T1 tombstone header: "`claim.js` requires
  it today (parseGoal / …) and `run-chains.js` requires it today (…)". Present-tense and false
  today (nothing requires it — that is what T1 enforces); reads as the door-design-era premise
  narration. Inside the tombstone file I was told not to touch, so untouched — flagged for a
  scope decision.
