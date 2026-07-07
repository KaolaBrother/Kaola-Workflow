evidence-binding: n1-probe-surfaces 55923f3c8a13
## n1-probe-surfaces — routing-surface divergence measurement (all 18 files read)

Topology confirmed: 3 commands + 3 Codex SKILLs per topic × 3 topics (plan-run / finalize / next) = 18 md files. A prior narrower attempt exists: #445/D-445-01 "plan-run skeleton + cards" (`docs/conventions.md:182-199`) — plan-run ONLY, not finalize/next.

### Divergence axes
**(a) RUNTIME (3-valued: Claude / Codex / opencode-in-passing):**
- Teammate-Mode block (Claude agent-teams) mirrored on ALL 6 plan-run surfaces: commands `kaola-workflow-plan-run.md:186-219` (34 lines), SKILLs `:241-262` (22 lines, shorter — wait-budget content pulled into `## Codex Join Protocol`). Dead on Codex/opencode but kept for cross-surface completeness.
- Codex v1/v2 dispatch + `turn_context.effort` proof: commands = un-headed paragraph `:221-239`; SKILL = own `## Dispatch` heading `:72-96` + a 55-line `## Codex Join Protocol` (SKILL:98-152) vs ~12-line compressed form + card pointer in commands.
- opencode referenced inline in prose (`:47-49`, `:184`) with NO opencode surface to source from → runtime axis has 3 values though only 2 get generated surfaces.
- Sub-sentence swap: `:325` "reasoning-class **Opus**-floor synthesizer" vs SKILL:350 "reasoning-class (non-lowerable floor) synthesizer" — Codex has no Opus concept; rest of paragraph byte-identical.

**(b) SURFACE-TYPE (command vs SKILL) — the HARD axis, topic-dependent depth:**
- Frontmatter differs categorically: commands `description:`+`argument-hint:`; SKILLs `name:`+`description:`.
- H1: commands never forge-suffixed; SKILLs carry `(GitLab)`/`(Gitea)`.
- `## Agent Model Badge` (9 lines) exists ONLY in commands (Codex has no `model=` param) — absent from all SKILLs.
- Restructuring depth VARIES: plan-run = additive reorg (SKILL ~8% LONGER, keeps skeleton + adds Dispatch/Join-Protocol); next = SKILL renames headings + adds 2 Codex-ONLY sections with NO command counterpart (`## Delegation Contract` SKILL:39-63, `## Codex Dispatch Mode Detection` SKILL:263-284); **finalize = WHOLESALE REWRITE**: command 9 numbered `## Step N` sections (~605 lines steps 1-9) vs SKILL single `## Required Steps` list 1-8 (~78 lines) — SKILL is ~51% the size, a 2:1 compression, NOT a slot-fill.

**(c) FORGE (github/gitlab/gitea):**
- Script-name substitution `kaola-workflow-X.js`→`kaola-{forge}-workflow-X.js` at every call site — BUT per-script table, NOT uniform: `kaola-workflow-resolve-agent-model.js` stays un-renamed in all 3 trees. Generator needs a rename TABLE, not a regex.
- Forge nouns: GitHub/GitLab/Gitea issue; `gh`/`glab`/`tea` CLI; PR/MR terminology.
- Forge nouns cause STRUCTURAL branch differences: gitlab finalize `case "$SINK_KIND" in mr|pr)` (extra label) vs github `in pr)`. Gitea ALSO reads `mr|pr)` despite no MR concept + no sink-mr.js → vestigial/unreachable DRIFT RESIDUE from copy-propagation.
- Even the "pure forge-swap" axis is imperfect: the "Dispatch base role profile… Set Working directory…" sentence sits at TOP of §3 in claude command (`:170-171`) but is RELOCATED/merged after Teammate-Mode (`:218`) in BOTH gitlab+gitea — they agree with each other, disagree with claude.

### Common-vs-variant ratio (TOPIC-DEPENDENT — the key design constraint)
| Topic | cmd avg | SKILL avg | ratio | character |
|---|---|---|---|---|
| plan-run | ~455 | ~491 | 1.08 | mostly-shared skeleton; PIN/CARD blocks BYTE-IDENTICAL cmd↔SKILL; variance in a few named blocks → TEMPLATE-SHAPED |
| finalize | ~936 | 476 | 0.51 | wholesale rewrite/compression — SKILL re-authors densely, NOT slot-substituted |
| next | ~525 | 447 | 0.85 | intermediate — same flow, renamed headings, +2 SKILL-only sections |

- WITHIN one surface type, the forge axis is small + regular (±2% line counts) → cleanly slot-fillable.
- The surface-type axis (command↔SKILL) ranges from mild reorg (plan-run/next) to outright rewrite (finalize).
- Contiguous vs interleaved: MOST variant regions are contiguous heading-delimited blocks, BUT ≥2 sentence-level splices exist that a block-level template CANNOT express: (1) `:239` Codex-dead clause + always-live clause in ONE sentence; (2) the Opus↔(non-lowerable-floor) mid-sentence swap.

### md↔toml parity
NONE of the 6 routing surfaces has a paired `.toml` (SKILL dirs contain only SKILL.md). The md↔toml contract is a SEPARATE family — the role AGENT-PROFILE prompts (`agents/<role>.md` ↔ `plugins/*/agents/<role>.toml`, #422/D-422-01, machine-enforced by test-agent-profile-parity.js). #630's routing-surface generator does NOT need to keep a .toml in sync for these files.

### #636 dead-prose block locations
- Teammate-Mode (Claude-live/Codex-doc-only): commands `:186-219` (34), SKILLs `:241-262` (22). CLEAN block (heading-delimited).
- Codex v1/v2 dispatch (Codex-live/Claude-dead): commands `:221-239` (un-headed paragraph, tail sentence `:239` splices into always-live "Instruct the role to:" — NOT clean on command side); SKILL `## Dispatch :72-96` (clean, own H2).
- `## Agent Model Badge` (Claude-only, no Codex counterpart): commands `:26-34`. Clean, absent (not dead-but-present) in SKILLs.
- `## Delegation Contract`/`## Codex Dispatch Mode Detection` (Codex-only, no command counterpart): next SKILL `:39-63`, `:263-284`. These are SURFACE-EXCLUSIVE new capability, NOT "mirrored-but-dead" — nothing to fence on the Claude side.

### Tractability signals (n1 conclusions for n4)
1. Ratio is TOPIC-DEPENDENT: plan-run (~85-90% shared) is template-shaped; finalize (~0-40% shared, 2:1) is genuinely independent authoring. A single skeleton+slot engine sized for plan-run does NOT fit finalize without either (a) accepting finalize stays hand-authored, or (b) a real SKILL rewrite (scope decision, not measurement).
2. Forge axis within a surface type = cleanly slot-fillable, BUT needs a per-script rename table (not a regex).
3. Runtime axis is 3-valued (opencode mentioned inline w/o its own surface).
4. #445 already tried this for plan-run ONLY and DRIFTED 3x past its ~150-line target (blocks re-added inline as PIN not externalized as CARD) → "what stays resident vs externalized" is NOT structurally enforced today.
5. NOT all divergence is block-clean (2 sentence-level splices) → a heading-to-heading slot model needs sub-sentence token substitution too.
6. Current propagation-by-copy is ALREADY imperfect (gitea vestigial mr| label; claude/gitlab sentence reordering) → a generator must NOT faithfully reproduce existing drift as ground truth.

delegation_outcome: completed
