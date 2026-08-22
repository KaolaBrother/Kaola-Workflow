verdict: DOCKED

## Changed files reviewed

- The next/finalize skeletons and six generated Codex skills state fixed Luna/max standard routing and fixed Sol/high reasoning routing.
- The reachability test and Codex contract validator independently bind live routing while preserving historical preflight migration constants.
- README.md, CHANGELOG.md, and D-687-01.md state the live policy and preserve #925 history.

## Documents checked

- README.md, CHANGELOG.md, docs/README.md, docs/api.md, docs/architecture.md, docs/conventions.md, docs/decisions/D-687-01.md, docs/workflow-state-contract.md, and .env.example.

## Gaps found and fixed

- docs/api.md, docs/architecture.md, and docs/conventions.md incorrectly described historical preflight constants as live dispatch authority; their directly corresponding paragraphs now document the verified separation.

## No-impact reasons

- No API signature, schema, CLI, configuration, environment, setup, role classification, initialization, installer, preflight, non-Codex runtime, or workflow-state behavior changed.
- No architecture component or documentation index target changed.

## Validation

- Documentation diff checks pass and all 18 generated routing surfaces byte-match their skeletons.

DOCKED
