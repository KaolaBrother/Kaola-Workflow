issue: #638
title: refactor(edition-sync): --check (runCheck) does not cover COMMON/byte-group mirrors — only GENERATED_AGGREGATORS
status: open
workflow_project: —
next_step: P3: extend edition-sync.js runCheck to verify COMMON_SCRIPTS + BYTE_IDENTICAL_GROUPS mirrors (parity with runWrite's #629 create-on-missing) so --check reds a missing/drifted mirror on its own (today validate-script-sync catches it in-chain so it's fail-closed end-to-end; low/cosmetic --check/--write asymmetry surfaced by #629's adversary); + a test-edition-sync.js case; cross-edition #307
