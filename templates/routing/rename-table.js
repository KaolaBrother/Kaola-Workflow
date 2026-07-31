'use strict';

// rename-table.js — the forge-noun rename table for routing-surface generation.
//
// Keyed by the canonical (github) script basename. Each entry maps a forge to
// the renamed basename that the forge edition ships. The render engine applies
// these substitutions to the rendered surface for gitlab/gitea (github is the
// canonical name space, so no substitution there).
//
// RENAMES IS EMPTY TODAY, and that is a state rather than a retirement. Every
// forge-specific basename the three surviving skeletons name is already written
// out per forge in slots.js — one `*-scripts-resolver` SLOT resolves the
// installed scripts directory, and each sibling invocation is a forge-keyed
// line. A post-render string substitution is the weaker of the two mechanisms
// (it cannot see whether it hit prose or a path), so the table is kept as the
// escape hatch for a basename that genuinely cannot be forge-keyed at source,
// not as the default route. applyRenames() takes an explicit table so the
// mechanism stays mutation-provable while the shipped table is empty.
//
// DESIGN INVARIANTS (do not add these to RENAMES):
//   - kaola-workflow-resolve-agent-model.js STAYS un-renamed on all editions.
//   - claim.js / roadmap.js / repair-state.js / codex-preflight.js keep the
//     same basename shape on every edition and are forge-keyed at source.

const RENAMES = {};

// Documented forge-invariant scripts (no rename on any edition). Present for
// provenance and for the self-test; the engine never renames these.
const FORGE_INVARIANT = [
  'kaola-workflow-resolve-agent-model.js',
  'kaola-workflow-codex-preflight.js',
];

// applyRenames — substitute every canonical script basename for its forge
// basename in `text`. github is the canonical namespace (identity). The
// substitution is an exact-string replace of the full basename, so it never
// touches an already-forge-named token or an unrelated noun. `renames` is
// injectable so the mechanism can be proven against a synthetic table.
function applyRenames(text, forge, renames = RENAMES) {
  if (forge === 'github') return text;
  for (const [canonical, byForge] of Object.entries(renames)) {
    const renamed = byForge[forge];
    if (renamed) text = text.split(canonical).join(renamed);
  }
  return text;
}

module.exports = { RENAMES, FORGE_INVARIANT, applyRenames };
