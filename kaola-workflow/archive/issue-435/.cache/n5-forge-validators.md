evidence-binding: n5-forge-validators 72bff0b93102
implementer added the gap-sweep forge port to both lists (scriptFiles + installSupportScripts) in the gitlab+gitea contract validators, mirroring run-chains.
non_tdd_reason: config/list-registration in two forge validators; the validators are the executable spec, no separate unit test.
build-green: full gitlab contract validator exit 0; full gitea contract validator exit 0.
Scope: only the 2 declared validator files (other M/?? are sibling nodes n1-n4).
