# impl-guards — re-anchor the guards, close the kimi coverage gap

**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949` (branch `workflow/issue-949`)
**Baseline:** `a348ff5c683845c212d15bdcac1740c640809f9b`, plus the four implementers' uncommitted
production changes already in the working tree. Every run below is against that tree.

**Write set actually touched — 6 files, all test/guard paths. No production file was edited.**

---

## A. Re-anchored guards

### The RED baseline I started from (verbatim, real exit codes)

```
EXIT=1 :: scripts/validate-workflow-contracts.js
Error: commands/kaola-workflow-finalize.md must include: ## Agent Model Badge
    at assert (…/scripts/validate-workflow-contracts.js:18:25)

EXIT=1 :: plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
Error: plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md must include: ## Agent Model Badge
    at assert (…/validate-kaola-workflow-gitlab-contracts.js:19:25)

EXIT=1 :: plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
Error: plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md must include: ## Agent Model Badge
    at assert (…/validate-kaola-workflow-gitea-contracts.js:19:25)

EXIT=0 :: scripts/validate-kaola-workflow-contracts.js   (codex — carries no anchor, as briefed)

OPENCODE EXIT=1
FAIL: S2: at least ONE canonical command carries `## Agent Model Badge` (found 0 of 3) — with none, every per-file check below ranges over an empty expectation and this guard reports green by having had nothing to read
FAIL: S2[kaola-workflow-finalize.md]: NO effort block — its canonical source carries no `## Agent Model Badge`, so the generator had nothing to substitute here; a block present anyway is stale output
opencode-edition test FAILED: 2 failure(s), 561 passed.

KIMI EXIT=0 — kimi-edition test passed (516 assertions).   ← the gap
```

### Anchors changed, with post-edit `file:line`

A **fourth** validator carried the anchor — the brief said to verify rather than assume. Measured:
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` **does** carry it (it is a
byte-identical copy of the root one, sha `9ce6c373…` pre-edit / `17402bbd…` post-edit — both edited
identically and re-verified equal). `scripts/validate-kaola-workflow-contracts.js` (codex) carries
none: confirmed by `git grep -ni badge` and by its exit 0 on the RED baseline.

| file:line | before | after |
|---|---|---|
| `scripts/validate-workflow-contracts.js:179` | `assertIncludes(file, '## Agent Model Badge')` | `assertIncludes(file, '## Agent Model Dispatch')` |
| `scripts/validate-workflow-contracts.js:187` | `assertNotIncludes(file, 'Agent Model Badge Contract')` | `assertNotIncludes(file, 'Agent Model Badge')` |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:179` | same | same |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:187` | same | same |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:204` | `'## Agent Model Badge'` | `'## Agent Model Dispatch'` |
| `plugins/kaola-workflow-gitlab/…:212` | `'Agent Model Badge Contract'` | `'Agent Model Badge'` |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:203` | `'## Agent Model Badge'` | `'## Agent Model Dispatch'` |
| `plugins/kaola-workflow-gitea/…:211` | `'Agent Model Badge Contract'` | `'Agent Model Badge'` |
| `scripts/test-opencode-edition.js:821` | `/^##\s+Agent Model Badge\s*$/m` | `/^##\s+Agent Model Dispatch\s*$/m` |
| `scripts/test-opencode-edition.js:824` | S2 count message | new heading in message |
| `scripts/test-opencode-edition.js:839` | S2[file] positive-branch message | new heading in message |
| `scripts/test-opencode-edition.js:845` | S2[file] negative-branch message | new heading in message |

**The second opencode assertion the brief asked me to find** is at `:845` — the `else` branch of the
same `if`. Both branches route through one helper, renamed `canonCarriesBadge` → `canonCarriesSection`
(`:820`), so a single re-anchor fixed both failures.

**One judgment call, flagged.** The negative pin was `'Agent Model Badge Contract'`, a wording that
can no longer appear at all. I re-pointed it to the **short** form `'Agent Model Badge'`, which
strictly subsumes the old string and makes the pin live against a half-applied revert of this
rename. Measured safe: `grep -i badge` over `commands/` + `plugins/*/commands/` + `templates/`
returns nothing (exit 1), so it cannot false-red. Each site carries a four-line comment stating why.

### Identifier/comment de-badging inside the two test files

Not anchors, but they named symbols that no longer exist or a heading that is no longer canonical,
which would leave the block's own prose contradicting its code:

- `scripts/test-opencode-edition.js:387` — comment named `assertNoBadgeResidue`; production renamed
  it to `assertNoModelDispatchResidue`.
- `scripts/test-opencode-edition.js:757` — `OPENCODE_BADGE_BLOCK` → `OPENCODE_MODEL_DISPATCH_BLOCK`.
- `scripts/test-opencode-edition.js:515`, `:765`, `:881` — "badge strip"/"badge section" prose.
- `scripts/test-opencode-edition.js:784/786/795/799/830` — local `BADGE_HEADING`/`badgeSection` →
  `BLOCK_HEADING`/`blockSection`. (This constant is the **opencode** block heading `Model and effort
  are inherited`, which production did *not* change — renamed only for vocabulary consistency.)
- `scripts/test-kimi-edition.js:297`, `:324-333` — "badge strip", "model badge".

Post-edit sweep for case-insensitive `badge` across the whole write set returns only the four
deliberate `'Agent Model Badge'` forbidden-string pins and their explanatory comments.

---

## B. The new kimi assertion — `K2-anchor`, `scripts/test-kimi-edition.js:335-392`

Placed directly after the K2 paragraph that records the missing positive half (that paragraph was
amended at `:324-333` to scope its "no carrier left" claim to the prose-rewrite path and to point at
K2-anchor for the carrier that does exist).

```js
// ---------------------------------------------------------------------------
// K2-anchor: the canonical section this edition answers must still EXIST. (The kimi twin of
// test-opencode-edition.js's S2 carrier count.)
//
// `transformCommandBody` strips the canonical `## Agent Model Dispatch` section and leaves
// KIMI_MODEL_DISPATCH_GUIDANCE in its place. That one line is the whole kimi-side statement of a
// fact canonical cannot state — this runtime has no per-dispatch model override — and every other
// check in this file reads the GENERATED tree, where deleting the canonical section deletes the
// section, the strip, the guidance and the expectation together. Measured: with the section
// removed from the skeleton, this suite stayed green at 516 assertions and said nothing, while the
// opencode twin went red. The count assertion below is the missing red.
//
// WHICH commands must carry it is DERIVED from canonical, never hand-listed — a typed carrier list
// is a second place for that truth to live, and the copy that stops being true without saying so.
// The heading is a LITERAL here rather than the generator's exported MODEL_DISPATCH_HEADING:
// sourcing the expectation from the subject's own constant would make this agree with the
// generator by construction, and it could then no longer witness generator and canonical
// disagreeing.
//
// The per-file half is ONE-DIRECTIONAL on purpose. A carrier's Skill must show the guidance and
// must not show the canonical heading. The converse — a NON-carrier must not show the guidance —
// is deliberately not asserted: the same literal is also this edition's answer to a standalone
// `model=` instruction anywhere in a body, so a canonical edit that legitimately added one
// elsewhere would fail a biconditional for being correct.
// ---------------------------------------------------------------------------
{
  const CANON_SECTION = /^##\s+Agent Model Dispatch\s*$/m;
  // The presence check below is `includes(GUIDANCE)`, which an empty or missing constant would
  // make true of every file — a green that means the constant vanished, not that the strip fired.
  const GUIDANCE = sync.KIMI_MODEL_DISPATCH_GUIDANCE;
  assert(typeof GUIDANCE === 'string' && GUIDANCE.trim().length > 20,
    'K2-anchor: sync.KIMI_MODEL_DISPATCH_GUIDANCE is a non-trivial string — got '
      + JSON.stringify(GUIDANCE));

  const canonCarriesSection = file =>
    CANON_SECTION.test(fs.readFileSync(sync.canonCommandPath(file), 'utf8'));
  const sectionCarriers = canonCommands.filter(canonCarriesSection);
  assert(sectionCarriers.length > 0,
    'K2-anchor: at least ONE canonical command carries `## Agent Model Dispatch` (found '
      + sectionCarriers.length + ' of ' + canonCommands.length + ') — with none, every per-file '
      + 'check below ranges over an empty expectation and this guard reports green by having had '
      + 'nothing to read');

  for (const file of sectionCarriers) {
    const rel = skillDir(file.slice(0, -3));
    assert(exists(rel), 'K2-anchor[' + file + ']: generated Skill exists at ' + rel);
    if (!exists(rel)) continue;
    const content = read(rel);
    assert(content.includes(GUIDANCE),
      'K2-anchor[' + file + ']: ' + rel + ' carries the inherit-model guidance the strip leaves '
        + 'behind — its canonical source carries `## Agent Model Dispatch`, so the strip fired here '
        + 'and this line is the only thing telling a Kimi reader there is no model= to pass');
    assert(!CANON_SECTION.test(content),
      'K2-anchor[' + file + ']: ' + rel + ' does NOT carry the canonical `## Agent Model Dispatch` '
        + 'heading — kimi drops the heading with the section, so a surviving one means the strip '
        + 'never fired and the surface ships Claude-shaped prose about a model= this runtime has no '
        + 'parameter for');
  }
}
```

**Assertion delta = +5**, fully accounted: 1 (guidance constant non-trivial) + 1 (carrier count) +
3 per carrier × 1 carrier (`kaola-workflow-finalize.md` is the only canonical command carrying the
section — measured; `workflow-init.md` and `workflow-next.md` carry no `model=` at all).

Two shape decisions, both deliberate and stated in the comment:

- It does **not** import opencode's block-locator shape. Kimi emits no heading — it drops the
  heading with the section and leaves one guidance line — so the kimi observable is the guidance
  line's presence plus the canonical heading's absence.
- The `else` branch (non-carrier must not show the guidance) is **not** asserted, because the same
  literal is also this edition's answer to a standalone prose `model=` anywhere in a body. A
  biconditional would false-red on a legitimate canonical edit.

---

## C. Mutation proof — the new kimi assertion is armed

Scratch mirror at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad/impl-guards/`
(full `tar` copy of the worktree including the gitignored `.kimi*`/`.opencode*` trees, `.git`
excluded, then a fresh `git init` + commit `8a651ba`). **No tracked file in the worktree was ever
edited in place and no `git checkout --` was used on the worktree.**

**Positive control (unmutated mirror):** kimi EXIT=0, 521 assertions · opencode EXIT=0, 563
assertions. The mirror is sound.

**Mutation:** deleted the whole `<!-- REGION:command -->` … `<!-- /REGION -->` block (skeleton lines
42–51, heading + body) from `templates/routing/finalize.skeleton.md` in the mirror, then
`generate-routing-surfaces.js --write` (EXIT=0, "rendered 18 surfaces"; heading gone from all three
rendered `kaola-workflow-finalize.md`), then `sync-kimi-edition.js --write` and
`sync-opencode-edition.js --write` for all three forges (all EXIT=0 — confirming the production
near-miss guard is correctly silent on a *wholesale deletion*, which is exactly why this suite-level
assertion is needed).

```
###### MUTATED KIMI EXIT=1
FAIL: K2-anchor: at least ONE canonical command carries `## Agent Model Dispatch` (found 0 of 3) — with none, every per-file check below ranges over an empty expectation and this guard reports green by having had nothing to read
kimi-edition test FAILED: 1 failure(s), 517 passed. [drift-check: 3 tree(s) in parity (.kimi, .kimi-gitlab, .kimi-gitea)]

###### MUTATED OPENCODE EXIT=1
FAIL: S2: at least ONE canonical command carries `## Agent Model Dispatch` (found 0 of 3) — with none, every per-file check below ranges over an empty expectation and this guard reports green by having had nothing to read
opencode-edition test FAILED: 1 failure(s), 560 passed. [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]
```

Kimi 521 → 1 fail + 517 pass = 518 total: the 3 per-carrier assertions correctly stop running when
there are 0 carriers, and the count assertion flips pass → fail. The re-anchored opencode S2 still
reds under the same mutation, as expected.

**Negative control — the pre-change suite against the *same* mutated tree.** I swapped
`git show HEAD:scripts/test-kimi-edition.js` into the mirror and re-ran:

```
###### PRE-CHANGE KIMI vs MUTATED TREE EXIT=0
kimi-edition test passed (516 assertions).
```

That reproduces the owner's measured asymmetry exactly and proves the red comes from K2-anchor and
nothing else. My file was restored byte-for-byte afterwards (`cmp` OK).

---

## Previously-unreachable validator assertions — result

`scripts/validate-workflow-contracts.js` aborted at `:179` and never reached its later
resolver-related assertions. With the anchor repointed the whole file runs to
`Workflow contract validation passed`, so every top-level assertion executed. **They pass.** I did
not stop at "exit 0" — both families were mutation-proven in the mirror:

| assertion (post-edit line) | mutation | result |
|---|---|---|
| `:334` `assertManifestScript('kaola-workflow-resolve-agent-model.js')` / `:337` `assert(exists('scripts/kaola-workflow-resolve-agent-model.js'), 'agent model resolver is missing')` | moved the resolver aside | EXIT=1 — `Error: agent model resolver is missing` |
| `:965` region `VENDOR_MODEL_NOUN_BAN` prose sweep | injected `Run this on Sonnet.` into `commands/kaola-workflow-finalize.md` | EXIT=1 — `Error: commands/kaola-workflow-finalize.md:39: VENDOR_MODEL_NOUN_BAN — vendor model noun "Sonnet" must not appear in an agent-facing prompt surface. …` |

Both restored to EXIT=0 afterwards. Note: the first attempt at the vendor-noun mutation aborted
earlier on `Error: Git tag "kaola-workflow--v9.5.5" must exist…` — an artefact of the mirror's fresh
`git init`, not a real finding. I tagged the mirror and re-ran; the control then passed cleanly,
making the M1 red attributable to the sweep.

---

## Verification — all real exit codes, nothing piped through `tail`

| command | exit | output |
|---|---|---|
| `node <abs>/scripts/validate-workflow-contracts.js` | **0** | `Workflow contract validation passed` |
| `node <abs>/plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | **0** | `Kaola-Workflow GitLab contract validation passed` |
| `node <abs>/plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | **0** | `Kaola-Workflow Gitea contract validation passed` |
| `node <abs>/scripts/validate-kaola-workflow-contracts.js` | **0** | `Kaola-Workflow Codex contract validation passed` |
| `node <abs>/scripts/test-opencode-edition.js` | **0** | `opencode-edition test passed (563 assertions).` — was 561 passed + 2 failed = **563 total**, so the count is unchanged, correct for a pure re-anchor |
| `node <abs>/scripts/test-kimi-edition.js` | **0** | `kimi-edition test passed (521 assertions).` — was 516, **+5**, accounted above |
| `node <abs>/scripts/generate-routing-surfaces.js --check` | **0** | `all 18 surfaces byte-match the skeleton.` — undisturbed |
| `node <abs>/scripts/test-route-reachability.js` | **0** | `Route-reachability test passed (331 assertions).` |
| `node <abs>/scripts/validate-script-sync.js` | **0** | `27 byte-identical groups … 4 Oracle Kernel copies identical at HEAD` — confirms my twin copy stayed in sync |
| `node <abs>/scripts/edition-sync.js --check` | **0** | `8 forge aggregator ports in parity with canonical` |

All six generated edition trees were in parity at D0 on every run — no stale tree masked a result,
and nothing needed regenerating in the worktree (my changes are test-side only). **No unexpected
failure occurred, so no serial re-run was required.**

`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` exits 1 when invoked directly, both
before and after my edit: it computes `root = path.resolve(__dirname, '..')` = `plugins/kaola-workflow/`,
which has no `commands/`, so it fails at the loop's *first* assertion (`… is missing`) long before any
anchor. It is a shipped byte copy that is never run from that location — as
`scripts/kaola-workflow-prose-census.js:175` states. Not a regression; flagged only so the exit code
is not mistaken for one.

---

## Scope

Six files, all test/guard paths. I edited **no** production file — not the skeleton, not any rendered
command surface, not either sync script, not the resolver, not `README.md`/`install.sh`. `git status`
on the worktree shows my six alongside the thirteen pre-existing production modifications from the
four implementer agents, untouched.
