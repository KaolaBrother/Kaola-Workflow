# Issue #1049 delivery evidence

## Candidate and actual dispatch

Final production/test/documentation candidate: `e1b3f1869b6f978a19ac25252e18820273c83b11`, based on `7e93763e43864091f722b306c404bb85d7f96052`. The owner withdrew the intermediate shared-policy expansion; see scope-correction.md. The final 18-file delta contains Codex model defaults, their generated carriers, acceptance and documentation only. Earlier candidate records are historical.

The orchestrator's native dispatch calls used the owner-requested proposed configuration during this run:

| Task | Native role | Model / effort | History | Useful outcome |
| --- | --- | --- | --- | --- |
| `/root/astra_audit` | planner | `gpt-6-astra` / `high` | none | Static instruction audit; its proposed policy expansion was later withdrawn |
| `/root/astra_acceptance` | tdd-guide | `gpt-5.6-luna` / `max` | none | Independent RED/GREEN acceptance, including correction of its parser defect |
| `/root/astra_implementation` | implementer | `gpt-5.6-luna` / `max` | none | Source changes, generated carriers and current docs |
| `/root/astra_review` | code-reviewer | `gpt-6-astra` / `medium` | none | Exact-candidate independent review; see review-evidence.md |

These entries describe the real successful native dispatch requests, not model self-identification. Parent global default remained Astra/xhigh. This run provides functional and operational evidence; it is not a controlled comparison of model quality, latency, or cost.

## Source to installation to runtime

- `templates/agents/runtime-capabilities.json` owns the three Codex adapters' standard/reasoning/heavy defaults. The six reasoning/heavy pairs change; standard and all other runtime model pairs remain unchanged.
- Shared global/routing author sources, behavior contracts and both contract validators are byte-identical to baseline. No shared authorization, dispatch or evidence-reuse policy changes remain.
- Existing generators update only the model pairs in nine Codex Next/Finalize/static recovery carriers. Native role profiles retain omitted-model inheritance and are unchanged; native dispatch calls carry the selected explicit pair when supported. Other runtime carriers remain at baseline.
- Supported installer delivery and live local configuration verification are recorded in local-runtime-evidence.md. No context-management experiment, new scheduler, new preflight, or receipt evaluator was introduced.

## Prompt size measurements

Measured with Node Buffer lengths over baseline git blobs and frozen candidate files. These are UTF-8 bytes, not token counts or a performance benchmark.

| Surface | Before bytes | After bytes | Delta |
| --- | ---: | ---: | ---: |
| Global contract | 3,293 | 3,293 | 0 |
| Shared dispatch contract | 1,913 | 1,913 | 0 |
| Codex GitHub Next skill | 11,548 | 11,548 | 0 |
| Codex GitHub Finalize skill | 17,807 | 17,807 | 0 |
| Codex GitHub compact recovery | 7,460 | 7,460 | 0 |
| Codex implementer profile | 7,256 | 7,256 | 0 |
| Cursor static recovery, each forge | 8,499 | 8,499 | 0 |

There is no final prompt expansion or compression. Shared surfaces are byte-identical; Codex carrier differences contain only equal-length model-name replacements. The intermediate +438-byte Cursor expansion and its speculative compression are withdrawn.

## Frozen-candidate integration

At the withdrawn intermediate candidate, five additive-runtime suites passed (OpenCode 875, Kimi 824, Grok 705, Cursor 830, ZCode 861); those results are not final-candidate evidence. The narrowed candidate restores their instruction/model sources and generated behavior to baseline. Its independent focused checks pass: architecture 808, routing 480, prompt bundle 153, global contract 140, runtime adapters 65, Cursor conformance 24, bash guards 49, spawn classification 10 mutation assertions, relative TMPDIR 50, install-model rendering and contract/sync checks. See acceptance-evidence.md for commands and scope proof.

The producer's `node scripts/kaola-workflow-run-chains.js --project issue-1049 --json` completed successfully at e1b3f186 with all four chains, every step green and no waiver, retry, timeout or signal. The clean receipt binds codeTreeHash `f6d35f818e23c64bdc8503d8f62f7e6011015fffbc2a1017a50e49832707a9cd` and includes the required walkthrough. The validation recorder separately records that executed command in final-validation.md. See the finalization summary and chain receipt for exact coverage and timestamps.
