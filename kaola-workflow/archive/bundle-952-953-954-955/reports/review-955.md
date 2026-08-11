# Adversarial review — issue #955 (runtime capability divergence table)

reviewer: adversarial-verifier (review-955)
candidate: uncommitted worktree /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955
surface: docs/architecture.md (### Runtime capability divergence + § Model resolution repoint), docs/README.md

## Claim under test (verbatim)

"One pointer-only table now records per-runtime capability divergence. Every cell is a tier label
plus a pointer that resolves, no cell restates a mechanism fact, the codex tier restatement
elsewhere in the file was repointed rather than duplicated, and docs/README.md indexes it."

Analytical result: **refuted** (one demonstrated wrong-attribution pointer in the mandated repoint,
plus two demonstrated prose defects inside the section). Execution: completed — every attack ran to
a decisive answer; nothing indeterminate.

---

## Attack 1 — do all pointers resolve? CLAIM-HOLDS

Extraction was mechanical: a script parsed every backticked token out of the ADDED lines of
`git diff -- docs/architecture.md docs/README.md` (script at scratchpad/extract-pointers.js).

Paths — 23 concrete tokens, all exist (`FILE-OK`/`DIR-OK`); glob `plugins/*/agents/*.toml` → 42
matches. Three tokens flagged `MISSING` (`conventions.md`, `hooks.json`, `kaola-workflow-adaptive-schema.js`)
are bare-name citations following the file's pre-existing convention (architecture.md:270, :274,
:298, :399 already cite `kaola-workflow-closure-contract.js`, `api.md`, `opencode-edition.md` bare);
`conventions.md` also resolves relative to docs/. Not defects.

Symbols — all 8 exist in the file each is attributed to (`cmd: grep -n <sym> <file>`, all non-empty):
- `CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` — scripts/kaola-workflow-adaptive-schema.js:46,55
- `COMMAND_EDITIONS` / `SKILL_EDITIONS` — scripts/generate-routing-surfaces.js:66,71
- `KIMI_RUNTIME_NATIVE` — scripts/test-kimi-edition.js:411
- `MERGE_SETTINGS` — install.sh:43,71,700
- `commandSources()` — consumed at scripts/sync-opencode-edition.js:162,166 and scripts/sync-kimi-edition.js:117,121

Heading anchors — 13/13 resolve, em-dash tails are EXACT heading text, not added prose:
- opencode-edition.md: §What gets generated(:35) §Installer command set(:141) §Hooks(:155)
  §Model and effort — inherited from the session(:88) §Deploy layout — project vs global (scope-dependent)(:273)
- kimi-edition.md: §Roles as Skills(:52) §Installer command set(:149) §Hooks(:164)
  §One model tier — every subagent inherits the session model(:80) §Deploy layout — project vs global (scope-dependent)(:263)
- commands/kaola-workflow-finalize.md §Agent Model Dispatch(:29); docs/conventions.md §Bundle Lane(:191,
  prefix of "Bundle Lane — Cross-Edition Requirement (issue #328)" — conventions.md:358 itself uses the
  short form "§ Bundle Lane above"); install-all.sh §Codex marketplace-plugin convergence(:246 comment
  heading); architecture.md §Agent profiles (immediately below the section).
- `scripts/kaola-workflow-resolve-agent-model.js` "(header comment)" — the header comment exists and is
  currently accurate (it explicitly disclaims deciding a Claude Code `Agent(...)` dispatch; the
  previously-recorded false header has been rewritten).

Zero bare line numbers cited. README anchor `architecture.md#runtime-capability-divergence` →
`grep -c '^### Runtime capability divergence' docs/architecture.md` = 1 (unique, correct slug).

## Attack 2 — does any cell restate a mechanism fact? Cells: CLAIM-HOLDS. Absence sentence: one defect (R3)

All 20 cells read: label — pointer(s). The apparent mechanism prose in four cells ("inherited from
the session", "every subagent inherits the session model", "project vs global (scope-dependent)") is
verbatim quoted heading text, i.e. the anchor itself, verified against the target files above — not a
restatement that can rot independently. Borderline glue verbs remain ("consumes `commandSources()`
via …", "merge at …", "enforced by …", "(registry)"): each names only which pointer plays which part,
carries no value/behaviour that could drift, and every noun in them is itself a resolving pointer.
Not flagged.

Absence cell, half (a): `grep -l 'PreToolUse\|PostToolUse'` across ALL SIX hooks.json
(hooks/hooks.json, plugins/{kaola-workflow,-gitlab,-gitea}/config/hooks.json,
plugins/{-gitlab,-gitea}/hooks/hooks.json) → grep-exit=1 (no match); event census across the six =
`"SessionStart"`×6 + `"SubagentStart"`×6, nothing else. TRUE for every hooks.json.
Half (b): ADR 0011 lines 27-31 states verbatim: "there are no `PreToolUse` / `PostToolUse` hooks in
any edition. All six `hooks.json` carry only `SessionStart` + `SubagentStart`; the interception hooks
were retired in #372 and #725, and … walkthrough … asserts they must never return." The citation is
genuine, not decorative. BUT see R3: the shipped headline's scope ("No runtime") exceeds what the ADR
and the sentence's own evidence clause ("every edition's hooks.json") establish, and opencode
contradicts the capability reading — its shipped hook plugin registers `"tool.execute.before"`
(templates/opencode/plugins/kaola-workflow-hooks.js:148), opencode's pre-tool-execution event
(advisory, task-tool-only, fire-and-forget). The table's own opencode hooks cell points at that file.

## Attack 3 — the mandatory repoint. Literals gone, claims survive — but the attribution is WRONG (R1)

Literals gone from the whole file:
`grep -n 'gpt-5.6-sol\|xhigh\|/ medium\|`medium`' docs/architecture.md; echo $?` → exit 1 (nothing).
Not duplicated anywhere else in the file. Surviving-claims check against the removed text in the
diff — all five carried: same role classification ✓; maps at spawn time ✓; both mappings fixed ✓;
standard-tier task never changes model/effort for task-specific reasons ✓; no other runtime's model
resolution changes ✓.

BUT the rewritten sentence's central attribution is false. Shipped text:
"That pair is declared once, by `CODEX_PINNED_STANDARD_ROLES` and `CODEX_PINNED_REASONING_ROLES` in
`kaola-workflow-adaptive-schema.js`, and rendered from there into the Codex SKILL surfaces".
Measured:
- `grep -n "gpt-5.6-sol\|xhigh\|'medium'\|\"medium\"" scripts/kaola-workflow-adaptive-schema.js` → EMPTY.
  The schema contains no model name and no reasoning-effort value anywhere.
- schema:46-63: both constants are frozen ROLE ROSTERS (lists of role names). Their own header
  (schema:44-45) calls the classes "declarative metadata and wait defaults".
- The model/effort PAIR is authored in the skeleton PIN prose: templates/routing/next.skeleton.md:6-9
  and templates/routing/finalize.skeleton.md:8-9 (`model: "gpt-5.6-sol"` / `reasoning_effort:
  "medium"|"xhigh"`), rendered into the six SKILL surfaces.
- What IS rendered from the constants is the ROSTER (`<!-- SLOT:codex-tier-roster -->`), guarded by
  T19b (scripts/test-route-reachability.js:430ff); docs/conventions.md §Bundle Lane's own table says
  exactly this: the SKILL surfaces carry "the per-spawn tier roster, generated from those same two
  constants into the codex-dispatch-model-routing PIN (#944)".
A reader sent to the schema for the pair values finds none. The sentence is true of "that
classification"; of "that pair" it is false. This is the exact defect class the issue exists to
prevent — a confident pointer at the wrong source. (The table's codex model&tier CELL survives: its
second pointer, §Bundle Lane, does reach the pair carriers; only the §Model resolution paragraph
mis-attributes.)

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=doc-updater rationale=§ Model resolution says the model/effort pair is "declared once, by CODEX_PINNED_STANDARD_ROLES / CODEX_PINNED_REASONING_ROLES" — those constants declare role rosters only; zero model/effort literals exist in the schema; the pair is authored in templates/routing/{next,finalize}.skeleton.md PIN prose

## Attack 4 — label accuracy. CLAIM-HOLDS on all four contested cells

- kimi/dispatch `substituted` (not `none`): kimi-edition.md:52-80 — Kimi has no named custom
  subagents, so each role ships as a `kaola-role-<role>` Skill and every dispatch card is rewritten
  at generation time to built-in `explore`/`coder` with a contract-binding prompt prefix. Dispatch
  capability exists, routed through a different primitive — the `substituted` definition verbatim.
  `none` would be wrong.
- codex/model&tier `full`: the carrier genuinely ships — `<!-- PIN: codex-dispatch-model-routing -->`
  plus pair plus BOTH rendered rosters present in plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md:5-18
  (and the finalize twin, and both across all three plugin trees — grep found gpt-5.6-sol in all six
  SKILL surfaces); roster bound to the constants by T19b. #944's gap is closed in the shipped tree.
- opencode/model&tier `partial`: heading itself names the limitation ("inherited from the session"),
  opt-in tier pinning exists (opencode-edition.md:112). Honest.
- claude/hooks `full`: hooks/hooks.json + MERGE_SETTINGS merge at install.sh:43,71,700. Honest.

## Attack 5 — the forge-axis absolute. Two defects (R2, R3-adjacent) + one non-blocking observation

Shipped sentence: "…a claude or codex pointer may resolve to three trees rather than one — where it
does, the pointer's own path says so, and where the artifact is forge-independent it does not."
Counterexample, codex column: `plugins/kaola-workflow/config/hooks.json` is a single-tree path, but
the artifact ships in all three plugin trees and the three copies are NOT byte-identical —
`md5 -q plugins/*/config/hooks.json | sort -u | wc -l` → 3. Forge-DEPENDENT artifact, single-tree
pointer, nothing "says so". Weaker instances: `plugins/kaola-workflow/config/agents.toml` and
`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` (cited twice) are ×3 artifacts whose
copies ARE byte-identical (md5 unique-count 1 each) — content-forge-independent, so defensible, but
the reader has no way to tell the two cases apart; the hooks case breaks the stated rule outright.

finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=forge-axis disclosure rule ("where it does, the pointer's own path says so; where the artifact is forge-independent it does not") is false for the codex hooks cell — plugins/kaola-workflow/config/hooks.json is one path for a ×3, three-distinct-byte artifact

finding: id=R3 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale="No runtime registers a PreToolUse or PostToolUse hook" over-generalizes its own evidence (ADR 0011 + the clause both scope to the six hooks.json, i.e. claude+codex only); opencode's shipped plugin registers tool.execute.before — its pre-tool-use event — at templates/opencode/plugins/kaola-workflow-hooks.js:148, the very file the table's opencode hooks cell points at

Coherence with the paragraph above (~architecture.md:287-299): "Four forge editions … plus
plugins/kaola-workflow/ (Codex)" vs the new "claude and codex each ship against three forges" — real
tension (4 trees vs 2×3 framing), but the subsection's closing sentence ("Runtimes and forge
editions are different axes; this table is indexed by runtime") addresses it explicitly, and the
"not wired into the routing-surface propagation set" statement is NOT contradicted: the table labels
opencode/kimi command surfaces `rendered` via their OWN sync scripts consuming `commandSources()`,
which the pointers disclose. Observation only, non-blocking; noted as the deliberate out-of-scope
decision the brief mentioned.

Also verified TRUE: "opencode and kimi take `--forge` inside their own standalone installers" —
install-opencode.sh has 12 `--forge` occurrences (usage :80, parse), install-kimi.sh parses it at
:90-91.

One further section-internal inconsistency: post-table paragraph claims "The weakest pointer is
claude's dispatch carrier — no prose states that mechanism, so the pointer is the directory itself",
yet the claude dispatch cell's own second pointer is "§ Agent profiles below", and that section IS
prose describing the claude carrier ("Each role has a canonical `agents/<name>.md` (installed by
`install.sh` for Claude)…"). Defensible only under a narrow reading ("mechanism" = dispatch-time
semantics rather than the carrier itself); as written the paragraph contradicts the cell two
paragraphs up.

finding: id=R4 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=post-table paragraph says "no prose states that mechanism" for claude's dispatch carrier while the cell's own second pointer (§ Agent profiles below) is prose describing that carrier — section contradicts itself

## Attack 6 — docs/README.md. CLAIM-HOLDS

The Architecture bullet now carries an explicit sub-entry linking
`architecture.md#runtime-capability-divergence`; the slug matches the unique heading (count=1). The
added text's row list (dispatch carrier, command/skill surface, hooks, model & tier, install path)
matches the table's five rows, and its one claim ("a tier label plus a pointer per cell, never a
restated mechanism") restates the issue's rule, not a mechanism.

---

verdict: fail
findings_blocking: 4

Analytical result: **refuted**. The table itself is in good shape — every pointer resolves, the
cells stay pointer-only, the contested labels are honest, README indexes it — but the mandated
repoint's central sentence attributes the codex model/effort pair to constants that do not declare
it (R1), and the section carries two demonstrated prose-absolute defects (R2, R3) plus one
self-contradiction (R4). Confidence: high on R1 (measured: zero pair literals in the schema; pair
authored in the skeletons), high on R2 (three distinct md5s), medium-high on R3 (strict event-name
reading is vacuously true; capability reading is false and reachable from the table's own pointer),
medium on R4 (a narrow reading survives).
