# Documentation update — bundle-1037-1039

verdict: PASS
candidate: 58d26e916dd9313f2aa5e671ea463cca1792895e

The cohesive convergence pass updated every declared authority required by the repository AGENTS instructions: `README.md`, `CHANGELOG.md` under `[Unreleased]`, `docs/README.md`, `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/cursor-edition.md`, `docs/runtime-capabilities.md`, ADR 0017, ADR 0021, public-interface comments, AGENTS guidance, and all generated runtime renderings from their canonical skeletons/templates. The final pass explicitly states that `install-all.sh` is current-machine-only and has no Cursor Cloud deployment mode.

The structured documentation was transcribed from the candidate's executable help/JSON surfaces, source-owned schemas, exact focused test output, generated-surface checks, and live CLI/App/Cloud probes. Cloud documentation now carries the measured setup-only lifecycle: Agent-confirmed Cloud environment setup installs the remote authority and selected repository, the user manually saves the tested Build, and a new top-level Agent opens in that same repository. It also preserves both negative controls: checked-in-only and saved-user-global-only. No field, enum, model carrier, count, or environment variable was invented. The local App and Cloud child model/profile provenance remains explicitly unknown because the live surfaces did not expose it.

The final-review repair is docked as well: current doctor identity remains unknown when only a historical evidence stamp exists; `--no-scripts` retains ownership of prior non-missing skipped assets and hook entries; and a later ordinary project install promotes a partial authority before restoring the default script/hook surface without retiring an independently active receipt-owned global live hook.

`.env.example` requires no change because the candidate adds no secret, endpoint, environment variable, or configuration-file contract.
