# Issue #1029: source-to-render-to-install-to-test surface map

## Scope and evidence status

This is a read-only investigation of the issue-1029 candidate at the claimed
baseline.  The main checkout and the candidate worktree both resolve to
`89d171ef71c65b5d8841e98c9b48f7e52b10a41a`; the candidate branch is clean.  The
issue body was read with:

```text
gh issue view 1029 --repo KaolaBrother/Kaola-Workflow --json number,title,state,body
```

The candidate therefore does not trigger the requested stop condition.  Facts
below are measured from the checkout unless marked **Inference** or
**Open/value decision**.  No tracked repository or product file was changed;
this report is the only write.

## Executive findings

1. The canonical authored routing sources are the three skeletons in
   `templates/routing/` (`next.skeleton.md`, `init.skeleton.md`, and
   `finalize.skeleton.md`), plus the shared render data in
   `templates/routing/slots.js`, `templates/routing/required-blocks.js`, and
   `templates/routing/rename-table.js`.  `scripts/generate-routing-surfaces.js`
   derives the tracked command and Codex-skill rows from those sources.
2. The tracked generator emits 18 artifacts: three topics x three forges x two
   lanes.  The five additive runtime generators emit another 45 command/skill
   artifacts.  The complete current command/skill surface is therefore 63
   artifacts across seven runtimes and three forges, represented as 21 runtime
   trees.  This count is measured, not inferred: the routing registry reports
   18 tracked rows, and the additive renderer comparison checked 45 rows with
   no drift.
3. The only existing general dispatch contract is a reviewer-only sentence in
   the `next` and `finalize` skeletons: “Each reviewer dispatch must state the
   review scope — the dispatched surface under review and what acceptance
   looks like.”  There is no general task handoff packet carrying task-specific
   mission, context, authority, custody, acceptance, deliverable, and stop
   rules.  `mission-list.md`'s `dispatched` field is a recovery locator, not a
   task specification.
4. The role profiles already own universal role behavior, test custody, and
   output contracts.  A task packet should not copy those profile contracts;
   its missing value is task-specific binding information at the dispatch
   call-site.
5. The issue's byte-identical requirement is implementable only for a bounded,
   delimited common packet block.  Complete command/skill files cannot be
   byte-identical: frontmatter, command versus Kimi skill shape, forge nouns,
   runtime-native invocation, resolver paths, model handling, and the
   documented reviewer escalation difference are real declared divergences.
6. Existing `generate-routing-surfaces.js --check` covers the 18 tracked
   artifacts only.  Additive renderers are intentionally outside that check and
   the four `npm test` chains; their own suites and the in-memory additive
   reachability path are the required second half of any packet parity guard.

## 1. Canonical authored sources and current dispatch sites

### Routing skeletons

`templates/routing/next.skeleton.md` is the main issue decomposition and
delegation surface.  At lines 20–21 it has the reviewer scope/acceptance
sentence.  Lines 43–62 contain the command-only Agent Model Dispatch and the
reviewer carve-out.  Lines 186–225 define the mission-list write model, and
lines 234–267 describe dispatch/resume.  Lines 278–296 are the generic Skill
Delegation section.  That section asks each spawn to follow model/reasoning
routing, but it does not require task-specific scope, acceptance, authority,
custody, deliverable, or a stop condition.

`templates/routing/finalize.skeleton.md` carries the same reviewer sentence at
lines 20–21 and 48–66.  Its routed-fix dispatches at lines 106–134 contain
failure/evidence/path-specific cards, but they are not a general handoff
schema.  Its acceptance material is at lines 161–171.  The doc-updater
dispatch and skill counterpart at lines 183–202 carry changed files,
checklist, and working-directory details, again without the proposed general
packet fields.

`templates/routing/init.skeleton.md` contains setup, custody, and mission-list
guidance but no active named-role spawn card.  A packet added only to named
dispatch sites in `next` and `finalize` would not leave an observed init spawn
uncovered; widening it to init is an unresolved scope decision, not a measured
need.

### Shared routing data and render engine

`templates/routing/slots.js` is the shared source for frontmatter, headings,
runtime introductions, script resolvers, and runtime/forge-conditioned text.
Its resolver and tier-roster paths are shared by all tracked renders.  The
Codex roster is pulled from
`scripts/kaola-workflow-adaptive-schema.js`, so that kernel is also a render
input.

`templates/routing/required-blocks.js` is the single-source required-block
manifest.  It describes presence obligations by topic, runtime tag, and
surface-type tag; it is not currently an exact common-packet equality
contract.

### Mission-list boundary (relevant existing authority)

`kaola-workflow/.roadmap/_rules.md:18–30` says the mission list has the four
fields `item`, `status`, `dispatched`, and `result`, three write moments, and
that an item is a mission rather than a prescription.  It explicitly requires
additive derivation from observed failure demands.  `docs/decisions/0017-the-mission-list.md:49–77`
records the same one-file/four-field recovery design and identifies
`dispatched` as the recovery locator.  Lines 79–100 explicitly reject role,
write-set, dependency, model, cardinality, and shape metadata in the mission
item, and say that concurrency has no machinery.  The ADR's watch-list section
records unobserved failure classes rather than silently turning them into
gates.

**Inference:** the proposed handoff packet is a dispatch-time contract, not a
new mission-list schema or DAG/executor layer.  The packet should therefore
remain outside the four-field mission-list record unless a separate owner
decision changes ADR 0017.

`templates/routing/rename-table.js` is the post-render forge-noun transform.
The shipped table is currently empty; forge-specific support-script names are
keyed in `slots.js`.  The test still proves the injected rename mechanism and
the forge-invariant list.

`scripts/generate-routing-surfaces.js` is the renderer and registry:

- Lines 4–51 describe the skeleton-backed 18-surface design and the
  `SLOT`/`SPLICE`/`REGION` directives.
- Lines 61–95 define the three forge command editions and three forge Codex
  skill editions, and the `next`, `init`, and `finalize` topics.
- Lines 98–130 derive `GENERATED_SURFACES`; there are no hand-typed generated
  paths.
- Lines 132–155 derive the forge axis and expose
  `commandSurfacesForForge()` to additive runtime generators.
- Lines 321–343 implement `--check`; the check compares the 18 tracked files
  with skeleton renders.
- The write path refreshes additive trees that already exist on the machine,
  but does not make additive trees part of the 18 tracked rows.

The repository rule in `CLAUDE.md:177–180` says prompt surfaces render from
`templates/routing/`, must be regenerated, and are guarded by
`node scripts/generate-routing-surfaces.js --check`.  `CLAUDE.md:106–112`
also requires one rule/one wording while allowing explicitly named runtime
divergence.

### Existing role-profile contracts

The role profiles are separate canonical authored sources for role behavior,
not additional routing command topics:

- `agents/planner.md:26–105` defines planning responsibilities and plan format;
  `:149–164` defines no-repo-edit, tool-gap/value-call, and output behavior.
- `agents/code-architect.md:26–85` defines the blueprint process/output;
  `:87–120` defines tool gaps, value calls, and solution-ladder behavior.
- `agents/tdd-guide.md:26–38` owns test custody.  Lines 40–62 require an
  acceptance surface from the brief and a RED baseline; ambiguous acceptance
  is a stop.  Lines 70–78 require the failing run, failure signature, and
  baseline SHA in the result.
- `agents/implementer.md:89` is the implementation scope boundary cited by
  the issue.  The other role profiles similarly define their own output and
  boundary contracts.

**Inference:** a new packet should bind the current task to those existing
profile contracts, rather than restating role-wide behavior in every dispatch.
This preserves the profile as the authority for custody and role semantics and
uses the packet for facts that differ per task.

## 2. Every generated command/skill surface

### Tracked Claude and Codex surfaces

The registry generates six artifacts per topic:

| Lane/runtime | GitHub | GitLab | Gitea | Topics |
|---|---|---|---|---|
| Claude command | `commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `plugins/kaola-workflow-gitlab/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `plugins/kaola-workflow-gitea/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `next`, `init`, `finalize` |
| Codex skill | `plugins/kaola-workflow/skills/{kaola-workflow-next,kaola-workflow-init,kaola-workflow-finalize}/SKILL.md` | `plugins/kaola-workflow-gitlab/skills/{kaola-workflow-next,kaola-workflow-init,kaola-workflow-finalize}/SKILL.md` | `plugins/kaola-workflow-gitea/skills/{kaola-workflow-next,kaola-workflow-init,kaola-workflow-finalize}/SKILL.md` | `next`, `init`, `finalize` |

The exact registry asymmetry is intentional: `next` and `init` have
`workflow-*` command basenames but `kaola-workflow-*` skill basenames;
`finalize` has the same basename in both lanes.  The current read-only registry
measurement is six rows per topic, 18 total, and
`node scripts/generate-routing-surfaces.js --check` reports:

```text
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
```

### Additive runtimes and forge variants

`scripts/runtime-edition-forge.js:5–26` explicitly says additive runtimes are
not forges and are outside `npm test`, `edition-sync.js`, `install.sh`, and the
six tracked routing surfaces.  Lines 39–107 derive each runtime's command
source from `generate-routing-surfaces.js` rather than from a hand-typed
directory.

Each of the following has nine command/skill artifacts (three topics x three
forges), for 45 artifacts total:

| Runtime | GitHub tree | GitLab tree | Gitea tree | Shape/lane | Generator |
|---|---|---|---|---|---|
| opencode | `.opencode/command/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `.opencode-gitlab/command/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `.opencode-gitea/command/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | flat commands; command lane | `scripts/sync-opencode-edition.js` |
| Kimi | `.kimi/skills/{workflow-next,workflow-init,kaola-workflow-finalize}/SKILL.md` | `.kimi-gitlab/skills/{workflow-next,workflow-init,kaola-workflow-finalize}/SKILL.md` | `.kimi-gitea/skills/{workflow-next,workflow-init,kaola-workflow-finalize}/SKILL.md` | directory-form Skills carrying command basenames; command lane | `scripts/sync-kimi-edition.js` |
| Grok | `.grok/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `.grok-gitlab/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `.grok-gitea/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | flat commands; command lane | `scripts/sync-grok-edition.js` |
| Cursor | `.cursor/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `.cursor-gitlab/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `.cursor-gitea/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | flat commands; command lane | `scripts/sync-cursor-edition.js` |
| ZCode | `.zcode/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `.zcode-gitlab/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | `.zcode-gitea/commands/{workflow-next,workflow-init,kaola-workflow-finalize}.md` | flat commands; command lane | `scripts/sync-zcode-edition.js` |

The Kimi rows are easy to omit if “surface” is equated with file shape: its
directory-form `SKILL.md` is a command-lane rendering of the canonical
command source, not a Codex skill-lane rendering.  The route-reachability test
documents and enforces this distinction at `scripts/test-route-reachability.js:970–986`.

The additive renderers have runtime-native differences.  For example, the
opencode, Kimi, Grok, Cursor, and ZCode scripts render/rename model-dispatch
paragraphs, runtime invocation syntax, support-script resolvers, and/or
frontmatter.  The architecture table at `docs/architecture.md:305–339`
records these differences and the per-runtime install paths.  The additive
renderers nevertheless all consume `commandSources(forge)` from
`runtime-edition-forge.js`, so a routing topic or forge row propagates to each
generator.

Read-only parity measurement across all five additive generators:

```text
checked: 45
drifts: 0
```

The 63-artifact count is therefore:

| Runtime | Artifacts |
|---|---:|
| Claude | 9 command files |
| Codex | 9 skill files |
| opencode | 9 command files |
| Kimi | 9 command-lane skill-shaped files |
| Grok | 9 command files |
| Cursor | 9 command files |
| ZCode | 9 command files |
| **Total** | **63** |

This excludes role-agent/profile artifacts, hooks, manifests, and support
scripts.  Those are installed surfaces and may carry role contracts, but they
are not the three routing topics asked for by the issue's command/skill
surface.

## 3. Additive-edition propagation seams

The common propagation path is:

```text
templates/routing/{topic}.skeleton.md
        + slots.js / rename-table.js
        -> generate-routing-surfaces.js
        -> COMMAND_EDITIONS / commandSources(forge)
        -> sync-{opencode,kimi,grok,cursor,zcode}-edition.js
        -> runtime-specific command/skill tree
        -> runtime-specific installer
```

The concrete seams are:

- `scripts/runtime-edition-forge.js:97–107` asks the routing generator for
  command rows for one forge.  This is the common command-source API and the
  correct propagation seam for all additive editions.
- `scripts/sync-opencode-edition.js:186–200, 528–538, 646–677` obtains the
  canonical command list, renders command files, and writes agents/commands.
  Its check at `:910–1004` compares generated bytes with its renderer.
- `scripts/sync-kimi-edition.js:140–153, 535–610` obtains command rows and
  turns them into directory-form Skills; its role Skills are a separate output
  family.
- `scripts/sync-grok-edition.js:305–315, 390–405, 475–490` renders and
  writes flat command files from the command registry.
- `scripts/sync-cursor-edition.js:111–118, 361–372, 556–575` does the same
  for Cursor and keeps its command/agent paths separate.
- `scripts/sync-zcode-edition.js:102–110, 332–343, 523–541` does the same for
  ZCode's flat command tree and config/agent output.

The route-reachability test reads tracked Claude/Codex bytes from disk and
renders every additive command in memory through those five modules at
`test-route-reachability.js:1107–1137`.  This is important: a missing or
ignored generated tree is not a reason to skip the parity check.

### What “byte-identical” can cover

The existing generator deliberately preserves named `REGION`/`SPLICE`/`SLOT`
differences.  The full files cannot be equal for the reasons documented in
`docs/architecture.md:305–339` and `:396–422`:

- Claude command and Codex skill frontmatter/shape differ.
- Kimi packages a command as a directory-form Skill.
- Forge-specific nouns, commands, and support-script basenames differ.
- Runtime-native task/subagent invocation and model/tier syntax differ.
- Additive runtimes omit Claude's dynamic reviewer heavy re-dispatch because
  they have no equivalent per-call override.

**Inference:** “canonical normative wording byte-identically” must mean an
explicitly delimited common packet block extracted from all 63 rendered
artifacts, not byte equality of complete files.  The block's boundaries and
the permitted runtime-native regions are an unresolved contract detail to be
settled by the owner; the current repository cannot answer that value choice.

## 4. Installed profile and deployment relevance

### Base installs

`install.sh:45–56` establishes the global Claude destinations and required
agents.  Its forge parsing and source selection are at `:58–125`; it copies
the generated command/plugin sources and installs role profiles.  It does not
generate a separate task packet and has no model-axis choice at install time.
The installed Claude agent frontmatter is normalized to `model: inherit` in
the install path described by `docs/architecture.md:381–390`.

`install-all.sh:55–57` names the seven runtime installers:
`claude`, `opencode`, `codex`, `kimi`, `grok`, `cursor`, and `zcode`.  Its
Codex plugin/profile convergence is at `:179–186` and `:271–284`; Codex role
profiles and skill packs are not installed by the same file-copy path as
Claude.  The full installer orchestration is at `:629–675`.

### Additive installs

Each additive installer resolves a forge-specific generated tree, checks or
regenerates it, and copies the command/role/support-script outputs:

| Installer | Generated tree/check seam | Deployment seam |
|---|---|---|
| `install-opencode.sh` | `:151–183` resolves `.opencode[-forge]` and runs check/write; `:345–425` copies agents/commands | `:513–545` support scripts; `:715–729` project/global deployment |
| `install-kimi.sh` | `:117–149` resolves `.kimi[-forge]` and runs check/write; `:246–300` copies command Skills and role Skills | `:303–332` support scripts |
| `install-grok.sh` | `:103–120` resolves `.grok[-forge]`; `:165–223` copies agents/commands | `:226–315` support scripts/hooks/config; `:420–434` deployment |
| `install-cursor.sh` | `:103–142` resolves `.cursor[-forge]` and command allowlist; `:196–228` copies commands | `:231+` support scripts; `:443–468` project/global deployment/catalog |
| `install-zcode.sh` | `:109–135` resolves `.zcode[-forge]` and check/write | `:149+` command allowlist/support files; `:446–452` deployment and user-scope agents |

The installer layer therefore appears to be a carrier, not an author, of the
packet.  A packet in the generated routing artifacts reaches installed
commands/Skills through the existing check/write/copy path.  No installer
edit is evidenced solely by adding prose, provided the generated output names
and allowlists remain unchanged.

### Profile relevance boundary

`agents/*.md`, Codex `plugins/*/agents/*.toml`, and additive role definitions
are the installed profile family.  They carry universal role behavior,
runtime adapters, and output contracts.  `test-agent-profile-parity.js`
guards canonical role/profile parity; it is not a routing-surface parity test.

**Inference:** a handoff packet should not duplicate “tdd-guide owns tests,”
“implementer changes product files,” or role output formats already present in
the installed profiles.  It should identify the task's scope/custody and point
at the role contract where universal behavior applies.  The issue's proposed
`Scope and custody` field remains useful for task-specific ownership, but the
exact division between packet wording and profile wording is an owner/value
decision.

## 5. Existing tests and precise additions needed

### Existing guards and commands

The baseline checks passed as follows:

```text
node scripts/generate-routing-surfaces.js --check
# generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.

node scripts/test-route-reachability.js
# Route-reachability test passed (557 assertions).
```

The relevant existing guards are:

- `scripts/test-generate-routing-surfaces.js` derives the topic registry and
  all 18 rows, compares committed bytes with skeleton renders, pins required
  tokens, checks one consent wording across all 18, scans retired vocabulary,
  audits splice budgets, checks region reasons, and mutation-proves that a
  hand-edited tracked surface makes `--check` exit 1.  Its registry and
  mutation sections are around `:230–360`, `:620–700`, and `:760+`.
- `scripts/test-route-reachability.js:960–1128` derives the 21-tree universe,
  includes all five additive generators in memory, and rejects absent expected
  surfaces.  Its required-block manifest is an additive-superset presence
  check, not a byte-equality check.
- `scripts/test-route-reachability.js:1139–1179` is T20, the existing
  reviewer-scope/acceptance packet guard.  It checks the heavy Claude
  reviewer dispatches and preserves the documented additive omission of
  dynamic reviewer escalation.  It does not cover ordinary planner,
  architect, tdd-guide, implementer, or doc-updater handoffs.
- `package.json` puts the generator check in the four tracked chains and puts
  the five additive suites behind
  `test:kaola-workflow:editions`; the additive suites are not part of `npm
  test` by design.
- `CLAUDE.md:137–147` requires the walkthrough, all four chains, and the
  runtime-specific suites/installer checks in their applicable scope.

### Guards that are missing for #1029

The following are precise acceptance gaps, not implementation prescriptions:

1. **Exact common-packet parity.**  Add a guard whose input domain is derived
   from the routing registry plus the five additive sync modules, so it checks
   all 63 artifacts (or all 21 trees x three topics).  It must extract the
   agreed packet block and compare the extracted bytes exactly across every
   applicable runtime/forge surface.  Comparing whole files would falsely
   reject documented runtime differences.
2. **Surface/call-site coverage.**  Add an inventory assertion for every
   actual named-role dispatch site in the tracked skeletons.  At baseline this
   includes the `next` delegation/reviewer paths and `finalize` routed-fix,
   reviewer, and doc-updater paths; `init` has no named-role spawn card.  The
   guard must fail if a new call site is added without the packet, rather than
   only testing a few literal examples.
3. **Render-path coverage.**  The guard must test the additive in-memory
   renderers, because `generate-routing-surfaces.js --check` intentionally
   reads only the 18 tracked surfaces.  Existing `GENERATED_SURFACE_CONTENT`
   is the measured seam for this check.
4. **Bidirectional mutation proof.**  Mutate the canonical packet wording,
   delete it, reorder a field, and mutate/delete it in at least one generated
   additive output in memory.  Each mutation must go RED; restoring the
   original must go GREEN.  A guard that merely finds today's matching text
   is not sufficient.  `test-generate-routing-surfaces.js` and the route test
   already use this RED-on-mutation pattern.
5. **Anti-vacuity.**  Assert the expected 7 x 3 x 3 artifact/21-tree width
   independently of the list under test.  The current route test has a
   filesystem-derived additive generator floor and the registry-derived forge
   axis; the new packet guard must not introduce a hand-typed six/12/18-only
   list.
6. **Installer convergence.**  Run each applicable additive sync `--check`
   and installer check after generation.  No new installer assertion is
   evidenced unless the packet changes a copied file name, allowlist, or
   generated tree layout; the current installers already check/write the
   generated trees.

### Validation command set

For a routing-skeleton change, the evidence-backed command set is:

```text
node scripts/generate-routing-surfaces.js --check
node scripts/test-generate-routing-surfaces.js
node scripts/test-route-reachability.js
node scripts/simulate-workflow-walkthrough.js
npm test
npm run test:kaola-workflow:editions
./install-all.sh --check
```

The five additive suites can also be run individually when narrowing a
failure:

```text
node scripts/test-opencode-edition.js
node scripts/test-kimi-edition.js
node scripts/test-grok-edition.js
node scripts/test-cursor-edition.js
node scripts/test-zcode-edition.js
```

If role profiles are changed as part of the final implementation, add
`node scripts/test-agent-profile-parity.js`; a routing-only packet change does
not require that profile-parity test by itself.  These are validation commands
only; they were not run here beyond the two baseline checks reported above,
because this investigation was read-only and the additive suites may write
their ignored generated fixtures.

## 6. Overclaims, omissions, and stale evidence

### Issue hypothesis that needs narrowing

- **Full-file byte identity is too broad.**  The issue's “byte-identically
  across every supported runtime/forge surface” must be scoped to a named
  common packet region.  Runtime-native frontmatter, command/Skill shape,
  invocation, resolver, model, and forge words cannot be collapsed without
  violating existing architecture decisions.
- **“Every named-role spawn” has no current source inventory in the issue.**
  The routing skeletons have named dispatches in `next`/`finalize`, while
  profiles, installer-generated role carriers, support scripts, and runtime
  adapters are separate surfaces.  Whether all of those count as “spawn” is a
  scope/value decision.  The measured route command/skill inventory alone does
  not answer it.
- **The proposed fields are not yet role-specialized by evidence.**  Planner
  and code-architect outputs have distinct plan/blueprint formats, tdd-guide
  requires a RED baseline, and reviewers require scope/acceptance.  A single
  packet can carry common fields, but the required role-specific fields and
  their exact wording remain to be settled.

### Surfaces the issue must not omit

- Kimi's `.kimi[-forge]/skills/<command>/SKILL.md` is a command-lane surface
  despite its Skill-shaped file.
- ZCode is a current seventh runtime.  It has `.zcode[-forge]/commands/`
  trees, a separate sync generator, installer, and suite.
- The additive renderers are not covered by the tracked generator's `--check`;
  the packet guard must exercise their transformations or it can falsely claim
  cross-runtime parity.
- Installed profile carriers are relevant to custody/role semantics but are
  not additional routing topic files.  Copying the packet into every profile
  would widen the issue beyond the currently observed routing gap.
- The mission-list `dispatched` field at
  `templates/routing/next.skeleton.md:202–214` and the corresponding finalize
  material records where a run was dispatched for recovery.  It does not bind
  task scope, acceptance, authority, or output.

### Existing stale claims (not automatically in issue scope)

The current repository has documentation/comment drift that can confuse a new
surface audit:

- `scripts/test-route-reachability.js:970–975` still describes 12 trees and
  only opencode/Kimi, while the live manifest and anti-vacuity calculation
  cover 21 trees and five additive runtimes.
- `docs/conventions.md:142–144` still describes six routing trees and 18
  total artifacts, although its later sections list Grok, Cursor, and ZCode
  command surfaces.  The six tracked rows remain true; the statement is not a
  complete all-runtime count.
- `README.md:3,62–67,152,238` and `package.json:4` say “six runtimes” in
  places while listing seven in at least one place or omitting ZCode.  The
  README's later additive-runtime sections and line 271 list ZCode correctly.

These are measured stale claims.  They should be included only if the owner
decides that issue #1029's user-facing wording/coverage change owns this
documentation cleanup; they are not evidence that a new runtime or forge is
missing from the current generators.

## 7. Evidence-based minimum edit set and dependency order

This is a dependency map, not a product/value decision.  The exact packet
wording, role-specialization fields, marker format, and applicability to init
remain owner decisions.

1. **Resolve the common-region contract.**  Decide the exact field order,
   delimiter/extraction boundary, role-specific additions, and which
   runtime-native blocks are explicitly outside the common region.  The issue
   currently supplies a hypothesis (`Mission`, `Context`, `Authority`, `Scope
   and custody`, `Acceptance`, `Deliverable`, `Stop and report`) but does not
   settle all applicability questions.
2. **Add tests first under existing custody.**  The tdd-guide owns the test
   artifact.  Extend the registry-derived routing/edition test location(s)
   with the 63-artifact common-block check, call-site coverage, anti-vacuity,
   and RED-on-mutation cases described above.  Establish a RED baseline before
   production edits.
3. **Edit canonical skeleton source, not generated files.**  The measured
   dispatch gap is in `templates/routing/next.skeleton.md` and
   `templates/routing/finalize.skeleton.md`.  `init.skeleton.md` needs no edit
   unless the owner intentionally defines a new init dispatch scope.  `slots.js`
   or `rename-table.js` need changes only if the chosen common block requires a
   runtime/forge slot; this is not currently evidenced.
4. **Regenerate the tracked 18 surfaces.**  Use
   `node scripts/generate-routing-surfaces.js --write`, then verify
   `--check`.  Do not hand-edit generated command/Skill files.
5. **Regenerate/check additive trees through each owning sync module.**  The
   five sync renderers consume `commandSources(forge)` already.  If their
   runtime transformations preserve the common region, no renderer source
   change is indicated; if a transformation crosses the chosen packet boundary,
   the corresponding sync module and its suite are the affected files.  This
   must be determined by the new parity test rather than assumed.
6. **Inspect installer impact.**  Existing install scripts should carry the
   regenerated bytes without source changes.  Edit an installer only if a
   packet placement touches an allowlist, tree layout, generated-check path, or
   copied profile contract; no such current seam was found.
7. **Dock user-facing documentation if owned by the issue.**  At minimum,
   reconcile the all-runtime count and the generated-surface statement in
   `README.md`, `docs/architecture.md`, `docs/conventions.md`, and the
   changelog as required by `CLAUDE.md`.  The stale six/twelve statements are
   pre-existing and should not be silently treated as an implementation
   decision.
8. **Run the full validation set.**  The order is generator check, focused
   generator/route tests, additive suites, walkthrough, all four `npm test`
   chains, and installer convergence.  If role profile files change, include
   profile parity.

## 8. Dogfood: how this dispatch packet supported the investigation

The packet itself is a useful test case for issue #1029.  The observations
below distinguish ambiguity removed from policy duplicated and missing.

| Packet field | Concrete benefit during this investigation | Residual issue |
|---|---|---|
| `Mission` | Named the result (“complete source-to-render-to-install-to-test surface map”) and added packet dogfood, so the report did not collapse into a generic issue summary. | It did not prescribe an evidence citation format or required command transcript shape. |
| `Context` | Exact root, candidate worktree, baseline SHA, issue number, required source families, and the measured reviewer-only starting fact removed checkout and rediscovery ambiguity. | It did not explicitly require a main-vs-candidate SHA comparison; the stop clause left that comparison implicit. |
| `Authority` | Clearly made the packet hypothesis rather than a settled field/value decision, required byte-identical normative wording, and preserved the separate blueprint. This prevented me from treating the proposed fields as final or editing the architect's file. | The phrase “canonical normative wording” still needs a precise boundary: whole file or extracted region. Evidence shows whole-file equality is impossible. |
| `Scope and custody` | Read-only status, the one permitted report path, and collision avoidance made write ownership unambiguous. It also kept role/test custody visible. | It repeats repository-wide no-edit/tool-gap rules already present in agent profiles and `CLAUDE.md`; useful in a fork, but compactable. |
| `Acceptance` | The eight numbered requirements forced coverage of propagation, install relevance, tests, overclaims, dependency order, and packet dogfood rather than only listing files. | It did not define “every supported surface” as 63 artifacts/21 trees, nor distinguish command lane from Kimi's Skill-shaped command lane. |
| `Deliverable` | Exact absolute path made handoff/recovery reliable and made the report's write exception falsifiable. | No required Markdown section skeleton or line-level citation convention was specified. |
| `Stop and report` | Candidate drift, indeterminable surfaces, owner/value calls, and tool limitations were explicit stop conditions; this prevented guessing about packet applicability to init or role profiles. | “Required surface cannot be determined” is intentionally broad; a future packet could name the expected source registry and an evidence threshold before stopping. |

Fields that removed the most ambiguity were the exact baseline/worktree
identity, the write-only path, the authority boundary, and the numbered
acceptance list.  The packet also made the report self-sufficient enough to
work without relying on parent conversation.

Fields that duplicated existing profile/rule material were the universal
read-only/no-secret/tool-gap constraints and some mission-list context.  Their
duplication was operationally helpful for a fork, but they should not become
the body of every generated handoff; role profiles already own universal
custody and output rules.

Fields still missing for a production handoff contract are:

- a machine-readable or at least exact evidence/locator convention;
- the complete call-site applicability rule (including whether init, profile
  carriers, and support-script dispatches count);
- the common-region boundary and permitted runtime-native regions;
- explicit role-specialization rules for planner, architect, tdd-guide,
  implementer, reviewers, and doc-updater;
- whether generated artifacts are expected on disk or may be validated in
  memory, and which installer scope/environment is authoritative;
- a required result schema beyond “write the report.”

Those are identified questions, not decisions made by this investigation.

## Bottom line

The measured implementation seam is narrow: task-specific handoff prose is
missing from the canonical `next`/`finalize` dispatch surfaces, while the
existing source, registry, five additive renderers, and installers already
provide the propagation machinery.  The reliable acceptance boundary is a
registry-derived exact common packet block across all 63 rendered
command/skill artifacts, with explicit runtime-native regions and mutation
proofs.  The current candidate is exactly at the issue baseline, so no
evidence-based blocker remains; the unresolved items are owner/value choices
about packet wording, applicability, and boundary.
