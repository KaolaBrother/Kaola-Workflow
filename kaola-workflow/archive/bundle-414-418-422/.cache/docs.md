eeaee89b3891
evidence-binding: docs eeaee89b3891

## Changes made

### docs/decisions/D-422-01.md (NEW)

Created first decision record in the D-422 series. Documents the three-part
agent-profile md↔toml token-pin parity contract introduced by #422:
- Part 1: `.toml` triple byte-identity via `validate-script-sync.js` BYTE_IDENTICAL_GROUPS
  (programmatic readdirSync entry, 14 base + 6 -max variants, auto-expands).
- Part 2: Feature-token mirroring via `scripts/test-agent-profile-parity.js` with curated
  FEATURE_TOKENS list; token added only after GREEN at HEAD.
- Part 3: Chain pinning — test wired into claude chain, pinned by all four
  validate-*-contracts.js.
- Side note: CONFIG_HOOKS_FAMILY + normalizeConfigHooks() in validate-script-sync.js
  for the config/hooks.json three-plugin-tree family (#418.1).
- Consequences section covers: new feature paragraph workflow, new token lifecycle,
  new profile auto-coverage, config/hooks.json workflow, chain impact.

### docs/conventions.md

Expanded the "Forge-Neutral Plugin Agent Profiles (issue #341)" section with a new
subsection block covering:
- The three-part parity contract numbered (1) byte-identity, (2) feature-token mirroring,
  (3) chain pinning.
- The day-to-day workflow for mirroring tokens before pinning.
- The config/hooks.json family (#418.1): CONFIG_HOOKS_FAMILY + normalizeConfigHooks().

### docs/architecture.md

Added new "Agent Profile Structure and Edition Sync" section immediately before the
existing "Model Resolution (Install-Time, Profile-Aware)" section, covering:
- Profile layout: 14 base + 6 -max variants, .toml triples across three plugin trees.
- md↔toml token-pin parity contract summary with pointer to D-422-01.md.
- validate-script-sync.js BYTE_IDENTICAL_GROUPS programmatic entry.
- test-agent-profile-parity.js regression guard.

docs: complete
