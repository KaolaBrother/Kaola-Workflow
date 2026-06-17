evidence-binding: n1-fix 65c841b6a07d
<!-- RED: paste RED here -->
RED: testSinkTransactionCleanEndToEnd — AssertionError: #520: sink journals must NOT be tracked in git after --sink; got: kaola-workflow/archive/issue-4293/.cache/sink-receipt.json (pre-fix: archive_commit staged the full archive dir, sweeping sink-receipt.json into main)
<!-- GREEN: paste GREEN here -->
GREEN: testSinkTransactionCleanEndToEnd passes; 6/6 assertions green (main advances, feature merged, receipt all-done, ls-files empty, on-disk exists); gitlab + gitea chain assertions also green
