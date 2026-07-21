issue: #734
title: bug(replan): prepare's readSource evidence check reads legacy receipt.body/receipt_sha256 — schema-2 raw_evidence_sha256 receipts always refuse replan_source_evidence_mismatch
status: ready — unblocked (#725 closed, v6.24.0 shipped 2026-07-21) — workaround applied by hand in all three phase runs
workflow_project: —
next_step: BATCH 4 — same readSource schema-2-shape fix as #720 (adjacent lines): read raw_evidence_sha256 receipts, not legacy body/receipt_sha256
