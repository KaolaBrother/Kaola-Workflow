evidence-binding: n2-finalize-prose 70cac5592045
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: Config / IaC — all 10 write-set files are documentation/configuration surfaces (markdown prose and TOML agent profiles) with no executable logic; verified by contract validators + route-reachability green (build-green tier)
<!-- regression-green|build-green|smoke-integration -->
build-green: validate-workflow-contracts.js exit 0, validate-kaola-workflow-contracts.js exit 0, validate-kaola-workflow-gitlab-contracts.js exit 0, validate-kaola-workflow-gitea-contracts.js exit 0, test-route-reachability.js exit 0 (170 assertions), validate-vendored-agents.js exit 0; all 6 validators green; PIN markers intact (12 PIN markers across 6 finalize surfaces); 3 contractor.toml files byte-identical
