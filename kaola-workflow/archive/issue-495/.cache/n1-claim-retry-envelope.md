evidence-binding: n1-claim-retry-envelope f95ff6f883d7
<!-- RED: paste RED here -->
RED: test_495_transient_retry_single — FAIL: #495(a-single): transient→success claim acquired (got status=target_unavailable, reasoning="classifier failed (subprocess error)", counter=1 expected >1); FAIL: #495(b-bundle): persistent transient → target_set_indeterminate (got status=target_set_unavailable, result=undefined, counter=1 expected >=3); FAIL: #495(c-bundle): determinate non-zero → result:refuse (got result=undefined) — 6 failures, 57 passed (seam present, mock called once, swallow bug intact — no retry, no indeterminate, no result field)
<!-- GREEN: paste GREEN here -->
GREEN: test_495_transient_retry_single passes; 63/63 claim-hardening assertions green (8 new #495 assertions + 55 pre-existing)
