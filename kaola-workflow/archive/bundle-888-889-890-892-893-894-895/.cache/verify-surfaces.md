# Adversarial verification — shipped surfaces: dead paths and duplicated wordings

**Role:** adversarial-verifier (read-only). **Candidate:** worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895`
at `HEAD=fa5157b3` + 64 uncommitted files (the bundle is not yet committed).

**Claim under test:** *no shipped surface names a path, route or command that no longer exists, and
the bundle introduced no second wording of a rule that already had one.*

**Analytical result: REFUTED.** Four counterexamples, one of them internal to a single
consumer-facing file and bracketed by two edits this bundle made.

No tracked file was modified. Mutations were run on rsync mirrors under
`…/scratchpad/vsurf/{mirror,gmirror,gmirror4}`; `git checkout --` and `git stash` were never used.

---

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=README's own field table states a different `dispatched` rule than the fence three lines above it, which this bundle just updated

## R1 — DEFECT: `README.md` contradicts itself on `dispatched`, inside one 25-line block

`README.md` § "3. Write the mission list" now carries two incompatible definitions eight lines apart:

- `README.md:906` and `README.md:911` — **changed by this bundle** —
  `dispatched: <what went out and to whom, and where its output was to land>`
- `README.md:919` — **left untouched** —
  `` | `dispatched` | what went out and to whom, enough to decide re-dispatch vs. wait | at dispatch | ``
- `README.md:922-923` — **changed by this bundle** (the `docs/mission-list.md` pointer removed)

The row at 919 is bracketed by two edits this bundle made. The canonical row — pinned by the new
`nx-mission-list` block on all twelve `next` surfaces, and present in the repo's own `CLAUDE.md:22` —
is:

```
| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |
```

`README.md` is named in CLAUDE.md's *consumer-facing artifacts* rule. The bundle's entire stated
purpose for the row-level pin (`required-blocks.js`, the "WHY THE ROW AND NOT THE CLAUSE" comment)
is to make the locator undeletable where it is bound to the field; README states the field bound to
a definition that omits it.

Reproduction:

```
sed -n '898,924p' README.md
grep -n '| `dispatched` |' README.md CLAUDE.md templates/routing/next.skeleton.md
```

Measured (`| \`dispatched\` |` rows, worktree vs `HEAD`):

| site | HEAD | worktree |
|---|---|---|
| `CLAUDE.md` | …and **where the output was to land** | …and **where the output was to land** |
| `README.md:919` | …enough to decide re-dispatch vs. wait | …enough to decide re-dispatch vs. wait |
| `docs/decisions/0017-the-mission-list.md:65` | …enough to decide re-dispatch vs. wait | …enough to decide re-dispatch vs. wait |
| `docs/architecture.md:38` | …enough to decide re-dispatch vs. wait | …enough to decide re-dispatch vs. wait |
| `docs/mission-list.md:41` | …enough to decide re-dispatch vs. wait | *(deleted)* |
| `templates/routing/next.skeleton.md:227` | *(absent)* | …and **where the output was to land** |

---

finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=the bundle made ADR 0017 the normative home of "the file format" while the ADR states a different `dispatched` rule and never contains the locator phrase at all

## R2 — DEFECT: six new "see the ADR for the file format" pointers aim at the divergent wording

`#892` deleted `docs/mission-list.md` and repointed its readers at ADR 0017. Every one of these
repoint edits is in this bundle's diff:

| repointer | new text |
|---|---|
| `docs/README.md:3` | `**Start here: [The mission list](decisions/0017-the-mission-list.md)**` |
| `docs/api.md:7` | `see \`decisions/0017-the-mission-list.md\` for the file format` |
| `docs/architecture.md:27` | `See \`decisions/0017-the-mission-list.md\` for the derivation and the file format.` |
| `docs/workflow-state-contract.md:7` | `see \`decisions/0017-the-mission-list.md\` for its format` |
| `docs/workflow-state-contract.md:109` | `the one file a zero-context successor needs; see \`decisions/0017-the-mission-list.md\`` |
| `docs/conventions.md:5` | `**The workflow itself is \`docs/decisions/0017-the-mission-list.md\`.**` |
| `CLAUDE.md:10` | `The design of record is [ADR 0017 …]. Read it before proposing anything that writes to the run record.` |

All seven links resolve (verified — see "Attacks that failed", link check). What they resolve **to**
is `docs/decisions/0017-the-mission-list.md:65`:

```
| `dispatched` | what went out and to whom, enough to decide re-dispatch vs. wait | at dispatch |
```

and the phrase `where the output was to land` **does not occur anywhere in ADR 0017**:

```
grep -n "where the output was to land" docs/decisions/0017-the-mission-list.md   # no match
```

So the bundle simultaneously (a) pinned the locator as an undeletable table row on twelve prompt
surfaces and (b) promoted a document that omits it from *design record* to *the file format*. That
is "one rule, one wording" broken at the exact field the bundle went to the most trouble to protect.

**Honest scoping.** The A/B divergence is **pre-existing**: at `HEAD` variant B sat in the ADR,
`README.md`, `docs/architecture.md` and the (then-live) `docs/mission-list.md`, while variant A sat
only in the repo `CLAUDE.md`. The bundle did not create the divergence. What the bundle changed is
that the B-wording document is now the named destination for "the file format", and the A-wording is
now normative and mutation-guarded on every shipped prompt surface. Before, both the pointer target
and the pointed-from text agreed on B; now they disagree.

---

finding: id=R3 scope=in_scope action=fix status=open severity=low fix_role=implementer rationale=a fourth #888 carry-over residue — the comment documenting runCut still states the deleted rule, in all four editions

## R3 — DEFECT: a fourth #888 residue — the `runCut` comment, ×4 editions

The three residues already repaired were `runCut`'s operator string (×4), `run-chains.js`'s
`--release-check` usage text (×4) and `CLAUDE.md`. The **comment that documents that operator
string** was not:

- `scripts/kaola-workflow-release.js:316-321`
- `plugins/kaola-workflow/scripts/kaola-workflow-release.js:316-321`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js:317-322`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js:317-322`

```js
// #881: step 3 is CONDITIONAL — the chain run is the fallback, not the default, because a green
// unwaived four-chain receipt from the finishing run binds across a release-prep-only commit. The
// step LITERAL is byte-identical to the same list in docs/api.md: one list, one wording, two
// renderings. Keep it a step with a qualifier, matching every other element's imperative register —
// the prose statement of the rule belongs in the human refusal line and --prepare's message below,
// which are prose about the rule rather than steps. If you reword one list, reword the other.
function runCut(root, o) { return refuse(o.jsonMode, 'cut_compatibility_refusal', { sequence: [ … ,
  'run the offline full chain receipt at the release commit', … ] }, 'cut: REFUSED — … run the
  offline full chain receipt at the release commit; …'); }
```

The comment states, as the live rule, exactly what `#888` deleted, and it directly contradicts the
line beneath it. It also instructs a future editor to *keep the qualifier* ("Keep it a step with a
qualifier") — i.e. to reinstate the deleted mechanism. `docs/conventions.md:541-553` now records the
opposite ruling ("**That re-run is mandatory, not an alternative**").

This is a source comment, not a reader-facing prompt surface, so it is the weakest of the four
findings; `kaola-workflow-release.js` is not in `SUPPORT_SCRIPT_NAMES` and does not install to a
consumer, though the plugin tree ships it to Codex users on disk.

**Secondary, pre-existing:** the same comment asserts the step literal is *byte-identical* to
`docs/api.md`'s list. It is not, and was not at `HEAD` either — `runCut` says `commit only release
files`, `docs/api.md:1013` says `commit only **the** release files`. Recorded, not attributed to
this bundle.

Reproduction:

```
grep -n "step 3 is CONDITIONAL" -A 6 scripts/kaola-workflow-release.js
node scripts/kaola-workflow-release.js --cut      # emits the corrected, unconditional sequence
```

---

finding: id=R4 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=the new `in-mission-list` block declares the init restatement a verbatim subset of the next wording; measured, 0 of 9 sentences are verbatim and one has no counterpart at all

## R4 — DEFECT: the `in-mission-list` block's declared "strict subset" is false

`templates/routing/required-blocks.js:59-66` (added by this bundle) declares:

> This restatement is a declared subset of the next skeleton's wording: every sentence appears
> verbatim there, shortened by omission and never rephrased.

Measured against `templates/routing/next.skeleton.md`, whitespace-normalised, sentence by sentence:
**0 of 9 sentences in the init restatement appear verbatim.**

The decisive one — a subset cannot contain an element its superset lacks:

- init (`templates/routing/init.skeleton.md:154`): **"The agent writes it; no script owns it."**
- `next.skeleton.md`: `no script` — **absent**. `agent writes it` — **absent**.
- All twelve rendered `next` surfaces: `no script` — **absent** (checked
  `commands/workflow-next.md`, `.opencode/command/workflow-next.md`,
  `.kimi/skills/workflow-next/SKILL.md` and the rest).

The other eight are genuine rephrasings, not omissions:

| init | next |
|---|---|
| "The run's coordination record is `…/mission-list.md`: an H1 carrying the goal…" | "`…/mission-list.md` is the run's coordination record and the one file a successor needs." (clause order inverted) |
| "Three write moments, and they are the whole discipline:" | "**The three write moments.** These are the whole discipline:" |
| "Writing `dispatched` afterwards is the failure **the** file exists to prevent." | "Writing **it** afterwards is **precisely** the failure **this** file exists to prevent" |
| "never a role, a file list, a dependency edge, a model, or a shape" | "It carries no role, no file list, no dependency edge, no model, no cardinality and no shape" |
| "Decide how to run it when you reach it." | "because you decide all of that when you reach it" |
| "The frontier is not computed**:** it is the list…" | "The frontier is not computed **—** it is the list…" |
| "…is the agent's call and nothing inspects it." | "Nothing inspects that decision: no disjointness proof…" |
| "an H1 carrying the goal, then one item per mission" | "An H1 carrying the goal **in one line**, then one item per mission" |

Two of the eight (the em-dash and the "in one line" omission) are arguably within the declaration's
spirit; six are not, and the ninth is impossible under it.

This block ships nowhere, so no reader is misled — but the comment is the recorded design that a
future maintainer will edit against, and it is false as written. Either the declaration should say
"a restatement in the init register" or the init bullets should be made an actual subset.

Reproduction: `node …/scratchpad/vsurf/subset.js` (prints REPHRASED for all nine) and
`grep -n "no script" templates/routing/next.skeleton.md` (no match).

---

finding: id=O1 scope=in_scope action=user-decision status=open severity=low fix_role=tdd-guide rationale=mutation-proven — the full claude gate stays green when the #892 defect is re-inserted in either direction; recorded as residual risk, not a demand to build

## O1 — OBSERVATION (non-blocking): the #892 class itself is unguarded, both directions

The bundle removed the instance and pinned the *format's presence*. Nothing forbids the *pointer's*
return. Both directions were mutation-proven on git-backed mirrors with the surfaces regenerated,
the six additive-edition trees re-synced, and everything committed before the run.

**M3 — re-insert a repo-relative pointer to the deleted doc into all 12 `next` surfaces.**
Inserted into `next.skeleton.md`: `` The full convention is `docs/mission-list.md`; read it there. ``
All pinned tokens left intact.

```
grep -c docs/mission-list.md commands/workflow-next.md .kimi/…/workflow-next/SKILL.md .opencode/command/workflow-next.md
  → 1  1  1
node scripts/test-route-reachability.js        → exit 0 (323 assertions)
npm run test:kaola-workflow:claude             → exit 0   [gate-m3.log]
```

**M4 — re-add a non-scaffolded `docs/` path to the generated consumer `CLAUDE.md` template.**
Inserted `` - `docs/mission-list.md` — the run record format. `` into the init template's
Documentation Map — a path `/workflow-init` Step 4 does not scaffold and that exists in no consumer
repo.

```
grep -c docs/mission-list.md commands/workflow-init.md .kimi/…/workflow-init/SKILL.md → 1  1
npm run test:kaola-workflow:claude             → exit 0   [gate-m4.log]
```

Baseline on the same unmutated git-backed mirror: `exit 0`, 3m59s — so both greens are real, not a
harness artifact.

This is recorded, not a demand: CLAUDE.md's *derive additively* says a mechanism is built by an
observed failure, and the observed failure here is a one-time instance the bundle repaired. But the
class **has** now been observed once (#892), so the orchestrator should decide rather than inherit
the silence. The cheapest sufficient form is one assertion: no `next`/`init`/`finalize` surface may
contain a backticked `docs/…` path outside the set `/workflow-init` Step 4 scaffolds.

---

## Attacks that failed — the claim held on these

### Item 1 — consumer-repo simulation (CONFIRMED CLEAN)

Actually executed, not reasoned about. Sandboxed `HOME`, real installer, real fresh repo.

```
S=…/scratchpad/vsurf
mkdir -p $S/home $S/consumer && (cd $S/consumer && git init -q . && … && git commit)
HOME=$S/home bash <worktree>/install.sh --yes --forge=github     → exit 0
```

Installed for a consumer: `~/.claude/commands/{workflow-init,workflow-next,kaola-workflow-finalize}.md`,
14 agents, 17 support scripts + 1 hook (`scripts/kaola-workflow-install-manifest.js` is the single
source; `install.sh:88-110` sets `SUPPORT_DIR=$HOME/.claude/kaola-workflow`). Note
`kaola-workflow-release.js` is *not* installed to a consumer — relevant to R3's severity.

Then the `/workflow-init` outcome was materialised: the `KW-CLAUDE-TEMPLATE-START/END` region was
extracted verbatim from the *installed* command (98 lines) and written as the consumer's `CLAUDE.md`,
and Step 4's declared structure was created (`kaola-workflow/{ROADMAP.md,archive/}`,
`docs/{README,architecture,api,conventions}.md`, `docs/decisions/`, `CHANGELOG.md`). Every backticked
path-like token in the consumer `CLAUDE.md` was then resolved against the consumer repo:

```
EXISTS  kaola-workflow/ROADMAP.md · README.md · CHANGELOG.md · docs/README.md
        docs/architecture.md · docs/api.md · docs/conventions.md · docs/decisions/
```

**Every `docs/` path the generated consumer `CLAUDE.md` names is scaffolded by its own Step 4.**
Nothing besides `docs/mission-list.md` and `docs/workflow-state-contract.md` was ever there, and
neither was added back. The four remaining non-existent tokens are correct by construction and were
each read in context, not counted:

| token | why it is not a defect |
|---|---|
| `kaola-workflow/.roadmap/` | "do not purge" — a rule about a directory the claim creates, not a read instruction |
| `workflow-state.md` / `mission-list.md` | run-relative; written at claim/Step 4 of a run |
| `kaola-workflow/config.json` | "**declare in** … when the repo uses other than P0–P3 naming" — conditional authoring, not reading |

`workflow-next.md` names **no** `docs/` path at all. `kaola-workflow-finalize.md` names only
run-produced artifacts (`.cache/chain-receipt.json`, `.cache/doc-docking.md`, `sink-fallback.json`)
and handles the non-Node consumer explicitly — `kaola-workflow-finalize.md:44-47` branches to
"**Consumer** — no `test:kaola-workflow:*` scripts… You own verification", so the `package.json`
reference is guarded, not assumed.

Sweep for the two removed docs across every shipped tree (dot-directories named explicitly, since
the local `grep` is ugrep and skips them by default):

```
grep -rn "docs/mission-list\|docs/workflow-state-contract" commands agents .agents hooks plugins \
  templates scripts docs README.md CLAUDE.md AGENTS.md install*.sh uninstall.sh package.json \
  opencode.json .opencode .opencode-gitlab .opencode-gitea .kimi .kimi-gitlab .kimi-gitea
```

`docs/mission-list.md`: **zero hits** outside `CHANGELOG.md`. `docs/workflow-state-contract.md`:
hits only in this repo's own validators/kernel/docs — that file still exists here and those are
self-host references, never consumer-facing. A positive control confirmed the ugrep invocation does
descend the six dot-directories.

Markdown-link resolution across every bundle-touched doc (`README.md`, `CLAUDE.md`, `AGENTS.md`,
`docs/README.md`, `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`,
`docs/workflow-state-contract.md`, `docs/decisions/0017-the-mission-list.md`): **all links resolve.**

### Item 2 — all 12 `next` surfaces, 4 runtimes (CONFIRMED CLEAN)

Fourteen needles per surface: the four fence field lines, all four table rows, the two order/absence
sentences, write-moment 2's `**before the work goes out**` and its `Name **where the output was to
land** — that locator is`, `dispatched: self`, `mission, not a specification`; plus one banned needle
(`docs/mission-list.md`).

```
commands/workflow-next.md                                    OK
plugins/kaola-workflow{,-gitlab,-gitea}/…                    OK  (3 commands + 3 SKILLs)
.opencode{,-gitlab,-gitea}/command/workflow-next.md          OK
.kimi{,-gitlab,-gitea}/skills/workflow-next/SKILL.md         OK
ALL 12 CLEAN
```

Freshness of the generated trees was not assumed:

```
node scripts/generate-routing-surfaces.js --check     → all 18 surfaces byte-match the skeleton
node scripts/sync-opencode-edition.js --forge={github,gitlab,gitea} --check   → 3× in parity
node scripts/sync-kimi-edition.js     --forge={github,gitlab,gitea} --check   → 3× in parity
```

**Both new pins are mutation-proven armed**, on a scratch mirror:

- **M1** — strip `, naming **where the output was to land** — that locator is what makes recovery
  possible at all` from the init skeleton, regenerate → `test-route-reachability.js` **exit 1**,
  `MANIFEST missing-token: block in-mission-list token "where the output was to land" absent from`
  **all 12 init surfaces** (both lanes, all four runtimes).
- **M2** — weaken *only* the `dispatched` table row to `what went out and to whom`, leaving write
  moment 2's `**where the output was to land**` intact (so the surface still contains the phrase
  once) → **exit 1**, `block nx-mission-list token "| \`dispatched\` | … |" absent from` all 12 next
  surfaces. This is precisely the scenario `required-blocks.js`'s "WHY THE ROW AND NOT THE CLAUSE"
  comment claims the row token defends against, and the claim verifies.

### Item 3 — #888 carry-over sweep (CLEAN except R3)

`grep -rniE "carries over|carry over|carried over|carry-over|carryOver|release-prep-only|prep-only"`
across commands, agents, hooks, plugins, templates, scripts, README, CLAUDE.md, AGENTS.md, the five
core docs and all six additive-edition trees. Every hit was read:

- **`kaola-workflow-release.js:317` ×4 — R3 above, the only live residue.**
- `validate-*-contracts.js`, `test-claim-hardening.js` — "#816 … guardrails that **carry over**",
  an unrelated use of the words.
- `test-finalize-door.js:625`, `simulate-workflow-walkthrough.js:1037`,
  `kaola-workflow-adaptive-schema.js:1431`, `docs/conventions.md:548-553` — all state the deletion
  correctly, in the past tense.

Live CLI surfaces executed, not read:

```
node scripts/kaola-workflow-run-chains.js --help
  → "binds by strict headSha equality against the candidate (default HEAD) and nothing else —
     any other commit refuses chains_stale naming the culprit, so the chain run belongs at the
     release commit itself."
node scripts/kaola-workflow-release.js --cut
  → "cut: REFUSED — … run the offline full chain receipt at the release commit; …"
```

`README.md:1476-1500` (the official release checklist) makes step 3 unconditional. Zero
carry-over hits in any of the six additive-edition trees. The kernel is byte-identical across all
four editions (`md5` of the four `kaola-workflow-adaptive-schema.js` copies → 1 distinct hash), so
the drift anchor held through the bundle's kernel edit.

### Item 4 — wording census (findings R1/R2/R4; the collapse itself is CLEAN)

Every window naming all four field names was enumerated across every prompt surface, agent
definition, doc and edition tree. Deduplicated to distinct *wordings*:

| wording | sites | change |
|---|---|---|
| `next.skeleton.md` | 12 rendered `next` surfaces | **new**, replaces the pointer |
| `init.skeleton.md` | 12 rendered `init` surfaces + the generated consumer `CLAUDE.md` | pre-existing, one clause added |
| repo `CLAUDE.md` | 1 | unchanged |
| `README.md` | 1 | fence updated, table row not — **R1** |
| ADR 0017 | 1 | unchanged — **R2** |
| `docs/architecture.md` | 1 | pointer line only |
| `docs/mission-list.md` | — | **deleted** |

Net wording count is unchanged (one deleted, one added); the prompt surfaces did collapse onto one
wording, and the reference docs were repointed rather than rewritten — the declared design.

### Item 5 — provenance in rendered surfaces (CONFIRMED CLEAN)

`grep -rnE "issue #[0-9]+|\(#[0-9]{3}\)|#[0-9]{3,4}\b|ADR [0-9]{4}|D-[0-9]{3}-[0-9]{2}|20[0-9]{2}-[0-9]{2}-[0-9]{2}"`
across all 12 command surfaces, all 12 SKILL/command renderings of the three topics, `agents/`,
`.agents/`, and the six edition trees: **no issue number, ADR citation or dated ruling in any
rendered routing surface.** The bundle's three authoring-side edits
(`next.skeleton.md`, `init.skeleton.md`, `required-blocks.js`) leaked nothing.

Twenty-one pre-existing hits, all the same frontmatter field on three agent profiles and their
edition twins — `note: Locally authored … (owner-approved 2026-06-15)` on `synthesizer`,
`metric-optimizer`, `implementer`. Untouched by this bundle; a vendoring-provenance declaration, not
a rule's origin. Recorded, not attributed.

### Item 6 — consumer-facing vendor / model / command names (CONFIRMED CLEAN)

Run against the **materialised** consumer `CLAUDE.md`, not the skeleton:

- Vendor/model tokens (`claude|codex|opencode|kimi|anthropic|openai|gpt|opus|sonnet|haiku|gemini|copilot|cursor`, word-boundary): **none.**
- Slash commands: **none** — every `/x` hit is a path fragment (`docs/api`, `kaola-workflow/config`).
- CLI binaries (`gh|glab|tea|npx|npm|yarn|pnpm` + subcommand): **none.**
- The routing line reads "Start and resume all workflow work through **the workflow router
  entrypoint your runtime installs**" — runtime-neutral, names no command.
- Title is `# Project Instructions`, not a vendor-named heading.

The bundle's own edit to this region (`, naming **where the output was to land** — that locator is
what makes recovery possible at all`) introduces no vendor, model or command token.

---

## Evidence index

| artifact | path |
|---|---|
| consumer install log | `…/scratchpad/vsurf/install-github.log` |
| simulated consumer repo | `…/scratchpad/vsurf/consumer/` |
| path scanner | `…/scratchpad/vsurf/scan-paths.js` |
| 12-surface checker | `…/scratchpad/vsurf/check12.js` |
| subset prover (R4) | `…/scratchpad/vsurf/subset.js`, `subset2.js` |
| wording census | `…/scratchpad/vsurf/wordings.js` |
| link checker | `…/scratchpad/vsurf/links.js` |
| M1/M2 guard logs | `…/scratchpad/vsurf/rr-{baseline,m1,m2,m3}.log` |
| M3/M4 gate logs | `…/scratchpad/vsurf/gate-{baseline,m3,m4}.log` |

`…` = `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f018e2ef-7526-4575-bcc6-e529af9f0e2f`

## Receipt

verdict: fail
findings_blocking: 4

Analytical result: **refuted** — R1, R2, R3, R4 are demonstrated counterexamples; O1 is a
mutation-proven residual risk recorded for the orchestrator's decision, not a blocker.

**Confidence: high** on R1, R3, R4 (each is a direct textual comparison or an executed sentence-level
match, reproducible in one command). **High on the facts of R2, medium on its weight** — the
divergence it names is pre-existing and only the repointing is this bundle's; whether that rises to
"the bundle introduced a second wording" is a judgement I have stated both sides of rather than
resolved. **High** on O1: both mutations were run to completion on git-backed mirrors against a
green baseline on the same mirror.
