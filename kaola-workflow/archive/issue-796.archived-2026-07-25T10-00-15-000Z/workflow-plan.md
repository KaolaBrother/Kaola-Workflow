# Workflow Plan — issue #796 (single-issue routing wording defects)

<!-- plan_hash: f64fbb6f44c30ee8e18f4996862155c0b9220f2eb53b69c6abdc800bbeb35a31 -->

## Meta

project: issue-796
labels: area:workflow-phases, area:workflow-router, bug, workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
plan_form: spine
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 90
validation_env_allowlist:
code_certifier: n8-code-certify
security_certifier: none
inherited_frontier_digest: none
inherited_frontier_classes: none
selection_bundle: 796
selection_priority_basis: frontier = none — no priority signal in roadmap. `kaola-workflow/ROADMAP.md` renders "No active work" and `kaola-workflow/.roadmap/` holds only `.gitkeep`, so there is no `Next Step` drive-order and no `### Project rules` guardrail to honor or violate; the absence is itself the finding. Ranked by scope-cohesion, then actionability. #796 is the most cohesive single scope (the routing/selection prose layer — one generation seam plus its hand-ported mirrors, disjoint from every other candidate's surfaces), it is a correctness `bug` in the workflow's own agent-facing instructions (First Principle 1), and its acceptance is fully verifiable inside this repository. No frontier was skipped: no open issue outranks it on any recorded signal.
selection_rejected: #795 (installer false-green convergence, `bug`) — same tier by cohesion, but part of its acceptance ("verify the end state against a real sync, not only stubs") is only provable by mutating the operator's live `~/.claude`, `~/.config/opencode`, and `~/.codex` trees, so it is not fully verifiable inside a run; deferred, not blocked. #794 (retire the `--profile` axis, `enhancement`) — installer-surface scope, and #795 explicitly fences "being retired separately in #794. Do not entangle"; bundling it with #795 would put two large semantically-distinct changes in the same `install.sh` / `install-all.sh` write lane, so confidence in a bundle was not high. #793 (runtime × forge matrix) — feature-shaped with an undecided strategy question (generated surfaces vs hand-ports) and an explicit values call about the additive-edition exemption boundary; not settleable as ordinary work. #792 (amend-surface wire-or-retire) — a decision that the issue itself says must be made on evidence about real `write_set_overflow` events, so it is shape-first investigation work, not a specified change.
selection_disjointness: Single-issue selection, so no cross-issue disjointness was required. Within #796 the work partitions into three genuinely disjoint write lanes that share no file: the `next` routing topic (one generated skeleton plus its six rendered outputs and the routing-generation contract layer), the six hand-ported `kaola-workflow-adapt` surfaces, and the four `workflow-planner` profiles. The five contract validators are deliberately held out of all three lanes and written once downstream, because a needle asserting text that has not landed yet is red by construction.

## Design

### What this run delivers

Issue #796 is a wording audit of the routing/selection layer that sits **above** the workflow's hard
one-issue floor. Five findings were reported; all five are real and all five are in scope. The floor
itself (the Completion Contract, "do not manufacture a bundle", run-gaps filing) is sound and this run
does not touch it. Nothing here changes executor or finalize behavior.

The named units of work, and what each delivers:

1. **`n1-route-spec` — the per-surface edit specification.** Two of the five findings are stated in the
   issue as a choice between two options, and neither choice is safe to make surface-by-surface. F2
   asks either to bind a free-form task description into the planner brief *or* to instruct mapping it
   to a filed issue first. F5 asks either to delete the unbacked `selection-evidence.md` sidecar
   sentence *or* to give the sidecar a real writer. A spec node settles both once, enumerates the exact
   passage-level edit for every surface, and enumerates every machine pin standing on those passages.
   Everything downstream consumes that one artifact. It delivers a decision, not a diff.

2. **`n2-next-surfaces` — the `next` routing topic.** All five findings land here, because all five
   were observed in `commands/workflow-next.md`. This surface is **generated**: `scripts/generate-routing-surfaces.js`
   renders the six committed outputs from `templates/routing/next.skeleton.md` plus
   `templates/routing/slots.js`, and `--check` runs in all four chains. A hand-edit to any rendered
   output is silently wiped by the next `--write` and turns the chains red, so the skeleton and its six
   outputs are one indivisible write set, never separable nodes. The skeleton carries the command and
   skill variants as two parallel regions, so each fix is applied twice inside it. The
   routing-generation contract layer (`templates/routing/required-blocks.js`,
   `scripts/test-route-reachability.js`) co-moves with the skeleton and is declared with it.

3. **`n3-adapt-surfaces` — the `kaola-workflow-adapt` entry contract.** F2's second half: the adapt
   command documents no no-target entry at all — `argument-hint: <issue number>`, "The router enters
   with `{issue}`", and a dispatch template that assumes `{issue-or-project}` is filled — while the
   router promises to route there with no argument. These six files are hand-ported (they are not in
   the generator's topic set), so the forge mirrors take the full accumulated root diff modulo forge
   nouns.

4. **`n4-planner-profiles` — the survey-mode framing.** F3's planner half: the frontmatter description
   every orchestrator sees in the agent listing says the planner "selects a bundle", and the survey
   intro repeats it, while the actual limit ("do not manufacture a bundle") sits ~80 lines below. The
   three `.toml` twins are byte-identical at HEAD and are asserted so by `validate-script-sync.js`;
   `test-agent-profile-parity.js` additionally requires every curated feature token present in the
   `.md` to appear in all three twins, so it is declared alongside them.

5. **`n5-regression-pins` — the durable guard.** This issue exists because prose drifted and no machine
   noticed: finding 4 is a dangling cross-reference to sections that were removed when `issue-scout`
   was folded into the planner, and it survived every chain. Correcting the words without adding a pin
   would leave the same hole open. This node adds the regression assertions to the five contract
   validators.

6. **`n6-docs`** delivers the CHANGELOG entry and the decision record for the two F2/F5 choices.
   **`n7-falsify`** is the adversarial change gate over the whole candidate. **`n8-code-certify`** is
   the single common code certifier wall. **`n9-finalize`** is the sink.

### One design decision made here, not deferred

**The `auto-bundle entry` identifier is NOT renamed.** F3's fix shape suggests renaming the branch
(e.g. to "planner-survey entry"). Direct inspection shows that string is not a label but a **pinned
contract token** carried by at least nine machine-enforced sites outside the six surfaces:
`scripts/validate-workflow-contracts.js` (and its byte-identical codex peer
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js`),
`scripts/validate-kaola-workflow-contracts.js`, both forge contract validators,
`templates/routing/required-blocks.js` (`content_tokens`), `scripts/test-route-reachability.js`
(a token × six-surface table), and both forge codex walkthroughs — plus `README.md`,
`docs/conventions.md`, `docs/architecture.md`, `docs/api.md`, `docs/workflow-state-contract.md`, and
two decision records. Renaming it is a contract-token migration across roughly twenty files, not a
wording fix.

Acceptance criterion 3 asks that "the no-issue branch vocabulary **leads with** the single-issue
default; bundle selection **reads as** the guarded exception." That is a claim about emphasis and
reading order — what actually misleads an agent reading top-to-bottom — and it is fully satisfiable by
reordering and reframing the passages while leaving the anchor token intact. Taking the emphasis fix
and leaving the identifier is the surgical change; it also keeps every lane needle-preserving, which is
what makes the three-way antichain below legal. `n1` must re-verify this call against the spec it
builds and escalate rather than proceed if it concludes the identifier itself is the misleading
element — that would be a scope expansion, and scope expansion is not a repair.

### Why the shape is what it is — every `sequence` edge named

- **`n1` → {`n2`, `n3`, `n4`} (S1, data dependency).** The three writers consume one concrete artifact:
  `kaola-workflow/issue-796/.cache/n1-route-spec.md`, which fixes the F2 route, the F5 sidecar
  disposition, the exact replacement text per passage, and the pin inventory each lane must preserve.
  Without it the three lanes would each re-decide F2 and F5 and land mutually inconsistent prose.

- **{`n2`, `n3`, `n4`} co-open — the disjoint-write antichain.** These three share **no file**. `n2`
  owns `templates/routing/` plus the six `*workflow-next*` surfaces plus
  `scripts/test-route-reachability.js`; `n3` owns the six `*kaola-workflow-adapt*` surfaces; `n4` owns
  the four `workflow-planner` profiles plus `scripts/test-agent-profile-parity.js`. Disjointness is
  established by exact declared paths, not by inference. Each lane is independently green because each
  is needle-preserving: with the identifier rename off the table, every existing pin
  (`auto-bundle entry`, `No target (auto-bundle entry)`,
  `Branch first on whether the user named an issue`, `selection-evidence`, `thin router`,
  `--target-issue`, `watch-pr`, `subagent_type="workflow-planner"`, `--attest-planner-spawn`,
  `planner_control_boundary_violation`) survives its lane's edit untouched. `Backlog Inventory` and
  `What You May Read` are pinned by nothing, so finding 4 is free to fix.

- **{`n2`, `n3`, `n4`} → `n5` (S1, data dependency).** `n5` adds assertions **about text the three
  lanes write**. An `assertIncludes` for a passage that has not landed yet is red by construction, so
  the pins cannot precede their targets. This is the one edge that buys the run its durable guard, and
  it is why the five contract validators are held out of all three lanes rather than distributed among
  them: they are shared by all three, so no split of them could be disjoint.

- **`n5` → `n6` (S1).** The CHANGELOG entry and the decision record describe the completed change
  including the new pins, so the docs consume the full accumulated diff.

- **`n6` → `n7` → `n8` → `n9` (S3-class gate serialization).** Each is a gate or sink over the whole
  accumulated candidate and must observe everything upstream of it. The CHANGELOG deliberately lands
  **before** the certifier runs the recorded validation command: writing a chain-asserted document
  after the receipt run makes the receipt stale.

There are no co-opened write legs beyond the `n2`/`n3`/`n4` antichain, and no loops, selectors, or
fan-out groups. This is an **all-concrete spine**: the whole shape is provable at freeze, so it carries
zero `expansion-point` nodes.

### Why no security gate and no main-session gate

`security_certifier: none`. The labels (`bug`, `area:workflow-phases`, `area:workflow-router`) are not
in the sensitive set, and no declared path matches a sensitive pattern — the write sets are agent-facing
Markdown, a template module, a token table, and contract-assertion scripts. There is no auth surface, no
credential handling, no untrusted-input execution, and no path-resolution change.

No `main-session-gate`. Every acceptance criterion is delegable and machine- or reviewer-checkable: the
four chains prove the pins, and whether the reworded passages actually read unambiguously is exactly the
judgment `n7-falsify` and `n8-code-certify` exist to make. Nothing needs a human's eyes on a device or a
rendered artifact.

### What "done" means beyond `validation_command`

The four chains green is necessary and not sufficient — they were green while all five defects shipped.
Done additionally means:

- An agent told "work on #N" while an unrelated active folder exists arrives at #N. The resume shortcut
  fires only when the folder matches the named target, or when no target was named.
- A free-form task description has one documented route in which the described task **binds** the
  planner and cannot be silently outranked by the roadmap frontier, and the adapt command documents the
  entry that route lands on, so the dispatch template has a defined shape with no issue number.
- A reader of the no-issue branch meets the single-issue default before the bundle machinery.
- No agent-facing surface names a section or an artifact that does not exist — `Backlog Inventory`,
  `What You May Read`, and the `selection-evidence.md` sidecar claim are each either made true or
  removed, with prose, probe, and test agreeing on one story rather than three.
- The pins added in `n5` would have caught the original defects. `n7` verifies that claim rather than
  accepting it.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-route-spec | code-architect | — | — | 1 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-next-surfaces | implementer | n1-route-spec | templates/routing/next.skeleton.md, templates/routing/slots.js, templates/routing/required-blocks.js, commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, scripts/test-route-reachability.js | 1 | sequence | — | standard | — | — | — | — | — | — |
| n3-adapt-surfaces | implementer | n1-route-spec | commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md | 1 | sequence | — | standard | — | — | — | — | — | — |
| n4-planner-profiles | implementer | n1-route-spec | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, scripts/test-agent-profile-parity.js | 1 | sequence | — | standard | — | — | — | — | — | — |
| n5-regression-pins | implementer | n2-next-surfaces, n3-adapt-surfaces, n4-planner-profiles | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 1 | sequence | — | reasoning | — | — | — | — | — | — |
| n6-docs | doc-updater | n5-regression-pins | CHANGELOG.md, docs/decisions/D-796-01.md | 1 | sequence | — | standard | — | — | — | — | — | — |
| n7-falsify | adversarial-verifier | n6-docs | — | 1 | sequence | — | reasoning | — | — | the reworded routing layer genuinely closes all five reported defects without opening a new one: an agent told to work on a specific issue while an unrelated active folder exists can no longer reach the folder's issue by following the steps in order, a free-form task description has exactly one documented route in which the described task binds the planner and cannot be outranked by the roadmap frontier, the no-issue branch presents the single-issue default before the bundle machinery, no agent-facing surface names a nonexistent section or an unbacked artifact, the six rendered next surfaces are byte-identical to a fresh render of the skeleton, the three planner toml twins remain byte-identical and carry every feature token present in the md, and each regression pin added in n5 would actually have failed against the pre-change text | the entire accumulated diff for issue 796 against the run base — the next skeleton and slots plus the six rendered workflow-next surfaces, the six kaola-workflow-adapt surfaces, the four workflow-planner profiles, the routing-generation contract layer, the five contract validators, and the CHANGELOG and decision record — read together with the n1 route spec, and re-verified by running generate-routing-surfaces --check, test-route-reachability, test-generate-routing-surfaces, validate-script-sync, and test-agent-profile-parity | sequence | n2-next-surfaces, n3-adapt-surfaces, n4-planner-profiles, n5-regression-pins, n6-docs |
| n8-code-certify | code-reviewer | n7-falsify | — | 1 | sequence | — | reasoning | — | — | the complete issue 796 candidate satisfies every acceptance criterion and introduces no regression: the named-issue substitution path is closed, the task-description route is defined and documented at both the router and the adapt entry, the no-issue branch leads with the single-issue default, every dangling section and artifact reference is resolved with prose and probe and test telling one story, the pinned contract token auto-bundle and every pre-existing needle survive unchanged, plugin prose touched under plugins remains forge-neutral, and the recorded validation command is green across all four chains run sequentially | the entire accumulated diff for issue 796 against the run base across all four editions, validated by running the recorded validation_command end to end and by the forbidden-token check on every touched file under plugins | sequence | — |
| n9-finalize | finalize | n8-code-certify | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Briefs

### n1-route-spec

**Intent.** Settle the two open choices in issue #796 and emit one specification precise enough that
three independent writers produce mutually consistent prose without re-deciding anything.

**Read first.** Issue #796 in full (`gh api repos/:owner/:repo/issues/796`; note `gh issue view` fails
on this box for want of the `read:project` scope). Then `templates/routing/next.skeleton.md` — the
command region and the skill region are parallel, so locate **both** copies of every passage. Then
`commands/kaola-workflow-adapt.md` (frontmatter `argument-hint`, the "router enters with `{issue}`"
line, the literal dispatch prompt) and `agents/workflow-planner.md` (frontmatter `description`, the
"No-target survey mode" section, the Bundle Selection Rules).

**Approach.**

1. **Settle F2 (the task-description route).** Choose between binding the described task into the
   planner brief as the target/goal, and instructing that it be mapped to or filed as an issue first.
   Weigh it against the standing rule that priority ranking outranks goal alignment: whichever option
   is chosen, the described task must not be silently outrankable by the roadmap frontier, because that
   is the defect. Specify how the task text reaches the planner, and what the adapt dispatch template
   renders when there is no issue number.
2. **Settle F5 (the `selection-evidence.md` sidecar).** The sentence claims the sidecar "remains
   present" on the no-issue branch, but nothing writes it — the docking step lost its owner when
   `issue-scout` was folded into the planner. Note the asymmetry before choosing: giving the sidecar a
   writer keeps `claim.js`'s advisory probe, the `selection_evidence` closure-receipt field, the
   archive-preservation carve-out, the walkthrough legs in all four editions, and the `selection-evidence`
   needle in all five validators green and truthful; deleting the sentence requires unwinding or
   re-justifying each of those. Whichever is chosen, prose, probe, and test must end up telling **one**
   story.
3. **Specify the passage edits.** For each of the five findings, give the exact current text and its
   replacement, per surface. For F1 name explicitly whether the fix is the added match condition or the
   swap of items 1 and 2, and make the resulting order unambiguous when read top-to-bottom. For F3
   specify the reordering that puts the single-issue default first, and the replacement frontmatter
   description (the issue suggests "selects a single issue or a high-confidence bundle").
4. **Inventory the pins.** For every passage being changed, list every machine assertion standing on it
   across the five contract validators, `templates/routing/required-blocks.js`,
   `scripts/test-route-reachability.js`, `scripts/test-agent-profile-parity.js`, and the four
   walkthroughs. Mark each as preserved-by-construction or needing an update, and state which node owns
   any update. This inventory is what keeps the three write lanes needle-preserving.
5. **Specify the `n5` pin set.** Propose the regression assertions that would have caught these five
   defects, and for each one state which node's text it asserts.

**Constraints.**

- Read-only. Declare no write set; your durable output is your `.cache` evidence file.
- Re-verify the plan's decision that `auto-bundle entry` is **not** renamed (see `## Design`). If you
  conclude the identifier itself is the misleading element, say so explicitly and escalate — do not
  quietly widen the spec into a token migration.
- Keep provenance out of the replacement prose. Agent-facing surfaces carry the rule, never issue
  refs, decision IDs, or ADR citations.
- Any replacement text destined for a file under `plugins/` must be forge-neutral: no forge CLI binary,
  brand, or request noun — write "the forge CLI" / "the forge".
- Do not edit any file. If the spec cannot be completed without a decision that is a values call rather
  than a fact, name it and stop rather than guessing.

### n2-next-surfaces

**Intent.** Land all five findings on the `next` routing topic.

**Read first.** `kaola-workflow/issue-796/.cache/n1-route-spec.md` — it is the binding specification;
do not re-derive its decisions. Then the header comment of `scripts/generate-routing-surfaces.js`.

**Approach.** Edit `templates/routing/next.skeleton.md` — **both** the command region and the skill
region, since each renders separately — and `templates/routing/slots.js` where a passage is slot- or
splice-resolved rather than literal (the Inputs line naming a free-form task description is slot
`nx-cmd-001`, which carries per-forge variants). Then regenerate with
`node scripts/generate-routing-surfaces.js --write` and confirm with `--check`.

**Constraints.**

- **Never hand-edit a rendered surface.** The six `workflow-next` outputs are generated; a hand-edit is
  wiped by the next `--write` and turns all four chains red. Every change goes into the skeleton or the
  slots, then gets rendered. The six outputs are in your write set solely so the render can be
  committed.
- Preserve every existing needle listed in the `n1` pin inventory verbatim — in particular
  `auto-bundle entry`, `No target (auto-bundle entry)`,
  `Branch first on whether the user named an issue`, `selection-evidence`, `thin router`,
  `--target-issue`, `watch-pr`, `## Co-active Folders`, and `workflow-plan.md exists ->`. This lane
  does **not** rename the branch identifier.
- Before closing, run and capture real exit codes for: `node scripts/generate-routing-surfaces.js --check`,
  `node scripts/test-generate-routing-surfaces.js`, and `node scripts/test-route-reachability.js`.
  Never gate on a piped `| tail` — capture `$?` directly.
- Forge-neutral prose in every file under `plugins/`; verify with
  `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only <file>`
  and the gitea equivalent.
- `non_tdd_reason` for your evidence: this is agent-facing prose and generated-surface rendering with no
  natural failing unit test; the machine assertions that pin the new wording are added downstream in
  `n5`, because a needle asserting text that has not landed is red by construction.
- If a change you must make requires editing a file outside your declared write set, stop and report it
  rather than writing outside the set.

### n3-adapt-surfaces

**Intent.** Give `/kaola-workflow-adapt` a documented no-target / task-description entry, so the route
the router promises has a defined shape.

**Read first.** `kaola-workflow/issue-796/.cache/n1-route-spec.md`, then `commands/kaola-workflow-adapt.md`
end to end.

**Approach.** Apply the F2 adapt-side edits from the spec: the frontmatter `argument-hint`, the "the
router enters with `{issue}`" statement, and the literal dispatch prompt template so that
`{issue-or-project}` has a defined rendering when no issue was named. Mirror into the two forge command
ports and the three SKILL packs; the forge ports take the full accumulated root diff as their canonical
spec, mirrored hunk for hunk modulo forge nouns.

**Constraints.**

- These six files are hand-ported, not generated — edit each, and keep the set consistent.
- Strictly needle-preserving. The literal planner dispatch prompt is pinned on the terms
  `Repository root:`, `Selected issue/set/project:`, `workflow-planner`, `agents/workflow-planner.md`,
  and `bounded durable handoff packet`; the surfaces are also pinned on `subagent_type="workflow-planner"`,
  `model="{WORKFLOW_PLANNER_MODEL}"`, ``NOT `acquired` or `owned` ``, `do not blind-read`,
  `planner_control_boundary_violation`, and `--attest-planner-spawn`. Prefer additive edits. You do
  **not** own any contract validator, `scripts/test-route-reachability.js`, or
  `templates/routing/required-blocks.js` — if your change would break a pin in one of those, stop and
  report it as a write-set finding rather than writing outside your set.
- Forge-neutral prose in every file under `plugins/`; verify with the standalone `--forbidden-only`
  check on each touched file.
- Keep provenance out of these surfaces.
- `non_tdd_reason`: agent-facing prose with no natural failing unit test; the pins land in `n5`.

### n4-planner-profiles

**Intent.** Make the survey-mode framing lead with the single-issue default, and repair the dangling
cross-reference that points at planner sections which no longer exist.

**Read first.** `kaola-workflow/issue-796/.cache/n1-route-spec.md`, then `agents/workflow-planner.md`
(frontmatter `description`, the "No-target survey mode" section, the Bundle Selection Rules), then the
header comment and `FEATURE_TOKENS` list of `scripts/test-agent-profile-parity.js`.

**Approach.** Apply the F3 planner-side edits: reword the frontmatter `description` so the agent listing
no longer reads as bundle-first, and move the single-issue default to the top of the survey mode so the
bundle rules read as the guarded exception. Mirror every change into the three `.toml` twins.

**Constraints.**

- The three `.toml` files are **byte-identical** at HEAD and `validate-script-sync.js` asserts it — they
  must remain byte-identical to each other after your edit. Verify with `shasum` before closing.
- `scripts/test-agent-profile-parity.js` requires every curated feature token present in
  `agents/workflow-planner.md` to appear in all three twins. It is in your write set for two reasons: a
  reworded paragraph may have carried a pinned token, and a new token may be worth adding. Run
  `node scripts/test-agent-profile-parity.js` and `node scripts/validate-script-sync.js` before closing
  and capture real exit codes.
- Strictly needle-preserving otherwise. You do **not** own any contract validator — if an edit would
  break a pin in one, stop and report it.
- Keep provenance out of the profiles.
- `non_tdd_reason`: agent-facing prose with no natural failing unit test; the pins land in `n5`.

### n5-regression-pins

**Intent.** Close the hole that let this class of defect ship. Finding 4 is a cross-reference to sections
deleted when `issue-scout` was folded into the planner, and it survived every chain — because nothing
asserted it. Correct words without a pin leave the hole open.

**Read first.** The `n1` pin specification, then the evidence files of `n2`, `n3`, and `n4` to see what
text actually landed. Assert the text that is in the tree, not the text the spec proposed.

**Approach.** Add the regression assertions from the `n1` spec to the five contract validators. At
minimum: negative assertions that no routing surface names `Backlog Inventory` or `What You May Read`;
an assertion binding whichever F5 disposition was chosen so prose, probe, and test agree; and positive
assertions pinning the corrected named-issue precedence, the documented task-description route, and the
single-issue-first framing. Place each pin in the validator that owns the surface it asserts.

**Constraints.**

- `scripts/validate-workflow-contracts.js` and `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
  are **byte-identical peers** — apply every edit to both and verify with `shasum`, then run
  `node scripts/validate-script-sync.js`.
- Each new assertion must be green the moment you add it, since its target has already landed. If one is
  red, the surface is wrong: report it rather than weakening the assertion to fit.
- For each pin, state in your evidence why it would have failed against the pre-change text. A pin that
  passes on both the old and new text guards nothing; `n7` verifies this claim.
- Do not modify any existing assertion unless the `n1` inventory says it must change. Widening a needle
  to make it pass is a regression, not a fix.
- `non_tdd_reason`: these assertions are the tests; they are authored green against text already in the
  tree because a pin cannot precede its target.

### n6-docs

**Intent.** Record the user-visible change and the two decisions.

**Approach.** Add a `CHANGELOG.md` entry under `[Unreleased]` describing the routing-layer corrections
across all four editions. Write `docs/decisions/D-796-01.md` recording the F2 route choice, the F5
sidecar disposition, and the decision not to rename the `auto-bundle` contract token, each with its
rationale and the alternative that was rejected.

**Constraints.**

- Write these **before** the certifier runs the validation command. A chain-asserted document written
  after the receipt run makes the receipt stale.
- `D-796-01` is the next free decision-record id for this issue; confirm nothing under `docs/decisions/`
  already claims it.
- Provenance belongs here — this is where issue refs and decision IDs are correct, unlike the agent-facing
  surfaces.

### n7-falsify

**Intent.** Try to refute the claim that this candidate closes all five defects without opening a new one.
Do not confirm it.

**Approach.** Read the whole accumulated diff against the run base together with the `n1` spec. Simulate
an agent reading each reworded surface top-to-bottom under the exact scenarios in the issue: told "work
on #N" with an unrelated active folder open; given a free-form task description while the roadmap drives
a different frontier; entering the no-issue branch cold. Check the render seam (`--check` byte-identity),
the byte-identity of the three planner twins, and — the highest-value probe — whether each `n5` pin
actually fails against the pre-change text. Look specifically for a *new* ambiguity introduced by the
reordering, and for any surface where one of the six or the four went unmirrored.

**Constraints.** Read-only; author nothing. Record the verdict with the adversarial vocabulary
(`refuted` / `not_refuted` / `indeterminate`) and write evidence to
`kaola-workflow/issue-796/.cache/n7-falsify.md`.

### n8-code-certify

**Intent.** The single common code certifier wall (G1) over the complete candidate.

**Approach.** Review the entire accumulated diff across all four editions, then run the recorded
`validation_command` — the four chains sequentially — and certify on the real result.

**Constraints.**

- Capture the real exit code and the success sentinel for each chain; never judge by a piped `| tail`.
  A green claude chain alone is insufficient evidence for a cross-edition diff: `npm test` short-circuits
  on `&&`, so a red codex, gitlab, or gitea chain behind a green claude one is never reached. This plan
  therefore records the four chains as four explicit runs.
- Run the forge-neutrality `--forbidden-only` check over every touched file under `plugins/`.
- Record the approval verdict with the approval vocabulary (`approved` / `changes_requested`).

### n9-finalize

**Intent.** Close the run. Docs and state writes only.

**Constraints.** Pass both `--issue 796` and the issue-number set on closure. Sweep run gaps: every
run-discovered defect is filed or justified as noise, or the `gaps_unswept` gate refuses. No code writes
in this node.

## Node Ledger

| id | status |
| --- | --- |
| n1-route-spec | pending |
| n2-next-surfaces | pending |
| n3-adapt-surfaces | pending |
| n4-planner-profiles | pending |
| n5-regression-pins | pending |
| n6-docs | pending |
| n7-falsify | pending |
| n8-code-certify | pending |
| n9-finalize | pending |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-route-spec) | pending | | |
| implementer (n2-next-surfaces) | pending | | |
| implementer (n3-adapt-surfaces) | pending | | |
| implementer (n4-planner-profiles) | pending | | |
| implementer (n5-regression-pins) | pending | | |
| doc-updater (n6-docs) | pending | | |
| adversarial-verifier (n7-falsify) | pending | | |
| code-reviewer (n8-code-certify) | pending | | |
| finalize (n9-finalize) | pending | | |
