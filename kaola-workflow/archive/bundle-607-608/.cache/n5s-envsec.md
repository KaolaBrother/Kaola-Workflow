evidence-binding: n5s-envsec 71c07417afc8
verdict: pass
findings_blocking: 0

finding: N1 | severity=low | action=note | status=noise | .env.example's new KAOLA_GATE_WINDOW_FENCE example line shows the opt-out value (=0) rather than the default (unset/ON); this matches the file's pre-existing convention for other default-ON boolean flags (KAOLA_PARALLEL_WRITES=0, KAOLA_WORKTREE_NATIVE=0, both predate this diff) and the prose directly above it states "default ON... Set to 0 ... to opt out" unambiguously, so it is not misleading in context — flagged only because it is a security-relevant control and the pattern is worth a second look if this file is ever restyled.

## Scope

Reviewed all 9 files in n5-docs' uncommitted working tree diff: .env.example, CHANGELOG.md, README.md,
docs/api.md, docs/architecture.md, docs/conventions.md, docs/workflow-state-contract.md (modified) plus
docs/decisions/D-607-01.md, docs/decisions/D-608-01.md (new, untracked).

## Checks performed

1. **Secrets/credentials scan** — `git diff | grep -inE` for path/username leakage, password/secret/token
   patterns, and common credential-format regexes (ghp_, glpat-, xox[baprs]-, AKIA...) across the entire
   diff: zero matches. .env.example's existing all-commented-placeholder convention is preserved; no real
   values introduced anywhere (GITEA_TOKEN/GITEA_SERVER_URL placeholder lines untouched by this diff).

2. **KAOLA_RUN_CHAINS_TIMEOUT_MS default (#608)** — docs (.env.example, README.md, docs/api.md,
   docs/conventions.md, D-608-01.md) all claim default 1800000ms (30 min, raised from 900000ms/#512).
   Verified against scripts/kaola-workflow-run-chains.js:658-660 (`resolveTimeoutMs`): fallback literal is
   `1800000`. Matches exactly, including the "invalid/zero/negative falls back to default; no upper clamp"
   claim (function body: `(Number.isFinite(v) && v > 0) ? v : 1800000`). The new `timed_out` receipt field
   claim (promoted from a previously-stripped internal `_timedOut` marker, backward-compatible absent=false)
   matches the CHANGELOG/D-608-01 narrative and is consistent with the api.md receipt-schema example shown.

3. **KAOLA_GATE_WINDOW_FENCE default posture (#607)** — docs (.env.example, README.md, docs/api.md,
   docs/conventions.md, docs/workflow-state-contract.md, D-607-01.md) all claim: default-ON (fence active
   when the var is unset), only `0`/`false`/`no` disables it, and rule (c) is evaluated FIRST ahead of the
   KAOLA_LANE_CONTAINMENT rules (a)/(b) so it fires independent of that flag. Verified against
   hooks/kaola-workflow-write-lane.sh: line 31 `WL_GATE_FENCE_ON=1` (default true) with line 32 only
   flipping it to 0 on `0|false|no` — matches "any other value, including unset, keeps it ON" exactly. The
   rule (c) block (lines 113-127) runs before the rule (a)/(b) block (starts line 132) in the script's own
   linear flow — matches "evaluated FIRST" verbatim. The documented carve-outs (workflow bands, `.kw/`
   band, member worktrees governed by rule (a), a co-open writer's own declared lane) all correspond 1:1 to
   the actual conditional (`!inWorkflowBand`, `!inKwBand`, `!inAnyMemberWorktree`, `underCoOpenLane`) — no
   doc claim overstates the carve-out surface or hides a bypass.

4. **.env.example security-posture check** — confirmed the new KAOLA_GATE_WINDOW_FENCE block does NOT
   recommend disabling the fence as a general practice; framed strictly as an opt-out escape hatch
   ("Set to 0 ... to opt out. See docs/decisions/D-607-01.md") consistent with how the pre-existing
   KAOLA_PARALLEL_WRITES entry frames its own `=0` fallback (see finding N1 above for the one low-severity
   note on this).

5. **Local-path/username/environment leakage** — no absolute local paths, usernames, or machine-specific
   detail found in any of the 9 files; all new prose is generic and consistent with existing file
   conventions (issue refs, node-id placeholders, env-var names only).

6. **New decision records (D-607-01.md, D-608-01.md)** — read in full; both are narrative ADRs with no
   executable content, no secrets, and their factual claims (kill-ceiling values, fence default polarity,
   rule ordering, running-set `kind:'gate'` shape) cross-checked clean against source in items 2-3 above.
   D-607-01's disclosed residual gaps (Bash-mediated writes uncovered, pre-existing `.cache/`-anywhere
   carve-out, sticky fence on crash) are honestly stated as accepted tradeoffs, not silently omitted.

No CRITICAL or HIGH findings. Verdict: pass.
