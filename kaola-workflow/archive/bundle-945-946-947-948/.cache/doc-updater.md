# Doc docking review — bundle-945-946-947-948

Date: 2026-08-10
Tree reviewed: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-945-946-947-948`
(branch `workflow/bundle-945-946-947-948`, 9 modified files, all uncommitted working-tree changes).
Comparison tree: `/Users/ylpromax5/Workspace/Kaola-Workflow` at `a339e5df` (pre-bundle).

**Nothing in the worktree was written, created or deleted.** Two commands executed inside it were
read-only (`git grep`, `git diff`, and `node scripts/test-route-reachability.js`, which contains no
`fs.write*`/`fs.mkdir*`/`spawnSync`/`execSync`/`child_process` call — verified by `git grep -P` over
that file returning exit 1). `git status --porcelain` after the run listed the same 9 modified paths
and nothing more. This report is the only file written, and it lives in the main checkout.

## Codemap detection

`ls -d scripts/codemaps docs/CODEMAPS` → exit 1, both absent. There is no codemap tooling in this
repo, so no codemap was generated or regenerated. The review reconciles the doc surfaces the repo
actually declares in `CLAUDE.md` § Documentation Map.

## Checklist applied

`CLAUDE.md:151-152` is the whole checklist:

> On any user-visible change, update: `README.md` · API docs · `CHANGELOG.md` under `[Unreleased]` ·
> architecture docs if structure changed · inline comments where public interfaces changed.

Applied to this diff:

| checklist item | status |
|---|---|
| `CHANGELOG.md` under `[Unreleased]` | **done in-diff** — #948 under `### Added` (`CHANGELOG.md:17-28`), #947 under `### Fixed` (`CHANGELOG.md:30-...`), plus #947's second entry and #945; #946 under `### Removed`. |
| inline comments where public interfaces changed | **done in-diff** — `install.sh:536-539` records the coupling invariant; `scripts/test-generate-routing-surfaces.js:622-628,644-650` and `scripts/test-route-reachability.js:319-321` record theirs. |
| `README.md` | no update owed by this diff (see per-document findings). |
| API docs (`docs/api.md`) | no update owed — no documented signature or behaviour changed. |
| architecture docs | structure did not change; no update owed. |

## Changed files reviewed

1. `install.sh` — `model_for_placeholder()` case and `render_command_file()`'s `placeholders` array
   cut from 11 names to 3; 4-line coupling comment added at `:536-539`.
2. `templates/routing/next.skeleton.md` — `REGION:skill` justification rewritten; the dead
   "Codex Profile Freshness Gate" cross-reference retired from the Delegation block; the
   profile-drift rule kept as its own sentence.
3. `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
4. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
5. `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`
   (3–5 regenerated from the skeleton, 5 lines each.)
6. `scripts/test-route-reachability.js` — T19's forbidden-token match folds case.
7. `scripts/test-generate-routing-surfaces.js` — sandbox copy list derived from the require graph;
   2 anchor assertions added; one assertion message now names the surface path.
8. `scripts/test-opencode-edition.js` — one `A30.SCENARIOS` entry added.
9. `CHANGELOG.md` — +55 lines under `[Unreleased]`.

## Ground truth measured for this review

**M1 — the complete `{X_MODEL}` placeholder census across the shipped surface tree.**

```
$ git grep -o -P '\{[A-Z][A-Z0-9_]*_MODEL\}' -- . ':!CHANGELOG.md' ':!kaola-workflow' ':!docs' ':!*test-*' ':!*simulate-*' | sed 's/:[0-9]*:/ :: /' | sort | uniq -c
   1 commands/kaola-workflow-finalize.md:{BUILD_ERROR_RESOLVER_MODEL}
   1 commands/kaola-workflow-finalize.md:{DOC_UPDATER_MODEL}
   1 commands/kaola-workflow-finalize.md:{TDD_GUIDE_MODEL}
   1 plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:{BUILD_ERROR_RESOLVER_MODEL}
   1 plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:{DOC_UPDATER_MODEL}
   1 plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:{TDD_GUIDE_MODEL}
   1 plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:{BUILD_ERROR_RESOLVER_MODEL}
   1 plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:{DOC_UPDATER_MODEL}
   1 plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:{TDD_GUIDE_MODEL}
   1 plugins/kaola-workflow/scripts/validate-workflow-contracts.js:{BUILD_ERROR_RESOLVER_MODEL}
   1 plugins/kaola-workflow/scripts/validate-workflow-contracts.js:{TDD_GUIDE_MODEL}
   1 scripts/sync-kimi-edition.js:{ROLE_MODEL}
   1 scripts/sync-kimi-edition.js:{TDD_GUIDE_MODEL}
   1 scripts/sync-kimi-edition.js:{X_MODEL}
   1 scripts/sync-opencode-edition.js:{ROLE_MODEL}
   1 scripts/validate-workflow-contracts.js:{BUILD_ERROR_RESOLVER_MODEL}
   1 scripts/validate-workflow-contracts.js:{TDD_GUIDE_MODEL}
   1 templates/routing/finalize.skeleton.md:{BUILD_ERROR_RESOLVER_MODEL}
   1 templates/routing/finalize.skeleton.md:{DOC_UPDATER_MODEL}
   1 templates/routing/finalize.skeleton.md:{TDD_GUIDE_MODEL}
```

Every rendered site is in the **finalize** command, and every name is one of the 3 kept. The 8
removed names appear nowhere. This independently reproduces the lead's zero-installed-bytes
measurement from the source side: `render_command_file` (`install.sh:561-597`) substitutes only the
literal `{PLACEHOLDER}` tokens in its array and touches nothing else, and it runs over
`$SOURCE_COMMANDS_DIR/*.md` only (`install.sh:608-617`).

**M2 — `commands/` carries no other `model=` literal.**

```
$ git grep -n -P 'model=' -- commands/
commands/kaola-workflow-finalize.md:31:Every subagent dispatch below carries an explicit `model=` line — the installer fills each
commands/kaola-workflow-finalize.md:32:`model="{...}"` placeholder from the agent's own installed profile, and it is what shows the model
commands/kaola-workflow-finalize.md:33:badge. You MUST pass `model="{...}"` in every Agent call exactly as shown; never omit the `model=`
commands/kaola-workflow-finalize.md:87:  model="{TDD_GUIDE_MODEL}",
commands/kaola-workflow-finalize.md:96:  model="{BUILD_ERROR_RESOLVER_MODEL}",
commands/kaola-workflow-finalize.md:155:  model="{DOC_UPDATER_MODEL}",
```

Note `:31` — "Every subagent dispatch **below**" is correctly scoped to the finalize command and is
accurate. It is the doc prose that drops the scope (finding F1/F2 below).

**M3 — `test-route-reachability` assertion count, both trees.**

```
$ cd <worktree> && node scripts/test-route-reachability.js ; echo REAL_EXIT=$?
Route-reachability test passed (331 assertions).
REAL_EXIT=0

$ cd /Users/ylpromax5/Workspace/Kaola-Workflow && node scripts/test-route-reachability.js ; echo MAIN_REAL_EXIT=$?
Route-reachability test passed (331 assertions).
MAIN_REAL_EXIT=0   # HEAD a339e5df, pre-bundle
```

331 on **both** trees. The lead's figure is confirmed, and the diff adds zero assertions to that
file — so any doc mismatch against 331 predates this run.

**M4 — which docs are test-consumed** (`scripts/kaola-workflow-adaptive-schema.js:903-910`):

```js
const SELF_HOST_TEST_CONSUMED = Object.freeze([
  'README.md',
  'CHANGELOG.md',
  'docs/api.md',
  'docs/workflow-state-contract.md',
  'docs/agents-source.md',
]);
```

Editing `README.md`, `docs/api.md`, `docs/workflow-state-contract.md` or `docs/agents-source.md`
stales the in-flight chain receipt. `docs/architecture.md`, `docs/conventions.md`, `docs/README.md`,
`docs/opencode-edition.md` and `docs/kimi-edition.md` are **not** in that set.

**M5 — role rosters are untouched** (`node -e` against the kernel, exit 0):

```
CODEX_PINNED_STANDARD_ROLES  = ["code-explorer","investigator","knowledge-lookup","tdd-guide","implementer","doc-updater","metric-optimizer"]
CODEX_PINNED_REASONING_ROLES = ["planner","code-architect","build-error-resolver","code-reviewer","security-reviewer","adversarial-verifier","synthesizer"]
```

14 roles, and the diff does not touch the kernel. Confirms "no role was retired".

## Answers to the five concrete questions

### Q1 — does any live doc describe the placeholder list, `model_for_placeholder`, or `render_command_file` in a way that is now factually wrong?

**No.** A whole-tree `git grep -P` for the 11 placeholder names plus `model_for_placeholder|render_command_file`
returns **zero hits** in `README.md`, `docs/README.md`, `docs/api.md`, `docs/architecture.md`,
`docs/conventions.md`, `docs/workflow-state-contract.md`, `docs/opencode-edition.md`,
`docs/kimi-edition.md`, `docs/agents-source.md`, `.env.example` (exit 1 = no match). Neither function
name appears anywhere outside `install.sh` itself and the historical records below.

**Classification of the historical records: CONFIRMED, and there is one file outside the set you
named.** `docs/README.md:26-38` is the live doc that grants the sanction explicitly:

> `decisions/` holds the full catalog. Two records describe what ships today; the rest are history…
> Everything numbered 0001–0015 and every `D-NNN-NN` record predates 0017. They remain accurate as
> history and as rationale for machinery that still ships around the run…

and `docs/README.md:41` classifies `investigations/` as "investigation notes and analysis documents".
So `docs/decisions/D-646-01.md:12,20,33` and `docs/investigations/{2026-06-05-workflow-planner-adaptive-plan.md,
lean-orchestrator-contractor-2026-06-04.md,lean-orchestrator-part-b-plan.md}` are covered by the
repo's own live classification — do not touch them. **Additionally found, same class:**
`docs/decisions/0003-adaptive-front-end-planner.md:51` names `model="{WORKFLOW_PLANNER_MODEL}"`. It is
doubly historical — an 0001–0015 ADR (`Status: Accepted`, `Date: 2026-06-05`) naming a placeholder
that was already not one of the 11 registered before this diff. Also historical, also leave alone:
`docs/audits/opencode-edition-audit.md:62` (`model="{ROLE_MODEL}"`), under
`docs/README.md:42` "one-off audit records".

Nothing outside that sanctioned band references the machinery.

### Q2 — does any doc claim a role has a rendered `{ROLE_MODEL}` placeholder, or enumerate which roles do?

**No doc enumerates the placeholder set.** The nearest thing is `README.md:209-215`, and it is a
**tier** roster, not a placeholder roster:

> - **Session on Sonnet** — only Opus subagents show a badge. Sonnet-dispatched agents
>   (`code-explorer`, `investigator`, `tdd-guide`, `implementer`, `knowledge-lookup`, `doc-updater`,
>   `metric-optimizer`) run silently. Opus-dispatched agents (`planner`, `synthesizer`,
>   `code-architect`, `code-reviewer`, `security-reviewer`, `build-error-resolver`, and
>   `adversarial-verifier`) badge as expected.

Those two lists are exactly `CODEX_PINNED_STANDARD_ROLES` and `CODEX_PINNED_REASONING_ROLES` (M5),
which the diff does not touch. The lists themselves stay accurate. The surrounding prose overclaims
badge coverage — that is F1/F2 below, and it was equally true before this diff.

### Q3 — does any doc describe the Codex profile-freshness gate as something `workflow-next` performs on entry or resume?

**No — every live doc already states the opposite,** which is the post-#926 install-time boundary
this diff's #947 cross-reference retirement is consistent with. All four sites you flagged were read
in full and all four are correct:

- `README.md:580-586`: "Installation and upgrade are the Codex profile-readiness boundary… Ordinary
  `kaola-workflow-next` and `kaola-workflow-finalize` entry and resume do not re-run that proof,
  inspect profile/config freshness, autofix configuration, or refuse work because persisted bytes
  drifted."
- `README.md:588-589`: "`kaola-workflow-codex-preflight.js --doctor` remains an explicit,
  user-invoked diagnostic. It is never called automatically by an ordinary workflow session."
- `docs/architecture.md:319-322`: "Codex profile readiness is an install-time boundary… The live
  Codex `next`/`finalize` routing surfaces do not re-certify persisted configuration on entry or
  resume."
- `docs/conventions.md:54-59`: "**Codex readiness boundary:** … The `next` and `finalize` Codex
  skills do not invoke `kaola-workflow-codex-preflight.js`, parse or autofix its output, or make
  profile/config freshness a workflow entry, resume, or dispatch verdict."
- `docs/api.md:1488` (the "Installation and edition sync" table): "`kaola-workflow-codex-preflight.js
  --doctor` | explicit user-invoked diagnostic … Ordinary workflow entry/resume never invokes it or
  treats its result as a readiness gate".

A case-insensitive whole-tree sweep for `profile[- ]freshness|freshness gate|profile_stale|config_stale|managed_block_drift`
found exactly one further live-prose hit, `README.md:656-658`:

> Runtime profile integrity comes from omission plus preflight: every generated role profile omits
> both runtime-strength keys, and the profile-freshness preflight migrates or refuses any profile
> that pins them.

That sentence is about the install/`--doctor` preflight's handling of pinned strength keys, not about
a `next`-surface entry gate, and this diff changes no preflight behaviour. **No action.** Every
remaining hit is in `CHANGELOG.md`, `kaola-workflow/archive/**`, `scripts/kaola-workflow-codex-preflight.js`
(the script itself, still shipping) or its tests.

### Q4 — does `docs/api.md` document any signature or behaviour this diff changed?

**No.** `install.sh` is named exactly once in `docs/api.md`, at `:1522`, and it is about the retired
model manifest, not placeholders:

> For Claude Code, there is **no install-written agent model manifest**. `install.sh` deletes a pre-existing…

still true (`install.sh:551-557`, `dispose_agent_model_manifest`). The three changed test scripts are
not documented in `docs/api.md` at all. No `--help`, `--json` envelope, exit code, flag or field in
this diff is documented there. **`docs/api.md` must not be edited** — it is test-consumed (M4) and
there is no inaccuracy to fix.

### Q5 — is anything in the changed test files a documented public behaviour a doc now contradicts?

Three counts were checked against the docs:

- **Routing surface count 18** — `docs/conventions.md:136` and `:323-324` both say 18, and `:136`
  additionally instructs the reader to read the count off `generate-routing-surfaces.js --check`
  rather than off the sentence. Unchanged by this diff. **Correct.**
- **`test-generate-routing-surfaces` 432→434** — no doc states this count. `git grep -P '\b(432|434|331|555|563)\b'`
  over `README.md` and `docs/` returns only unrelated issue numbers (`#432` the chain-receipt issue,
  `D-434-01`, `#555` the export-drift class). **No contradiction.**
- **`test-opencode-edition` 555→563** — no doc states an assertion count for it. `docs/opencode-edition.md`
  names individual assertion IDs (`G1` at `:289`, `U1` at `:307`, `A25` at `:728` of conventions) but
  never a total, and `A30` appears in **no** doc. **No contradiction.**

One live-doc count **is** wrong, and it is pre-existing — F3 below.

Separately, `docs/conventions.md:136` states the rule #945 changed the method for:

> `slots.js` additionally requires `scripts/kaola-workflow-adaptive-schema.js` … so **the kernel is a
> render input too**, and any fixture that sandboxes the generator must copy it or the spawned
> `--check` dies at module load before rendering a byte.

This is a **result** statement ("must copy it"), not a method statement ("hand-type it in this list").
The derivation still copies it, and `test-generate-routing-surfaces.js:640-643` now pins exactly that
(`'mutation proof: the derived copy list reaches the kernel two requires out'`). The sentence remains
true and is a textbook instance of the repo's own "specify the result, never the method" convention.
**No edit owed.** No doc anywhere describes the copy list as hand-typed (`git grep -P 'hand-typed|copy list'`
over the live docs returns only `docs/conventions.md:515`, about parser rows, and `:136`'s "never a
hand-typed file list", which is about `required-blocks.js` and is unaffected).

Similarly for #948: `docs/opencode-edition.md:337-355` documents the advice contract as a
**derivation** — "the closing advice is derived from the remedies present", with per-class bullets for
regenerable → `--write`, config-involving → `--write-config` as a strict superset, and source-edit-only
→ a named line with "When the set contains *nothing else*, no invocation of this script is offered at
all". The new `{stale generated agent, unregistered canonical plugin}` scenario is the composition of
bullets 1 and 3 and is covered by the stated rule; the worked example at `:356-364` already shows a
three-class mixture. #948 adds coverage for documented behaviour. **No edit owed.**

## Per-document verdicts

| document | verdict |
|---|---|
| `README.md` | No update **owed by this diff**. Two pre-existing overclaims found (F1, F2) — not created by this change, and the file is test-consumed (M4). |
| `docs/README.md` | No impact. It is the index; no entry describes anything this diff touched. It is also the file that sanctions the historical records (Q1). |
| `docs/api.md` | No impact and **do not edit** (Q4, test-consumed). |
| `docs/architecture.md` | Structure did not change; the Codex readiness paragraph (`:319-322`) is already correct. One pre-existing overclaim at `:341-342` (F1). |
| `docs/conventions.md` | The routing-generation rule (`:136`) and the Codex readiness boundary (`:54-59`) stay true. One pre-existing stale count at `:325` (F3). |
| `docs/workflow-state-contract.md` | No impact. Nothing in this diff touches durable state, the roadmap mirror, claim records, or issue-source fields. Only placeholder hit is `:136`, about a `workflow_project` value being adopted verbatim — unrelated sense of the word. Test-consumed; do not edit. |
| `docs/opencode-edition.md` | No impact — #948's new scenario is covered by the documented derivation at `:337-355` (Q5). |
| `docs/kimi-edition.md` | No impact. Its placeholder references (`:44`, `:59`, `:332`) describe the kimi **transform** (Claude `model="{...}"` rewritten to inherit-prose, and the K2 residue check asserting no `{X_MODEL}` survives). Removing 8 unspelled registrations changes neither the input nor the output of that transform. |
| `.env.example` | No impact. Contains no model, placeholder or agent key (`git grep -Pi 'model\|placeholder\|agent'` matches only `:59-60`, prose about env vars not crossing the spawn boundary). |
| `docs/agents-source.md` | No impact — vendored-agent provenance only; no role was added, retired or re-tiered (M5). Test-consumed; do not edit. |
| `docs/decisions/`, `docs/investigations/`, `docs/audits/` | Sanctioned historical residue per `docs/README.md:26-42`. Do not touch. |
| `CHANGELOG.md` | Already docked in-diff, all four issues, correct sections. |

## Findings — all three are PRE-EXISTING, none is a gap this diff opened

No documentation gap is created by this diff. Docking is complete on the checklist. The three items
below are inaccuracies I found while checking, recorded because they sit on the exact prose this
diff's neighbourhood, and each is stated with the text I would add if you want it. **My
recommendation: land none of them in this bundle.** F1/F2 touch `README.md`, which is test-consumed
and would stale the in-flight receipt for a defect that predates the run; F3 is safe to edit
receipt-wise but is still not this bundle's work. All three are clean follow-up issues.

### F1 (pre-existing) — `docs/architecture.md:341-342` overclaims badge coverage

Current:

```
For Claude Code, commands carry an explicit `model="{...}"` placeholder on every dispatch, which the
installer fills from the agent's own installed profile; that is what renders the model badge.
opencode applies its resolved tier dynamically.
```

Refuted by M1+M2: three placeholder sites exist in the whole tree, all in
`commands/kaola-workflow-finalize.md`, and no other `model=` literal exists in `commands/`. A
`workflow-next` dispatch carries no `model=` and renders no badge. This was equally false before the
diff (the 8 removed names were spelled by no surface then either), so #946 did not cause it — but
#946's new invariant comment at `install.sh:536-537` ("Registered placeholders are exactly the ones
some command surface actually spells") now sits in visible tension with it.

Exact text I would substitute for `:341-343`:

```
For Claude Code, the `kaola-workflow-finalize` command carries an explicit `model="{...}"`
placeholder on its `tdd-guide`, `build-error-resolver` and `doc-updater` dispatches, which the
installer fills from the agent's own installed profile; that is what renders the model badge on
those three. `install.sh` registers exactly the placeholder names some command surface spells, so a
dispatch carrying no placeholder renders no badge. opencode applies its resolved tier dynamically.
```

Not test-consumed (M4) — editing this file does not stale the receipt.

### F2 (pre-existing) — `README.md:201-207` makes the same overclaim

Current (`:201-207`):

```
When agents are installed, their frontmatter `model:` field is rewritten to
`inherit`. Command files render each agent's concrete assigned model (e.g.,
`model="sonnet"`) into the dispatched `Agent(...)` call via install-time
substitution. This makes Claude Code's built-in model badge render on every
subagent dispatch (the badge renders only when a concrete `model=` literal
differs from the agent's frontmatter). **After installing or re-running
`install.sh`, restart Claude Code for the model badges to take effect.**
```

The minimal correction is one clause. I would replace `render on every\nsubagent dispatch` with:

```
render on every dispatch that carries such a
literal — today the `tdd-guide`, `build-error-resolver` and `doc-updater` calls in
`/kaola-workflow-finalize`
```

The role lists in the blockquote at `:209-215` stay as they are: they are the tier roster (M5) and
are accurate. **`README.md` is in `SELF_HOST_TEST_CONSUMED` (M4)** — this edit stales the in-flight
chain receipt and should not land in this bundle.

### F3 (pre-existing, measured) — `docs/conventions.md:325-326` states a stale assertion count

Current (`:322-326`):

```
one **absolute** count belongs in a different file. `test-generate-routing-surfaces`'s `registry
derives 18 surfaces` is that anchor for the routing registry, and it is mutation-proven — delete a
forge from both edition tables and it fails at 18→12 while `test-route-reachability` stays green at
an unchanged 325 assertions.
```

M3 measured **331** on the branch **and** on pre-bundle `a339e5df`, both exit 0. The 325 is stale by
6 and the drift predates this run. I would not substitute "331" for "325" as-is, because 325 is
reported as the count observed *under the forge-deletion mutation*, which I did not re-run — writing
331 there would assert a measurement I did not take. Text I would substitute for the last clause:

```
an unchanged assertion count — the suite prints its own total, 331 today.
```

Not test-consumed (M4).

## What I could not verify

Nothing. No `BLOCK:` items. The two counts I did not measure myself (`test-generate-routing-surfaces`
432→434, `test-opencode-edition` 555→563) were not needed for any verdict, because no document states
either number — that absence is what I measured, and it is what makes them inert here.

DOCKED
