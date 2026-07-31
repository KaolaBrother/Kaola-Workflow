# #885 doc-claims audit

Read-only fact-finding for the #885 prose pass. All commands run against the worktree
`.kw/worktrees/bundle-881-882-883-884-885` (branch `workflow/bundle-881-882-883-884-885`) for tracked
files, and the MAIN checkout for the six untracked `.opencode*`/`.kimi*` trees (they exist only there).

**Method note carried into every sweep below**: `grep` here is ugrep and does **not** descend into
dot-directories on a bare `grep -r . .` — confirmed directly (`grep -rl "planner" .opencode` finds 4
hits; `grep -rl "planner" .` finds 0). Every sweep below names `.opencode .opencode-gitlab
.opencode-gitea .kimi .kimi-gitlab .kimi-gitea` explicitly. `rg` is not installed.

No writes were made to any audited file. The one edit I own (a comment fix in
`scripts/validate-kaola-workflow-contracts.js`, not part of the audit) is reported at the end.

---

## 1. "all 15 role TOMLs" — README.md:560, install-kimi.sh:24, docs/kimi-edition.md:45

**Verdict: TRUE — should be 14, and 14 is correct everywhere I counted.**

Counted independently per surface (not blended), because a concurrent agent (`codex-profiles`,
tasks now completed) was mid-edit on the codex role TOMLs while I measured:

| surface | method | count |
|---|---|---|
| canonical `agents/*.md` | `ls agents/*.md \| wc -l` | **14** |
| `plugins/kaola-workflow/agents/*.toml` (Codex, github) | `ls ... \| wc -l` | **14** |
| `plugins/kaola-workflow-gitlab/agents/*.toml` (Codex) | same | **14** |
| `plugins/kaola-workflow-gitea/agents/*.toml` (Codex) | same | **14** |
| `plugins/kaola-workflow/config/agents.toml` table headers | `grep -c '^\['` | **14** |
| `.kimi/skills/kaola-role-*` (main checkout, untracked) | `find -maxdepth 1 -type d` | **14** |
| `.opencode/agent/*.md`, `.opencode-gitlab/agent/*.md`, `.opencode-gitea/agent/*.md` | `find -name "*.md"` | **14 each** |

`git status` confirms the concurrent agent's edits are content-only (14 files modified, none
added/removed) in every `agents/` and `config/agents.toml` path, so 14 is stable through the
in-flight edit, not a snapshot artifact.

Exact current line: `install-kimi.sh:24` says "plus all **15** kaola-role-* skills" (not "TOMLs" —
kimi ships `SKILL.md`, not TOML; the issue's paraphrase is imprecise but the number is what's wrong).
`docs/kimi-edition.md:45` says "Role-contract Skill (**15** roles)". `README.md:560` says "all **15**
role TOMLs". Note `README.md:50` and `:139` already correctly say **14** ("14 vendored roles across
all four runtimes") — so the fix at :560 brings it into line with the rest of the same file, not a
new number.

**Recommended correction**: change `15` → `14` at all three sites, verbatim otherwise.

---

## 2. "converge all three runtimes" — README.md:1544, vs. install-all.sh (4) and README.md:238 (4)

**Verdict: TRUE.**

`README.md:1544` reads: *"To converge all three runtimes from one synchronized checkout, reinstall
each runtime explicitly..."* — the code block that follows (lines 1548–1569) lists exactly three:
Claude Code (`./install.sh`), Codex (`codex plugin ...` + `install-codex-agent-profiles.js`), and
opencode (`./install-opencode.sh --global --yes`). **`./install-kimi.sh` is absent from both the
prose count and the command block.**

Ground truth: `install-all.sh:38` — `RUNTIMES=(claude opencode codex kimi)`; `install-all.sh:85` —
`4. kimi      Kimi Code     (install-kimi.sh)`; `install-all.sh:94` — the `--skip=` help text lists
`claude,opencode,codex,kimi`; `install-all.sh:495-506` actually invokes
`bash "$ROOT/install-kimi.sh" ...`. `README.md:238` itself already says "reinstall all **four**
runtimes" for `install-all.sh`. So :1544 disagrees with the rest of its own file.

**Recommended correction**: change "all three runtimes" → "all four runtimes" at :1544, and add a
Kimi Code block to the command list mirroring the opencode one, e.g.:
```bash
# Kimi Code — additive runtime, global install.
./install-kimi.sh --global --yes
```

---

## 3. Codex compact hook description — README.md:1221 vs. the script's own header

**Verdict: TRUE.**

`README.md:1221` (current line, table row) reads: *"...injects a resume packet (active project, next
skill, **in-progress node, pending gates, consent markers**, task summary) from
`kaola-workflow-codex-compact-resume.js`."*

`plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js:7-11` (verbatim):
> "The packet used to be derived from the frozen plan — the Node Ledger's in-progress row, its
> pending gate-verdict roles, the consent-halt marker and the task mirror. All four of those
> artifacts are gone. The run record is now mission-list.md, and the resume question it answers is
> the one the format states: done items are what is known, in-flight items with their dispatched
> locator are the decision to make, todo items are what remains."

The script's actual packet (read at `main()`, lines 112-164) is six fixed lines: **active project,
goal** (the mission-list H1), **next skill/command, in-flight items with their dispatched locators,
progress counts** (done/in-flight/todo). "Task summary" in the README is also gone — there is no
task-mirror step left to summarize.

**Recommended correction** — replace the parenthetical:
> "...injects a resume packet (active project, goal, next skill, in-flight items with their
> dispatched locators, progress counts) from `kaola-workflow-codex-compact-resume.js`."

---

## 4. Per-node validation scoping — README.md:1187

**Verdict: TRUE.**

Current line 1187, verbatim: *"Avoid redundant validation runs: **an implement node** uses targeted
affected checks, **a review-gate node** validates only review fixes or cites existing evidence, and
Finalization runs each full final command once against the final candidate state."*

"Node" as a unit of execution, and "review-gate" as a typed gate role, are both retired by ADR 0017
(`docs/decisions/0017-the-mission-list.md` — "What is retired" lists roles, the role manifest, and
post-dominance gates G1–G4; the design replaces the DAG with a flat mission-list item). There is no
current "implement node" or "review-gate node" type to scope a check to.

**Recommended correction** — replace "node" framing with item framing, keeping the actual behavioral
rule (avoid redundant re-validation) intact:
> "Avoid redundant validation runs: an item that only touches implementation runs targeted affected
> checks, an item that only fixes review feedback validates just the fix or cites existing evidence,
> and Finalization runs each full final command once against the final candidate state."

---

## 5. Fast-gate sampling counts — docs/architecture.md:337 vs. docs/conventions.md:303

**Verdict: TRUE — architecture.md is wrong; conventions.md is right. Settled against package.json.**

Ground truth, computed by diffing the `test:kaola-workflow:claude` script against
`test:kaola-workflow:claude:full` in `package.json` (script-name diff, ignoring flag differences,
then flagging any shared script invoked with different flags):

- **Present in FULL but not in FAST (deferred whole) — exactly four**: `test-claim-hardening.js`,
  `test-sink-merge.js`, `test-release.js`, `test-run-chains.js`.
- **Present in both, invoked differently (sampled) — exactly one**: `simulate-workflow-walkthrough.js`
  (`--shard auto/12` in fast, no flag in full).

`docs/conventions.md:303` (current line): *"One suite is sampled: `simulate-workflow-walkthrough`
runs `--shard auto/12`... Four are deferred whole — `test-claim-hardening`, `test-sink-merge`,
`test-release`, `test-run-chains`..."* — **matches the package.json diff exactly.**

`docs/architecture.md:336-337` (current lines): *"...every cheap step at full coverage, but **three**
heavyweight suites run a rotating 1/12 slice and **six** non-samplable suites are deferred."* — both
numbers are wrong (should be one and four).

**Recommended correction** — architecture.md:336-337:
> "...every cheap step at full coverage, but one heavyweight suite runs a rotating 1/12 slice and
> four non-samplable suites are deferred whole."

---

## 6. docs/api.md Gitea sink-merge exports — current lines 1182-1183

**Verdict: PARTLY TRUE, and the "three undocumented" count is itself wrong — real count is five.**

Current text (`docs/api.md:1182-1183`): *"**`kaola-gitea-workflow-sink-merge.js`** —
`ensureMergeReady(args, opts)`, `readProjectInfo(root, project)`, `finalValidationPassed(root,
project)`."*

Checked against the file itself
(`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`):

- `ensureMergeReady` — **does not exist anywhere in the file** (zero grep hits for the name at all,
  not even as a helper). Purely fabricated in the doc.
- `readProjectInfo` — **exists** (defined at line 226) but is **not** in `module.exports` (lines
  2088-2095) — a private helper, wrongly documented as part of the public API surface.
- `finalValidationPassed` — exists and **is** exported. Correctly documented.

The real `module.exports` (6 entries): `classifyMergeError`, `closeLinkedIssue`, `fastForwardMain`,
`finalValidationPassed`, `runDirectMerge`, `assertBranchHasNonWorkflowChanges`.

So of 6 real exports, only 1 (`finalValidationPassed`) is documented. **The three real undocumented
exports the issue expects are actually five**: `classifyMergeError`, `closeLinkedIssue`,
`fastForwardMain`, `runDirectMerge`, `assertBranchHasNonWorkflowChanges`. (For comparison, the
parallel GitLab entry at `docs/api.md:1157-1160` documents 5 of GitLab's exports the same way — the
Gitea entry is the one that regressed.)

**Recommended correction** — replace the Gitea sink-merge line with something matching the GitLab
entry's shape, e.g.:
> "**`kaola-gitea-workflow-sink-merge.js`** — `classifyMergeError(error)`, `closeLinkedIssue(root,
> project, issueIid, opts)`, `fastForwardMain(args, opts)`, `finalValidationPassed(root, project)`,
> `runDirectMerge(args, opts)`, `assertBranchHasNonWorkflowChanges(...)`."

---

## 7. "all six workflow-init surfaces" — README.md:30, docs/conventions.md:725

**Verdict: TRUE in every particular — this is the most consequential finding in this audit.**

Current text: `README.md:30` — *"The axiom layer is embedded byte-identically into every generated
project's guidance (all **six** `workflow-init` surfaces, with a machine-enforced drift guard)."*
`docs/conventions.md:725` — *"...embedding byte-identically into the **six** workflow-init
CLAUDE.md-template surfaces..."*, and `:728` names the guard: `testAxiomBlockByteIdentity`.

The guard (`scripts/simulate-workflow-walkthrough.js:10011-10030`, `testAxiomBlockByteIdentity`)
hardcodes exactly this list (`initSurfaces`, lines 10015-10022):
```
commands/workflow-init.md
plugins/kaola-workflow-gitlab/commands/workflow-init.md
plugins/kaola-workflow-gitea/commands/workflow-init.md
plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md
plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md
plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md
```
That's 3 forges × 2 tracked runtimes (Claude commands + Codex skills) = 6.

**But there are twelve**, once the untracked runtime editions are counted (main checkout only —
these do not exist in the worktree):
```
.opencode/command/workflow-init.md          .kimi/skills/workflow-init/SKILL.md
.opencode-gitlab/command/workflow-init.md   .kimi-gitlab/skills/workflow-init/SKILL.md
.opencode-gitea/command/workflow-init.md    .kimi-gitea/skills/workflow-init/SKILL.md
```
That's 3 forges × 2 more runtimes (opencode commands + kimi skills) = 6 more, for **12 total**.

**All twelve carry it.** Checked two ways: (a) `grep -c "First Principles"` on each of the six
untracked files returns 1; (b) programmatically confirmed the *exact byte-identical*
`templates/axioms.md` content is a substring of all six untracked files (same test the guard already
runs on the other six). So the axiom layer genuinely reaches all 12 surfaces — the doc's factual claim
("embedded byte-identically into every generated project's guidance") is TRUE for the full set. It is
the **surface count** that's wrong, and — more importantly — **the guard silently checks only half of
what it claims to guarantee**: an opencode or kimi surface could drift from `templates/axioms.md` and
`testAxiomBlockByteIdentity` would still pass, because it never reads those six files.

**Recommended correction**: change "six" → "twelve" at both prose sites (or explicitly "six tracked +
six untracked" if that distinction is worth preserving in prose). Separately — **not a doc fix, a real
coverage gap** — flag for whoever owns `simulate-workflow-walkthrough.js` that `initSurfaces` should
either grow to 12 or the doc should say what it actually guards ("six of the twelve, machine-enforced;
the other six are unguarded"). I have not touched that file; reporting only, per my read-only scope.

---

## 8. Six identifiers claimed to resolve nowhere in live text

**Verdict: PARTLY TRUE — two of six are real broken current-doc claims, two are correctly framed
as retired already, and two are minor/ambiguous. Detail per identifier:**

| identifier | file exists? | function exists? | where it's actually named |
|---|---|---|---|
| `repair-routing.md` | No (`docs/plan-run-cards/` dir itself doesn't exist) | n/a | **`install.sh:934`** — a dangling comment: *"verify the canonical plan-run card shipped (repair-routing.md is the barrier/repair recovery recipe the command cites)"* — no code near it actually verifies any such file. This is a live, current, misleading comment. Also in CHANGELOG.md and `kaola-workflow/archive/*` (historical, correctly past-tense). |
| `plan-validator.js` | No (nor `kaola-workflow-plan-validator.js`) | No | Only in comments that correctly frame it as retiring/retired (`scripts/kaola-workflow-claim.js:2388,4744`; `scripts/test-finalize-door.js:411-425` **positively pins its absence** — `assert(!m, '...must not require kaola-workflow-plan-validator.js')`), plus dated `docs/decisions/D-*.md` and `docs/investigations/*.md` (appropriately historical). **No live current-facing doc misclaims it exists.** |
| `replan.js` | No | No | `docs/conventions.md:470` (a **live, current** doc) uses `(replan.js:1474)` as an illustrative example of a citation-abbreviation format — stale in that it names a deleted file as if it were a natural example, though it isn't claiming the mechanism runs today. Mirrored in a `scripts/test-gap-sweep.js` fixture string (test data, not prose). Historical mentions in `docs/decisions/D-585-01.md`, `D-699-01.md` correctly framed. |
| `repair-state.js` | No | No | Every live-code comment that names it is **explicitly past tense** — `scripts/test-validate-script-sync.js:122,205`: *"The floor was 7 while repair-state was a cross-required hand-port; **it is deleted**..."* Confirmed clean: nothing claims it exists today. |
| `detectReviewRuntime` | n/a | **No** — zero matches for the function definition, or any `ReviewRuntime`-named identifier, anywhere in `scripts/` or `plugins/` | **Two live, current docs actively describe it as existing**: `docs/opencode-edition.md:87` — *"Runtime resolution is opencode-aware: `detectReviewRuntime` recognizes the opencode install layout..."* — and `docs/kimi-edition.md:129`, same claim for kimi. **This is the cleanest hard finding of the six**: a function documented as live that has no implementation under this name (or a plausible near-name) anywhere. |
| `closeGroupMember` | n/a | No (was part of the deleted `adaptive-node.js`, confirmed absent repo-wide) | Only in comments, correctly framed as historical justification for a still-running check: `scripts/kaola-workflow-sink-merge.js:1270` and its two forge twins, plus `scripts/simulate-workflow-walkthrough.js:5042` — *"...DELETES the running-set lane_group key (**adaptive-node closeGroupMember** last-member path)..."*, explaining why `lingeringLaneGroupRefusal` exists. Historical `docs/decisions/*` mentions only. **No live prose claims it exists today.** |

**Bottom line**: only `repair-routing.md` (install.sh's dangling comment) and `detectReviewRuntime`
(two live edition docs) are genuine current-tense false claims. `replan.js`'s hit is a minor stale
example, not a claim of current existence. `plan-validator.js`, `repair-state.js`, and
`closeGroupMember` are **already correctly framed as retired** everywhere they're mentioned — I found
no live text claiming otherwise for those three, so no correction is needed there beyond what's
already accurate.

**Recommended correction** — `install.sh:934` comment: drop the specific `repair-routing.md`
citation (the file it cites doesn't ship) or rephrase to describe what's actually verified there.
`docs/opencode-edition.md:87` / `docs/kimi-edition.md:129`: either name the function that actually
does runtime detection today (I did not find one — worth flagging back to whoever owns those docs
rather than guessing a replacement name) or drop the specific-function claim and describe the
behavior generically.

---

## 9. Six documented env knobs with zero readers

**Verdict: TRUE — and the six I independently derived match what the issue implies.**

Method: for every `# KAOLA_X=value` line actually declared in `.env.example` (18 KAOLA_* knobs),
grepped `scripts/` + `plugins/` + all five top-level install scripts for three reader shapes:
`process.env.NAME`, `process.env['NAME']`, an aliased `env.NAME` (many scripts do
`const env = process.env`), and shell `$NAME`/`${NAME}` (to catch a var forwarded from a prompt
surface into a CLI flag, the same pattern `KAOLA_TARGET_ISSUE` legitimately uses — see below).

**Confirmed zero readers, by any of those shapes, anywhere — exactly six:**
`KAOLA_PARALLEL_WRITES`, `KAOLA_TEST_ATTRIBUTION`, `KAOLA_LANE_CONTAINMENT`, `KAOLA_LEG_ISOLATION`,
`KAOLA_GATE_WINDOW_FENCE`, `KAOLA_FANOUT_CAP`.

Corroboration for all six, found in `CHANGELOG.md` itself:
- Line ~178: ADR 0017's retirement entry explicitly lists `KAOLA_FANOUT_CAP` / `KAOLA_PARALLEL_WRITES`
  / `write_overlap_policy` among the knobs retired with the node/DAG executor.
- Line ~539 (issue #768): *"The three dormant write-lane env flags... `KAOLA_LANE_CONTAINMENT`,
  `KAOLA_LEG_ISOLATION`, and `KAOLA_GATE_WINDOW_FENCE` were no-ops... This release removes all of
  it: the two resolvers..."* — i.e. a **prior** issue already deleted their resolvers; `.env.example`
  was never updated to match.
- Line ~394: `KAOLA_TEST_ATTRIBUTION`'s only cited functional backing was a corpus in
  `scripts/test-commit-node.js` — I confirmed **that file no longer exists** (deleted with
  `commit-node.js`, one of ADR 0017's named-retired scripts), so this knob's last real consumer is
  also gone now.

One of the six has a live, user-facing symptom beyond the stale `.env.example` line:
**`install-opencode.sh:502`** still prints *"Disjoint parallel writes are default-ON (set
`KAOLA_PARALLEL_WRITES=0` to force serial)."* — an installer actively telling an operator to set a
variable that nothing reads.

**Two near-miss vars I checked and excluded, with reasons**:
- `KAOLA_WORKTREE_PATH` — also zero-reader as a literal env var, but the *capability* it describes is
  not dead: the real mechanism moved to a `worktree_path:` field written into `workflow-state.md`
  (`scripts/kaola-workflow-claim.js:750,844` etc.), not an environment variable at all. This is a
  misdescribed mechanism, not a purely dead one — I did not fold it into the six.
- `KAOLA_PATH` — also zero-reader, but this is **already correctly documented as intentionally
  inert**: `README.md:1053` says outright *"Retired, with no residue... the claim silently ignores
  this variable"*, and `docs/conventions.md:167-170` says the same. `.env.example` still describes it
  as if it selects a fast-path workflow, which contradicts README/conventions — but that's an
  `.env.example`-vs-README contradiction, not a "knob nobody said was dead" finding, and
  `.env.example` is explicitly the `contract-and-operator` agent's file per the mission list, not
  mine to fix. Flagging for that agent's cross-check.

---

## 10. `kaola-workflow-ledger-compare.js` — installed everywhere, required by claim.js, zero docs

**Verdict: TRUE, all three parts.**

1. **Installed into every consumer repo** — confirmed by running the actual install manifest for all
   three forges:
   ```
   node scripts/kaola-workflow-install-manifest.js --forge=github --scripts | grep ledger
   node scripts/kaola-workflow-install-manifest.js --forge=gitlab --scripts | grep ledger
   node scripts/kaola-workflow-install-manifest.js --forge=gitea  --scripts | grep ledger
   ```
   All three print `kaola-workflow-ledger-compare.js`. `install.sh` sources its `SUPPORT_SCRIPT_NAMES`
   from exactly this manifest (install.sh:118-132), so every forge install ships the file.
2. **Required by claim.js** — `scripts/kaola-workflow-claim.js:3126` and `:3331`:
   `const { compareLedgers } = require('./kaola-workflow-ledger-compare.js');` (two call sites).
3. **Zero docs** — `grep -rln "ledger-compare\|ledger_compare\|LedgerCompare"` across `README.md`,
   `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/workflow-state-contract.md`
   returns **nothing**. It appears only in `CHANGELOG.md` (historical dev-log entries, e.g. the #412
   entry noting it was implemented in #399 but not registered until later) — which is the expected
   place for a shipped feature to appear once, not a live reference surface. `docs/api.md`'s "Module
   Exports" section is exactly where GitHub/GitLab/Gitea's other required scripts (`claim.js`,
   `sink-merge.js`, `run-chains.js`) are documented, and this one is missing from it entirely.

**Recommended correction**: add a `docs/api.md` Module Exports entry for
`scripts/kaola-workflow-ledger-compare.js` — `compareLedgers(...)` — under the GitHub edition section
(and confirm whether the gitlab/gitea per-forge copies need their own line; I did not check their
exact call signature, only that the file ships and is `require()`d by the canonical `claim.js`).

---

## 11. `KAOLA_RUNTIME` — documented nowhere, but live

**Verdict: TRUE.**

Live reader, confirmed at `scripts/kaola-workflow-claim.js:53,62` (and the canonical Codex copy):
```
// Precedence: explicit --runtime (args.runtime) wins; then KAOLA_RUNTIME; then INFER
    || env.KAOLA_RUNTIME
```
This one was missed by a naive `process.env.KAOLA_RUNTIME` grep — it's read through an aliased `env`
object (`env = process.env` earlier in the file), which is why claim 9's sweep above deliberately
checked the aliased-`env.` and shell-`$VAR` shapes too, not just the literal `process.env.` prefix.

Confirmed undocumented: `grep -rn "KAOLA_RUNTIME" .env.example README.md docs/*.md` returns nothing.
The only other repo hits are historical (`kaola-workflow/archive/codex-parity*/...`, dated 2026-05,
describing an **earlier, different** design where `KAOLA_RUNTIME` was explicitly NOT going to be
read — that decision was since reversed, and the archived docs were never revisited, which is exactly
why they're archived and not live).

**Recommended correction**: add `KAOLA_RUNTIME` to `.env.example` and/or the env-var table in
`README.md` (there is already a table near :1053-1054 for `KAOLA_TARGET_ISSUE` etc. — this is the
natural place), documenting the precedence: explicit `--runtime` flag wins, then `KAOLA_RUNTIME`, then
inference.

---

## 12. `docs/opencode-edition.md:73` — post-dominance gates in present tense

**Verdict: TRUE.**

Current text (`docs/opencode-edition.md:72-75`): *"The review mechanism on opencode is the
**adaptive** schema-2 `code-reviewer`/`security-reviewer` **post-dominance gates** and
**review-attempt journal** — the same mechanism Claude Code and Codex use, documented in
`docs/api.md`."*

`post-dominance gates G1–G4` are named explicitly in ADR 0017's "What is retired" list
(`docs/decisions/0017-the-mission-list.md`). The sentence is present-tense ("**is** the... gates") and
additionally claims Claude Code and Codex "use" the same mechanism today, which they do not post-ADR
0017. The cross-reference is doubly stale: `grep -n "post-dominance" docs/api.md` returns **zero**
hits — the doc this sentence points to for the mechanism's definition no longer describes it either.

**Recommended correction**: rewrite to describe what actually gates review today (I did not
investigate what opencode's current review mechanism is — that's outside this audit's identifier-count
scope — but whatever it is, it should not be named "post-dominance gates," and the doc should not
claim Claude Code/Codex share it unless that's independently verified true today).

---

## 13. README.md's retired-era hit count

**Verdict: FALSE as stated — the real count is TWO, not one, and both are already covered by claims
3 and 4 above (not a third, separate hit).**

Method: swept `README.md` for the retired-vocabulary set named in ADR 0017's "What is retired" list —
`node` (execution-unit sense, distinguished from the very common `node scripts/...js` CLI-invocation
sense which is Node.js the runtime, not a workflow node), `workflow-plan.md`, `freeze`/`frozen`,
`post-dominance`, `antichain`, `parallel_safe`, `depends_on`, `plan_hash`, `epoch`, numbered `Phase N`,
`running-set scheduler`, gate `G1`-`G4`, `task mirror`/`task-mirror`, `role node`/`role manifest`/
`ROLE_TOKEN`, and a full listing of every `gate`/`gates` occurrence to separate the retired
post-dominance sense from the many still-live senses (release-check gate, preflight gate, finalize
commit gate, the generic "a review gate reviewing its own writer-context is no gate" judgment line,
metric-optimizer's propose→apply→gate→measure loop — all of these are current and correct, not hits).

**Genuine hits, both already named above:**
- `README.md:1187` — "an implement node... a review-gate node" (claim 4).
- `README.md:1221` — "in-progress node, pending gates, consent markers" (claim 3).

Everything else that matched `\bnode\b` in a first pass (lines 250, 513-514, 552, 554, 1062-1071,
1138-1139, 1400, 1478-1507, 1565) is the literal `node <script>.js` CLI invocation or "Node.js runs" in
the worktree-isolation paragraph at :1400 ("file edits, builds, and node runs in one issue do not
affect another") — none of these are workflow-node vocabulary; they're false positives from the
`\bnode\b` pattern matching the JavaScript runtime name.

**So**: once claims 3 and 4's corrections land, README.md's retired-era hit count goes to **zero**, not
one. There is no third, undiscovered hit to find — the issue's "exactly one" appears to have
double-subtracted (or the filer counted one of the two and missed the other).

---

## The one edit I made (not part of the audit)

Per the dispatch brief, fixed the stale comment at `scripts/validate-kaola-workflow-contracts.js:289`
(inside the `#572` Phase-ban block, unrelated to the manifest-grammar block I own from #882) — it
still named *"the adaptive DAG-of-roles model"*. Changed to *"the adaptive mission-list model"*.
Comment-only; no logic touched.

Re-ran the validator immediately after:
```
$ node scripts/validate-kaola-workflow-contracts.js
Kaola-Workflow Codex contract validation passed
$ echo $?
0
```
**This came back green, not red.** The dispatch brief expected red from a concurrent agent's
in-flight `planner.toml` vs `config/agents.toml` mismatch — but by the time I ran this, that agent's
work (visible to me as tasks #55/#56/#57: "port prompt-defense block into 11 codex TOMLs", "remove
retired numbered-phase prose", "reconcile planner.toml to canonical") had already completed. The red
window closed before I got here; not a red I fixed or worked around.

---

## Summary table

| # | claim | verdict | correct value / fix |
|---|---|---|---|
| 1 | 15 role TOMLs | TRUE | 14 (confirmed 7 independent ways) |
| 2 | "three runtimes" omits kimi | TRUE | four; add install-kimi.sh block |
| 3 | compact hook stale artifact list | TRUE | active project/goal/next-skill/in-flight/progress |
| 4 | per-node validation scoping | TRUE | reword to item-based, drop "node"/"review-gate node" |
| 5 | architecture.md sampling wrong | TRUE | 1 sampled, 4 deferred (conventions.md already right) |
| 6 | api.md Gitea sink-merge exports | PARTLY | 5 undocumented real exports, not 3; ensureMergeReady doesn't exist |
| 7 | "six" workflow-init surfaces | TRUE | twelve; guard only covers six (real coverage gap) |
| 8 | six dead identifiers | PARTLY | only repair-routing.md + detectReviewRuntime are live false claims |
| 9 | six dead env knobs | TRUE | PARALLEL_WRITES/TEST_ATTRIBUTION/LANE_CONTAINMENT/LEG_ISOLATION/GATE_WINDOW_FENCE/FANOUT_CAP |
| 10 | ledger-compare.js undocumented | TRUE | add docs/api.md entry |
| 11 | KAOLA_RUNTIME undocumented | TRUE | document precedence: flag > env > infer |
| 12 | opencode-edition.md post-dominance | TRUE | rewrite in terms of what actually gates review today |
| 13 | README has ONE retired-era hit | FALSE | two hits, both already = claims 3 & 4; zero left after those land |
