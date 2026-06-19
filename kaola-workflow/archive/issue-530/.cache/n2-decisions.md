evidence-binding: n2-decisions a63e16a438af

# n2-decisions — synthesis (planner, opus) — defect inventory + decision candidates

## Deliverable A — Consolidated Defect Inventory (deduped, severity-ranked)

| ID | Dim | Description (cite) | Sev | Kind | Disposition | Rationale |
|----|-----|-------------------|-----|------|-------------|-----------|
| X1 | #1/#5 | Content-reachability gap: A9 (`test-opencode-edition.js:245-262`) = file existence only; nothing enforces PIN/literal tokens survive `transformCommandBody`. A6 compares generated↔renderer (mutate together); A14 checks model-prose ABSENCE. A greedy rewrite edit silently drops a token with all 223 green. | med | parity-leak | **FOLLOW-UP** (frozen plan has no fix node) | Gap is real (verified: tokens currently survive incidentally — `closure-audit` in finalize.md:923, `result: escalate` in adapt.md:113/next.md:356/auto.md:98, `--write-overlap-consent` in plan-run.md:128). Class of regression T4–T11 prevents for claude/codex. → file follow-up to add content-reachability assertions (Decision #5 Candidate C). |
| P5 | #10 | opencode undiscoverable: 0 matches in README.md; `docs/opencode-edition.md` orphaned from docs/README.md index; 0 in CLAUDE.md (Validation Policy/DocMap/Commands). | med | docs-discoverability | **FOLLOW-UP** | All 3 entry points list only Claude/Codex/GitLab/Gitea. Surgical docs fix, zero runtime risk. Exceeds frozen n5 write-set → follow-up. |
| P4 | #1 | Issue #530 body assertion count "145" stale; live = 223 (corroborated docs/opencode-edition.md:204). | low | stale-doc | **recorded** | Corrected in audit report. |
| P1 | #1 | `Agent(` dispatch literal leaks into all generated opencode dispatch cards (adapt.md:96; + phase/fast/finalize). opencode tool is `task`. Mitigated by badge naming `task` first (`sync-opencode-edition.js:177`). | med | parity-leak | **FOLLOW-UP** | No runtime break. Fix = scoped `Agent(`→`task` rewrite in `transformCommandBody` (non-trivial regex scoping). |
| P2 | #1 | "Claude Code agent" prose leaks verbatim (16×). | low-med | stale-doc | **FOLLOW-UP** | Conceptual; no runtime impact. Prose rewrite rule, 16 sites. |
| R2 | #3 | `node --check` (A11) on ESM `.js` w/o `"type":"module"` is Node-version-fragile. `.opencode/package.json` gitignored, no type field. Bun (prod) fine. | low-med | portability | **FOLLOW-UP** | Blocks Decision #6 Candidate A. Not a runtime defect. |
| R1 | #3 | dispatch-log `agent_id` hardcoded `""` (`:137`). | low | data-degradation | **FOLLOW-UP** | Non-blocking; attestation keys on agent_type+cwd. |
| S1 | #2/#9 | `reasoningEffort:'max'` for zhipu = unconstrained pass-through (schema-valid). Runtime no-op if provider doesn't honor key. | low | data-degradation | **FOLLOW-UP** | Schema valid; runtime smoke-test candidate. |
| R3 | #4 | opencode consumers get `~/.claude/kaola-workflow/scripts/` (Claude-namespace dir in non-Claude runtime). | low | portability | **FOLLOW-UP** | Cosmetic asymmetry; functional + documented. |
| P3 | #1 | `## Agent Model Badge` heading name preserved as anchor (`:172`); body opencode-correct. | low | stale-doc | **FOLLOW-UP** | Cosmetic relic. |

**Summary:** 0 HIGH — all runtime paths verified correct-by-construction. Per frozen plan (no fix nodes), all → FOLLOW-UP issues referenced in the report (acceptance criterion #4's explicit alternative). P4 corrected in-report.

## Decision #5 — route-reachability
- Candidate A — add `.opencode/command/` to T4–T11 in test-route-reachability.js. Falsification: CLAUDE.md:103 "SIX surfaces (3 Claude + 3 Codex)" → policy change; introduces non-forge surface into forge-specific file. Heavyweight.
- Candidate B — status quo (A9 only). **FALSIFIED**: a `transformCommandBody` edit stripping `<!-- PIN:...-->` passes ALL 223 assertions (A6 mutates both sides together; A9 = existence; A14 = model-prose absence). Gap is real.
- ⭐ **Candidate C (LEADING)** — extend `test-opencode-edition.js` with content-reachability assertions (PIN/literal token PRESENCE). Closes the gap surgically within the declared opencode twin test (`:10-12`); no policy change; ~15–20 new checks; runs where `.opencode/command/*.md` is in scope. Token set: `closure-audit`, `result: escalate`, `--write-overlap-consent`, `--speculative-consent`, `fast_compliance_unresolved`, `path_requires_explicit_opt_in`, `frontier unit`.

## Decision #6 — edition-machinery boundary
- Candidate A — wire `test:kaola-workflow:opencode` into `npm test`. Falsification: R2 (`node --check` ESM fragility) → a Node-version-specific failure in an additive non-forge edition blocks ALL 4 forge editions' Finalization. Unacceptable coupling. CLAUDE.md:48/102 name exactly FOUR forge chains.
- ⭐ **Candidate B (LEADING)** — stay additive (runtime-not-forge). Verified deliberate across 5 signals: edition-sync.js:43 FORGES excludes opencode; install-opencode.sh:4-6 standalone (no install.sh mod); CLAUDE.md:48 "four npm chains"; CLAUDE.md:102 Cross-edition Policy = forge trees only; CLAUDE.md:103 SIX-surfaces = Claude+Codex. #501 "self-sufficient; CI not a gate" names the four npm chains. Risk (undetected regression) mitigated by: install-opencode.sh:62-63 runs full 223-assertion suite on every install; X1 hardening (Decision #5 C); P5 discoverability.
- Candidate C (optional add-on to B) — add `test:kaola-workflow:opencode` script name to package.json for discoverability WITHOUT chaining into `npm test`. Half-measure on enforcement; best combined with B.

## next hint for n3
Strongest refutation of #5-C: prove a PIN-stripping transformCommandBody edit ALSO breaks A6 or A14 (planner asserts it cannot — A6 mutates both sides; A14 = absence patterns). Secondary: check if CI Node ≥22 with --experimental-detect-module makes A11 universally pass → #6-A viable.
