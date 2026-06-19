# Adaptive Workflow Plan — issue-538

<!-- plan_hash: a05f3b09cef5cefe8de6275ab9298baf17a29c1cc8972a9ea8dafd720bbebdae -->

Flip the path switch: adaptive is the unconditional default; `fast`/`full` become
install-time opt-ins. Retire the adaptive on/off switch (`enable_adaptive`,
`resolveEnableAdaptive`, `WORKFLOW_PATHS_NO_ADAPTIVE`, `target_set_not_adaptive`,
the adaptive-under-OFF refusal) and every auto-fallback to a non-adaptive path. The
config field flips `enable_adaptive: bool` → `installed_paths: [...]` (adaptive
implicit-always). Mostly subtraction (CLAUDE.md precedence #3 — resist new mechanism).

## Meta

labels: enhancement, area:scripts, area:workflow-router
speculative_open_policy: off

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-architect | code-architect | — | — | 1 | sequence | opus |
| n2-schema | tdd-guide | n1-architect | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js | 4 | sequence | opus |
| n3-claim | tdd-guide | n2-schema | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-claim-hardening.js, scripts/test-bundle-claim.js, scripts/test-bundle-state.js | 7 | sequence | opus |
| n4-classifier | implementer | n2-schema | scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js | 4 | sequence | sonnet |
| n5-installer | tdd-guide | n1-architect | install.sh, uninstall.sh, scripts/test-install-adaptive-config.js | 3 | sequence | sonnet |
| n6-router-prose | implementer | n1-architect | commands/workflow-next.md, commands/kaola-workflow-adapt.md, commands/kaola-workflow-fast.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md | 16 | sequence | opus |
| n7-contracts | tdd-guide | n3-claim, n4-classifier, n5-installer, n6-router-prose | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js | 6 | sequence | opus |
| n7b-walkthroughs | tdd-guide | n2-schema, n3-claim, n4-classifier, n5-installer | scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 8 | sequence | sonnet |
| n6b-residual-prose | implementer | n6-router-prose | commands/kaola-workflow-phase1.md, plugins/kaola-workflow/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md, docs/decisions/0007-adaptive-default-under-switch-on.md, scripts/test-install-model-rendering.js | 10 | sequence | opus |
| n8-review | code-reviewer | n7-contracts, n7b-walkthroughs, n6b-residual-prose | — | 1 | sequence | opus |
| n9-docs | doc-updater | n8-review | docs/decisions/D-538-01.md, README.md, docs/architecture.md, docs/conventions.md, docs/workflow-state-contract.md, docs/api.md | 6 | sequence | sonnet |
| n10-finalize | finalize | n9-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

**Architecture keystone (n1-architect → D-538-01).** `code-architect` is READ-ONLY — it
produces the written design SPEC (no write set); the ADR file `docs/decisions/D-538-01.md`
is WRITTEN by n9-docs (the doc-updater resolves the record per the #337 numbering note).
The config-format decision (`enable_adaptive: bool` → `installed_paths: [...]`, adaptive
implicit-always) and the "no automatic fallback to a non-adaptive path" rule are the
load-bearing decisions that constrain every downstream node: the schema kernel, claim.js
validation, the classifier config default, the installer's union/preserve semantics, and
the router prose. The spec/ADR records: (a) the switch axis flip (retire `enable_adaptive`;
the only switch is which extra paths are installed); (b) `claimProject` validates
`KAOLA_PATH ∈ {adaptive} ∪ installed_paths`; (c) re-install unions `installed_paths` with
`--with-*` and never removes; reset = uninstall→reinstall; (d) the dead-code removal list.
Next free record is **D-538-01** (verified against `docs/decisions/`; latest existing is
`D-528-01 (existing)`).

**n2-schema (×4 byte-identical anchor).** `kaola-workflow-adaptive-schema.js` is a
BYTE_IDENTICAL ×4 group (`validate-script-sync.js` BYTE_IDENTICAL_GROUPS) — all four
copies MUST be edited identically in this ONE node. Scope: retire
`WORKFLOW_PATHS_NO_ADAPTIVE` (L23), `resolveEnableAdaptive` + `ENABLE_ADAPTIVE_FIELD`
(L388-409), the `adaptiveEnabled` arg of `isLegalWorkflowPath` (L541-542); add the
`installed_paths` resolution (legal = `{adaptive} ∪ installed_paths`); update the
`module.exports` block (L571+). **#537 coexistence:** #537 edits the SAME file in the
tier/variant region (~L47-64, `mapTier`/`codex_reasoning_effort`) — a SEPARATE region
that does not interact semantically. If #537 lands first, expect a mechanical rebase +
×4 byte-identity resync; the regions are non-overlapping so the merge is mechanical.
tdd-guide: a unit test over the new `installed_paths` legality resolution (RED first).

**n3-claim (COMMON byte pair + 2 rename-normalized forge ports).**
`kaola-workflow-claim.js` is COMMON_SCRIPTS (claude↔codex byte-identical) +
RENAME_NORMALIZED_FAMILIES forge ports (`kaola-gitlab-workflow-claim.js`,
`kaola-gitea-workflow-claim.js`). Canonical spec for the two forge ports = the **full
accumulated root diff** of `scripts/kaola-workflow-claim.js` vs the run base
(`git diff <base>..HEAD -- scripts/kaola-workflow-claim.js`), mirrored modulo forge
nouns. Four switch-reader sites to update: `claimProject` (~L833), `claimProjectBundle`
(~L1287, remove the `target_set_not_adaptive` early-return), `cmdPickNext` (~L1393,
remove the adaptive-under-OFF `!adaptiveEnabled` refusal), and the resume-path comment
(~L1522). Replace `resolveEnableAdaptive`/`WORKFLOW_PATHS_NO_ADAPTIVE`/
`isLegalWorkflowPath(path, adaptiveEnabled)` with the new `installed_paths` legality
check; AC7 — `KAOLA_PATH` naming a non-installed path is a TYPED NOTICE, not a silent
adaptive substitution and not a crash. The three claim-related test files
(`test-claim-hardening.js`, `test-bundle-claim.js`, `test-bundle-state.js`) reference
`resolveEnableAdaptive`/`enable_adaptive`/`KAOLA_ENABLE_ADAPTIVE`/`target_set_not_adaptive`
and MUST move with claim.js. tdd-guide: RED the new typed-notice behavior first.

**n4-classifier (COMMON byte pair + 2 rename-normalized forge ports).**
`kaola-workflow-classifier.js` reads the config default `{ parallel_mode: 'auto',
enable_adaptive: false }` (~L175) and requires the schema anchor; it also references
`resolveEnableAdaptive` — drop the retired call/default and read the `installed_paths`-
shaped config. Forge ports (`kaola-gitlab-workflow-classifier.js`,
`kaola-gitea-workflow-classifier.js`) mirror the root diff modulo forge nouns.
`implementer` — config-default + dead-call removal, no natural failing unit test
(non_tdd_reason: config-shape default + retired-symbol removal, behavior verified by the
n7b walkthrough chains and n7 contracts, not a new unit assertion).

**n5-installer.** `install.sh` (single file, forge via `--forge`) ships adaptive-only by
default; adds `--with-fast`/`--with-full`; retires `--enable-adaptive` (warns-and-ignores,
points at the new flags); writes `installed_paths` to config via read-modify-write that
UNIONS (never removes) on re-install; the stale-file cleanup loop (~L222-246) must SPARE
an installed path's command/skill files; `uninstall.sh` removes the config so the next
install comes up adaptive-only (reset semantics). `test-install-adaptive-config.js`
re-asserts the `installed_paths` field, `--with-fast`/`--with-full` install + preserve,
re-install-preserves, and uninstall→reinstall-adaptive-only (ACs 1-5). Disjoint write set
from n2/n3/n4/n6 → overlaps the schema→claim chain. tdd-guide: the config-shape assertions
are the RED.

**n6-router-prose (#400 SIX surfaces + 2 forge command copies — ONE node).** A single
SEMANTIC change (Branch-A deletion, Step 0a-1 collapse, keyword-conditional-on-installed,
adapt.md exhaustion floor) spanning all six route surfaces + the two forge command copies.
Kept in ONE node (#309: file-disjointness is not semantic independence — parallel editors
would diverge the prose; #254 router-rewrite parity defect). Canonical spec: the Claude
`commands/workflow-next.md` rewrite is authoritative; every other surface mirrors it
verbatim modulo forge nouns. Concrete edits: (a) delete Branch A + the switch-resolution
sub-step from `workflow-next.md` Step 0a-1 (~L198-275) — default goes straight to adaptive
with NO path-selection step (AC1); (b) keep fast/full keyword escapes but make them
CONDITIONAL on the path being installed — a named-but-not-installed path prints a notice
pointing at `--with-fast`/`--with-full`, never a silent substitution (#44, AC2/AC7);
(c) `kaola-workflow-adapt.md` ~L134 — remove the "downgrade to full path" exhaustion option;
new floor = bounded planner repair → discard+restart fresh adaptive → stop+ask (AC6); also
remove the Branch-A `target_set_not_adaptive` bundle-refusal framing (~L118-122, L160-168)
now that adaptive is unconditional. **Forge-neutral prose** (#341): the SKILL packs and
forge command copies must name "the forge"/"the forge CLI", never `gh`/`glab`/brand nouns.
opus — the prose precision (no silent substitution, no fallback leak) is the AC-bearing core.

**n7-contracts (assertion surfaces — contract validators + route-reachability).** The
Claude `validate-workflow-contracts.js` has a byte-identical codex peer
(`plugins/kaola-workflow/scripts/validate-workflow-contracts.js`) — BOTH move in this node
(common-script pair, #274/#301). `validate-kaola-workflow-contracts.js` is the Codex-only
validator (no codex-plugin peer) and `test-route-reachability.js` is Claude-only. These +
the two forge `validate-kaola-workflow-{gitlab,gitea}-contracts.js` enforce the #400
6-surface route-reachability contract and pin the switch/path vocabulary. They must be
updated AFTER the prose (n6) and the scripts (n3/n4/n5) so the needles match the new world:
drop `enable_adaptive`/`KAOLA_ENABLE_ADAPTIVE`/Branch-A needles, add `installed_paths` +
keyword-conditional + no-path-selection-step assertions. A test asserting a default install
resolves `installed_paths: []` and the router emits adaptive with no selection step; a
second asserting `--with-fast` makes the fast keyword live (Verification section). Joins
all four upstream write lanes (n3/n4/n5/n6). tdd-guide, opus — the contract is the
machine-enforcement of the 6-surface propagation.

**n7b-walkthroughs (the four #307 walkthrough chains + 2 forge test-scripts — write-set
completeness, the #447/#306 backstop).** The four `npm run test:kaola-workflow:*` chains
and the two forge `test-{gitlab,gitea}-workflow-scripts.js` reference the RETIRED symbols
(`resolveEnableAdaptive`, `KAOLA_ENABLE_ADAPTIVE`, `enable_adaptive`) — if not updated they
land RED at finalize when n10 runs the chains (the #447 mid-finalize re-freeze). These
files are INTENTIONALLY UNSYNCED (`validate-script-sync.js` L14-20: the claude/codex
walkthroughs "must NEVER be synced" — they test different surfaces), so each is updated
independently to match its own edition's new switch-free behavior. The two forge codex
walkthroughs (`simulate-{gitlab,gitea}-codex-workflow-walkthrough.js`) carry the
forge-codex `.codex` assertions. Disjoint from n7-contracts → co-schedules as a sibling;
depends on the four impl nodes (n2/n3/n4/n5) whose behavior they assert. sonnet — mechanical
needle/fixture updates to match the already-decided behavior; the chains themselves are the
oracle. NOTE the same retired-symbol grep also covered `validate-*-contracts.js` (→ n7) and
the `docs/investigations/*` + existing decision records `D-515-01 (existing)`,
`D-526-01 (existing)`, `0007-adaptive-default-under-switch-on.md (existing)` hits, which are
CONSCIOUSLY out-of-scope point-in-time records — left unchanged.

**n8-review (G1 gate).** `code-reviewer` post-dominates every code-producing node
(n2/n3/n4/n5/n6/n7/n7b). opus — large cross-edition subtraction; the subtle failure mode is
a leftover dead-code reference or a half-mirrored forge port (#328 pattern) that leaves a
chain RED. Reviewer must verify: no `enable_adaptive`/`resolveEnableAdaptive`/
`WORKFLOW_PATHS_NO_ADAPTIVE`/`target_set_not_adaptive` survivors across all four trees;
forge ports are full mirrors of the root diff; the 6 route surfaces converge; no auto-
fallback wording survives. This is a code-only gate (no security-sensitive surface — no
auth/secret/network/crypto changes → no G2 security-reviewer required).

**n9-docs.** Public-interface + prose changed (the switch axis, install flags, config
field), so a `doc-updater` runs before finalize: it WRITES the ADR `docs/decisions/
D-538-01.md` (resolving the record number after reading `docs/decisions/`), README
(feature list + install flags `--with-fast`/`--with-full`, retire `--enable-adaptive`),
`docs/architecture.md` (router collapse, no path-selection step), `docs/conventions.md`
(#400 routing prose §, #538 adaptive-is-default), `docs/workflow-state-contract.md`
(config `installed_paths` field), `docs/api.md` (schema exports delta). sonnet — carries
out the n1 ADR decision into the docs.

**n10-finalize (docs-only sink).** Writes only `CHANGELOG.md` (Unreleased entry). The
mechanical Phase-6 sink (no model — never dispatched as a subagent). Cross-edition diff
per #307 — all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains run
sequentially as the finalize evidence; CI/CD is NOT a gate (#501).

**Risk assessment (advisory — not a planner gate).** blast_radius: TRUE (~70 files, 4
clusters, all four edition trees, the ×4 byte-identical schema anchor, the COMMON+forge-port
claim/classifier). sensitivity: FALSE (no auth/secret/network/crypto). uncertain: bounded —
the change is mostly subtraction with a clear locked design; the live coexistence risk is
#537 editing the SAME schema file in a non-interacting tier region (~L47-64), expected to
resolve as a mechanical rebase + ×4 byte-identity resync if it lands first. #307 four-chain
policy + #400 6-surface route-reachability contract + the n7b walkthrough cluster are the
machine backstops.

**n6b-residual-prose (MID-RUN PLAN REPAIR — added after n7-contracts).** The frozen plan + the n1
architect's §F inventory under-scoped the #538 switch-retirement sweep: the full/fast **entry**
surfaces carrying the stale "Switch-ON contract (#515)" prose block were owned by NO node, and n7's
route-reachability T11 (correctly re-pinned to `path_not_installed`) caught 8 of them. An independent
whole-worktree grep (the real completeness backstop) found 2 more unowned residuals. This repair node
migrates 9 unowned PROSE surfaces to the #538 model: the 6 full-entry surfaces
(`commands/kaola-workflow-phase1.md` + the 3 `kaola-workflow-research/SKILL.md` + the 2 forge
`kaola-workflow-phase1.md`), the 2 forge `kaola-workflow-fast.md`, and
`docs/decisions/0007-adaptive-default-under-switch-on.md` (one-line `Status: Superseded by D-538-01`,
R3). Disjoint from every other node's write set (these were unowned). depends_on n6-router-prose
(mirrors its migrated surfaces verbatim modulo forge nouns); n8 post-dominates it. opus — same
AC-bearing prose-precision requirement as n6 (a re-introduced switch reference re-reds the
route-reachability contract). DELIBERATELY EXCLUDED: `.env.example` (a 10th unowned residual — a stale
`KAOLA_ENABLE_ADAPTIVE` example row). It matches the security-sensitive `.env*` pattern, which would
force a low-value G2 security-reviewer gate for a 2-line stale-doc deletion in a no-secret template
(over-engineering, precedence #3). Captured as a FILED run-gap follow-up at finalize instead. ALSO
folded in (10th write-set file): `scripts/test-install-model-rendering.js` — a SECOND under-scoped
residual surfaced by n7b's chain run. It does a DEFAULT `install.sh` then asserts badge rendering in
`kaola-workflow-phase3/4/5.md` + `kaola-workflow-fast.md`, which the #538 installer no longer ships by
default → ENOENT. Fix: add `--with-fast --with-full` to its install invocations (its purpose is
badge-rendering in those opt-in files, so it must install them). Verified by running the test + the
full claude chain green.

## Node Ledger

| id | status |
| --- | --- |
| n1-architect | complete |
| n2-schema | complete |
| n3-claim | complete |
| n4-classifier | complete |
| n5-installer | complete |
| n6-router-prose | complete |
| n7-contracts | complete |
| n7b-walkthroughs | complete |
| n8-review | complete |
| n9-docs | complete |
| n10-finalize | complete |
| n6b-residual-prose | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-architect) | subagent-invoked | evidence-binding: n1-architect 3883f2339316 | |
| tdd-guide (n2-schema) | subagent-invoked | evidence-binding: n2-schema 2da504b4a6da | |
| tdd-guide (n3-claim) | subagent-invoked | evidence-binding: n3-claim f95d1a7877bd | |
| implementer (n4-classifier) | subagent-invoked | evidence-binding: n4-classifier 00908e4bee95 | |
| tdd-guide (n5-installer) | subagent-invoked | evidence-binding: n5-installer 33c71a64bac5 | |
| implementer (n6-router-prose) | subagent-invoked | evidence-binding: n6-router-prose fa3dc1020bd7 | |
| tdd-guide (n7-contracts) | subagent-invoked | evidence-binding: n7-contracts 450297f3d6e0 | |
| tdd-guide (n7b-walkthroughs) | subagent-invoked | evidence-binding: n7b-walkthroughs 341a216b5ed8 | |
| implementer (n6b-residual-prose) | subagent-invoked | evidence-binding: n6b-residual-prose 106492ea9b03 | |
| code-reviewer | subagent-invoked | evidence-binding: n8-review a3a4ee7ece84 | |
| doc-updater (n9-docs) | subagent-invoked | evidence-binding: n9-docs 7f7236f354cf | |
| finalize (n10-finalize) | main-session-direct | evidence-binding: n10-finalize a139314963da | |
