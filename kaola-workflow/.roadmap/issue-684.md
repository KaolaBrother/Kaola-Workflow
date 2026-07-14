issue: #684
title: chore(tests): six #682 fail-closed repair/journal paths survive mutation with the suite green + #664 fold lacks a frozen-plan E2E — restore mutation-killing coverage
status: open
workflow_project: —
next_step: Mutation audit 2026-07-14: six fail-closed paths pass 2038/2038 + walkthrough when individually disabled (open-next + open-ready journal fences, candidate_digest_changed, unique-maximal-producer repair_requires_replan, writer_identity_changed, missing-journal compliance witness); archived issue-682 n2/n3 evidence overclaims suite coverage; plus the #664 fold now lacks a frozen-plan CLI E2E (post-#682 --attempt-id narrowing). Fix (M): mutation-killing regressions through the real subcommands + frozen-plan fold E2E; tests-only expected. Full body on GitHub #684.
