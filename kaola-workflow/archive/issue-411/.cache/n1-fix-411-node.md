evidence-binding: n1-fix-411-node e2540583d549
result: complete
bugs-fixed: A (nonce), B (running-set/excl-batch)
tests-added: S-RT fused-nonce end-to-end
edition-sync: pass
four-chains: pass

RED: S-RT7 fused-advance opened.nonce is a non-empty 12-char string (BUG A) — got undefined; second close refused evidence_stale; S-RT8 closed node NOT removed from running-set.json; S-RT9 excl-batch member close not refused (pre-impl)
GREEN: S-RT7/S-RT8/S-RT9 pass; adaptive-node tests passed (492 assertions); all four chains exit 0
