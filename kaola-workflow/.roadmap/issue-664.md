issue: #664
title: bug(adaptive): repair-node leaves completed adversarial fan-out votes unrotated after writer repair
status: open
workflow_project: —
next_step: Post-ship audit 2026-07-12 reproduced at HEAD: repair-node's gate-reset loop (adaptive-node.js:3744-3767) folds only individually post-dominating gates, but parallel skeptics never individually post-dominate, so a COMPLETED {sk-a,sk-b} group downstream of the repaired writer keeps its round-1 votes and passes --verdict-check although the code changed after they voted (#658's repair-path Tests item, closed on reopen at :3388-3395, open on repair). Fix (M): fold the resolved fan-out group collectively in repair-node, mirroring reopen-node — group post-dominance as one unit, reset member rows, purge exact-group receipts; repair-path variant of the #658 regressions; adaptive-node is GENERATED class → sync:editions + four-chain. Full body on GitHub #664.
