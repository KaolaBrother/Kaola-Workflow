'use strict';

// rename-table.js — the forge-noun rename table for routing-surface generation.
//
// Keyed by the canonical (github) script basename. Each entry maps a forge to
// the renamed basename that the forge edition ships. The render engine applies
// these substitutions to the rendered surface for gitlab/gitea (github is the
// canonical name space, so no substitution there).
//
// DESIGN INVARIANTS (do not add these to RENAMES):
//   - kaola-workflow-resolve-agent-model.js STAYS un-renamed on all editions
//     (the Agent Model Badge references it identically in all 3 commands).
//   - kaola-workflow-run-chains.js is a surface_type x forge STRUCTURAL region
//     variant (only the github plan-run COMMAND uses the bash fence; the forge
//     commands and all SKILLs use the prose one-liner) — NOT a rename.
//   - claim.js / roadmap.js / repair-state.js / codex-preflight.js are
//     forge-invariant (same basename on every edition).

const RENAMES = {
  'kaola-workflow-adaptive-node.js': {
    gitlab: 'kaola-gitlab-workflow-adaptive-node.js',
    gitea: 'kaola-gitea-workflow-adaptive-node.js',
  },
};

// Documented forge-invariant scripts (no rename on any edition). Present for
// provenance and for the self-test; the engine never renames these.
const FORGE_INVARIANT = [
  'kaola-workflow-resolve-agent-model.js',
  'kaola-workflow-run-chains.js',
  'kaola-workflow-claim.js',
  'kaola-workflow-roadmap.js',
  'kaola-workflow-repair-state.js',
  'kaola-workflow-codex-preflight.js',
];

// applyRenames — substitute every canonical script basename for its forge
// basename in `text`. github is the canonical namespace (identity). The
// substitution is an exact-string replace of the full basename, so it never
// touches an already-forge-named token or an unrelated noun.
function applyRenames(text, forge) {
  if (forge === 'github') return text;
  for (const [canonical, byForge] of Object.entries(RENAMES)) {
    const renamed = byForge[forge];
    if (renamed) text = text.split(canonical).join(renamed);
  }
  return text;
}

module.exports = { RENAMES, FORGE_INVARIANT, applyRenames };
