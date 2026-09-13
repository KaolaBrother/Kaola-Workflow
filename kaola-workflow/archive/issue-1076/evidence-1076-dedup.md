# issue-1076 — deduplication evidence table

Base commit: d8a59cdcff43c15e0653db0a928870f68af42766 · Branch: workflow/issue-1076
Rule applied: remove only when a surviving loaded authority or the same prompt already carries the
meaning. No size target.

## Deletions → surviving authority

| # | Removed text | Location | Surviving authority (loaded carrier) |
|---|---|---|---|
| 1 | "a project exception must state its scope and must not weaken higher-priority instructions or host safety boundaries" | next.skeleton ¶First Principles | global contract (universal-contract bullet, verbatim rule) — machine-global install on all 8 runtimes |
| 2 | "`workflow-state.md` records issues, branch, and worktree" → "carries it" | next claim ¶ | global contract names the same file as the claim record; the file itself carries the fields |
| 3 | "Done results are known, todo items are the frontier, and" | next Resume ¶ | global Mission-List resume bullet (trusting done results; frontier = list − done − in-flight) |
| 4 | "Three writes only:" + "A completed item and its result are immutable; one dispatch has one result, including FAIL/BLOCKED." | next Mission-List ¶ | global write-moments bullet (three moments, immutable result, one dispatch one result incl. FAIL/BLOCKED) |
| 5 | "`BLOCKED` means the current owner cannot safely or legitimately continue." | next mission ¶ | global contract (verbatim same definition) |
| 6 | "Read list minus done minus in-flight and" | next Run it | global frontier formula (same words) |
| 7 | "; subagents execute and report" | next Run it | dispatch-contract (subagent = executor, handback = evidence) — embedded in command/skill renders; always-loaded Rule on grok/cursor/devin |
| 8 | "The last mission establishes readiness, while the summary, closure, archive, and sink receipts own terminal truth." | finalize entry ¶ | global contract (last-mission readiness + lifecycle records own final truth) |
| 9 | "Read the claim and Mission List." | finalize Card: validation | same prompt line 26 already reads `workflow-state.md` + `mission-list.md` |
| 10 | "A failed command, intermediate finding, repair attempt, or review round does not by itself create a mission." | finalize Card: validation | global recoverable-outcome bullet (same rule) |
| 11 | "a follow-up is new work with its own `filed: #N`;" | finalize corrections ¶ | same prompt: `filed: #N` already established in the follow-up filing instruction above |

## Examined and kept (issue rows requiring a keep decision)

| Row | Decision | Reason |
|---|---|---|
| Consent paragraphs | kept verbatim | pinned blocks; approval semantics must not change (issue constraint) |
| "Do not return `BLOCKED` merely because work remains" | kept | clause is NOT in the global contract — meaning not otherwise carried; pinned by runtime-agent-architecture A3 mutation-RED (behavioral check stays) |
| failed-command sentence in **Next** | kept | pinned by runtime-agent-architecture mutation-RED (`does not by itself create a mission` replace must fire); removed from Finalize only, where no behavioral pin exists |
| "It is not a Mission List item." (finalize) | kept | test-issue-1051:201 pin; 6-word disambiguation at the operation entry |
| `## Validation`/`## Changed Paths` (row 10) | kept | already exactly one purpose sentence (pinned) + one schema list + one output mapping — the issue's required shape |
| nx-scripts-resolver ×3, fz-scripts-resolver ×4 | kept | each fenced bash block must run standalone across sessions/compaction; shell vars cannot be assumed to survive — measured 3+4 copies, all required for independent runnability |
| mutation-invalidates-PASS sentences | kept | pinned tokens; they encode the freeze→measure→fix→revalidate ordering the issue says to preserve |
| all-or-nothing / stop / never-auto-route per surface | kept | each surface loads independently; every copy is the only copy on its prompt |
| orchestrator-holds enumeration, custody/causal-class, tdd-guide custody, sink judge/report facts | kept | unique content or pinned; only the repeated judgment-narration clause was removed |

## Test retunes (only pins of intentionally removed text)

- `templates/routing/required-blocks.js` nx-mission-list: dropped 3 tokens pinning removed sentences ('completed item and its result are immutable', 'one dispatch has one result', '`BLOCKED` means the current owner cannot safely')
- `required-blocks.js` fn-outcome-candidate: dropped the failed-command-sentence token (removed from finalize)
- `required-blocks.js` fn-forge-is-the-backlog: correction-sentence token updated to the trimmed wording
- `scripts/test-issue-1053-next-task-quality.js`: required-list token 'Three writes only' → 'before the work goes' (write-moment sequence survives)
- `scripts/fixtures/issue-1055-render-baseline.json`: recaptured via documented `--write-baseline` policy in the same change (intentional render drift)

## Carrier existence (per affected runtime)

- Global contract: machine-global install carrier for every runtime (runtime-contract-adapters.json host surfaces); the skeletons reference it as "the loaded machine-global workflow contract".
- Dispatch contract: embedded in the generated command render (claude + command-consuming runtimes) and skill render (codex); always-loaded Rule on grok/cursor/devin with one pointer sentence in the prompt.
- Cursor CLI trailer: regenerated by sync-cursor-edition transform; verified 0 exact-duplicate sentences in cursor next/finalize renders.

## Before/after word counts (observation only, consistent inventory)

| surface | before | after |
|---|---|---|
| next.skeleton.md | 1136w / 158L | 1067w / 154L |
| finalize.skeleton.md | 1264w / 195L | 1211w / 190L |
| commands/workflow-next.md (claude github) | 1907w / 211L | 1838w / 207L |
| commands/kaola-workflow-finalize.md | 2148w / 248L | 2095w / 243L |
| codex skill next / finalize | — | 1804w / 2002w |
| cursor render next / finalize (in-memory transform) | — | 1515w / 1704w, 0 exact-dup sentences |

## Validation

Focused suites (all pass): generate-routing-surfaces --check 24/24 byte-match; test-generate-routing-surfaces 480; test-route-reachability 148; test-issue-1053 264; test-issue-1051 50; test-runtime-agent-architecture 714 (incl. all mutation-RED checks); test-issue-1044-prompt-bundle 245; test-issue-1054-finalize-record-simplification 142; test-bash-block-guards 49; cursor 611 / opencode 614 / kimi 434 / zcode 463 / grok 412 / devin pass; test-issue-1044-runtime-adapters 65; issue-1055 oracle pass after sanctioned --write-baseline; validate-workflow-contracts pass.
Integration chain: `npm test` (claude+codex+gitlab+gitea) — see run record for final status.

## Post-rebase final-candidate measurements (candidate c07d82e3 on 4ef4b755)

Method: `docs/prompt-size.md` reproduction — generated GitHub Next/Finalize carriers +
`renderContract` global rule, whitespace-separated words, tokens = words x 1.5 rounded to 10.

| Runtime | Next words | Finalize words | Global words | Combined est. tokens |
|---|---:|---:|---:|---:|
| Claude Code | 1838 | 2095 | 324 | 6390 |
| Codex | 1804 | 2002 | 324 | 6200 |
| Cursor | 1517 | 1706 | 1034 | 6390 |
| Grok CLI | 1267 | 1528 | 915 | 5560 |
| Devin CLI | 1286 | 1567 | 892 | 5620 |
| Kimi Code | 1739 | 2018 | 324 | 6130 |
| OpenCode | 1741 | 2022 | 324 | 6130 |
| ZCode | 1751 | 2023 | 324 | 6150 |

Delta vs 12.0.0 baseline table: every runtime saves 180 estimated tokens (190 for OpenCode),
all from the Next/Finalize subtraction; global carriers unchanged.

Validation re-run at c07d82e3: `generate-routing-surfaces --check` 24/24 byte-match;
`test-release` 247; `test-generate-routing-surfaces` 480; `test-issue-1055` oracle 5 assertions /
132 comparisons. Render surface bytes identical to the b6a838af tree where the full `npm test`
four-forge chain passed; delta since then = version strings + docs only.

## Main-red finding + fix (cc077eeb)

`test-issue-1052-cursor-cli-startup-prep` FAILS on unmodified `4ef4b755` (main): two assertions
(`c4-readme-prep`, `c4-readme-app-cloud`) pin Cursor CLI `--ensure-target` prep and App-like
`--worker-dir` ensure-skip in the README itself; Codex's reorganization moved them to the edition
guide. Restored a compact two-sentence form beside the guide link — 251 assertions green.
Full `npm test` (4 forge chains) at `cc077eeb`: exit 0.
