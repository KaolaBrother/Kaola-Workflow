evidence-binding: n2-opencode-sync ed8f0e67f28b
<!-- RED: paste RED here -->
RED: narrowed the S2 guard in scripts/test-opencode-edition.js (new sub-block (d): a
case-sensitive, whole-word `/\b(Opus|Sonnet)\b/` sweep over every generated
`.opencode/agent/*.md` + `.opencode/command/*.md` file, replacing the old tolerance
comment that explicitly exempted "Opus"/"Sonnet" MODEL-name prose surviving from
canonical bodies). Ran `node scripts/test-opencode-edition.js` against the UNCHANGED
generator (before touching sync-opencode-edition.js) — FAILED exactly 12 assertions,
0 unexpected:
  FAIL: S2 (#609): .opencode/agent/contractor.md:25: Claude model noun "Opus" leaked...
  FAIL: S2 (#609): .opencode/agent/contractor.md:33: Claude model noun "Sonnet" leaked...
  FAIL: S2 (#609): .opencode/agent/contractor.md:44: Claude model noun "Sonnet" leaked...
  FAIL: S2 (#609): .opencode/agent/contractor.md:45: Claude model noun "Opus" leaked...
  FAIL: S2 (#609): .opencode/agent/doc-updater.md:14: Claude model noun "Sonnet" leaked...
  FAIL: S2 (#609): .opencode/agent/synthesizer.md:2: Claude model noun "Opus" leaked...
  FAIL: S2 (#609): .opencode/agent/synthesizer.md:14: Claude model noun "Opus" leaked...
  FAIL: S2 (#609): .opencode/agent/workflow-planner.md:24: Claude model noun "Opus" leaked...
  FAIL: S2 (#609): .opencode/command/kaola-workflow-adapt.md:7: Claude model noun "Opus" leaked...
  FAIL: S2 (#609): .opencode/command/kaola-workflow-adapt.md:50: Claude model noun "Opus" leaked...
  FAIL: S2 (#609): .opencode/command/kaola-workflow-plan-run.md:314: Claude model noun "Opus" leaked...
  FAIL: S2 (#609): .opencode/command/workflow-next.md:205: Claude model noun "Opus" leaked...
opencode-edition test FAILED: 12 failure(s), 499 passed.
This matches the issue-609 inventory verbatim (workflow-planner.md:24 / contractor.md:25,33,44,45
/ synthesizer.md:2,14 / workflow-next.md:205 / kaola-workflow-plan-run.md:314 /
kaola-workflow-adapt.md:7,50), PLUS one site the inventory did not list —
doc-updater.md:14's vendor `local-override:` HTML-comment note ("belongs on Sonnet per
CLAUDE.md model rules") — found via a manual full-tree grep before writing the guard,
and folded into the same fix so the narrowed guard has no known gaps.
<!-- GREEN: paste GREEN here -->
GREEN: implemented a pure `rewriteClaudeModelNouns(text)` helper in
scripts/sync-opencode-edition.js (mirrors the shape of the existing
`rewriteClaudeScriptPaths()`) — 9 exact-phrase regex rewrites, each scoped to one
verbatim B2 noun-phrase shape (never a blanket `/Opus/` or `/Sonnet/`, so the B1
lowercase `` `opus`/`sonnet` `` tier tokens in workflow-planner.md's "Model
assignment" guidance and the frozen-plan example row are structurally untouched —
case-sensitive matching alone guarantees this). Replacement text never
re-introduces "Opus"/"Sonnet", so repeated application is a no-op — idempotency is
by construction, not merely tested. Wired into both generation paths:
  - `renderAgent()`: applied to `fm.description` (frontmatter) and to the rendered
    body (chained after `rewriteClaudeScriptPaths`).
  - `transformCommandBody()`: applied as the final pass, after the existing
    `rewriteClaudeScriptPaths(text)` call.
Exported `rewriteClaudeModelNouns` alongside the other pure renderers.

Rewrite map (site -> new prose):
  - "Reasoning-class (Opus)" / "reasoning-class (Opus)" -> "Reasoning-tier (top effort
    variant)" / "reasoning-tier (top effort variant)" (case-preserving on the leading
    letter) — synthesizer description + floor-note.
  - "reasoning-class **Opus**-floor `synthesizer`" -> "reasoning-tier-floor
    `synthesizer`" — plan-run's merge-conflict repair prose (whitespace-flexible across
    the line wrap).
  - "Opus orchestrator" -> "reasoning-tier orchestrator" — workflow-planner + contractor.
  - "separate Sonnet role" -> "separate standard-tier role" — contractor boundary heading.
  - "stay on **Sonnet** even under" -> "stay on the **standard tier** even under";
    "never promoted to Opus" -> "never promoted to the reasoning tier" — contractor
    floor-pin bullet.
  - "Opus front end" -> "reasoning-tier front end" — workflow-next router-rules prose.
  - "**`workflow-planner`**( subagent)? (Opus)" -> "**`workflow-planner`**$1 (reasoning
    tier)" — adapt's two Phase-0 mentions (bare + "subagent"-qualified forms collapse to
    one pattern).
  - "belongs on Sonnet per CLAUDE.md model rules" -> "belongs on the standard tier per
    CLAUDE.md model rules" — doc-updater vendor local-override note.

Verification (all commands run from the leg worktree):
  1. `node scripts/sync-opencode-edition.js --write` -> regenerated exactly the 7 files
     that carried a B2 site (contractor.md, doc-updater.md, synthesizer.md,
     workflow-planner.md, kaola-workflow-adapt.md, kaola-workflow-plan-run.md,
     workflow-next.md); the other 8 agents + 4 commands were untouched (byte-identical,
     no B2 sites to begin with).
  2. `grep -rn -P '\b(Opus|Sonnet)\b' .opencode/agent/*.md .opencode/command/*.md` ->
     0 matches (exit 1) across the WHOLE generated agent+command tree, not just the
     inventoried lines.
  3. `node scripts/sync-opencode-edition.js --check` -> "15 agent(s) + 11 command(s) +
     1 plugin(s) in parity with canonical." (clean).
  4. `node scripts/sync-opencode-edition.js --write` (second run) -> "write complete (0
     file(s) updated — tree already in sync)" — proves determinism/idempotency directly
     (not just absence of the banned noun).
  5. `node scripts/test-opencode-edition.js` -> "opencode-edition test passed (499
     assertions)." Full GREEN — the narrowed S2 guard (all four sub-checks a/b/c/d) plus
     every other assertion in the 4-editions-additive opencode suite.
  6. Manually re-read the 7 regenerated files end-to-end to confirm the new prose reads
     grammatically (not just noun-substituted) — all read cleanly (e.g. "The
     reasoning-tier orchestrator dispatches you **once**...", "You stay on the
     **standard tier** even under `--profile=higher`. Bookkeeping is non-judgment; it is
     never promoted to the reasoning tier.").

Scope confirmation: `git status --porcelain` in the leg shows only the 2 declared
files modified (scripts/sync-opencode-edition.js, scripts/test-opencode-edition.js);
`.opencode/` is gitignored (generated-only, never committed). Confirmed both files are
opencode-only tooling — grepped package.json, scripts/simulate-workflow-walkthrough.js,
and scripts/test-route-reachability.js for either filename: zero references — so this
node touches nothing the claude/codex/gitlab/gitea four-chain pins (D-530-02, opencode
is additive, no #307 obligation for this diff).

Deviations from the brief: none in write-set or approach. One addition beyond the
brief's inventory: proactively found and fixed doc-updater.md:14 (a vendor-note B2 site
the issue's inventory did not enumerate but the narrowed guard would otherwise still
flag) so the guard has no known residual gap.
