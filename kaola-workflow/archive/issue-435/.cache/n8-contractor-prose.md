evidence-binding: n8-contractor-prose 8fbcb9c9dc63
implementer added ### Step 8c.2 - Run-gap sweep to agents/contractor.md (gap-sweep --json then --check, mirroring Step-8c run-chains, surface gaps_unswept + stop) + matching byte-identical bullet in all 3 contractor.toml. Canonical script name via kaola_script resolver (per-edition). Forge-neutral.
non_tdd_reason: cross-edition contractor-prose propagation; parity enforced by agent-profile-parity + validate-script-sync byte-identity + forge validators.
build-green: 3 contractor.toml byte-identical (cmp); test-agent-profile-parity 9 assertions exit 0; gitlab+gitea --forbidden-only exit 0.
Scope: only the 4 declared contractor files.
