# Investigation: cross-edition census for the `kw:claim` marker leak in sink-merge

## Setup

- Commit: `ecdb2c88e359ca77bf99bf692309ba58bff0ac6a`, branch `main`
- Working tree: clean except untracked `kaola-workflow/issue-936/`
- Node scripts only; no build. All commands run from the repo root.
- `git config --get init.defaultBranch` → **UNSET**. Per the standing caution, `test-gitlab-sinks.js`
  / `test-gitea-sinks.js` red at baseline on this box for that reason alone. Not re-measured here;
  flagged because those two suites are in-chain (see §5).
- A disposable copy of `HEAD` (`git archive HEAD | tar -x`, 8973 files, 51.7 MB) was extracted to the
  scratchpad for the two mutation proofs, then deleted. **No tracked file was modified.**

---

## 1. Every copy — full inventory

`find . -name "*claim*.js" -o -name "*sink-merge*"` (excluding `node_modules`, `.git`).

There are **8 production copies: 4 of each script.** Nothing else in the repo is a copy of them.

| # | Path | Bytes | Lines | sha256 (16) |
|---|---|---|---|---|
| C1 | `scripts/kaola-workflow-claim.js` | 390787 | 6608 | `c79ea909efcf6de8` |
| C2 | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 390787 | 6608 | `c79ea909efcf6de8` |
| C3 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 365404 | 6263 | `bec3a8df75ad2721` |
| C4 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 364671 | 6255 | `62fc068937e8f1e6` |
| S1 | `scripts/kaola-workflow-sink-merge.js` | 202379 | 3220 | `62f77c876b6658ed` |
| S2 | `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | 202379 | 3220 | `62f77c876b6658ed` |
| S3 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | 165854 | 2616 | `05e02b05a7bc2ba4` |
| S4 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | 165591 | 2610 | `312a834c6a7a1e44` |

### The runtime-edition axis carries ZERO copies

`find .opencode* .kimi* -type f \( -name "*claim*" -o -name "*sink*" \)` → **no output.**

The six edition dirs are prose-only: `.opencode` (19 tracked files: `agent/*.md`, `command/*.md`,
`plugins/kaola-workflow-hooks.js`, `hooks/*.sh`), `.opencode-gitea`, `.opencode-gitlab` (19 each),
`.kimi` (19: `skills/*/SKILL.md` + hooks), `.kimi-gitea`, `.kimi-gitlab` (22 each).

**Codex is not a separate directory axis.** Codex consumes `plugins/kaola-workflow{,-gitlab,-gitea}/`
— the same trees Claude's plugin marketplace uses — distinguished only by a `.codex-plugin/plugin.json`
alongside `.claude-plugin/plugin.json`.

So the census is **4 copies on the forge axis** (canonical + codex-plugin + gitlab + gitea), and the
runtime axis multiplies **nothing**.

There is also a full mirror at `.kw/worktrees/issue-936/` — a git worktree of this same repo, not an
independent copy. Excluded from all counts.

---

## 2. Marker / label token counts per copy

`grep -c` per file.

| Copy | `clearAdvisoryClaim` | `kw:claim` | label-removal primitive |
|---|---|---|---|
| C1 canonical claim | 14 | 7 | 4× `--remove-label` |
| C2 codex claim | 14 | 7 | 4× `--remove-label` |
| C3 gitlab claim | 13 | 7 | 4× `unlabels:` |
| C4 gitea claim | 13 | 7 | 5× `updateIssueLabels` |
| **S1 canonical sink-merge** | **1 (comment only)** | **0** | **6× `--remove-label`** |
| **S2 codex sink-merge** | **1 (comment only)** | **0** | **6× `--remove-label`** |
| **S3 gitlab sink-merge** | **0** | **0** | **7× `unlabels:`** |
| **S4 gitea sink-merge** | **0** | **0** | **7× `updateIssueLabels`** |

### The premise is confirmed, in all four sink copies

`clearAdvisoryClaim` appears in S1/S2 exactly once, and it is **prose**, not a call:

```
scripts/kaola-workflow-sink-merge.js:965:    // entirely on cmdFinalize's earlier per-member clearAdvisoryClaim. Make the keep-open arm
```

Canonical sink-merge's six label-removal sites, none of which touch the marker:

```
961:  try { ghExec(['issue','edit',String(args.issue),'--remove-label','workflow:in-progress'], forgeOpts); claimLabelRemoved = 'removed'; } catch (_) { claimLabelRemoved = 'failed'; }
971:  (keep-open bundle non-primary members)
996:  (bundle close loop, success path)
1006: (bundle close loop, already-closed path)
2829: (second arm, primary)
2840: (second arm, bundle members)
```

Gitlab equivalents at `:584, :876, :884, :908, :917, :2490, :2498`; gitea at
`:581, :870, :879, :904, :913, :2483, :2491`. The forge ports have **7** sites vs canonical's 6 —
the extra one is `closeLinkedIssue()`, a function that **does not exist in canonical**
(`grep -n closeLinkedIssue scripts/kaola-workflow-sink-merge.js` → no output).

### Where the marker IS deleted (claim.js only), and where it is NOT

Two functions in canonical claim.js delete the marker:

- `clearAdvisoryClaim` (`scripts/kaola-workflow-claim.js:957-981`) — label removal at `:961`,
  marker list+delete at `:970-978`.
- `removeBundleLabel` (`scripts/kaola-workflow-claim.js:1610-1627`) — hard label removal at `:1613`,
  marker list+delete at `:1618-1626`.

**Two more label-removal sites in canonical claim.js also skip the marker** — the same defect class as
the sink, adjacent to the issue's stated scope:

- `closeIssueIdempotent` (`scripts/kaola-workflow-claim.js:245`) — removes the label after a close,
  no marker delete.
- `cmdRepairLabels` (`scripts/kaola-workflow-claim.js:5789`) — the stale-label repair sweep removes
  `CLAIM_LABEL` from closed issues, no marker delete.

Whether those two are in scope is a scoping call, not a measurement. I am reporting them because a fix
that only touches sink-merge leaves the same leak reachable through `cmdRepairLabels` — which is the
subcommand a user runs *specifically* to clean up stale claims.

### The detector that makes the leak matter

`scripts/kaola-workflow-classifier.js:215` (and its 3 twins):

```js
if (!comment || !comment.body || !/<!--\s*kw:claim\s+(project|sess)=/.test(comment.body)) return false;
if (!comment.updated_at) return true;
return Date.now() - new Date(comment.updated_at).getTime() < 24 * 60 * 60 * 1000;
```

A leaked marker blocks re-claim for **24 hours**, then self-heals. That bounds the blast radius.

---

## 3. Classification of each copy — proven, not guessed

### C2 / S2 (codex plugin) = **COMMON-byte identical to canonical**

Not generated. Held identical by a *guard*, and repaired by a *generator* that must be run by hand.

- Hash equality: `c79ea909efcf6de8 == c79ea909efcf6de8`, `62f77c876b6658ed == 62f77c876b6658ed` (§1).
- `scripts/validate-script-sync.js` lists both base names in `COMMON_SCRIPTS`
  (`:46 'kaola-workflow-claim.js'`, `:51 'kaola-workflow-sink-merge.js'`).
- Guard run at HEAD:
  ```
  $ node scripts/validate-script-sync.js
  OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families,
      2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
      committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
  exit=0
  ```

**MUTATION A — proof the guard is armed.** In the disposable HEAD copy, appended one comment line to
`scripts/kaola-workflow-claim.js` and left `plugins/kaola-workflow/scripts/` untouched:

```
Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):
  - kaola-workflow-claim.js

Fix: copy the canonical version. Example:
  for f in kaola-workflow-claim.js; do
    cp "scripts/$f" "plugins/kaola-workflow/scripts/$f"
  done
MUT-A exit=1
```
Restoring the file returned exit 0. **A canonical-only edit fails the chain.**

Note the sync direction: `scripts/edition-sync.js --write` (`npm run sync:editions`) is the repair
tool; the guard only *polices*. Editing C2 by hand and forgetting C1 is equally red.

### C3 / C4 / S3 / S4 (gitlab, gitea) = **DIVERGENT hand-ports**

Not GENERATED, not RENAME_NORMALIZED. `validate-script-sync.js` reports exactly **1** rename-normalized
family at HEAD, and it is `kaola-workflow-compact-context.js` (per its own `:27` comment) — not these.

**Measured**, by applying an aggressive rename normalization to the gitlab port
(`kaola-gitlab-workflow-` → `kaola-workflow-`, `gitlab`→`github`, `GitLab`→`GitHub`, `glab`→`gh`,
`issueIid`→`issueNumber`, `issue_iid`→`issue_number`) and diffing against canonical:

| Pair | canonical lines | normalized port lines | residual diff lines (`^[<>]`) |
|---|---|---|---|
| claim (C1 vs C3) | 6608 | 6263 | **3123** |
| sink-merge (S1 vs S3) | 3220 | 2616 | **2620** |

For sink-merge the residual diff (2620) is **larger than the port itself** (2616 lines) — i.e. after
normalization essentially nothing lines up. These are independent implementations sharing a contract,
not renamed copies. **Any fix must be hand-ported twice, in each port's own idiom.**

### What DOES bind the divergent ports to canonical: the export-superset guard

`scripts/validate-script-sync.js:485-486`:

```js
{ label: 'forge claim module.exports superset',      canonical: 'scripts/kaola-workflow-claim.js',      ports: forgeBothPorts('claim'), canonicalOnly: ['ghExec'] },
{ label: 'forge sink-merge module.exports superset', canonical: 'scripts/kaola-workflow-sink-merge.js', ports: forgeBothPorts('sink-merge') },
```

Each port's `module.exports` must be a **superset** of canonical's (minus `ghExec`). Current surface:

- canonical claim.js: **52** exports. `clearAdvisoryClaim` is **NOT** exported. `postAdvisoryClaim` IS.
- canonical sink-merge.js: **2** exports — `classifyMergeError`, `assertBranchHasNonWorkflowChanges`.
- gitlab/gitea claim.js **do** export `clearAdvisoryClaim` (`:6220` / `:6212`) — superset direction, legal.
- canonical sink-merge requires from claim.js (`scripts/kaola-workflow-sink-merge.js:6`):
  `getCoordRoot, mainRootFromCoord, resolveMainRoot, readActiveFolders, removeWorktree,`
  `buildClosureReceipt, checkClosureInvariants, defaultBranch, appendClosureBlock` — **9 names,
  `clearAdvisoryClaim` not among them.**

**MUTATION B — proof this guard is armed.** Appended
`module.exports.deleteClaimMarkerComment = function () {};` to **both** C1 and C2 (keeping byte-identity
green so only the superset arm could fire):

```
Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):
  - forge claim module.exports superset: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js omits canonical export(s) [deleteClaimMarkerComment] — a forge script require()s these by name, so an omission TypeErrors on a failing path (#550 class)
  - forge claim module.exports superset: plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js omits canonical export(s) [deleteClaimMarkerComment] — a forge script require()s these by name, so an omission TypeErrors on a failing path (#550 class)
MUT-B exit=1
```

**This is the hard constraint on the fix's shape.** If the fix exports a new helper from canonical
claim.js so sink-merge can `require` it, both forge claim ports MUST export a same-named function.
An unexported local helper inside each sink copy avoids this entirely.

---

## 4. The forge-specific primitives — comment deletion EXISTS in all three

This was the open question that could change the fix's shape. **It does not: all three forges have a
list primitive and a delete primitive, already written, already exported, already used by
`clearAdvisoryClaim`.**

| | GitHub (canonical) | GitLab | Gitea |
|---|---|---|---|
| CLI | `gh` (`ghExec`) | `glab` (`glabExec`) | `tea` (`teaExec`) |
| Remove label | `gh issue edit <n> --remove-label <L>` | `forge.updateIssue(iid, { unlabels: [L] })` | `forge.updateIssueLabels(project, n, { remove: [L] })` |
| List comments | `gh api repos/{owner}/{repo}/issues/<n>/comments` | `forge.listIssueNotes(project, iid)` → `glab api projects/<ref>/issues/<iid>/notes` | `forge.listIssueComments(project, n)` → `tea api /api/v1/repos/<full_name>/issues/<n>/comments` |
| **Delete comment** | `gh api --method DELETE repos/{owner}/{repo}/issues/comments/<id>` | **`forge.deleteIssueNote(project, iid, noteId)`** → `glab api --method DELETE projects/<ref>/issues/<iid>/notes/<noteId>` | **`forge.deleteIssueComment(project, n, commentId)`** → `tea api -X DELETE /api/v1/repos/<full_name>/issues/comments/<id>` |
| Defined at | inline in claim.js `:970-978` | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js:170` (list), `:189` (delete) | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:200` (list), `:219` (delete) |
| Exported? | n/a (inline) | yes — `kaola-gitlab-forge.js:238, :242` | yes — `kaola-gitea-forge.js:310` |
| Reachable from sink-merge? | inline `ghExec` already present | **yes** — `sink-merge:8 const forge = require('./kaola-gitlab-forge')` | **yes** — `sink-merge:8 const forge = require('./kaola-gitea-forge')` |

Note the endpoint asymmetry, which a naive port would get wrong:
- GitHub and Gitea delete at a **repo-level** endpoint that omits the issue index
  (`/issues/comments/<id>`).
- GitLab deletes at an **issue-scoped** endpoint (`/issues/<iid>/notes/<noteId>`).

Both forge sink-merge files already `require` their forge module at line 8, so no new import is needed
anywhere. **The fix's shape is not constrained by a missing primitive.**

### The marker literal is identical across all four claim copies

`'<!-- kw:claim project=' + project + ' -->'` — C1 `:937, :972, :1602, :1619`; C3 `:806, :825, :1091, :1111`;
C4 `:806, :829, :1094, :1113`. Project-scoped match with the trailing ` -->` (so `issue-92` cannot match
`issue-920`), falling back to `/<!--\s*kw:claim\s+project=/` when the slug is null.

**The sink knows the project slug**: `args.project` is already threaded (e.g.
`readProjectInfo(root, args.project)` at gitea sink `:870`).

---

## 5. Every guard and test that fires — and which chain runs it

`run-chains.js` resolves chains from `package.json` (`resolveChains`, `:874-887`;
`KNOWN_CHAINS = ['claude','codex','gitlab','gitea']`, `:198`) and hoists any step appearing in >1 chain
into a **one-time serial preamble**. Computed hoist set for the steps relevant here:

| Guard / suite | Runs in | Preamble? |
|---|---|---|
| `edition-sync.js --materialize-kernel` | claude, codex, gitlab, gitea | HOISTED ×4 |
| **`validate-script-sync.js`** (byte-identity + export-superset) | claude, codex | **HOISTED ×2** |
| `validate-vendored-agents.js` | claude, gitlab, gitea | HOISTED ×3 |
| `edition-sync.js --check` | gitlab, gitea | HOISTED ×2 |
| `test-forge-claim-rollback-scoping.js` | all 4 | HOISTED ×4 |
| `test-forge-claim-reserved-project.js` | all 4 | HOISTED ×4 |
| `generate-routing-surfaces.js --check` | all 4 | HOISTED ×4 |
| `test-validate-script-sync.js` | claude | chain-local |
| `validate-workflow-contracts.js` | claude | chain-local |
| `simulate-workflow-walkthrough.js --shard auto/12` | claude | chain-local, **1/12 sample** |
| `validate-kaola-workflow-contracts.js` | codex | chain-local |
| `simulate-kaola-workflow-walkthrough.js` (1959 lines, own suite) | codex | chain-local |
| `validate-kaola-workflow-gitlab-contracts.js` | gitlab | chain-local |
| `simulate-gitlab-workflow-walkthrough.js` | gitlab | chain-local |
| `simulate-gitea-workflow-walkthrough.js` | gitea | chain-local |

All three guards are green at HEAD:
```
$ node scripts/validate-script-sync.js          → exit 0
$ node scripts/edition-sync.js --check          → "8 forge aggregator ports in parity with canonical." exit 0
$ node scripts/generate-routing-surfaces.js --check → "all 18 surfaces byte-match the skeleton." exit 0
```

### Contract validators that token-pin `kw:claim`

- `scripts/validate-workflow-contracts.js:304` →
  `assertIncludes('scripts/kaola-workflow-classifier.js', 'kw:claim\\s+(project|sess)=')` (claude chain)
- `scripts/validate-kaola-workflow-contracts.js:168` → same pin against the codex plugin tree (codex chain)

These pin the **classifier's detector regex**, not the sink. A sink-merge change does not trip them.
Also relevant: `validate-workflow-contracts.js:305` pins `readActiveFolders` in canonical sink-merge,
and `:172` of the codex validator pins the same in the plugin twin — so don't remove that call.

### **The coverage hole — the most important finding in this section**

```
=== test-sink-merge.js in ANY of the 4 chains? === false
=== test-claim-hardening.js in ANY of the 4 chains? === false
```

`scripts/test-sink-merge.js` (150 KB, the dedicated sink suite) appears **only** in
`test:kaola-workflow:claude:full` — the tier CLAUDE.md states is *never mandated*. It is not invoked by
`simulate-workflow-walkthrough.js` either (the only hit there is a comment at `:10962`). So:

**A change to canonical/codex `sink-merge.js` gets no dedicated-suite coverage in a mandated four-chain
run.** The claude chain would exercise it only through the walkthrough at a rotating **1/12 shard**.

The forge ports are covered **better** than canonical here:
- `simulate-gitlab-workflow-walkthrough.js:752,753,754` → runs `test-gitlab-forge-helpers.js`,
  `test-gitlab-workflow-scripts.js`, `test-gitlab-sinks.js`
- `simulate-gitea-workflow-walkthrough.js:839,840,841` → the gitea equivalents
- The codex-flavoured gitlab/gitea walkthroughs also run the sink suites (`:140` each)

So a gitlab/gitea sink change IS chain-covered; a canonical/codex sink change is effectively not.
**Whoever verifies the fix must run `node scripts/test-sink-merge.js` explicitly** — a green four-chain
receipt does not include it.

### Existing test coverage of the marker, measured

| Suite | `kw:claim` | `claim_label_removed` | in-chain? |
|---|---|---|---|
| `scripts/simulate-workflow-walkthrough.js` | 6 | 24 | claude, 1/12 shard |
| `scripts/test-sink-merge.js` | **0** | **0** | **no chain** |
| `plugins/…gitlab/scripts/test-gitlab-sinks.js` | **0** | 3 | gitlab (via walkthrough) |
| `plugins/…gitea/scripts/test-gitea-sinks.js` | **0** | 3 | gitea (via walkthrough) |
| `plugins/…gitlab/scripts/test-gitlab-forge-helpers.js` | 3 | — | gitlab (via walkthrough) |
| `plugins/…gitea/scripts/test-gitea-forge-helpers.js` | 3 | — | gitea (via walkthrough) |

**No sink suite, on any forge, asserts anything about the `kw:claim` marker today.** The existing
marker tests are all claim-side: `testClearAdvisoryClaimDeletesMarkerComment` (registered at
`simulate-workflow-walkthrough.js:12170`, defined `:7296`), plus the foreign-project and offline arms
at `:7366` / `:7409`. All three are shard-registry members, so the fast gate samples them 1-in-12.

The hoisted per-edition claim suites (`test-forge-claim-rollback-scoping.js`,
`test-forge-claim-reserved-project.js`, `test-forge-finalize-findings.js`) each drive all four editions
but contain **0** references to `clearAdvisoryClaim` and **0** to `kw:claim`. They are the natural
home for a new all-four-editions marker leg, and they already have the per-edition drive harness.

---

## 6. What `install.sh` actually ships

Traced through `install.sh:94-108` and `:655-675`.

```bash
github: SOURCE_SCRIPTS_DIR="$SCRIPT_DIR/scripts"                                  # ← CANONICAL
gitlab: SOURCE_SCRIPTS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitlab/scripts"
gitea:  SOURCE_SCRIPTS_DIR="$SCRIPT_DIR/plugins/kaola-workflow-gitea/scripts"
...
cp "$script_file" "$SUPPORT_SCRIPTS_DIR/$script_name"    # :672
```

Names come from `scripts/kaola-workflow-install-manifest.js` (single-sourced since #407). Verified per
forge:

```
$ node scripts/kaola-workflow-install-manifest.js --forge=github --scripts | grep -n 'claim\|sink'
1:kaola-workflow-claim.js
7:kaola-workflow-sink-merge.js
8:kaola-workflow-sink-pr.js
--forge=gitlab → kaola-gitlab-workflow-claim.js, kaola-gitlab-workflow-sink-merge.js, …-sink-mr.js
--forge=gitea  → kaola-gitea-workflow-claim.js,  kaola-gitea-workflow-sink-merge.js,  …-sink-pr.js
```

**Confirmed: for `--forge=github`, install.sh copies the CANONICAL `scripts/` copy (C1/S1) to the
consumer.** It never reads `plugins/kaola-workflow/scripts/`. The only per-name override in the loop
is `kaola-workflow-adaptive-schema.js` (`:663-665`), forced to canonical for all forges.

The install fails **closed** (`:668-671`): an allowlisted name missing from source is exit 1.

**C2/S2 (`plugins/kaola-workflow/scripts/`) reach consumers via the Codex plugin marketplace**, which
registers the plugin directory in place — not via a script copy. `install-all.sh:156-158` maps
`github → plugins/kaola-workflow`, and `:493` runs `install-codex-agent-profiles.js` from that tree.
`install-opencode.sh` / `install-kimi.sh` ship no scripts at all (§1).

So **both** C1/S1 and C2/S2 are live consumer-facing surfaces, by two different mechanisms. Fixing one
and not the other ships a half-fix to half the runtimes — and `validate-script-sync` catches it (Mutation A).

---

## 7. Total write set for a complete fix

### Mandatory — the production change (4 files, all must move together)

| File | Reason |
|---|---|
| `scripts/kaola-workflow-sink-merge.js` | The defect. Ships to github consumers via `install.sh`. |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Byte-identity with canonical is enforced (Mutation A); ships to Codex via the marketplace. Use `node scripts/edition-sync.js --write`, don't hand-copy. |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | DIVERGENT hand-port (2620 residual diff lines). Own idiom: `forge.listIssueNotes` / `forge.deleteIssueNote`, issue-scoped DELETE endpoint. 7 label sites incl. `closeLinkedIssue` which canonical lacks. |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | DIVERGENT hand-port. Own idiom: `forge.listIssueComments` / `forge.deleteIssueComment`, repo-level DELETE endpoint. Same 7-site shape. |

### Conditional — only if the fix exports a new name from claim.js

| File | Reason |
|---|---|
| `scripts/kaola-workflow-claim.js` + `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | If a shared helper is exported for sink-merge to `require`. Both, byte-identically. |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | **Forced** by the export-superset guard (Mutation B) — must export the same name or the chain reds. |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same. |

*An unexported local helper inside each of the 4 sink files avoids all four of these.* No forge module
changes are needed either way — the primitives exist and are already `require`d at line 8 of each port.

### Tests — authored by someone other than the implementer (test-custody rule)

| File | Reason |
|---|---|
| `scripts/test-sink-merge.js` | The dedicated canonical suite. Currently 0 `kw:claim` assertions. **Runs in no chain** — must be run by hand. |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | In-chain via the gitlab walkthrough. Currently 0 `kw:claim` assertions. |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | In-chain via the gitea walkthrough. Currently 0 `kw:claim` assertions. |
| `scripts/simulate-workflow-walkthrough.js` | The only claude-chain surface that can see this (1/12 shard). Register alongside the existing `testClearAdvisoryClaim*` family at `:12170`. |
| *(optionally)* `scripts/test-forge-claim-rollback-scoping.js` or a sibling `test-forge-*` | The only suites hoisted into **all four** chains that drive all four editions. A leg here is the one place a marker assertion runs once and covers every edition. |

### Docs — required by the standing "user-visible change" rule

| File | Reason |
|---|---|
| `CHANGELOG.md` | Under `[Unreleased]` → `### Fixed`. |
| `docs/api.md` | `:1281` currently asserts "Receipt wiring — `clearAdvisoryClaim` returning the status enum and finalize/watch emitting `claim_label_removed` — is shared across all three forges." If the sink gains marker deletion, that sentence's scope changes. `claim_label_removed` is also documented at `:298, :1023, :1066, :1145, :1169`. |
| `docs/workflow-state-contract.md:298` | Lists `claim_label_removed` among receipt fields — touch only if the receipt shape changes. |

### Explicitly NOT in the write set — measured, not assumed

- `.opencode*`, `.kimi*` (6 dirs) — carry no copy of either script.
- `templates/routing/*.skeleton.md` — no claim-release prose; `generate-routing-surfaces.js --check`
  reports 18 surfaces byte-matching and is unaffected by a `.js` change.
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` — the delete primitives already exist
  and are already exported.
- All 4 `kaola-workflow-classifier.js` copies — the detector is correct; the marker's *presence* is
  the bug, not its detection.

---

## Inferences

Labelled as inferences, distinct from the measurements above.

1. **The fix needs no new forge capability.** — confidence: high. Refuted by: finding a sink code path
   that cannot reach `args.project` / `projectInfo`, since the marker match is project-scoped.
2. **The export-superset guard, not byte-identity, is the real cost driver** — byte-identity is repaired
   by one `edition-sync --write`; the superset guard forces hand-edits in two DIVERGENT 365 KB ports.
   confidence: high (Mutation B). Refuted by: keeping every new helper unexported.
3. **A green four-chain receipt would not see a canonical sink-merge regression.** — confidence: high.
   `test-sink-merge.js` is in no chain; the walkthrough samples 1/12. Refuted by: showing a
   walkthrough scenario that covers the sink's claim-release path in every shard.
4. **`cmdRepairLabels` (`claim.js:5789`) is the same defect and is arguably worse** — it is the
   subcommand a user runs *to clean up stale claims*, and it removes the label while leaving the
   marker. confidence: medium (read, not executed against a live forge). Refuted by: showing another
   code path deletes the marker before/after that sweep.
5. **The leak is self-healing after 24h** (classifier `:215-219`), so this is a latency bug, not a
   permanent block. confidence: high. Relevant to sizing, not to whether to fix.

## Open

- **Not measured: the live end-to-end leak.** Reproducing it needs a real `gh`-backed issue on a real
  repo — a mutating, outward-facing action against GitHub. I did not run it. The static evidence is
  strong (the marker is posted at `claim.js:937`, the sink at `:961` removes only the label, the
  detector at `classifier.js:215` reads the marker for 24h), but the end-to-end claim → sink → re-claim
  cycle is unproven by execution.
- **Not measured: baseline health of the gitlab/gitea chains on this box.** `init.defaultBranch` is
  unset, which is known to red `test-gitlab-sinks.js` / `test-gitea-sinks.js` at baseline. Anyone
  taking a receipt here must establish that baseline first or the reds will read as a repo bug.
- **Not measured: whether `closeIssueIdempotent` (`claim.js:245`) is reachable on a path where the
  marker still matters** — it removes the label right after closing the issue, and a closed issue may
  be filtered upstream by the classifier before the marker check.
- **Not run: `npm test`.** No chain was executed; this census is static plus two targeted guard
  mutations against a disposable copy.
