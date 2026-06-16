evidence-binding: n2-resume-ambiguity-guard c4a1c6908322
<!-- RED: paste RED here -->
RED: FAIL: #503(A): ambiguous resume must exit 1 (got code=0, json={"resumed":true,"project":"issue-63","issue":63,"phase":2,"next_command":"/kaola-workflow-phase2 issue-63"})
FAIL: #503(A): ambiguous resume must emit reason:resume_ambiguous (got {"resumed":true,"project":"issue-63","issue":63,"phase":2,"next_command":"/kaola-workflow-phase2 issue-63"})
FAIL: #503(A): ambiguous resume must list both candidates (got {"resumed":true,"project":"issue-63","issue":63,"phase":2,"next_command":"/kaola-workflow-phase2 issue-63"})
FAIL: #503(A): candidates must include issue-63 (got {"resumed":true,"project":"issue-63","issue":63,"phase":2,"next_command":"/kaola-workflow-phase2 issue-63"})
FAIL: #503(A): candidates must include issue-65 (got {"resumed":true,"project":"issue-63","issue":63,"phase":2,"next_command":"/kaola-workflow-phase2 issue-63"})
claim-hardening tests FAILED (5 failures, 75 passed)
<!-- GREEN: paste GREEN here -->
GREEN: #503(A)+(B)+(C) all pass; claim-hardening tests passed (80 assertions — 5 new #503 assertions green)
